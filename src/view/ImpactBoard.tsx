/**
 * The screen the viewer exists for: Needs | Center | Breaks, both outer columns banded by Depth
 * (docs/center.md, the prototype verdict on the map). Rows carry the Repository and Team chips of an
 * Application, or the kind chip of an External, and a click anywhere in a row — chips included —
 * selects that node, which is how the Needs column's chips make an External selectable
 * (docs/center.md, decision 3). With an External at the Center the Needs column holds one line and
 * keeps its place, so the three columns never shift.
 *
 * Budgets 5 and 6 (docs/performance-budgets.md) are measured from here: the shell stamps
 * `markSelectStart` or `markDepthStart` at the interaction, and the board stamps the frame after the
 * one that paints its columns, producing the measures `e2e/board.spec.ts` reads. The board is
 * deliberately the first thing repainted — "the board never waits for the pane".
 *
 * It renders `BoardModel` and calls back; there is no graph traversal here.
 */

import { useEffect } from 'preact/hooks';
import type { BoardBand, BoardModel, BoardNode, Center } from '@/state';
import { CenterCard } from './CenterCard';

export const SELECT_MARK = 'acv:select-start';
export const DEPTH_MARK = 'acv:depth-start';
export const BOARD_MARK = 'acv:board-painted';
/** Budget 5: a selection to the impact board's columns painted. */
export const SELECT_MEASURE = 'acv:select-to-board';
/** Budget 6: a header Depth change to the impact board repainted. */
export const DEPTH_MEASURE = 'acv:depth-to-board';

/**
 * Module state on purpose, as `src/app/App.tsx` does for budget 2: there is one board per page and
 * the alternative is threading a stopwatch through every callback. Re-stamping at each start is what
 * keeps a selection that never repaints (a missing Center clears it) from being measured later.
 */
let pending: 'select' | 'depth' | null = null;

/** Call immediately before setting the Center (budget 5's start). */
export function markSelectStart(): void {
  pending = 'select';
  performance.mark(SELECT_MARK);
}

/** Call immediately before changing the header Depth (budget 6's start). */
export function markDepthStart(): void {
  pending = 'depth';
  performance.mark(DEPTH_MARK);
}

function markBoardPainted(): void {
  if (pending === null) {
    return;
  }
  const from = pending === 'select' ? SELECT_MARK : DEPTH_MARK;
  const measure = pending === 'select' ? SELECT_MEASURE : DEPTH_MEASURE;
  pending = null;
  performance.mark(BOARD_MARK);
  performance.measure(measure, from, BOARD_MARK);
}

export interface ImpactBoardProps {
  readonly model: BoardModel;
  /** A row or one of its chips selects that node as the new Center. */
  readonly onSelect: (center: Center) => void;
  readonly onClear?: () => void;
  /** Passed to the middle card; injected in tests so the Markdown is asserted without a clipboard. */
  readonly copy?: (text: string) => void | Promise<void>;
}

export function ImpactBoard({ model, onSelect, onClear, copy }: ImpactBoardProps) {
  useEffect(() => {
    // Two frames: the first runs before the paint that commits these columns, the second after it.
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(markBoardPainted);
    });
    return () => cancelAnimationFrame(outer);
  }, [model]);

  return (
    <section class="board" data-testid="impact-board" aria-label="Impact">
      <Column
        name="Needs"
        testId="board-needs"
        bands={model.needs.bands}
        note={model.needs.note}
        onSelect={onSelect}
      />
      <CenterCard model={model} onClear={onClear} copy={copy} />
      <Column
        name="Breaks"
        testId="board-breaks"
        bands={model.breaks.bands}
        note={null}
        onSelect={onSelect}
        badge={`${model.breaks.total}`}
      />
    </section>
  );
}

function Column({
  name,
  testId,
  bands,
  note,
  onSelect,
  badge,
}: {
  name: string;
  testId: string;
  bands: readonly BoardBand[];
  /** The one line that replaces the bands and keeps the column's place (docs/center.md, 5). */
  note: string | null;
  onSelect: (center: Center) => void;
  badge?: string;
}) {
  return (
    <section class="board__column" data-testid={testId} data-column={name} aria-label={name}>
      <h2 class="board__column-title">
        {name}
        {badge === undefined ? null : (
          <span class="board__column-count" data-testid={`${testId}-count`}>
            {badge}
          </span>
        )}
      </h2>
      {note === null ? (
        bands.map((band) => (
          <section
            key={band.depth}
            class="board__band"
            data-testid="board-band"
            data-column={name}
            data-depth={band.depth}
          >
            <h3 class="board__band-title">Depth {band.depth}</h3>
            <ul class="board__rows">
              {band.rows.map((row) => (
                <Row key={`${row.kind}:${row.id}`} row={row} column={name} onSelect={onSelect} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p class="board__note" data-testid="board-note">
          {note}
        </p>
      )}
    </section>
  );
}

/**
 * One row is one button: a click on the label or on either chip selects the same node, so the chips
 * are live targets rather than decoration and no nested interactive element is needed for it.
 */
function Row({
  row,
  column,
  onSelect,
}: {
  row: BoardNode;
  column: string;
  onSelect: (center: Center) => void;
}) {
  return (
    <li class="board__row" data-testid="board-row" data-column={column} data-kind={row.kind}>
      <button
        type="button"
        class="board__link"
        data-testid="board-link"
        data-id={row.id}
        onClick={() => onSelect({ kind: row.kind, id: row.id })}
      >
        <span class="board__label" data-testid="board-label">
          {row.label}
        </span>
        {chipsOf(row).map((chip) => (
          <span
            key={`${chip.kind}:${chip.text}`}
            class={`board__chip board__chip--${chip.kind}`}
            data-testid="board-chip"
            data-chip={chip.kind}
          >
            {chip.text}
          </span>
        ))}
      </button>
    </li>
  );
}

/** An Application's Repository and Team chips; an External's kind chip ("External · database"). */
export function chipsOf(row: BoardNode): readonly { kind: string; text: string }[] {
  if (row.kind === 'external') {
    return [
      {
        kind: 'external',
        text: row.externalKind === undefined ? 'External' : `External · ${row.externalKind}`,
      },
    ];
  }
  const chips: { kind: string; text: string }[] = [];
  if (row.repository !== undefined) {
    chips.push({ kind: 'repository', text: row.repository });
  }
  if (row.team !== undefined) {
    chips.push({ kind: 'team', text: row.team });
  }
  return chips;
}
