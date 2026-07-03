import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function runNextBuild(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['next', 'build'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_STATIC_EXPORT: '1'
      }
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`next build failed with exit code ${code ?? -1}`));
      }
    });
  });
}

async function main() {
  const apiDir = path.join(process.cwd(), 'src', 'app', 'api');
  const backupRoot = path.join(process.cwd(), '.tmp-next-export');
  const backupApiDir = path.join(backupRoot, 'api');

  const hasApiDir = await exists(apiDir);

  if (hasApiDir) {
    await fs.rm(backupRoot, { recursive: true, force: true });
    await fs.mkdir(backupRoot, { recursive: true });
    await fs.rename(apiDir, backupApiDir);
  }

  try {
    await runNextBuild();
  } finally {
    const hasBackupApiDir = await exists(backupApiDir);
    const hasCurrentApiDir = await exists(apiDir);

    if (hasBackupApiDir && !hasCurrentApiDir) {
      await fs.mkdir(path.dirname(apiDir), { recursive: true });
      await fs.rename(backupApiDir, apiDir);
    }

    await fs.rm(backupRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
