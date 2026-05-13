import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { readState, writeState, clearState } from '../src/state.js';
import { HOST } from '../src/runtime.js';
import { stop } from '../src/stop.js';

// These tests cover the Windows (LOCALAPPDATA) and Linux (XDG_STATE_HOME) paths.
// The macOS path derives from os.homedir() and isn't exercised here — adding
// coverage would require a process-level homedir override, which Node's ESM
// runtime won't allow via vi.spyOn.

let tmpRoot: string;
let originalLocalAppData: string | undefined;
let originalXdg: string | undefined;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mddocs-state-'));
  originalLocalAppData = process.env.LOCALAPPDATA;
  originalXdg = process.env.XDG_STATE_HOME;
  process.env.LOCALAPPDATA = tmpRoot;
  process.env.XDG_STATE_HOME = tmpRoot;
});

afterEach(async () => {
  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocalAppData;
  if (originalXdg === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalXdg;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('state', () => {
  it('round-trips state', async () => {
    await writeState({
      pid: 123,
      port: 3000,
      docsPath: '/some/path',
      workspace: '/tmp/ws',
      startedAt: '2026-01-01T00:00:00Z',
      token: 'token-123',
    });
    const got = await readState();
    expect(got).toEqual({
      pid: 123,
      port: 3000,
      docsPath: '/some/path',
      workspace: '/tmp/ws',
      startedAt: '2026-01-01T00:00:00Z',
      token: 'token-123',
    });
  });

  it('returns null when state is absent', async () => {
    const got = await readState();
    expect(got).toBeNull();
  });

  it('clearState removes the file', async () => {
    await writeState({
      pid: 1, port: 3000, docsPath: 'x', workspace: 'y', startedAt: 'z',
    });
    await clearState();
    expect(await readState()).toBeNull();
  });

  it('clearState on absent state is a no-op', async () => {
    await expect(clearState()).resolves.toBeUndefined();
  });

  it('stop clears mismatched state without killing the stored pid', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        token: 'other-token',
        pid: process.pid,
        port: 0,
        docsPath: 'x',
        workspace: 'y',
        startedAt: 'z',
      }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, resolve);
    });

    const port = (server.address() as AddressInfo).port;
    await writeState({
      pid: process.pid,
      port,
      docsPath: 'x',
      workspace: 'y',
      startedAt: 'z',
      token: 'expected-token',
    });

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await stop();
    } finally {
      log.mockRestore();
      server.close();
    }

    expect(await readState()).toBeNull();
  });
});
