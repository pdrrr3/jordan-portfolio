import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { computeVersion, stableStringify } from '../../../src/server/cms/json';
import { PortfolioContent } from '../../../src/lib/portfolio-types';
import { encodeObjectKeyForUrl, runD1Json, runWrangler, toSqlText } from './lib';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

interface SeedOptions {
  database: string;
  bucket: string;
  workerUrl: string;
  contentPath: string;
  keyPrefix: string;
}

function readOptions(env: NodeJS.ProcessEnv): SeedOptions {
  const workerUrl = (env.CMS_CF_WORKER_URL || 'https://jordan-portfolio-cms-hook.timur-23f.workers.dev').replace(
    /\/$/,
    ''
  );

  return {
    database: env.CMS_CF_D1_DB || 'jordan-portfolio-cms',
    bucket: env.CMS_CF_R2_BUCKET || 'jordan-portfolio-media',
    workerUrl,
    contentPath: path.resolve(env.CMS_CF_CONTENT_PATH || 'content.json'),
    keyPrefix: (env.CMS_CF_R2_PREFIX || '').replace(/^\/+|\/+$/g, '')
  };
}

function collectMediaRefs(content: PortfolioContent): string[] {
  const refs = new Set<string>();

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if ((key === 'image' || key === 'logoFile') && typeof nested === 'string') {
          const trimmed = nested.trim();
          const isRemote = /^https?:\/\//i.test(trimmed);
          if (trimmed && !isRemote) {
            refs.add(trimmed.replace(/^\/+/, ''));
          }
        }

        walk(nested);
      }
    }
  }

  walk(content);

  return Array.from(refs).sort((a, b) => a.localeCompare(b));
}

function asObjectKey(reference: string, keyPrefix: string): string {
  return keyPrefix ? `${keyPrefix}/${reference}` : reference;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function toAssetId(key: string): string {
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 24);
  return `asset-${digest}`;
}

function mapMediaRefsToPublicUrls(content: PortfolioContent, publicUrlByRef: Map<string, string>): PortfolioContent {
  function walk(value: unknown, parentKey?: string): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item));
    }

    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        out[key] = walk(nested, key);
      }
      return out;
    }

    if ((parentKey === 'image' || parentKey === 'logoFile') && typeof value === 'string') {
      const localRef = value.replace(/^\/+/, '');
      return publicUrlByRef.get(localRef) || value;
    }

    return value;
  }

  return walk(content) as PortfolioContent;
}

async function assertAllFilesExist(refs: string[]): Promise<void> {
  for (const ref of refs) {
    const absolute = path.resolve(ref);

    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) {
        throw new Error(`Not a file: ${ref}`);
      }
    } catch {
      throw new Error(`Missing referenced media file: ${ref}`);
    }
  }
}

async function upsertAssetRow(
  database: string,
  row: {
    id: string;
    key: string;
    publicUrl: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    metadataJson: string;
  }
): Promise<void> {
  const sql = `
    INSERT INTO cms_assets (
      id,
      object_key,
      public_url,
      mime_type,
      size_bytes,
      uploaded_at,
      uploaded_by,
      metadata_json
    )
    VALUES (
      ${toSqlText(row.id)},
      ${toSqlText(row.key)},
      ${toSqlText(row.publicUrl)},
      ${toSqlText(row.mimeType)},
      ${row.sizeBytes},
      ${toSqlText(row.uploadedAt)},
      ${toSqlText('seed-script')},
      ${toSqlText(row.metadataJson)}
    )
    ON CONFLICT(id) DO UPDATE SET
      object_key = excluded.object_key,
      public_url = excluded.public_url,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      uploaded_at = excluded.uploaded_at,
      uploaded_by = excluded.uploaded_by,
      metadata_json = excluded.metadata_json;
  `;

  await runD1Json(database, sql);
}

async function upsertDocumentRow(
  database: string,
  id: 'live' | 'stage',
  content: PortfolioContent,
  hash: string,
  updatedAt: string
): Promise<void> {
  const sql = `
    INSERT INTO cms_documents (id, content_json, content_hash, updated_at, updated_by)
    VALUES (
      ${toSqlText(id)},
      ${toSqlText(stableStringify(content))},
      ${toSqlText(hash)},
      ${toSqlText(updatedAt)},
      ${toSqlText('seed-script')}
    )
    ON CONFLICT(id) DO UPDATE SET
      content_json = excluded.content_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  `;

  await runD1Json(database, sql);
}

async function upsertSetting(database: string, key: string, value: unknown): Promise<void> {
  const updatedAt = new Date().toISOString();

  const sql = `
    INSERT INTO cms_settings (key, value_json, updated_at)
    VALUES (
      ${toSqlText(key)},
      ${toSqlText(JSON.stringify(value))},
      ${toSqlText(updatedAt)}
    )
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at;
  `;

  await runD1Json(database, sql);
}

async function main() {
  const options = readOptions(process.env);
  const raw = await fs.readFile(options.contentPath, 'utf8');
  const sourceContent = JSON.parse(raw) as PortfolioContent;

  const refs = collectMediaRefs(sourceContent);
  await assertAllFilesExist(refs);

  const publicUrlByRef = new Map<string, string>();

  for (const ref of refs) {
    const objectKey = asObjectKey(ref, options.keyPrefix);
    const absolutePath = path.resolve(ref);
    const mimeType = inferMimeType(absolutePath);

    await runWrangler([
      'r2',
      'object',
      'put',
      `${options.bucket}/${objectKey}`,
      '--remote',
      '--file',
      absolutePath,
      '--content-type',
      mimeType
    ]);

    const stat = await fs.stat(absolutePath);
    const publicUrl = `${options.workerUrl}/assets/${encodeObjectKeyForUrl(objectKey)}`;
    const uploadedAt = new Date().toISOString();

    publicUrlByRef.set(ref, publicUrl);

    await upsertAssetRow(options.database, {
      id: toAssetId(objectKey),
      key: objectKey,
      publicUrl,
      mimeType,
      sizeBytes: stat.size,
      uploadedAt,
      metadataJson: JSON.stringify({
        sourceRef: ref,
        sourcePath: absolutePath,
        seededAt: uploadedAt
      })
    });
  }

  const cloudContent = mapMediaRefsToPublicUrls(sourceContent, publicUrlByRef);
  const hash = computeVersion(cloudContent);
  const updatedAt = new Date().toISOString();

  await upsertDocumentRow(options.database, 'live', cloudContent, hash, updatedAt);
  await upsertDocumentRow(options.database, 'stage', cloudContent, hash, updatedAt);

  await upsertSetting(options.database, 'worker_url', options.workerUrl);
  await upsertSetting(options.database, 'content_seed', {
    sourcePath: options.contentPath,
    seededAt: updatedAt,
    mediaCount: refs.length,
    hash
  });

  const statsResult = (await runD1Json(
    options.database,
    'SELECT COUNT(*) AS total_assets FROM cms_assets; SELECT id, content_hash, updated_at FROM cms_documents ORDER BY id;'
  )) as Array<{ results: Array<Record<string, unknown>> }>;

  const totalAssets = Number(statsResult[0]?.results?.[0]?.total_assets ?? 0);
  const documents = statsResult[1]?.results || [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: options.database,
        bucket: options.bucket,
        workerUrl: options.workerUrl,
        mediaUploaded: refs.length,
        totalAssets,
        documents
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
