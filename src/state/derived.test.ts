import { describe, expect, it } from 'vitest';
import { validateCatalog } from '@/catalog';
import {
  blastRadius,
  groupableAttributes,
  groupingAttributes,
  paneNeighborhood,
  rankedByBlastRadius,
  tagToken,
} from '@/graph';
import { demoStore, validatedSample } from './fixtures.test-helper';
import {
  createStore,
  EXTERNAL_NEEDS_NOTE,
  overviewCapNotice,
  paneNotice,
  type Store,
} from './index';

const ORDER_SERVICE = { kind: 'application', id: 'ATT-IDP4/commerce/order-service' } as const;
const REDIS = { kind: 'external', id: 'redis' } as const;

describe('ranked: the default screen', () => {
  it('lists both kinds sorted together, with redis first on the demo Catalog', () => {
    const store = demoStore();
    const model = store.derived.ranked.value;
    expect(model.rows).toEqual(rankedByBlastRadius(store.graph.value));
    expect(model.rows[0]).toEqual({
      kind: 'external',
      id: 'redis',
      label: 'Redis (shared cluster)',
      size: 23,
    });
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
      id: 'ATT-IDP4/commerce/product-service',
      label: 'product-service',
      size: 12,
    });
  });
});

describe('board: ATT-IDP4/commerce/order-service on the demo Catalog', () => {
  it('is null without a Center', () => {
    expect(demoStore().derived.board.value).toBeNull();
  });

  it('shows the middle card with the record, Attributes and Flows', () => {
    const store = demoStore();
    store.actions.select(ORDER_SERVICE);
    const board = store.derived.board.value;
    expect(board?.center).toMatchObject({
      kind: 'application',
      id: 'ATT-IDP4/commerce/order-service',
      label: 'order-service',
      repository: 'ATT-IDP4/commerce',
      team: 'commerce',
      recordKind: 'service',
      url: 'https://github.com/ATT-IDP4/commerce/tree/main/order-service',
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
      'ATT-IDP4/commerce/cart-service',
      'ATT-IDP4/commerce/inventory-service',
      'ATT-IDP4/commerce/pricing-service',
      'ATT-IDP5/platform-core/user-service',
      'ATT-IDP3/payments/payment-service',
      'postgres-commerce',
      'kafka',
    ]);
    expect(depth1[0]).toEqual({
      kind: 'application',
      id: 'ATT-IDP4/commerce/cart-service',
      label: 'cart-service',
      repository: 'ATT-IDP4/commerce',
      team: 'commerce',
    });
    expect(depth1[6]).toMatchObject({ kind: 'external', id: 'kafka', externalKind: 'queue' });
    const depth2 = needs?.bands[1]?.rows ?? [];
    expect(depth2.map((row) => row.id)).toEqual([
      'ATT-IDP4/commerce/product-service',
      'ATT-IDP5/platform-infra/feature-flags',
      'ATT-IDP3/payments/ledger-service',
      'ATT-IDP3/payments/fraud-scorer',
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
      ['ATT-IDP5/platform-core/api-gateway', 'ATT-IDP4/commerce/checkout-worker'],
      [
        'ATT-IDP4/web/storefront',
        'ATT-IDP4/web/admin-console',
        'ATT-IDP4/mobile/ios-app',
        'ATT-IDP4/mobile/android-app',
      ],
    ]);
    expect(breaks?.bands[0]?.rows[0]).toMatchObject({
      repository: 'ATT-IDP5/platform-core',
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
      group: 'repository=ATT-IDP4/commerce',
    });
    expect(pane?.groups.find((group) => group.id === 'repository=ATT-IDP4/commerce')).toMatchObject(
      {
        label: 'ATT-IDP4/commerce',
      },
    );
  });

  it('says how many more appear in the Overview when a Depth falls back', () => {
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'application', id: 'billing/auth-service' });
    const pane = store.derived.paneModel.value;
    expect(pane?.depthShown).toBe(1);
    expect(pane?.notice).toBe(
      'Showing Depth 1 of 2; 497 more in the Overview, and 19 Externals not drawn',
    );
  });

  it('draws sendgrid alone and points at the Breaks column', () => {
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'external', id: 'sendgrid' });
    store.actions.setDepth(1);
    const pane = store.derived.paneModel.value;
    expect(pane?.depthShown).toBe(0);
    expect(pane?.notice).toBe('151 Dependents, more than the pane can draw; see the Breaks column');
  });

  it("drops the Groups, and the nodes' parents, when the pane is drawn flat", () => {
    // docs/performance-budgets.md, "Pane cap": above 350 Dependencies the pane drops the Group
    // boxes and lays out flat. This is the view-model half of that -- `paneNeighborhood` reports
    // `groupsDrawn: false` and the model must carry no Groups and no parents at all, since the
    // ~40% saving comes from dagre not being handed a compound graph.
    const { catalog } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog });
    store.actions.select({ kind: 'application', id: 'ATT-IDP1/assurance/kpi' });
    const flat = store.derived.paneModel.value;
    expect(flat?.groupsDrawn).toBe(false);
    expect(flat?.depthShown).toBe(2); // flat, NOT shallower
    expect(flat?.dependencies.length).toBeGreaterThan(350);
    expect(flat?.groups).toEqual([]);
    expect(flat?.nodes.every((node) => node.group === undefined)).toBe(true);
    // The grouping Attribute is unchanged; only the drawing of it is suppressed.
    expect(flat?.grouping).toBe('repository');

    // The same store, a Center under the Dependency cap: Groups and parents are back.
    store.actions.select({ kind: 'application', id: 'ATT-IDP2/auth-core/audit-service' });
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
      groupDependencies: 0,
      hiddenGroupDependencies: 0,
      capNotice: null,
    });
  });

  it('groups by Repository when expanded, with the open set and Group Dependencies', () => {
    const store = demoStore();
    store.actions.expandOverview(true);
    store.actions.select(ORDER_SERVICE);
    const model = store.derived.overviewModel.value;
    expect(model.groups.map((group) => group.label)).toHaveLength(10);
    expect([...model.open]).toEqual(['repository=ATT-IDP4/commerce']);
    expect(model.highlighted).toEqual(['repository=ATT-IDP4/commerce']);
    expect(model.edges.some((edge) => edge.kind === 'group')).toBe(true);
    expect(model.edges.some((edge) => edge.kind === 'member')).toBe(true);
    // A 34-Application Catalog is nowhere near the cap, so it is drawn whole and says nothing.
    expect(model.hiddenGroupDependencies).toBe(0);
    expect(model.capNotice).toBeNull();
  });

  /**
   * The Overview cap reaching the view (docs/performance-budgets.md, "Overview cap"). The numbers
   * are the fixture's real ones, not the constant's: 1,308 Group Dependencies over 123 Repositories
   * is what budget 9 was unknowingly written against, and 700 of them is what it now draws.
   */
  it('caps the 1,000-Application Overview at 700 Group Dependencies, with a notice naming 608', () => {
    const { catalog, warnings } = validatedSample('catalog-1000.json');
    const store = createStore({ catalog, warnings });
    store.actions.expandOverview(true);
    const model = store.derived.overviewModel.value;

    expect(model.groups).toHaveLength(123);
    expect(model.groupDependencies).toBe(1308);
    expect(model.edges).toHaveLength(700);
    expect(model.edges.every((edge) => edge.kind === 'group')).toBe(true);
    expect(model.hiddenGroupDependencies).toBe(608);
    expect(model.capNotice).toBe(
      'Showing the heaviest 700 Group Dependencies of 1,308; 608 not drawn',
    );
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
      'repository=ATT-IDP5/platform-core',
      'repository=ATT-IDP5/platform-infra',
      'repository=ATT-IDP4/commerce',
      'repository=ATT-IDP3/payments',
      'repository=ATT-IDP5/data',
    ]);
    expect(store.openGroups.value.size).toBe(0);
  });

  /**
   * Issue #40: `highlighted` glows the Center's whole Group regardless of Depth; `neighborhood` and
   * `reachedGroupEdges` are the Depth-scoped fields the Overview's member-level highlight needs, on
   * a hand-built Catalog small enough that every hop is checkable by eye. Both directions, Depth 2
   * (the default): Center `a/center` depends on `a/a2`, which depends on `b/b1` (two hops on);
   * `d/d1` depends on the Center (one hop back). `a/a3` shares the Center's Group but carries no
   * Dependency to or from anything, so it is never reached; `e/e1` is wholly isolated.
   */
  describe('the Depth-scoped Neighborhood highlight', () => {
    const NEIGHBORHOOD_CATALOG = {
      schemaVersion: 1,
      applications: [
        { repository: 'a', project: 'center', dependsOn: ['a/a2'] },
        { repository: 'a', project: 'a2', dependsOn: ['b/b1'] },
        { repository: 'a', project: 'a3' },
        { repository: 'b', project: 'b1' },
        { repository: 'd', project: 'd1', dependsOn: ['a/center'] },
        { repository: 'e', project: 'e1' },
      ],
    };
    const CENTER = { kind: 'application', id: 'a/center' } as const;

    function neighborhoodStore(): Store {
      const { catalog } = validateCatalog(NEIGHBORHOOD_CATALOG);
      if (catalog === undefined) {
        throw new Error('the Neighborhood-highlight fixture must validate');
      }
      const store = createStore({ catalog });
      store.actions.select(CENTER);
      store.actions.expandOverview(true);
      return store;
    }

    it('member-level: the Applications within Depth of the Center, not the whole open Group', () => {
      const model = neighborhoodStore().derived.overviewModel.value;
      expect([...model.open]).toEqual(['repository=a']);
      expect(model.neighborhood).toEqual(new Set(['a/center', 'a/a2', 'd/d1', 'b/b1']));
      // a3 shares the Center's open Group but has no Dependency in either direction.
      expect(model.neighborhood.has('a/a3')).toBe(false);
    });

    it('names the ordered Group pairs a real Dependency inside the Neighborhood crosses', () => {
      const model = neighborhoodStore().derived.overviewModel.value;
      expect(model.reachedGroupEdges).toEqual(
        new Set(['repository=a->repository=b', 'repository=d->repository=a']),
      );
    });

    it('is empty while the Overview is collapsed, even with a Center selected', () => {
      const { catalog } = validateCatalog(NEIGHBORHOOD_CATALOG);
      if (catalog === undefined) {
        throw new Error('the Neighborhood-highlight fixture must validate');
      }
      const store = createStore({ catalog });
      store.actions.select(CENTER);
      const model = store.derived.overviewModel.value;
      expect(model.neighborhood.size).toBe(0);
      expect(model.reachedGroupEdges.size).toBe(0);
    });
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
    expect(card?.publishers.map((row) => row.id)).toEqual(['ATT-IDP4/commerce/order-service']);
    expect(card?.subscribers.map((row) => row.id)).toEqual([
      'ATT-IDP5/platform-core/notification-service',
      'ATT-IDP4/commerce/inventory-service',
      'ATT-IDP4/commerce/checkout-worker',
      'ATT-IDP5/data/events-pipeline',
    ]);
    expect(card?.publishers[0]).toMatchObject({
      repository: 'ATT-IDP4/commerce',
      team: 'commerce',
    });
  });

  it('shows a one-sided Channel with an empty side', () => {
    const store = demoStore();
    store.actions.openChannel('orders.shipped');
    const card = store.derived.channelCardModel.value;
    expect(card?.publishers).toEqual([]);
    expect(card?.subscribers.length).toBeGreaterThan(0);
  });
});

