import { readCmsConfig } from '@/server/cms/config';
import { LocalCmsProvider } from '@/server/cms/local-provider';
import { CmsConfig } from '@/server/cms/config';
import { CmsProvider } from '@/server/cms/types';

export function createCmsProvider(config: CmsConfig = readCmsConfig()): CmsProvider {
  if (config.provider === 'local') {
    return new LocalCmsProvider(config);
  }

  throw new Error(`Unsupported CMS provider: ${config.provider}`);
}

let cachedProvider: CmsProvider | null = null;

export function getCmsProvider(): CmsProvider {
  if (!cachedProvider) {
    cachedProvider = createCmsProvider();
  }

  return cachedProvider;
}

export function resetCmsProviderCache(): void {
  cachedProvider = null;
}
