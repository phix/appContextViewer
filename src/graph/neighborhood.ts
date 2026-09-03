/**
 * Neighborhood: the Applications, Externals and Channels within a Depth of the Center, in a
 * direction (CONTEXT.md), and the pane variant with the 150-node cap and its Depth fallback
 * (docs/performance-budgets.md, "Pane cap"; docs/center.md, decision 6).
 *
 * The two caps do different jobs, and conflating them is a defect this file has already had once.
 * The NODE cap alone binds the Depth fallback: 2 falls to 1 when Depth 2 will not fit 150 nodes.
 * The DEPENDENCY cap never changes the Depth; above it the pane drops the Group boxes and lays the
 * drawn Neighborhood out flat, which the budgets doc measures at about 40% less. So a Center whose
 * Depth-2 Neighborhood fits 150 nodes but carries more than 350 Dependencies is drawn AT DEPTH 2,
 * flat -- see `groupsDrawn`, and the test that pins one such Center in neighborhood.test.ts.
 *
 * Reach is a breadth-first walk over Dependency edges from the Center: an Application expands to
 * its Dependencies, its Dependents, or both; an External is expanded only when it is the Center
 * (its Dependents are Depth 1) and is otherwise a leaf, so a shared database never pulls its
 * other Dependents into a Neighborhood. Channels sit one Flow away from an included Application
 * and are never traversed, and Flows never become Dependency edges. This is the reading that
 * reproduces the budgets doc's Depth-2 fallback statistics on samples/catalog-1000.json.
 */
import {
  type ApplicationId,
  applicationOf,
  type Center,
  type CenterRef,
  type ChannelName,
  type ExternalId,
  externalOf,
  type Graph,
  type NodeRef,
  resolveCenter,
} from './model';

export type NeighborhoodDirection = 'dependencies' | 'dependents' | 'both';

/** An Application, External or Channel in a Neighborhood, with its Depth from the Center. */
export interface NeighborhoodMember {
  readonly id: string;
  readonly depth: number;
}

/** A Dependency between two nodes of a Neighborhood; `from` is always an Application. */
export interface DependencyEdge {
  readonly from: ApplicationId;
  readonly to: NodeRef;
}

/** A Flow between an Application and a Channel of a Neighborhood. */
export interface FlowEdge {
  readonly application: ApplicationId;
  readonly channel: ChannelName;
  readonly direction: 'publishes' | 'subscribes';
}

export interface Neighborhood {
  readonly center: Center;
  /** The Depth asked for. */
  readonly depth: number;
  readonly direction: NeighborhoodDirection;
  /** Ascending Depth; the Center comes first, at Depth 0, in the list of its kind. */
  readonly applications: readonly NeighborhoodMember[];
  readonly externals: readonly NeighborhoodMember[];
  readonly channels: readonly NeighborhoodMember[];
  /** Every Dependency whose both ends are included. */
  readonly dependencies: readonly DependencyEdge[];
  /** Every Flow whose Application and Channel are both included. */
  readonly flows: readonly FlowEdge[];
}

export interface PaneNeighborhood extends Neighborhood {
  /**
   * The Depth actually drawn: the largest at or below `depth` that fits the NODE cap; 0 is the
   * Center alone. The Dependency cap does not enter here (docs/performance-budgets.md, "Pane cap").
   */
  readonly depthShown: number;
  /**
   * Whether the pane draws Group boxes around the Applications. False when the drawn Neighborhood
   * carries more than `PANE_DEPENDENCY_CAP` Dependencies: above that figure the budgets doc has the
   * pane drop the boxes and lay out flat, which costs about 40% less. It is not a Depth fallback --
   * `depthShown` is unaffected -- and it is the only thing this cap controls.
   */
  readonly groupsDrawn: boolean;
  /**
   * Applications and Externals within `depth` that the fallback left out, together and split by
   * kind: the pane's "N more in the Overview" counts Applications only, since the Overview never
   * draws Externals (grouping decision, #7), and the Externals are then named separately.
   */
  readonly hidden: number;
  readonly hiddenApplications: number;
  readonly hiddenExternals: number;
}

