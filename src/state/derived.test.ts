import { describe, expect, it } from 'vitest';
import { blastRadius, paneNeighborhood, rankedByBlastRadius } from '@/graph';
import { demoStore, validatedSample } from './fixtures.test-helper';
import { createStore, EXTERNAL_NEEDS_NOTE, paneNotice } from './index';

const ORDER_SERVICE = { kind: 'application', id: 'acme/commerce/order-service' } as const;
const REDIS = { kind: 'external', id: 'redis' } as const;

describe('ranked: the default screen', () => {
  it('lists both kinds sorted together, with redis first on the demo Catalog', () => {
    const store = demoStore();
    const model = store.derived.ranked.value;
    expect(model.rows).toEqual(rankedByBlastRadius(store.graph.value));
    expect(model.rows[0]).toEqual({ kind: 'external', id: 'redis', size: 23 });
    expect(model.rows).toHaveLength(34 + 19);
    expect(model.applicationsOnly).toBe(false);
    expect(model).toMatchObject({ applications: 34, externals: 19 });
  });

  it('filters to Applications only when the flag is on', () => {
    const store = demoStore();
    store.actions.filterApplicationsOnly(true);
    const model = store.derived.ranked.value;
    expect(model.applicationsOnly).toBe(true);
    expect(model.rows).toHaveLength(34);
    expect(model.rows.every((row) => row.kind === 'application')).toBe(true);
    expect(model.rows[0]).toEqual({
      kind: 'application',
      id: 'acme/commerce/product-service',
      size: 12,
    });
  });
});

describe('board: acme/commerce/order-service on the demo Catalog', () => {
  it('is null without a Center', () => {
    expect(demoStore().derived.board.value).toBeNull();
  });

  it('shows the middle card with the record, Attributes and Flows', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    const board = store.derived.board.value;
    expect(board?.center).toMatchObject({
      kind: 'application',
      id: 'acme/commerce/order-service',
      label: 'order-service',
      repository: 'acme/commerce',
      team: 'commerce',
      recordKind: 'service',
      url: 'https://github.com/acme/commerce/tree/main/order-service',
      publishes: ['orders.placed'],
      subscribes: ['payments.captured'],
    });
    expect(board?.center.attributes).toMatchObject({ language: 'java', tier: 1 });
    expect(board?.depth).toBe(2);
  });

  it('bands Needs by Depth with Repository and Team chips, Externals with a kind chip', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    const needs = store.derived.board.value?.needs;
    expect(needs?.note).toBeNull();
    expect(needs?.bands.map((band) => band.depth)).toEqual([1, 2]);
    const depth1 = needs?.bands[0]?.rows ?? [];
    expect(depth1.map((row) => row.id)).toEqual([
      'acme/commerce/cart-service',
      'acme/commerce/inventory-service',
      'acme/commerce/pricing-service',
      'acme/platform-core/user-service',
      'acme/payments/payment-service',
      'postgres-commerce',
      'kafka',
    ]);
    expect(depth1[0]).toEqual({
      kind: 'application',
      id: 'acme/commerce/cart-service',
      label: 'cart-service',
      repository: 'acme/commerce',
      team: 'commerce',
    });
    expect(depth1[6]).toMatchObject({ kind: 'external', id: 'kafka', externalKind: 'queue' });
    const depth2 = needs?.bands[1]?.rows ?? [];
    expect(depth2.map((row) => row.id)).toEqual([
      'acme/commerce/product-service',
      'acme/platform-infra/feature-flags',
      'acme/payments/ledger-service',
      'acme/payments/fraud-scorer',
      'redis',
      'postgres-main',
      'stripe',
      'postgres-payments',
    ]);
  });

  it('bands Breaks by Depth from the Blast radius with the Teams badge', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    const breaks = store.derived.board.value?.breaks;
    expect(breaks?.bands.map((band) => band.rows.map((row) => row.id))).toEqual([
      ['acme/platform-core/api-gateway', 'acme/commerce/checkout-worker'],
      [
        'acme/web/storefront',
        'acme/web/admin-console',
        'acme/mobile/ios-app',
        'acme/mobile/android-app',
      ],
    ]);
    expect(breaks?.bands[0]?.rows[0]).toMatchObject({
      repository: 'acme/platform-core',
      team: 'platform',
    });
    expect(breaks?.total).toBe(6);
    expect(breaks?.teams).toBe(4);
  });

  it('holds the header Depth in both columns', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    store.actions.setDepth(1);
    let board = store.derived.board.value;
    expect(board?.needs.bands).toHaveLength(1);
    expect(board?.breaks.bands).toHaveLength(1);
    expect(board?.breaks.total).toBe(2);
    store.actions.setDepth(Number.POSITIVE_INFINITY);
    board = store.derived.board.value;
    expect(board?.depth).toBe(Number.POSITIVE_INFINITY);
    expect(board?.breaks.bands.length).toBe(blastRadius(store.graph.value, ORDER_SERVICE).length);
    // Depth all reaches the whole Dependency chain, six hops from a mobile app to a database.
    expect(board?.needs.bands.length).toBeGreaterThanOrEqual(3);
  });
});

