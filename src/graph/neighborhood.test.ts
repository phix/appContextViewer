import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { catalogOf, readSampleCatalog } from './fixtures.test-helper';
import {
  buildGraph,
  type Neighborhood,
  neighborhood,
  PANE_CAP,
  PANE_DEPENDENCY_CAP,
  paneNeighborhood,
} from './index';

const demo = buildGraph(demoCatalog);
const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));

const ids = (members: readonly { id: string }[]) => members.map((member) => member.id);
const nodeCount = (n: Neighborhood) => n.applications.length + n.externals.length;

describe('neighborhood: Applications, Externals and Channels within a Depth of the Center', () => {
  it('holds the Center alone at Depth 0', () => {
    const n = neighborhood(demo, 'ATT-IDP4/commerce/product-service', {
      depth: 0,
      direction: 'both',
    });
    expect(n.applications).toEqual([{ id: 'ATT-IDP4/commerce/product-service', depth: 0 }]);
    expect(n.externals).toEqual([]);
    expect(n.channels).toEqual([]);
    expect(n.dependencies).toEqual([]);
    expect(n.flows).toEqual([]);
    expect(n.center).toEqual({ kind: 'application', id: 'ATT-IDP4/commerce/product-service' });
  });

  it('follows Dependents only in the dependents direction', () => {
    const n = neighborhood(demo, 'ATT-IDP4/commerce/product-service', {
      depth: 1,
      direction: 'dependents',
    });
    expect(ids(n.applications)).toEqual([
      'ATT-IDP4/commerce/product-service',
      'ATT-IDP5/platform-core/api-gateway',
      'ATT-IDP4/commerce/pricing-service',
      'ATT-IDP4/commerce/cart-service',
      'ATT-IDP5/data/ml-recommender',
      'ATT-IDP5/search/search-indexer',
    ]);
    expect(n.applications.map((member) => member.depth)).toEqual([0, 1, 1, 1, 1, 1]);
    expect(n.externals).toEqual([]);
    // Every Dependency among the shown nodes is an edge, spokes and cross edges alike.
    expect(n.dependencies).toHaveLength(7);
    expect(n.dependencies).toContainEqual({
      from: 'ATT-IDP5/platform-core/api-gateway',
      to: { kind: 'application', id: 'ATT-IDP4/commerce/cart-service' },
    });
    for (const edge of n.dependencies) {
      expect(ids(n.applications)).toContain(edge.from);
      expect(edge.to.kind).toBe('application');
      expect(ids(n.applications)).toContain(edge.to.id);
    }
  });

  it('follows Dependencies only in the dependencies direction, with Externals as nodes', () => {
    const n = neighborhood(demo, 'ATT-IDP4/commerce/product-service', {
      depth: 1,
      direction: 'dependencies',
    });
    expect(ids(n.applications)).toEqual(['ATT-IDP4/commerce/product-service']);
    expect(n.externals).toEqual([
      { id: 'postgres-commerce', depth: 1 },
      { id: 's3-assets', depth: 1 },
    ]);
    expect(n.dependencies).toEqual([
      {
        from: 'ATT-IDP4/commerce/product-service',
        to: { kind: 'external', id: 'postgres-commerce' },
      },
      { from: 'ATT-IDP4/commerce/product-service', to: { kind: 'external', id: 's3-assets' } },
    ]);
  });

  it('follows both directions hop by hop, but never expands an External it reaches', () => {
    const n = neighborhood(demo, 'ATT-IDP4/commerce/promotions', { depth: 2, direction: 'both' });
    expect(n.applications).toEqual([
      { id: 'ATT-IDP4/commerce/promotions', depth: 0 },
      { id: 'ATT-IDP4/commerce/pricing-service', depth: 1 },
      { id: 'ATT-IDP4/commerce/product-service', depth: 2 },
      { id: 'ATT-IDP5/platform-infra/feature-flags', depth: 2 },
      { id: 'ATT-IDP4/commerce/cart-service', depth: 2 },
      { id: 'ATT-IDP4/commerce/order-service', depth: 2 },
    ]);
    expect(n.externals).toEqual([{ id: 'redis', depth: 1 }]);
    // redis has ten Dependents; the other nine are siblings, not neighbours, so they stay out.
    expect(ids(n.applications)).not.toContain('ATT-IDP5/platform-core/api-gateway');
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
    const n = neighborhood(demo, 'ATT-IDP4/commerce/product-service', {
      depth: 1,
      direction: 'dependents',
    });
    expect(n.channels).toEqual([{ id: 'products.changed', depth: 1 }]);
    expect(n.flows).toEqual([
      {
        application: 'ATT-IDP4/commerce/product-service',
        channel: 'products.changed',
        direction: 'publishes',
      },
      {
        application: 'ATT-IDP5/search/search-indexer',
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
    const n = neighborhood(demo, 'ATT-IDP5/data/events-pipeline', { depth: 1, direction: 'both' });
    expect(n.channels).toHaveLength(9);
    expect(n.flows).toHaveLength(9);
    expect(n.dependencies).toHaveLength(4);
    expect(ids(n.applications)).toEqual([
      'ATT-IDP5/data/events-pipeline',
      'ATT-IDP5/data/warehouse-loader',
    ]);
    expect(ids(n.externals)).toEqual(['kafka', 's3-events']);
  });

  it('runs to exhaustion when the Depth is unbounded', () => {
    const n = neighborhood(demo, 'ATT-IDP4/mobile/ios-app', {
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
    const pane = paneNeighborhood(demo, 'ATT-IDP4/commerce/product-service', 2);
    const full = neighborhood(demo, 'ATT-IDP4/commerce/product-service', {
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

  it('falls back to Depth 1 of 2 for billing/auth-service and counts the hidden nodes', () => {
    const pane = paneNeighborhood(thousand, 'billing/auth-service', 2);
    const depth1 = neighborhood(thousand, 'billing/auth-service', {
      depth: 1,
      direction: 'both',
    });
    const depth2 = neighborhood(thousand, 'billing/auth-service', {
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
    // Split by kind, because the Overview the notice points at never draws Externals.
    expect(pane.hiddenApplications).toBe(depth2.applications.length - depth1.applications.length);
    expect(pane.hiddenExternals).toBe(depth2.externals.length - depth1.externals.length);
    expect(pane.hiddenApplications + pane.hiddenExternals).toBe(pane.hidden);
    expect(pane).toMatchObject({ hidden: 516, hiddenApplications: 497, hiddenExternals: 19 });
  });

  it('draws sendgrid alone when its 151 Dependents exceed the cap at Depth 1', () => {
    const pane = paneNeighborhood(thousand, 'sendgrid', 1);
    expect(pane.depthShown).toBe(0);
    expect(pane.hidden).toBe(151);
    expect(pane.hiddenApplications).toBe(151);
    expect(pane.hiddenExternals).toBe(0);
    expect(pane.applications).toEqual([]);
    expect(pane.externals).toEqual([{ id: 'sendgrid', depth: 0 }]);
    expect(pane.dependencies).toEqual([]);

    const deeper = paneNeighborhood(thousand, 'sendgrid', 2);
    const full = neighborhood(thousand, 'sendgrid', { depth: 2, direction: 'both' });
    expect(deeper.depthShown).toBe(0);
    expect(deeper.hidden).toBe(nodeCount(full) - 1);
  });

  it('honours a caller-supplied cap', () => {
    const pane = paneNeighborhood(demo, 'redis', 1, 5);
    expect(pane.depthShown).toBe(0);
    expect(pane.hidden).toBe(10);
    expect(paneNeighborhood(demo, 'redis', 1, 11).depthShown).toBe(1);
  });

  it('never exceeds the node cap for any Application or External at 1,000 Applications', () => {
    const centers = [
      ...[...thousand.applications.keys()].map((id) => ({ kind: 'application' as const, id })),
      ...[...thousand.externals.keys()].map((id) => ({ kind: 'external' as const, id })),
    ];
    expect(centers).toHaveLength(1025);
    let fallbacks = 0;
    for (const center of centers) {
      for (const depth of [2, 3]) {
        const pane = paneNeighborhood(thousand, center, depth);
        expect(nodeCount(pane), `${center.id} at Depth ${depth}`).toBeLessThanOrEqual(PANE_CAP);
        expect(pane.depthShown).toBeLessThanOrEqual(depth);
        // The Dependency cap is a drawing style, not a node budget: it may be exceeded freely, and
        // when it is, the Groups go instead of the Depth.
        expect(pane.groupsDrawn, `${center.id} at Depth ${depth}`).toBe(
          pane.dependencies.length <= PANE_DEPENDENCY_CAP,
        );
        if (depth === 2 && pane.depthShown < depth) fallbacks++;
      }
    }
    // docs/performance-budgets.md, "Pane cap": "At 1,000 Applications roughly 45% of Depth-2
    // Neighborhoods fall back to Depth 1 this way". That figure is the node cap's alone -- it was
    // 60.6% while the Dependency cap was wrongly binding the Depth, which is what gave this band
    // away. Measured here: 450 / 1,025 = 43.9%.
    expect(fallbacks / centers.length).toBeGreaterThan(0.35);
    expect(fallbacks / centers.length).toBeLessThan(0.55);
  });

  // docs/performance-budgets.md, "Pane cap": "above the Dependency figure it drops the Group boxes
  // and lays the Neighborhood out flat". Dropping a Depth instead is the defect this pins shut.
  it('draws a Depth-2 Neighborhood that fits the node cap flat, not shallower, above the Dependency cap', () => {
    const centers = [
      ...[...thousand.applications.keys()].map((id) => ({ kind: 'application' as const, id })),
      ...[...thousand.externals.keys()].map((id) => ({ kind: 'external' as const, id })),
    ];
    const dense = centers.filter((candidate) => {
      const full = neighborhood(thousand, candidate, { depth: 2, direction: 'both' });
      return nodeCount(full) <= PANE_CAP && full.dependencies.length > PANE_DEPENDENCY_CAP;
    });
    // 154 Centers of the fixture are in exactly this position (151 Applications and 3 Externals);
    // every one is drawn at Depth 2. Under the defect they all fell to a shallower Depth, which is
    // what took the Depth-2 fallback rate from the doc's roughly-45% figure toward 60%.
    expect(dense).toHaveLength(154);
    for (const center of dense) {
      const pane = paneNeighborhood(thousand, center, 2);
      expect(pane.depthShown, center.id).toBe(2);
      expect(pane.groupsDrawn, center.id).toBe(false);
      expect(pane.hidden, center.id).toBe(0);
      expect(pane.dependencies.length, center.id).toBeGreaterThan(PANE_DEPENDENCY_CAP);
    }

    // One of them, named, so the case survives a change in the fixture's iteration order.
    const pinned = paneNeighborhood(thousand, 'ATT-IDP1/assurance/kpi', 2);
    expect(pinned.depthShown).toBe(2);
    expect(pinned.groupsDrawn).toBe(false);
  });

  it('keeps the Groups whenever the drawn Neighborhood is at or under the Dependency cap', () => {
    // ATT-IDP2/auth-core/audit-service falls back on the NODE cap (its Depth-2 reach is 616
    // nodes), and what is left -- 83 nodes, 334 Dependencies -- is under the Dependency cap, so it
    // keeps them.
    const pane = paneNeighborhood(thousand, 'ATT-IDP2/auth-core/audit-service', 2);
    expect(pane.depthShown).toBe(1);
    expect(nodeCount(pane)).toBe(83);
    expect(pane.dependencies).toHaveLength(334);
    expect(pane.groupsDrawn).toBe(true);
  });

  // ---------------------------------------------------------------- the caps, falsifiably
  //
  // Every other test in this file reads a cap through the constant that sets it, so both constants
  // were free to move: PANE_DEPENDENCY_CAP at 320/348/380/420/460 and PANE_CAP at 130/140/200/250
  // and even 400 all left the suite green. These four graphs are built to sit ON the caps with
  // literal counts, so moving either constant by one step flips a drawn/not-drawn outcome and the
  // suite goes red. Do not rewrite the literals below in terms of the constants.

  /**
   * A star: one Center plus `spokes` Applications it depends on, and `cross` extra Dependencies
   * among the spokes. Nodes = spokes + 1, Dependencies = spokes + cross, and the two are
   * independent, which is what lets each cap be cornered on its own.
   */
  function star(spokes: number, cross = 0) {
    const name = (i: number) => `spoke-${i}`;
    const applications = [
      {
        repository: 'r',
        project: 'center',
        dependsOn: Array.from({ length: spokes }, (_, i) => `r/${name(i)}`),
      },
      ...Array.from({ length: spokes }, (_, i) => {
        const dependsOn: string[] = [];
        // Spread the cross edges over distinct ordered pairs, skipping self and the Center.
        for (let step = 1; dependsOn.length < Math.ceil(cross / spokes) && step < spokes; step++) {
          dependsOn.push(`r/${name((i + step) % spokes)}`);
        }
        return { repository: 'r', project: name(i), dependsOn };
      }),
    ];
    // Trim the cross edges to exactly `cross`.
    let budget = cross;
    for (let i = 1; i < applications.length; i++) {
      const app = applications[i] as { dependsOn: string[] };
      const keep = Math.min(app.dependsOn.length, budget);
      app.dependsOn = app.dependsOn.slice(0, keep);
      budget -= keep;
    }
    expect(budget, 'the star must place every cross edge').toBe(0);
    return buildGraph(catalogOf(applications));
  }

  it('places exactly the node and Dependency counts its cap cases need', () => {
    // The generator itself, so a silent miscount cannot make the four cap tests below vacuous.
    const at150 = paneNeighborhood(star(149), 'r/center', 1);
    expect(nodeCount(at150)).toBe(150);
    expect(at150.dependencies).toHaveLength(149);

    const dense = paneNeighborhood(star(100, 250), 'r/center', 1);
    expect(nodeCount(dense)).toBe(101);
    expect(dense.dependencies).toHaveLength(350);
  });

  it('draws Depth 1 at exactly 150 nodes and falls back at 151', () => {
    // Falsifies PANE_CAP downward: at 149 or less, the 150-node graph would fall back to 0.
    const fits = paneNeighborhood(star(149), 'r/center', 1);
    expect(nodeCount(fits)).toBe(150);
    expect(fits.depthShown).toBe(1);
    expect(fits.hidden).toBe(0);

    // Falsifies PANE_CAP upward: at 151 or more, the 151-node graph would be drawn whole.
    const overflows = paneNeighborhood(star(150), 'r/center', 1);
    expect(overflows.depthShown).toBe(0);
    expect(overflows.hidden).toBe(150);
    expect(nodeCount(overflows)).toBe(1);
  });

  it('keeps the Groups at exactly 350 Dependencies and drops them at 351', () => {
    // Both graphs are 101 nodes, far inside the node cap, so only the Dependency cap can decide.
    const atCap = paneNeighborhood(star(100, 250), 'r/center', 1);
    expect(atCap.dependencies).toHaveLength(350);
    expect(atCap.depthShown).toBe(1);
    // Falsifies PANE_DEPENDENCY_CAP downward: at 349 or less this would be flat.
    expect(atCap.groupsDrawn).toBe(true);

    const overCap = paneNeighborhood(star(100, 251), 'r/center', 1);
    expect(overCap.dependencies).toHaveLength(351);
    // The one Dependency over the cap costs the Groups and NOT the Depth.
    expect(overCap.depthShown).toBe(1);
    expect(nodeCount(overCap)).toBe(101);
    // Falsifies PANE_DEPENDENCY_CAP upward: at 351 or more this would keep its Groups.
    expect(overCap.groupsDrawn).toBe(false);
  });

  it('keeps hidden plus shown equal to the full Neighborhood', () => {
    for (const id of ['ATT-IDP2/auth-core/audit-service', 'billing/auth-service']) {
      const pane = paneNeighborhood(thousand, id, 3);
      const full = neighborhood(thousand, id, { depth: 3, direction: 'both' });
      expect(nodeCount(pane) + pane.hidden).toBe(nodeCount(full));
    }
  });

  it('shows the asked Depth, unbounded included, whenever everything fits', () => {
    // A leaf: doc-site has no Dependencies and no Dependents, so nothing lies beyond Depth 0.
    const leaf = paneNeighborhood(demo, 'ATT-IDP5/tools/doc-site', 2);
    expect(leaf.depthShown).toBe(2);
    expect(leaf).toMatchObject({ hidden: 0, hiddenApplications: 0, hiddenExternals: 0 });
    expect(nodeCount(leaf)).toBe(1);

    const whole = paneNeighborhood(demo, 'ATT-IDP4/mobile/ios-app', Number.POSITIVE_INFINITY);
    expect(whole.depthShown).toBe(Number.POSITIVE_INFINITY);
    expect(whole.hidden).toBe(0);
    expect(nodeCount(whole)).toBeGreaterThan(30);
  });

  it('settles on a finite Depth when the asked Depth is unbounded and the reach exceeds the cap', () => {
    const pane = paneNeighborhood(thousand, 'billing/auth-service', Number.POSITIVE_INFINITY);
    expect(pane.depthShown).toBe(1);
    expect(nodeCount(pane)).toBeLessThanOrEqual(PANE_CAP);
    expect(pane.hidden).toBeGreaterThan(500);
  });
});
