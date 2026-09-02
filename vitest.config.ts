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
 * CI sets it to 2.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
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
