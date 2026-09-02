import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { buildGraph, type Neighborhood, neighborhood, PANE_CAP, paneNeighborhood } from './index';
import { readSampleCatalog } from './test-fixtures';

const demo = buildGraph(demoCatalog);
const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));

const ids = (members: readonly { id: string }[]) => members.map((member) => member.id);
const nodeCount = (n: Neighborhood) => n.applications.length + n.externals.length;

describe('neighborhood: Applications, Externals and Channels within a Depth of the Center', () => {
  it('holds the Center alone at Depth 0', () => {
    const n = neighborhood(demo, 'acme/commerce/product-service', { depth: 0, direction: 'both' });
    expect(n.applications).toEqual([{ id: 'acme/commerce/product-service', depth: 0 }]);
    expect(n.externals).toEqual([]);
    expect(n.channels).toEqual([]);
    expect(n.dependencies).toEqual([]);
    expect(n.flows).toEqual([]);
    expect(n.center).toEqual({ kind: 'application', id: 'acme/commerce/product-service' });
  });

  it('follows Dependents only in the dependents direction', () => {
    const n = neighborhood(demo, 'acme/commerce/product-service', {
      depth: 1,
      direction: 'dependents',
    });
    expect(ids(n.applications)).toEqual([
      'acme/commerce/product-service',
      'acme/platform-core/api-gateway',
      'acme/commerce/pricing-service',
      'acme/commerce/cart-service',
      'acme/data/ml-recommender',
      'acme/search/search-indexer',
    ]);
    expect(n.applications.map((member) => member.depth)).toEqual([0, 1, 1, 1, 1, 1]);
    expect(n.externals).toEqual([]);
    // Every Dependency among the shown nodes is an edge, spokes and cross edges alike.
    expect(n.dependencies).toHaveLength(7);
    expect(n.dependencies).toContainEqual({
      from: 'acme/platform-core/api-gateway',
      to: { kind: 'application', id: 'acme/commerce/cart-service' },
    });
    for (const edge of n.dependencies) {
      expect(ids(n.applications)).toContain(edge.from);
      expect(edge.to.kind).toBe('application');
      expect(ids(n.applications)).toContain(edge.to.id);
    }
  });

  it('follows Dependencies only in the dependencies direction, with Externals as nodes', () => {
    const n = neighborhood(demo, 'acme/commerce/product-service', {
      depth: 1,
      direction: 'dependencies',
    });
    expect(ids(n.applications)).toEqual(['acme/commerce/product-service']);
    expect(n.externals).toEqual([
      { id: 'postgres-commerce', depth: 1 },
      { id: 's3-assets', depth: 1 },
    ]);
    expect(n.dependencies).toEqual([
      { from: 'acme/commerce/product-service', to: { kind: 'external', id: 'postgres-commerce' } },
      { from: 'acme/commerce/product-service', to: { kind: 'external', id: 's3-assets' } },
    ]);
  });

  it('follows both directions hop by hop, but never expands an External it reaches', () => {
    const n = neighborhood(demo, 'acme/commerce/promotions', { depth: 2, direction: 'both' });
    expect(n.applications).toEqual([
      { id: 'acme/commerce/promotions', depth: 0 },
      { id: 'acme/commerce/pricing-service', depth: 1 },
      { id: 'acme/commerce/product-service', depth: 2 },
      { id: 'acme/platform-infra/feature-flags', depth: 2 },
      { id: 'acme/commerce/cart-service', depth: 2 },
      { id: 'acme/commerce/order-service', depth: 2 },
    ]);
    expect(n.externals).toEqual([{ id: 'redis', depth: 1 }]);
    // redis has ten Dependents; the other nine are siblings, not neighbours, so they stay out.
    expect(ids(n.applications)).not.toContain('acme/platform-core/api-gateway');
  });

  it('gives an External Center its Dependents at Depth 1 and nothing on the Dependencies side', () => {
    const both = neighborhood(demo, 'redis', { depth: 1, direction: 'both' });
    expect(both.center).toEqual({ kind: 'external', id: 'redis' });
    expect(both.externals).toEqual([{ id: 'redis', depth: 0 }]);
    expect(both.applications).toHaveLength(10);
    expect(both.applications.every((member) => member.depth === 1)).toBe(true);
    expect(both.dependencies.filter((edge) => edge.to.id === 'redis')).toHaveLength(10);

    const needs = neighborhood(demo, 'redis', { depth: 3, direction: 'dependencies' });
    expect(needs.applications).toEqual([]);
    expect(needs.externals).toEqual([{ id: 'redis', depth: 0 }]);
  });

  it('attaches Channels one Flow away from an included Application, without traversing them', () => {
    const n = neighborhood(demo, 'acme/commerce/product-service', {
      depth: 1,
      direction: 'dependents',
    });
    expect(n.channels).toEqual([{ id: 'products.changed', depth: 1 }]);
    expect(n.flows).toEqual([
      {
        application: 'acme/commerce/product-service',
        channel: 'products.changed',
        direction: 'publishes',
      },
      {
        application: 'acme/search/search-indexer',
        channel: 'products.changed',
        direction: 'subscribes',
      },
    ]);
    // pricing-service also publishes prices.changed, but it sits at the asked Depth, so its Channels
    // would lie one hop beyond it.
    expect(ids(n.channels)).not.toContain('prices.changed');
  });

  it('never lets a Flow into the Dependency edges', () => {
    // events-pipeline subscribes to nine Channels and has two External Dependencies and one
    // Dependent, warehouse-loader, which also depends on one of those Externals: four edges.
    const n = neighborhood(demo, 'acme/data/events-pipeline', { depth: 1, direction: 'both' });
    expect(n.channels).toHaveLength(9);
    expect(n.flows).toHaveLength(9);
    expect(n.dependencies).toHaveLength(4);
    expect(ids(n.applications)).toEqual([
      'acme/data/events-pipeline',
      'acme/data/warehouse-loader',
    ]);
    expect(ids(n.externals)).toEqual(['kafka', 's3-events']);
  });

  it('runs to exhaustion when the Depth is unbounded', () => {
    const n = neighborhood(demo, 'acme/mobile/ios-app', {
      depth: Number.POSITIVE_INFINITY,
      direction: 'dependencies',
    });
    expect(n.applications.length).toBeGreaterThan(10);
    // ios-app -> api-gateway -> auth-service -> config-service -> secrets-broker -> vault.
    expect(n.externals).toContainEqual({ id: 'vault', depth: 5 });
    expect(Math.max(...[...n.applications, ...n.externals].map((member) => member.depth))).toBe(5);
  });

  it('rejects a Center that is not in the Graph', () => {
    expect(() => neighborhood(demo, 'nowhere', { depth: 1, direction: 'both' })).toThrow(/nowhere/);
  });
});

