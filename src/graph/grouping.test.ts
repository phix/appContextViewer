import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { catalogOf, readSampleCatalog } from './fixtures.test-helper';
import {
  attributeCardinality,
  buildGraph,
  buildTagIndex,
  capGroupDependencies,
  type GroupEdge,
  groupableAttributes,
  groupBy,
  groupDependencies,
  groupingAttributes,
  OVERVIEW_DEPENDENCY_CAP,
  qualifiesAsGrouping,
  tagToken,
} from './index';

const demo = buildGraph(demoCatalog);

describe('groupableAttributes: the group-by menu (grouping decision, #7)', () => {
  it('lists Repository, Team, Kind, then the eleven scalar keys of the demo Catalog, sorted', () => {
    expect(groupableAttributes(demo)).toEqual([
      'repository',
      'team',
      'kind',
      'deprecated',
      'framework',
      'gpu',
      'language',
      'minOs',
      'oncall',
      'pci',
      'runtime',
      'schedule',
      'sla',
      'tier',
    ]);
  });

  it('skips keys with an array or object value anywhere', () => {
    const keys = groupableAttributes(demo);
    expect(keys).not.toContain('links');
    expect(keys).not.toContain('tags');
    const mixed = buildGraph(
      catalogOf([
        { repository: 'r', project: 'a', attributes: { size: 'small', owner: 'x' } },
        { repository: 'r', project: 'b', attributes: { size: ['small'], owner: null } },
      ]),
    );
    expect(groupableAttributes(mixed)).toEqual(['repository', 'team', 'kind']);
  });

  it('lets a built-in name win over a colliding attributes key (docs/url-state.md)', () => {
    const graph = buildGraph(
      catalogOf([{ repository: 'r', project: 'a', attributes: { team: 'shadow', zone: 'eu' } }]),
    );
    expect(groupableAttributes(graph)).toEqual(['repository', 'team', 'kind', 'zone']);
  });

  it('matches samples/check.mjs on the 1,000-Application fixture', () => {
    const graph = buildGraph(readSampleCatalog('catalog-1000.json'));
    expect(groupableAttributes(graph)).toEqual([
      'repository',
      'team',
      'kind',
      'deprecated',
      'language',
      'oncall',
      'pci',
      'runtime',
      'sla',
      'tier',
    ]);
  });
});

