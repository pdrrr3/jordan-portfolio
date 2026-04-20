import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CmsConfig } from '../../src/server/cms/config';
import { createCmsProvider } from '../../src/server/cms/provider';

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-cms-flow-'));
  const stateDir = path.join(tempRoot, 'state');
  const uploadsDir = path.join(tempRoot, 'uploads');
  const liveContentPath = path.join(tempRoot, 'content.json');

  const sourceContentPath = path.join(process.cwd(), 'content.json');
  await fs.copyFile(sourceContentPath, liveContentPath);

  const config: CmsConfig = {
    provider: 'local',
    stateDir,
    liveFilePath: path.join(stateDir, 'live.json'),
    stageFilePath: path.join(stateDir, 'stage.json'),
    releasesDir: path.join(stateDir, 'releases'),
    releaseKeepCount: 3,
    liveContentPath,
    uploadsDir,
    uploadsBaseUrl: '/uploads',
    deployHookUrl: undefined,
    deployHookToken: undefined
  };

  const provider = createCmsProvider(config);

  try {
    const initial = await provider.getState();
    assert.equal(initial.diff.hasChanges, false, 'Initial state should be synchronized');

    const nextStage = structuredClone(initial.stage.content);
    nextStage.paragraphs[0] = `${nextStage.paragraphs[0]} [flow-test-${Date.now()}]`;

    const afterSave = await provider.saveStage(nextStage);
    assert.equal(afterSave.diff.hasChanges, true, 'Staged change should create a diff');

    const upload = await provider.uploadAsset({
      filename: 'flow-proof.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('cms flow asset proof', 'utf8'),
      folder: 'tests'
    });
    assert.ok(upload.url.includes('/uploads/tests/'), 'Upload URL should include tests folder');

    const publish = await provider.publish({
      reason: 'test-flow script',
      triggerDeployHook: false
    });

    assert.equal(publish.published, true, 'Publish should promote staged change');
    assert.ok(publish.backupFile, 'Publish should create a backup file');

    const final = await provider.getState();
    assert.equal(final.diff.hasChanges, false, 'Final state should be synchronized');
    assert.equal(final.live.version, final.stage.version, 'Live and stage versions should match after publish');
    assert.ok(final.assets.length >= 1, 'Uploaded asset should exist');

    console.log(
      JSON.stringify(
        {
          ok: true,
          tempRoot,
          initialVersion: initial.live.version,
          finalVersion: final.live.version,
          uploadedAsset: upload.url,
          backupFile: publish.backupFile
        },
        null,
        2
      )
    );
  } finally {
    if (!process.env.CMS_TEST_KEEP_TMP) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
