import { readCmsConfig } from '../../src/server/cms/config';
import { createCmsProvider } from '../../src/server/cms/provider';

function readReason(args: string[]): string {
  const reasonIdx = args.findIndex((arg) => arg === '--reason');
  if (reasonIdx === -1) return 'CLI publish';
  return args[reasonIdx + 1] || 'CLI publish';
}

async function main() {
  const args = process.argv.slice(2);
  const reason = readReason(args);
  const triggerHook = !args.includes('--no-hook');

  const provider = createCmsProvider(readCmsConfig());
  const result = await provider.publish({ reason, triggerDeployHook: triggerHook });
  const state = await provider.getState();

  console.log(JSON.stringify({ result, state }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
