/**
 * The default screen after a Catalog loads: Applications and Externals ranked by Blast radius
 * together, each row with a kind chip, and a one-click filter to Applications only
 * (docs/center.md, decision 4). Budget 2 (docs/performance-budgets.md) is why the table paints its
 * first 100 rows and the rest on scroll — 1,000 rows never sit between the user and first paint.
 *
 * It renders `RankedModel` and calls back; there is no graph traversal here.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Center, RankedModel, TagsModel } from '@/state';
import { Tag } from './Tag';

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
  /**
   * Puts the Tag tokens on every row, so a Highlight raised anywhere reaches this table
   * (docs/tags.md), and makes the kind chip a Tag where it names one. Without it the table renders
   * exactly as it did before Tags existed.
   */
  readonly tags?: TagsModel;
  readonly onChooseTag?: (attribute: string) => void;
}

export function RankedTable({
  model,
  onSelect,
  onFilterChange,
  externalKinds,
  pageSize = FIRST_PAGE,
  onPainted,
  tags,
  onChooseTag,
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
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Blast radius</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              // Undefined when the shell supplied no kind for this External; the chip then reads
              // "External" and names no Group, so it must not become a Tag with an empty value.
              const externalKind = row.kind === 'external' ? externalKinds?.get(row.id) : undefined;
              return (
                <tr
                  key={`${row.kind}:${row.id}`}
                  data-testid="ranked-row"
                  data-kind={row.kind}
                  data-groups={tags?.index.tokens.get(row.id)}
                >
                  <td>{index + 1}</td>
                  <td>
                    <button
                      type="button"
                      class="ranked__link"
                      data-testid="ranked-link"
                      onClick={() => onSelect({ kind: row.kind, id: row.id })}
                    >
                      <span class="ranked__label" data-testid="ranked-label">
                        {row.label}
                      </span>
                      {/*
                       * The id stays inside the button, not beside it, so the accessible name is
                       * "<name> <id>" — a screen reader gets what it is and which one it is, and a
                       * text query for the id still finds the control that selects it. Hidden when
                       * the label already is the id, which is every Catalog whose ids read as names.
                       */}
                      {row.label === row.id ? null : (
                        <span class="ranked__id" data-testid="ranked-id">
                          {row.id}
                        </span>
                      )}
                    </button>
                  </td>
                  <td>
                    {/*
                     * The kind chip is a Tag only where it names an Attribute VALUE. An External's
                     * does — "External · database" is `kind=database`. An Application's reads
                     * "Application", which is the node's kind and not an Attribute value, so it names
                     * no Group and stays an inert chip. The row still carries `data-groups`, so it
                     * Highlights with its Group whatever raised the Highlight.
                     */}
                    {tags === undefined || externalKind === undefined ? (
                      <span class="ranked__chip" data-testid="ranked-chip">
                        {chipText(row.kind, row.id, externalKinds)}
                      </span>
                    ) : (
                      <Tag
                        tags={tags}
                        attribute="kind"
                        value={externalKind}
                        text={chipText(row.kind, row.id, externalKinds)}
                        chip="external"
                        testId="ranked-chip"
                        onChoose={onChooseTag}
                      />
                    )}
                  </td>
                  <td class="ranked__size">{row.size.toLocaleString('en-US')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
       * OUTSIDE the scroll container, deliberately. Inside it, the button sat below every painted
       * row — roughly 4,600 px down a 535 px window once the first stylesheet gave each row two
       * lines — so reaching it meant scrolling the table to its very bottom, past a sticky header.
       * That is unreachable for a real user, not merely awkward for a test, and it is why CI could
       * not click it. As a footer beneath the scroll box it is always on screen, and the scroll
       * handler above still pages the same rows for anyone who scrolls instead.
       */}
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
