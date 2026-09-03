/**
 * The Space's engine seam (docs/space-view.md; docs/architecture.md, "anything that renders a scene
 * lives under src/view/canvas/, and the view calls a layout through an interface rather than
 * importing an engine directly").
 *
 * Nothing here is imported statically by anything the shell loads. `loadSpaceEngine` is the ONLY
 * place `3d-force-graph` and `three` are named, and it names them inside an `await import(...)`, so
 * rolldown emits them as their own chunk fetched on first entry to the Space and never before
 * (budget 13; `e2e/space.spec.ts` asserts the entry chunk is free of them and that the fetch happens
 * on entry). Keep every engine reference inside that function body.
 *
 * The seam is deliberately narrow and dumb: it takes render-ready nodes and edges and a style, and
 * it answers what it actually holds. It knows no graph domain, no Center, no Tag, and no Group; the
 * Space component decides all of that and hands the answers down, exactly as `Canvas` receives
 * render-ready elements from the pane.
 *
 * The one behaviour that is not "hand it through": **positions are pinned when the simulation
 * settles**. `three-forcegraph` resumes its engine on any styling change, and a resumed d3 tick
 * moves nodes even at minimum alpha, so "recolouring does not re-lay out" would otherwise be a
 * claim about timing rather than a property. Writing `fx/fy/fz` makes it structural: after
 * `onSettled`, no restyle can move a node, and `positions()` before and after a restyle is an
 * assertion with a subject.
 */

/** A point in the Space. The engine writes `x`, `y` and `z` onto the node records it is given. */
export interface SpacePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type SpaceNodeKind = 'application' | 'external';

/**
 * One Application or External. `id` is unique across both kinds (an External id never contains a
 * slash and an Application id always does, but the Space does not rely on that); `sourceId` is what
 * the store's Center is spelled with, and is what `onSelect` reports.
 */
export interface SpaceNode {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: SpaceNodeKind;
  readonly label: string;
  /** The Group id under the current grouping Attribute; the colour is derived from it. */
  readonly group: string;
}

/** One Dependency, source and target being `SpaceNode.id`s. */
export interface SpaceEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface SpaceGraph {
  readonly nodes: readonly SpaceNode[];
  readonly edges: readonly SpaceEdge[];
}

/**
 * Everything the scene paints that is not a position. Colours may carry an alpha
 * (`rgba(r,g,b,a)`): three-forcegraph multiplies the material opacity by it, which is how a node
 * recedes without a second global knob.
 */
export interface SpaceStyle {
  readonly nodeColour: (node: SpaceNode) => string;
  /** `nodeVal`; the drawn radius is its cube root times `NODE_REL_SIZE`. */
  readonly nodeSize: (node: SpaceNode) => number;
  readonly linkColour: (edge: SpaceEdge) => string;
}

