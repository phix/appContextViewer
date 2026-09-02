import { describe, expect, it } from 'vitest';
import { blastRadius, buildGraph, buildSearchIndex, search } from './index';
import { readSampleCatalog } from './test-fixtures';

/**
 * The graph module's two budget rows from docs/performance-budgets.md, timed in Node on
 * samples/catalog-1000.json (1,000 Applications, 5,395 Dependencies). BUDGET_FACTOR scales every
 * number; CI sets it to 2 so a slow runner never blocks a merge while a real regression still does.
 */
const budget = (ms: number) => ms * Number(process.env.BUDGET_FACTOR ?? 1);

// Parsing the fixture is the catalog module's half of budget 1 and is not timed here.
const catalog = readSampleCatalog('catalog-1000.json');

describe('graph performance budgets', () => {
  it('budget 1, graph half: buildGraph plus a Blast radius for every Application in 50 ms', () => {
    const started = performance.now();
    const graph = buildGraph(catalog);
    let reached = 0;
    for (const id of graph.applications.keys()) {
      reached += blastRadius(graph, id).flat().length;
    }
    const elapsed = performance.now() - started;
    expect(graph.applications.size).toBe(1000);
    expect(reached).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(budget(50));
  });

  it('budget 7: one search over 1,000 ids and every scalar Attribute in 50 ms', () => {
    const index = buildSearchIndex(buildGraph(catalog));
    // A one-letter query is the worst case: it matches nearly every entry before ranking.
    const started = performance.now();
    const hits = search(index, 'a', 20);
    const elapsed = performance.now() - started;
    expect(hits).toHaveLength(20);
    expect(elapsed).toBeLessThanOrEqual(budget(50));
  });
});
