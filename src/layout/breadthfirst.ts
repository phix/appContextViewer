import { setGroupPositions } from './dagre';
import { type Box, boxOfLeaf, type Id, indexSpec, type LayoutSpec, type Positions } from './spec';

const NODE_GAP = 30;
const ROW_GAP = 60;

/**
 * The last resort: rows by breadth-first depth from the sources, nodes side by side within a row,
 * every row centred. Never throws for a valid spec and finishes in linear time. Like Cytoscape's
 * breadthfirst it ignores Groups when placing nodes; each Group's box is then the union of its
 * members, so the boxes are correct but may overlap each other. Edges to a Group are not traversed.
 */
export function layoutWithBreadthfirst(spec: LayoutSpec): Positions {
  const indexed = indexSpec(spec);
  const ids = [...indexed.leaves.keys()];
  const successors = new Map<Id, Id[]>(ids.map((id) => [id, []]));
  const indegree = new Map<Id, number>(ids.map((id) => [id, 0]));
  for (const edge of spec.edges) {
    if (edge.source === edge.target) {
      continue;
    }
    const out = successors.get(edge.source);
    if (out && indegree.has(edge.target)) {
      out.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }

  // Sources first, in spec order; a component with no source (a pure cycle) starts from its first
  // node in spec order once everything reachable from the sources has been placed.
  const depth = new Map<Id, number>();
  const rows: Id[][] = [];
  const visit = (start: Id) => {
    depth.set(start, 0);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head] as Id;
      const d = depth.get(id) as number;
      const row = rows[d] ?? [];
      rows[d] = row;
      row.push(id);
      for (const next of successors.get(id) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, d + 1);
          queue.push(next);
        }
      }
    }
  };
  for (const id of ids) {
    if (indegree.get(id) === 0 && !depth.has(id)) {
      visit(id);
    }
  }
  for (const id of ids) {
    if (!depth.has(id)) {
      visit(id);
    }
  }

  const positions: Positions = new Map();
  const boxes = new Map<Id, Box>();
  let top = 0;
  for (const row of rows) {
    const nodes = row.map((id) => indexed.leaves.get(id)).filter((node) => node !== undefined);
    const rowHeight = Math.max(0, ...nodes.map((node) => node.height));
    const rowWidth =
      nodes.reduce((sum, node) => sum + node.width, 0) + NODE_GAP * Math.max(0, nodes.length - 1);
    let left = -rowWidth / 2;
    for (const node of nodes) {
      const centre = { x: left + node.width / 2, y: top + rowHeight / 2 };
      positions.set(node.id, centre);
      boxes.set(node.id, boxOfLeaf(node, centre));
      left += node.width + NODE_GAP;
    }
    top += rowHeight + ROW_GAP;
  }
  setGroupPositions(indexed, boxes, positions);
  return positions;
}