/**
 * `tags`: everything a Tag needs so no component traverses the Graph (docs/tags.md). The numbers
 * are the demo Catalog's, pinned against the graph module's own queries rather than restated.
 */
describe('tags: the Tag index, what may group, and what is grouping', () => {
  it('indexes every Application and External of the Catalog', () => {
    const store = demoStore();
    const model = store.derived.tags.value;
    expect(model.index.tokens.size).toBe(34 + 19);
    expect(model.index.members.get(tagToken('team', 'commerce'))?.size).toBe(6);
  });

  it('offers only the Attributes the cardinality rule allows (item N7)', () => {
    const store = demoStore();
    const model = store.derived.tags.value;
    expect([...model.groupable]).toEqual(groupingAttributes(store.graph.value));
    expect(model.groupable.has('team')).toBe(true);
    // Three Applications with three values between them: a grouping of singletons, so not offered.
    expect(model.groupable.has('sla')).toBe(false);
    // Still a groupable KEY, though — the two questions are separate, and a Tag for it Highlights.
    expect(groupableAttributes(store.graph.value)).toContain('sla');
  });

  it('follows the grouping Attribute, and reads `none` as Repository', () => {
    const store = demoStore();
    expect(store.derived.tags.value.grouping).toBe('repository');

    store.actions.setGroupBy('team');
    expect(store.derived.tags.value.grouping).toBe('team');

    store.actions.setGroupBy('none');
    expect(store.derived.tags.value.grouping).toBe('repository');
  });

  it('rebuilds the index only when the Graph does, not when the grouping moves', () => {
    const store = demoStore();
    const first = store.derived.tags.value.index;
    store.actions.setGroupBy('team');
    // Identity, not equality: choosing a Tag must not cost a rebuild of every token in the Catalog.
    expect(store.derived.tags.value.index).toBe(first);
  });
});

