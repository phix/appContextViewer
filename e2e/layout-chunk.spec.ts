import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build } from 'vite';

/**
 * Issue #22: the elk chunk is code-split and keeps its licence comment, and the Overview layout
 * really runs elkjs in a Web Worker. Nothing in src/app imports the layout module yet, so this spec
 * builds its own page with the repository's vite.config.ts into e2e/.fixtures/layout-chunk/
 * (gitignored, served at /fixtures/ by e2e/server.mjs) and drives it in Chromium. The page imports
 * '@/layout' the way the app will, lays a small compound spec out through createOverviewLayout(),
 * aborts a second run and recovers on a third, and leaves the outcome on window.__layout.
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = path.join(repoRoot, 'e2e', '.fixtures', 'layout-chunk');
const src = path.join(fixture, 'src');
const dist = path.join(fixture, 'dist');
const served = '/fixtures/layout-chunk/dist';

const ELK_CODE = 'org.eclipse.elk';

/** What main.js leaves on window.__layout. */
type Outcome = {
  adapter: string;
  positions?: [string, number, number, number?, number?][];
  aborted?: string;
  recovered?: number;
  error?: string;
};

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>layout chunk</title>
  </head>
  <body>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`;

const MAIN = `
const node = (id) => ({ id, width: 120, height: 30 });
const spec = {
  nodes: ['a', 'b', 'c', 'd', 'e'].map(node),
  edges: [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'a', target: 'd' },
    { source: 'd', target: 'e' },
  ],
  parents: new Map([['a', 'left'], ['b', 'left'], ['d', 'right'], ['e', 'right']]),
};
const outcome = { adapter: typeof Worker === 'function' ? 'worker' : 'direct' };
try {
  const { createOverviewLayout } = await import('@/layout');
  const layout = createOverviewLayout();
  const positions = await layout.run(spec);
  outcome.positions = [...positions].map(([id, p]) => [id, p.x, p.y, p.width, p.height]);
  const controller = new AbortController();
  const aborted = layout.run(spec, controller.signal);
  controller.abort();
  outcome.aborted = await aborted.then(() => 'resolved', (error) => error.name);
  outcome.recovered = (await layout.run(spec)).size;
  layout.dispose();
} catch (error) {
  outcome.error = String(error && error.stack ? error.stack : error);
}
window.__layout = outcome;
`;

const builtJs = () =>
  readdirSync(path.join(dist, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `assets/${name}`);
const read = (file: string) => readFileSync(path.join(dist, file), 'utf8');

/** The worker file, found the way the browser finds it: named inside the `?worker` constructor chunk. */
function workerFile(): string {
  const spawner = builtJs().find((file) => /new Worker\(/.test(read(file)));
  const name = spawner ? read(spawner).match(/elk\.worker-[\w-]+\.js/)?.[0] : undefined;
  if (!name) {
    throw new Error('no chunk constructs the elk worker');
  }
  return `assets/${name}`;
}

test.beforeAll(async () => {
  rmSync(fixture, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, 'index.html'), PAGE);
  writeFileSync(path.join(src, 'main.js'), MAIN);
  await build({
    configFile: path.join(repoRoot, 'vite.config.ts'),
    root: src,
    logLevel: 'silent',
    build: { outDir: dist, emptyOutDir: true },
  });
});

test('the served elk worker chunk is its own file and carries the EPL-2.0 notice', async ({
  request,
}) => {
  const file = workerFile();
  const response = await request.get(`${served}/${file}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('javascript');
  const chunk = await response.text();
  expect(chunk).toContain('Eclipse Public License');
  expect(chunk).toContain('https://github.com/kieler/elkjs');
  expect(chunk).toContain(ELK_CODE);
  // ADR 0001, obligation 2, second half: the chunk also points at the shipped notices file.
  expect(chunk).toContain('THIRD-PARTY-NOTICES.md');

  // The page's own module script is small and free of elk: the chunk above is loaded on demand.
  const html = await (await request.get(`${served}/`)).text();
  const entry = html.match(/src="\.\/(assets\/[\w.-]+\.js)"/)?.[1];
  expect(entry).toBeDefined();
  const entryCode = await (await request.get(`${served}/${entry}`)).text();
  expect(entryCode).not.toContain(ELK_CODE);
  expect(entryCode.length).toBeLessThan(4_000);
});

test('the Overview layout runs elkjs in a real Web Worker, loaded only when asked', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requested: string[] = [];
  page.on('request', (req) => requested.push(new URL(req.url()).pathname));

  await page.goto(`${served}/`);
  await page.waitForFunction(() => {
    const outcome = (window as unknown as { __layout?: Outcome }).__layout;
    return outcome !== undefined && ('positions' in outcome || 'error' in outcome);
  });
  const outcome = await page.evaluate(() => (window as unknown as { __layout: Outcome }).__layout);

  expect(outcome.error, outcome.error).toBeUndefined();
  expect(errors).toEqual([]);
  expect(outcome.adapter).toBe('worker');

  // Every node and both Groups placed, every coordinate finite, Groups sized.
  const ids = (outcome.positions ?? []).map(([id]) => id).sort();
  expect(ids).toEqual(['a', 'b', 'c', 'd', 'e', 'left', 'right']);
  for (const [id, x, y, width, height] of outcome.positions ?? []) {
    expect(Number.isFinite(x) && Number.isFinite(y), id).toBe(true);
    if (id === 'left' || id === 'right') {
      expect(Number.isFinite(width) && Number.isFinite(height), id).toBe(true);
    }
  }
  // The abort terminated the worker and rejected with AbortError; the recreated worker answered.
  expect(outcome.aborted).toBe('AbortError');
  expect(outcome.recovered).toBe(7);

  // The worker file was fetched by the page (a real Worker, not the in-process adapter), and the
  // on-thread elk chunk, the fallback chain's, never was.
  const worker = workerFile();
  expect(requested.filter((p) => p.endsWith(`/${worker}`)).length).toBeGreaterThanOrEqual(1);
  expect(requested.some((p) => /elk-worker\.min-[\w-]+\.js$/.test(p))).toBe(false);
});
