import { describe, expect, it } from 'vitest';
import { loadCatalog, validateCatalog } from '@/catalog';
import { buildGraph, type Graph } from '@/graph';
import { demoStore, fetchServing, readSampleText, validatedSample } from './fixtures.test-helper';
import { createStore, DEFAULT_DEPTH, DEFAULT_GROUP } from './index';

const ORDER_SERVICE = { kind: 'application', id: 'acme/commerce/order-service' } as const;
const REDIS = { kind: 'external', id: 'redis' } as const;

describe('createStore: the initial state', () => {
  it('starts on the Catalog the app passes in, with the defaults', () => {
    const store = demoStore();
    expect(store.source.value.kind).toBe('sample');
    expect(store.catalog.value.applications).toHaveLength(34);
    expect(store.graph.value.applications.size).toBe(34);
    expect(store.center.value).toBeNull();
    expect(store.depth.value).toBe(DEFAULT_DEPTH);
    expect(store.groupBy.value).toBe(DEFAULT_GROUP);
    expect(store.openGroups.value.size).toBe(0);
    expect(store.overviewExpanded.value).toBe(false);
    expect(store.report.value).toBeNull();
    expect(store.channelCard.value).toBeNull();
    expect(store.notice.value).toBeNull();
    // The demo Catalog's two W_EMPTY_CHANNEL warnings (samples/README.md).
    expect(store.derived.warningsCount.value).toBe(2);
  });
});

describe('load: the current Catalog survives a failed load (docs/validation-surfacing.md, 3)', () => {
  it('keeps the Catalog, Graph and source and opens the rejected report on a fetch failure', async () => {
    const failing = (async () => {
      throw new TypeError('network unreachable');
    }) as unknown as typeof fetch;
    const store = demoStore({ loadDeps: { fetch: failing } });
    store.actions.select(ORDER_SERVICE);
    const before = { catalog: store.catalog.value, graph: store.graph.value };
    const result = await store.actions.load('https://example.test/broken.json');
    expect(result.catalog).toBeUndefined();
    expect(store.catalog.value).toBe(before.catalog);
    expect(store.graph.value).toBe(before.graph);
    expect(store.source.value.kind).toBe('sample');
    expect(store.center.value).toEqual(ORDER_SERVICE);
    expect(store.report.value).toMatchObject({
      mode: 'rejected',
      source: { kind: 'url', name: 'https://example.test/broken.json' },
    });
    expect(store.report.value?.errors.length).toBeGreaterThan(0);
    expect(store.report.value?.errors[0]?.code).toBe('E_FETCH');
  });

  it('keeps the Catalog on a schema error and lists the findings', async () => {
    const text = readSampleText('invalid/E_UNRESOLVED_REF.json');
    const store = demoStore({ loadDeps: { fetch: fetchServing(text) } });
    const result = await store.actions.load('https://example.test/broken.json');
    expect(result.errors.map((finding) => finding.code)).toContain('E_UNRESOLVED_REF');
    expect(store.catalog.value.applications).toHaveLength(34);
    expect(store.report.value?.mode).toBe('rejected');
    expect(store.report.value?.errors).toBe(result.errors);
    store.actions.closeReport();
    expect(store.report.value).toBeNull();
    expect(store.catalog.value.applications).toHaveLength(34);
  });

  it('replaces the Catalog, Graph, source and warnings when the new one validates', async () => {
    const text = readSampleText('catalog-200.json');
    const store = demoStore({ loadDeps: { fetch: fetchServing(text) } });
    const result = await store.actions.load('https://example.test/catalog-200.json');
    expect(result.catalog).toBeDefined();
    expect(store.catalog.value).toBe(result.catalog);
    expect(store.graph.value.applications.size).toBe(200);
    expect(store.source.value).toEqual({
      kind: 'url',
      name: 'https://example.test/catalog-200.json',
    });
    expect(store.warnings.value).toBe(result.warnings);
    expect(store.report.value).toBeNull();
  });

  it('feeds loadCatalog to buildGraph: the catalog Catalog satisfies the graph CatalogInput', async () => {
    // Pins the assumed structural interface from PR #33 (graph slice), consumed here.
    const result = await loadCatalog('https://example.test/demo.json', {
      fetch: fetchServing(readSampleText('catalog.demo.json')),
    });
    if (result.catalog === undefined) {
      throw new Error('the demo Catalog must validate');
    }
    const graph: Graph = buildGraph(result.catalog);
    expect(graph.applications.size).toBe(result.catalog.applications.length);
    expect(graph.externals.size).toBe(result.catalog.externals?.length ?? 0);
  });

  it('passes a File through the loader', async () => {
    const store = demoStore();
    const file = new File([readSampleText('catalog.example.json')], 'example.json');
    await store.actions.load(file);
    expect(store.source.value).toEqual({ kind: 'file', name: 'example.json' });
    expect(store.graph.value.applications.size).toBe(9);
  });

  it('lets only the latest of two overlapping loads apply', async () => {
    let releaseFirst: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const bodies = new Map([
      ['https://example.test/slow.json', readSampleText('catalog-200.json')],
      ['https://example.test/fast.json', readSampleText('catalog.example.json')],
    ]);
    const gated = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('slow.json')) {
        await first;
      }
      return new Response(bodies.get(url) ?? '', { status: 200 });
    }) as unknown as typeof fetch;
    const store = demoStore({ loadDeps: { fetch: gated } });
    const slow = store.actions.load('https://example.test/slow.json');
    await store.actions.load('https://example.test/fast.json');
    expect(store.graph.value.applications.size).toBe(9);
    releaseFirst?.();
    await slow;
    expect(store.graph.value.applications.size).toBe(9);
  });
});