/**
 * Item N6 of docs/retrospective-2026-09-03.md, at its source. `nodeOf` has always resolved a name
 * through `labelOf`, but the Center card's own record dropped it for Applications — it was carried
 * for Externals only — so the card and the Markdown export both led with an APM id and showed the
 * record's real name nowhere. `samples/att/` is the Catalog that shape came from.
 */
describe('the Center card carries an Application’s name, not only an External’s', () => {
  const store = createStore({ catalog: validatedSample('att/catalog.att.json').catalog });
  const APM = { kind: 'application', id: 'ATT-IDP4/customer-profile/apm10099' } as const;

  it('gives a named Application its name alongside its id', () => {
    store.actions.select(APM);
    const card = store.derived.board.value?.center;

    expect(card?.id).toBe('ATT-IDP4/customer-profile/apm10099');
    expect(card?.name).toBe('Contact Preference Service');
    // `label` is `labelOf`, which falls back to the PROJECT, so it is not the same question.
    expect(card?.label).toBe('Contact Preference Service');
  });

  it('leaves `name` undefined when the producer supplied none, rather than inventing one', () => {
    const demo = demoStore();
    demo.actions.select({ kind: 'application', id: 'ATT-IDP4/commerce/order-service' });
    const card = demo.derived.board.value?.center;

    expect(card?.name).toBeUndefined();
    expect(card?.label).toBe('order-service');
    expect(card?.id).toBe('ATT-IDP4/commerce/order-service');
  });
});

describe('overviewCapNotice: the Overview cap notice (docs/performance-budgets.md, "Overview cap")', () => {
  it('says nothing when every Group Dependency is drawn', () => {
    expect(overviewCapNotice(1308, 0)).toBeNull();
    expect(overviewCapNotice(0, 0)).toBeNull();
  });

  it('names what is drawn and what is not, in the pane cap notice shape', () => {
    expect(overviewCapNotice(1308, 608)).toBe(
      'Showing the heaviest 700 Group Dependencies of 1,308; 608 not drawn',
    );
  });
});
