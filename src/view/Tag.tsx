/**
 * A Tag: the visible handle of a Group (CONTEXT.md, **Tag**), rendered on a board row, a ranked row
 * and the Center card. Pointing at one — hover OR keyboard focus, because a hover-only affordance
 * does not exist for anyone navigating by keyboard — Highlights its Group everywhere at once;
 * choosing one makes its Attribute the grouping Attribute (docs/tags.md).
 *
 * It is a real `<button>`, which is why `ImpactBoard`'s row had to stop being one: a `<button>`
 * inside a `<button>` is invalid HTML and browsers reparent it, leaving a control that renders and
 * does nothing. The row's own control and its Tags are siblings now.
 *
 * `testId` exists so the board keeps its `board-chip` id and the ranked table keeps `ranked-chip`;
 * CONTEXT.md keeps `chip` as the code and test-id name while the prose word is Tag.
 */

import { type Scalar, tagToken } from '@/graph';
import type { TagsModel } from '@/state';
import { clearHighlight, setHighlight } from './highlight';

const NO_MEMBERS: ReadonlySet<string> = new Set();

export interface TagProps {
  /** Everything a Tag needs to answer for itself: the index, the qualifying set, the grouping. */
  readonly tags: TagsModel;
  /** The Attribute the Tag names: `repository`, `team`, `kind`, or an `attributes` key. */
  readonly attribute: string;
  /** The Attribute value this Tag names; with `attribute` it identifies the Group. */
  readonly value: Scalar;
  /** What the Tag renders: `Team: platform`, `External · database`. */
  readonly text: string;
  /** Choosing the Tag; absent on a surface that cannot change the grouping. */
  readonly onChoose?: (attribute: string) => void;
  readonly testId?: string;
  /** The chip's visual kind, when it differs from the Attribute: an External's is `external`. */
  readonly chip?: string;
}

/**
 * What a screen reader is given. It says what the control DOES, not just the value it shows — a bare
 * "platform" would be indistinguishable from the label beside it. A Highlight itself is decorative
 * emphasis and is announced by nothing; `aria-pressed` is what marks the current grouping Tag.
 */
export function tagLabel(text: string, attribute: string, groupable: boolean): string {
  return groupable
    ? `${text} — Highlight this Group, or group the Catalog by ${attribute}`
    : `${text} — Highlight this Group; ${attribute} has too many values to group by`;
}

export function Tag({
  tags,
  attribute,
  value,
  text,
  onChoose,
  testId = 'tag',
  chip = attribute,
}: TagProps) {
  const token = tagToken(attribute, value);
  const members = tags.index.members.get(token) ?? NO_MEMBERS;
  const groupable = tags.groupable.has(attribute);
  const grouping = tags.grouping === attribute;

  const point = () => setHighlight({ token, members });
  const choose = () => {
    if (groupable) {
      onChoose?.(attribute);
    }
  };

  return (
    <button
      type="button"
      class="tag"
      data-testid={testId}
      data-chip={chip}
      data-tag={attribute}
      data-tag-token={token}
      data-groupable={groupable ? 'true' : 'false'}
      // A disqualified Attribute still Highlights, so the control stays focusable and hoverable and
      // only its choosing is inert (docs/tags.md, N7). `aria-disabled` rather than `disabled` is
      // what keeps it in the tab order to do the half of its job that still works.
      aria-disabled={groupable ? undefined : 'true'}
      aria-pressed={groupable ? grouping : undefined}
      aria-label={tagLabel(text, attribute, groupable)}
      onMouseEnter={point}
      onFocus={point}
      onMouseLeave={clearHighlight}
      onBlur={clearHighlight}
      onClick={choose}
    >
      {text}
    </button>
  );
}
