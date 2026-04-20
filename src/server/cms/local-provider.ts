import fs from 'node:fs/promises';
import path from 'node:path';

import { PortfolioContent } from '@/lib/portfolio-types';
import { summarizeDiff } from '@/server/cms/diff';
import { CmsConfig } from '@/server/cms/config';
import { computeVersion, stableStringify } from '@/server/cms/json';
import {
  CmsAsset,
  CmsDeployHookResult,
  CmsProvider,
  CmsPublishOptions,
  CmsPublishResult,
  CmsSnapshot,
  CmsState,
  CmsUploadInput
} from '@/server/cms/types';
import { assertPortfolioContent, isPortfolioContent } from '@/server/cms/validate';

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

function nowIso(): string {
  return new Date().toISOString();
}

function toPosix(input: string): string {
  return input.split(path.sep).join('/');
}

function sanitizePathSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\-_/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_/]+|[-_/]+$/g, '');
}

function sanitizeFilename(filename: string): { base: string; ext: string } {
  const ext = path.extname(filename || '').toLowerCase();
  const rawBase = path.basename(filename || 'asset', ext);
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function defaultContent(): PortfolioContent {
  return {
    logoCards: {},
    caseStudies: {},
    paragraphs: []
  };
}

export class LocalCmsProvider implements CmsProvider {
  public readonly name = 'local' as const;

  private initialized = false;

  public constructor(private readonly config: CmsConfig) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      ensureDir(this.config.stateDir),
      ensureDir(this.config.releasesDir),
      ensureDir(this.config.uploadsDir)
    ]);

    let seedContent = defaultContent();

    if (await fileExists(this.config.liveContentPath)) {
      const rawSeed = await fs.readFile(this.config.liveContentPath, 'utf8');
      const parsed = JSON.parse(rawSeed);
      if (isPortfolioContent(parsed)) {
        seedContent = parsed;
      }
    }

    if (!(await fileExists(this.config.liveFilePath))) {
      await fs.writeFile(this.config.liveFilePath, `${stableStringify(seedContent)}\n`, 'utf8');
    }

    if (!(await fileExists(this.config.stageFilePath))) {
      await fs.writeFile(this.config.stageFilePath, `${stableStringify(seedContent)}\n`, 'utf8');
    }

    this.initialized = true;
  }

  private async readContentFromFile(filePath: string): Promise<PortfolioContent> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assertPortfolioContent(parsed);
    return parsed;
  }

  private async readSnapshot(filePath: string): Promise<CmsSnapshot> {
    const [content, stat] = await Promise.all([this.readContentFromFile(filePath), fs.stat(filePath)]);

    return {
      content,
      version: computeVersion(content),
      updatedAt: stat.mtime.toISOString()
    };
  }

  private async writeContent(filePath: string, content: PortfolioContent): Promise<CmsSnapshot> {
    assertPortfolioContent(content);
    await fs.writeFile(filePath, `${stableStringify(content)}\n`, 'utf8');
    return this.readSnapshot(filePath);
  }

  private async listFilesRecursively(dirPath: string): Promise<string[]> {
    if (!(await fileExists(dirPath))) return [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.listFilesRecursively(fullPath);
        files.push(...nested);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  public async listAssets(): Promise<CmsAsset[]> {
    await this.ensureInitialized();

    const files = await this.listFilesRecursively(this.config.uploadsDir);
    const assets = await Promise.all(
      files.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relative = toPosix(path.relative(this.config.uploadsDir, filePath));
        const ext = path.extname(filePath).toLowerCase();

        return {
          key: relative,
          url: `${this.config.uploadsBaseUrl.replace(/\/$/, '')}/${relative}`,
          size: stat.size,
          mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
          uploadedAt: stat.mtime.toISOString()
        } satisfies CmsAsset;
      })
    );

    return assets.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  public async getState(): Promise<CmsState> {
    await this.ensureInitialized();

    const [live, stage, assets] = await Promise.all([
      this.readSnapshot(this.config.liveFilePath),
      this.readSnapshot(this.config.stageFilePath),
      this.listAssets()
    ]);

    return {
      provider: this.name,
      live,
      stage,
      diff: summarizeDiff(live.content, stage.content),
      assets
    };
  }

  public async saveStage(content: PortfolioContent): Promise<CmsState> {
    await this.ensureInitialized();
    await this.writeContent(this.config.stageFilePath, content);
    return this.getState();
  }

  public async resetStageFromLive(): Promise<CmsState> {
    await this.ensureInitialized();
    const live = await this.readContentFromFile(this.config.liveFilePath);
    await this.writeContent(this.config.stageFilePath, live);
    return this.getState();
  }

  public async uploadAsset(input: CmsUploadInput): Promise<CmsAsset> {
    await this.ensureInitialized();

    const safeFolder = sanitizePathSegment(input.folder || 'media');
    const { base, ext } = sanitizeFilename(input.filename);
    const extFromMime = Object.entries(MIME_BY_EXT).find(([, mime]) => mime === input.mimeType)?.[0] || '';
    const resolvedExt = ext || extFromMime;
    const stamp = Date.now();
    const key = `${safeFolder}/${stamp}-${base}${resolvedExt}`;
    const outputPath = path.join(this.config.uploadsDir, key);

    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, input.bytes);

    const stat = await fs.stat(outputPath);
    const posixKey = toPosix(key);

    return {
      key: posixKey,
      url: `${this.config.uploadsBaseUrl.replace(/\/$/, '')}/${posixKey}`,
      size: stat.size,
      mimeType: input.mimeType || MIME_BY_EXT[resolvedExt] || 'application/octet-stream',
      uploadedAt: stat.mtime.toISOString()
    };
  }

  private async trimReleases(): Promise<void> {
    const entries = await fs.readdir(this.config.releasesDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const fullPath = path.join(this.config.releasesDir, entry.name);
          const stat = await fs.stat(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        })
    );

    files.sort((a, b) => b.mtime - a.mtime);
    const toDelete = files.slice(this.config.releaseKeepCount);

    await Promise.all(toDelete.map((item) => fs.unlink(item.fullPath)));
  }

  private async triggerDeployHook(
    payload: Record<string, unknown>,
    shouldTrigger: boolean
  ): Promise<CmsDeployHookResult> {
    if (!shouldTrigger || !this.config.deployHookUrl) {
      return { triggered: false };
    }

    try {
      const response = await fetch(this.config.deployHookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.deployHookToken
            ? {
                authorization: `Bearer ${this.config.deployHookToken}`
              }
            : {})
        },
        body: JSON.stringify(payload)
      });

      return {
        triggered: true,
        status: response.status,
        ok: response.ok
      };
    } catch (error) {
      return {
        triggered: true,
        error: error instanceof Error ? error.message : 'Unknown deploy hook error'
      };
    }
  }

  public async publish(options: CmsPublishOptions = {}): Promise<CmsPublishResult> {
    await this.ensureInitialized();

    const [liveSnapshot, stageSnapshot] = await Promise.all([
      this.readSnapshot(this.config.liveFilePath),
      this.readSnapshot(this.config.stageFilePath)
    ]);

    const diff = summarizeDiff(liveSnapshot.content, stageSnapshot.content);
    const publishedAt = nowIso();
    let backupFile: string | undefined;

    if (diff.hasChanges) {
      const timestampTag = publishedAt.replace(/[:.]/g, '-');
      const releaseName = `${timestampTag}-${liveSnapshot.version}.json`;
      const releasePath = path.join(this.config.releasesDir, releaseName);
      await fs.writeFile(releasePath, `${stableStringify(liveSnapshot.content)}\n`, 'utf8');
      backupFile = releaseName;

      await Promise.all([
        this.writeContent(this.config.liveFilePath, stageSnapshot.content),
        this.writeContent(this.config.liveContentPath, stageSnapshot.content)
      ]);

      await this.trimReleases();
    }

    const currentLive = await this.readSnapshot(this.config.liveFilePath);

    const deployHook = await this.triggerDeployHook(
      {
        type: 'cms.publish',
        provider: this.name,
        reason: options.reason || null,
        publishedAt,
        previousLiveVersion: liveSnapshot.version,
        newLiveVersion: currentLive.version,
        hasChanges: diff.hasChanges,
        changedPaths: diff.changedPaths
      },
      options.triggerDeployHook !== false
    );

    return {
      published: diff.hasChanges,
      previousLiveVersion: liveSnapshot.version,
      newLiveVersion: currentLive.version,
      backupFile,
      publishedAt,
      deployHook
    };
  }
}
