# CWD Fallback and Depth Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mddocs` default to serving the current working directory (instead of requiring a `docs/` folder), and bound the sidebar walk with a configurable depth limit (default 5).

**Architecture:** Strip docs-folder auto-discovery from `src/discover.ts` so the no-arg case just returns the cwd. Add a `maxDepth` option to the sidebar tree walk in `src/tree.ts` and thread it through `src/scaffold.ts`. Expose it on the CLI as `--depth N` in `src/index.ts`. Existing `SKIP_DIRS` continues to handle `node_modules`/`dist`/etc.

**Tech Stack:** Node.js, TypeScript, commander, vitest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-21-cwd-fallback-and-depth-limit-design.md`

---

## File map

- **Modify** `src/tree.ts` — add `maxDepth` to `generateSidebar` + `walk`
- **Modify** `src/scaffold.ts` — accept `{ maxDepth }` and pass through
- **Modify** `src/discover.ts` — delete `CANDIDATE_NAMES`, fallback loop, and `hasMarkdown`; no-arg returns cwd
- **Modify** `src/index.ts` — add `--depth <n>` option, thread to scaffold; update arg description
- **Modify** `test/tree.test.ts` — add depth-limit cases
- **Modify** `test/discover.test.ts` — drop docs-folder-discovery cases, add cwd-fallback cases
- **Modify** `README.md` — update usage section

---

## Task 1: Depth limit in `tree.ts` walk

**Files:**
- Test: `test/tree.test.ts`
- Modify: `src/tree.ts`

- [ ] **Step 1: Write failing tests for depth limiting**

Append to `test/tree.test.ts` inside the existing `describe('generateSidebar', ...)` block (before the final `});`):

```typescript
  it('respects an explicit maxDepth and excludes deeper files', async () => {
    await write('top.md');
    await write('a/level1.md');
    await write('a/b/level2.md');
    await write('a/b/c/level3.md');
    const sidebar = await generateSidebar(root, 'docs', { maxDepth: 2 });
    expect(sidebar).toContain('- [Top](/docs/top.md)');
    expect(sidebar).toContain('  - [Level1](/docs/a/level1.md)');
    expect(sidebar).toContain('    - [Level2](/docs/a/b/level2.md)');
    expect(sidebar).not.toContain('level3');
  });

  it('with maxDepth 0 emits only root-level files', async () => {
    await write('root.md');
    await write('sub/inner.md');
    const sidebar = await generateSidebar(root, 'docs', { maxDepth: 0 });
    expect(sidebar).toContain('- [Root](/docs/root.md)');
    expect(sidebar).not.toContain('Sub');
    expect(sidebar).not.toContain('inner');
  });

  it('defaults to depth 5 when no option is passed', async () => {
    await write('a/b/c/d/e/deep5.md');
    await write('a/b/c/d/e/f/deep6.md');
    const sidebar = await generateSidebar(root, 'docs');
    expect(sidebar).toContain('deep5');
    expect(sidebar).not.toContain('deep6');
  });
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run test/tree.test.ts -t "maxDepth"`
Expected: at least one failure (the option isn't supported yet — `generateSidebar` ignores the third arg and `deep6.md` will appear).

- [ ] **Step 3: Add `maxDepth` to `generateSidebar` and `walk`**

In `src/tree.ts`, change the `generateSidebar` signature and the `walk` signature/recursion:

```typescript
export interface SidebarOptions {
  /** Max directory nesting depth to walk. 0 means root-level files only. Default 5. */
  maxDepth?: number;
}

