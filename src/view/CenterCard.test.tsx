import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { tagToken } from '@/graph';
import { EXTERNAL_NEEDS_NOTE } from '@/state';
import { boardMarkdown, breaksBadge, CenterCard, centerTags, kindText } from '@/view';
import { boardOf, tagsOf } from './fixtures.test-helper';

/**
 * The middle card over the demo Catalog's real view models (docs/center.md, decisions 1 and 5):
 * what an Application shows, what an External shows instead, the badge, and the Markdown.
 */

const ORDER_SERVICE = { kind: 'application', id: 'acme/commerce/order-service' } as const;
const REDIS = { kind: 'external', id: 'redis' } as const;

describe('CenterCard', () => {
  it('shows an Application id, kind, Team, url, attributes, badge and Flows', () => {
    const model = boardOf(ORDER_SERVICE);
    render(<CenterCard model={model} />);

    expect(screen.getByTestId('center-id').textContent).toBe('acme/commerce/order-service');
    expect(screen.getByTestId('center-kind').textContent).toBe('Application · service');
    expect(screen.getByTestId('center-team').textContent).toBe('Team commerce');
    // order-service declares no description in the demo Catalog, so the line is absent, not empty.
    expect(screen.queryByTestId('center-description')).toBeNull();
    expect(screen.getByTestId('center-url').getAttribute('href')).toBe(
      'https://github.com/acme/commerce/tree/main/order-service',
    );
    const attributes = screen
      .getAllByTestId('center-attribute')
      .map((entry) => `${entry.dataset.key}=${entry.querySelector('dd')?.textContent}`);
    expect(attributes).toContain('language=java');
    expect(attributes).toContain('tier=1');
    expect(screen.getByTestId('center-badge').textContent).toBe('6 break across 4 Teams');
    expect(screen.getByTestId('center-publishes').textContent).toBe('Publishes: orders.placed');
    expect(screen.getByTestId('center-subscribes').textContent).toBe(
      'Subscribes: payments.captured',
    );
  });

  it('shows the description of a record that declares one', () => {
    render(
      <CenterCard model={boardOf({ kind: 'application', id: 'acme/platform-core/api-gateway' })} />,
    );

    expect(screen.getByTestId('center-description').textContent).toBe(
      'Public edge. Terminates TLS, authenticates, routes to internal services.',
    );
  });

  it('shows an External id, kind, name and badge, and no Flows (decision 5)', () => {
    render(<CenterCard model={boardOf(REDIS)} />);

    expect(screen.getByTestId('center-id').textContent).toBe('redis');
    expect(screen.getByTestId('center-kind').textContent).toBe('External · cache');
    expect(screen.getByTestId('center-name').textContent).toBe('Redis (shared cluster)');
    expect(screen.getByTestId('center-badge').textContent).toBe('20 break across 8 Teams');
    // An External has no Flows and no Team, so neither section is rendered empty.
    expect(screen.queryByTestId('center-flows')).toBeNull();
    expect(screen.queryByTestId('center-team')).toBeNull();
  });

  it('names the kind of a record that declares none', () => {
    expect(
      kindText({
        kind: 'external',
        id: 'x',
        label: 'x',
        attributes: {},
        publishes: [],
        subscribes: [],
      }),
    ).toBe('External');
  });

  it('pluralizes the badge for a single Team', () => {
    expect(breaksBadge(1, 1)).toBe('1 break across 1 Team');
    expect(breaksBadge(12, 7)).toBe('12 break across 7 Teams');
  });

  it('copies the board as Markdown: a heading and per-Depth lists for both columns', () => {
    const model = boardOf(ORDER_SERVICE);
    const markdown = boardMarkdown(model);
    const lines = markdown.split('\n');

    expect(lines[0]).toBe('# acme/commerce/order-service');
    expect(lines[2]).toBe('Application · service — Team commerce');
    expect(markdown).toContain('6 break across 4 Teams');
    expect(markdown).toContain('- Publishes: orders.placed');
    expect(markdown).toContain('- language: java');

    // Both columns, each with one section per Depth band and one line per row.
    const needs = markdown.slice(markdown.indexOf('## Needs'), markdown.indexOf('## Breaks'));
    const breaks = markdown.slice(markdown.indexOf('## Breaks'));
    expect(needs).toContain('### Depth 1');
    expect(needs).toContain('### Depth 2');
    expect(breaks).toContain('### Depth 1');
    expect(breaks).toContain('### Depth 2');
    expect(needs.match(/^- /gm) ?? []).toHaveLength(15);
    expect(breaks.match(/^- /gm) ?? []).toHaveLength(6);
    expect(breaks).toContain('- `acme/platform-core/api-gateway` — acme/platform-core · platform');
  });

  it('puts the External note in the Markdown where the Needs bands would be', () => {
    const markdown = boardMarkdown(boardOf(REDIS));

    const needs = markdown.slice(markdown.indexOf('## Needs'), markdown.indexOf('## Breaks'));
    expect(needs).toContain(EXTERNAL_NEEDS_NOTE);
    expect(needs).not.toContain('### Depth 1');
    // An External's rows in the Breaks column still carry their chips.
    expect(markdown).toContain('## Breaks');
  });

  it('reports the copy through the button, and says so when the clipboard refuses', async () => {
    const model = boardOf(ORDER_SERVICE);
    const copy = vi.fn();
    const { rerender } = render(<CenterCard model={model} copy={copy} />);

    fireEvent.click(screen.getByTestId('center-copy'));
    expect(copy).toHaveBeenCalledWith(boardMarkdown(model));
    await waitFor(() => expect(screen.getByTestId('center-copy').textContent).toBe('Copied'));

    rerender(
      <CenterCard
        model={model}
        copy={() => Promise.reject(new Error('no clipboard permission'))}
      />,
    );
    fireEvent.click(screen.getByTestId('center-copy'));
    await waitFor(() => expect(screen.getByTestId('center-copy').textContent).toBe('Copy failed'));
  });

  it('offers the clear button only when the shell wires one', () => {
    const model = boardOf(REDIS);
    const onClear = vi.fn();
    const { rerender } = render(<CenterCard model={model} />);
    expect(screen.queryByTestId('center-clear')).toBeNull();

    rerender(<CenterCard model={model} onClear={onClear} />);
    fireEvent.click(screen.getByTestId('center-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

/**
 * The Center card carries the richest Tag set of any surface: Repository, Team, kind and every
 * scalar Attribute (docs/tags.md, "The Tags a node carries").
 */
describe('Tags on the Center card', () => {
  const tags = tagsOf();

  it('renders one Tag per Attribute value the record carries', () => {
    render(<CenterCard model={boardOf(ORDER_SERVICE)} tags={tags} />);

    const rendered = screen.getByTestId('center-tags').querySelectorAll('[data-testid="tag"]');
    const attributes = [...rendered].map((tag) => (tag as HTMLElement).dataset.tag);
    expect(attributes.slice(0, 3)).toEqual(['repository', 'team', 'kind']);
    expect(attributes).toContain('language');
    // A non-scalar Attribute names no Group, so it is not a Tag.
    expect(attributes).not.toContain('links');
    expect(attributes).not.toContain('tags');
  });

  it('marks the current grouping Attribute, and only it, with aria-pressed', () => {
    render(<CenterCard model={boardOf(ORDER_SERVICE)} tags={tags} />);

    const pressed = [
      ...screen.getByTestId('center-tags').querySelectorAll('[aria-pressed="true"]'),
    ];
    expect(pressed).toHaveLength(1);
    expect((pressed[0] as HTMLElement).dataset.tag).toBe('repository');
  });

  it('carries its own Tag tokens, so the Center card Highlights with its Group', () => {
    render(<CenterCard model={boardOf(ORDER_SERVICE)} tags={tags} />);
    const groups = screen.getByTestId('center-panel').dataset.groups?.split(' ') ?? [];
    expect(groups).toContain(tagToken('team', 'commerce'));
  });

  it('gives an External its kind and its own scalar Attributes, and no Team', () => {
    render(<CenterCard model={boardOf(REDIS)} tags={tags} />);
    const attributes = [
      ...screen.getByTestId('center-tags').querySelectorAll('[data-testid="tag"]'),
    ].map((tag) => (tag as HTMLElement).dataset.tag);
    expect(attributes).toContain('kind');
    expect(attributes).not.toContain('team');
    expect(attributes).not.toContain('repository');
  });

  it('shows no Tag strip at all when the shell supplies none', () => {
    render(<CenterCard model={boardOf(ORDER_SERVICE)} />);
    expect(screen.queryByTestId('center-tags')).toBeNull();
    // And the lines other slices assert are untouched either way.
    expect(screen.getByTestId('center-team').textContent).toBe('Team commerce');
  });

  it('lists the same Tags `centerTags` computes, kind text included', () => {
    const card = boardOf(ORDER_SERVICE).center;
    const listed = centerTags(card);
    expect(listed[0]).toEqual({
      attribute: 'repository',
      value: 'acme/commerce',
      text: 'acme/commerce',
    });
    expect(listed[1]).toEqual({ attribute: 'team', value: 'commerce', text: 'Team: commerce' });
    expect(listed[2]).toEqual({
      attribute: 'kind',
      value: 'service',
      text: 'Application · service',
    });
  });
});

/**
 * Item N6 of docs/retrospective-2026-09-03.md on the card. Every other fixture in this repo has ids
 * that read as names, so this uses the AT&T-style shape the item was raised for: an APM id with a
 * real name beside it.
 */
describe('the card leads with the name and keeps the id', () => {
  const apm = {
    kind: 'application' as const,
    id: 'ATT-IDP4/customer-profile/apm10099',
    label: 'Contact Preference Service',
    repository: 'ATT-IDP4/customer-profile',
    recordKind: 'service',
    name: 'Contact Preference Service',
    attributes: {},
    publishes: [],
    subscribes: [],
  };
  const model = (center: typeof apm) => ({
    center,
    depth: 2,
    needs: { bands: [], note: null },
    breaks: { bands: [], total: 0, teams: 0 },
  });

  it('renders the name as the heading, not the APM id', () => {
    render(<CenterCard model={model(apm)} />);

    const heading = screen.getByTestId('center-name');
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toBe('Contact Preference Service');
  });

  it('keeps the full id, secondary and never hidden', () => {
    render(<CenterCard model={model(apm)} />);

    const id = screen.getByTestId('center-id');
    expect(id.textContent).toBe('ATT-IDP4/customer-profile/apm10099');
    // Beneath the heading, not the heading itself: that is what "secondary" means here.
    expect(id.tagName).not.toBe('H2');
  });

  it('does not repeat itself when the label already is the id', () => {
    const model = boardOf(ORDER_SERVICE);
    render(<CenterCard model={model} />);

    // order-service names itself, so there is one line, and it is the one carrying the id.
    expect(screen.getByTestId('center-id').textContent).toBe('acme/commerce/order-service');
    expect(screen.getByTestId('center-id').tagName).toBe('H2');
    expect(screen.queryByTestId('center-name')).toBeNull();
  });

  it('carries the name into the Markdown export, which also used to lose it', () => {
    const markdown = boardMarkdown(model(apm));
    expect(markdown).toContain('Contact Preference Service');
    expect(markdown.split('\n')[0]).toBe('# ATT-IDP4/customer-profile/apm10099');
  });
});
