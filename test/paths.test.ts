import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { workspaceKey, workspaceDir } from '../src/paths.js';

describe('paths', () => {
  it('workspaceKey is deterministic for the same path', () => {
    const a = workspaceKey('C:\\src\\Immeo\\Immeo.Catalyst\\docs');
    const b = workspaceKey('C:\\src\\Immeo\\Immeo.Catalyst\\docs');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{12}$/);
  });

  it('workspaceKey differs for different paths', () => {
    const a = workspaceKey('/repo-a/docs');
    const b = workspaceKey('/repo-b/docs');
    expect(a).not.toBe(b);
  });

  it('workspaceKey normalizes relative input via resolve', () => {
    const abs = workspaceKey(path.resolve('docs'));
    const rel = workspaceKey('docs');
    expect(abs).toBe(rel);
  });

  it('workspaceDir includes the key', () => {
    const key = workspaceKey('/foo/bar/docs');
    const dir = workspaceDir('/foo/bar/docs');
    expect(dir.endsWith(key)).toBe(true);
  });
});