export async function generateSidebar(
  docsPath: string,
  urlRoot: string = 'docs',
  opts: SidebarOptions = {}
): Promise<string> {
  const maxDepth = opts.maxDepth ?? 5;
  const lines: string[] = [];
  await walk(docsPath, [urlRoot], 0, maxDepth, lines, new Set());
  if (lines.length === 0) {
    return '- _(no markdown files found)_\n';
  }
  return lines.join('\n') + '\n';
}
```

And update the `walk` function — add `maxDepth` to its parameter list and gate the recursion into subdirectories:

```typescript
async function walk(
  dir: string,
  urlParts: string[],
  depth: number,
  maxDepth: number,
  lines: string[],
  seen: Set<string>
): Promise<void> {
  const realDir = await realPathOrSelf(dir);
  if (seen.has(realDir)) return;
  seen.add(realDir);

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const indent = '  '.repeat(depth);

  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (depth >= maxDepth) continue;
      const subdir = path.join(dir, e.name);
      if (!(await hasMarkdown(subdir))) continue;
      const subParts = [...urlParts, e.name];
      const niceName = humanize(e.name);
      const readme = path.join(subdir, 'README.md');
      if (await pathExists(readme)) {
        lines.push(`${indent}- [${niceName}](${toUrl([...subParts, 'README.md'])})`);
      } else {
        lines.push(`${indent}- ${niceName}`);
      }
      await walk(subdir, subParts, depth + 1, maxDepth, lines, seen);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      if (SKIP_FILES.has(e.name)) continue;
      if (e.name === 'README.md') continue;
      const niceName = humanize(e.name.replace(/\.md$/i, ''));
      lines.push(`${indent}- [${niceName}](${toUrl([...urlParts, e.name])})`);
    }
  }
}
```

Key behavior: `depth` is the nesting level of the *current* directory below the root (root = 0). Files in the current directory are always emitted; subdirectories are only descended into when `depth < maxDepth`. With `maxDepth = 2` the deepest emitted files are at depth 2 (e.g. `a/b/foo.md`).

- [ ] **Step 4: Run the full tree test file and verify pass**

Run: `npx vitest run test/tree.test.ts`
Expected: PASS — all existing cases still pass (they don't pass `opts`, so they get the default 5; the deepest existing case is `a/b/c/d/deep.md` at depth 4, which fits).

- [ ] **Step 5: Commit**

```bash
git add src/tree.ts test/tree.test.ts
git commit -m "feat(tree): add maxDepth option to generateSidebar (default 5)"
```

---

## Task 2: Thread `maxDepth` through `scaffold.ts`

**Files:**
- Modify: `src/scaffold.ts`

This task has no new test of its own — Task 1 already covers the depth behavior, and Task 4 will cover end-to-end wiring. Scaffold just needs to forward the option.

- [ ] **Step 1: Add an options parameter to `scaffold` and pass it to `generateSidebar`**

In `src/scaffold.ts`, change the `scaffold` signature and the one `generateSidebar` call site:

```typescript
export interface ScaffoldOptions {
  /** Max directory nesting depth for the synthetic sidebar walk. Default 5. */
  maxDepth?: number;
}

export async function scaffold(docsPath: string, opts: ScaffoldOptions = {}): Promise<Scaffolded> {
  const workspace = workspaceDir(docsPath);
  await fs.mkdir(workspace, { recursive: true });

  await ensureJunction(path.join(workspace, 'docs'), docsPath);
  await writeIfDifferent(path.join(workspace, '.nojekyll'), '');

  const hasUserSidebar = await pathExists(path.join(docsPath, '_sidebar.md'));
  const hasUserReadme = await pathExists(path.join(docsPath, 'README.md'));

  const workspaceSidebar = path.join(workspace, '_sidebar.md');
  if (hasUserSidebar) {
    await removeIfExists(workspaceSidebar);
  } else {
    const sidebarContent = await generateSidebar(docsPath, 'docs', { maxDepth: opts.maxDepth });
    await fs.writeFile(workspaceSidebar, sidebarContent, 'utf8');
  }
  // ...rest unchanged
```

Leave the rest of `scaffold` untouched.

- [ ] **Step 2: Type-check by running the full test suite**

Run: `npx vitest run`
Expected: PASS — `scaffold.test.ts` calls `scaffold(docsPath)` without options, which is allowed.

- [ ] **Step 3: Commit**

```bash
git add src/scaffold.ts
git commit -m "feat(scaffold): forward maxDepth option to sidebar generator"
```

---

## Task 3: Strip docs-folder discovery from `discover.ts`

**Files:**
- Modify: `test/discover.test.ts`
- Modify: `src/discover.ts`

- [ ] **Step 1: Replace the test file with the new behavior**

Replace the body of `test/discover.test.ts` with this. The point is: drop every assertion that depends on docs-folder auto-discovery, and add new cases for the cwd-fallback default.

```typescript
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run test/discover.test.ts`
Expected: failures on "returns cwd when no arg ...", "does not treat a ./docs subfolder ...", and "accepts an explicit empty dir without throwing" — the current code still auto-discovers `./docs` and rejects empty dirs.

- [ ] **Step 3: Rewrite `src/discover.ts` with the simplified logic**

Replace the entire contents of `src/discover.ts` with:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface DiscoverResult {
  /** Directory that should be junctioned in as the served docs root. */
  docsPath: string;
  /** Filename (relative to docsPath) the browser should open on, if any. */
  focus?: string;
}

export async function discover(arg: string | undefined, cwd: string = process.cwd()): Promise<DiscoverResult> {
  if (!arg) {
    return { docsPath: path.resolve(cwd) };
  }

  const resolved = path.resolve(cwd, arg);
  const stat = await statOrNull(resolved);
  if (!stat) {
    throw new Error(`Path not found: ${resolved}`);
  }
  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith('.md')) {
      throw new Error(`Not a markdown file: ${resolved}`);
    }
    return { docsPath: path.dirname(resolved), focus: path.basename(resolved) };
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a file or directory: ${resolved}`);
  }
  return { docsPath: resolved };
}

