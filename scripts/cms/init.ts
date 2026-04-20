import { readCmsConfig } from '../../src/server/cms/config';
import { createCmsProvider } from '../../src/server/cms/provider';

async function main() {
  const config = readCmsConfig();
  const provider = createCmsProvider(config);
  const state = await provider.getState();

  console.log('CMS initialized');
  console.log(`Provider: ${state.provider}`);
  console.log(`Live version: ${state.live.version}`);
  console.log(`Stage version: ${state.stage.version}`);
  console.log(`Pending changes: ${state.diff.hasChanges ? 'yes' : 'no'}`);
  console.log(`State dir: ${config.stateDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
