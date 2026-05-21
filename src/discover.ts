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
