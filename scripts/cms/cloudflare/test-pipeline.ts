import { runD1Json, toSqlText } from './lib';

interface TestOptions {
  database: string;
  workerUrl: string;
}

function readOptions(env: NodeJS.ProcessEnv): TestOptions {
  return {
    database: env.CMS_CF_D1_DB || 'jordan-portfolio-cms',
    workerUrl: (env.CMS_CF_WORKER_URL || 'https://jordan-portfolio-cms-hook.timur-23f.workers.dev').replace(/\/$/, '')
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return payload;
}

async function main() {
  const options = readOptions(process.env);

  const health = (await fetchJson(`${options.workerUrl}/health`)) as {
    ok: boolean;
    dbDocuments: number;
    timestamp: string;
  };

  const docRows = (await runD1Json(
    options.database,
    'SELECT id, content_hash, updated_at FROM cms_documents WHERE id IN (\'live\', \'stage\') ORDER BY id;'
  )) as Array<{ results: Array<Record<string, unknown>> }>;

  const docs = docRows[0]?.results || [];
  const live = docs.find((row) => row.id === 'live');
  const stage = docs.find((row) => row.id === 'stage');

  if (!live || !stage) {
    throw new Error('Missing live/stage rows in cms_documents');
  }

  const reason = `pipeline-smoke-${new Date().toISOString()}`;

  const publish = (await fetchJson(`${options.workerUrl}/publish-hook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      reason,
      previousLiveVersion: String(live.content_hash),
      newLiveVersion: String(stage.content_hash),
      changedPaths: [],
      publishedAt: new Date().toISOString(),
      triggerSource: 'scripts/cms/cloudflare/test-pipeline.ts'
    })
  })) as {
    release?: {
      id?: string;
      previousLiveHash?: string;
      newLiveHash?: string;
      publishedAt?: string;
    };
    downstream?: {
      triggered?: boolean;
      status?: string;
      httpStatus?: number;
      message?: string;
      error?: string;
    };
  };

  const releaseId = publish.release?.id;
  if (!releaseId) {
    throw new Error('publish-hook response did not include release id');
  }

  const releaseRows = (await runD1Json(
    options.database,
    `SELECT id, reason, previous_live_hash, new_live_hash, published_at FROM cms_releases WHERE id = ${toSqlText(releaseId)} LIMIT 1;`
  )) as Array<{ results: Array<Record<string, unknown>> }>;

  const matchedRelease = releaseRows[0]?.results?.[0];
  if (!matchedRelease) {
    throw new Error(`Release ${releaseId} was not written to cms_releases`);
  }

  const assetRows = (await runD1Json(
    options.database,
    'SELECT COUNT(*) AS total_assets FROM cms_assets;'
  )) as Array<{ results: Array<Record<string, unknown>> }>;

  const totalAssets = Number(assetRows[0]?.results?.[0]?.total_assets ?? 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        health,
        documents: {
          live,
          stage
        },
        release: matchedRelease,
        downstream: publish.downstream,
        totalAssets
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
