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
import { isScalar } from '@/graph';
import type {
  BoardBand,
  BoardModel,
  BoardNode,
  CenterCard as CenterCardModel,
  TagsModel,
} from '@/state';
import { Tag } from './Tag';

export interface CenterCardProps {
  readonly model: BoardModel;
  /** Back to no selection; the shell wires it to `select(null)`. */
  readonly onClear?: () => void;
  /** Injected so the Markdown is asserted without a clipboard; defaults to the async clipboard. */
  readonly copy?: (text: string) => void | Promise<void>;
  /** Makes the card's values operable Tags (docs/tags.md). Without it they render as plain text. */
  readonly tags?: TagsModel;
  readonly onChooseTag?: (attribute: string) => void;
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

/**
 * Every Tag the Center card carries. Repository and Team come from the record's own fields, `kind`
 * from whichever kind the record states, and then every scalar Attribute; a non-scalar Attribute
 * names no Group and so is not a Tag (docs/tags.md).
 */
export function centerTags(
  card: CenterCardModel,
): readonly { attribute: string; value: string | number | boolean; text: string }[] {
  const tags: { attribute: string; value: string | number | boolean; text: string }[] = [];
  if (card.repository !== undefined) {
    tags.push({ attribute: 'repository', value: card.repository, text: card.repository });
  }
  if (card.team !== undefined) {
    tags.push({ attribute: 'team', value: card.team, text: `Team: ${card.team}` });
  }
  if (card.recordKind !== undefined) {
    tags.push({ attribute: 'kind', value: card.recordKind, text: kindText(card) });
  }
  for (const [key, value] of Object.entries(card.attributes)) {
    if (isScalar(value)) {
      tags.push({ attribute: key, value, text: `${key}: ${String(value)}` });
    }
  }
  return tags;
}

/** Whether the producer gave the record a name of its own, as schema v1's optional `name`. */
export function named(card: CenterCardModel): boolean {
  return card.name !== undefined;
}

async function writeToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function CenterCard({
  model,
  onClear,
  copy = writeToClipboard,
  tags,
  onChooseTag,
}: CenterCardProps) {
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
      data-groups={tags?.index.tokens.get(card.id)}
      aria-label="Selected Center"
    >
      <p class="center__kind" data-testid="center-kind">
        {kindText(card)}
      </p>

      {/*
       * The card leads with `labelOf` — the producer's name when there is one — and keeps the id
       * beneath it (item N6 of docs/retrospective-2026-09-03.md). Leading with the id rendered
       * `ATT-IDP4/customer-profile/apm10099` as the heading of a card whose record is called
       * "Contact Preference Service", which is unreadable and was the whole point of that item.
       *
       * `center-id` always exists and always carries the FULL id, because e2e/board.spec.ts,
       * e2e/naming.spec.ts and e2e/pane.spec.ts assert exactly that and none of them belongs to
       * this slice. With no name there is nothing better to lead with, so the heading IS the id and
       * there is no second line repeating it.
       *
       * Note this asks `card.name`, not `labelOf`: `labelOf` falls back to the PROJECT, so
       * `order-service` differs from `ATT-IDP4/commerce/order-service` without the producer having
       * named anything, and leading with it would have quietly dropped the Repository from a
       * heading that is supposed to identify the record.
       */}
      <h2 class="center__label" data-testid={named(card) ? 'center-name' : 'center-id'}>
        {card.name ?? card.id}
      </h2>

      {named(card) ? (
        <p class="center__record-id" data-testid="center-id">
          {card.id}
        </p>
      ) : null}

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

      {/*
       * The card's Tags: Repository, Team, kind and every scalar Attribute (docs/tags.md, "The Tags
       * a node carries"). They are added BESIDE the lines above rather than replacing them, because
       * `center-team`, `center-kind` and `center-attributes` are asserted by files this slice does
       * not own; a Tag strip is additive, an edit to those lines would not be.
       */}
      {tags === undefined ? null : (
        <div class="center__tags" data-testid="center-tags">
          {centerTags(card).map((tag) => (
            <Tag
              key={`${tag.attribute}=${String(tag.value)}`}
              tags={tags}
              attribute={tag.attribute}
              value={tag.value}
              text={tag.text}
              onChoose={onChooseTag}
            />
          ))}
        </div>
      )}

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
