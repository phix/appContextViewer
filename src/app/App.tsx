/**
 * The app shell: header with search, picker, the impact board, the ranked Blast-radius table, the
 * Channel card, the missing-Center notice and the report (dialog or side sheet). It wires `@/view`
 * components to the store's signals and actions and owns nothing else — the derived models decide
 * what is on screen.
 *
 * Budget 2 (docs/performance-budgets.md): `markLoadStart` stamps the moment a Catalog source is
 * chosen — picker, drop or `?src=` — and the ranked table's post-paint callback stamps the moment
 * its rows are on screen, producing the `LOAD_MEASURE` measure `e2e/load.spec.ts` reads.
 */

import { useComputed } from '@preact/signals';
import { useCallback, useRef } from 'preact/hooks';
import { buildSearchIndex, groupingAttributes } from '@/graph';
import type { Center, Store } from '@/state';
import {
  ChannelCard,
  GroupByMenu,
  Header,
  ImpactBoard,
  markDepthStart,
  markSelectStart,
  NeighborhoodPane,
  Overview,
  OverviewControls,
  Picker,
  RankedTable,
  Report,
  Search,
  Space,
} from '@/view';

export const LOAD_MARK = 'acv:load-start';
export const TABLE_MARK = 'acv:table-painted';
export const LOAD_MEASURE = 'acv:load-to-table';

// Module state on purpose: there is one shell per page, the load path is what it measures, and the
// alternative is threading a stopwatch through every callback. `pending` keeps the measure to
// loads the user asked for, so the first paint of the bundled sample never produces one.
let pending = false;

/** Call immediately before handing a File or URL to `actions.load` (budget 2's start). */
export function markLoadStart(): void {
  pending = true;
  performance.mark(LOAD_MARK);
}

/** Call when a load settles without a Catalog: budget 2 measures loads that reached the table. */
export function markLoadRejected(): void {
  pending = false;
}

/** Called by the ranked table once the browser has painted its rows (budget 2's end). */
export function markTablePainted(): void {
  if (!pending) {
    return;
  }
  pending = false;
  performance.mark(TABLE_MARK);
  performance.measure(LOAD_MEASURE, LOAD_MARK, TABLE_MARK);
}

export interface AppProps {
  readonly store: Store;
}

