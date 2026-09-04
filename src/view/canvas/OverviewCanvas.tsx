/**
 * The Overview's Cytoscape renderer. It receives render-ready elements and the positions elk
 * produced in the worker, applies its own stylesheet, animates nodes to their new positions and
 * emits interaction callbacks. It knows no graph domain and never calls a layout engine
 * (docs/architecture.md: Cytoscape lives only under src/view/canvas/, the view never lays out).
 *
 * One Cytoscape instance lives for the life of the component and is diffed on every update, which
 * is what makes the 300 ms animation possible: a node that survives an open, a close or an Expand
 * all glides to its new position instead of being torn down and rebuilt somewhere else.
 */

import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Budget 12 (docs/performance-budgets.md): the animation of Overview nodes to new positions is a
 * fixed design constant, not a measured ceiling. It is published on the canvas element as
 * `data-animation-ms` so a test can read the duration that is actually configured rather than time
 * a run, which is what the ticket asks for.
 */
export const ANIMATION_MS = 300;

/** Padding around the fitted graph, in rendered pixels. */
const FIT_PADDING = 30;

export type OverviewNodeKind =
  /** A collapsed Group: one leaf node standing for all its members. */
  | 'collapsed'
  /** An open Group: a compound parent holding its members. */
  | 'open'
  /**
   * An open Group's label chip: the Group value and member count, and the control that closes it.
   *
   * The obvious thing would be to label the compound parent and let the user click its padding
   * band. Cytoscape will not do that reliably: a compound node sizes itself to its children's
   * bounds, and `padding` did not widen it here at all (measured, elkjs 0.12.0 / cytoscape 3.34),
   * so the parent ends up exactly as big as its members and has no band of its own left to hit.
   * A chip is a real leaf with a real size, so it is always there to click. It is parented to the
   * Group, and placed in the top padding elk reserves inside the Group box (ELK_GROUP_OPTIONS).
   */
  | 'label'
  /** An Application inside an open Group. */
  | 'member';

export interface OverviewCanvasNode {
  readonly id: string;
  /** The Group id or Application id this node stands for; what the callbacks report. */
  readonly sourceId: string;
  readonly label: string;
  readonly kind: OverviewNodeKind;
  /** The open Group a member sits in. */
  readonly parent?: string;
  readonly width?: number;
  readonly height?: number;
  /** In the highlighted Neighborhood (docs/center.md, 7). */
  readonly highlighted?: boolean;
  /** Holds the Center, so it cannot be collapsed. */
  readonly locked?: boolean;
}

export interface OverviewCanvasEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  /** A Group Dependency's count; absent on a member-level Dependency. */
  readonly label?: string;
  readonly kind: 'group' | 'member';
  readonly highlighted?: boolean;
}

export interface OverviewCanvasElements {
  readonly nodes: readonly OverviewCanvasNode[];
  readonly edges: readonly OverviewCanvasEdge[];
}

export interface OverviewCanvasPosition {
  readonly x: number;
  readonly y: number;
  /** Present on Groups: the box elk gave them, which is what places the label chip. */
  readonly width?: number;
  readonly height?: number;
}

/** Inset of a Group's label chip from the top-left corner of the box elk gave the Group. */
const LABEL_INSET_X = 8;
const LABEL_INSET_Y = 4;

export interface OverviewCanvasProps {
  readonly elements: OverviewCanvasElements;
  readonly positions: ReadonlyMap<string, OverviewCanvasPosition>;
  /** A collapsed Group was clicked. */
  readonly onOpenGroup: (groupId: string) => void;
  /** An open Group's label chip was clicked; ignored while the Group holds the Center. */
  readonly onCollapseGroup: (groupId: string) => void;
  readonly onSelectApplication: (id: string) => void;
  /** Called after the browser has painted a new element set or new positions. */
  readonly onPainted?: () => void;
}

