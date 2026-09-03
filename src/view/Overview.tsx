/**
 * The Overview (issue #27): the whole Catalog, Applications only, always grouped, collapsed until
 * opened, laid out by elk in a Web Worker. It turns `OverviewModel` into render-ready Cytoscape
 * elements and a plain layout spec, runs the layout through the layout module's `OverviewLayout`
 * seam, and hands the result to `OverviewCanvas`. No graph traversal, no layout engine imported
 * directly, no Cytoscape outside canvas/ (docs/architecture.md).
 *
 * Budgets 9, 10 and 11 (docs/performance-budgets.md) are all the same stopwatch: `OVERVIEW_MEASURE`
 * runs from the moment a new element set is handed to elk to the frame after the canvas paints it.
 * The 300 ms animation of budget 12 is a separate, fixed constant published by the canvas.
 *
 * Cancelling does not roll the store's open set back — it cannot, the open set is URL state and
 * this component owns no actions. What it does is what the ticket asks for: the run is aborted and
 * the previous positions stay on screen, with a line saying the drawing is behind the request and
 * a Retry that starts the run again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createOverviewLayout,
  type OverviewLayout,
  type OverviewSpec,
  type Positions,
} from '@/layout';
import { type Center, EXPAND_ALL_LIMIT, type OverviewModel } from '@/state';
import { OverviewCanvas, type OverviewCanvasElements } from './canvas/OverviewCanvas';
import { GroupByMenu } from './GroupByMenu';

export const OVERVIEW_LAYOUT_MARK = 'acv:overview-layout-start';
export const OVERVIEW_LAID_OUT_MARK = 'acv:overview-laid-out';
export const OVERVIEW_PAINT_MARK = 'acv:overview-painted';
/** Budgets 9, 10 and 11: elk in the worker plus the paint of what it produced. */
export const OVERVIEW_MEASURE = 'acv:overview-layout-to-paint';
/**
 * The elk half of the same stopwatch, so a budget failure says which half missed: the engine in the
 * worker, or Cytoscape's element churn and paint on the main thread. The first run of a page also
 * carries the elk chunk's fetch and the worker's boot, which is the point of budget 14.
 */
export const OVERVIEW_ELK_MEASURE = 'acv:overview-elk';

/** Node sizes the view decides, because the view is what knows how big a label draws. */
export const COLLAPSED_WIDTH = 200;
export const COLLAPSED_HEIGHT = 48;
export const MEMBER_WIDTH = 190;
export const MEMBER_HEIGHT = 40;
/** An open Group's label chip: its value, its member count, and the control that closes it. */
export const LABEL_WIDTH = 200;
export const LABEL_HEIGHT = 24;

export const CANCELLED_NOTE = 'Layout cancelled; showing the previous Overview.';

/** The tooltip on a disabled Expand all (docs/performance-budgets.md, "Above the supported envelope"). */
export function expandAllTooltip(applications: number): string {
  return `Expand all is disabled above ${EXPAND_ALL_LIMIT.toLocaleString('en-US')} Applications; this Catalog has ${applications.toLocaleString('en-US')}.`;
}

export const nodeIdOf = {
  group: (id: string) => `group:${id}`,
  label: (id: string) => `label:${id}`,
  application: (id: string) => `app:${id}`,
};

export interface OverviewRender {
  readonly elements: OverviewCanvasElements;
  readonly spec: OverviewSpec;
  /** Group ids that cannot be collapsed because they hold the Center (docs/center.md, 7). */
  readonly locked: ReadonlySet<string>;
}

/**
 * Collapsed Groups become one leaf each, labelled with the Group value and its member count; open
 * Groups become compound parents holding their members, plus a label chip carrying the same text,
 * which is what the user clicks to close the Group again (see `OverviewNodeKind` for why the
 * compound's own padding band cannot be that control). Group Dependencies become one directed
 * edge per ordered pair, labelled with the count; member-level Dependencies are drawn only between
 * members of open Groups, which is what hides a collapsed Group's intra-Group edges and restores
 * them when it opens. Externals and Channels are not in `OverviewModel.edges` at all, so they are
 * never drawn.
 *
 * Member labels are Application ids: `OverviewModel` carries no display label for a Group member,
 * and looking one up would be a Graph traversal from the view.
 */
