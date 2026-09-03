// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { tagToken } from '@/graph';
import {
  clearHighlight,
  currentHighlight,
  highlightRules,
  onHighlight,
  setHighlight,
} from '@/view';
import { resetHighlight } from './highlight';

/**
 * The Highlight mechanism (docs/tags.md, constraint 1). The test that matters here is the mutation
 * count: budget 8 is held because a Highlight costs ONE DOM write whatever the row count, and the
 * only way to assert that property rather than to time the current code is to count DOM mutations
 * at two very different row counts and require the SAME number. A per-row implementation — setting
 * an attribute or a class on each member — makes the 1,000-row count exceed the 10-row count and
 * turns this red, which a timing assertion on a fast machine would not.
 */

const TEAM = 'Billing Platform';
const TOKEN = tagToken('team', TEAM);
const OTHER = tagToken('team', 'Payments');

afterEach(() => {
  resetHighlight();
  document.body.innerHTML = '';
});

/** `rowCount` rows carrying the token, then one Highlight; the DOM mutations it cost. */
function mutationsForHighlight(rowCount: number): number {
  document.body.innerHTML = '';
  const members = new Set<string>();
  for (let index = 0; index < rowCount; index++) {
    const row = document.createElement('div');
    row.dataset.groups = `${TOKEN} ${tagToken('repository', `repo-${index}`)}`;
    row.dataset.id = `app-${index}`;
    members.add(`app-${index}`);
    document.body.append(row);
  }

  // Warm-up: the very first Highlight also appends the <style> element, which is a one-off cost and
  // not part of what scales. Counting from the second one keeps the two row counts comparable.
  setHighlight({ token: OTHER, members: new Set() });
  clearHighlight();

  const observer = new MutationObserver(() => {
    /* records are drained synchronously below */
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  setHighlight({ token: TOKEN, members });
  // Synchronous drain: MutationObserver callbacks are microtasks, and this test must not depend on
  // when they run.
  const records = observer.takeRecords().length;
  observer.disconnect();
  return records;
}

describe('the Highlight costs one DOM write, independent of the row count', () => {
  it('mutates the DOM exactly as much for 1,000 rows as for 10', () => {
    const small = mutationsForHighlight(10);
    const large = mutationsForHighlight(1000);

    expect(large).toBe(small);
    // And it is one write, not "the same large number twice".
    expect(small).toBe(1);
  });

  it('leaves every row in the DOM: a Highlight de-emphasises, it never filters', () => {
    mutationsForHighlight(50);
    expect(document.body.querySelectorAll('[data-groups]')).toHaveLength(50);
  });
});

describe('the injected rule selects exactly the Group', () => {
  /**
   * `matches()` rather than string comparison, so this asserts what a browser would actually select.
   * The value here contains a space, which is the case that forced `tagToken` to percent-encode:
   * `[data-groups~=...]` matches whitespace-separated words, so an unencoded `Billing Platform`
   * would be two words and would match any row whose Team is `Billing` or `Platform`.
   */
  const member = () => {
    const row = document.createElement('div');
    row.dataset.groups = `${TOKEN} kind=service`;
    return row;
  };

  it('matches a member and not a row of a different Group', () => {
    const inGroup = member();
    const outOfGroup = document.createElement('div');
    outOfGroup.dataset.groups = `${OTHER} kind=service`;

    const selector = `[data-groups~="${TOKEN}"]`;
    expect(inGroup.matches(selector)).toBe(true);
    expect(outOfGroup.matches(selector)).toBe(false);
  });

  it('does not match a row that merely contains a word of the value', () => {
    const decoy = document.createElement('div');
    decoy.dataset.groups = 'team=Billing team=Platform';
    expect(decoy.matches(`[data-groups~="${TOKEN}"]`)).toBe(false);
  });

  it('writes both rules: the members and the de-emphasised rest', () => {
    const rules = highlightRules(TOKEN);
    expect(rules).toContain(`[data-groups~="${TOKEN}"]`);
    expect(rules).toContain(`[data-groups]:not([data-groups~="${TOKEN}"])`);
  });
});

describe('clearing', () => {
  const setUp = () => setHighlight({ token: TOKEN, members: new Set(['a']) });
  const injected = () => document.getElementById('acv-highlight')?.textContent ?? '';

  it('empties the injected rule when the pointer or focus leaves', () => {
    setUp();
    expect(injected()).not.toBe('');
    clearHighlight();
    expect(injected()).toBe('');
    expect(currentHighlight()).toBeNull();
  });

  it('clears on Escape', () => {
    setUp();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(currentHighlight()).toBeNull();
    expect(injected()).toBe('');
  });

  it('ignores a key that is not Escape', () => {
    setUp();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(currentHighlight()?.token).toBe(TOKEN);
  });

  it('stops listening for Escape once cleared, so nothing leaks between Highlights', () => {
    setUp();
    clearHighlight();
    const seen: (string | null)[] = [];
    onHighlight((highlight) => seen.push(highlight?.token ?? null));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(seen).toEqual([]);
  });
});

describe('subscribers, which is how the canvas takes part', () => {
  it('reports the Highlight and its members, then the clear', () => {
    const seen: (number | null)[] = [];
    onHighlight((highlight) => seen.push(highlight === null ? null : highlight.members.size));

    setHighlight({ token: TOKEN, members: new Set(['a', 'b', 'c']) });
    clearHighlight();

    expect(seen).toEqual([3, null]);
  });

  it('writes nothing at all when the Tag already highlighted is pointed at again', () => {
    const seen: string[] = [];
    setHighlight({ token: TOKEN, members: new Set(['a']) });
    onHighlight((highlight) => seen.push(highlight?.token ?? 'cleared'));

    setHighlight({ token: TOKEN, members: new Set(['a']) });

    expect(seen).toEqual([]);
  });
});
