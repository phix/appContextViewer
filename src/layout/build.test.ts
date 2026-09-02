import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEAVY_TEST_TIMEOUT } from './check-positions';

/**
 * Proves two build properties of this module with the repository's own vite.config.ts (ADR 0001,
 * obligation 2; docs/performance-budgets.md rows 13 and 14): the elk code is never in the chunk
 * that imports the module, and the worker chunk keeps the EPL-2.0 notice from elk.worker.ts.
 * Nothing in src/app imports the layout module yet, so the site build cannot show this; a scratch
 * entry that dynamically imports '@/layout', built with the same config, can. The e2e spec
 * e2e/layout-chunk.spec.ts serves such a build and runs the worker in Chromium.
 *
 * What the build emits, all under assets/: the entry; the layout chunk (this module plus dagre);
 * a chunk holding the Worker constructor (Vite's `?worker` module) that names the worker file; the
 * worker file itself (elk.worker.ts plus elkjs's worker build); and elkjs's worker build a second
 * time as an ordinary chunk for the on-thread fallback (`directWorker`). Everything past the entry
 * loads on demand.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const ELK_CODE = 'org.eclipse.elk'; // a string literal elkjs keeps through minification
const EPL = 'Eclipse Public License';
const BANNER = 'THIRD-PARTY-NOTICES.md'; // every chunk points at the notices (vite.config.ts)

type Chunk = { file: string; isEntry?: boolean; imports?: string[]; dynamicImports?: string[] };

let scratch: string;
let outDir: string;
let manifest: Record<string, Chunk>;
let entry: Chunk;

const read = (file: string) => readFileSync(path.join(outDir, file), 'utf8');
const builtJs = () =>
  readdirSync(path.join(outDir, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `assets/${name}`)
    .sort();
const layoutChunk = () => manifest[entry.dynamicImports?.[0] as string] as Chunk;

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'layout-chunk-')));
  const src = path.join(scratch, 'src');
  outDir = path.join(scratch, 'dist');
  // The import the app will write ('@/layout', the alias from vite.config.ts), assigned to a
  // global so it is not dropped: Vite treats an app entry's own exports as dead code.
  const main = path.join(src, 'main.js');
  mkdirSync(src);
  writeFileSync(main, "globalThis.__layout = import('@/layout');\n");
  await build({
    configFile: path.join(repoRoot, 'vite.config.ts'),
    root: src,
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, rolldownOptions: { input: main } },
  });
  manifest = JSON.parse(read('.vite/manifest.json'));
  entry = Object.values(manifest).find((chunk) => chunk.isEntry) as Chunk;
}, HEAVY_TEST_TIMEOUT);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('the layout module in the Vite build', () => {
  it('keeps the module and elk out of the importing chunk: one dynamic import, nothing static', () => {
    expect(entry.imports ?? []).toEqual([]);
    expect(entry.dynamicImports).toHaveLength(1);
    const code = read(entry.file);
    expect(code).not.toContain(ELK_CODE);
    expect(code).not.toContain('elk.algorithm');
    expect(code.length).toBeLessThan(2_000);
  });

  it('keeps elk out of the layout chunk too: dagre is inlined, elk is only referenced', () => {
    const code = read(layoutChunk().file);
    expect(code).toContain('elk.algorithm');
    expect(code).toContain('rankdir');
    expect(code).not.toContain(ELK_CODE);
    expect(code).toContain(BANNER);
  });

  it('emits the worker as its own file, reached through a Worker constructor, with the EPL-2.0 notice', () => {
    const constructors = builtJs().filter((file) => /new Worker\(/.test(read(file)));
    expect(constructors).toHaveLength(1);
    const workerName = read(constructors[0] as string).match(/elk\.worker-[\w-]+\.js/)?.[0];
    expect(workerName).toBeDefined();
    const workerFile = `assets/${workerName}`;
    expect(builtJs()).toContain(workerFile);
    expect(workerFile).not.toBe(entry.file);
    expect(workerFile).not.toBe(layoutChunk().file);

    const worker = read(workerFile);
    expect(worker).toContain(ELK_CODE);
    expect(worker).toContain(EPL);
    expect(worker).toContain('https://github.com/kieler/elkjs');
    expect(worker).toContain('Copyright');
    expect(worker.startsWith('/*! App Context Viewer')).toBe(true); // rolldown moves the EPL block to the end
    expect(worker).toContain(BANNER);
  });

  it('emits the on-thread elk (the fallback chain) as another lazy, bannered chunk', () => {
    const elkChunks = builtJs().filter((file) => read(file).includes(ELK_CODE));
    expect(elkChunks).toHaveLength(2);
    for (const file of elkChunks) {
      expect(read(file)).toContain(BANNER);
      expect(file).not.toBe(entry.file);
      expect(file).not.toBe(layoutChunk().file);
    }
  });
});