export function overviewRenderOf(model: OverviewModel, center: Center | null): OverviewRender {
  const highlighted = new Set(model.highlighted);
  const nodes: OverviewCanvasElements['nodes'][number][] = [];
  const specNodes: { id: string; width: number; height: number }[] = [];
  const parents = new Map<string, string>();
  // The Center's own Group is auto-opened by the store and must stay open while it holds the
  // Center; an External Center highlights its Dependents' Groups but locks none of them.
  const locked = new Set<string>(
    center !== null && center.kind === 'application' ? model.highlighted : [],
  );

  for (const group of model.groups) {
    const id = nodeIdOf.group(group.id);
    const label = `${group.label} · ${group.members.length}`;
    if (model.open.has(group.id)) {
      nodes.push({
        id,
        sourceId: group.id,
        label: '',
        kind: 'open',
        highlighted: highlighted.has(group.id),
        locked: locked.has(group.id),
      });
      nodes.push({
        id: nodeIdOf.label(group.id),
        sourceId: group.id,
        label,
        kind: 'label',
        parent: id,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
        highlighted: highlighted.has(group.id),
        locked: locked.has(group.id),
      });
      for (const member of group.members) {
        const memberId = nodeIdOf.application(member);
        nodes.push({
          id: memberId,
          sourceId: member,
          label: member,
          kind: 'member',
          parent: id,
          width: MEMBER_WIDTH,
          height: MEMBER_HEIGHT,
          highlighted: highlighted.has(group.id),
        });
        specNodes.push({ id: memberId, width: MEMBER_WIDTH, height: MEMBER_HEIGHT });
        parents.set(memberId, id);
      }
    } else {
      nodes.push({
        id,
        sourceId: group.id,
        label,
        kind: 'collapsed',
        width: COLLAPSED_WIDTH,
        height: COLLAPSED_HEIGHT,
        highlighted: highlighted.has(group.id),
      });
      specNodes.push({ id, width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT });
    }
  }

  const edges: OverviewCanvasElements['edges'][number][] = model.edges.map((edge) =>
    edge.kind === 'group'
      ? {
          id: `group-edge:${edge.from}->${edge.to}`,
          source: nodeIdOf.group(edge.from),
          target: nodeIdOf.group(edge.to),
          label: String(edge.count),
          kind: 'group' as const,
          highlighted: highlighted.has(edge.from) || highlighted.has(edge.to),
        }
      : {
          id: `member-edge:${edge.from}->${edge.to}`,
          source: nodeIdOf.application(edge.from),
          target: nodeIdOf.application(edge.to),
          kind: 'member' as const,
        },
  );

  return {
    elements: { nodes, edges },
    spec: {
      nodes: specNodes,
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
      parents,
    },
    locked,
  };
}

// ---------------------------------------------------------------- header controls

export interface OverviewControlsProps {
  readonly model: OverviewModel;
  /** `groupableAttributes(graph)`: Repository, Team, Kind, then the discovered scalar keys. */
  readonly attributes: readonly string[];
  /** The store's `groupBy`, which may be `none`. */
  readonly groupBy: string;
  readonly onGroupBy: (attribute: string) => void;
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
}

/**
 * What the Overview puts in the header: the group-by menu, Expand all and Collapse all while the
 * Overview is open, and the disabled-Overview notice, which is shown whether or not the Overview is
 * open because the Expand-canvas button that would open it is disabled with it.
 */
