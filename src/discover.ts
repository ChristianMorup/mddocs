import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CANDIDATE_NAMES = ['docs', 'doc', 'documentation'];

export async function discover(arg: string | undefined, cwd: string = process.cwd()): Promise<string> {
  if (arg) {
    const resolved = path.resolve(cwd, arg);
    if (!(await isDirectory(resolved))) {
      throw new Error(`Path is not a directory: ${resolved}`);
    }
    if (!(await hasMarkdown(resolved))) {
      throw new Error(`No markdown files found under ${resolved}`);
    }
    return resolved;
  }

  for (const name of CANDIDATE_NAMES) {
    const p = path.join(cwd, name);
    if ((await isDirectory(p)) && (await hasMarkdown(p))) {
      return p;
    }
  }

  // Fallback: any top-level entry whose name starts with "docs"
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(cwd, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (CANDIDATE_NAMES.includes(entry.name)) continue;
    if (!entry.name.toLowerCase().startsWith('docs')) continue;
    const p = path.join(cwd, entry.name);
    if (await hasMarkdown(p)) return p;
  }

  throw new Error(`No docs folder found in ${cwd}. Pass a path explicitly: 'mddocs <folder>'.`);
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function hasMarkdown(dir: string, seen: Set<string> = new Set()): Promise<boolean> {
  const realDir = await realPathOrSelf(dir);
  if (seen.has(realDir)) return false;
  seen.add(realDir);

  let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) return true;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (await hasMarkdown(path.join(dir, e.name), seen)) return true;
  }
  return false;
}

async function realPathOrSelf(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}