describe('groupBy: Groups with the synthetic "No <Attribute>" Group last', () => {
  it('puts the four Applications without a Team into "No team", listed last', () => {
    const groups = groupBy(demo, 'team');
    expect(groups).toHaveLength(9 + 1);
    const last = groups[groups.length - 1];
    expect(last).toEqual({
      id: 'team',
      attribute: 'team',
      label: 'No team',
      missing: true,
      members: [
        'ATT-IDP4/commerce/shared-models',
        'ATT-IDP5/tools/doc-site',
        'legacy-monolith/monolith',
        'legacy-monolith/reports-cron',
      ],
    });
    expect(groups.slice(0, -1).every((group) => !group.missing)).toBe(true);
    expect(groups.find((group) => group.label === 'growth')).toEqual({
      id: 'team=growth',
      attribute: 'team',
      label: 'growth',
      missing: false,
      members: ['ATT-IDP4/commerce/promotions', 'ATT-IDP5/platform-core/notification-service'],
    });
  });

  it('puts the eight Applications without a tier into "No tier" and orders numbers numerically', () => {
    const groups = groupBy(demo, 'tier');
    expect(groups.map((group) => group.label)).toEqual(['1', '2', '3', 'No tier']);
    expect(groups.map((group) => group.members.length)).toEqual([15, 8, 3, 8]);
    expect(groups[3].missing).toBe(true);
  });

  it('groups by Kind and Repository through the built-in keys', () => {
    const byKind = groupBy(demo, 'kind');
    expect(byKind.find((group) => group.label === 'service')?.members).toHaveLength(19);
    expect(byKind[byKind.length - 1]).toMatchObject({ label: 'No kind', missing: true });
    expect(byKind[byKind.length - 1].members).toEqual([
      'ATT-IDP5/tools/doc-site',
      'legacy-monolith/monolith',
    ]);

    const byRepository = groupBy(demo, 'repository');
    expect(byRepository).toHaveLength(10);
    expect(byRepository.some((group) => group.missing)).toBe(false);
    expect(byRepository.reduce((n, group) => n + group.members.length, 0)).toBe(34);
    expect(byRepository.find((group) => group.label === 'ATT-IDP4/commerce')?.members).toHaveLength(
      8,
    );
    expect(byRepository.map((group) => group.id)).toContain('repository=ATT-IDP4/commerce');
  });

  it('covers every Application exactly once', () => {
    for (const attribute of groupableAttributes(demo)) {
      const members = groupBy(demo, attribute).flatMap((group) => group.members);
      expect(members.length, attribute).toBe(34);
      expect(new Set(members).size, attribute).toBe(34);
    }
  });

  it('orders labels numerically when they are numbers, then by code unit, and merges 1 with "1"', () => {
    const graph = buildGraph(
      catalogOf([
        { repository: 'r', project: 'a', attributes: { tier: 10 } },
        { repository: 'r', project: 'b', attributes: { tier: 2 } },
        { repository: 'r', project: 'c', attributes: { tier: 'beta' } },
        { repository: 'r', project: 'd', attributes: { tier: '1' } },
        { repository: 'r', project: 'e', attributes: { tier: 1 } },
        { repository: 'r', project: 'f', attributes: { tier: 'Alpha' } },
      ]),
    );
    const groups = groupBy(graph, 'tier');
    expect(groups.map((group) => group.label)).toEqual(['1', '2', '10', 'Alpha', 'beta']);
    expect(groups[0].members).toEqual(['r/d', 'r/e']);
  });

  it('rejects a key that is not groupable, so a bad #group= value can never render as one Group', () => {
    expect(() => groupBy(demo, 'nonsense')).toThrow(/nonsense/);
    // Display-only keys: an object and an array value.
    expect(() => groupBy(demo, 'links')).toThrow(/links/);
    expect(() => groupBy(demo, 'tags')).toThrow(/tags/);
  });

  it('keeps the missing-value Group for a groupable key that is sparse', () => {
    const groups = groupBy(demo, 'gpu');
    expect(groups.map((group) => group.label)).toEqual(['true', 'No gpu']);
    expect(groups[0].members).toEqual(['ATT-IDP5/data/ml-recommender']);
    expect(groups[1]).toMatchObject({ missing: true });
    expect(groups[1].members).toHaveLength(33);
  });
});