export function App({ store }: AppProps) {
  // The report's "Choose another file" reopens the picker through this input.
  const pickerInput = useRef<HTMLInputElement>(null);

  /**
   * External id to kind, for the ranked table's "External · database" chip. `RankedModel` carries
   * kind, id and size only, so the chip's kind is read here from the Graph's own record — a map
   * lookup, not a traversal (docs/architecture.md, "view").
   */
  const externalKinds = useComputed(() => {
    const kinds = new Map<string, string>();
    for (const [id, external] of store.graph.value.externals) {
      kinds.set(id, external.kind);
    }
    return kinds;
  });

  /**
   * The search index, built once per Graph. `@/state` derives no search view model, so the shell
   * builds it here exactly as it builds `externalKinds` above (issue #25's PR proposes moving it
   * into `derived`); `search` then runs per keystroke over prepared terms, not over the Graph.
   */
  const searchIndex = useComputed(() => buildSearchIndex(store.graph.value));

  /**
   * The group-by menu's options: `groupingAttributes`, not `groupableAttributes` — the cardinality
   * rule (docs/tags.md, item N7) drops an Attribute here even though a Tag for it still Highlights.
   */
  const groupable = useComputed(() => groupingAttributes(store.graph.value));

  const load = (source: File | string) => {
    markLoadStart();
    void store.actions.load(source).then((result) => {
      // A rejected Catalog never repaints the table, so without this the stopwatch stays running
      // and the next unrelated row change (a filter tick) would measure from the failed load.
      if (result.catalog === undefined) {
        markLoadRejected();
      }
    });
  };

  // Budgets 5 and 6 (docs/performance-budgets.md): the stopwatch starts at the interaction and the
  // impact board stamps the frame after it paints. Every selection path — table, search, a board
  // chip, a report row — arrives here, so one start covers them all.
  // `useCallback` for identity, not for speed: this reaches `Canvas`'s effect deps through the
  // pane, and a fresh closure per render would rebuild the Cytoscape core -- see the note beside
  // `painted` in NeighborhoodPane.tsx for why that shows up as a budget-3/4 failure.
  //
  // NO TEST COVERS THIS ONE, and none can today. Two seams are both shut: Cytoscape never
  // initializes under jsdom, so a unit test has no core to compare identities against; and nothing
  // in this shell currently re-renders `App` while leaving `paneModel` identical, so an e2e test
  // has no way to provoke the rebuild. An e2e assertion on core identity across a ranked-filter
  // toggle was written and then deleted, because BOTH mutants -- this `useCallback` removed, and
  // the pane's -- survived it, and a test that passes with and without its subject is worse than
  // no test. The pane's half of the same fix IS covered, by the Canvas-prop identity test in
  // NeighborhoodPane.test.tsx. Keep this `useCallback`: it is correct regardless, and it becomes
  // load-bearing the moment a signal read moves into this component's body.
  const select = useCallback(
    (center: Center) => {
      markSelectStart();
      store.actions.select(center);
    },
    [store],
  );

  const setDepth = (depth: number) => {
    markDepthStart();
    store.actions.setDepth(depth);
  };

  const chooseAnother = () => {
    store.actions.closeReport();
    const input = pickerInput.current;
    if (input !== null) {
      input.focus();
      input.click();
    }
  };

  const report = store.report.value;
  const notice = store.notice.value;
  const board = store.derived.board.value;
  const channelCard = store.derived.channelCardModel.value;
  const pane = store.derived.paneModel.value;
  const overview = store.derived.overviewModel.value;

  return (
    <div class="shell" data-testid="shell">
      <Header
        source={store.source.value}
        applications={store.graph.value.applications.size}
        externals={store.graph.value.externals.size}
        warnings={store.derived.warningsCount.value}
        depth={store.depth.value}
        onDepthChange={setDepth}
        onOpenWarnings={store.actions.openWarnings}
        onExpandCanvas={
          overview.overviewDisabled
            ? undefined
            : () => store.actions.expandOverview(!overview.expanded)
        }
        overviewExpanded={overview.expanded}
        onExpandSpace={() => store.actions.expandSpace(!store.spaceExpanded.value)}
        spaceExpanded={store.spaceExpanded.value}
        overviewSlot={
          store.spaceExpanded.value ? (
            <GroupByMenu
              attributes={groupable.value}
              value={store.groupBy.value}
              effective={store.groupBy.value === 'none' ? 'repository' : store.groupBy.value}
              onChange={store.actions.setGroupBy}
            />
          ) : (
            <OverviewControls
              model={overview}
              attributes={groupable.value}
              groupBy={store.groupBy.value}
              onGroupBy={store.actions.setGroupBy}
              onExpandAll={store.actions.expandAll}
              onCollapseAll={store.actions.collapseAll}
            />
          )
        }
        searchSlot={
          <Search
            index={searchIndex.value}
            onSelect={select}
            onOpenChannel={store.actions.openChannel}
          />
        }
      />

      <Picker onPick={load} inputRef={pickerInput} />

      {notice === null ? null : (
        <p class="notice" role="status" data-testid="notice">
          {notice.text}{' '}
          <button type="button" data-testid="notice-dismiss" onClick={store.actions.dismissNotice}>
            Dismiss
          </button>
        </p>
      )}

      <main class="shell__main">
        {overview.expanded && !overview.overviewDisabled ? (
          <Overview
            model={overview}
            center={store.center.value}
            onToggleGroup={store.actions.toggleGroup}
            onSelect={select}
          />
        ) : null}
        {store.spaceExpanded.value ? (
          <Space
            graph={store.graph.value}
            center={store.center.value}
            depth={store.depth.value}
            grouping={store.groupBy.value === 'none' ? 'repository' : store.groupBy.value}
            onSelect={select}
          />
        ) : null}
        {board === null ? null : (
          <ImpactBoard
            model={board}
            onSelect={select}
            onClear={() => store.actions.select(null)}
            tags={store.derived.tags.value}
            onChooseTag={store.actions.setGroupBy}
          />
        )}
        {pane === null ? null : (
          <NeighborhoodPane
            model={pane}
            onSelect={select}
            onExpandOverview={() => store.actions.expandOverview(true)}
          />
        )}
        <RankedTable
          model={store.derived.ranked.value}
          onSelect={select}
          onFilterChange={store.actions.filterApplicationsOnly}
          externalKinds={externalKinds.value}
          onPainted={markTablePainted}
          tags={store.derived.tags.value}
          onChooseTag={store.actions.setGroupBy}
        />
      </main>

      {channelCard === null ? null : (
        <ChannelCard
          model={channelCard}
          onSelectApplication={(id) => select({ kind: 'application', id })}
          onDismiss={() => store.actions.openChannel(null)}
        />
      )}

      {report === null ? null : (
        <Report
          report={report}
          onClose={store.actions.closeReport}
          onChooseAnother={chooseAnother}
          onSelectApplication={(id) => select({ kind: 'application', id })}
          onOpenChannel={store.actions.openChannel}
        />
      )}
    </div>
  );
}