export interface SpaceSceneOptions {
  readonly container: HTMLElement;
  /** `prefers-reduced-motion: reduce`: no auto-rotation, and every transition takes 0 ms. */
  readonly reducedMotion: boolean;
  readonly onSelect: (node: { readonly kind: SpaceNodeKind; readonly id: string }) => void;
  /** Fired once the simulation has settled and positions have been pinned. */
  readonly onSettled?: () => void;
  /** Injected by tests; the app takes the default. */
  readonly load?: SpaceEngineLoader;
  /** Injected by tests so auto-rotation can be stepped without a real frame clock. */
  readonly now?: () => number;
  readonly requestFrame?: (callback: (time: number) => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

/** What the Space component drives. Every method is safe to call after `dispose`. */
export interface SpaceScene {
  /** Replaces the drawn graph. Re-heats the simulation; this is the only call that lays out. */
  setGraph(graph: SpaceGraph): void;
  /** Colours and sizes only. Never re-heats and, after settling, provably cannot move a node. */
  setStyle(style: SpaceStyle): void;
  /** Read back from the engine's own data, so it reports what the scene HOLDS. */
  drawn(): SpaceDrawn;
  /** Node meshes actually in the three.js scene graph, counted by walking it. */
  paintedNodes(): number;
  positions(): ReadonlyMap<string, SpacePoint>;
  screenPoint(id: string): { readonly x: number; readonly y: number } | null;
  /**
   * Points the camera straight at one drawn node, centring it in the frame. Test seam: with 1,000+
   * nodes on screen after settling, which ones are visible and where is a property of the current
   * camera pose, not of the graph, so a click test needs a way to put a SPECIFIC node on screen
   * deterministically rather than searching the projected scene for whichever one happens to land in
   * bounds. Returns false when `id` was never drawn.
   */
  focus(id: string): boolean;
  settled(): boolean;
  autoRotating(): boolean;
  /** Test seam: advances auto-rotation as a frame would. Returns whether the camera moved. */
  stepRotation(time: number): boolean;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface SpaceDrawn {
  readonly nodes: number;
  readonly edges: number;
}

// ---------------------------------------------------------------- constants

/**
 * Cooldown ticks. d3-force's default alpha decay reaches its minimum in about 300 ticks; the Space
 * stops a little short of that because the last tens of ticks move nodes by less than a pixel at
 * the zoom the Space opens at, and every one of them is a frame the main thread spends simulating.
 * MEASURED, not guessed: measurement A in the PR body reports the settle time this produces.
 */
export const SETTLE_TICKS = 240;

/**
 * No warm-up ticks at all. `warmupTicks` runs its ticks in ONE synchronous loop inside the engine's
 * update, which is exactly the main-thread block docs/space-view.md forbids ("typing in search and
 * clicking the header must stay responsive while the simulation settles"). With zero, every tick is
 * one animation frame's worth of work and the thread is free between them.
 */
export const WARMUP_TICKS = 0;

export const NODE_REL_SIZE = 4;
export const BACKGROUND = '#0b1020';

/**
 * Exponential fog density. docs/space-view.md: "Depth is cued by fog and by size falloff, because
 * perspective alone reads ambiguously" — the perspective camera supplies the size falloff and this
 * supplies the second cue, so a node twice as far reads as further rather than merely smaller.
 */
export const FOG_DENSITY = 0.0016;

/** Auto-rotation: one revolution in 90 seconds, off entirely under reduced motion. */
export const AUTO_ROTATE_PERIOD_MS = 90_000;

/** `focus`'s camera distance from the node it centres, in the same units as `NODE_REL_SIZE`. */
export const FOCUS_STANDOFF = 140;

// ---------------------------------------------------------------- the engine, structurally

/**
 * The slice of `3d-force-graph`'s instance the Space uses. Declared structurally rather than
 * imported so that no `3d-force-graph` specifier appears outside `loadSpaceEngine`'s dynamic
 * import — a stray `import type` is erased by the compiler, but this way there is nothing for a
 * future bundler change to get wrong, and a fake engine has something small to implement.
 *
 * Chainable setters are typed as returning `void` on purpose: a function returning anything is
 * assignable to one returning `void`, so the real chainable instance satisfies this interface.
 */
export interface SpaceEngineInstance {
  graphData(data: { nodes: EngineNode[]; links: EngineEdge[] }): void;
  graphData(): { nodes: EngineNode[]; links: EngineEdge[] };
  nodeId(key: string): void;
  linkSource(key: string): void;
  linkTarget(key: string): void;
  nodeRelSize(size: number): void;
  nodeVal(accessor: (node: EngineNode) => number): void;
  nodeColor(accessor: (node: EngineNode) => string): void;
  nodeLabel(accessor: (node: EngineNode) => string): void;
  nodeOpacity(opacity: number): void;
  nodeResolution(segments: number): void;
  linkColor(accessor: (edge: EngineEdge) => string): void;
  linkOpacity(opacity: number): void;
  linkWidth(width: number): void;
  backgroundColor(colour: string): void;
  showNavInfo(enabled: boolean): void;
  enableNodeDrag(enabled: boolean): void;
  warmupTicks(ticks: number): void;
  cooldownTicks(ticks: number): void;
  onNodeClick(callback: (node: EngineNode) => void): void;
  onEngineStop(callback: () => void): void;
  cameraPosition(): SpacePoint;
  cameraPosition(position: Partial<SpacePoint>, lookAt?: SpacePoint, transitionMs?: number): void;
  zoomToFit(durationMs?: number, padding?: number): void;
  width(width: number): void;
  height(height: number): void;
  scene(): SpaceThreeScene;
  graph2ScreenCoords(x: number, y: number, z: number): SpacePoint;
  _destructor(): void;
}

/** Only what `paintedNodes` and the fog need; `traverse` is three.js `Object3D.traverse`. */
export interface SpaceThreeScene {
  fog: unknown;
  traverse(callback: (object: { __graphObjType?: string }) => void): void;
}

/** A node record the engine owns: the Space's fields plus the simulation's own. */
export interface EngineNode extends SpaceNode {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface EngineEdge extends Omit<SpaceEdge, 'source' | 'target'> {
  /** d3-force replaces these with node references once the link force initialises. */
  source: string | EngineNode;
  target: string | EngineNode;
}

export interface SpaceEngine {
  create(container: HTMLElement): SpaceEngineInstance;
  /** three.js `FogExp2`, or a stand-in in a test. */
  createFog(colour: string, density: number): unknown;
}

export type SpaceEngineLoader = () => Promise<SpaceEngine>;

/**
 * THE lazy boundary. Both specifiers appear here and nowhere else in `src/`, inside an `await
 * import(...)`, so they are reachable only by calling this function.
 */
export const loadSpaceEngine: SpaceEngineLoader = async () => {
  const [engine, three] = await Promise.all([import('3d-force-graph'), import('three')]);
  const ForceGraph3D = engine.default;
  return {
    create: (container) =>
      new ForceGraph3D(container, {
        controlType: 'orbit',
      }) as unknown as SpaceEngineInstance,
    createFog: (colour, density) => new three.FogExp2(colour, density),
  };
};

// ---------------------------------------------------------------- the scene

/**
 * Builds the scene. Resolves once the engine chunk has loaded and the container has an instance in
 * it; the simulation is still running at that point and `onSettled` fires later.
 */
export async function createSpaceScene(options: SpaceSceneOptions): Promise<SpaceScene> {
  const {
    container,
    reducedMotion,
    onSelect,
    onSettled,
    load = loadSpaceEngine,
    now = () => performance.now(),
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => {
      cancelAnimationFrame(handle);
    },
  } = options;

  const engine = await load();
  const instance = engine.create(container);

  let disposed = false;
  let settledFlag = false;
  let nodes: EngineNode[] = [];
  let edges: EngineEdge[] = [];
  let style: SpaceStyle = FLAT_STYLE;
  let rotateHandle: number | null = null;
  let rotateStart: number | null = null;

  const transitionMs = reducedMotion ? 0 : 400;

  instance.nodeId('id');
  instance.linkSource('source');
  instance.linkTarget('target');
  instance.backgroundColor(BACKGROUND);
  instance.showNavInfo(false);
  // Dragging a node would move the layout, and the Space is not a place anything is arranged by
  // hand. Orbit, pan and zoom stay: those move the camera, not the Catalog.
  instance.enableNodeDrag(false);
  instance.warmupTicks(WARMUP_TICKS);
  instance.cooldownTicks(SETTLE_TICKS);
  instance.nodeRelSize(NODE_REL_SIZE);
  instance.nodeResolution(8);
  instance.nodeOpacity(1);
  instance.linkOpacity(1);
  instance.linkWidth(0);
  instance.nodeLabel((node) => node.label);
  instance.nodeVal((node) => style.nodeSize(node));
  instance.nodeColor((node) => style.nodeColour(node));
  instance.linkColor((edge) => style.linkColour(spaceEdgeOf(edge)));
  instance.onNodeClick((node) => {
    onSelect({ kind: node.kind, id: node.sourceId });
  });
  instance.scene().fog = engine.createFog(BACKGROUND, FOG_DENSITY);

  instance.onEngineStop(() => {
    if (disposed) {
      return;
    }
    // Pin every node at rest. From here a restyle physically cannot re-lay out, which is what
    // turns "recolours without re-laying out" from a timing claim into a property.
    for (const node of nodes) {
      node.fx = node.x;
      node.fy = node.y;
      node.fz = node.z;
    }
    settledFlag = true;
    instance.zoomToFit(transitionMs, 40);
    startRotation();
    onSettled?.();
  });

  function startRotation(): void {
    if (reducedMotion || disposed || rotateHandle !== null) {
      return;
    }
    const frame = (time: number): void => {
      if (disposed) {
        return;
      }
      stepRotation(time);
      rotateHandle = requestFrame(frame);
    };
    rotateStart = now();
    rotateHandle = requestFrame(frame);
  }

  /**
   * One frame of auto-rotation: the camera swings around the Y axis at a fixed radius. Written here
   * rather than taken from a control's `autoRotate` because the reduced-motion rule has to be
   * decidable from outside, and because this is the only motion the page chooses for itself.
   */
  function stepRotation(time: number): boolean {
    if (reducedMotion || disposed) {
      return false;
    }
    const start = rotateStart ?? time;
    rotateStart = start;
    const position = instance.cameraPosition();
    const radius = Math.hypot(position.x, position.z);
    if (radius === 0) {
      return false;
    }
    const angle =
      Math.atan2(position.x, position.z) + ((time - start) / AUTO_ROTATE_PERIOD_MS) * 2 * Math.PI;
    const next = { x: Math.sin(angle) * radius, y: position.y, z: Math.cos(angle) * radius };
    rotateStart = time;
    instance.cameraPosition(next, ORIGIN, 0);
    return next.x !== position.x || next.z !== position.z;
  }

  return {
    setGraph(graph) {
      if (disposed) {
        return;
      }
      settledFlag = false;
      // Copies, so the simulation's `x/y/z/fx/fy/fz` writes never reach the caller's data.
      nodes = graph.nodes.map((node) => ({ ...node }));
      edges = graph.edges.map((edge) => ({ ...edge }));
      instance.graphData({ nodes, links: edges });
    },
    setStyle(next) {
      if (disposed) {
        return;
      }
      style = next;
      // Re-setting the accessors is what makes the engine re-read them. It re-digests the existing
      // node and link objects — swapping material and geometry, not recreating them — and does not
      // touch the force layout (three-forcegraph re-heats only on `graphData` and the force props).
      instance.nodeVal((node) => style.nodeSize(node));
      instance.nodeColor((node) => style.nodeColour(node));
      instance.linkColor((edge) => style.linkColour(spaceEdgeOf(edge)));
    },
    drawn() {
      const data = instance.graphData();
      return { nodes: data.nodes.length, edges: data.links.length };
    },
    paintedNodes() {
      let count = 0;
      instance.scene().traverse((object) => {
        if (object.__graphObjType === 'node') {
          count++;
        }
      });
      return count;
    },
    positions() {
      const map = new Map<string, SpacePoint>();
      for (const node of instance.graphData().nodes) {
        map.set(node.id, { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 });
      }
      return map;
    },
    screenPoint(id) {
      const node = instance.graphData().nodes.find((candidate) => candidate.id === id);
      if (node?.x === undefined || node.y === undefined || node.z === undefined) return null;
      const point = instance.graph2ScreenCoords(node.x, node.y, node.z);
      return { x: point.x, y: point.y };
    },
    focus(id) {
      if (disposed) {
        return false;
      }
      const node = instance.graphData().nodes.find((candidate) => candidate.id === id);
      if (node?.x === undefined || node.y === undefined || node.z === undefined) {
        return false;
      }
      // A fixed standoff along +z from the node, looking straight at it. Zero transition: a test
      // waiting on `screenPoint` right after this call needs the camera already there, not mid-tween.
      instance.cameraPosition(
        { x: node.x, y: node.y, z: node.z + FOCUS_STANDOFF },
        { x: node.x, y: node.y, z: node.z },
        0,
      );
      return true;
    },
    settled: () => settledFlag,
    autoRotating: () => rotateHandle !== null,
    stepRotation,
    resize(width, height) {
      if (!disposed) {
        instance.width(width);
        instance.height(height);
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (rotateHandle !== null) {
        cancelFrame(rotateHandle);
        rotateHandle = null;
      }
      instance._destructor();
    },
  };
}

const ORIGIN: SpacePoint = { x: 0, y: 0, z: 0 };

function spaceEdgeOf(edge: EngineEdge): SpaceEdge {
  const idOf = (end: string | EngineNode) => (typeof end === 'string' ? end : end.id);
  return { id: edge.id, source: idOf(edge.source), target: idOf(edge.target) };
}

const FLAT_STYLE: SpaceStyle = {
  nodeColour: () => '#ffffff',
  nodeSize: () => 1,
  linkColour: () => '#ffffff',
};
