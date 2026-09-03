import { describe, expect, it } from 'vitest';
import { buildSearchIndex } from '@/graph';
import { demoStore } from './fixtures.test-helper';
import { spaceGraphOf, spaceStyleOf } from './Space';

describe('spaceGraphOf', () => {
  it('draws every Application and External and every Dependency, but no Channel', () => {
    const graph = demoStore().graph.value;
    const space = spaceGraphOf(graph);
    expect(space.nodes).toHaveLength(graph.applications.size + graph.externals.size);
    expect(space.edges).toHaveLength(
      [...graph.applications.values()].reduce((sum, app) => sum + app.dependencies.length, 0),
    );
    expect(space.nodes.some((node) => graph.channels.has(node.sourceId))).toBe(false);
    expect(new Set(space.nodes.map((node) => `${node.kind}:${node.sourceId}`)).size).toBe(
      space.nodes.length,
    );
  });
});

describe('spaceStyleOf', () => {
  it('makes the Center, its Neighborhood and the rest distinct', () => {
    const graph = demoStore().graph.value;
    const topology = spaceGraphOf(graph);
    const node = (id: string) => {
      const found = topology.nodes.find((candidate) => candidate.sourceId === id);
      if (found === undefined) throw new Error(`missing test node ${id}`);
      return found;
    };
    const center = { kind: 'application', id: 'ATT-IDP4/commerce/order-service' } as const;
    const style = spaceStyleOf(graph, center, 1, 'repository', null);
    const centerNode = node(center.id);
    const nearNode = node('postgres-commerce');
    const farNode = node('ATT-IDP5/platform-core/auth-service');
    expect(style.nodeSize(centerNode)).toBe(12);
    expect(style.nodeSize(nearNode)).toBe(4);
    expect(style.nodeSize(farNode)).toBe(0.7);
  });

  it('dims nodes outside a Tag Highlight without removing them', () => {
    const graph = demoStore().graph.value;
    const topology = spaceGraphOf(graph);
    const [member, other] = topology.nodes;
    if (member === undefined || other === undefined) throw new Error('demo topology is empty');
    const style = spaceStyleOf(graph, null, 2, 'repository', {
      token: 'repository=x',
      members: new Set([member.sourceId]),
    });
    expect(style.nodeColour(member)).toContain(',1)');
    expect(style.nodeColour(other)).toContain(',0.16)');
    expect(topology.nodes).toHaveLength(graph.applications.size + graph.externals.size);
  });
});

/**
 * docs/space-view.md: "Nothing is reachable only through the Space. Every node it draws is
 * reachable from the ranked table and search." An exhaustive cross-check against the real search
 * index and the real ranked-table model over the bundled demo Catalog (not a hand-built fixture),
 * so it cannot pass over an empty scene and cannot pass by checking only a convenient subset.
 * `e2e/space.spec.ts` closes the remaining gap to the real rendered page and the real Search UI.
 */
describe('reachability floor: every drawn node is searchable and ranked', () => {
  it('is not vacuous: the Space actually draws something', () => {
    const graph = demoStore().graph.value;
    expect(spaceGraphOf(graph).nodes.length).toBeGreaterThan(0);
  });

  it('draws no node the search index cannot find', () => {
    const store = demoStore();
    const graph = store.graph.value;
    const space = spaceGraphOf(graph);
    const searchable = new Set(
      buildSearchIndex(graph).entries.map((entry) => `${entry.kind}:${entry.id}`),
    );
    for (const node of space.nodes) {
      expect(searchable.has(`${node.kind}:${node.sourceId}`)).toBe(true);
    }
  });

  it('draws no node the ranked table does not also rank', () => {
    const store = demoStore();
    const graph = store.graph.value;
    const space = spaceGraphOf(graph);
    const ranked = new Set(store.derived.ranked.value.rows.map((row) => `${row.kind}:${row.id}`));
    for (const node of space.nodes) {
      expect(ranked.has(`${node.kind}:${node.sourceId}`)).toBe(true);
    }
  });
});
