/**
 * The middle column of the impact board: the Center's own record, whichever kind it is
 * (docs/center.md, decisions 1 and 5). An Application shows id, kind, Team, description, url,
 * attributes, the "N break across T Teams" badge, its Flows and Copy as Markdown; an External shows
 * the same minus Team and Flows, which it never has.
 *
 * It keeps the `center-panel`, `center-kind`, `center-id` and `center-clear` test ids the deleted
 * `CenterPanel` carried, because `e2e/load.spec.ts`, `e2e/report.spec.ts` and
 * `src/app/jsdom-project.test.tsx` assert them and none of those files belongs to this slice. The
 * card is a superset of what the panel showed, so those assertions stay true rather than being
 * edited away.
 *
 * Renders `BoardModel` and calls back; there is no graph traversal here.
 */

import { useState } from 'preact/hooks';
import type { BoardBand, BoardModel, BoardNode, CenterCard as CenterCardModel } from '@/state';

export interface CenterCardProps {
  readonly model: BoardModel;
  /** Back to no selection; the shell wires it to `select(null)`. */
  readonly onClear?: () => void;
  /** Injected so the Markdown is asserted without a clipboard; defaults to the async clipboard. */
  readonly copy?: (text: string) => void | Promise<void>;
}

/** "Application · service", "External · cache", or the bare kind when the record names none. */
export function kindText(card: CenterCardModel): string {
  const kind = card.kind === 'application' ? 'Application' : 'External';
  return card.recordKind === undefined ? kind : `${kind} · ${card.recordKind}`;
}

/** The badge docs/center.md asks for: "12 break across 7 Teams". */
export function breaksBadge(total: number, teams: number): string {
  return `${total} break across ${teams} ${teams === 1 ? 'Team' : 'Teams'}`;
}

/** A scalar Attribute reads as itself; anything nested reads as its JSON, as the report does. */
export function attributeText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

function nodeLine(row: BoardNode): string {
  const chips =
    row.kind === 'application'
      ? [row.repository, row.team]
      : [row.externalKind === undefined ? 'External' : `External · ${row.externalKind}`];
  const present = chips.filter((chip): chip is string => chip !== undefined);
  return present.length === 0 ? `- \`${row.id}\`` : `- \`${row.id}\` — ${present.join(' · ')}`;
}

function bandLines(bands: readonly BoardBand[], into: string[]): void {
  if (bands.length === 0) {
    into.push('_nothing_', '');
    return;
  }
  for (const band of bands) {
    into.push(`### Depth ${band.depth}`, '');
    for (const row of band.rows) {
      into.push(nodeLine(row));
    }
    into.push('');
  }
}

/**
 * Copy as Markdown: a heading naming the Center, its record, the badge, and then per-Depth lists for
 * both columns — the screen, in a form that pastes into a ticket.
 */
export function boardMarkdown(model: BoardModel): string {
  const card = model.center;
  const lines = [`# ${card.id}`, ''];
  const head =
    card.kind === 'application' && card.team !== undefined
      ? `${kindText(card)} — Team ${card.team}`
      : kindText(card);
  lines.push(head, '');
  if (card.name !== undefined) {
    lines.push(card.name, '');
  }
  if (card.description !== undefined) {
    lines.push(card.description, '');
  }
  if (card.url !== undefined) {
    lines.push(card.url, '');
  }
  lines.push(breaksBadge(model.breaks.total, model.breaks.teams), '');

  const attributes = Object.entries(card.attributes);
  if (attributes.length > 0) {
    lines.push('## Attributes', '');
    for (const [key, value] of attributes) {
      lines.push(`- ${key}: ${attributeText(value)}`);
    }
    lines.push('');
  }

  if (card.kind === 'application') {
    lines.push('## Flows', '');
    lines.push(`- Publishes: ${card.publishes.length === 0 ? 'none' : card.publishes.join(', ')}`);
    lines.push(
      `- Subscribes: ${card.subscribes.length === 0 ? 'none' : card.subscribes.join(', ')}`,
    );
    lines.push('');
  }

  lines.push('## Needs', '');
  if (model.needs.note === null) {
    bandLines(model.needs.bands, lines);
  } else {
    lines.push(model.needs.note, '');
  }

  lines.push('## Breaks', '');
  bandLines(model.breaks.bands, lines);

  return lines.join('\n');
}

async function writeToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function CenterCard({ model, onClear, copy = writeToClipboard }: CenterCardProps) {
  // The async clipboard rejects when the page has no permission for it; saying so beats a button
  // that looks like it worked (the report does the same).
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const card = model.center;
  const attributes = Object.entries(card.attributes);

  const onCopy = () => {
    void Promise.resolve(copy(boardMarkdown(model)))
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  const copyLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy as Markdown';

  return (
    <section
      class="center"
      data-testid="center-panel"
      data-kind={card.kind}
      aria-label="Selected Center"
    >
      <p class="center__kind" data-testid="center-kind">
        {kindText(card)}
      </p>
      <h2 class="center__id" data-testid="center-id">
        {card.id}
      </h2>

      {card.name === undefined ? null : (
        <p class="center__name" data-testid="center-name">
          {card.name}
        </p>
      )}

      {card.team === undefined ? null : (
        <p class="center__team" data-testid="center-team">
          Team {card.team}
        </p>
      )}

      {card.description === undefined ? null : (
        <p class="center__description" data-testid="center-description">
          {card.description}
        </p>
      )}

      {card.url === undefined ? null : (
        <p class="center__url">
          <a data-testid="center-url" href={card.url}>
            {card.url}
          </a>
        </p>
      )}

      <p class="center__badge" data-testid="center-badge">
        {breaksBadge(model.breaks.total, model.breaks.teams)}
      </p>

      {attributes.length === 0 ? null : (
        <dl class="center__attributes" data-testid="center-attributes">
          {attributes.map(([key, value]) => (
            <div key={key} class="center__attribute" data-testid="center-attribute" data-key={key}>
              <dt>{key}</dt>
              <dd>{attributeText(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* An External has no Flows (docs/center.md, decision 5), so the section is absent, not empty. */}
      {card.kind === 'application' ? (
        <div class="center__flows" data-testid="center-flows">
          <p class="center__flow" data-testid="center-publishes">
            Publishes: {card.publishes.length === 0 ? 'none' : card.publishes.join(', ')}
          </p>
          <p class="center__flow" data-testid="center-subscribes">
            Subscribes: {card.subscribes.length === 0 ? 'none' : card.subscribes.join(', ')}
          </p>
        </div>
      ) : null}

      <div class="center__actions">
        <button type="button" data-testid="center-copy" onClick={onCopy}>
          {copyLabel}
        </button>
        {onClear === undefined ? null : (
          <button type="button" data-testid="center-clear" onClick={onClear}>
            Clear selection
          </button>
        )}
      </div>
    </section>
  );
}
