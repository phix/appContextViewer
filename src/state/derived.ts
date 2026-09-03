/**
 * The derived view models: computed signals over the store's signals, one per screen. Components
 * render these and call actions; they never traverse the graph themselves. The shapes here are the
 * contracts of the shell, ranked table, impact board, pane and Overview slices.
 */

import { computed, type ReadonlySignal } from '@preact/signals';
import type {
  ApplicationId,
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
  buildTagIndex,
  capGroupDependencies,
  type Group,
  groupDependencies as groupEdgesOf,
  groupingAttributes,
  groupBy as groupsFor,
  labelOf,
  neighborhood,
  type PaneNeighborhood,
  paneNeighborhood,
  rankedByBlastRadius,
  type TagIndex,
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
  /** `labelOf`: the producer's `name` when there is one, else the Project or the External id. */
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
  /**
   * What the Overview DRAWS for the open set: at most `OVERVIEW_DEPENDENCY_CAP` Group Dependencies,
   * heaviest by count first, plus every member edge (docs/performance-budgets.md, "Overview cap").
   * Empty with `groups`.
   */
  readonly edges: readonly GroupEdge[];
  /** Group Dependencies BEFORE the cap, which is what `capNotice` counts against. */
  readonly groupDependencies: number;
  /** Group Dependencies the cap left undrawn; 0 when everything fits. */
  readonly hiddenGroupDependencies: number;
  /** The cap notice naming what is not drawn, in the pane cap notice's shape; null when nothing is. */
  readonly capNotice: string | null;
  /** The Center's Group, or the Groups of an External Center's direct Dependents (docs/center.md, 7). */
  readonly highlighted: readonly GroupId[];
  /**
   * Applications inside the Neighborhood at the header Depth (both directions), for the Overview's
   * member-level highlight (issue #40) -- narrower than `highlighted`, which glows the Center's
   * whole Group regardless of Depth.
   */
  readonly neighborhood: ReadonlySet<ApplicationId>;
  /**
   * Group Dependency edges the Neighborhood above reaches through a real, both-ends-included
   * Dependency whose two Applications fall in different Groups -- keyed `${from}->${to}`, the same
   * pair `overviewRenderOf` matches a drawn `group` edge's `from`/`to` against. A pair the cap left
   * undrawn, or between two open Groups (drawn as member edges instead), never matches a rendered
   * edge, which is harmless.
   */
  readonly reachedGroupEdges: ReadonlySet<string>;
  readonly expandAllDisabled: boolean;
  readonly overviewDisabled: boolean;
  /** Why the Overview is disabled, naming the counts and the limit; null otherwise. */
  readonly notice: string | null;
  readonly applications: number;
  readonly dependencies: number;
  /**
   * `labelOf` for every Application in `groups`, so an open Group's members can be labelled without
   * the view traversing the Graph itself (docs/architecture.md). Empty while the Overview is
   * collapsed or disabled, like `groups`.
   */
  readonly labels: ReadonlyMap<ApplicationId, string>;
}

// ---------------------------------------------------------------- Tags

/**
 * Everything a Tag needs to answer for itself (docs/tags.md), so no component traverses the Graph:
 * the token and members of every Attribute value, which Attributes the cardinality rule allows as
 * groupings, and which one is grouping now.
 */
