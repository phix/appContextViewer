import { describe, expect, it } from 'vitest';
import { validateCatalog } from '@/catalog';
import { createStore } from '@/state';
import demoCatalog from '../../samples/catalog.demo.json';

/**
 * The `node` Vitest project runs where docs/architecture.md says it does: in Node, without a DOM,
 * with the committed fixtures importable. Row counts are the ones samples/README.md lists.
 *
 * It also pins the one contract `src/app/main.tsx` has to honour before the shell renders and that
 * needs no DOM: the bundled sample must go through `validateCatalog` (the raw JSON import types
 * `schemaVersion` as `number`, which does not narrow to `Catalog`), and its warnings are what the
 * header badge counts.
 */
describe('vitest project: node', () => {
  it('runs in Node without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(typeof process.version).toBe('string');
  });

  it('imports the sample Catalog fixture', () => {
    expect(demoCatalog.schemaVersion).toBe(1);
    expect(demoCatalog.applications).toHaveLength(34);
  });

  it('validates the bundled sample into the Catalog the store is constructed with', () => {
    const result = validateCatalog(demoCatalog);

    expect(result.errors).toEqual([]);
    expect(result.catalog).toBeDefined();
    // The demo's two one-sided Channels (samples/README.md); the header badge shows this count.
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'W_EMPTY_CHANNEL',
      'W_EMPTY_CHANNEL',
    ]);

    const catalog = result.catalog;
    if (catalog === undefined) {
      throw new Error('the bundled sample Catalog must validate');
    }
    const store = createStore({
      catalog,
      source: { kind: 'sample', name: 'sample Catalog (demo)' },
      warnings: result.warnings,
    });

    expect(store.graph.value.applications.size).toBe(34);
    expect(store.graph.value.externals.size).toBe(19);
    expect(store.derived.warningsCount.value).toBe(2);
    // Both kinds are ranked together (docs/center.md, decision 4).
    expect(store.derived.ranked.value.rows).toHaveLength(53);
  });
});
