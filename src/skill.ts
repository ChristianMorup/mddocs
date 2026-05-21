import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const SKILL_NAME = 'mddocs-plan-review';

// Embedded content for the Claude Code skill that nudges plan-writing
// workflows to offer mddocs as a renderer. Single source of truth — the
// installer writes this byte-for-byte, and uninstall checks against it
// (line-ending-normalized) to decide whether the file is still "ours".
export const SKILL_CONTENT = `---
name: mddocs-plan-review
description: Use when you have just written a plan, design doc, or other review-worthy markdown to a file on disk and the user is about to read it. Offers to open the file in mddocs (a local docsify renderer) so the user can review it with proper formatting, diagrams, and a sidebar instead of scrolling raw markdown.
---

# Offering mddocs for plan review

When you write a plan, design doc, RFC, or similar review artifact to a \`.md\` file on disk — and the user is the next reviewer — offer to open it in mddocs.

## When to offer

Offer once, right after the file is written, before handing back for review:

> I've written the plan to \`./plans/feature-x.md\`. Want me to open it in mddocs so you can review it rendered? (\`mddocs ./plans/feature-x.md\`)

## When NOT to offer

- The plan is inline-only (ExitPlanMode payload, no file on disk) — there's nothing to point mddocs at.
- The user has already declined mddocs once in this session.
- The file is a tiny fragment (< ~20 lines) — rendering adds no value over the chat view.
- The user is mid-implementation, not mid-review. mddocs is for *reading*, not editing flows.

## How to launch it

If the user accepts, run \`mddocs <path-to-file>\` via Bash. The server is detached and exits immediately after opening the browser, so it does not block.

If \`mddocs status\` shows a server already running for a parent directory of the target file, tell the user the URL with the right hash route instead of starting a second one (mddocs is single-instance per host):

> mddocs is already serving \`<dir>\`. Open: http://127.0.0.1:<port>/#/docs/<file>

## Why this exists

Plans benefit from rendered markdown (mermaid diagrams, headings, code blocks, sidebar navigation, search). Asking the user to review a multi-page plan as raw markdown in their editor or in the chat transcript is friction the user has explicitly opted to remove by installing this skill.
`;

export type SkillScope = 'user' | 'local';

export interface SkillPathOptions {
  /** 'user' → ~/.claude/skills (default). 'local' → ./.claude/skills (per-repo). */
  scope?: SkillScope;
  /** Override $HOME (used by tests). Defaults to os.homedir(). */
  home?: string;
  /** Override cwd for 'local' scope (used by tests). Defaults to process.cwd(). */
  cwd?: string;
}

export function skillFile(opts: SkillPathOptions = {}): string {
  const scope = opts.scope ?? 'user';
  const root = scope === 'local' ? (opts.cwd ?? process.cwd()) : (opts.home ?? os.homedir());
  return path.join(root, '.claude', 'skills', SKILL_NAME, 'SKILL.md');
}

export type InstallResult = 'installed' | 'already' | 'updated' | 'conflict';

export async function installSkill(opts: { force?: boolean } & SkillPathOptions = {}): Promise<InstallResult> {
  const file = skillFile(opts);
  const existing = await readOrNull(file);
  if (existing !== null && canonical(existing) === canonical(SKILL_CONTENT)) {
    return 'already';
  }
  if (existing !== null && !opts.force) {
    return 'conflict';
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, SKILL_CONTENT, 'utf8');
  return existing === null ? 'installed' : 'updated';
}

export type UninstallResult = 'removed' | 'not-installed' | 'modified';

export async function uninstallSkill(opts: { force?: boolean } & SkillPathOptions = {}): Promise<UninstallResult> {
  const file = skillFile(opts);
  const existing = await readOrNull(file);
  if (existing === null) return 'not-installed';
  if (canonical(existing) !== canonical(SKILL_CONTENT) && !opts.force) {
    return 'modified';
  }
  await fs.rm(file);
  // Best-effort cleanup of the now-empty skill directory; leave it alone if
  // the user dropped other files in there. Only swallow the expected codes —
  // permission/locking errors should still surface.
  try {
    await fs.rmdir(path.dirname(file));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOTEMPTY' && code !== 'ENOENT' && code !== 'EEXIST') throw err;
  }
  return 'removed';
}

// Normalize CRLF so an editor that rewrote line endings on save doesn't
// flip a clean install into a "conflict" / "modified" state.
function canonical(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
