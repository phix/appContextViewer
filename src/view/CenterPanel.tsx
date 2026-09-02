/**
 * A minimal panel for the selected Center: its kind and its id, plus a way back to no selection.
 * The impact board (issue #25) replaces this component with the three-column board
 * (docs/center.md); this slice only has to prove that selecting a row sets the Center, writes the
 * URL and repaints something that names it.
 */

import type { Center } from '@/state';

export interface CenterPanelProps {
  readonly center: Center;
  readonly onClear?: () => void;
}

export function CenterPanel({ center, onClear }: CenterPanelProps) {
  return (
    <section class="center" data-testid="center-panel" aria-label="Selected Center">
      <p class="center__kind" data-testid="center-kind">
        {center.kind === 'application' ? 'Application' : 'External'}
      </p>
      <p class="center__id" data-testid="center-id">
        {center.id}
      </p>
      {onClear === undefined ? null : (
        <button type="button" data-testid="center-clear" onClick={onClear}>
          Clear selection
        </button>
      )}
    </section>
  );
}
