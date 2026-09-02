/** Test-only assertions shared by the engine tests; not exported from the module index. */
import { expect } from 'vitest';
import type { Id, LayoutSpec, Position, Positions } from './spec';

/** Every node and every Group has a finite centre; every Group has a finite box. */
export function expectComplete(positions: Positions, spec: LayoutSpec): void {
  const groups = new Set(spec.parents?.values() ?? []);
  expect(positions.size).toBe(spec.nodes.length + groups.size);
  for (const node of spec.nodes) {
    const position = positions.get(node.id);
    expect(position, node.id).toBeDefined();
    expect(Number.isFinite(position?.x), `${node.id}.x`).toBe(true);
    expect(Number.isFinite(position?.y), `${node.id}.y`).toBe(true);
  }
  for (const group of groups) {
    const position = positions.get(group);
    expect(position, group).toBeDefined();
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Number.isFinite(position?.[key]), `${group}.${key}`).toBe(true);
    }
  }
}

/** Every member's box lies inside its Group's box, Groups nested inside Groups included. */
export function expectMembersInsideGroups(positions: Positions, spec: LayoutSpec): void {
  const sizes = new Map(spec.nodes.map((node) => [node.id, node]));
  const boxOf = (id: Id) => {
    const position = positions.get(id) as Position;
    const width = position.width ?? sizes.get(id)?.width ?? 0;
    const height = position.height ?? sizes.get(id)?.height ?? 0;
    return {
      left: position.x - width / 2,
      top: position.y - height / 2,
      right: position.x + width / 2,
      bottom: position.y + height / 2,
    };
  };
  const epsilon = 1e-6;
  let checked = 0;
  for (const [member, group] of spec.parents ?? []) {
    const inner = boxOf(member);
    const outer = boxOf(group);
    const label = `${member} inside ${group}`;
    expect(inner.left, label).toBeGreaterThanOrEqual(outer.left - epsilon);
    expect(inner.top, label).toBeGreaterThanOrEqual(outer.top - epsilon);
    expect(inner.right, label).toBeLessThanOrEqual(outer.right + epsilon);
    expect(inner.bottom, label).toBeLessThanOrEqual(outer.bottom + epsilon);
    checked++;
  }
  expect(checked).toBe(spec.parents?.size ?? 0);
}

/** No two leaves of a flat spec overlap (centre distance under the sum of half sizes on both axes). */
export function expectNoOverlaps(positions: Positions, spec: LayoutSpec): void {
  const nodes = spec.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as LayoutSpec['nodes'][number];
      const b = nodes[j] as LayoutSpec['nodes'][number];
      const pa = positions.get(a.id) as Position;
      const pb = positions.get(b.id) as Position;
      const overlapX = Math.abs(pa.x - pb.x) < (a.width + b.width) / 2 - 1e-6;
      const overlapY = Math.abs(pa.y - pb.y) < (a.height + b.height) / 2 - 1e-6;
      expect(overlapX && overlapY, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}