export function OverviewCanvas({
  elements,
  positions,
  onOpenGroup,
  onCollapseGroup,
  onSelectApplication,
  onPainted,
}: OverviewCanvasProps) {
  const mount = useRef<HTMLDivElement>(null);
  const core = useRef<Core | null>(null);
  // The handlers are bound once, so a re-render with fresh closures never rebuilds the instance.
  const handlers = useRef({ onOpenGroup, onCollapseGroup, onSelectApplication });
  handlers.current = { onOpenGroup, onCollapseGroup, onSelectApplication };

  useEffect(() => {
    const container = mount.current;
    if (container === null) {
      return;
    }
    const cy = cytoscape({
      container,
      style: overviewStyle,
      layout: { name: 'preset', fit: false },
      minZoom: 0.02,
      maxZoom: 3,
      wheelSensitivity: 0.22,
    });
    core.current = cy;
    container.dataset.animationMs = String(ANIMATION_MS);
    (container as HTMLDivElement & { __cy?: Core }).__cy = cy;

    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular;
      const kind = node.data('kind') as OverviewNodeKind;
      const sourceId = String(node.data('sourceId'));
      if (kind === 'collapsed') {
        handlers.current.onOpenGroup(sourceId);
      } else if (kind === 'label') {
        handlers.current.onCollapseGroup(sourceId);
      } else if (kind === 'member') {
        handlers.current.onSelectApplication(sourceId);
      }
    });

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => cy.resize()) : null;
    observer?.observe(container);
    const refreshOffset = () => cy.resize();
    window.addEventListener('scroll', refreshOffset, { passive: true, capture: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', refreshOffset, { capture: true });
      delete (container as HTMLDivElement & { __cy?: Core }).__cy;
      core.current = null;
      cy.destroy();
    };
  }, []);

  useEffect(() => {
    const cy = core.current;
    const container = mount.current;
    if (cy === null || container === null) {
      return;
    }
    const first = cy.elements().length === 0;
    sync(cy, elements, positions, first);
    container.dataset.ready = 'true';
    container.dataset.groups = String(
      elements.nodes.filter((node) => node.kind !== 'member').length,
    );
    container.dataset.collapsed = String(
      elements.nodes.filter((node) => node.kind === 'collapsed').length,
    );
    container.dataset.open = String(elements.nodes.filter((node) => node.kind === 'open').length);
    container.dataset.members = String(
      elements.nodes.filter((node) => node.kind === 'member').length,
    );
    container.dataset.edges = String(elements.edges.length);

    // The fit follows the animation, so the viewport settles on where the nodes actually landed.
    const settle = first
      ? undefined
      : setTimeout(() => {
          if (core.current === cy) {
            cy.fit(undefined, FIT_PADDING);
          }
        }, ANIMATION_MS);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => onPainted?.());
    });
    return () => {
      if (settle !== undefined) {
        clearTimeout(settle);
      }
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [elements, positions, onPainted]);

  return (
    <div
      ref={mount}
      class="overview-canvas"
      data-testid="overview-canvas"
      role="application"
      aria-label="Overview graph"
      style="width:100%;height:min(70vh,760px);min-height:420px;border:1px solid #313b4a;border-radius:10px;background:#0e131b"
    />
  );
}

function sync(
  cy: Core,
  elements: OverviewCanvasElements,
  positions: ReadonlyMap<string, OverviewCanvasPosition>,
  first: boolean,
): void {
  const nodeById = new Map(elements.nodes.map((node) => [node.id, node]));
  const wanted = new Set<string>([...nodeById.keys(), ...elements.edges.map((edge) => edge.id)]);
  const animating: { node: NodeSingular; to: OverviewCanvasPosition }[] = [];

  cy.batch(() => {
    cy.elements()
      .filter((element) => !wanted.has(element.id()))
      .remove();

    const present = new Set(cy.elements().map((element) => element.id()));
    // Parents first: Cytoscape needs a compound node to exist before a child names it.
    const additions: ElementDefinition[] = [];
    for (const node of elements.nodes) {
      if (node.kind === 'open' && !present.has(node.id)) {
        additions.push(nodeDefinition(node, positions));
      }
    }
    for (const node of elements.nodes) {
      if (node.kind !== 'open' && !present.has(node.id)) {
        additions.push(nodeDefinition(node, positions));
      }
    }
    if (additions.length > 0) {
      cy.add(additions);
    }
    const newEdges = elements.edges.filter((edge) => !present.has(edge.id));
    if (newEdges.length > 0) {
      cy.add(
        newEdges.map((edge) => ({
          group: 'edges' as const,
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label ?? '',
            kind: edge.kind,
            highlighted: edge.highlighted ? 'true' : 'false',
          },
        })),
      );
    }

    // Survivors: refresh what the model says about them, and collect the ones that must move.
    for (const id of present) {
      const node = nodeById.get(id);
      if (node === undefined) {
        continue;
      }
      const element = cy.getElementById(id) as NodeSingular;
      element.data(dataOf(node));
      const to = positionOf(node, positions);
      if (to !== undefined) {
        animating.push({ node: element, to });
      }
    }
    for (const edge of elements.edges) {
      if (present.has(edge.id)) {
        cy.getElementById(edge.id).data({
          label: edge.label ?? '',
          kind: edge.kind,
          highlighted: edge.highlighted ? 'true' : 'false',
        });
      }
    }
  });

  if (first) {
    for (const { node, to } of animating) {
      node.position({ x: to.x, y: to.y });
    }
    cy.fit(undefined, FIT_PADDING);
    return;
  }
  for (const { node, to } of animating) {
    const at = node.position();
    if (at.x === to.x && at.y === to.y) {
      continue;
    }
    node.stop(true);
    node.animate(
      { position: { x: to.x, y: to.y } },
      { duration: ANIMATION_MS, easing: 'ease-out' },
    );
  }
}

