import * as fs from 'node:fs/promises';
import { stateDir, stateFile } from './paths.js';

export interface State {
  pid: number;
  port: number;
  docsPath: string;
  workspace: string;
  startedAt: string;
  token?: string;
}

export async function readState(): Promise<State | null> {
  try {
    const text = await fs.readFile(stateFile(), 'utf8');
    return JSON.parse(text) as State;
  } catch {
    return null;
  }
}

export async function writeState(state: State): Promise<void> {
  await fs.mkdir(stateDir(), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify(state, null, 2), 'utf8');
}

export async function clearState(): Promise<void> {
  try {
    await fs.unlink(stateFile());
  } catch {
    // ignore — already gone
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
