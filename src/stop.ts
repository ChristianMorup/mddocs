import { spawn } from 'node:child_process';
import { clearState, isAlive, readState } from './state.js';
import { validateManagedServer } from './runtime.js';

export async function stop(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log('mddocs is not running.');
    return;
  }

  if (!isAlive(state.pid)) {
    await clearState();
    console.log(`Process ${state.pid} was already gone. Cleared stale state.`);
    return;
  }

  const validation = await validateManagedServer(state, 1000);
  if (!validation.ok) {
    await clearState();
    console.log(`State did not match a running mddocs server (${validation.reason}). Cleared state without killing pid ${state.pid}.`);
    return;
  }

  if (process.platform === 'win32') {
    await killWindows(state.pid);
  } else {
    await killPosix(state.pid);
  }

  await clearState();
  console.log(`Stopped (pid ${state.pid}, port ${state.port}).`);
}

function killWindows(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    t.once('exit', (code) => {
      // taskkill returns 128 when the PID is already gone — treat as success.
      if (code === 0 || code === 128) resolve();
      else reject(new Error(`taskkill exited with code ${code}`));
    });
    t.once('error', reject);
  });
}

async function killPosix(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  await new Promise((r) => setTimeout(r, 2000));
  if (isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
}
