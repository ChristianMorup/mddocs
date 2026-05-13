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
  it('finds ./docs when present with markdown', async () => {
    const docs = path.join(tmpRoot, 'docs');
    await fs.mkdir(docs);
    await fs.writeFile(path.join(docs, 'readme.md'), '# hi');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(docs));
  });

  it('prefers ./docs over ./documentation', async () => {
    const docs = path.join(tmpRoot, 'docs');
    const documentation = path.join(tmpRoot, 'documentation');
    await fs.mkdir(docs);
    await fs.mkdir(documentation);
    await fs.writeFile(path.join(docs, 'a.md'), '#');
    await fs.writeFile(path.join(documentation, 'b.md'), '#');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(docs));
  });

  it('falls back to docs* directories', async () => {
    const docsInternal = path.join(tmpRoot, 'docs-internal');
    await fs.mkdir(docsInternal);
    await fs.writeFile(path.join(docsInternal, 'x.md'), '#');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(docsInternal));
  });

  it('finds markdown nested one level deep', async () => {
    const docs = path.join(tmpRoot, 'docs');
    await fs.mkdir(path.join(docs, 'sub'), { recursive: true });
    await fs.writeFile(path.join(docs, 'sub', 'a.md'), '#');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(docs));
  });

  it('finds markdown nested several levels deep', async () => {
    const docs = path.join(tmpRoot, 'docs');
    await fs.mkdir(path.join(docs, 'a', 'b', 'c'), { recursive: true });
    await fs.writeFile(path.join(docs, 'a', 'b', 'c', 'deep.md'), '#');
    const found = await discover(undefined, tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(docs));
  });

  it('throws when no docs folder exists', async () => {
    await expect(discover(undefined, tmpRoot)).rejects.toThrow(/No docs folder found/);
  });

  it('uses explicit arg when provided', async () => {
    const custom = path.join(tmpRoot, 'guides');
    await fs.mkdir(custom);
    await fs.writeFile(path.join(custom, 'a.md'), '#');
    const found = await discover('guides', tmpRoot);
    expect(path.resolve(found)).toBe(path.resolve(custom));
  });

  it('rejects explicit arg pointing at non-directory', async () => {
    await expect(discover('nope', tmpRoot)).rejects.toThrow(/not a directory/i);
  });

  it('rejects explicit arg with no markdown', async () => {
    const empty = path.join(tmpRoot, 'empty');
    await fs.mkdir(empty);
    await expect(discover('empty', tmpRoot)).rejects.toThrow(/No markdown/);
  });

  it('rejects ./docs with no markdown (falls through to no-match)', async () => {
    await fs.mkdir(path.join(tmpRoot, 'docs'));
    await expect(discover(undefined, tmpRoot)).rejects.toThrow(/No docs folder/);
  });
});
