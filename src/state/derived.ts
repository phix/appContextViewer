/**
 * The derived view models: computed signals over the store's signals, one per screen. Components
 * render these and call actions; they never traverse the graph themselves. The shapes here are the
 * contracts of the shell, ranked table, impact board, pane and Overview slices.
 */

import { computed, type ReadonlySignal } from '@preact/signals';
import type {
  Attributes,
  ChannelName,
  Graph,
  GroupEdge,
  GroupId,
  NodeKind,
  RankedRow,
} from '@/graph';
import {
  blastRadius,
  type Group,
  groupDependencies,
  groupBy as groupsFor,
  neighborhood,
  type PaneNeighborhood,
  paneNeighborhood,
  rankedByBlastRadius,
} from '@/graph';
import {
  type Center,
  EXPAND_ALL_LIMIT,
  effectiveGrouping,
  groupIdOf,
  OVERVIEW_LIMIT,
  type StoreSignals,
} from './store';

// ---------------------------------------------------------------- ranked table

export interface RankedModel {
  /** Both kinds sorted together, or Applications alone while the filter is on. */
  readonly rows: readonly RankedRow[];
  readonly applicationsOnly: boolean;
  /** The Catalog's counts, so the table can say what the filter hides. */
  readonly applications: number;
  readonly externals: number;
}

// ---------------------------------------------------------------- impact board

/** A row of a board band, a chip, or a Channel card row: an Application or External with its chips. */
export interface BoardNode {
  readonly kind: NodeKind;
  readonly id: string;
  /** The Project for an Application, the name (or id) for an External. */
  readonly label: string;
  /** Application chips. */
  readonly repository?: string;
  readonly team?: string;
  /** An External's kind, for its kind chip ("External · database"). */
  readonly externalKind?: string;
}

export interface BoardBand {
  /** 1-based Depth from the Center. */
  readonly depth: number;
  readonly rows: readonly BoardNode[];
}

/** The middle card: the Center's own record, whichever kind it is. */
export interface CenterCard extends BoardNode {
  /** The Application's kind, or the External's. */
  readonly recordKind?: string;
  readonly name?: string;
  readonly description?: string;
  readonly url?: string;
  readonly attributes: Attributes;
  /** Flows; empty for an External. */
  readonly publishes: readonly ChannelName[];
  readonly subscribes: readonly ChannelName[];
}

export interface BoardModel {
  readonly center: CenterCard;
  /** The header Depth both columns hold; `Number.POSITIVE_INFINITY` for all. */
  readonly depth: number;
  readonly needs: {
    readonly bands: readonly BoardBand[];
    /** The one line an External's Needs column shows instead of bands (docs/center.md, decision 5). */
    readonly note: string | null;
  };
  readonly breaks: {
    /** The Blast radius banded by Depth, Catalog order within a band. */
    readonly bands: readonly BoardBand[];
    /** Everything that breaks, and the distinct Teams among them: the "N break across T Teams" badge. */
    readonly total: number;
    readonly teams: number;
  };
}

export const EXTERNAL_NEEDS_NOTE = 'An External has no Dependencies in the Catalog';

// ---------------------------------------------------------------- pane

export interface PaneModel extends PaneNeighborhood {
  /** Render-ready nodes; the view never has to look records up in the Graph. */
  readonly nodes: readonly PaneNode[];
  /**
   * Every current-Attribute Group represented in the pane, always drawn open -- and empty whenever
   * `groupsDrawn` is false, which is how the flat-above-the-Dependency-cap policy reaches the view.
   */
  readonly groups: readonly PaneGroup[];
  readonly grouping: string;
  /** The cap notice (docs/performance-budgets.md, "Pane cap"), or null when everything fits. */
  readonly notice: string | null;
}

export interface PaneNode extends BoardNode {
  readonly depth: number;
  /** Applications sit inside this open Group; Externals have no Group. */
  readonly group?: GroupId;
}

export interface PaneGroup {
  readonly id: GroupId;
  readonly label: string;
  readonly members: readonly string[];
}

// ---------------------------------------------------------------- Overview

export interface OverviewModel {
  readonly expanded: boolean;
  /** The Attribute the Overview groups by: the store's `groupBy`, or Repository for `none`. */
  readonly attribute: string;
  /** Every Group under `attribute`; empty while the Overview is collapsed or disabled. */
  readonly groups: readonly Group[];
  readonly open: ReadonlySet<GroupId>;
  /** Group Dependencies and member edges for the open set; empty with `groups`. */
  readonly edges: readonly GroupEdge[];
  /** The Center's Group, or the Groups of an External Center's direct Dependents (docs/center.md, 7). */
  readonly highlighted: readonly GroupId[];
  readonly expandAllDisabled: boolean;
  readonly overviewDisabled: boolean;
  /** Why the Overview is disabled, naming the counts and the limit; null otherwise. */
  readonly notice: string | null;
  readonly applications: number;
  readonly dependencies: number;
}

