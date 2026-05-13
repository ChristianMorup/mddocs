import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { State } from './state.js';

export const HOST = '127.0.0.1';
export const SERVER_MARKER = '.mddocs-server.json';

export interface ServerMarker {
  token: string;
  pid: number;
  docsPath: string;
  workspace: string;
  startedAt: string;
}

export interface ValidationResult {
  ok: boolean;
  reason: string;
}

export function createServerToken(): string {
  return randomUUID();
}

export function serverUrl(port: number): string {
  return `http://${HOST}:${port}/`;
}

export async function writeServerMarker(state: State): Promise<void> {
  if (!state.token) {
    throw new Error('Cannot write server marker without a token.');
  }

  const marker: ServerMarker = {
    token: state.token,
    pid: state.pid,
    docsPath: path.resolve(state.docsPath),
    workspace: path.resolve(state.workspace),
    startedAt: state.startedAt,
  };

  await fs.writeFile(
    path.join(state.workspace, SERVER_MARKER),
    JSON.stringify(marker, null, 2),
    'utf8'
  );
}

export async function validateManagedServer(state: State, timeoutMs: number = 1000): Promise<ValidationResult> {
  if (!state.token) {
    return { ok: false, reason: 'state has no server token' };
  }

  try {
    const markerUrl = new URL(SERVER_MARKER, serverUrl(state.port));
    const res = await fetch(markerUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return { ok: false, reason: `server marker returned HTTP ${res.status}` };
    }

    const marker = (await res.json()) as Partial<ServerMarker>;
    if (typeof marker.token !== 'string' || marker.token !== state.token) {
      return { ok: false, reason: 'server token did not match state' };
    }
    if (typeof marker.pid !== 'number' || marker.pid !== state.pid) {
      return { ok: false, reason: 'server pid did not match state' };
    }
    if (typeof marker.docsPath !== 'string' || path.resolve(marker.docsPath) !== path.resolve(state.docsPath)) {
      return { ok: false, reason: 'server docs path did not match state' };
    }
    if (typeof marker.workspace !== 'string' || path.resolve(marker.workspace) !== path.resolve(state.workspace)) {
      return { ok: false, reason: 'server workspace did not match state' };
    }

    return { ok: true, reason: 'responsive' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}
