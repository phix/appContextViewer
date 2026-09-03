import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { tagToken } from '@/graph';
import { EXTERNAL_NEEDS_NOTE } from '@/state';
import {
  DEPTH_MEASURE,
  ImpactBoard,
  markDepthStart,
  markSelectStart,
  SELECT_MEASURE,
} from '@/view';
import { boardOf, tagsOf } from './fixtures.test-helper';

/**
 * The board over the demo Catalog's real view models (docs/center.md): three columns, both outer
 * ones banded by Depth, chips and rows selecting, and the External Center's single Needs line that
 * keeps the column's place.
 */

function noop() {
  /* the test does not care */
}

function renderBoard(props: Partial<Parameters<typeof ImpactBoard>[0]>) {
  const model = props.model ?? boardOf({ kind: 'application', id: 'acme/commerce/order-service' });
  return render(<ImpactBoard onSelect={noop} {...props} model={model} />);
}

/** The band structure of one column, as "depth:rows" pairs. */
function bandsOf(column: 'Needs' | 'Breaks'): string[] {
  return screen
    .getAllByTestId('board-band')
    .filter((band) => band.dataset.column === column)
    .map((band) => `${band.dataset.depth}:${band.querySelectorAll('li').length}`);
}

function rowsOf(column: 'Needs' | 'Breaks'): HTMLElement[] {
  return screen.getAllByTestId('board-row').filter((row) => row.dataset.column === column);
}

