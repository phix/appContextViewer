/**
 * `layout`: positions from a node and edge list (docs/architecture.md). Plain data in, plain data
 * out; nothing here knows Cytoscape.
 *
 *   layoutNeighborhood(spec)            dagre, synchronous; throws on dagre's failure
 *   layoutWithFallback(spec, options)   dagre, then elk on the calling thread, then breadthfirst
 *   createOverviewLayout()              elk in a Web Worker in the browser, elk directly in Node
 *
 * Coordinates: every position is a centre in one absolute space, the way Cytoscape places nodes;
 * a Group's entry also carries the width and height the engine gave the box. Node sizes are the
 * caller's (the view measures labels); Group sizes are the layout's.
 *
 * Performance: measured in Node on samples/catalog-1000.json by the tests beside this file; the
 * browser budgets (docs/performance-budgets.md rows 3, 4, 9, 10, 11) are asserted by the view slices.
 */
import { layoutWithBreadthfirst } from './breadthfirst';
import { layoutWithDagre } from './dagre';
import { layoutWithElk } from './elk';
import { indexSpec, type LayoutSpec, type Positions } from './spec';

export type { ElkWorkerLike, OverviewLayout, WorkerFactory } from './elk';
export { createOverviewLayout } from './elk';
export type {
  Id,
  LayoutEdge,
  LayoutNode,
  LayoutSpec,
  OverviewSpec,
  Position,
  Positions,
} from './spec';
export { LayoutSpecError } from './spec';

export type LayoutEngine = 'dagre' | 'elk' | 'breadthfirst';

/** The pane's layout: dagre over the Neighborhood, synchronous, on the calling thread. */
export function layoutNeighborhood(spec: LayoutSpec): Positions {
  return layoutWithDagre(spec);
}

/** The engines the fallback chain tries, injectable so a test can make one fail on purpose. */
export type FallbackEngines = {
  dagre?: (spec: LayoutSpec) => Positions;
  elk?: (spec: LayoutSpec, signal?: AbortSignal) => Promise<Positions>;
  breadthfirst?: (spec: LayoutSpec) => Positions;
};

export type FallbackResult = {
  /** The engine whose positions these are. */
  engine: LayoutEngine;
  positions: Positions;
  /** What each earlier engine threw, in chain order; empty when dagre succeeded. */
  failures: { engine: LayoutEngine; error: unknown }[];
};

/**
 * dagre, then elk (directly, on the calling thread), then breadthfirst, which never fails for a
 * valid spec. An invalid spec throws `LayoutSpecError` before any engine runs; an aborted `signal`
 * rejects with its reason. Rejects only when every engine failed.
 */
export async function layoutWithFallback(
  spec: LayoutSpec,
  options: { signal?: AbortSignal; engines?: FallbackEngines } = {},
): Promise<FallbackResult> {
  indexSpec(spec);
  const engines = {
    dagre: options.engines?.dagre ?? layoutWithDagre,
    elk: options.engines?.elk ?? layoutWithElk,
    breadthfirst: options.engines?.breadthfirst ?? layoutWithBreadthfirst,
  };
  const failures: FallbackResult['failures'] = [];
  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException('The layout was aborted', 'AbortError');
    }
  };

  throwIfAborted();
  try {
    return { engine: 'dagre', positions: engines.dagre(spec), failures };
  } catch (error) {
    failures.push({ engine: 'dagre', error });
  }
  throwIfAborted();
  try {
    return { engine: 'elk', positions: await engines.elk(spec, options.signal), failures };
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    failures.push({ engine: 'elk', error });
  }
  throwIfAborted();
  return { engine: 'breadthfirst', positions: engines.breadthfirst(spec), failures };
}
