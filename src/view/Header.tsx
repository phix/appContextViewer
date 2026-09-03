/**
 * The shell header: the Catalog's source name and counts, the warnings badge
 * (docs/validation-surfacing.md, decision 5: a count, absent at zero, opening the report as a side
 * sheet), the Depth select that both impact-board columns and the pane read (docs/url-state.md), a
 * slot the board slice fills with search, and the Expand-canvas button the Overview slice enables.
 *
 * Renders a view model and calls back; it never reads the store.
 */

import type { ComponentChildren } from 'preact';
import type { Source } from '@/state';

/** The Depth menu from docs/url-state.md: 1, 2, 3, all. */
export const DEPTH_OPTIONS: readonly number[] = [1, 2, 3, Number.POSITIVE_INFINITY];

export function depthValue(depth: number): string {
  return depth === Number.POSITIVE_INFINITY ? 'all' : String(depth);
}

export function depthLabel(depth: number): string {
  return depth === Number.POSITIVE_INFINITY ? 'All' : String(depth);
}

export interface HeaderProps {
  readonly source: Source;
  readonly applications: number;
  readonly externals: number;
  readonly warnings: number;
  readonly depth: number;
  readonly onDepthChange: (depth: number) => void;
  readonly onOpenWarnings: () => void;
  /** Empty here; the board slice fills it with the search box. */
  readonly searchSlot?: ComponentChildren;
  /** Absent while the Overview is disabled over the envelope, which is what disables the button. */
  readonly onExpandCanvas?: () => void;
  /** The Overview slice fills it with the group-by menu, Expand all, Collapse all, or its notice. */
  readonly overviewSlot?: ComponentChildren;
}

export function Header({
  source,
  applications,
  externals,
  warnings,
  depth,
  onDepthChange,
  onOpenWarnings,
  searchSlot,
  onExpandCanvas,
  overviewSlot,
}: HeaderProps) {
  return (
    <header class="header" data-testid="header">
      <h1 class="header__title">App Context Viewer</h1>

      <p class="header__source" data-testid="header-source">
        <span class="header__source-name">{source.name}</span>
        <span class="header__counts" data-testid="header-counts">
          {applications.toLocaleString('en-US')}{' '}
          {applications === 1 ? 'Application' : 'Applications'}, {externals.toLocaleString('en-US')}{' '}
          {externals === 1 ? 'External' : 'Externals'}
        </span>
      </p>

      {warnings > 0 ? (
        <button
          type="button"
          class="header__warnings"
          data-testid="warnings-badge"
          onClick={onOpenWarnings}
        >
          {warnings} {warnings === 1 ? 'warning' : 'warnings'}
        </button>
      ) : null}

      <label class="header__depth">
        Depth
        <select
          data-testid="depth-select"
          value={depthValue(depth)}
          onChange={(event) => {
            const raw = (event.currentTarget as HTMLSelectElement).value;
            onDepthChange(raw === 'all' ? Number.POSITIVE_INFINITY : Number(raw));
          }}
        >
          {DEPTH_OPTIONS.map((option) => (
            <option key={depthValue(option)} value={depthValue(option)}>
              {depthLabel(option)}
            </option>
          ))}
        </select>
      </label>

      {/* Filled by the board slice (#25); empty on purpose here. */}
      <div class="header__search" data-testid="header-search-slot">
        {searchSlot}
      </div>

      <button
        type="button"
        class="header__expand"
        data-testid="expand-canvas"
        disabled={onExpandCanvas === undefined}
        onClick={onExpandCanvas}
      >
        Expand canvas
      </button>

      {/* Filled by the Overview slice (#27); empty on purpose here. */}
      <div class="header__overview" data-testid="header-overview-slot">
        {overviewSlot}
      </div>
    </header>
  );
}
