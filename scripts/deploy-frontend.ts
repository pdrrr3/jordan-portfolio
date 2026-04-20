import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function main() {
  const outDir = path.join(process.cwd(), 'out');
  const tempCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-deploy-'));

  await fs.access(outDir);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'npx',
        [
          'wrangler',
          'pages',
          'deploy',
          outDir,
          '--project-name',
          'jordan-portfolio-frontend',
          '--commit-dirty=true'
        ],
        {
          cwd: tempCwd,
          stdio: 'inherit',
          env: process.env
        }
      );

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`wrangler pages deploy failed with exit code ${code ?? -1}`));
        }
      });
    });
  } finally {
    await fs.rm(tempCwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
