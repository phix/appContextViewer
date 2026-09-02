import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { catalogOf, readSampleCatalog } from './fixtures.test-helper';
import { buildGraph, type CatalogInput } from './index';

// Row counts and the named records come from samples/README.md and `node samples/check.mjs`.
const demo = buildGraph(demoCatalog);

describe('buildGraph: the normalized model', () => {
  it('indexes Applications, Externals, Channels and Teams by id', () => {
    expect(demo.applications.size).toBe(34);
    expect(demo.externals.size).toBe(19);
    expect(demo.channels.size).toBe(11);
    expect(demo.teams.size).toBe(9);
  });

  it('derives an Application id from repository and project, splitting at the last slash', () => {
    const gateway = demo.applications.get('acme/platform-core/api-gateway');
    expect(gateway?.repository).toBe('acme/platform-core');
    expect(gateway?.project).toBe('api-gateway');
    const monolith = demo.applications.get('legacy-monolith/monolith');
    expect(monolith?.repository).toBe('legacy-monolith');
    expect(monolith?.kind).toBeUndefined();
    expect(monolith?.team).toBeUndefined();
  });

  it('resolves Dependencies to typed refs and derives Dependents in Catalog order', () => {
    const product = demo.applications.get('acme/commerce/product-service');
    expect(product?.dependencies).toEqual([
      { kind: 'external', id: 'postgres-commerce' },
      { kind: 'external', id: 's3-assets' },
    ]);
    expect(product?.dependents).toEqual([
      'acme/platform-core/api-gateway',
      'acme/commerce/pricing-service',
      'acme/commerce/cart-service',
      'acme/data/ml-recommender',
      'acme/search/search-indexer',
    ]);
  });

  it('gives Externals their Dependents', () => {
    expect(demo.externals.get('redis')?.dependents).toHaveLength(10);
    expect(demo.externals.get('rabbitmq')?.dependents).toEqual(['acme/commerce/checkout-worker']);
    expect(demo.externals.get('postgres-main')?.name).toBe('Postgres (main cluster)');
  });

  it('creates Channels implicitly with their publishers and subscribers', () => {
    expect(demo.channels.get('orders.shipped')).toEqual({
      name: 'orders.shipped',
      publishers: [],
      subscribers: ['acme/platform-core/notification-service', 'acme/commerce/inventory-service'],
    });
    expect(demo.channels.get('sessions.created')).toEqual({
      name: 'sessions.created',
      publishers: ['acme/platform-core/auth-service'],
      subscribers: ['acme/data/events-pipeline'],
    });
  });

  it('creates Teams implicitly, across Repositories', () => {
    expect(demo.teams.get('growth')?.applications).toEqual([
      'acme/platform-core/notification-service',
      'acme/commerce/promotions',
    ]);
    const owned = [...demo.teams.values()].reduce((n, team) => n + team.applications.length, 0);
    expect(owned).toBe(34 - 4);
  });

  it('keeps every Attribute, scalar or not, and defaults the sparse record', () => {
    const gateway = demo.applications.get('acme/platform-core/api-gateway');
    expect(gateway?.attributes.links).toEqual({
      dashboard: 'https://grafana.example.com/d/gateway',
      runbook: 'https://runbooks.example.com/gateway',
    });
    const docSite = demo.applications.get('acme/tools/doc-site');
    expect(docSite).toMatchObject({
      attributes: {},
      dependencies: [],
      dependents: [],
      publishes: [],
      subscribes: [],
    });
  });
});

describe('buildGraph: immutability', () => {
  it('freezes the Graph, every record and every adjacency list', () => {
    const product = demo.applications.get('acme/commerce/product-service');
    expect(Object.isFrozen(demo)).toBe(true);
    expect(Object.isFrozen(product)).toBe(true);
    expect(Object.isFrozen(product?.dependents)).toBe(true);
    expect(Object.isFrozen(product?.dependencies)).toBe(true);
    expect(Object.isFrozen(product?.attributes)).toBe(true);
    expect(Object.isFrozen(demo.externals.get('redis'))).toBe(true);
    expect(Object.isFrozen(demo.channels.get('orders.placed'))).toBe(true);
    expect(Object.isFrozen(demo.teams.get('platform'))).toBe(true);
    // ESM code is strict, so a write to a frozen array throws instead of failing silently.
    const dependents = product?.dependents as string[];
    expect(() => dependents.push('x/y')).toThrow(TypeError);
  });

  it('freezes nested Attribute values too, all the way down', () => {
    const links = demo.applications.get('acme/platform-core/api-gateway')?.attributes
      .links as Record<string, unknown>;
    expect(Object.isFrozen(links)).toBe(true);
    expect(() => {
      links.__probe = 1;
    }).toThrow(TypeError);
    expect(links.__probe).toBeUndefined();

    const tags = demo.applications.get('legacy-monolith/monolith')?.attributes.tags as string[];
    expect(Object.isFrozen(tags)).toBe(true);
    expect(() => tags.push('probe')).toThrow(TypeError);
    expect(tags).toEqual(['strangler', 'php']);
  });

  it('deep-copies Attributes rather than freezing or sharing the caller’s Catalog', () => {
    const links = { dashboard: 'https://grafana.example.com/d/p', nested: { level: 2 } };
    const attributes = { tier: 1, links, tags: ['a'] };
    const catalog = catalogOf([{ repository: 'r', project: 'p', attributes }]);
    const graph = buildGraph(catalog);
    const copied = graph.applications.get('r/p')?.attributes;
    expect(copied).toEqual(attributes);
    const copiedLinks = copied?.links as { nested: { level: number } };
    expect(copiedLinks).not.toBe(links);
    expect(Object.isFrozen(copiedLinks)).toBe(true);
    expect(Object.isFrozen(copiedLinks.nested)).toBe(true);
    expect(Object.isFrozen(attributes)).toBe(false);
    expect(Object.isFrozen(links)).toBe(false);
    // A write through the caller's object never reaches the Graph.
    links.nested.level = 3;
    expect(copiedLinks.nested.level).toBe(2);
  });
});

