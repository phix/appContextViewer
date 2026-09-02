/**
 * The layout module's input and output: plain data, no Cytoscape (docs/architecture.md, "layout").
 *
 * A spec lists the leaf nodes with their sizes, the edges between ids, and optionally a parent map
 * that makes some ids compound Groups. A Group is implicit: every value in `parents` is one, and a
 * Group may itself have a parent. A collapsed Group is an ordinary leaf (it has a size, no members).
 * Positions come back as centres in one absolute coordinate space; a Group's entry also carries the
 * width and height the layout gave it, so a caller can draw the box without asking the engine.
 */

export type Id = string;

export type LayoutNode = { readonly id: Id; readonly width: number; readonly height: number };
export type LayoutEdge = { readonly source: Id; readonly target: Id };

export type LayoutSpec = {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  /** Member id to Group id. Every Group id named here is laid out as a compound node. */
  readonly parents?: ReadonlyMap<Id, Id>;
};

/** The Overview takes the same shape; the alias marks which seam a spec crosses. */
export type OverviewSpec = LayoutSpec;

/** A node's centre. `width` and `height` are present on Groups only: the layout sized them. */
export type Position = { x: number; y: number; width?: number; height?: number };
export type Positions = Map<Id, Position>;

/** Thrown for a spec no engine could lay out; never caught by the fallback chain. */
export class LayoutSpecError extends Error {
  override name = 'LayoutSpecError';
}

/** A spec with its Groups resolved; every engine starts from this. */
export type IndexedSpec = {
  readonly spec: LayoutSpec;
  readonly leaves: ReadonlyMap<Id, LayoutNode>;
  readonly groups: ReadonlySet<Id>;
  /** Group id to its direct members, leaves and Groups alike, in spec order. */
  readonly members: ReadonlyMap<Id, readonly Id[]>;
  /** Ids with no parent, in spec order: leaves first, then Groups. */
  readonly roots: readonly Id[];
  readonly parentOf: (id: Id) => Id | undefined;
};

export function indexSpec(spec: LayoutSpec): IndexedSpec {
  const leaves = new Map<Id, LayoutNode>();
  for (const node of spec.nodes) {
    if (leaves.has(node.id)) {
      throw new LayoutSpecError(`duplicate node id "${node.id}"`);
    }
    if (!(isFiniteSize(node.width) && isFiniteSize(node.height))) {
      throw new LayoutSpecError(`node "${node.id}" needs finite, non-negative width and height`);
    }
    leaves.set(node.id, node);
  }

  const parents = spec.parents ?? new Map<Id, Id>();
  const groups = new Set<Id>(parents.values());
  const members = new Map<Id, Id[]>();
  for (const group of groups) {
    if (leaves.has(group)) {
      throw new LayoutSpecError(`"${group}" is both a node and a Group`);
    }
    members.set(group, []);
  }
  for (const [member, group] of parents) {
    if (!leaves.has(member) && !groups.has(member)) {
      throw new LayoutSpecError(`parent map names unknown member "${member}"`);
    }
    members.get(group)?.push(member);
  }
  for (const group of groups) {
    let cursor: Id | undefined = group;
    const seen = new Set<Id>();
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        throw new LayoutSpecError(`Group "${group}" is nested inside itself`);
      }
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
  }

  for (const edge of spec.edges) {
    for (const end of [edge.source, edge.target]) {
      if (!leaves.has(end) && !groups.has(end)) {
        throw new LayoutSpecError(
          `edge ${edge.source} -> ${edge.target} names unknown id "${end}"`,
        );
      }
    }
  }

  const roots = [...leaves.keys(), ...groups].filter((id) => !parents.has(id));
  return { spec, leaves, groups, members, roots, parentOf: (id) => parents.get(id) };
}

function isFiniteSize(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Axis-aligned box in absolute coordinates, top-left origin. */
export type Box = { left: number; top: number; width: number; height: number };

export function boxOfLeaf(node: LayoutNode, centre: { x: number; y: number }): Box {
  return {
    left: centre.x - node.width / 2,
    top: centre.y - node.height / 2,
    width: node.width,
    height: node.height,
  };
}

export function positionOfBox(box: Box): Required<Position> {
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    width: box.width,
    height: box.height,
  };
}

/**
 * Boxes for the Groups an engine did not size itself, derived bottom-up from their members'
 * boxes: the union of the members, so every member lies inside by construction. `known` holds the
 * boxes already decided (every leaf, plus any Group the engine sized); Groups missing from it are
 * added, deepest first, and the same map is returned.
 */
export function deriveGroupBoxes(indexed: IndexedSpec, known: Map<Id, Box>): Map<Id, Box> {
  const boxOf = (id: Id): Box => {
    const existing = known.get(id);
    if (existing) {
      return existing;
    }
    const memberBoxes = (indexed.members.get(id) ?? []).map(boxOf);
    const box =
      memberBoxes.length === 0 ? { left: 0, top: 0, width: 0, height: 0 } : union(memberBoxes);
    known.set(id, box);
    return box;
  };
  for (const group of indexed.groups) {
    boxOf(group);
  }
  return known;
}

function union(boxes: readonly Box[]): Box {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.left + box.width);
    bottom = Math.max(bottom, box.top + box.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

export function assertFinite(engine: string, id: Id, ...values: number[]): void {
  if (!values.every(Number.isFinite)) {
    throw new Error(`${engine} produced a non-finite position for "${id}"`);
  }
}
