import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 20 * 1024 * 1024;

export interface WrangerRunResult {
  stdout: string;
  stderr: string;
}

export async function runWrangler(args: string[]): Promise<WrangerRunResult> {
  const { stdout, stderr } = await execFileAsync('npx', ['wrangler', ...args], {
    cwd: process.cwd(),
    maxBuffer: DEFAULT_MAX_BUFFER
  });

  return {
    stdout,
    stderr
  };
}

export async function runD1Json(database: string, sql: string): Promise<unknown> {
  const { stdout } = await runWrangler([
    'd1',
    'execute',
    database,
    '--remote',
    '--json',
    '--command',
    sql
  ]);

  return JSON.parse(stdout);
}

export function toSqlText(value: string | null | undefined): string {
  if (value === undefined || value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

export function encodeObjectKeyForUrl(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
