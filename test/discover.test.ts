import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { discover } from '../src/discover.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mddocs-discover-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('discover', () => {
  it('returns cwd when no arg is given and cwd has markdown', async () => {
    await fs.writeFile(path.join(tmpRoot, 'README.md'), '# hi');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(tmpRoot));
    expect(found.focus).toBeUndefined();
  });

  it('returns cwd when no arg is given and cwd is empty', async () => {
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(tmpRoot));
    expect(found.focus).toBeUndefined();
  });

  it('does not treat a ./docs subfolder as the served root anymore', async () => {
    const docs = path.join(tmpRoot, 'docs');
    await fs.mkdir(docs);
    await fs.writeFile(path.join(docs, 'a.md'), '#');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(tmpRoot));
  });

  it('uses explicit dir arg when provided', async () => {
    const custom = path.join(tmpRoot, 'guides');
    await fs.mkdir(custom);
    await fs.writeFile(path.join(custom, 'a.md'), '#');
    const found = await discover('guides', tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(custom));
    expect(found.focus).toBeUndefined();
  });

  it('accepts an explicit empty dir without throwing', async () => {
    const empty = path.join(tmpRoot, 'empty');
    await fs.mkdir(empty);
    const found = await discover('empty', tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(empty));
  });

  it('accepts a .md file arg and returns parent + focus', async () => {
    const plansDir = path.join(tmpRoot, 'plans');
    await fs.mkdir(plansDir);
    const file = path.join(plansDir, 'PLAN.md');
    await fs.writeFile(file, '# plan');
    const found = await discover('plans/PLAN.md', tmpRoot);
    expect(path.resolve(found.docsPath)).toBe(path.resolve(plansDir));
    expect(found.focus).toBe('PLAN.md');
  });

  it('rejects a non-markdown file arg', async () => {
    const file = path.join(tmpRoot, 'notes.txt');
    await fs.writeFile(file, 'hi');
    await expect(discover('notes.txt', tmpRoot)).rejects.toThrow(/markdown file/i);
  });

  it('rejects explicit arg that does not exist', async () => {
    await expect(discover('nope', tmpRoot)).rejects.toThrow(/not found/i);
  });
});