/**
 * The pane's node cap, Applications and Externals together (docs/performance-budgets.md). The only
 * thing that binds the Depth fallback. Pinned against movement in either direction by the synthetic
 * 150/151-node graphs in neighborhood.test.ts, so changing this number turns the suite red.
 */
export const PANE_CAP = 150;
/**
 * The pane's Dependency cap; dagre's cost follows edges more closely than nodes. Above it the
 * Group boxes are dropped (`groupsDrawn`) and the Neighborhood is laid out flat. It never changes
 * `depthShown`. Pinned by the synthetic 350/351-Dependency graphs in neighborhood.test.ts.
 */
export const PANE_DEPENDENCY_CAP = 350;

export function neighborhood(
  graph: Graph,
  center: CenterRef,
  options: { readonly depth: number; readonly direction: NeighborhoodDirection },
): Neighborhood {
  const origin = resolveCenter(graph, center);
  const reached = reach(graph, origin, options.depth, options.direction);
  return assemble(graph, origin, options.depth, options.direction, reached, options.depth);
}

/**
 * The Neighborhood the pane draws: both directions, at the largest Depth at or below the one asked
 * whose Applications plus Externals fit `cap`, down to the Center alone. `dependencyCap` decides
 * `groupsDrawn` for whatever that leaves; it never pushes the Depth down.
 */
export function paneNeighborhood(
  graph: Graph,
  center: CenterRef,
  depth: number,
  cap: number = PANE_CAP,
  dependencyCap: number = PANE_DEPENDENCY_CAP,
): PaneNeighborhood {
  const origin = resolveCenter(graph, center);
  const reached = reach(graph, origin, depth, 'both');

  // Nodes reached at each Depth, then the running total up to that Depth.
  const perDepth: number[] = [];
  for (const d of reached.applications.values()) {
    perDepth[d] = (perDepth[d] ?? 0) + 1;
  }
  for (const d of reached.externals.values()) {
    perDepth[d] = (perDepth[d] ?? 0) + 1;
  }
  const upTo: number[] = [];
  let total = 0;
  for (const count of perDepth) {
    total += count;
    upTo.push(total);
  }
  const full = assemble(graph, origin, depth, 'both', reached, depth);
  if (total <= cap) {
    // Every node within the asked Depth fits, so that Depth is shown, whether or not the reach
    // extends that far (an unbounded Depth included). A Dependency count above the cap makes this
    // Neighborhood flat, not shallower.
    return {
      ...full,
      depthShown: depth,
      groupsDrawn: full.dependencies.length <= dependencyCap,
      hidden: 0,
      hiddenApplications: 0,
      hiddenExternals: 0,
    };
  }
  let depthShown = 0;
  let shown = assemble(graph, origin, depth, 'both', reached, 0);
  for (let d = upTo.length - 1; d > 0; d--) {
    if (upTo[d] <= cap) {
      depthShown = d;
      shown = assemble(graph, origin, depth, 'both', reached, d);
      break;
    }
  }
  const hiddenApplications = countBeyond(reached.applications, depthShown);
  const hiddenExternals = countBeyond(reached.externals, depthShown);
  return {
    ...shown,
    depthShown,
    groupsDrawn: shown.dependencies.length <= dependencyCap,
    hidden: hiddenApplications + hiddenExternals,
    hiddenApplications,
    hiddenExternals,
  };
}

function countBeyond(depths: ReadonlyMap<string, number>, shown: number): number {
  let count = 0;
  for (const depth of depths.values()) {
    if (depth > shown) {
      count++;
    }
  }
  return count;
}

