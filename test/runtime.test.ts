import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HOST, serverUrl, validateManagedServer } from '../src/runtime.js';
import type { State } from '../src/state.js';

describe('runtime', () => {
  it('uses deterministic loopback URLs', () => {
    expect(serverUrl(3000)).toBe('http://127.0.0.1:3000/');
  });

  it('validates a matching managed server marker', async () => {
    const state: State = {
      pid: process.pid,
      port: 0,
      docsPath: process.cwd(),
      workspace: process.cwd(),
      startedAt: '2026-01-01T00:00:00Z',
      token: 'token-123',
    };

    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(state));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, HOST, resolve);
    });
    state.port = (server.address() as AddressInfo).port;

    try {
      await expect(validateManagedServer(state, 500)).resolves.toEqual({
        ok: true,
        reason: 'responsive',
      });
    } finally {
      server.close();
    }
  });
});
