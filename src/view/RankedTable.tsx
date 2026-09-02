/**
 * The default screen after a Catalog loads: Applications and Externals ranked by Blast radius
 * together, each row with a kind chip, and a one-click filter to Applications only
 * (docs/center.md, decision 4). Budget 2 (docs/performance-budgets.md) is why the table paints its
 * first 100 rows and the rest on scroll — 1,000 rows never sit between the user and first paint.
 *
 * It renders `RankedModel` and calls back; there is no graph traversal here.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Center, RankedModel } from '@/state';

/** Rows painted before the first scroll (docs/performance-budgets.md). */
export const FIRST_PAGE = 100;
/** How close to the bottom, in pixels, counts as "scrolled to the end". */
const SCROLL_SLACK = 64;

export interface RankedTableProps {
  readonly model: RankedModel;
  readonly onSelect: (center: Center) => void;
  readonly onFilterChange: (applicationsOnly: boolean) => void;
  /**
   * External id to its kind, for the "External · database" chip docs/center.md decision 4 asks
   * for. `RankedModel` carries only kind, id and size, so the shell supplies this; without it the
   * chip reads "External".
   */
  readonly externalKinds?: ReadonlyMap<string, string>;
  /** Rows added per page; the shell leaves this at FIRST_PAGE. */
  readonly pageSize?: number;
  /** Called after the browser has painted the current rows; the shell stamps budget 2 with it. */
  readonly onPainted?: () => void;
}

export function RankedTable({
  model,
  onSelect,
  onFilterChange,
  externalKinds,
  pageSize = FIRST_PAGE,
  onPainted,
}: RankedTableProps) {
  const [shown, setShown] = useState(pageSize);
  const rows = model.rows;

  // A new Catalog, or the filter flipping, starts the paging over.
  useEffect(() => {
    setShown(pageSize);
  }, [rows, pageSize]);

  const painted = useRef(onPainted);
  painted.current = onPainted;
  useEffect(() => {
    // Two frames: the first runs before the paint that commits these rows, the second after it.
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => painted.current?.());
    });
    return () => cancelAnimationFrame(outer);
  }, [rows]);

  const visible = rows.slice(0, shown);
  const more = rows.length - visible.length;

  const onScroll = (event: Event) => {
    const box = event.currentTarget as HTMLElement;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - SCROLL_SLACK) {
      setShown((current) => Math.min(rows.length, current + pageSize));
    }
  };

  return (
    <section class="ranked" data-testid="ranked-table" aria-label="Blast radius">
      <div class="ranked__controls">
        <label class="ranked__filter">
          <input
            type="checkbox"
            data-testid="applications-only"
            checked={model.applicationsOnly}
            onChange={(event) => onFilterChange((event.currentTarget as HTMLInputElement).checked)}
          />
          Applications only
        </label>
        <p class="ranked__counts" data-testid="ranked-counts">
          {model.applications.toLocaleString('en-US')} Applications,{' '}
          {model.externals.toLocaleString('en-US')} Externals
          {model.applicationsOnly ? ' — Externals hidden' : ''}
        </p>
      </div>

      {/* Scrolling this container reveals the next page; the Show-more button below is the
          keyboard path to the same rows. */}
      <div class="ranked__scroll" data-testid="ranked-scroll" onScroll={onScroll}>
        <table class="ranked__table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Id</th>
              <th scope="col">Kind</th>
              <th scope="col">Blast radius</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={`${row.kind}:${row.id}`} data-testid="ranked-row" data-kind={row.kind}>
                <td>{index + 1}</td>
                <td>
                  <button
                    type="button"
                    class="ranked__link"
                    data-testid="ranked-link"
                    onClick={() => onSelect({ kind: row.kind, id: row.id })}
                  >
                    {row.id}
                  </button>
                </td>
                <td>
                  <span class="ranked__chip" data-testid="ranked-chip">
                    {chipText(row.kind, row.id, externalKinds)}
                  </span>
                </td>
                <td class="ranked__size">{row.size.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {more > 0 ? (
          <button
            type="button"
            class="ranked__more"
            data-testid="ranked-more"
            onClick={() => setShown((current) => Math.min(rows.length, current + pageSize))}
          >
            Show {Math.min(more, pageSize)} more of {rows.length.toLocaleString('en-US')}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** "Application", or "External · database" when the shell supplied the External's kind. */
export function chipText(
  kind: Center['kind'],
  id: string,
  externalKinds?: ReadonlyMap<string, string>,
): string {
  if (kind === 'application') {
    return 'Application';
  }
  const externalKind = externalKinds?.get(id);
  return externalKind === undefined ? 'External' : `External · ${externalKind}`;
}
