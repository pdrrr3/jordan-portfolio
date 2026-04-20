interface Env {
  CMS_DB: D1Database;
  CMS_MEDIA: R2Bucket;
  HOOK_MODE?: string;
  DOWNSTREAM_DEPLOY_HOOK_URL?: string;
  DOWNSTREAM_DEPLOY_HOOK_BEARER?: string;
}

type PortfolioContent = {
  logoCards: Record<string, Record<string, unknown>>;
  caseStudies: Record<string, Record<string, unknown>>;
  paragraphs: string[];
};

type CmsSnapshot = {
  content: PortfolioContent;
  version: string;
  updatedAt: string;
};

type CmsAsset = {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
};

type CmsDiffSummary = {
  hasChanges: boolean;
  paragraphsChanged: number;
  logosAdded: number;
  logosRemoved: number;
  logosChanged: number;
  caseStudiesAdded: number;
  caseStudiesRemoved: number;
  caseStudiesChanged: number;
  changedPaths: string[];
};

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

let bootstrapped = false;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultContent(): PortfolioContent {
  return {
    logoCards: {},
    caseStudies: {},
    paragraphs: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPortfolioContent(value: unknown): value is PortfolioContent {
  if (!isRecord(value)) return false;
  if (!isRecord(value.logoCards)) return false;
  if (!isRecord(value.caseStudies)) return false;
  if (!isStringArray(value.paragraphs)) return false;

  for (const card of Object.values(value.logoCards)) {
    if (!isRecord(card)) return false;
  }

  for (const caseStudy of Object.values(value.caseStudies)) {
    if (!isRecord(caseStudy)) return false;

    if (caseStudy.role !== undefined && !isStringArray(caseStudy.role)) {
      return false;
    }

    if (caseStudy.slides !== undefined) {
      if (!Array.isArray(caseStudy.slides)) return false;
      for (const slide of caseStudy.slides) {
        if (!isRecord(slide)) return false;
      }
    }
  }

  return true;
}

function sanitizePathSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\-_/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_/]+|[-_/]+$/g, '');
}

function sanitizeFilename(filename: string): { base: string; ext: string } {
  const trimmed = (filename || 'asset').trim();
  const dotIndex = trimmed.lastIndexOf('.');
  const ext = dotIndex > 0 ? trimmed.slice(dotIndex).toLowerCase() : '';
  const rawBase = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;

  const base = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    base: base || 'asset',
    ext
  };
}

function extFromMimeType(mimeType: string): string {
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
    if (mime === mimeType) return ext;
  }

  return '';
}

function encodePathForUrl(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function decodePathFromUrl(path: string): string {
  return path
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortValue(item));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};

    for (const [key, nested] of entries) {
      out[key] = stableSortValue(nested);
    }

    return out;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value), null, 2);
}

async function computeVersion(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return hex.slice(0, 16);
}

function areEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function collectChangedPaths(a: unknown, b: unknown, basePath = '', acc: string[] = [], limit = 80): string[] {
  if (acc.length >= limit) return acc;
  if (areEqual(a, b)) return acc;

  const aIsObject = isRecord(a);
  const bIsObject = isRecord(b);

  if (!aIsObject || !bIsObject) {
    acc.push(basePath || '$');
    return acc;
  }

  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

  for (const key of Array.from(keys).sort()) {
    const nextPath = basePath ? `${basePath}.${key}` : key;
    collectChangedPaths(a[key], b[key], nextPath, acc, limit);

    if (acc.length >= limit) {
      break;
    }
  }

  return acc;
}