// ---------------------------------------------------------------- Channel card

export interface ChannelCardModel {
  readonly name: ChannelName;
  readonly publishers: readonly BoardNode[];
  readonly subscribers: readonly BoardNode[];
}

export interface Derived {
  readonly ranked: ReadonlySignal<RankedModel>;
  readonly board: ReadonlySignal<BoardModel | null>;
  readonly paneModel: ReadonlySignal<PaneModel | null>;
  readonly overviewModel: ReadonlySignal<OverviewModel>;
  readonly warningsCount: ReadonlySignal<number>;
  readonly channelCardModel: ReadonlySignal<ChannelCardModel | null>;
}

export function createDerived(s: StoreSignals): Derived {
  // Ranked once per Graph; the filter is a cheap second step.
  const rankedRows = computed(() => rankedByBlastRadius(s.graph.value));

  const ranked = computed<RankedModel>(() => {
    const graph = s.graph.value;
    const applicationsOnly = s.applicationsOnly.value;
    const rows = applicationsOnly
      ? rankedRows.value.filter((row) => row.kind === 'application')
      : rankedRows.value;
    return {
      rows,
      applicationsOnly,
      applications: graph.applications.size,
      externals: graph.externals.size,
    };
  });

  const board = computed<BoardModel | null>(() => {
    const center = s.center.value;
    if (center === null) {
      return null;
    }
    const graph = s.graph.value;
    const depth = s.depth.value;
    const node = (kind: NodeKind, id: string): BoardNode => nodeOf(graph, kind, id);

    const breakBands = blastRadius(graph, center, depth);
    const teams = new Set<string>();
    let total = 0;
    for (const band of breakBands) {
      for (const id of band) {
        total++;
        const team = graph.applications.get(id)?.team;
        if (team !== undefined) {
          teams.add(team);
        }
      }
    }
    const breaks = {
      bands: breakBands.map((band, index) => ({
        depth: index + 1,
        rows: band.map((id) => node('application', id)),
      })),
      total,
      teams: teams.size,
    };

    let needs: BoardModel['needs'];
    if (center.kind === 'external') {
      needs = { bands: [], note: EXTERNAL_NEEDS_NOTE };
    } else {
      const reach = neighborhood(graph, center, { depth, direction: 'dependencies' });
      const byDepth = new Map<number, BoardNode[]>();
      for (const member of reach.applications) {
        if (member.depth > 0) {
          bandOf(byDepth, member.depth).push(node('application', member.id));
        }
      }
      for (const member of reach.externals) {
        bandOf(byDepth, member.depth).push(node('external', member.id));
      }
      const bands: BoardBand[] = [...byDepth.keys()]
        .sort((a, b) => a - b)
        .map((d) => ({ depth: d, rows: byDepth.get(d) ?? [] }));
      needs = { bands, note: null };
    }

    return { center: centerCardOf(graph, center), depth, needs, breaks };
  });

  const paneModel = computed<PaneModel | null>(() => {
    const center = s.center.value;
    if (center === null) {
      return null;
    }
    const graph = s.graph.value;
    const pane = paneNeighborhood(graph, center, s.depth.value);
    const grouping = effectiveGrouping(s.groupBy.value);
    const applicationIds = new Set(pane.applications.map((member) => member.id));
    const groupFor = new Map<string, GroupId>();
    const groups: PaneGroup[] = [];
    // Above the Dependency cap the pane is drawn flat (docs/performance-budgets.md, "Pane cap"):
    // no Group boxes and no parents, which is where that policy's ~40% saving comes from. The Depth
    // is untouched -- `paneNeighborhood` already settled it on the node cap alone.
    if (pane.groupsDrawn) {
      for (const group of groupsFor(graph, grouping)) {
        const members = group.members.filter((id) => applicationIds.has(id));
        if (members.length === 0) {
          continue;
        }
        groups.push({ id: group.id, label: group.label, members });
        for (const id of members) {
          groupFor.set(id, group.id);
        }
      }
    }
    const nodes: PaneNode[] = [
      ...pane.applications.map((member) => ({
        ...nodeOf(graph, 'application', member.id),
        depth: member.depth,
        group: groupFor.get(member.id),
      })),
      ...pane.externals.map((member) => ({
        ...nodeOf(graph, 'external', member.id),
        depth: member.depth,
      })),
    ];
    return { ...pane, nodes, groups, grouping, notice: paneNotice(pane) };
  });

  const overviewModel = computed<OverviewModel>(() => {
    const graph = s.graph.value;
    const expanded = s.overviewExpanded.value;
    const attribute = effectiveGrouping(s.groupBy.value);
    const applications = graph.applications.size;
    let dependencies = 0;
    for (const application of graph.applications.values()) {
      dependencies += application.dependencies.length;
    }
    const overviewDisabled = applications > OVERVIEW_LIMIT;
    const expandAllDisabled = applications > EXPAND_ALL_LIMIT;
    const notice = overviewDisabled
      ? `The Overview is disabled for this Catalog: ${applications.toLocaleString('en-US')} Applications and ${dependencies.toLocaleString('en-US')} Dependencies, above the ${OVERVIEW_LIMIT.toLocaleString('en-US')}-Application limit.`
      : null;
    const open = s.openGroups.value;
    const active = expanded && !overviewDisabled;
    const groups = active ? groupsFor(graph, attribute) : [];
    const edges = active ? groupDependencies(graph, groups, open) : [];
    return {
      expanded,
      attribute,
      groups,
      open,
      edges,
      highlighted: highlightedGroups(s, attribute),
      expandAllDisabled,
      overviewDisabled,
      notice,
      applications,
      dependencies,
    };
  });

  const warningsCount = computed(() => s.warnings.value.length);

  const channelCardModel = computed<ChannelCardModel | null>(() => {
    const name = s.channelCard.value;
    if (name === null) {
      return null;
    }
    const graph = s.graph.value;
    const channel = graph.channels.get(name);
    if (channel === undefined) {
      return null;
    }
    const node = (id: string) => nodeOf(graph, 'application', id);
    return {
      name,
      publishers: channel.publishers.map(node),
      subscribers: channel.subscribers.map(node),
    };
  });

  return { ranked, board, paneModel, overviewModel, warningsCount, channelCardModel };
}

