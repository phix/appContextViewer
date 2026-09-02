import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Two projects, per docs/architecture.md ("Test strategy"): `node` for the pure modules (catalog,
 * graph, layout, state), `jsdom` with Testing Library for the view. `src/app` is covered by both so
 * this scaffold's smoke tests have a home; there the extension decides the runtime (`.test.ts` runs
 * in Node, `.test.tsx` in jsdom). Perf tests read BUDGET_FACTOR themselves; CI sets it to 2.
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
              'src/{app,catalog,graph,layout,state}/**/*.test.ts',
              'src/{catalog,graph,layout,state}/**/*.perf.test.ts',
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
            include: ['src/{app,view}/**/*.test.tsx'],
          },
        },
      ],
    },
  }),
);
