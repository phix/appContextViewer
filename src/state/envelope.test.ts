import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Catalog, validateCatalog } from '@/catalog';
import { createStore, EXPAND_ALL_LIMIT, OVERVIEW_LIMIT, type Store } from './index';

/**
 * Above the supported envelope (docs/performance-budgets.md): Expand all is disabled above 1,000
 * Applications, the Overview above 3,000, and neither Catalog is refused. The fixtures are generated
 * on the fly by samples/generate.mjs (deterministic, well under a second each).
 */
const generator = fileURLToPath(new URL('../../samples/generate.mjs', import.meta.url));
let dir: string;

function generated(apps: number): Catalog {
  const out = path.join(dir, `catalog-${apps}.json`);
  execFileSync(process.execPath, [generator, '--apps', String(apps), '--out', out], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const result = validateCatalog(JSON.parse(readFileSync(out, 'utf8')));
  if (result.catalog === undefined) {
    throw new Error(`the generated ${apps}-Application Catalog does not validate`);
  }
  return result.catalog;
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'app-context-viewer-envelope-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('over the supported envelope', () => {
  it(`disables Expand all above ${EXPAND_ALL_LIMIT} Applications and keeps the Overview`, () => {
    const store: Store = createStore({ catalog: generated(EXPAND_ALL_LIMIT + 1) });
    expect(store.graph.value.applications.size).toBe(EXPAND_ALL_LIMIT + 1);
    const model = store.derived.overviewModel.value;
    expect(model.expandAllDisabled).toBe(true);
    expect(model.overviewDisabled).toBe(false);
    expect(model.notice).toBeNull();
    store.actions.expandAll();
    expect(store.openGroups.value.size).toBe(0);
    // Opening single Groups remains.
    store.actions.expandOverview(true);
    const first = store.derived.overviewModel.value.groups[0];
    expect(first).toBeDefined();
    store.actions.toggleGroup(first?.id ?? '');
    expect(store.openGroups.value.size).toBe(1);
  });

  it(`disables the Overview above ${OVERVIEW_LIMIT} Applications with a notice naming the counts`, () => {
    const store = createStore({ catalog: generated(OVERVIEW_LIMIT + 1) });
    expect(store.graph.value.applications.size).toBe(OVERVIEW_LIMIT + 1);
    store.actions.expandOverview(true);
    const model = store.derived.overviewModel.value;
    expect(model.overviewDisabled).toBe(true);
    expect(model.expandAllDisabled).toBe(true);
    expect(model.groups).toEqual([]);
    expect(model.edges).toEqual([]);
    expect(model.notice).toBe(
      `The Overview is disabled for this Catalog: 3,001 Applications and ${model.dependencies.toLocaleString('en-US')} Dependencies, above the 3,000-Application limit.`,
    );
    expect(model.dependencies).toBeGreaterThan(OVERVIEW_LIMIT);
  });

  it('keeps Expand all at exactly the limit', () => {
    const store = createStore({ catalog: generated(EXPAND_ALL_LIMIT) });
    expect(store.derived.overviewModel.value.expandAllDisabled).toBe(false);
    store.actions.expandAll();
    // 123 Repositories at 1,000 Applications (samples/README.md).
    expect(store.openGroups.value.size).toBe(123);
  });
});