function bandOf(bands: Map<number, BoardNode[]>, depth: number): BoardNode[] {
  let band = bands.get(depth);
  if (band === undefined) {
    band = [];
    bands.set(depth, band);
  }
  return band;
}

function nodeOf(graph: Graph, kind: NodeKind, id: string): BoardNode {
  if (kind === 'application') {
    const application = graph.applications.get(id);
    if (application === undefined) {
      throw new Error(`unknown Application: ${id}`);
    }
    return {
      kind,
      id,
      label: application.project,
      repository: application.repository,
      team: application.team,
    };
  }
  const external = graph.externals.get(id);
  if (external === undefined) {
    throw new Error(`unknown External: ${id}`);
  }
  return { kind, id, label: external.name ?? external.id, externalKind: external.kind };
}

function centerCardOf(graph: Graph, center: Center): CenterCard {
  const node = nodeOf(graph, center.kind, center.id);
  if (center.kind === 'application') {
    const application = graph.applications.get(center.id);
    if (application === undefined) {
      throw new Error(`unknown Application: ${center.id}`);
    }
    return {
      ...node,
      recordKind: application.kind,
      description: application.description,
      url: application.url,
      attributes: application.attributes,
      publishes: application.publishes,
      subscribes: application.subscribes,
    };
  }
  const external = graph.externals.get(center.id);
  if (external === undefined) {
    throw new Error(`unknown External: ${center.id}`);
  }
  return {
    ...node,
    recordKind: external.kind,
    name: external.name,
    description: external.description,
    url: external.url,
    attributes: external.attributes,
    publishes: [],
    subscribes: [],
  };
}

/** The two notice texts from docs/performance-budgets.md ("Pane cap") and docs/center.md (6). */
export function paneNotice(pane: PaneNeighborhood): string | null {
  if (pane.hidden === 0) {
    return null;
  }
  if (pane.depthShown === 0) {
    const what = pane.center.kind === 'external' ? 'Dependents' : 'Dependencies and Dependents';
    return `${pane.hidden} ${what}, more than the pane can draw; see the Breaks column`;
  }
  const asked = pane.depth === Number.POSITIVE_INFINITY ? 'all' : String(pane.depth);
  const externals =
    pane.hiddenExternals > 0
      ? `, and ${pane.hiddenExternals} ${pane.hiddenExternals === 1 ? 'External' : 'Externals'} not drawn`
      : '';
  return `Showing Depth ${pane.depthShown} of ${asked}; ${pane.hiddenApplications} more in the Overview${externals}`;
}

function highlightedGroups(s: StoreSignals, attribute: string): GroupId[] {
  const center = s.center.value;
  if (center === null) {
    return [];
  }
  const graph = s.graph.value;
  if (center.kind === 'application') {
    const application = graph.applications.get(center.id);
    return application === undefined ? [] : [groupIdOf(application, attribute)];
  }
  const external = graph.externals.get(center.id);
  if (external === undefined) {
    return [];
  }
  const ids = new Set<GroupId>();
  for (const id of external.dependents) {
    const dependent = graph.applications.get(id);
    if (dependent !== undefined) {
      ids.add(groupIdOf(dependent, attribute));
    }
  }
  return [...ids];
}