describe('groupDependencies: Group Dependencies for collapsed Groups, member edges for open ones', () => {
  // A: a1, a2. B: b1. Dependencies: a1 -> a2 (intra), a1 -> b1, a2 -> b1, b1 -> a1, a1 -> external.
  const small = buildGraph(
    catalogOf(
      [
        { repository: 'A', project: 'a1', dependsOn: ['A/a2', 'B/b1', 'external:db'] },
        { repository: 'A', project: 'a2', dependsOn: ['B/b1'] },
        { repository: 'B', project: 'b1', dependsOn: ['A/a1'] },
      ],
      [{ id: 'db', kind: 'database' }],
    ),
  );
  const groups = groupBy(small, 'repository');
  const groupEdges = (edges: GroupEdge[]) => edges.filter((edge) => edge.kind === 'group');
  const memberEdges = (edges: GroupEdge[]) => edges.filter((edge) => edge.kind === 'member');

  it('aggregates one directed edge per ordered pair with a count when both Groups are collapsed', () => {
    const edges = groupDependencies(small, groups, new Set());
    expect(edges).toEqual([
      { kind: 'group', from: 'repository=A', to: 'repository=B', count: 2 },
      { kind: 'group', from: 'repository=B', to: 'repository=A', count: 1 },
    ]);
  });

  it('restores member-level edges inside and between open Groups', () => {
    const edges = groupDependencies(small, groups, new Set(['repository=A', 'repository=B']));
    expect(groupEdges(edges)).toEqual([]);
    expect(memberEdges(edges)).toEqual([
      { kind: 'member', from: 'A/a1', to: 'A/a2' },
      { kind: 'member', from: 'A/a1', to: 'B/b1' },
      { kind: 'member', from: 'A/a2', to: 'B/b1' },
      { kind: 'member', from: 'B/b1', to: 'A/a1' },
    ]);
  });

  it('keeps a Group Dependency while either end is collapsed, and shows an open Group’s intra edges', () => {
    const edges = groupDependencies(small, groups, new Set(['repository=A']));
    expect(groupEdges(edges)).toEqual([
      { kind: 'group', from: 'repository=A', to: 'repository=B', count: 2 },
      { kind: 'group', from: 'repository=B', to: 'repository=A', count: 1 },
    ]);
    expect(memberEdges(edges)).toEqual([{ kind: 'member', from: 'A/a1', to: 'A/a2' }]);
  });

  it('hides the intra-Group edges of a collapsed Group and ignores Externals', () => {
    const edges = groupDependencies(small, groups, new Set(['repository=B']));
    expect(memberEdges(edges)).toEqual([]);
    expect(edges.some((edge) => edge.to === 'db' || edge.from === 'db')).toBe(false);
  });

  it('drops Dependencies whose ends are not both in the given Groups', () => {
    const onlyA = groups.filter((group) => group.label === 'A');
    expect(groupDependencies(small, onlyA, new Set(['repository=A']))).toEqual([
      { kind: 'member', from: 'A/a1', to: 'A/a2' },
    ]);
  });

  it('accounts for every Application Dependency of the demo Catalog by Repository', () => {
    const byRepository = groupBy(demo, 'repository');
    const collapsed = groupDependencies(demo, byRepository, new Set());
    const crossRepository = collapsed.reduce(
      (n, edge) => n + (edge.kind === 'group' ? edge.count : 0),
      0,
    );
    expect(crossRepository).toBe(22);
    expect(memberEdges(collapsed)).toEqual([]);

    const open = groupDependencies(demo, byRepository, new Set(byRepository.map((g) => g.id)));
    expect(memberEdges(open)).toHaveLength(38);
    expect(groupEdges(open)).toEqual([]);
  });
});

// ---------------------------------------------------------------- N7: the cardinality rule

/**
 * docs/tags.md, "The cardinality rule (item N7)". The numbers below are ground truth read off the
 * committed fixtures, not values these tests computed for themselves; `samples/att/catalog.att.json`
 * is the 141-Application Catalog the rule was written for.
 */