describe('buildGraph: preconditions of a validated Catalog', () => {
  it('rejects a duplicate Application id', () => {
    const catalog = catalogOf([
      { repository: 'r', project: 'p' },
      { repository: 'r', project: 'p' },
    ]);
    expect(() => buildGraph(catalog)).toThrow(/r\/p/);
  });

  it('rejects a duplicate External id', () => {
    const catalog = catalogOf(
      [],
      [
        { id: 'db', kind: 'database' },
        { id: 'db', kind: 'cache' },
      ],
    );
    expect(() => buildGraph(catalog)).toThrow(/db/);
  });

  it('rejects an unresolved Application or External ref', () => {
    expect(() =>
      buildGraph(catalogOf([{ repository: 'r', project: 'p', dependsOn: ['r/missing'] }])),
    ).toThrow(/r\/missing/);
    expect(() =>
      buildGraph(catalogOf([{ repository: 'r', project: 'p', dependsOn: ['external:missing'] }])),
    ).toThrow(/external:missing/);
  });

  it('rejects a self Dependency', () => {
    expect(() =>
      buildGraph(catalogOf([{ repository: 'r', project: 'p', dependsOn: ['r/p'] }])),
    ).toThrow(/r\/p/);
  });

  it('keeps the first of duplicated entries, as the validator’s W_DUPLICATE_ENTRY downgrade does', () => {
    const graph = buildGraph(
      catalogOf([
        { repository: 'r', project: 'a', dependsOn: ['r/b', 'r/b'], publishes: ['c', 'c'] },
        { repository: 'r', project: 'b', subscribes: ['c', 'c'] },
      ]),
    );
    expect(graph.applications.get('r/a')?.dependencies).toEqual([
      { kind: 'application', id: 'r/b' },
    ]);
    expect(graph.applications.get('r/b')?.dependents).toEqual(['r/a']);
    expect(graph.channels.get('c')).toEqual({
      name: 'c',
      publishers: ['r/a'],
      subscribers: ['r/b'],
    });
  });
});

describe('buildGraph: the input is structural (assumed interface with the catalog module, #20)', () => {
  // `CatalogInput` mirrors schema v1 so the catalog slice's `Catalog` satisfies it by structure. Both
  // shapes a caller has today are pinned: the imported sample (typed by TypeScript from the JSON) and
  // a document parsed with `JSON.parse`. If the catalog module's `Catalog` ever needs a different
  // shape, this is the test that names the seam.
  it('accepts the imported sample Catalog and a JSON.parse’d one alike', () => {
    const parsed: CatalogInput = readSampleCatalog('catalog.demo.json');
    const fromParsed = buildGraph(parsed);
    expect([...fromParsed.applications.keys()]).toEqual([...demo.applications.keys()]);
    expect([...fromParsed.externals.keys()]).toEqual([...demo.externals.keys()]);
  });

  it('treats externals as optional, as schema v1 does', () => {
    const graph = buildGraph({ applications: [{ repository: 'r', project: 'p' }] });
    expect(graph.externals.size).toBe(0);
    expect(graph.applications.get('r/p')?.id).toBe('r/p');
  });

  it('loads the 1,000-Application fixture with the counts samples/README.md lists', () => {
    const graph = buildGraph(readSampleCatalog('catalog-1000.json'));
    expect(graph.applications.size).toBe(1000);
    expect(graph.externals.size).toBe(25);
    expect(graph.channels.size).toBe(100);
    expect(graph.teams.size).toBe(74);
    const dependencies = [...graph.applications.values()].reduce(
      (n, app) => n + app.dependencies.length,
      0,
    );
    expect(dependencies).toBe(5395);
  });
});