function summarizeDiff(live: PortfolioContent, stage: PortfolioContent): CmsDiffSummary {
  const liveParagraphs = live.paragraphs ?? [];
  const stageParagraphs = stage.paragraphs ?? [];
  const paragraphLen = Math.max(liveParagraphs.length, stageParagraphs.length);

  let paragraphsChanged = 0;
  for (let idx = 0; idx < paragraphLen; idx += 1) {
    if ((liveParagraphs[idx] ?? '') !== (stageParagraphs[idx] ?? '')) {
      paragraphsChanged += 1;
    }
  }

  const liveLogoIds = Object.keys(live.logoCards ?? {});
  const stageLogoIds = Object.keys(stage.logoCards ?? {});
  const logoIds = new Set([...liveLogoIds, ...stageLogoIds]);

  let logosAdded = 0;
  let logosRemoved = 0;
  let logosChanged = 0;

  for (const id of logoIds) {
    const left = live.logoCards[id];
    const right = stage.logoCards[id];

    if (!left && right) {
      logosAdded += 1;
      continue;
    }

    if (left && !right) {
      logosRemoved += 1;
      continue;
    }

    if (!areEqual(left, right)) {
      logosChanged += 1;
    }
  }

  const liveCaseIds = Object.keys(live.caseStudies ?? {});
  const stageCaseIds = Object.keys(stage.caseStudies ?? {});
  const caseIds = new Set([...liveCaseIds, ...stageCaseIds]);

  let caseStudiesAdded = 0;
  let caseStudiesRemoved = 0;
  let caseStudiesChanged = 0;

  for (const id of caseIds) {
    const left = live.caseStudies[id];
    const right = stage.caseStudies[id];

    if (!left && right) {
      caseStudiesAdded += 1;
      continue;
    }

    if (left && !right) {
      caseStudiesRemoved += 1;
      continue;
    }

    if (!areEqual(left, right)) {
      caseStudiesChanged += 1;
    }
  }

  const changedPaths = collectChangedPaths(live, stage);
  const hasChanges =
    paragraphsChanged > 0 ||
    logosAdded > 0 ||
    logosRemoved > 0 ||
    logosChanged > 0 ||
    caseStudiesAdded > 0 ||
    caseStudiesRemoved > 0 ||
    caseStudiesChanged > 0;

  return {
    hasChanges,
    paragraphsChanged,
    logosAdded,
    logosRemoved,
    logosChanged,
    caseStudiesAdded,
    caseStudiesRemoved,
    caseStudiesChanged,
    changedPaths
  };
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '*';

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,HEAD,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request)
    }
  });
}

