#!/usr/bin/env node
/**
 * Static server for the Playwright suite (playwright.config.ts starts it after `vite build`).
 *
 *   node e2e/server.mjs [--port 4173]
 *
 * Mounts, first match wins:
 *   /samples/   the repository's samples/ (fixtures loadable by URL, e.g. ?src=/samples/catalog.demo.json)
 *   /fixtures/  test-results/fixtures/ (gitignored; a spec may write generated Catalogs there at run time)
 *   /           dist/ (the built site)
 *
 * Every response is sent with `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`; a spec
 * that needs a server without CORS headers can import `createStaticServer` and start its own.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

export const defaultMounts = [
  { prefix: '/samples/', dir: path.join(repoRoot, 'samples') },
  { prefix: '/fixtures/', dir: path.join(repoRoot, 'test-results', 'fixtures') },
  { prefix: '/', dir: path.join(repoRoot, 'dist') },
];

/**
 * @param {{ mounts?: { prefix: string; dir: string }[]; cors?: boolean }} [options]
 * @returns {http.Server}
 */
export function createStaticServer({ mounts = defaultMounts, cors = true } = {}) {
  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const mount = mounts.find((m) => pathname.startsWith(m.prefix));
    if (!mount) {
      res.writeHead(404).end();
      return;
    }
    let relative = pathname.slice(mount.prefix.length);
    if (relative === '' || relative.endsWith('/')) {
      relative += 'index.html';
    }
    const root = path.resolve(mount.dir);
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let info;
    try {
      info = await stat(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    const headers = {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
    };
    if (cors) {
      headers['Access-Control-Allow-Origin'] = '*';
    }
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
}

/** @param {string[]} argv */
function parsePort(argv) {
  const flag = argv.indexOf('--port');
  const raw = flag >= 0 ? argv[flag + 1] : process.env.E2E_PORT;
  const port = Number(raw ?? 4173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  return port;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const port = parsePort(process.argv.slice(2));
  const site = defaultMounts.find((m) => m.prefix === '/');
  try {
    await stat(path.join(site.dir, 'index.html'));
  } catch {
    console.error(`${site.dir}/index.html is missing: run \`npm run build\` first`);
    process.exit(1);
  }
  const server = createStaticServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`e2e static server listening on http://127.0.0.1:${port}/`);
    for (const m of defaultMounts) {
      console.log(`  ${m.prefix.padEnd(11)} -> ${path.relative(repoRoot, m.dir) || '.'}`);
    }
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