describe('qualifiesAsGrouping: at least two values, at most half as many as the carriers', () => {
  const att = buildGraph(readSampleCatalog('att/catalog.att.json'));
  const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));

  it('reads the carriers and the distinct values off samples/att/ (141 Applications)', () => {
    expect(att.applications.size).toBe(141);
    expect(attributeCardinality(att, 'repository')).toEqual({
      attribute: 'repository',
      applications: 141,
      values: 31,
    });
    // One Application carries no Team, so 140 carry it rather than 141.
    expect(attributeCardinality(att, 'team')).toEqual({
      attribute: 'team',
      applications: 140,
      values: 16,
    });
    expect(attributeCardinality(att, 'tier')).toEqual({
      attribute: 'tier',
      applications: 139,
      values: 4,
    });
  });

  /**
   * The Attribute that forced this rule — `attributes.appName`, 139 values over 141 Applications —
   * was DELETED from the fixture by commit 6c06934, which moved the readable name onto the schema's
   * own optional `name` key. Every Attribute `samples/att/` still carries qualifies, so pinning the
   * disqualifying branch to that file alone would assert nothing. The offending Attribute is
   * therefore reconstructed here, over the real 141 records, which is what the rule was measured on.
   *
   * All 141 gain `appName` here, not 139: the fixture used to carry two Applications with no
   * `attributes` object at all (missing `org`, which left them out of the Overview's org grouping
   * entirely -- 2026-09-03), so this map's `attributes === undefined` guard skipped them. Giving
   * both an `org` closed that gap and, as a side effect, made every Application eligible here too.
   */
  it('disqualifies the 141-value Attribute samples/att/ used to carry, over its real 141 records', () => {
    const source = readSampleCatalog('att/catalog.att.json');
    const withAppName = buildGraph({
      ...source,
      applications: source.applications.map((application) =>
        application.attributes === undefined
          ? application
          : {
              ...application,
              attributes: { ...application.attributes, appName: application.name },
            },
      ),
    });
    expect(attributeCardinality(withAppName, 'appName')).toEqual({
      attribute: 'appName',
      applications: 141,
      values: 141,
    });
    expect(qualifiesAsGrouping(withAppName, 'appName')).toBe(false);
    // It is offered as a key and refused as a grouping: the two questions are separate.
    expect(groupableAttributes(withAppName)).toContain('appName');
    expect(groupingAttributes(withAppName)).not.toContain('appName');
  });

  it('qualifies every Attribute samples/att/ carries today, and says so with its own list', () => {
    expect(groupingAttributes(att)).toEqual(groupableAttributes(att));
    expect(groupableAttributes(att)).toHaveLength(13);
  });

  it('fails an Attribute of one value, and passes one whose values are exactly half the carriers', () => {
    // samples/catalog.demo.json: `deprecated` is carried by 2 Applications with one value between
    // them; `pci` is carried by 4 with two values, which is the boundary the rule allows.
    expect(attributeCardinality(demo, 'deprecated')).toEqual({
      attribute: 'deprecated',
      applications: 2,
      values: 1,
    });
    expect(qualifiesAsGrouping(demo, 'deprecated')).toBe(false);
    expect(attributeCardinality(demo, 'pci')).toEqual({
      attribute: 'pci',
      applications: 4,
      values: 2,
    });
    // Exactly at the boundary: 2 values x 2 = 4 carriers. `<` instead of `<=` turns this red.
    expect(qualifiesAsGrouping(demo, 'pci')).toBe(true);
  });

  it('fails an Attribute whose every carrier has its own value (demo `sla`: 3 of 3)', () => {
    expect(attributeCardinality(demo, 'sla')).toEqual({
      attribute: 'sla',
      applications: 3,
      values: 3,
    });
    expect(qualifiesAsGrouping(demo, 'sla')).toBe(false);
    expect(groupingAttributes(demo)).toEqual([
      'repository',
      'team',
      'kind',
      'language',
      'pci',
      'runtime',
      'tier',
    ]);
  });

  it('keeps the 1,000-Application fixture groupable by Repository, Team and Kind', () => {
    expect(thousand.applications.size).toBe(1000);
    expect(attributeCardinality(thousand, 'repository')).toEqual({
      attribute: 'repository',
      applications: 1000,
      values: 123,
    });
    expect(attributeCardinality(thousand, 'oncall')).toEqual({
      attribute: 'oncall',
      applications: 277,
      values: 56,
    });
    expect(groupingAttributes(thousand)).toEqual([
      'repository',
      'team',
      'kind',
      'language',
      'oncall',
      'runtime',
      'sla',
      'tier',
    ]);
    // Both dropped for having a single value across their carriers, not for their spread.
    expect(qualifiesAsGrouping(thousand, 'deprecated')).toBe(false);
    expect(qualifiesAsGrouping(thousand, 'pci')).toBe(false);
  });

  it('refuses a key that is not a groupable Attribute at all', () => {
    expect(qualifiesAsGrouping(demo, 'links')).toBe(false);
    expect(qualifiesAsGrouping(demo, 'nonesuch')).toBe(false);
  });
});

// ---------------------------------------------------------------- the Tag index