describe('board: redis, an External Center (docs/center.md)', () => {
  it('shows the External note in Needs and bands Breaks as usual', () => {
    const store = demoStore();
    store.actions.select(REDIS);
    const board = store.derived.board.value;
    expect(board?.center).toMatchObject({
      kind: 'external',
      id: 'redis',
      label: 'Redis (shared cluster)',
      name: 'Redis (shared cluster)',
      recordKind: 'cache',
      externalKind: 'cache',
      publishes: [],
      subscribes: [],
    });
    expect(board?.needs).toEqual({ bands: [], note: EXTERNAL_NEEDS_NOTE });
    expect(board?.breaks.bands[0]?.rows).toHaveLength(10);
    expect(board?.breaks.bands[0]?.rows.every((row) => row.kind === 'application')).toBe(true);
    expect(board?.breaks.total).toBe(blastRadius(store.graph.value, 'redis', 2).flat().length);
    expect(board?.breaks.teams).toBeGreaterThanOrEqual(5);
  });
});

describe('paneModel', () => {
  it('is null without a Center and mirrors paneNeighborhood with one', () => {
    const store = demoStore();
    expect(store.derived.paneModel.value).toBeNull();
    store.actions.select(ORDER_SERVICE);
    const pane = store.derived.paneModel.value;
    expect(pane).toMatchObject(paneNeighborhood(store.graph.value, ORDER_SERVICE, 2));
    expect(pane?.notice).toBeNull();
    expect(pane?.grouping).toBe('repository');
    expect(pane?.nodes.find((node) => node.id === ORDER_SERVICE.id)).toMatchObject({
      label: 'order-service',
      depth: 0,
      group: 'repository=acme/commerce',
    });
    expect(pane?.groups.find((group) => group.id === 'repository=acme/commerce')).toMatchObject({
      label: 'acme/commerce',
    });
  });

  it('says how many more appear in the Overview when a Depth falls back', () => {
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'application', id: 'acme/billing-platform/auth-service' });
    const pane = store.derived.paneModel.value;
    expect(pane?.depthShown).toBe(1);
    expect(pane?.notice).toBe(
      'Showing Depth 1 of 2; 544 more in the Overview, and 20 Externals not drawn',
    );
  });

  it('draws mysql-legacy alone and points at the Breaks column', () => {
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'external', id: 'mysql-legacy' });
    store.actions.setDepth(1);
    const pane = store.derived.paneModel.value;
    expect(pane?.depthShown).toBe(0);
    expect(pane?.notice).toBe('197 Dependents, more than the pane can draw; see the Breaks column');
  });

  it("drops the Groups, and the nodes' parents, when the pane is drawn flat", () => {
    // docs/performance-budgets.md, "Pane cap": above 350 Dependencies the pane drops the Group
    // boxes and lays out flat. This is the view-model half of that -- `paneNeighborhood` reports
    // `groupsDrawn: false` and the model must carry no Groups and no parents at all, since the
    // ~40% saving comes from dagre not being handed a compound graph.
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'application', id: 'acme/legal-3/export-service' });
    const flat = store.derived.paneModel.value;
    expect(flat?.groupsDrawn).toBe(false);
    expect(flat?.depthShown).toBe(2); // flat, NOT shallower
    expect(flat?.dependencies.length).toBeGreaterThan(350);
    expect(flat?.groups).toEqual([]);
    expect(flat?.nodes.every((node) => node.group === undefined)).toBe(true);
    // The grouping Attribute is unchanged; only the drawing of it is suppressed.
    expect(flat?.grouping).toBe('repository');

    // The same store, a Center under the Dependency cap: Groups and parents are back.
    store.actions.select({ kind: 'application', id: 'acme-labs/data-core/index-android' });
    const grouped = store.derived.paneModel.value;
    expect(grouped?.groupsDrawn).toBe(true);
    expect(grouped?.groups.length).toBeGreaterThan(0);
    expect(grouped?.nodes.some((node) => node.group !== undefined)).toBe(true);
  });

  it('spells the two notices from the budgets doc, all for an unbounded Depth', () => {
    const base = {
      center: ORDER_SERVICE,
      depth: 2,
      direction: 'both' as const,
      applications: [],
      externals: [],
      channels: [],
      dependencies: [],
      flows: [],
      groupsDrawn: true,
    };
    expect(
      paneNotice({
        ...base,
        depthShown: 1,
        hidden: 431,
        hiddenApplications: 431,
        hiddenExternals: 0,
      }),
    ).toBe('Showing Depth 1 of 2; 431 more in the Overview');
    expect(
      paneNotice({
        ...base,
        depth: Number.POSITIVE_INFINITY,
        depthShown: 2,
        hidden: 3,
        hiddenApplications: 2,
        hiddenExternals: 1,
      }),
    ).toBe('Showing Depth 2 of all; 2 more in the Overview, and 1 External not drawn');
    expect(
      paneNotice({
        ...base,
        depthShown: 0,
        hidden: 160,
        hiddenApplications: 150,
        hiddenExternals: 10,
      }),
    ).toBe('160 Dependencies and Dependents, more than the pane can draw; see the Breaks column');
    expect(
      paneNotice({ ...base, depthShown: 2, hidden: 0, hiddenApplications: 0, hiddenExternals: 0 }),
    ).toBeNull();
  });
});