/** Ids reached from the Center with their Depth, in breadth-first (ascending Depth) order. */
interface Reach {
  readonly applications: ReadonlyMap<ApplicationId, number>;
  readonly externals: ReadonlyMap<ExternalId, number>;
}

function reach(
  graph: Graph,
  origin: Center,
  depth: number,
  direction: NeighborhoodDirection,
): Reach {
  const applications = new Map<ApplicationId, number>();
  const externals = new Map<ExternalId, number>();
  const followDependencies = direction !== 'dependents';
  const followDependents = direction !== 'dependencies';

  let frontier: ApplicationId[] = [];
  let frontierDepth = 0;
  if (origin.kind === 'application') {
    applications.set(origin.id, 0);
    frontier.push(origin.id);
  } else {
    externals.set(origin.id, 0);
    if (followDependents && depth > 0) {
      for (const id of externalOf(graph, origin.id).dependents) {
        applications.set(id, 1);
        frontier.push(id);
      }
      frontierDepth = 1;
    }
  }

  for (let d = frontierDepth; d < depth && frontier.length > 0; d++) {
    const next: ApplicationId[] = [];
    for (const id of frontier) {
      const application = applicationOf(graph, id);
      if (followDependencies) {
        for (const target of application.dependencies) {
          if (target.kind === 'application') {
            if (!applications.has(target.id)) {
              applications.set(target.id, d + 1);
              next.push(target.id);
            }
          } else if (!externals.has(target.id)) {
            externals.set(target.id, d + 1);
          }
        }
      }
      if (followDependents) {
        for (const dependent of application.dependents) {
          if (!applications.has(dependent)) {
            applications.set(dependent, d + 1);
            next.push(dependent);
          }
        }
      }
    }
    frontier = next;
  }
  return { applications, externals };
}

function assemble(
  graph: Graph,
  center: Center,
  depth: number,
  direction: NeighborhoodDirection,
  reached: Reach,
  shown: number,
): Neighborhood {
  const applications = membersUpTo(reached.applications, shown);
  const externals = membersUpTo(reached.externals, shown);

  // Channels one Flow away from an included Application; the first mention is the closest one,
  // because the members are in ascending Depth.
  const channelDepth = new Map<ChannelName, number>();
  for (const member of applications) {
    if (member.depth >= shown) {
      continue;
    }
    const application = applicationOf(graph, member.id);
    for (const name of application.publishes) {
      if (!channelDepth.has(name)) {
        channelDepth.set(name, member.depth + 1);
      }
    }
    for (const name of application.subscribes) {
      if (!channelDepth.has(name)) {
        channelDepth.set(name, member.depth + 1);
      }
    }
  }

  const dependencies: DependencyEdge[] = [];
  const flows: FlowEdge[] = [];
  for (const member of applications) {
    const application = applicationOf(graph, member.id);
    for (const target of application.dependencies) {
      const targetDepth =
        target.kind === 'application'
          ? reached.applications.get(target.id)
          : reached.externals.get(target.id);
      if (targetDepth !== undefined && targetDepth <= shown) {
        dependencies.push({ from: member.id, to: target });
      }
    }
    for (const name of application.publishes) {
      if (channelDepth.has(name)) {
        flows.push({ application: member.id, channel: name, direction: 'publishes' });
      }
    }
    for (const name of application.subscribes) {
      if (channelDepth.has(name)) {
        flows.push({ application: member.id, channel: name, direction: 'subscribes' });
      }
    }
  }

  const channels: NeighborhoodMember[] = [];
  for (const [id, channelDepthValue] of channelDepth) {
    channels.push({ id, depth: channelDepthValue });
  }
  return { center, depth, direction, applications, externals, channels, dependencies, flows };
}

function membersUpTo(depths: ReadonlyMap<string, number>, shown: number): NeighborhoodMember[] {
  const members: NeighborhoodMember[] = [];
  for (const [id, depth] of depths) {
    if (depth <= shown) {
      members.push({ id, depth });
    }
  }
  return members;
}