/**
 * A Tag names one Attribute value (CONTEXT.md, **Tag**). `buildTagIndex` gives every surface the
 * two things it needs without traversing the Graph itself: the token list a row carries as one
 * `data-groups` attribute, and the node ids behind a token.
 */
describe('buildTagIndex: tokens on a row, members behind a token', () => {
  it('encodes a token so it survives as one word of a `data-groups` attribute', () => {
    // A CSS `[data-groups~="..."]` selector matches whitespace-separated words, so a value with a
    // space in it — which Team values routinely have — must not contribute two words.
    expect(tagToken('team', 'Billing Platform')).toBe('team=Billing%20Platform');
    expect(tagToken('team', 'Billing Platform')).not.toMatch(/\s/);
    expect(tagToken('tier', 1)).toBe('tier=1');
    expect(tagToken('pci', true)).toBe('pci=true');
    // Distinct pairs never collide, including when a value itself contains the separator.
    expect(tagToken('a', 'b=c')).not.toBe(tagToken('a=b', 'c'));
  });

  it('gives an Application one token per scalar Attribute it carries, and nothing for the rest', () => {
    const graph = buildGraph(
      catalogOf([
        {
          repository: 'ATT-IDP4/commerce',
          project: 'order-service',
          team: 'Billing Platform',
          kind: 'service',
          attributes: { tier: 1, links: ['x'], nothing: null },
        },
      ]),
    );
    const index = buildTagIndex(graph);
    const tokens = (index.tokens.get('ATT-IDP4/commerce/order-service') ?? '').split(' ').sort();
    expect(tokens).toEqual(
      [
        tagToken('repository', 'ATT-IDP4/commerce'),
        tagToken('team', 'Billing Platform'),
        tagToken('kind', 'service'),
        tagToken('tier', 1),
      ].sort(),
    );
  });

  it('puts every node sharing one Attribute value behind that value token', () => {
    const index = buildTagIndex(demo);
    const team = tagToken('team', 'commerce');
    const members = index.members.get(team);
    expect(members).toBeDefined();
    // The Group and the Tag name the same set: a Tag is a Group made reachable, not a new relation.
    const group = groupBy(demo, 'team').find((candidate) => candidate.label === 'commerce');
    expect(group).toBeDefined();
    expect([...(members ?? [])].sort()).toEqual([...(group?.members ?? [])].sort());
    expect(members?.size).toBeGreaterThan(1);
  });

  it('reaches Externals too, so an "External · cache" Tag names the caches', () => {
    const index = buildTagIndex(demo);
    const caches = index.members.get(tagToken('kind', 'cache'));
    expect(caches).toBeDefined();
    expect(caches?.has('redis')).toBe(true);
    expect(index.tokens.get('redis')).toContain(tagToken('kind', 'cache'));
  });

  it('covers every node of the 1,000-Application fixture', () => {
    const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));
    const index = buildTagIndex(thousand);
    expect(index.tokens.size).toBe(1000 + 25);
    // Repository is on every Application, so its 123 tokens partition all 1,000 of them.
    let counted = 0;
    for (const [token, members] of index.members) {
      if (token.startsWith('repository=')) {
        counted += members.size;
      }
    }
    expect(counted).toBe(1000);
  });
});

