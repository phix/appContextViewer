import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { catalogOf, readSampleCatalog } from './fixtures.test-helper';
import {
  buildGraph,
  type GroupEdge,
  groupableAttributes,
  groupBy,
  groupDependencies,
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
        'acme/commerce/shared-models',
        'acme/tools/doc-site',
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
      members: ['acme/commerce/promotions', 'acme/platform-core/notification-service'],
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
      'acme/tools/doc-site',
      'legacy-monolith/monolith',
    ]);

    const byRepository = groupBy(demo, 'repository');
    expect(byRepository).toHaveLength(10);
    expect(byRepository.some((group) => group.missing)).toBe(false);
    expect(byRepository.reduce((n, group) => n + group.members.length, 0)).toBe(34);
    expect(byRepository.find((group) => group.label === 'acme/commerce')?.members).toHaveLength(8);
    expect(byRepository.map((group) => group.id)).toContain('repository=acme/commerce');
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
    expect(groups[0].members).toEqual(['acme/data/ml-recommender']);
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
