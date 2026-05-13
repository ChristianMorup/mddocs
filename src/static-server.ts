#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { HOST } from './runtime.js';

const MIME_TYPES = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

async function main(): Promise<void> {
  const [workspaceArg, portArg] = process.argv.slice(2);
  if (!workspaceArg || !portArg) {
    throw new Error('Usage: static-server <workspace> <port>');
  }

  const workspace = path.resolve(workspaceArg);
  const port = Number.parseInt(portArg, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${portArg}`);
  }

  const server = http.createServer((req, res) => {
    void handleRequest(workspace, req, res);
  });

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });

  console.log(`mddocs static server listening at http://${HOST}:${port}/`);
}

async function handleRequest(
  workspace: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }

  let url: URL;
  try {
    url = new URL(req.url ?? '/', `http://${HOST}`);
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }

  const requested = resolveRequestPath(workspace, url.pathname);
  if (!requested) {
    sendText(res, 400, 'Bad request');
    return;
  }

  const served = await findServableFile(requested);
  if (served) {
    streamFile(served, method, res);
    return;
  }

  const fallback = shouldServeIndex(url.pathname, req) ? await findServableFile(path.join(workspace, 'index.html')) : null;
  if (fallback) {
    streamFile(fallback, method, res);
    return;
  }

  sendText(res, 404, 'Not found');
}

function resolveRequestPath(workspace: string, pathname: string): string | null {
  let parts: string[];
  try {
    parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }

  for (const part of parts) {
    if (part === '..' || part.includes('/') || part.includes('\\')) {
      return null;
    }
  }

  const resolved = path.resolve(workspace, ...parts);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

async function findServableFile(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return filePath;
    if (!stat.isDirectory()) return null;

    const indexPath = path.join(filePath, 'index.html');
    const indexStat = await fs.stat(indexPath);
    return indexStat.isFile() ? indexPath : null;
  } catch {
    return null;
  }
}

function shouldServeIndex(pathname: string, req: http.IncomingMessage): boolean {
  if (path.extname(pathname)) return false;
  const accept = req.headers.accept ?? '';
  return accept.includes('text/html') || accept.includes('*/*') || accept === '';
}

function streamFile(filePath: string, method: string, res: http.ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');

  if (method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.once('error', () => {
    if (!res.headersSent) {
      sendText(res, 500, 'Internal server error');
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`mddocs static server: ${message}`);
  process.exit(1);
});