export interface TagsModel {
  readonly index: TagIndex;
  /** The Attributes that may become the grouping Attribute (item N7). A Tag outside it still Highlights. */
  readonly groupable: ReadonlySet<string>;
  /** The current grouping Attribute, which `aria-pressed` marks on its Tags. */
  readonly grouping: string;
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
  readonly tags: ReadonlySignal<TagsModel>;
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
    const labels = new Map<ApplicationId, string>();
    if (active) {
      for (const group of groups) {
        for (const member of group.members) {
          const application = graph.applications.get(member);
          if (application !== undefined) {
            labels.set(member, labelOf(application));
          }
        }
      }
    }
    const drawn = capGroupDependencies(active ? groupEdgesOf(graph, groups, open) : []);
    // Gated by `active`, like `groups` above: while the Overview is collapsed or disabled this
    // never reads `s.depth`, so a Depth change costs nothing until the Overview is actually open.
    const highlight = active ? neighborhoodHighlight(s, graph, attribute) : NO_NEIGHBORHOOD;
    return {
      expanded,
      attribute,
      groups,
      open,
      edges: drawn.edges,
      groupDependencies: drawn.total,
      hiddenGroupDependencies: drawn.hidden,
      capNotice: overviewCapNotice(drawn.total, drawn.hidden),
      highlighted: highlightedGroups(s, attribute),
      neighborhood: highlight.applications,
      reachedGroupEdges: highlight.reachedGroupEdges,
      expandAllDisabled,
      overviewDisabled,
      notice,
      applications,
      dependencies,
      labels,
    };
  });

  const warningsCount = computed(() => s.warnings.value.length);

  // Both halves are per Graph, so pointing at a Tag never rebuilds them; only `grouping` moves when
  // a Tag is chosen, and it is the cheap half.
  const tagIndex = computed(() => buildTagIndex(s.graph.value));
  const groupableAttributesSet = computed<ReadonlySet<string>>(
    () => new Set(groupingAttributes(s.graph.value)),
  );
  const tags = computed<TagsModel>(() => ({
    index: tagIndex.value,
    groupable: groupableAttributesSet.value,
    grouping: effectiveGrouping(s.groupBy.value),
  }));

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

  return { ranked, board, paneModel, overviewModel, warningsCount, channelCardModel, tags };
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
      label: labelOf(application),
      repository: application.repository,
      team: application.team,
    };
  }
  const external = graph.externals.get(id);
  if (external === undefined) {
    throw new Error(`unknown External: ${id}`);
  }
  return { kind, id, label: labelOf(external), externalKind: external.kind };
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
      // The producer's own name, as an External already carried. Without it the card and the
      // Markdown export both lost it and led with an APM id (item N6), even though `labelOf` had
      // resolved the name for every other surface.
      name: application.name,
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

/**
 * The Overview's cap notice (docs/performance-budgets.md, "Overview cap"), written in the pane cap
 * notice's shape and vocabulary above -- "Showing <what is drawn>; <what is not>". It names the cap
 * as a choice about legibility rather than an apology: the heaviest Group Dependencies are the ones
 * a reader came for.
 */
export function overviewCapNotice(total: number, hidden: number): string | null {
  if (hidden === 0) {
    return null;
  }
  const drawn = (total - hidden).toLocaleString('en-US');
  return `Showing the heaviest ${drawn} Group Dependencies of ${total.toLocaleString('en-US')}; ${hidden.toLocaleString('en-US')} not drawn`;
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

interface NeighborhoodHighlight {
  readonly applications: ReadonlySet<ApplicationId>;
  readonly reachedGroupEdges: ReadonlySet<string>;
}

const NO_NEIGHBORHOOD: NeighborhoodHighlight = {
  applications: new Set(),
  reachedGroupEdges: new Set(),
};

/** `OverviewModel.reachedGroupEdges`' key for the ordered Group pair a cross-Group Dependency spans. */
export function groupEdgeKey(from: GroupId, to: GroupId): string {
  return `${from}->${to}`;
}

/**
 * The Depth-scoped Neighborhood for the Overview's member-level highlight (issue #40): every
 * Application within `s.depth` of the Center, both directions -- the same reading `paneNeighborhood`
 * uses -- plus the ordered Group pairs a real Dependency inside that Neighborhood spans, so the view
 * can light up a collapsed Group's incoming or outgoing Group Dependency without re-deriving it from
 * the aggregated counts in `OverviewModel.edges`, which carry no member ids.
 */
function neighborhoodHighlight(
  s: StoreSignals,
  graph: Graph,
  attribute: string,
): NeighborhoodHighlight {
  const center = s.center.value;
  if (center === null) {
    return NO_NEIGHBORHOOD;
  }
  const reach = neighborhood(graph, center, { depth: s.depth.value, direction: 'both' });
  const applications = new Set<ApplicationId>(reach.applications.map((member) => member.id));
  const reachedGroupEdges = new Set<string>();
  for (const edge of reach.dependencies) {
    if (edge.to.kind !== 'application') {
      continue;
    }
    const from = graph.applications.get(edge.from);
    const to = graph.applications.get(edge.to.id);
    if (from === undefined || to === undefined) {
      continue;
    }
    const fromGroup = groupIdOf(from, attribute);
    const toGroup = groupIdOf(to, attribute);
    if (fromGroup !== toGroup) {
      reachedGroupEdges.add(groupEdgeKey(fromGroup, toGroup));
    }
  }
  return { applications, reachedGroupEdges };
}
