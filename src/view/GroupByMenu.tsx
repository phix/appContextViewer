/**
 * The Overview's group-by menu (issue #27, the map's grouping decision in issue #7). Canvas only:
 * the app renders it into the header's Overview slot while the Overview is open, because grouping
 * is what the Overview draws and nothing else on the screen reads it.
 *
 * Options, in order: None, Repository, Team, Kind, then the discovered scalar Attribute keys the
 * graph module reports. `none` is a real value the URL carries (docs/url-state.md), but the Overview
 * cannot draw an ungrouped Catalog, so it falls back to Repository and the menu says so.
 *
 * Renders a view model and calls back; it never reads the store and never traverses the Graph.
 */

import { NO_GROUPING } from '@/state';

/** The sentence the menu shows while `none` is selected and the Overview is open. */
export const GROUP_BY_FALLBACK = 'None cannot be drawn; the Overview is grouped by Repository.';

/** `repository` reads as `Repository`; a discovered key keeps its own spelling otherwise. */
export function groupByLabel(attribute: string): string {
  if (attribute === NO_GROUPING) {
    return 'None';
  }
  return attribute.charAt(0).toUpperCase() + attribute.slice(1);
}

export interface GroupByMenuProps {
  /** `groupingAttributes(graph)`: `groupableAttributes` filtered by the cardinality rule (N7). */
  readonly attributes: readonly string[];
  /** The store's `groupBy`: `none`, or one of `attributes`. */
  readonly value: string;
  /** `OverviewModel.attribute`: what the Overview actually groups by. */
  readonly effective: string;
  readonly onChange: (attribute: string) => void;
}

export function GroupByMenu({ attributes, value, effective, onChange }: GroupByMenuProps) {
  return (
    <label class="groupby" data-testid="groupby">
      Group by
      <select
        data-testid="groupby-select"
        data-effective={effective}
        value={value}
        onChange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
      >
        {[NO_GROUPING, ...attributes].map((attribute) => (
          <option key={attribute} value={attribute}>
            {groupByLabel(attribute)}
          </option>
        ))}
      </select>
      {value === NO_GROUPING ? (
        <span class="groupby__fallback" data-testid="groupby-fallback" role="status">
          {GROUP_BY_FALLBACK}
        </span>
      ) : null}
    </label>
  );
}
