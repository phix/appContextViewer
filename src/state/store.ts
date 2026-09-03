/**
 * The store: one set of `@preact/signals` signals, the actions that change them, and the derived
 * view models every screen renders from (docs/architecture.md, "state"). Signals are plain values
 * in Node, so everything here is unit-tested without a DOM.
 *
 * Invariants: `load` never replaces `catalog` until the new one validates
 * (docs/validation-surfacing.md, decision 3); a Center is always in the Graph or null, with the
 * missing-Center notice when a link or a new Catalog loses it (docs/url-state.md, rule 5);
 * `groupBy` is always `none`, a built-in, or a key `groupableAttributes` lists, so the graph
 * module's `groupBy` never throws from here; the selected Application's Group auto-opens.
 */

import { batch, type Signal, signal } from '@preact/signals';
import {
  type Catalog,
  type CatalogSource,
  type Finding,
  type LoadDeps,
  type LoadResult,
  loadCatalog,
} from '@/catalog';
import {
  type Application,
  buildGraph,
  type ChannelName,
  type Graph,
  type GroupId,
  groupableAttributes,
  groupBy as groupsFor,
  type NodeKind,
} from '@/graph';
import { createDerived, type Derived } from './derived';

/** The Application or External the board and the pane are computed from (docs/center.md). */
export interface Center {
  readonly kind: NodeKind;
  readonly id: string;
}

/** Where the current Catalog came from: the bundled sample, or what `loadCatalog` reported. */
export type Source = CatalogSource | { readonly kind: 'sample'; readonly name: string };

/** The header Depth: a positive integer, or `Number.POSITIVE_INFINITY` for `depth=all`. */
export const DEFAULT_DEPTH = 2;
/** The grouping Attribute the Overview opens with (docs/url-state.md). */
export const DEFAULT_GROUP = 'repository';
/** `group=none`: no grouping outside the Overview, which falls back to Repository. */
export const NO_GROUPING = 'none';
/** Expand all is disabled above this many Applications (docs/performance-budgets.md). */
export const EXPAND_ALL_LIMIT = 1000;
/** The Overview is disabled above this many Applications (docs/performance-budgets.md). */
export const OVERVIEW_LIMIT = 3000;

/**
 * The load report (docs/validation-surfacing.md): `rejected` is the dialog over the current
 * screen after a failed load, `warnings` the side sheet the header badge opens for the current
 * Catalog. Both list the findings the report component renders.
 */
export interface Report {
  readonly mode: 'rejected' | 'warnings';
  readonly source: Source;
  readonly errors: readonly Finding[];
  readonly warnings: readonly Finding[];
}

/** The dismissible inline notice (docs/url-state.md, rule 5). `text` is a plain sentence. */
export interface Notice {
  readonly kind: 'missing-center';
  readonly center: Center;
  readonly text: string;
}

export interface StoreSignals {
  readonly source: Signal<Source>;
  readonly catalog: Signal<Catalog>;
  readonly graph: Signal<Graph>;
  /** The current Catalog's warnings; the header badge counts them. */
  readonly warnings: Signal<readonly Finding[]>;
  readonly center: Signal<Center | null>;
  readonly depth: Signal<number>;
  readonly groupBy: Signal<string>;
  readonly openGroups: Signal<ReadonlySet<GroupId>>;
  readonly overviewExpanded: Signal<boolean>;
  readonly spaceExpanded: Signal<boolean>;
  readonly report: Signal<Report | null>;
  /** The Channel whose card is open; transient, never URL state (docs/center.md, decision 8). */
  readonly channelCard: Signal<ChannelName | null>;
  readonly notice: Signal<Notice | null>;
  /** The ranked table's one-click filter; not persisted (docs/center.md, decision 4). */
  readonly applicationsOnly: Signal<boolean>;
}

export interface Actions {
  /** Loads a File or URL; resolves with the loader's result whether or not it was accepted. */
  load(source: File | string): Promise<LoadResult>;
  /** Sets the Center. A Center missing from the Graph clears the Center and raises the notice. */
  select(center: Center | null): void;
  /** A positive integer or `Number.POSITIVE_INFINITY`; anything else falls back to the default. */
  setDepth(depth: number): void;
  /** `none`, a built-in, or a groupable key; anything else falls back to the default. */
  setGroupBy(attribute: string): void;
  toggleGroup(id: GroupId): void;
  /** Opens every Group; a no-op above EXPAND_ALL_LIMIT Applications. */
  expandAll(): void;
  collapseAll(): void;
  expandOverview(expanded: boolean): void;
  expandSpace(expanded: boolean): void;
  closeReport(): void;
  /** Opens the warnings side sheet for the current Catalog. */
  openWarnings(): void;
  /** Opens the Channel card; an unknown Channel closes it. */
  openChannel(name: ChannelName | null): void;
  dismissNotice(): void;
  filterApplicationsOnly(only: boolean): void;
}

