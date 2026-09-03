import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tagToken } from '@/graph';
import { currentHighlight, Tag, tagLabel } from '@/view';
import { demoStore, tagsOf } from './fixtures.test-helper';
import { resetHighlight } from './highlight';

/**
 * The Tag control over the demo Catalog's real `TagsModel` (docs/tags.md). `team` qualifies as a
 * grouping there — 30 Applications over 9 values — and `sla` does not: 3 Applications with 3 values
 * between them, which is the disqualifying shape item N7 is about. Both are read off the fixture by
 * `src/graph/grouping.test.ts`, so neither number is invented here.
 */

const tags = tagsOf();

afterEach(() => {
  resetHighlight();
});

function renderTag(props: Partial<Parameters<typeof Tag>[0]> = {}) {
  return render(
    <Tag tags={tags} attribute="team" value="platform" text="Team: platform" {...props} />,
  );
}

describe('pointing at a Tag', () => {
  it('Highlights its Group on hover, with the members the Catalog actually has', () => {
    renderTag();
    fireEvent.mouseEnter(screen.getByTestId('tag'));

    const highlight = currentHighlight();
    expect(highlight?.token).toBe(tagToken('team', 'platform'));
    // The demo Catalog's `platform` Team. A Highlight of zero members would satisfy a test that only
    // checked the token, so the size is pinned: this is the assertion that says it found the Group.
    expect(highlight?.members.size).toBe(9);
  });

  it('Highlights on keyboard focus too, because hover does not exist for a keyboard', () => {
    renderTag();
    fireEvent.focus(screen.getByTestId('tag'));
    expect(currentHighlight()?.members.size).toBe(9);
  });

  it('clears when the pointer leaves and when focus leaves', () => {
    renderTag();
    const tag = screen.getByTestId('tag');

    fireEvent.mouseEnter(tag);
    fireEvent.mouseLeave(tag);
    expect(currentHighlight()).toBeNull();

    fireEvent.focus(tag);
    fireEvent.blur(tag);
    expect(currentHighlight()).toBeNull();
  });

  it('chooses nothing by pointing: a Highlight is emphasis, not an action', () => {
    const onChoose = vi.fn();
    renderTag({ onChoose });
    fireEvent.mouseEnter(screen.getByTestId('tag'));
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('choosing a Tag', () => {
  it('sets the grouping Attribute', () => {
    const onChoose = vi.fn();
    renderTag({ onChoose });
    fireEvent.click(screen.getByTestId('tag'));
    expect(onChoose).toHaveBeenCalledWith('team');
  });

  it('is reachable from the keyboard, as a real button is', () => {
    const onChoose = vi.fn();
    renderTag({ onChoose });
    const tag = screen.getByTestId('tag');
    expect(tag.tagName).toBe('BUTTON');
    expect(tag.getAttribute('type')).toBe('button');
    // A `<button>` is what turns Enter and Space into a click; asserting the element is asserting
    // the keyboard path, which jsdom does not itself synthesise.
    expect(tag.hasAttribute('disabled')).toBe(false);
  });
});

describe('an Attribute the cardinality rule disqualifies (item N7)', () => {
  it('still Highlights, and still says so', () => {
    renderTag({ attribute: 'sla', value: '99.9%', text: 'sla: 99.9%' });
    const tag = screen.getByTestId('tag');
    expect(tag.dataset.groupable).toBe('false');

    fireEvent.mouseEnter(tag);
    expect(currentHighlight()?.token).toBe(tagToken('sla', '99.9%'));
    // Exactly one Application carries this value — the Group of one that item N7 is about. It is
    // still a real Group and still Highlights; it just cannot become the grouping Attribute.
    expect(currentHighlight()?.members.size).toBe(1);
  });

  it('cannot become the grouping Attribute', () => {
    const onChoose = vi.fn();
    renderTag({ attribute: 'sla', value: '99.9%', text: 'sla: 99.9%', onChoose });
    fireEvent.click(screen.getByTestId('tag'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('is marked disabled to assistive technology but stays in the tab order', () => {
    renderTag({ attribute: 'sla', value: '99.9%', text: 'sla: 99.9%' });
    const tag = screen.getByTestId('tag');
    expect(tag.getAttribute('aria-disabled')).toBe('true');
    expect(tag.hasAttribute('disabled')).toBe(false);
    // It is not a toggle, so it carries no pressed state to mislead a screen reader.
    expect(tag.hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('what a screen reader is given', () => {
  it('marks the current grouping Tag with aria-pressed, and only that one', () => {
    // The demo Catalog opens grouped by Repository (docs/url-state.md).
    expect(tags.grouping).toBe('repository');

    renderTag({ attribute: 'repository', value: 'acme/commerce', text: 'acme/commerce' });
    expect(screen.getByTestId('tag').getAttribute('aria-pressed')).toBe('true');

    screen.getByTestId('tag').remove();
    renderTag();
    expect(screen.getByTestId('tag').getAttribute('aria-pressed')).toBe('false');
  });

  it('names what the control does, not just the value it shows', () => {
    renderTag();
    const label = screen.getByTestId('tag').getAttribute('aria-label') ?? '';
    expect(label).toContain('Highlight this Group');
    expect(label).toContain('group the Catalog by team');
    // The bare value would be indistinguishable from the label beside it.
    expect(label).not.toBe('Team: platform');
  });

  it('says a disqualified Tag only Highlights', () => {
    expect(tagLabel('sla: 99.9%', 'sla', false)).toBe(
      'sla: 99.9% — Highlight this Group; sla has too many values to group by',
    );
  });
});

/**
 * The three "never" clauses of CONTEXT.md's **Highlight**, asserted against a real store rather
 * than a stub — a Highlight that changed the Center would change it HERE, and nothing in the view
 * could hide that.
 */
describe('a Highlight changes nothing it is not allowed to change', () => {
  it('leaves the Center exactly where it was', () => {
    const store = demoStore();
    store.actions.select({ kind: 'application', id: 'acme/commerce/order-service' });
    // The Center is really set, so "unchanged" is a claim about something rather than about null.
    expect(store.center.value?.id).toBe('acme/commerce/order-service');

    render(
      <Tag
        tags={store.derived.tags.value}
        attribute="team"
        value="platform"
        text="Team: platform"
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('tag'));

    expect(currentHighlight()?.members.size).toBe(9);
    expect(store.center.value?.id).toBe('acme/commerce/order-service');
    expect(store.derived.board.value?.center.id).toBe('acme/commerce/order-service');
  });

  it('removes no row and reranks nothing', () => {
    const store = demoStore();
    const before = store.derived.ranked.value.rows;
    expect(before.length).toBeGreaterThan(9);

    render(
      <Tag
        tags={store.derived.tags.value}
        attribute="team"
        value="platform"
        text="Team: platform"
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('tag'));

    const after = store.derived.ranked.value.rows;
    expect(after).toHaveLength(before.length);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it('leaves the grouping Attribute alone until a Tag is actually chosen', () => {
    const store = demoStore();
    render(
      <Tag
        tags={store.derived.tags.value}
        attribute="team"
        value="platform"
        text="Team: platform"
        onChoose={store.actions.setGroupBy}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('tag'));
    expect(store.groupBy.value).toBe('repository');

    fireEvent.click(screen.getByTestId('tag'));
    expect(store.groupBy.value).toBe('team');
    expect(store.derived.overviewModel.value.attribute).toBe('team');
    // Choosing changes how the Catalog is grouped, never what the board reads.
    expect(store.center.value).toBeNull();
  });
});
