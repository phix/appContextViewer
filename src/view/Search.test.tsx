import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { buildSearchIndex, type SearchIndex } from '@/graph';
import { SEARCH_MEASURE, Search } from '@/view';
import { demoStore } from './fixtures.test-helper';

/**
 * Search over the demo Catalog's own index (docs/center.md, decisions 3 and 8): typed results,
 * keyboard handling, what each kind does when chosen, and budget 7's per-keystroke measure.
 */

const index: SearchIndex = buildSearchIndex(demoStore().graph.value);

function noop() {
  /* the test does not care */
}

function renderSearch(props: Partial<Parameters<typeof Search>[0]> = {}) {
  return render(<Search index={index} onSelect={noop} onOpenChannel={noop} {...props} />);
}

function type(text: string): HTMLInputElement {
  const input = screen.getByTestId('search-input') as HTMLInputElement;
  fireEvent.input(input, { target: { value: text } });
  return input;
}

function resultIds(): string[] {
  return screen.getAllByTestId('search-result').map((row) => row.dataset.id ?? '');
}

describe('Search', () => {
  it('shows nothing until something is typed, and nothing for a query that matches nothing', () => {
    renderSearch();
    expect(screen.queryByTestId('search-results')).toBeNull();

    type('zzz-nothing-matches-this');
    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('types every result with its kind chip (Application, External, Channel)', () => {
    renderSearch();
    type('order');

    const chips = new Set(screen.getAllByTestId('search-chip').map((chip) => chip.textContent));
    expect(chips.has('Application')).toBe(true);
    expect(chips.has('Channel')).toBe(true);

    type('redis');
    expect(resultIds()).toContain('redis');
    const redis = screen.getAllByTestId('search-result').find((row) => row.dataset.id === 'redis');
    expect(redis?.querySelector('[data-testid="search-chip"]')?.textContent).toBe('External');
  });

  it('selects an Application when its result is chosen', () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    type('order-service');

    const row = screen
      .getAllByTestId('search-result')
      .find((candidate) => candidate.dataset.id === 'acme/commerce/order-service');
    fireEvent.click(row?.querySelector('[data-testid="search-choose"]') as Element);

    expect(onSelect).toHaveBeenCalledWith({
      kind: 'application',
      id: 'acme/commerce/order-service',
    });
    // Choosing clears the box, so the dropdown is not left over the board.
    expect((screen.getByTestId('search-input') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('selects an External when its result is chosen (docs/center.md, decision 3)', () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    type('redis');

    const row = screen.getAllByTestId('search-result').find((r) => r.dataset.id === 'redis');
    fireEvent.click(row?.querySelector('[data-testid="search-choose"]') as Element);

    expect(onSelect).toHaveBeenCalledWith({ kind: 'external', id: 'redis' });
  });

  it('opens the Channel card when a Channel is chosen, selecting nothing (decision 8)', () => {
    const onSelect = vi.fn();
    const onOpenChannel = vi.fn();
    renderSearch({ onSelect, onOpenChannel });
    type('orders.');

    const row = screen
      .getAllByTestId('search-result')
      .find((r) => r.dataset.id === 'orders.placed');
    expect(row?.querySelector('[data-testid="search-chip"]')?.textContent).toBe('Channel');
    fireEvent.click(row?.querySelector('[data-testid="search-choose"]') as Element);

    expect(onOpenChannel).toHaveBeenCalledWith('orders.placed');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves the active result with the arrow keys and chooses it with Enter', () => {
    const onOpenChannel = vi.fn();
    const onSelect = vi.fn();
    renderSearch({ onSelect, onOpenChannel });
    const input = type('orders.');

    const ids = resultIds();
    expect(ids.length).toBeGreaterThan(1);
    // The first result is active until an arrow key moves it.
    expect(screen.getAllByTestId('search-result')[0].dataset.active).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByTestId('search-result')[1].dataset.active).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByTestId('search-result')[0].dataset.active).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Every "orders." hit is a Channel, so Enter on the second one opens that card.
    expect(onOpenChannel).toHaveBeenCalledWith(ids[1]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('wraps the active result at both ends', () => {
    renderSearch();
    const input = type('orders.');
    const last = resultIds().length - 1;

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByTestId('search-result')[last].dataset.active).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByTestId('search-result')[0].dataset.active).toBe('true');
  });

  it('closes the dropdown on Escape and reopens it on the next keystroke', () => {
    renderSearch();
    const input = type('redis');
    expect(screen.getByTestId('search-results')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('search-results')).toBeNull();

    type('redi');
    expect(screen.getByTestId('search-results')).toBeTruthy();
  });

  it('caps the dropdown at its limit', () => {
    renderSearch({ limit: 3 });
    type('acme');
    expect(resultIds()).toHaveLength(3);
  });

  it('measures every keystroke to its results (budget 7)', () => {
    performance.clearMarks();
    performance.clearMeasures();
    renderSearch();

    type('r');
    type('re');
    type('red');

    const measures = performance.getEntriesByName(SEARCH_MEASURE);
    expect(measures).toHaveLength(3);
    expect(measures.every((measure) => measure.duration >= 0)).toBe(true);
  });
});
