import { describe, expect, it } from 'vitest';
import { validateCatalog } from '@/catalog';
import { readSampleDocument } from './fixtures.test-helper';
import { createStore } from './index';

/**
 * Budget 1 (docs/performance-budgets.md): validate every schema rule, build the graph and compute
 * every Blast radius on samples/catalog-1000.json in 100 ms. The catalog and graph slices each
 * assert their half at 50 ms; this is the whole pipeline as the store runs it: `validateCatalog`,
 * `createStore` (which builds the Graph) and the ranked table (every Blast radius, both kinds).
 * BUDGET_FACTOR scales the number; CI sets it to 2.
 */
const BUDGET_MS = 100;
const factor = (() => {
  const raw = Number(process.env.BUDGET_FACTOR ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
})();

describe('budget 1, the whole pipeline', () => {
  it(`validate, build and rank samples/catalog-1000.json in <= ${BUDGET_MS} ms x ${factor}`, () => {
    // Parsing is the file read's half of the load path and is not timed here, as in the catalog half.
    const document = readSampleDocument('catalog-1000.json');
    const timings: number[] = [];
    let rows = 0;
    // The first run is the cold one a user pays; the rest show the steady state in the message.
    for (let run = 0; run < 5; run++) {
      const started = performance.now();
      const result = validateCatalog(document);
      if (result.catalog === undefined) {
        throw new Error('samples/catalog-1000.json must validate');
      }
      const store = createStore({ catalog: result.catalog, warnings: result.warnings });
      rows = store.derived.ranked.value.rows.length;
      timings.push(performance.now() - started);
    }
    expect(rows).toBe(1000 + 25);
    const cold = timings[0] ?? Number.POSITIVE_INFINITY;
    const detail = `cold ${cold.toFixed(1)} ms, then ${timings
      .slice(1)
      .map((t) => t.toFixed(1))
      .join(', ')} ms`;
    expect(cold, detail).toBeLessThanOrEqual(BUDGET_MS * factor);
  });
});
