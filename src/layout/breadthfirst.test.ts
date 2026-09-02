import { describe, expect, it } from 'vitest';
import { layoutWithBreadthfirst } from './breadthfirst';
import { expectComplete, expectMembersInsideGroups, expectNoOverlaps } from './check-positions';
import { type LayoutSpec, LayoutSpecError } from './index';
import { expandedOverviewSpec, NODE_HEIGHT, NODE_WIDTH, paneSpec } from './sample-specs';

const node = (id: string) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT });

describe('layoutWithBreadthfirst', () => {
  it('puts each breadth-first depth on its own row, top-down', () => {
    const positions = layoutWithBreadthfirst({
      nodes: [node('a'), node('b'), node('c'), node('d')],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'c', target: 'd' },
      ],
    });
    const y = (id: string) => positions.get(id)?.y ?? Number.NaN;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBe(y('c'));
    expect(y('c')).toBeLessThan(y('d'));
    // Siblings sit side by side, a node width plus the gap apart.
    const dx = Math.abs((positions.get('b')?.x ?? 0) - (positions.get('c')?.x ?? 0));
    expect(dx).toBeGreaterThanOrEqual(NODE_WIDTH);
  });

  it('places a graph that is only a cycle, and self-loops, without throwing', () => {
    const spec: LayoutSpec = {
      nodes: [node('a'), node('b')],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
        { source: 'a', target: 'a' },
      ],
    };
    const positions = layoutWithBreadthfirst(spec);
    expectComplete(positions, spec);
    expectNoOverlaps(positions, spec);
  });

  it('boxes every Group around its members, nested Groups included', () => {
    const spec: LayoutSpec = {
      nodes: [node('a'), node('b'), node('c')],
      edges: [{ source: 'a', target: 'b' }],
      parents: new Map([
        ['a', 'inner'],
        ['b', 'inner'],
        ['inner', 'outer'],
        ['c', 'outer'],
      ]),
    };
    const positions = layoutWithBreadthfirst(spec);
    expectComplete(positions, spec);
    expectMembersInsideGroups(positions, spec);
  });

  it('rejects an edge to an unknown id before placing anything', () => {
    expect(() =>
      layoutWithBreadthfirst({ nodes: [node('a')], edges: [{ source: 'a', target: 'ghost' }] }),
    ).toThrow(LayoutSpecError);
  });

  it('handles the 150-node pane Neighborhood and the 1,000-node Overview', () => {
    for (const spec of [paneSpec(150, { compound: true }), expandedOverviewSpec()]) {
      const positions = layoutWithBreadthfirst(spec);
      expectComplete(positions, spec);
      expectMembersInsideGroups(positions, spec);
    }
  });
});
