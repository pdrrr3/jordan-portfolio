'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { PortfolioContent } from '@/lib/portfolio-types';

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

type CmsState = {
  provider: string;
  live: CmsSnapshot;
  stage: CmsSnapshot;
  diff: CmsDiffSummary;
  assets: CmsAsset[];
};

type PublishResult = {
  published: boolean;
  previousLiveVersion: string;
  newLiveVersion: string;
  backupFile?: string;
  publishedAt: string;
  deployHook: {
    triggered: boolean;
    status?: number;
    ok?: boolean;
    error?: string;
  };
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const DEFAULT_CMS_API_BASE = 'https://jordan-portfolio-cms-hook.timur-23f.workers.dev';
const CMS_API_BASE = (process.env.NEXT_PUBLIC_CMS_API_BASE || '').replace(/\/$/, '');

function resolveCmsApiBase(): string {
  if (CMS_API_BASE) return CMS_API_BASE;

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('pages.dev')) {
    return DEFAULT_CMS_API_BASE;
  }

  return '';
}

function cmsApiUrl(path: string): string {
  const base = resolveCmsApiBase();
  if (!base) return path;
  return `${base}${path}`;
}

export function CmsAdminPage() {
  const [state, setState] = useState<CmsState | null>(null);
  const [stageEditor, setStageEditor] = useState('');
  const [liveEditor, setLiveEditor] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [publishReason, setPublishReason] = useState('Manual publish from admin UI');
  const [uploadFolder, setUploadFolder] = useState('media');

  const hydrate = useCallback((nextState: CmsState) => {
    setState(nextState);
    setStageEditor(`${JSON.stringify(nextState.stage.content, null, 2)}\n`);
    setLiveEditor(`${JSON.stringify(nextState.live.content, null, 2)}\n`);
  }, []);

  const loadState = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(cmsApiUrl('/api/cms/state'), { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load state');
      }

      hydrate(payload as CmsState);
      setMessage('Loaded latest CMS state');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load state');
    } finally {
      setIsLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const diffSummary = useMemo(() => {
    if (!state) return null;
    return state.diff;
  }, [state]);

  const saveDraft = useCallback(async () => {
    setError('');
    setMessage('');

    let parsed: PortfolioContent;
    try {
      parsed = JSON.parse(stageEditor) as PortfolioContent;
    } catch (parseError) {
      setError(parseError instanceof Error ? `Invalid JSON: ${parseError.message}` : 'Invalid JSON');
      return;
    }

    setIsBusy(true);

    try {
      const response = await fetch(cmsApiUrl('/api/cms/stage'), {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ content: parsed })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save stage');
      }

      hydrate(payload as CmsState);
      setMessage('Draft saved to staged JSON');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save stage');
    } finally {
      setIsBusy(false);
    }
  }, [hydrate, stageEditor]);

  const resetStage = useCallback(async () => {
    setIsBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(cmsApiUrl('/api/cms/reset-stage'), { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to reset stage');
      }

      hydrate(payload as CmsState);
      setMessage('Stage reset from live content');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to reset stage');
    } finally {
      setIsBusy(false);
    }
  }, [hydrate]);

  const publish = useCallback(async () => {
    setIsBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(cmsApiUrl('/api/cms/publish'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          reason: publishReason,
          triggerDeployHook: true
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to publish');
      }

      const result = payload.publish as PublishResult;
      hydrate(payload.state as CmsState);

      if (result.published) {
        setMessage(
          `Published. Live ${result.previousLiveVersion} -> ${result.newLiveVersion}${
            result.backupFile ? ` (backup: ${result.backupFile})` : ''
          }`
        );
      } else {
        setMessage('No staged changes to publish');
      }

      if (result.deployHook.triggered && !result.deployHook.ok) {
        setError(
          `Publish succeeded, but deploy hook failed${
            result.deployHook.status ? ` (${result.deployHook.status})` : ''
          }: ${result.deployHook.error || 'unknown error'}`
        );
      }
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish');
    } finally {
      setIsBusy(false);
    }
  }, [hydrate, publishReason]);

  const uploadFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || !files.length) return;

      setIsBusy(true);
      setError('');
      setMessage('');

      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folder', uploadFolder);

          const response = await fetch(cmsApiUrl('/api/cms/upload'), {
            method: 'POST',
            body: formData
          });

          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload?.error || `Failed to upload ${file.name}`);
          }

          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              assets: payload.assets as CmsAsset[]
            };
          });

          setMessage(`Uploaded ${file.name}`);
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
      } finally {
        event.target.value = '';
        setIsBusy(false);
      }
    },
    [uploadFolder]
  );

  if (isLoading) {
    return <main className="min-h-screen bg-black p-8 text-sm text-white">Loading CMS state...</main>;
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-black p-8 text-sm text-white">
        <p className="mb-3 text-red-300">{error || 'CMS state unavailable'}</p>
        <button
          type="button"
          onClick={() => void loadState()}
          className="rounded border border-white/30 px-3 py-1 text-xs uppercase tracking-[0.15em]"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white md:px-10">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded border border-white/15 bg-white/[0.03] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold tracking-[0.08em]">Portfolio CMS Scaffold</h1>
            <span className="rounded border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/70">
              provider: {state.provider}
            </span>
          </div>

          <div className="grid gap-2 text-xs text-white/70 md:grid-cols-2 lg:grid-cols-4">
            <p>Live version: <span className="text-white">{state.live.version}</span></p>
            <p>Stage version: <span className="text-white">{state.stage.version}</span></p>
            <p>Live updated: <span className="text-white">{formatDate(state.live.updatedAt)}</span></p>
            <p>Stage updated: <span className="text-white">{formatDate(state.stage.updatedAt)}</span></p>
          </div>

          {diffSummary ? (
            <div className="mt-4 grid gap-2 text-xs text-white/80 md:grid-cols-3 lg:grid-cols-4">
              <p>Paragraphs changed: <strong>{diffSummary.paragraphsChanged}</strong></p>
              <p>Logos + / - / Δ: <strong>{diffSummary.logosAdded}</strong> / <strong>{diffSummary.logosRemoved}</strong> / <strong>{diffSummary.logosChanged}</strong></p>
              <p>Case studies + / - / Δ: <strong>{diffSummary.caseStudiesAdded}</strong> / <strong>{diffSummary.caseStudiesRemoved}</strong> / <strong>{diffSummary.caseStudiesChanged}</strong></p>
              <p>Pending changes: <strong>{diffSummary.hasChanges ? 'Yes' : 'No'}</strong></p>
            </div>
          ) : null}

          {message ? <p className="mt-4 text-xs text-emerald-300">{message}</p> : null}
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </header>

        <section className="rounded border border-white/15 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Workflow</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadState()}
              disabled={isBusy}
              className="rounded border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={isBusy}
              className="rounded border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => void resetStage()}
              disabled={isBusy}
              className="rounded border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
            >
              Reset Stage From Live
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={isBusy || !state.diff.hasChanges}
              className="rounded border border-sky-300/40 bg-sky-400/10 px-3 py-1 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
            >
              Publish
            </button>
          </div>

          <div className="mt-3 max-w-2xl">
            <label htmlFor="publish-reason" className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-white/60">
              Publish reason
            </label>
            <input
              id="publish-reason"
              value={publishReason}
              onChange={(event) => setPublishReason(event.target.value)}
              className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/50"
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded border border-white/15 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Stage JSON (editable)</h2>
            <textarea
              value={stageEditor}
              onChange={(event) => setStageEditor(event.target.value)}
              className="h-[540px] w-full resize-y rounded border border-white/20 bg-black/50 p-3 font-mono text-xs leading-6 text-white outline-none focus:border-white/50"
            />
          </article>

          <article className="rounded border border-white/15 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Live JSON (read-only)</h2>
            <textarea
              readOnly
              value={liveEditor}
              className="h-[540px] w-full resize-y rounded border border-white/10 bg-black/30 p-3 font-mono text-xs leading-6 text-white/70"
            />
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded border border-white/15 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Media Management</h2>

            <div className="mb-4 grid gap-2 md:grid-cols-[220px_1fr]">
              <input
                value={uploadFolder}
                onChange={(event) => setUploadFolder(event.target.value)}
                className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/50"
                placeholder="media"
              />
              <input
                type="file"
                multiple
                onChange={(event) => void uploadFiles(event)}
                className="rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
              />
            </div>

            <ul className="max-h-[300px] space-y-2 overflow-auto text-xs">
              {state.assets.map((asset) => (
                <li key={asset.key} className="rounded border border-white/10 bg-black/30 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-white/90">{asset.key}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(asset.url).catch(() => undefined)}
                      className="rounded border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.15em]"
                    >
                      Copy URL
                    </button>
                  </div>
                  <p className="mt-1 text-white/60">{asset.url}</p>
                  <p className="mt-1 text-white/50">{formatBytes(asset.size)} · {asset.mimeType} · {formatDate(asset.uploadedAt)}</p>
                </li>
              ))}
              {!state.assets.length ? <li className="text-white/50">No uploaded assets yet</li> : null}
            </ul>
          </article>

          <article className="rounded border border-white/15 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Diff Paths</h2>
            <p className="mb-2 text-xs text-white/60">Preview of changed paths between live and stage</p>

            <ul className="max-h-[320px] space-y-1 overflow-auto text-xs text-white/80">
              {state.diff.changedPaths.map((diffPath) => (
                <li key={diffPath} className="rounded bg-black/30 px-2 py-1 font-mono">
                  {diffPath}
                </li>
              ))}
              {!state.diff.changedPaths.length ? <li className="text-white/50">No changes detected</li> : null}
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}
