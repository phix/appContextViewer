import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';

// Proves the `node` Vitest project runs where docs/architecture.md says it does: in Node, without a
// DOM, with the committed fixtures importable. Row counts are the ones samples/README.md lists.
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
});
