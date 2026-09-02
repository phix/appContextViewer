import { describe, expect, it } from 'vitest';
import {
  expectComplete,
  expectMembersInsideGroups,
  expectNoOverlaps,
  HEAVY_TEST_TIMEOUT,
} from './check-positions';
import { createOverviewLayout, type LayoutSpec, LayoutSpecError } from './index';
import {
  collapsedOverviewSpec,
  expandedOverviewSpec,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './sample-specs';

const node = (id: string) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT });

// In Node, createOverviewLayout() runs elkjs on the calling thread (docs/architecture.md: "called
// directly in Node tests"); the browser adapter is exercised in overview.test.ts and by the e2e spec.
describe('createOverviewLayout, elk directly in Node', () => {
  it(
    'lays out the collapsed Overview: 123 Repositories with their Group Dependencies',
    async () => {
      const spec = collapsedOverviewSpec();
      expect(spec.nodes).toHaveLength(123);
      const layout = createOverviewLayout();
      try {
        const positions = await layout.run(spec);
        expectComplete(positions, spec);
        expectNoOverlaps(positions, spec);
      } finally {
        layout.dispose();
      }
    },
    HEAVY_TEST_TIMEOUT,
  );

  it(
    'lays out Expand all: 1,000 Applications inside 123 Repository boxes, every member inside its box',
    async () => {
      const spec = expandedOverviewSpec();
      expect(spec.nodes).toHaveLength(1000);
      expect(new Set(spec.parents?.values()).size).toBe(123);
      const layout = createOverviewLayout();
      try {
        const positions = await layout.run(spec);
        expectComplete(positions, spec);
        expectMembersInsideGroups(positions, spec);
      } finally {
        layout.dispose();
      }
    },
    HEAVY_TEST_TIMEOUT,
  );

  it(
    'keeps nested Groups inside their parents and accepts an edge to a Group',
    async () => {
      const spec: LayoutSpec = {
        nodes: [node('a'), node('b'), node('c'), node('d')],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'inner', target: 'c' },
          { source: 'c', target: 'd' },
        ],
        parents: new Map([
          ['a', 'inner'],
          ['b', 'inner'],
          ['inner', 'outer'],
          ['c', 'outer'],
        ]),
      };
      const layout = createOverviewLayout();
      try {
        const positions = await layout.run(spec);
        expectComplete(positions, spec);
        expectMembersInsideGroups(positions, spec);
        // Groups are laid out top-down like nodes: the edge inner -> c puts c below inner.
        expect(positions.get('inner')?.y).toBeLessThan(positions.get('c')?.y ?? Number.NaN);
        expect(positions.get('c')?.y).toBeLessThan(positions.get('d')?.y ?? Number.NaN);
      } finally {
        layout.dispose();
      }
    },
    HEAVY_TEST_TIMEOUT,
  );

  it(
    'reuses one worker across runs and rejects runs after dispose',
    async () => {
      const layout = createOverviewLayout();
      const spec: LayoutSpec = { nodes: [node('a')], edges: [] };
      await layout.run(spec);
      await layout.run(spec);
      layout.dispose();
      await expect(layout.run(spec)).rejects.toThrow('disposed');
    },
    HEAVY_TEST_TIMEOUT,
  );

  it(
    'rejects an invalid spec with LayoutSpecError',
    async () => {
      const layout = createOverviewLayout();
      try {
        await expect(
          layout.run({ nodes: [node('a')], edges: [{ source: 'a', target: 'ghost' }] }),
        ).rejects.toThrow(LayoutSpecError);
      } finally {
        layout.dispose();
      }
    },
    HEAVY_TEST_TIMEOUT,
  );
});
