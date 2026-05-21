import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { installSkill, skillFile, SKILL_CONTENT, uninstallSkill } from '../src/skill.js';

let fakeHome: string;

beforeEach(async () => {
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'mddocs-skill-'));
});

afterEach(async () => {
  await fs.rm(fakeHome, { recursive: true, force: true });
});

describe('installSkill', () => {
  it('creates the skill file when none exists', async () => {
    const result = await installSkill({ home: fakeHome });
    expect(result).toBe('installed');
    const written = await fs.readFile(skillFile({ home: fakeHome }), 'utf8');
    expect(written).toBe(SKILL_CONTENT);
  });

  it('reports "already" when content matches', async () => {
    await installSkill({ home: fakeHome });
    const result = await installSkill({ home: fakeHome });
    expect(result).toBe('already');
  });

  it('treats CRLF-normalized content as already installed', async () => {
    const file = skillFile({ home: fakeHome });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, SKILL_CONTENT.replace(/\n/g, '\r\n'), 'utf8');
    const result = await installSkill({ home: fakeHome });
    expect(result).toBe('already');
  });

  it('refuses to overwrite a modified file without --force', async () => {
    const file = skillFile({ home: fakeHome });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '# user-edited content', 'utf8');
    const result = await installSkill({ home: fakeHome });
    expect(result).toBe('conflict');
    const onDisk = await fs.readFile(file, 'utf8');
    expect(onDisk).toBe('# user-edited content');
  });

  it('overwrites a modified file with --force and reports "updated"', async () => {
    const file = skillFile({ home: fakeHome });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '# user-edited content', 'utf8');
    const result = await installSkill({ home: fakeHome, force: true });
    expect(result).toBe('updated');
    const onDisk = await fs.readFile(file, 'utf8');
    expect(onDisk).toBe(SKILL_CONTENT);
  });
});

describe('uninstallSkill', () => {
  it('reports "not-installed" when nothing is there', async () => {
    const result = await uninstallSkill({ home: fakeHome });
    expect(result).toBe('not-installed');
  });

  it('removes a clean install', async () => {
    await installSkill({ home: fakeHome });
    const result = await uninstallSkill({ home: fakeHome });
    expect(result).toBe('removed');
    await expect(fs.stat(skillFile({ home: fakeHome }))).rejects.toThrow();
  });

  it('also cleans up the empty skill directory', async () => {
    await installSkill({ home: fakeHome });
    await uninstallSkill({ home: fakeHome });
    const skillDir = path.dirname(skillFile({ home: fakeHome }));
    await expect(fs.stat(skillDir)).rejects.toThrow();
  });

  it('refuses to remove a modified file without --force', async () => {
    const file = skillFile({ home: fakeHome });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '# user-edited content', 'utf8');
    const result = await uninstallSkill({ home: fakeHome });
    expect(result).toBe('modified');
    expect(await fs.readFile(file, 'utf8')).toBe('# user-edited content');
  });

  it('removes a modified file with --force', async () => {
    const file = skillFile({ home: fakeHome });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '# user-edited content', 'utf8');
    const result = await uninstallSkill({ home: fakeHome, force: true });
    expect(result).toBe('removed');
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it('leaves the skill directory in place if it contains other files', async () => {
    await installSkill({ home: fakeHome });
    const skillDir = path.dirname(skillFile({ home: fakeHome }));
    await fs.writeFile(path.join(skillDir, 'extra.md'), 'user note', 'utf8');
    const result = await uninstallSkill({ home: fakeHome });
    expect(result).toBe('removed');
    // The user's extra file survives.
    expect(await fs.readFile(path.join(skillDir, 'extra.md'), 'utf8')).toBe('user note');
  });
});

describe('skillFile scope resolution', () => {
  it('resolves under home for the default (user) scope', () => {
    const file = skillFile({ home: '/fake/home' });
    expect(file.startsWith(path.join('/fake/home', '.claude'))).toBe(true);
  });

  it('resolves under cwd for the local scope', () => {
    const file = skillFile({ scope: 'local', cwd: '/fake/repo' });
    expect(file.startsWith(path.join('/fake/repo', '.claude'))).toBe(true);
  });

  it('ignores home when scope is local', () => {
    const file = skillFile({ scope: 'local', cwd: '/fake/repo', home: '/fake/home' });
    expect(file.startsWith(path.join('/fake/repo', '.claude'))).toBe(true);
    expect(file.includes('/fake/home')).toBe(false);
  });
});

describe('local scope install/uninstall', () => {
  let fakeRepo: string;

  beforeEach(async () => {
    fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'mddocs-skill-local-'));
  });

  afterEach(async () => {
    await fs.rm(fakeRepo, { recursive: true, force: true });
  });

  it('writes into ./.claude/skills under cwd, not home', async () => {
    const result = await installSkill({ scope: 'local', cwd: fakeRepo, home: fakeHome });
    expect(result).toBe('installed');
    const localFile = skillFile({ scope: 'local', cwd: fakeRepo });
    expect(await fs.readFile(localFile, 'utf8')).toBe(SKILL_CONTENT);
    // User scope stays untouched.
    await expect(fs.stat(skillFile({ home: fakeHome }))).rejects.toThrow();
  });

  it('user and local installs coexist independently', async () => {
    await installSkill({ scope: 'user', home: fakeHome });
    await installSkill({ scope: 'local', cwd: fakeRepo, home: fakeHome });
    expect(await fs.readFile(skillFile({ home: fakeHome }), 'utf8')).toBe(SKILL_CONTENT);
    expect(await fs.readFile(skillFile({ scope: 'local', cwd: fakeRepo }), 'utf8')).toBe(SKILL_CONTENT);

    // Uninstalling local does not remove user.
    const r = await uninstallSkill({ scope: 'local', cwd: fakeRepo, home: fakeHome });
    expect(r).toBe('removed');
    expect(await fs.readFile(skillFile({ home: fakeHome }), 'utf8')).toBe(SKILL_CONTENT);
  });
});