export interface Store extends StoreSignals {
  readonly actions: Actions;
  readonly derived: Derived;
}

export interface StoreInit {
  /** The Catalog the app starts with: the bundled sample, validated by the app slice. */
  readonly catalog: Catalog;
  readonly source?: Source;
  readonly warnings?: readonly Finding[];
  /** Passed through to `loadCatalog`; tests inject `fetch`, the app injects nothing. */
  readonly loadDeps?: LoadDeps;
}

/** The view state a URL carries, in the store's terms (docs/url-state.md). */
export interface ViewState {
  readonly center: Center | null;
  readonly depth: number;
  readonly groupBy: string;
  readonly overviewExpanded: boolean;
  readonly spaceExpanded?: boolean;
}

const SAMPLE_SOURCE: Source = { kind: 'sample', name: 'sample Catalog' };

export function createStore(init: StoreInit): Store {
  const signals: StoreSignals = {
    source: signal<Source>(init.source ?? SAMPLE_SOURCE),
    catalog: signal<Catalog>(init.catalog),
    graph: signal<Graph>(buildGraph(init.catalog)),
    warnings: signal<readonly Finding[]>(init.warnings ?? []),
    center: signal<Center | null>(null),
    depth: signal<number>(DEFAULT_DEPTH),
    groupBy: signal<string>(DEFAULT_GROUP),
    openGroups: signal<ReadonlySet<GroupId>>(new Set()),
    overviewExpanded: signal<boolean>(false),
    spaceExpanded: signal<boolean>(false),
    report: signal<Report | null>(null),
    channelCard: signal<ChannelName | null>(null),
    notice: signal<Notice | null>(null),
    applicationsOnly: signal<boolean>(false),
  };
  const actions = createActions(signals, init.loadDeps ?? {});
  const derived = createDerived(signals);
  return { ...signals, actions, derived };
}