/** Two frames: the board stamps its paint on the second one. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe('ImpactBoard', () => {
  it('bands Needs and Breaks by Depth for an Application Center', () => {
    renderBoard({ model: boardOf({ kind: 'application', id: 'acme/commerce/order-service' }) });

    // The demo Catalog at the default Depth 2: what order-service needs, and what breaks with it.
    expect(bandsOf('Needs')).toEqual(['1:7', '2:8']);
    expect(bandsOf('Breaks')).toEqual(['1:2', '2:4']);
    expect(screen.getByTestId('board-breaks-count').textContent).toBe('6');
  });

  it('lays the three columns out in order, Needs then the Center then Breaks', () => {
    renderBoard({});

    const board = screen.getByTestId('impact-board');
    expect([...board.children].map((child) => (child as HTMLElement).dataset.testid)).toEqual([
      'board-needs',
      'center-panel',
      'board-breaks',
    ]);
  });

  it('gives an Application row its Repository and Team chips', () => {
    renderBoard({});

    const row = rowsOf('Breaks').find(
      (candidate) =>
        candidate.querySelector('[data-testid="board-link"]')?.getAttribute('data-id') ===
        'acme/platform-core/api-gateway',
    );
    expect(row).toBeTruthy();
    const chips = [...(row?.querySelectorAll('[data-testid="board-chip"]') ?? [])].map(
      (chip) => `${(chip as HTMLElement).dataset.chip}=${chip.textContent}`,
    );
    expect(chips).toEqual(['repository=acme/platform-core', 'team=platform']);
  });

  it('gives an External in the Needs column its kind chip (docs/center.md, decision 3)', () => {
    renderBoard({});

    const externals = rowsOf('Needs').filter((row) => row.dataset.kind === 'external');
    expect(externals.length).toBeGreaterThan(0);
    const chips = externals.map(
      (row) => row.querySelector('[data-testid="board-chip"]')?.textContent,
    );
    expect(chips).toContain('External · database');
  });

  it('selects the node when the row is clicked', () => {
    const onSelect = vi.fn();
    renderBoard({ onSelect });

    const link = screen
      .getAllByTestId('board-link')
      .find((candidate) => candidate.dataset.id === 'acme/platform-core/api-gateway');
    fireEvent.click(link as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith({
      kind: 'application',
      id: 'acme/platform-core/api-gateway',
    });
  });

  /**
   * The behaviour the row restructure moved, pinned in its new place rather than deleted. A chip is
   * a Tag now (docs/tags.md): pointing at it Highlights its Group and choosing it sets the grouping
   * Attribute, and NEITHER changes the Center. The purpose of docs/center.md decision 3 — that an
   * External in the Needs column is reachable — is kept by the row's own control, asserted below.
   */
  it('chooses the grouping Attribute from a Tag, and leaves the Center alone', () => {
    const onSelect = vi.fn();
    const onChooseTag = vi.fn();
    renderBoard({ onSelect, onChooseTag, tags: tagsOf() });

    const row = rowsOf('Needs').find((candidate) => candidate.dataset.kind === 'external');
    const chip = row?.querySelector('[data-testid="board-chip"]');
    expect(chip?.tagName).toBe('BUTTON');
    fireEvent.click(chip as Element);

    expect(onChooseTag).toHaveBeenCalledWith('kind');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still selects that same External from the row control beside its Tag', () => {
    const onSelect = vi.fn();
    renderBoard({ onSelect, tags: tagsOf() });

    const row = rowsOf('Needs').find((candidate) => candidate.dataset.kind === 'external');
    const link = row?.querySelector('[data-testid="board-link"]');
    const id = link?.getAttribute('data-id');
    expect(id).toBeTruthy();
    fireEvent.click(link as Element);

    expect(onSelect).toHaveBeenCalledWith({ kind: 'external', id });
  });

  it('never nests a button inside a button, which is what forbade a Tag before', () => {
    renderBoard({ tags: tagsOf() });

    // The invalid markup jsdom would silently accept and a browser would reparent.
    expect(document.querySelectorAll('button button')).toHaveLength(0);
    const row = rowsOf('Needs')[0];
    expect(row?.querySelectorAll('button').length).toBeGreaterThan(1);
  });

  it('carries every Tag token of its node in one `data-groups` attribute', () => {
    renderBoard({ tags: tagsOf() });

    const row = rowsOf('Breaks').find(
      (candidate) =>
        candidate.querySelector('[data-testid="board-link"]')?.getAttribute('data-id') ===
        'acme/platform-core/api-gateway',
    );
    const groups = (row?.dataset.groups ?? '').split(' ');
    expect(groups).toContain(tagToken('repository', 'acme/platform-core'));
    expect(groups).toContain(tagToken('team', 'platform'));
    // One attribute, whatever the row count: this is what one injected CSS rule matches.
    expect(row?.getAttributeNames().filter((name) => name.startsWith('data-groups'))).toEqual([
      'data-groups',
    ]);
  });

  it('holds one line in the Needs column for an External Center, without moving the columns', () => {
    renderBoard({ model: boardOf({ kind: 'external', id: 'redis' }) });

    const board = screen.getByTestId('impact-board');
    // Decision 5: the Needs column keeps its place, so the layout never shifts.
    expect([...board.children].map((child) => (child as HTMLElement).dataset.testid)).toEqual([
      'board-needs',
      'center-panel',
      'board-breaks',
    ]);
    expect(screen.getByTestId('board-note').textContent).toBe(EXTERNAL_NEEDS_NOTE);
    expect(bandsOf('Needs')).toEqual([]);
    // The Breaks column is banded by Depth as usual: redis has 10 direct Dependents in the demo.
    expect(bandsOf('Breaks')).toEqual(['1:10', '2:10']);
  });

  it('measures a selection to the board painted (budget 5)', async () => {
    performance.clearMarks();
    performance.clearMeasures();

    markSelectStart();
    renderBoard({});
    await afterPaint();

    expect(performance.getEntriesByName(SELECT_MEASURE)).toHaveLength(1);
    expect(performance.getEntriesByName(SELECT_MEASURE)[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('measures a Depth change to the board repainted (budget 6)', async () => {
    performance.clearMarks();
    performance.clearMeasures();

    const { rerender } = renderBoard({});
    await afterPaint();
    // Only the interaction starts a stopwatch, so the first paint measures nothing.
    expect(performance.getEntriesByName(DEPTH_MEASURE)).toHaveLength(0);

    markDepthStart();
    rerender(
      <ImpactBoard
        model={boardOf({ kind: 'application', id: 'acme/commerce/order-service' }, 3)}
        onSelect={noop}
      />,
    );
    await afterPaint();

    expect(performance.getEntriesByName(DEPTH_MEASURE)).toHaveLength(1);
  });
});