export function OverviewControls({
  model,
  attributes,
  groupBy,
  onGroupBy,
  onExpandAll,
  onCollapseAll,
}: OverviewControlsProps) {
  if (model.overviewDisabled) {
    return (
      <p class="overview__notice" data-testid="overview-notice" role="status">
        {model.notice}
      </p>
    );
  }
  if (!model.expanded) {
    return null;
  }
  return (
    <div class="overview__controls" data-testid="overview-controls">
      <GroupByMenu
        attributes={attributes}
        value={groupBy}
        effective={model.attribute}
        onChange={onGroupBy}
      />
      <button
        type="button"
        data-testid="expand-all"
        disabled={model.expandAllDisabled}
        title={model.expandAllDisabled ? expandAllTooltip(model.applications) : undefined}
        onClick={onExpandAll}
      >
        Expand all
      </button>
      <button type="button" data-testid="collapse-all" onClick={onCollapseAll}>
        Collapse all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- the canvas

export interface OverviewProps {
  readonly model: OverviewModel;
  readonly center: Center | null;
  readonly onToggleGroup: (id: string) => void;
  readonly onSelect: (center: Center) => void;
  /** Injectable so a test can drive the layout without elk; the app takes the default. */
  readonly createLayout?: () => OverviewLayout;
}

interface Applied {
  readonly elements: OverviewCanvasElements;
  readonly positions: Positions;
}

export function Overview({ model, center, onToggleGroup, onSelect, createLayout }: OverviewProps) {
  const render = useMemo(() => overviewRenderOf(model, center), [model, center]);
  const layout = useMemo(() => (createLayout ?? createOverviewLayout)(), [createLayout]);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [running, setRunning] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    return () => {
      // Bumping first makes every run in flight stale, so disposing cannot set state after unmount.
      sequence.current++;
      layout.dispose();
    };
  }, [layout]);

  useEffect(() => {
    const run = ++sequence.current;
    const aborter = new AbortController();
    controller.current = aborter;
    setRunning(true);
    setCancelled(false);
    setError(null);
    performance.mark(OVERVIEW_LAYOUT_MARK);
    void layout.run(render.spec, aborter.signal).then(
      (positions) => {
        if (sequence.current !== run) {
          return;
        }
        performance.mark(OVERVIEW_LAID_OUT_MARK);
        performance.measure(OVERVIEW_ELK_MEASURE, OVERVIEW_LAYOUT_MARK, OVERVIEW_LAID_OUT_MARK);
        setRunning(false);
        setApplied({ elements: render.elements, positions });
      },
      (reason: unknown) => {
        if (sequence.current !== run) {
          return;
        }
        setRunning(false);
        if (aborter.signal.aborted) {
          setCancelled(true);
          return;
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    // No abort on cleanup: aborting terminates the worker, which would also kill the run that
    // supersedes this one. The sequence guard above is what makes a stale answer harmless.
  }, [render, layout, attempt]);

  const painted = useCallback(() => {
    performance.mark(OVERVIEW_PAINT_MARK);
    try {
      performance.measure(OVERVIEW_MEASURE, OVERVIEW_LAYOUT_MARK, OVERVIEW_PAINT_MARK);
    } catch {
      // No start mark: the canvas repainted for a reason other than a layout run.
    }
  }, []);

  const appliedOpen =
    applied === null ? 0 : applied.elements.nodes.filter((node) => node.kind === 'open').length;

  const openGroup = useCallback((id: string) => onToggleGroup(id), [onToggleGroup]);
  const collapseGroup = useCallback(
    (id: string) => {
      if (render.locked.has(id)) {
        return;
      }
      onToggleGroup(id);
    },
    [onToggleGroup, render],
  );
  const selectApplication = useCallback(
    (id: string) => onSelect({ kind: 'application', id }),
    [onSelect],
  );

  return (
    <section
      class="overview"
      data-testid="overview"
      aria-label="Overview"
      // What the store has been ASKED to open, which is not what the canvas has drawn: the drawing
      // only changes when elk answers, so between a click and that answer the two differ, and a
      // cancelled run leaves them differing for good. A test that asserts nothing changed needs the
      // request, or it passes merely because the canvas had not caught up yet.
      data-open-groups={String(model.open.size)}
      data-drawn-groups={applied === null ? '' : String(appliedOpen)}
    >
      <header class="overview__header">
        <h2>Overview</h2>
        <span data-testid="overview-groups">
          {model.groups.length} {model.groups.length === 1 ? 'Group' : 'Groups'} by{' '}
          {model.attribute}
        </span>
        {/*
          The cap notice (docs/performance-budgets.md, "Overview cap"). It sits in the header beside
          the Group count because it is part of what the Overview IS at this size -- the heaviest
          Group Dependencies -- and not an error about a failed drawing.
        */}
        {model.capNotice === null ? null : (
          <span class="overview__notice" data-testid="overview-cap-notice" role="status">
            {model.capNotice}
          </span>
        )}
        {running ? (
          <span class="overview__progress" data-testid="overview-progress" role="status">
            Laying out {model.groups.length} Groups…
            <button
              type="button"
              data-testid="overview-cancel"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          </span>
        ) : null}
        {cancelled ? (
          <span class="overview__cancelled" data-testid="overview-cancelled" role="status">
            {CANCELLED_NOTE}
            <button
              type="button"
              data-testid="overview-retry"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Retry
            </button>
          </span>
        ) : null}
      </header>

      {error === null ? null : (
        <p role="alert" data-testid="overview-error">
          The Overview could not be laid out: {error}
        </p>
      )}

      {applied === null ? null : (
        <OverviewCanvas
          elements={applied.elements}
          positions={applied.positions}
          onOpenGroup={openGroup}
          onCollapseGroup={collapseGroup}
          onSelectApplication={selectApplication}
          onPainted={painted}
        />
      )}
    </section>
  );
}
