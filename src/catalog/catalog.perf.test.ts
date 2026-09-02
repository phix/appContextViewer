import { describe, expect, it } from 'vitest';
import { validateCatalog } from './index';
import { readJson, sample } from './test-fixtures';

/**
 * Budget 1 (docs/performance-budgets.md): parse, validate, build the graph and compute every Blast
 * radius in 100 ms at 1,000 Applications. This slice asserts the validation half at 50 ms; the graph
 * slice asserts its half and the state slice the whole pipeline. CI runs with BUDGET_FACTOR=2.
 */
const BUDGET_MS = 50;
const factor = (() => {
  const raw = Number(process.env.BUDGET_FACTOR ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
})();

describe('budget 1, the catalog half', () => {
  it(`validateCatalog on samples/catalog-1000.json takes <= ${BUDGET_MS} ms x ${factor}`, () => {
    const document = readJson(sample('catalog-1000.json'));
    const timings: number[] = [];
    let applications = 0;
    // The first run is the cold one a user pays; the rest show the steady state in the message.
    for (let run = 0; run < 5; run++) {
      const started = performance.now();
      const result = validateCatalog(document);
      timings.push(performance.now() - started);
      applications = result.catalog?.applications.length ?? 0;
    }
    expect(applications).toBe(1000);
    const cold = timings[0] ?? Number.POSITIVE_INFINITY;
    const detail = `cold ${cold.toFixed(1)} ms, then ${timings
      .slice(1)
      .map((t) => t.toFixed(1))
      .join(', ')} ms`;
    expect(cold, detail).toBeLessThanOrEqual(BUDGET_MS * factor);
  });
});
