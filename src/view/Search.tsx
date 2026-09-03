/**
 * Search over the Graph's index: Applications, Externals and Channels, each result typed with a kind
 * chip (docs/center.md, decisions 3 and 8). Arrow keys move the active result and Enter chooses it;
 * choosing an Application or an External sets the Center, choosing a Channel opens its card, which
 * changes no selection and no URL.
 *
 * Budget 7 (docs/performance-budgets.md) is measured here, per keystroke: `SEARCH_MARK` is stamped
 * in the input handler and `SEARCH_MEASURE` closed in a layout effect, so the measure spans the
 * keystroke, the query over the index and the results being committed to the DOM.
 *
 * The index is built once per Graph and handed in: `search` is a lookup over prepared terms, not a
 * traversal, which is what lets a component call it inside a keystroke (docs/architecture.md).
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Hit, type SearchIndex, search } from '@/graph';
import type { Center } from '@/state';

export const SEARCH_MARK = 'acv:search-start';
export const RESULTS_MARK = 'acv:search-results';
/** Budget 7: one keystroke to its results. */
export const SEARCH_MEASURE = 'acv:search-to-results';

/** Results in the dropdown; the rest are reached by typing more. */
export const SEARCH_LIMIT = 10;

export interface SearchProps {
  readonly index: SearchIndex;
  /** An Application or External result sets the Center. */
  readonly onSelect: (center: Center) => void;
  /** A Channel result opens the Channel card (docs/center.md, decision 8). */
  readonly onOpenChannel: (name: string) => void;
  readonly limit?: number;
}

/** The chip every result carries: Application, External or Channel. */
export function hitChip(kind: Hit['kind']): string {
  switch (kind) {
    case 'application':
      return 'Application';
    case 'external':
      return 'External';
    default:
      return 'Channel';
  }
}

/** What matched, when it was not the id itself: "name: Redis (shared cluster)". */
export function hitDetail(hit: Hit): string | null {
  return hit.field === 'id' || hit.value === hit.id ? null : `${hit.field}: ${hit.value}`;
}

export function Search({ index, onSelect, onOpenChannel, limit = SEARCH_LIMIT }: SearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const timing = useRef(false);

  const results = useMemo(() => search(index, query, limit), [index, query, limit]);
  const open = !dismissed && results.length > 0;

  useLayoutEffect(() => {
    if (!timing.current) {
      return;
    }
    timing.current = false;
    performance.mark(RESULTS_MARK);
    performance.measure(SEARCH_MEASURE, SEARCH_MARK, RESULTS_MARK);
  }, [query]);

  const choose = (hit: Hit) => {
    if (hit.kind === 'channel') {
      onOpenChannel(hit.id);
    } else {
      onSelect({ kind: hit.kind, id: hit.id });
    }
    setQuery('');
    setActive(0);
    setDismissed(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      setDismissed(true);
      return;
    }
    if (!open) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % results.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[Math.min(active, results.length - 1)];
      if (hit !== undefined) {
        choose(hit);
      }
    }
  };

  return (
    <div class="search" data-testid="search">
      <input
        type="search"
        class="search__input"
        data-testid="search-input"
        aria-label="Search Applications, Externals and Channels"
        autocomplete="off"
        placeholder="Search"
        value={query}
        onKeyDown={onKeyDown}
        onInput={(event) => {
          // Budget 7 starts at the keystroke, before the query runs.
          performance.mark(SEARCH_MARK);
          timing.current = true;
          setQuery((event.currentTarget as HTMLInputElement).value);
          setActive(0);
          setDismissed(false);
        }}
      />

      {open ? (
        <ul class="search__results" data-testid="search-results" aria-label="Search results">
          {results.map((hit, position) => {
            const detail = hitDetail(hit);
            return (
              <li
                key={`${hit.kind}:${hit.id}`}
                class="search__result"
                data-testid="search-result"
                data-kind={hit.kind}
                data-id={hit.id}
                data-active={position === active ? 'true' : 'false'}
              >
                <button
                  type="button"
                  class="search__choose"
                  data-testid="search-choose"
                  aria-current={position === active ? 'true' : undefined}
                  onClick={() => choose(hit)}
                >
                  <span class="search__id">{hit.id}</span>
                  <span class="search__chip" data-testid="search-chip">
                    {hitChip(hit.kind)}
                  </span>
                  {detail === null ? null : <span class="search__detail">{detail}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