function createActions(s: StoreSignals, loadDeps: LoadDeps): Actions {
  // Only the latest load applies, so a slow earlier fetch never overwrites a later Catalog.
  let loadSequence = 0;

  const centerIn = (graph: Graph, center: Center | null): boolean =>
    center !== null &&
    (center.kind === 'application'
      ? graph.applications.has(center.id)
      : graph.externals.has(center.id));

  const missingNotice = (center: Center, source: Source): Notice => {
    const hint = source.kind === 'sample' ? ' Load your Catalog to open it.' : '';
    return { kind: 'missing-center', center, text: `${center.id} is not in this Catalog.${hint}` };
  };

  /** The open set with the Center's Group added (docs/url-state.md, rule 3). An External has none. */
  const withCenterGroup = (
    open: ReadonlySet<GroupId>,
    center: Center | null,
  ): ReadonlySet<GroupId> => {
    if (center === null || center.kind !== 'application') {
      return open;
    }
    const application = s.graph.value.applications.get(center.id);
    if (application === undefined) {
      return open;
    }
    const id = groupIdOf(application, effectiveGrouping(s.groupBy.value));
    if (open.has(id)) {
      return open;
    }
    const next = new Set(open);
    next.add(id);
    return next;
  };

  const validGrouping = (graph: Graph, attribute: string): string =>
    attribute === NO_GROUPING || groupableAttributes(graph).includes(attribute)
      ? attribute
      : DEFAULT_GROUP;

  return {
    async load(source) {
      const sequence = ++loadSequence;
      const base = loadDeps.base ?? pageBase();
      const result = await loadCatalog(
        source,
        base === undefined ? loadDeps : { ...loadDeps, base },
      );
      if (sequence !== loadSequence) {
        return result;
      }
      if (result.catalog === undefined) {
        s.report.value = {
          mode: 'rejected',
          source: result.source,
          errors: result.errors,
          warnings: result.warnings,
        };
        return result;
      }
      // The catalog module's `Catalog` satisfies the graph module's structural `CatalogInput`;
      // state.test.ts pins that wiring against the real loader.
      const graph = buildGraph(result.catalog);
      batch(() => {
        s.catalog.value = result.catalog as Catalog;
        s.graph.value = graph;
        s.source.value = result.source;
        s.warnings.value = result.warnings;
        s.report.value = null;
        s.groupBy.value = validGrouping(graph, s.groupBy.value);
        const center = s.center.value;
        if (center !== null && !centerIn(graph, center)) {
          s.center.value = null;
          s.notice.value = missingNotice(center, result.source);
        }
        s.openGroups.value = withCenterGroup(new Set(), s.center.value);
        const card = s.channelCard.value;
        if (card !== null && !graph.channels.has(card)) {
          s.channelCard.value = null;
        }
      });
      return result;
    },

    select(center) {
      batch(() => {
        if (center !== null && !centerIn(s.graph.value, center)) {
          s.center.value = null;
          s.notice.value = missingNotice(center, s.source.value);
          return;
        }
        s.center.value = center;
        s.channelCard.value = null;
        s.openGroups.value = withCenterGroup(s.openGroups.value, center);
      });
    },

    setDepth(depth) {
      s.depth.value = isValidDepth(depth) ? depth : DEFAULT_DEPTH;
    },

    setGroupBy(attribute) {
      batch(() => {
        s.groupBy.value = validGrouping(s.graph.value, attribute);
        // Group ids are per Attribute, so the open set starts over.
        s.openGroups.value = withCenterGroup(new Set(), s.center.value);
      });
    },

    toggleGroup(id) {
      const next = new Set(s.openGroups.value);
      if (!next.delete(id)) {
        next.add(id);
      }
      s.openGroups.value = next;
    },

    expandAll() {
      const graph = s.graph.value;
      if (graph.applications.size > EXPAND_ALL_LIMIT) {
        return;
      }
      const groups = groupsFor(graph, effectiveGrouping(s.groupBy.value));
      s.openGroups.value = new Set(groups.map((group) => group.id));
    },

    collapseAll() {
      s.openGroups.value = new Set();
    },

    expandOverview(expanded) {
      batch(() => {
        s.overviewExpanded.value = expanded;
        if (expanded) s.spaceExpanded.value = false;
      });
    },

    expandSpace(expanded) {
      batch(() => {
        s.spaceExpanded.value = expanded;
        if (expanded) s.overviewExpanded.value = false;
      });
    },

    closeReport() {
      s.report.value = null;
    },

    openWarnings() {
      s.report.value = {
        mode: 'warnings',
        source: s.source.value,
        errors: [],
        warnings: s.warnings.value,
      };
    },

    openChannel(name) {
      s.channelCard.value = name !== null && s.graph.value.channels.has(name) ? name : null;
    },

    dismissNotice() {
      s.notice.value = null;
    },

    filterApplicationsOnly(only) {
      s.applicationsOnly.value = only;
    },
  };
}

/** A positive integer, or unbounded. */
export function isValidDepth(depth: number): boolean {
  return depth === Number.POSITIVE_INFINITY || (Number.isInteger(depth) && depth >= 1);
}

/** The Attribute the Overview groups by: `none` falls back to Repository (docs/url-state.md). */
export function effectiveGrouping(attribute: string): string {
  return attribute === NO_GROUPING ? DEFAULT_GROUP : attribute;
}

/** The graph module's Group id for an Application under an Attribute (`<attribute>=<label>`, or `<attribute>` when missing). */
export function groupIdOf(application: Application, attribute: string): GroupId {
  let value: unknown;
  switch (attribute) {
    case 'repository':
      value = application.repository;
      break;
    case 'team':
      value = application.team;
      break;
    case 'kind':
      value = application.kind;
      break;
    default:
      value = application.attributes[attribute];
  }
  const scalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  return scalar ? `${attribute}=${String(value)}` : attribute;
}

/** `location.href` when the page is served over http(s); nothing in Node or from `file:` (docs/catalog-sources.md). */
function pageBase(): string | undefined {
  const location = (globalThis as { location?: { protocol?: string; href?: string } }).location;
  if (location === undefined || location.href === undefined) {
    return undefined;
  }
  return location.protocol === 'http:' || location.protocol === 'https:'
    ? location.href
    : undefined;
}
