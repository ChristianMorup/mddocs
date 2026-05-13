import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { clearState, isAlive, readState, writeState } from './state.js';
import type { State } from './state.js';
import {
  createServerToken,
  HOST,
  serverUrl,
  validateManagedServer,
  writeServerMarker,
} from './runtime.js';

const PORT_RANGE_START = 3000;
const PORT_RANGE_END = 3010;
const READY_TIMEOUT_MS = 8000;

export async function serve(docsPath: string, workspace: string): Promise<void> {
  const existing = await readState();
  if (existing && isAlive(existing.pid)) {
    const validation = await validateManagedServer(existing, 500);
    if (validation.ok) {
      throw new Error(
        `mddocs is already running (pid ${existing.pid}, port ${existing.port}, docs ${existing.docsPath}). ` +
        `Run 'mddocs stop' first.`
      );
    }
    await clearState();
  } else if (existing) {
    await clearState();
  }

  const port = await findFreePort(PORT_RANGE_START, PORT_RANGE_END);

  // Pipe child stdio to log files inside the workspace. Using 'ignore' on
  // Windows together with detached + windowsHide produced silent failures
  // (the child reported launch but never bound the port); giving the child
  // real file handles is more robust and gives us a log to inspect.
  const logPath = path.join(workspace, 'server.log');
  const errPath = path.join(workspace, 'server.err.log');
  const outFd = openSync(logPath, 'a');
  const errFd = openSync(errPath, 'a');

  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./static-server.js', import.meta.url)), workspace, String(port)],
    {
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    }
  );

  if (!child.pid) {
    throw new Error('Failed to spawn mddocs static server.');
  }

  child.unref();

  const state = {
    pid: child.pid,
    port,
    docsPath,
    workspace,
    startedAt: new Date().toISOString(),
    token: createServerToken(),
  };
  try {
    await writeServerMarker(state);
    await waitForManagedServer(state, READY_TIMEOUT_MS);
  } catch (err) {
    // best-effort kill of the stalled child
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // ignore
    }
    throw new Error(`Docsify server did not come up within ${READY_TIMEOUT_MS}ms: ${(err as Error).message}`);
  }

  await writeState(state);

  const url = serverUrl(port);
  await open(url).catch(() => {
    // browser failed to open — not fatal, user has the URL
  });

  console.log(`Serving ${docsPath}`);
  console.log(`  → ${url}`);
  console.log(`Run 'mddocs stop' to halt.`);
}

function findFreePort(start: number, end: number): Promise<number> {
  return (async () => {
    for (let p = start; p <= end; p++) {
      if (await isPortFree(p)) return p;
    }
    throw new Error(`No free port in ${start}-${end}. Run 'mddocs stop' or free a port and retry.`);
  })();
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function waitForManagedServer(state: State & { token: string }, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let delay = 100;
  let lastReason = 'not responding';
  while (Date.now() - start < timeoutMs) {
    const validation = await validateManagedServer(state, 1000);
    if (validation.ok) return;
    lastReason = validation.reason;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.floor(delay * 1.5), 500);
  }
  throw new Error(lastReason);
}
