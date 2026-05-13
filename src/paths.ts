import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export function appDataDir(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state');
}

export function stateDir(): string {
  return path.join(appDataDir(), 'mddocs');
}

export function stateFile(): string {
  return path.join(stateDir(), 'state.json');
}

export function workspaceKey(docsPath: string): string {
  return createHash('sha256').update(path.resolve(docsPath)).digest('hex').slice(0, 12);
}

export function workspaceDir(docsPath: string): string {
  return path.join(stateDir(), 'workspaces', workspaceKey(docsPath));
}
