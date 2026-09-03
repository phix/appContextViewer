import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Two projects, per docs/architecture.md ("Test strategy"): `node` for the pure modules (catalog,
 * graph, layout, state), `jsdom` with Testing Library for the view. Every `src/**\/*.test.{ts,tsx}`
 * file belongs to exactly one project, by folder: catalog, graph, layout and state run in Node
 * whatever the extension (`*.perf.test.ts` included); view runs in jsdom whatever the extension;
 * `src/app` is split by extension (`.test.ts` in Node, `.test.tsx` in jsdom) so the scaffold's
 * smoke test for each project has a home. scripts/check-test-files.mjs fails `npm run check` when a
 * test file is claimed by no project or by more than one. Perf tests read BUDGET_FACTOR themselves;
 * CI sets it to 4.
 *
 * `fileParallelism: false` for the same reason `playwright.config.ts` runs one worker: several
 * suites here assert a *duration* (`src/layout/dagre.test.ts`, `src/catalog/catalog.perf.test.ts`,
 * `src/state/state.perf.test.ts`), and files running in parallel contend for the same cores, so a
 * timed assertion measured beside three other suites is measuring the machine's load. That is what
 * made `dagre.test.ts` report 1,343 ms for a 750 ms bound once and pass 455/455 twice after — the
 * most misleading shape a failure can have, because "it passes when I run it alone" reads as flake
 * rather than as the harness telling the truth about a loaded box.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      fileParallelism: false,
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: [
              'src/{catalog,graph,layout,state}/**/*.test.{ts,tsx}',
              'src/app/**/*.test.ts',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'jsdom',
            environment: 'jsdom',
            // @testing-library/preact registers its cleanup on a global afterEach at import time;
            // without globals every render would leak into the next test.
            globals: true,
            include: ['src/view/**/*.test.{ts,tsx}', 'src/app/**/*.test.tsx'],
          },
        },
      ],
    },
  }),
);
