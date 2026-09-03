/**
 * The Channel card (docs/center.md, decision 8): a Channel's name and its publishers and subscribers
 * as clickable Application rows. A Channel is never a Center, so this card sets no selection and
 * writes nothing to the URL — clicking one of its Applications is what selects, and that closes the
 * card through the store. It is opened from search and from the `W_EMPTY_CHANNEL` report rows
 * (docs/validation-surfacing.md, decision 6), and it is dismissible.
 *
 * It renders `ChannelCardModel` and calls back; there is no graph traversal here.
 */

import type { BoardNode, ChannelCardModel } from '@/state';

export interface ChannelCardProps {
  readonly model: ChannelCardModel;
  /** Selecting one of the Applications; the shell routes it to `select`, which closes the card. */
  readonly onSelectApplication: (id: string) => void;
  readonly onDismiss: () => void;
}

export function ChannelCard({ model, onSelectApplication, onDismiss }: ChannelCardProps) {
  return (
    <section class="channel" role="dialog" aria-label="Channel" data-testid="channel-card">
      <header class="channel__head">
        <h2 class="channel__name" data-testid="channel-name">
          {model.name}
        </h2>
        <button type="button" data-testid="channel-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </header>

      <Side
        title="Producers"
        testId="channel-publishers"
        rows={model.publishers}
        onSelectApplication={onSelectApplication}
      />
      <Side
        title="Consumers"
        testId="channel-subscribers"
        rows={model.subscribers}
        onSelectApplication={onSelectApplication}
      />
    </section>
  );
}

function Side({
  title,
  testId,
  rows,
  onSelectApplication,
}: {
  title: string;
  testId: string;
  rows: readonly BoardNode[];
  onSelectApplication: (id: string) => void;
}) {
  return (
    <section class="channel__side" data-testid={testId} aria-label={title}>
      <h3 class="channel__side-title">
        {title} ({rows.length})
      </h3>
      {/* A one-sided Channel is a warning the report already reports; the card says so plainly. */}
      {rows.length === 0 ? (
        <p class="channel__none" data-testid={`${testId}-none`}>
          None in this Catalog
        </p>
      ) : (
        <ul class="channel__rows">
          {rows.map((row) => (
            <li key={row.id} class="channel__row" data-testid="channel-row" data-side={title}>
              <button
                type="button"
                class="channel__link"
                data-testid="channel-link"
                data-id={row.id}
                onClick={() => onSelectApplication(row.id)}
              >
                <span class="channel__label">{row.label}</span>
                {row.repository === undefined ? null : (
                  <span class="channel__chip" data-chip="repository">
                    {row.repository}
                  </span>
                )}
                {row.team === undefined ? null : (
                  <span class="channel__chip" data-chip="team">
                    {row.team}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
