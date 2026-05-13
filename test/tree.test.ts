import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateHomepage, generateSidebar } from '../src/tree.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mddocs-tree-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, body = '# ' + rel): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf8');
}

describe('generateSidebar', () => {
  it('emits a list of top-level markdown files with humanized titles', async () => {
    await write('intro.md');
    await write('quick_start.md');
    await write('release-notes.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- [Intro](/docs/intro.md)');
    expect(sidebar).toContain('- [Quick Start](/docs/quick_start.md)');
    expect(sidebar).toContain('- [Release Notes](/docs/release-notes.md)');
  });

  it('nests subfolders and skips empty ones', async () => {
    await write('architecture/components.md');
    await write('architecture/containers.md');
    await write('assets/.gitkeep'); // no markdown — should be omitted
    await write('runbooks/oncall.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toMatch(/- Architecture/);
    expect(sidebar).toContain('  - [Components](/docs/architecture/components.md)');
    expect(sidebar).toContain('  - [Containers](/docs/architecture/containers.md)');
    expect(sidebar).toMatch(/- Runbooks/);
    expect(sidebar).toContain('  - [Oncall](/docs/runbooks/oncall.md)');
    expect(sidebar).not.toContain('Assets');
  });

  it('includes deeply nested markdown files', async () => {
    await write('a/b/c/d/deep.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- A');
    expect(sidebar).toContain('      - D');
    expect(sidebar).toContain('        - [Deep](/docs/a/b/c/d/deep.md)');
  });

  it('links a folder header to its README.md if one exists', async () => {
    await write('architecture/README.md');
    await write('architecture/components.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- [Architecture](/docs/architecture/README.md)');
    expect(sidebar).toContain('  - [Components](/docs/architecture/components.md)');
    // Subfolder README must not appear as its own leaf entry.
    expect(sidebar).not.toMatch(/- \[Readme\]/);
  });

  it('ignores top-level README.md (used as homepage instead)', async () => {
    await write('README.md');
    await write('intro.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- [Intro](/docs/intro.md)');
    expect(sidebar).not.toMatch(/^- \[Readme\]/m);
  });

  it('ignores _sidebar.md, _navbar.md, _coverpage.md, dotfiles, node_modules', async () => {
    await write('_sidebar.md');
    await write('_navbar.md');
    await write('_coverpage.md');
    await write('.hidden.md');
    await write('node_modules/pkg/readme.md');
    await write('real.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- [Real](/docs/real.md)');
    expect(sidebar).not.toContain('_sidebar');
    expect(sidebar).not.toContain('_navbar');
    expect(sidebar).not.toContain('_coverpage');
    expect(sidebar).not.toContain('hidden');
    expect(sidebar).not.toContain('node_modules');
    expect(sidebar).not.toContain('Pkg');
  });

  it('URL-encodes path segments with parens or spaces', async () => {
    await write('meeting-minutes/(template).md');
    await write('weekly notes.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('- [(template)](/docs/meeting-minutes/%28template%29.md)');
    expect(sidebar).toContain('- [Weekly Notes](/docs/weekly%20notes.md)');
  });

  it('always emits absolute paths so links work from any current page', async () => {
    await write('foo/bar.md');
    const sidebar = await generateSidebar(root, 'docs');
    // Every link href must start with '/' — relative paths would 404 once the
    // user has navigated into a subfolder, because docsify's relativePath
    // option re-resolves them against the current page.
    const linkRegex = /]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    const hrefs: string[] = [];
    while ((m = linkRegex.exec(sidebar)) !== null) hrefs.push(m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith('/')).toBe(true);
    }
  });

  it('places directories before files at each level', async () => {
    await write('zebra.md');
    await write('architecture/components.md');
    const sidebar = await generateSidebar(root, 'docs');
    const archIdx = sidebar.indexOf('Architecture');
    const zebraIdx = sidebar.indexOf('Zebra');
    expect(archIdx).toBeGreaterThanOrEqual(0);
    expect(zebraIdx).toBeGreaterThan(archIdx);
  });

  it('returns a placeholder when the folder is empty', async () => {
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toMatch(/no markdown files found/i);
  });
});

describe('generateHomepage', () => {
  it('mentions the docs folder and the parent (repo) folder name', () => {
    const docsPath = path.join('my-project', 'docs');
    const home = generateHomepage(docsPath);
    expect(home).toContain('my-project/docs');
    expect(home).toContain('# docs');
  });

  it('mentions that mddocs generated it', () => {
    const home = generateHomepage('/repo/docs');
    expect(home.toLowerCase()).toContain('mddocs');
    expect(home.toLowerCase()).toContain('readme');
  });
});