describe('load: the Center is re-validated (docs/url-state.md, 5)', () => {
  it('keeps a Center the new Catalog still has', async () => {
    // The 1,000 fixture shares no ids with the demo, so use the example, which shares none either;
    // reload the demo itself to prove the keep path.
    const store = demoStore({
      loadDeps: { fetch: fetchServing(readSampleText('catalog.demo.json')) },
    });
    store.actions.select(ORDER_SERVICE);
    await store.actions.load('https://example.test/demo.json');
    expect(store.center.value).toEqual(ORDER_SERVICE);
    expect(store.notice.value).toBeNull();
    // The kept Center's Group is auto-opened against the new Graph.
    expect(store.openGroups.value.has('repository=acme/commerce')).toBe(true);
  });

  it('clears a Center the new Catalog lacks and raises the notice, without the sample hint', async () => {
    const store = demoStore({
      loadDeps: { fetch: fetchServing(readSampleText('catalog-200.json')) },
    });
    store.actions.select(REDIS);
    await store.actions.load('https://example.test/catalog-200.json');
    expect(store.center.value).toBeNull();
    expect(store.notice.value).toEqual({
      kind: 'missing-center',
      center: REDIS,
      text: 'redis is not in this Catalog.',
    });
    expect(store.derived.board.value).toBeNull();
  });

  it('falls the grouping back to the default when the new Catalog cannot group by it', async () => {
    // `schedule` is a groupable key of the demo Catalog that the 200-Application fixture lacks.
    const store = demoStore({
      loadDeps: { fetch: fetchServing(readSampleText('catalog-200.json')) },
    });
    store.actions.setGroupBy('schedule');
    expect(store.groupBy.value).toBe('schedule');
    await store.actions.load('https://example.test/catalog-200.json');
    expect(store.groupBy.value).toBe(DEFAULT_GROUP);
    expect(() => store.derived.overviewModel.value).not.toThrow();
  });

  it('closes a Channel card the new Catalog lacks', async () => {
    const store = demoStore({
      loadDeps: { fetch: fetchServing(readSampleText('catalog-200.json')) },
    });
    store.actions.openChannel('orders.placed');
    expect(store.channelCard.value).toBe('orders.placed');
    await store.actions.load('https://example.test/catalog-200.json');
    expect(store.channelCard.value).toBeNull();
  });
});

describe('select', () => {
  it('sets a Center of either kind and auto-opens an Application Center Group', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    expect(store.center.value).toEqual(ORDER_SERVICE);
    expect([...store.openGroups.value]).toEqual(['repository=acme/commerce']);
    store.actions.select(REDIS);
    expect(store.center.value).toEqual(REDIS);
    // An External belongs to no Group, so nothing more opens (docs/center.md, 7).
    expect([...store.openGroups.value]).toEqual(['repository=acme/commerce']);
    store.actions.select(null);
    expect(store.center.value).toBeNull();
  });

  it('opens the Group under the current grouping, or its Repository while grouping is none', () => {
    const store = demoStore();
    store.actions.setGroupBy('tier');
    store.actions.select(ORDER_SERVICE);
    expect([...store.openGroups.value]).toEqual(['tier=1']);
    store.actions.setGroupBy('none');
    expect([...store.openGroups.value]).toEqual(['repository=acme/commerce']);
    store.actions.setGroupBy('team');
    store.actions.select({ kind: 'application', id: 'legacy-monolith/monolith' });
    // No team: the synthetic Group's id is the Attribute alone.
    expect(store.openGroups.value.has('team')).toBe(true);
  });

  it('clears the Center and raises the notice with the sample hint for an unknown one', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    store.actions.select({ kind: 'application', id: 'acme/x/y' });
    expect(store.center.value).toBeNull();
    expect(store.notice.value).toEqual({
      kind: 'missing-center',
      center: { kind: 'application', id: 'acme/x/y' },
      text: 'acme/x/y is not in this Catalog. Load your Catalog to open it.',
    });
    store.actions.dismissNotice();
    expect(store.notice.value).toBeNull();
  });

  it('treats an id of the wrong kind as missing', () => {
    const store = demoStore();
    store.actions.select({ kind: 'application', id: 'redis' });
    expect(store.center.value).toBeNull();
    expect(store.notice.value?.kind).toBe('missing-center');
  });

  it('closes the Channel card', () => {
    const store = demoStore();
    store.actions.openChannel('orders.placed');
    store.actions.select(ORDER_SERVICE);
    expect(store.channelCard.value).toBeNull();
  });
});

