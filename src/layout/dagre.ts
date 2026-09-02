import dagre from '@dagrejs/dagre';
import {
  assertFinite,
  type Box,
  boxOfLeaf,
  deriveGroupBoxes,
  type Id,
  type IndexedSpec,
  indexSpec,
  type LayoutSpec,
  LayoutSpecError,
  type Positions,
  positionOfBox,
} from './spec';

/** From the layout research (docs/research/cytoscape-layouts.md): top-down, 30 px apart, 60 px ranks. */
export const DAGRE_OPTIONS = { rankdir: 'TB', nodesep: 30, ranksep: 60 } as const;

/**
 * dagre, synchronously. Throws on dagre's own failure (`Not possible to find intersection inside
 * of the rectangle` is the one the research hit) and on a non-finite coordinate; the caller decides
 * whether to fall back.
 *
 * An edge may end on a Group; dagre ranks it through a member (see representativeOf below).
 *
 * Compound Groups go to dagre as clusters, except a Group with a single member: dagre's nesting
 * graph adds border nodes for every cluster on every rank it spans, and at the pane cap roughly half
 * the Repositories hold one Application, so those clusters cost 15 to 25 percent of the layout time
 * for a box that is fully determined by its member anyway. Their boxes are derived after the layout.
 */
export function layoutWithDagre(spec: LayoutSpec): Positions {
  const indexed = indexSpec(spec);
  const positions: Positions = new Map();
  if (indexed.leaves.size === 0) {
    for (const group of indexed.groups) {
      positions.set(group, { x: 0, y: 0, width: 0, height: 0 });
    }
    return positions;
  }

  const clusters = new Set<Id>();
  for (const group of indexed.groups) {
    if ((indexed.members.get(group)?.length ?? 0) > 1) {
      clusters.add(group);
    }
  }
  const clusterOf = (id: Id): Id | undefined => {
    let parent = indexed.parentOf(id);
    while (parent !== undefined && !clusters.has(parent)) {
      parent = indexed.parentOf(parent);
    }
    return parent;
  };

  const graph = new dagre.graphlib.Graph({ compound: clusters.size > 0, multigraph: true });
  graph.setGraph({ ...DAGRE_OPTIONS });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of indexed.leaves.values()) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const cluster of clusters) {
    graph.setNode(cluster, {});
  }
  for (const id of [...indexed.leaves.keys(), ...clusters]) {
    const parent = clusterOf(id);
    if (parent !== undefined) {
      graph.setParent(id, parent);
    }
  }

  // An edge may end on a Group (the Overview draws Group Dependencies, and elk lays such an edge
  // out on the Group itself). dagre cannot: ranking an edge on a cluster id throws
  // `TypeError: Cannot set properties of undefined (setting 'rank')` from its nesting graph, and a
  // flattened single-member Group is not a dagre node at all. Both endpoints are therefore ranked
  // through a representative member, the first leaf under the Group in spec order; the Group's box
  // still contains it, so the drawn relation is the same one, one level down. An edge between two
  // members of the same Group collapses to a self-loop, which dagre places without complaint.
  const representatives = new Map<Id, Id>();
  const representativeOf = (id: Id): Id => {
    if (indexed.leaves.has(id)) {
      return id;
    }
    const known = representatives.get(id);
    if (known !== undefined) {
      return known;
    }
    for (const member of indexed.members.get(id) ?? []) {
      const leaf = representativeOf(member);
      if (indexed.leaves.has(leaf)) {
        representatives.set(id, leaf);
        return leaf;
      }
    }
    throw new LayoutSpecError(`Group "${id}" holds no node to lay out`);
  };
  indexed.spec.edges.forEach((edge, i) => {
    graph.setEdge(representativeOf(edge.source), representativeOf(edge.target), {}, `e${i}`);
  });

  dagre.layout(graph);

  const boxes = new Map<Id, Box>();
  for (const node of indexed.leaves.values()) {
    const laidOut = graph.node(node.id);
    assertFinite('dagre', node.id, laidOut.x ?? Number.NaN, laidOut.y ?? Number.NaN);
    const centre = { x: laidOut.x as number, y: laidOut.y as number };
    positions.set(node.id, centre);
    boxes.set(node.id, boxOfLeaf(node, centre));
  }
  for (const cluster of clusters) {
    const laidOut = graph.node(cluster);
    const { x, y, width, height } = laidOut;
    assertFinite('dagre', cluster, x ?? Number.NaN, y ?? Number.NaN, width, height);
    boxes.set(cluster, {
      left: (x as number) - width / 2,
      top: (y as number) - height / 2,
      width,
      height,
    });
  }
  setGroupPositions(indexed, boxes, positions);
  return positions;
}

/** Fills in every Group's position from `boxes`, deriving the boxes the engine did not size. */
export function setGroupPositions(
  indexed: IndexedSpec,
  boxes: Map<Id, Box>,
  positions: Positions,
): void {
  for (const [id, box] of deriveGroupBoxes(indexed, boxes)) {
    if (indexed.groups.has(id)) {
      positions.set(id, positionOfBox(box));
    }
  }
}