function notFound(request: Request): Response {
  return json(request, { error: 'Not found' }, 404);
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const extra = corsHeaders(request);

  for (const [key, value] of Object.entries(extra)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function ensureBootstrapDocuments(env: Env): Promise<void> {
  if (bootstrapped) return;

  const seed = defaultContent();
  const seedJson = stableStringify(seed);
  const seedHash = await computeVersion(seed);

  await env.CMS_DB.prepare(
    `INSERT OR IGNORE INTO cms_documents (id, content_json, content_hash, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind('live', seedJson, seedHash, nowIso(), 'worker-bootstrap')
    .run();

  await env.CMS_DB.prepare(
    `INSERT OR IGNORE INTO cms_documents (id, content_json, content_hash, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind('stage', seedJson, seedHash, nowIso(), 'worker-bootstrap')
    .run();

  bootstrapped = true;
}

async function readSnapshot(env: Env, id: 'live' | 'stage'): Promise<CmsSnapshot> {
  await ensureBootstrapDocuments(env);

  const row = await env.CMS_DB.prepare(
    `SELECT content_json, content_hash, updated_at FROM cms_documents WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first<{
      content_json: string;
      content_hash: string;
      updated_at: string;
    }>();

  let content = defaultContent();

  if (row?.content_json) {
    try {
      const parsed = JSON.parse(row.content_json);
      if (isPortfolioContent(parsed)) {
        content = parsed;
      }
    } catch {
      content = defaultContent();
    }
  }

  const version = row?.content_hash || (await computeVersion(content));

  return {
    content,
    version,
    updatedAt: row?.updated_at || nowIso()
  };
}

async function writeSnapshot(
  env: Env,
  id: 'live' | 'stage',
  content: PortfolioContent,
  updatedBy: string
): Promise<CmsSnapshot> {
  const updatedAt = nowIso();
  const version = await computeVersion(content);

  await env.CMS_DB.prepare(
    `INSERT INTO cms_documents (id, content_json, content_hash, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content_json = excluded.content_json,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  )
    .bind(id, stableStringify(content), version, updatedAt, updatedBy)
    .run();

  return {
    content,
    version,
    updatedAt
  };
}

async function listAssets(env: Env): Promise<CmsAsset[]> {
  const rows = await env.CMS_DB.prepare(
    `SELECT object_key, public_url, mime_type, size_bytes, uploaded_at
     FROM cms_assets
     ORDER BY uploaded_at DESC
     LIMIT 500`
  ).all<{
    object_key: string;
    public_url: string;
    mime_type: string | null;
    size_bytes: number | null;
    uploaded_at: string;
  }>();

  return (rows.results || []).map((row) => ({
    key: row.object_key,
    url: row.public_url,
    size: row.size_bytes || 0,
    mimeType: row.mime_type || 'application/octet-stream',
    uploadedAt: row.uploaded_at
  }));
}

async function getState(env: Env): Promise<{
  provider: string;
  live: CmsSnapshot;
  stage: CmsSnapshot;
  diff: CmsDiffSummary;
  assets: CmsAsset[];
}> {
  const [live, stage, assets] = await Promise.all([readSnapshot(env, 'live'), readSnapshot(env, 'stage'), listAssets(env)]);

  return {
    provider: 'cloudflare',
    live,
    stage,
    diff: summarizeDiff(live.content, stage.content),
    assets
  };
}

async function triggerDownstream(env: Env, payload: Record<string, unknown>) {
  if (!env.DOWNSTREAM_DEPLOY_HOOK_URL) {
    return {
      triggered: false,
      ok: true,
      message: 'No DOWNSTREAM_DEPLOY_HOOK_URL secret configured'
    };
  }

  try {
    const response = await fetch(env.DOWNSTREAM_DEPLOY_HOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.DOWNSTREAM_DEPLOY_HOOK_BEARER
          ? {
              authorization: `Bearer ${env.DOWNSTREAM_DEPLOY_HOOK_BEARER}`
            }
          : {})
      },
      body: JSON.stringify({
        source: 'cms-hook-worker',
        at: nowIso(),
        payload
      })
    });

    return {
      triggered: true,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `Downstream returned ${response.status}`
    };
  } catch (error) {
    return {
      triggered: true,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown downstream error'
    };
  }
}

async function recordReleaseEvent(
  env: Env,
  payload: {
    previousLiveVersion: string;
    newLiveVersion: string;
    backupFile?: string;
    changedPaths: string[];
    publishedAt: string;
    reason?: string;
  },
  deployHookResult: Record<string, unknown>
) {
  const id = crypto.randomUUID();

  await env.CMS_DB.prepare(
    `INSERT INTO cms_releases (
      id,
      previous_live_hash,
      new_live_hash,
      backup_ref,
      changed_paths_json,
      published_at,
      reason,
      deploy_hook_status,
      deploy_hook_response_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      payload.previousLiveVersion,
      payload.newLiveVersion,
      payload.backupFile || null,
      JSON.stringify(payload.changedPaths),
      payload.publishedAt,
      payload.reason || 'cms.publish',
      typeof deployHookResult.ok === 'boolean' ? (deployHookResult.ok ? 'ok' : 'error') : 'skipped',
      JSON.stringify(deployHookResult)
    )
    .run();

  return {
    id,
    previousLiveHash: payload.previousLiveVersion,
    newLiveHash: payload.newLiveVersion,
    publishedAt: payload.publishedAt
  };
}

function toPublishResult(input: {
  published: boolean;
  previousLiveVersion: string;
  newLiveVersion: string;
  backupFile?: string;
  publishedAt: string;
  deployHook: {
    triggered: boolean;
    ok?: boolean;
    status?: number;
    error?: string;
  };
}) {
  return {
    published: input.published,
    previousLiveVersion: input.previousLiveVersion,
    newLiveVersion: input.newLiveVersion,
    backupFile: input.backupFile,
    publishedAt: input.publishedAt,
    deployHook: {
      triggered: input.deployHook.triggered,
      ok: input.deployHook.ok,
      status: input.deployHook.status,
      error: input.deployHook.error
    }
  };
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
    triggerDeployHook?: boolean;
  };

  const [live, stage] = await Promise.all([readSnapshot(env, 'live'), readSnapshot(env, 'stage')]);
  const diff = summarizeDiff(live.content, stage.content);
  const publishedAt = nowIso();

  let nextLive = live;
  let backupFile: string | undefined;

  if (diff.hasChanges) {
    nextLive = await writeSnapshot(env, 'live', stage.content, 'cms.publish');
    backupFile = `live-${publishedAt.replace(/[:.]/g, '-')}-${live.version}.json`;
  }

  const deployPayload = {
    type: 'cms.publish',
    provider: 'cloudflare',
    reason: body.reason || null,
    publishedAt,
    previousLiveVersion: live.version,
    newLiveVersion: nextLive.version,
    hasChanges: diff.hasChanges,
    changedPaths: diff.changedPaths
  };

  const deployHook =
    body.triggerDeployHook === false
      ? {
          triggered: false,
          ok: true
        }
      : await triggerDownstream(env, deployPayload);

  await recordReleaseEvent(
    env,
    {
      previousLiveVersion: live.version,
      newLiveVersion: nextLive.version,
      backupFile,
      changedPaths: diff.changedPaths,
      publishedAt,
      reason: body.reason
    },
    deployHook
  );

  const state = await getState(env);

  return json(request, {
    publish: toPublishResult({
      published: diff.hasChanges,
      previousLiveVersion: live.version,
      newLiveVersion: nextLive.version,
      backupFile,
      publishedAt,
      deployHook
    }),
    state
  });
}

async function handleLegacyPublishHook(request: Request, env: Env): Promise<Response> {
  const payload = (await request.json().catch(async () => ({ raw: await request.text() }))) as Record<string, unknown>;

  const deployHook = await triggerDownstream(env, payload);
  const release = await recordReleaseEvent(
    env,
    {
      previousLiveVersion: String(payload.previousLiveVersion || payload.previous_live_hash || 'unknown'),
      newLiveVersion: String(
        payload.newLiveVersion || payload.new_live_hash || payload.previousLiveVersion || payload.previous_live_hash || 'unknown'
      ),
      backupFile: payload.backupFile ? String(payload.backupFile) : undefined,
      changedPaths: Array.isArray(payload.changedPaths)
        ? payload.changedPaths.map((item) => String(item))
        : [],
      publishedAt: String(payload.publishedAt || nowIso()),
      reason: payload.reason ? String(payload.reason) : 'publish-hook'
    },
    deployHook
  );

  return json(request, {
    ok: true,
    release,
    downstream: deployHook,
    receivedAt: nowIso()
  });
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const filePart = formData.get('file');
  const folderPart = formData.get('folder');

  if (!(filePart instanceof File)) {
    return json(request, { error: 'Missing file upload' }, 400);
  }

  const safeFolder = sanitizePathSegment(typeof folderPart === 'string' && folderPart.trim() ? folderPart : 'media');
  const { base, ext } = sanitizeFilename(filePart.name);
  const fallbackExt = extFromMimeType(filePart.type);
  const resolvedExt = ext || fallbackExt;
  const stamp = Date.now();
  const key = `${safeFolder}/${stamp}-${base}${resolvedExt}`;

  const bytes = await filePart.arrayBuffer();
  const mimeType = filePart.type || MIME_BY_EXT[resolvedExt] || 'application/octet-stream';

  await env.CMS_MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType: mimeType
    }
  });

  const uploadedAt = nowIso();
  const origin = new URL(request.url).origin;
  const url = `${origin}/assets/${encodePathForUrl(key)}`;
  const size = bytes.byteLength;

  await env.CMS_DB.prepare(
    `INSERT INTO cms_assets (
      id,
      object_key,
      public_url,
      mime_type,
      size_bytes,
      uploaded_at,
      uploaded_by,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      `asset-${crypto.randomUUID()}`,
      key,
      url,
      mimeType,
      size,
      uploadedAt,
      'cms.upload',
      JSON.stringify({
        filename: filePart.name
      })
    )
    .run();

  const assets = await listAssets(env);
  const asset = assets.find((item) => item.key === key) || {
    key,
    url,
    size,
    mimeType,
    uploadedAt
  };

  return json(request, { asset, assets });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        const dbCheck = await env.CMS_DB.prepare('SELECT COUNT(*) AS c FROM cms_documents').first<{ c: number }>();
        return json(request, {
          ok: true,
          mode: env.HOOK_MODE || 'relay',
          service: 'jordan-portfolio-cms-hook',
          dbDocuments: dbCheck?.c ?? 0,
          timestamp: nowIso()
        });
      }

      if (url.pathname.startsWith('/assets/') && (request.method === 'GET' || request.method === 'HEAD')) {
        const rawKey = url.pathname.replace(/^\/assets\//, '');
        const key = decodePathFromUrl(rawKey);

        if (request.method === 'HEAD') {
          const object = await env.CMS_MEDIA.head(key);
          if (!object) return withCors(request, new Response(null, { status: 404 }));

          return withCors(
            request,
            new Response(null, {
              status: 200,
              headers: {
                'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
                'cache-control': 'public, max-age=31536000, immutable',
                etag: object.httpEtag
              }
            })
          );
        }

        const object = await env.CMS_MEDIA.get(key);
        if (!object || !object.body) {
          return json(request, { error: 'Not found', key }, 404);
        }

        return withCors(
          request,
          new Response(object.body, {
            status: 200,
            headers: {
              'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
              'cache-control': 'public, max-age=31536000, immutable',
              etag: object.httpEtag
            }
          })
        );
      }

      if (url.pathname === '/asset-head' && request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) return json(request, { error: 'Missing key query param' }, 400);

        const object = await env.CMS_MEDIA.head(key);
        if (!object) return json(request, { found: false, key }, 404);

        return json(request, {
          found: true,
          key,
          size: object.size,
          etag: object.httpEtag,
          uploaded: object.uploaded.toISOString(),
          contentType: object.httpMetadata?.contentType || null
        });
      }

      if (url.pathname === '/asset-url' && request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) return json(request, { error: 'Missing key query param' }, 400);
        return json(request, { url: `${url.origin}/assets/${encodePathForUrl(key)}` });
      }

      if (url.pathname === '/publish-hook' && request.method === 'POST') {
        return handleLegacyPublishHook(request, env);
      }

      if (url.pathname === '/api/cms/state' && request.method === 'GET') {
        return json(request, await getState(env));
      }

      if (url.pathname === '/api/cms/assets' && request.method === 'GET') {
        return json(request, await listAssets(env));
      }

      if (url.pathname === '/api/cms/stage' && request.method === 'PUT') {
        const body = (await request.json().catch(() => null)) as {
          content?: unknown;
        } | null;

        if (!body || !isPortfolioContent(body.content)) {
          return json(request, { error: 'Invalid portfolio content payload' }, 400);
        }

        await writeSnapshot(env, 'stage', body.content, 'cms.stage');
        return json(request, await getState(env));
      }

      if (url.pathname === '/api/cms/reset-stage' && request.method === 'POST') {
        const live = await readSnapshot(env, 'live');
        await writeSnapshot(env, 'stage', live.content, 'cms.reset-stage');
        return json(request, await getState(env));
      }

      if (url.pathname === '/api/cms/publish' && request.method === 'POST') {
        return handlePublish(request, env);
      }

      if (url.pathname === '/api/cms/upload' && request.method === 'POST') {
        return handleUpload(request, env);
      }

      return notFound(request);
    } catch (error) {
      return json(
        request,
        {
          error: error instanceof Error ? error.message : 'Unexpected worker error'
        },
        500
      );
    }
  }
};