describe('setDepth and setGroupBy', () => {
  it('accepts a positive integer or unbounded and falls back otherwise', () => {
    const store = demoStore();
    store.actions.setDepth(3);
    expect(store.depth.value).toBe(3);
    store.actions.setDepth(Number.POSITIVE_INFINITY);
    expect(store.depth.value).toBe(Number.POSITIVE_INFINITY);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      store.actions.setDepth(bad);
      expect(store.depth.value).toBe(DEFAULT_DEPTH);
    }
  });

  it('accepts none, the built-ins and every groupable key, and maps the rest to the default', () => {
    const store = demoStore();
    for (const key of ['none', 'team', 'kind', 'tier', 'language']) {
      store.actions.setGroupBy(key);
      expect(store.groupBy.value).toBe(key);
    }
    // `links` is display-only (samples/README.md); `Team` is the wrong case; `owner` is unknown.
    for (const bad of ['links', 'tags', 'Team', 'owner', '']) {
      store.actions.setGroupBy('team');
      store.actions.setGroupBy(bad);
      expect(store.groupBy.value).toBe(DEFAULT_GROUP);
    }
    // The Overview never throws for any of these.
    expect(() => store.derived.overviewModel.value).not.toThrow();
  });

  it('resets the open set when the grouping changes', () => {
    const store = demoStore();
    store.actions.toggleGroup('repository=acme/commerce');
    store.actions.setGroupBy('team');
    expect(store.openGroups.value.size).toBe(0);
  });
});

describe('Groups and the Overview', () => {
  it('toggles, expands all and collapses all', () => {
    const store = demoStore();
    store.actions.toggleGroup('repository=acme/commerce');
    expect(store.openGroups.value.has('repository=acme/commerce')).toBe(true);
    store.actions.toggleGroup('repository=acme/commerce');
    expect(store.openGroups.value.has('repository=acme/commerce')).toBe(false);
    store.actions.expandAll();
    // Ten Repositories in the demo Catalog (samples/README.md).
    expect(store.openGroups.value.size).toBe(10);
    store.actions.collapseAll();
    expect(store.openGroups.value.size).toBe(0);
  });

  it('expands all under the effective grouping while grouping is none', () => {
    const store = demoStore();
    store.actions.setGroupBy('none');
    store.actions.expandAll();
    expect(store.openGroups.value.size).toBe(10);
  });

  it('expands and collapses the Overview', () => {
    const store = demoStore();
    store.actions.expandOverview(true);
    expect(store.overviewExpanded.value).toBe(true);
    store.actions.expandOverview(false);
    expect(store.overviewExpanded.value).toBe(false);
  });
});

describe('the report, the Channel card and the filter', () => {
  it('opens the warnings side sheet for the current Catalog and closes it', () => {
    const store = demoStore();
    store.actions.openWarnings();
    expect(store.report.value).toMatchObject({ mode: 'warnings', source: { kind: 'sample' } });
    expect(store.report.value?.warnings).toHaveLength(2);
    expect(store.report.value?.errors).toEqual([]);
    store.actions.closeReport();
    expect(store.report.value).toBeNull();
  });

  it('opens a known Channel and closes on an unknown one or null', () => {
    const store = demoStore();
    store.actions.openChannel('orders.placed');
    expect(store.channelCard.value).toBe('orders.placed');
    store.actions.openChannel('no.such.channel');
    expect(store.channelCard.value).toBeNull();
    store.actions.openChannel('orders.placed');
    store.actions.openChannel(null);
    expect(store.channelCard.value).toBeNull();
  });

  it('never sets a Center from a Channel', () => {
    const store = demoStore();
    store.actions.openChannel('orders.placed');
    expect(store.center.value).toBeNull();
  });

  it('toggles the Applications-only filter', () => {
    const store = demoStore();
    store.actions.filterApplicationsOnly(true);
    expect(store.applicationsOnly.value).toBe(true);
    expect(store.derived.ranked.value.applicationsOnly).toBe(true);
  });
});

describe('createStore accepts a validated Catalog straight from validateCatalog', () => {
  it('builds the Graph from the catalog module type without a cast', () => {
    const { catalog } = validatedSample('catalog.example.json');
    const store = createStore({ catalog });
    expect(store.graph.value.applications.size).toBe(9);
    expect(store.warnings.value).toEqual([]);
    expect(validateCatalog(catalog).errors).toEqual([]);
  });
});
