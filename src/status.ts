import { clearState, isAlive, readState } from './state.js';
import { serverUrl, validateManagedServer } from './runtime.js';

export async function status(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log('Not running.');
    return;
  }

  if (!isAlive(state.pid)) {
    await clearState();
    console.log(`Stale state (pid ${state.pid} not alive); cleared.`);
    return;
  }

  const validation = await validateManagedServer(state, 500);
  const httpStatus = validation.ok ? validation.reason : `not verified (${validation.reason})`;

  console.log('Running:');
  console.log(`  pid:       ${state.pid}`);
  console.log(`  port:      ${state.port}`);
  console.log(`  docs:      ${state.docsPath}`);
  console.log(`  workspace: ${state.workspace}`);
  console.log(`  started:   ${state.startedAt}`);
  console.log(`  http:      ${httpStatus}`);
  console.log(`  url:       ${serverUrl(state.port)}`);
}