async function statOrNull(p: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}
```

This removes: `CANDIDATE_NAMES`, the docs-folder loop, the `docs*` prefix fallback, the `hasMarkdown` helper, the `isDirectory` helper, the `realPathOrSelf` helper, and the "No docs folder found" error path. The empty-dir guard for explicit args is also removed.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npx vitest run test/discover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/discover.ts test/discover.test.ts
git commit -m "feat(discover): drop docs-folder auto-discovery, default to cwd"
```

---

## Task 4: `--depth` CLI option in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update the root command to accept and validate `--depth`**

In `src/index.ts`, change the root command registration (lines 18-24) to add the option, parse it, and thread it through `scaffold`:

```typescript
  program
    .argument('[path]', 'markdown file or folder to serve (default: current directory)')
    .option(
      '--depth <n>',
      'max directory depth to walk for the sidebar (0 = root-only)',
      '5'
    )
    .action(async (pathArg: string | undefined, opts: { depth: string }) => {
      const maxDepth = parseDepth(opts.depth);
      const { docsPath, focus } = await discover(pathArg);
      const { workspace } = await scaffold(docsPath, { maxDepth });
      await serve(docsPath, workspace, { focus });
    });
```

And add a `parseDepth` helper at the bottom of the file (before `main().catch(...)`):

```typescript
function parseDepth(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--depth must be a non-negative integer (got ${JSON.stringify(raw)})`);
  }
  return n;
}
```

- [ ] **Step 2: Build to confirm the wiring type-checks**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no test directly exercises `index.ts`, but the build proves the wiring.

- [ ] **Step 4: Smoke-test the CLI manually in a scratch directory**

Run (PowerShell):

```powershell
$tmp = New-Item -ItemType Directory -Path "$env:TEMP\mddocs-smoke-$([guid]::NewGuid())"
New-Item -ItemType File -Path "$tmp\README.md" -Value "# top"
New-Item -ItemType Directory -Path "$tmp\a\b\c" -Force | Out-Null
New-Item -ItemType File -Path "$tmp\a\b\c\deep.md" -Value "# deep"
node ./dist/index.js $tmp --depth 1
# Expect: browser opens to a sidebar containing 'A' folder but not 'deep' (depth 1 stops at a/).
# Then:
node ./dist/index.js stop
node ./dist/index.js $tmp --depth 5
# Expect: 'Deep' appears in the sidebar (depth 5 reaches a/b/c/deep.md).
node ./dist/index.js stop
Remove-Item $tmp -Recurse -Force
```

Expected: First run's sidebar is shallow, second run's sidebar shows the deep file. Confirm visually in the browser.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): add --depth option (default 5) for sidebar walk"
```

---

## Task 5: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the Usage section to describe the new behavior**

In `README.md`, replace the Usage section (lines 25-35) with:

```markdown
## Usage

```bash
mddocs                  # serve the current directory (sidebar walks up to 5 levels deep)
mddocs ./guides         # serve a specific folder
mddocs ./plans/PLAN.md  # serve the parent folder and open the browser on this file
mddocs --depth 2        # cap the sidebar walk at 2 nested levels (0 = root-only)
mddocs status           # show what's running
mddocs stop             # halt the server
```

Pointing at a `.md` file serves its containing directory (so the sidebar shows whatever else is next to it) and navigates straight to that file. Useful for reviewing a plan in a real renderer while you wait.

By default `mddocs` walks `.md` files up to 5 directory levels deep, skipping `node_modules`, `dist`, `bin`, `obj`, `.git`, and similar build/VCS folders. Use `--depth N` to widen or narrow the walk (`--depth 0` shows only the root-level files).
```

(Keep the surrounding "Install", "Claude Code integration", "Where state lives", etc. sections untouched.)

- [ ] **Step 2: Skim the rest of the README for stale references**

Search for any other mention of "auto-discover", "./docs", or the discovery convention and update if needed.

Run: `grep -n -i "auto-discover\|docs\* \|./doc\b" README.md` (informational; not all hits are stale)

Expected: no remaining text that promises automatic `docs/` discovery. The one reference to "docsify" the library is fine.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for cwd-default and --depth option"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full suite cold**

Run: `npm run build && npx vitest run`
Expected: PASS, no TypeScript errors.

- [ ] **Step 2: Manual end-to-end check in this repo**

From the repo root:

```powershell
node ./dist/index.js
# Expect: browser opens at the served cwd. Sidebar lists README.md, CHANGELOG (if any),
# and walks into src/, test/, docs/, etc. — anything containing .md within depth 5.
node ./dist/index.js stop
```

Then in a subfolder:

```powershell
node ./dist/index.js ./docs/superpowers
# Expect: browser opens at docs/superpowers; sidebar lists this plan and the spec.
node ./dist/index.js stop
```

Then with `--depth 0`:

```powershell
node ./dist/index.js --depth 0
# Expect: sidebar contains only top-level .md files (README.md is the homepage,
# CHANGELOG.md etc. if present); no nested folders appear.
node ./dist/index.js stop
```

- [ ] **Step 3: No final commit needed** — each task committed independently.