describe('capGroupDependencies: the Overview cap (docs/performance-budgets.md, "Overview cap")', () => {
  /**
   * `n` Group Dependencies with distinct counts, LIGHTEST first, so a cap that merely truncated the
   * input in order would keep exactly the wrong ones and these tests would go red.
   */
  function ascendingGroupEdges(n: number): GroupEdge[] {
    return Array.from({ length: n }, (_, i) => ({
      kind: 'group' as const,
      from: `repository=g${i}`,
      to: 'repository=hub',
      count: i + 1,
    }));
  }

  const counts = (edges: readonly GroupEdge[]) =>
    edges.flatMap((edge) => (edge.kind === 'group' ? [edge.count] : []));

  /**
   * ON the boundary, not near it, and spelled with LITERALS on both sides: 701 in, 700 out, one
   * hidden. That is what makes the constant falsifiable rather than asserted through itself --
   * move `OVERVIEW_DEPENDENCY_CAP` to 699 and the length is wrong, move it to 701 and nothing is
   * hidden. A fixture sized from the constant would follow it and prove nothing.
   */
  it('draws 700 of 701 Group Dependencies and hides the single lightest one', () => {
    const capped = capGroupDependencies(ascendingGroupEdges(701));
    expect(capped.edges).toHaveLength(700);
    expect(capped.total).toBe(701);
    expect(capped.hidden).toBe(1);
    // The one dropped is the lightest; the heaviest leads what is drawn.
    expect(counts(capped.edges)[0]).toBe(701);
    expect(Math.min(...counts(capped.edges))).toBe(2);
    expect(
      capped.edges.some((edge) => edge.kind === 'group' && edge.from === 'repository=g0'),
    ).toBe(false);
  });

  /** The other side of the same boundary: 700 exactly fits, so there is nothing to notice. */
  it('draws all 700 Group Dependencies untouched, and hides none', () => {
    const edges = ascendingGroupEdges(700);
    const capped = capGroupDependencies(edges);
    expect(capped.edges).toEqual(edges);
    expect(capped.total).toBe(700);
    expect(capped.hidden).toBe(0);
  });

  it('is the cap the budgets doc names', () => {
    expect(OVERVIEW_DEPENDENCY_CAP).toBe(700);
  });

  it('orders by count descending and keeps first-encounter order among ties', () => {
    const edges: GroupEdge[] = [
      { kind: 'group', from: 'a', to: 'b', count: 5 },
      { kind: 'group', from: 'c', to: 'd', count: 9 },
      { kind: 'group', from: 'e', to: 'f', count: 5 },
      { kind: 'group', from: 'g', to: 'h', count: 1 },
    ];
    expect(capGroupDependencies(edges, 3).edges).toEqual([edges[1], edges[0], edges[2]]);
  });

  /**
   * Member edges are not Group Dependencies: they are drawn only between members of open Groups and
   * are budget 11's input, not budget 9's. Capping them would silently break Expand all's 4,395.
   */
  it('never caps member edges, and keeps them after the Group Dependencies', () => {
    const members: GroupEdge[] = [
      { kind: 'member', from: 'A/a1', to: 'A/a2' },
      { kind: 'member', from: 'A/a2', to: 'B/b1' },
    ];
    const capped = capGroupDependencies([...ascendingGroupEdges(701), ...members]);
    expect(capped.edges.filter((edge) => edge.kind === 'member')).toEqual(members);
    expect(capped.edges.slice(-2)).toEqual(members);
    expect(capped.total).toBe(701);
    expect(capped.hidden).toBe(1);
  });

  /**
   * The real input budget 9 was written against, and the reason for the cap: 1,308 Group
   * Dependencies over 123 Group nodes (docs/performance-budgets.md, "Overview cap"). This asserts
   * heaviest-first on the actual Catalog rather than on a constructed one -- no drawn edge may be
   * lighter than any hidden edge.
   */
  it('keeps the 700 heaviest of the 1,000-Application Catalog 1,308 Group Dependencies', () => {
    const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));
    const groups = groupBy(thousand, 'repository');
    expect(groups).toHaveLength(123);

    const all = groupDependencies(thousand, groups, new Set());
    expect(counts(all)).toHaveLength(1308);

    const capped = capGroupDependencies(all);
    expect(capped.total).toBe(1308);
    expect(capped.edges).toHaveLength(700);
    expect(capped.hidden).toBe(608);

    const drawn = new Set(capped.edges);
    const hiddenCounts = counts(all.filter((edge) => !drawn.has(edge)));
    expect(hiddenCounts).toHaveLength(608);
    expect(Math.min(...counts(capped.edges))).toBeGreaterThanOrEqual(Math.max(...hiddenCounts));
  });
});