describe('paneNeighborhood: the 150-node cap and its Depth fallback', () => {
  it('draws the asked Depth when it fits', () => {
    const pane = paneNeighborhood(demo, 'acme/commerce/product-service', 2);
    const full = neighborhood(demo, 'acme/commerce/product-service', {
      depth: 2,
      direction: 'both',
    });
    expect(pane.depthShown).toBe(2);
    expect(pane.hidden).toBe(0);
    expect(pane.applications).toEqual(full.applications);
    expect(pane.externals).toEqual(full.externals);
    expect(pane.dependencies).toEqual(full.dependencies);
    expect(pane.depth).toBe(2);
    expect(pane.direction).toBe('both');
  });

  it('falls back to Depth 1 of 2 for acme/billing-platform/auth-service and counts the hidden nodes', () => {
    const pane = paneNeighborhood(thousand, 'acme/billing-platform/auth-service', 2);
    const depth1 = neighborhood(thousand, 'acme/billing-platform/auth-service', {
      depth: 1,
      direction: 'both',
    });
    const depth2 = neighborhood(thousand, 'acme/billing-platform/auth-service', {
      depth: 2,
      direction: 'both',
    });
    expect(nodeCount(depth2)).toBeGreaterThan(PANE_CAP);
    expect(pane.depthShown).toBe(1);
    expect(nodeCount(pane)).toBe(nodeCount(depth1));
    expect(nodeCount(pane)).toBeLessThanOrEqual(PANE_CAP);
    expect(pane.hidden).toBe(nodeCount(depth2) - nodeCount(depth1));
    expect(pane.hidden).toBeGreaterThan(0);
    expect(ids(pane.applications)).toEqual(ids(depth1.applications));
  });

  it('draws mysql-legacy alone when its 197 Dependents exceed the cap at Depth 1', () => {
    const pane = paneNeighborhood(thousand, 'mysql-legacy', 1);
    expect(pane.depthShown).toBe(0);
    expect(pane.hidden).toBe(197);
    expect(pane.applications).toEqual([]);
    expect(pane.externals).toEqual([{ id: 'mysql-legacy', depth: 0 }]);
    expect(pane.dependencies).toEqual([]);

    const deeper = paneNeighborhood(thousand, 'mysql-legacy', 2);
    const full = neighborhood(thousand, 'mysql-legacy', { depth: 2, direction: 'both' });
    expect(deeper.depthShown).toBe(0);
    expect(deeper.hidden).toBe(nodeCount(full) - 1);
  });

  it('honours a caller-supplied cap', () => {
    const pane = paneNeighborhood(demo, 'redis', 1, 5);
    expect(pane.depthShown).toBe(0);
    expect(pane.hidden).toBe(10);
    expect(paneNeighborhood(demo, 'redis', 1, 11).depthShown).toBe(1);
  });

  it('never exceeds the cap for any Application or External at 1,000 Applications', () => {
    const centers = [
      ...[...thousand.applications.keys()].map((id) => ({ kind: 'application' as const, id })),
      ...[...thousand.externals.keys()].map((id) => ({ kind: 'external' as const, id })),
    ];
    expect(centers).toHaveLength(1025);
    let fallbacks = 0;
    for (const center of centers) {
      for (const depth of [2, 3]) {
        const pane = paneNeighborhood(thousand, center, depth);
        expect(nodeCount(pane), `${center.id} at Depth ${depth}`).toBeLessThanOrEqual(150);
        expect(pane.depthShown).toBeLessThanOrEqual(depth);
        if (depth === 2 && pane.depthShown < depth) fallbacks++;
      }
    }
    // docs/performance-budgets.md: roughly 45% of Depth-2 Neighborhoods fall back at this size.
    expect(fallbacks / centers.length).toBeGreaterThan(0.35);
    expect(fallbacks / centers.length).toBeLessThan(0.55);
  });

  it('keeps hidden plus shown equal to the full Neighborhood', () => {
    for (const id of ['acme/video/config-service', 'acme/localization-tools/feature-flags']) {
      const pane = paneNeighborhood(thousand, id, 3);
      const full = neighborhood(thousand, id, { depth: 3, direction: 'both' });
      expect(nodeCount(pane) + pane.hidden).toBe(nodeCount(full));
    }
  });

  it('shows the asked Depth, unbounded included, whenever everything fits', () => {
    // A leaf: doc-site has no Dependencies and no Dependents, so nothing lies beyond Depth 0.
    const leaf = paneNeighborhood(demo, 'acme/tools/doc-site', 2);
    expect(leaf.depthShown).toBe(2);
    expect(leaf.hidden).toBe(0);
    expect(nodeCount(leaf)).toBe(1);

    const whole = paneNeighborhood(demo, 'acme/mobile/ios-app', Number.POSITIVE_INFINITY);
    expect(whole.depthShown).toBe(Number.POSITIVE_INFINITY);
    expect(whole.hidden).toBe(0);
    expect(nodeCount(whole)).toBeGreaterThan(30);
  });

  it('settles on a finite Depth when the asked Depth is unbounded and the reach exceeds the cap', () => {
    const pane = paneNeighborhood(
      thousand,
      'acme/billing-platform/auth-service',
      Number.POSITIVE_INFINITY,
    );
    expect(pane.depthShown).toBe(1);
    expect(nodeCount(pane)).toBeLessThanOrEqual(PANE_CAP);
    expect(pane.hidden).toBeGreaterThan(500);
  });
});
