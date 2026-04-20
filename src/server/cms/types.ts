import { PortfolioContent } from '@/lib/portfolio-types';

export type CmsProviderName = 'local';

export interface CmsDiffSummary {
  hasChanges: boolean;
  paragraphsChanged: number;
  logosAdded: number;
  logosRemoved: number;
  logosChanged: number;
  caseStudiesAdded: number;
  caseStudiesRemoved: number;
  caseStudiesChanged: number;
  changedPaths: string[];
}

export interface CmsSnapshot {
  content: PortfolioContent;
  version: string;
  updatedAt: string;
}

export interface CmsAsset {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export interface CmsState {
  provider: CmsProviderName;
  live: CmsSnapshot;
  stage: CmsSnapshot;
  diff: CmsDiffSummary;
  assets: CmsAsset[];
}

export interface CmsUploadInput {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  folder?: string;
}

export interface CmsPublishOptions {
  reason?: string;
  triggerDeployHook?: boolean;
}

export interface CmsDeployHookResult {
  triggered: boolean;
  status?: number;
  ok?: boolean;
  error?: string;
}

export interface CmsPublishResult {
  published: boolean;
  previousLiveVersion: string;
  newLiveVersion: string;
  backupFile?: string;
  publishedAt: string;
  deployHook: CmsDeployHookResult;
}

export interface CmsProvider {
  name: CmsProviderName;
  getState(): Promise<CmsState>;
  saveStage(content: PortfolioContent): Promise<CmsState>;
  resetStageFromLive(): Promise<CmsState>;
  uploadAsset(input: CmsUploadInput): Promise<CmsAsset>;
  listAssets(): Promise<CmsAsset[]>;
  publish(options?: CmsPublishOptions): Promise<CmsPublishResult>;
}
