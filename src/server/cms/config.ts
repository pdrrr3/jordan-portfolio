import path from 'node:path';

import { CmsProviderName } from '@/server/cms/types';

export interface CmsConfig {
  provider: CmsProviderName;
  stateDir: string;
  liveFilePath: string;
  stageFilePath: string;
  releasesDir: string;
  releaseKeepCount: number;
  liveContentPath: string;
  uploadsDir: string;
  uploadsBaseUrl: string;
  deployHookUrl?: string;
  deployHookToken?: string;
}

function resolvePath(input: string): string {
  return path.isAbsolute(input) ? input : path.join(process.cwd(), input);
}

export function readCmsConfig(env: NodeJS.ProcessEnv = process.env): CmsConfig {
  const provider = (env.CMS_PROVIDER || 'local') as CmsProviderName;
  const stateDir = resolvePath(env.CMS_STATE_DIR || '.cms');
  const releaseKeepCount = Number.parseInt(env.CMS_RELEASE_KEEP_COUNT || '3', 10);

  const uploadsDir = resolvePath(env.CMS_UPLOADS_DIR || path.join('public', 'uploads'));

  return {
    provider,
    stateDir,
    liveFilePath: path.join(stateDir, 'live.json'),
    stageFilePath: path.join(stateDir, 'stage.json'),
    releasesDir: path.join(stateDir, 'releases'),
    releaseKeepCount: Number.isFinite(releaseKeepCount) ? Math.max(releaseKeepCount, 1) : 3,
    liveContentPath: resolvePath(env.CMS_LIVE_CONTENT_PATH || 'content.json'),
    uploadsDir,
    uploadsBaseUrl: env.CMS_UPLOADS_BASE_URL || '/uploads',
    deployHookUrl: env.CMS_DEPLOY_HOOK_URL,
    deployHookToken: env.CMS_DEPLOY_HOOK_TOKEN
  };
}