/**
 * Where a node goes. Leaves take what elk produced. A label chip is not in the layout spec at all —
 * it is placed in the top-left of the box elk gave its Group, inside the padding elk reserved there.
 * A compound parent takes no position: Cytoscape derives it from its children.
 */
function positionOf(
  node: OverviewCanvasNode,
  positions: ReadonlyMap<string, OverviewCanvasPosition>,
): { x: number; y: number } | undefined {
  if (node.kind === 'open') {
    return undefined;
  }
  if (node.kind !== 'label') {
    const own = positions.get(node.id);
    return own === undefined ? undefined : { x: own.x, y: own.y };
  }
  const box = node.parent === undefined ? undefined : positions.get(node.parent);
  if (box?.width === undefined || box.height === undefined) {
    return undefined;
  }
  return {
    x: box.x - box.width / 2 + (node.width ?? 0) / 2 + LABEL_INSET_X,
    y: box.y - box.height / 2 + (node.height ?? 0) / 2 + LABEL_INSET_Y,
  };
}

function nodeDefinition(
  node: OverviewCanvasNode,
  positions: ReadonlyMap<string, OverviewCanvasPosition>,
): ElementDefinition {
  const position = positionOf(node, positions);
  return {
    group: 'nodes',
    data: dataOf(node),
    ...(position === undefined ? {} : { position }),
  };
}

function dataOf(node: OverviewCanvasNode): Record<string, unknown> {
  return {
    id: node.id,
    sourceId: node.sourceId,
    label: node.label,
    kind: node.kind,
    parent: node.parent,
    highlighted: node.highlighted ? 'true' : 'false',
    locked: node.locked ? 'true' : 'false',
    width: node.width ?? 1,
    height: node.height ?? 1,
  };
}

/**
 * The Overview's own stylesheet. It is deliberately separate from the Neighborhood pane's: the
 * Overview draws Groups as first-class nodes with a member count, and an open Group's box must
 * take clicks on its label, which the pane's Group boxes must not.
 */
export const overviewStyle: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'font-family': 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
      'font-size': '12px',
      'text-wrap': 'ellipsis',
      'text-max-width': '160px',
      color: '#e7ecf3',
      'background-color': '#1a212c',
      'border-color': '#313b4a',
      'border-width': 1,
      'text-valign': 'center',
      'text-halign': 'center',
      'overlay-opacity': 0,
    },
  },
  {
    // Only leaves take their size from the view. An open Group must be left to Cytoscape, which
    // sizes a compound node to its members plus `padding` — and that padding band is the label
    // strip the user clicks to close it. Forcing `width` on a parent silently drops the padding,
    // leaving the parent exactly as big as its members and nothing of it left to click.
    selector: 'node[kind = "collapsed"], node[kind = "member"], node[kind = "label"]',
    style: { width: 'data(width)', height: 'data(height)' },
  },
  {
    selector: 'node[kind = "collapsed"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#202836',
      'border-color': '#475063',
      'font-weight': 600,
    },
  },
  {
    selector: 'node[kind = "open"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#151b24',
      'background-opacity': 0.65,
      'border-color': '#475063',
      'border-style': 'dashed',
      'border-width': 1,
      // The text lives on the label chip; a second copy on the box would double every Group name.
      label: '',
      'z-compound-depth': 'bottom',
    },
  },
  {
    selector: 'node[kind = "label"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#202836',
      'border-color': '#475063',
      'font-weight': 600,
      'text-max-width': '180px',
      'z-index': 25,
    },
  },
  {
    selector: 'node[kind = "member"]',
    style: { shape: 'round-rectangle', 'background-color': '#131924', 'border-color': '#313b4a' },
  },
  {
    selector: 'node[highlighted = "true"]',
    style: {
      'border-color': '#4fc3f7',
      'border-width': 3,
      'background-color': '#0f2d3a',
      'z-index': 20,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      label: 'data(label)',
      'font-size': '10px',
      color: '#8a94a6',
      'text-background-color': '#0e131b',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'line-color': '#3d4759',
      'target-arrow-color': '#5c6577',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
      opacity: 0.72,
      // An open Group draws below every node ('z-compound-depth'), so without this its own edges
      // sit over its label band and swallow the click that would close it. The Overview has no
      // interaction on an edge, so giving them up costs nothing and makes every click reach a node.
      events: 'no',
    },
  },
  {
    selector: 'edge[kind = "member"]',
    style: { width: 1, opacity: 0.5 },
  },
  {
    selector: 'edge[highlighted = "true"]',
    style: {
      'line-color': '#4fc3f7',
      'target-arrow-color': '#4fc3f7',
      opacity: 1,
      'z-index': 30,
    },
  },
];