describe('overviewModel', () => {
  it('is collapsed by default with no Groups computed', () => {
    const store = demoStore();
    const model = store.derived.overviewModel.value;
    expect(model).toMatchObject({
      expanded: false,
      attribute: 'repository',
      groups: [],
      edges: [],
      highlighted: [],
      expandAllDisabled: false,
      overviewDisabled: false,
      notice: null,
      applications: 34,
      dependencies: 82,
    });
  });

  it('groups by Repository when expanded, with the open set and Group Dependencies', () => {
    const store = demoStore();
    store.actions.expandOverview(true);
    store.actions.select(ORDER_SERVICE);
    const model = store.derived.overviewModel.value;
    expect(model.groups.map((group) => group.label)).toHaveLength(10);
    expect([...model.open]).toEqual(['repository=acme/commerce']);
    expect(model.highlighted).toEqual(['repository=acme/commerce']);
    expect(model.edges.some((edge) => edge.kind === 'group')).toBe(true);
    expect(model.edges.some((edge) => edge.kind === 'member')).toBe(true);
  });

  it('falls none back to Repository while expanded', () => {
    const store = demoStore();
    store.actions.setGroupBy('none');
    store.actions.expandOverview(true);
    const model = store.derived.overviewModel.value;
    expect(store.groupBy.value).toBe('none');
    expect(model.attribute).toBe('repository');
    expect(model.groups).toHaveLength(10);
  });

  it('groups by an Attribute key with the synthetic Group last', () => {
    const store = demoStore();
    store.actions.setGroupBy('tier');
    store.actions.expandOverview(true);
    const model = store.derived.overviewModel.value;
    expect(model.attribute).toBe('tier');
    expect(model.groups.map((group) => group.label)).toEqual(['1', '2', '3', 'No tier']);
  });

  it('highlights the Groups of an External Center direct Dependents', () => {
    const store = demoStore();
    store.actions.select(REDIS);
    const model = store.derived.overviewModel.value;
    expect(model.highlighted).toEqual([
      'repository=acme/platform-core',
      'repository=acme/platform-infra',
      'repository=acme/commerce',
      'repository=acme/payments',
      'repository=acme/data',
    ]);
    expect(store.openGroups.value.size).toBe(0);
  });
});

describe('warningsCount and channelCardModel', () => {
  it('counts the current Catalog warnings', () => {
    expect(demoStore().derived.warningsCount.value).toBe(2);
    expect(
      createStore({ catalog: validatedSample('catalog.example.json').catalog }).derived
        .warningsCount.value,
    ).toBe(0);
  });

  it('lists publishers and subscribers as rows, and is null when closed', () => {
    const store = demoStore();
    expect(store.derived.channelCardModel.value).toBeNull();
    store.actions.openChannel('orders.placed');
    const card = store.derived.channelCardModel.value;
    expect(card?.name).toBe('orders.placed');
    expect(card?.publishers.map((row) => row.id)).toEqual(['acme/commerce/order-service']);
    expect(card?.subscribers.map((row) => row.id)).toEqual([
      'acme/platform-core/notification-service',
      'acme/commerce/inventory-service',
      'acme/commerce/checkout-worker',
      'acme/data/events-pipeline',
    ]);
    expect(card?.publishers[0]).toMatchObject({ repository: 'acme/commerce', team: 'commerce' });
  });

  it('shows a one-sided Channel with an empty side', () => {
    const store = demoStore();
    store.actions.openChannel('orders.shipped');
    const card = store.derived.channelCardModel.value;
    expect(card?.publishers).toEqual([]);
    expect(card?.subscribers.length).toBeGreaterThan(0);
  });
});
