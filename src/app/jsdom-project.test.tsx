import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { validateCatalog } from '@/catalog';
import { createStore, type Store } from '@/state';
import demoCatalog from '../../samples/catalog.demo.json';
import { App, LOAD_MEASURE, markLoadStart } from './App';

/**
 * The `jsdom` Vitest project renders Preact through Testing Library, as docs/architecture.md
 * prescribes for the view — and the shell it renders is the real one, wired to a real store. The
 * per-component tests live in `src/view/*.test.tsx`; what is proved here is the wiring between
 * them and `@/state`.
 */

function storeOf(): Store {
  const result = validateCatalog(demoCatalog);
  const catalog = result.catalog;
  if (catalog === undefined) {
    throw new Error('the bundled sample Catalog must validate');
  }
  return createStore({
    catalog,
    source: { kind: 'sample', name: 'sample Catalog (demo)' },
    warnings: result.warnings,
  });
}

/** Two frames: RankedTable stamps its paint on the second one. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe('vitest project: jsdom', () => {
  it('renders Preact into a DOM through Testing Library', () => {
    render(<p>jsdom is alive</p>);
    const line = screen.getByText('jsdom is alive');
    expect(line).toBeInstanceOf(HTMLParagraphElement);
    expect(document.body.contains(line)).toBe(true);
  });

  it('cleans the DOM between tests', () => {
    expect(screen.queryByText('jsdom is alive')).toBeNull();
  });
});

describe('App shell', () => {
  it('renders the header, the picker and the ranked table from the store', () => {
    render(<App store={storeOf()} />);

    expect(screen.getByTestId('header-source').textContent).toContain('sample Catalog (demo)');
    expect(screen.getByTestId('header-counts').textContent).toBe('34 Applications, 19 Externals');
    expect(screen.getByTestId('picker-input')).toBeTruthy();
    // 34 Applications and 19 Externals ranked together, all inside the first 100-row page.
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(53);
    expect(
      screen.getAllByTestId('ranked-row').filter((row) => row.dataset.kind === 'application'),
    ).toHaveLength(34);
    expect(screen.queryByTestId('center-panel')).toBeNull();
    expect(screen.queryByTestId('report')).toBeNull();
  });

  it('gives an External row its kind chip from the Graph (docs/center.md, decision 4)', () => {
    render(<App store={storeOf()} />);

    const chips = screen.getAllByTestId('ranked-chip').map((chip) => chip.textContent ?? '');
    expect(chips.some((chip) => chip === 'Application')).toBe(true);
    expect(chips.filter((chip) => chip.startsWith('External · '))).toHaveLength(19);
  });

  it('opens the warnings side sheet from the badge (docs/validation-surfacing.md, decision 5)', () => {
    render(<App store={storeOf()} />);

    fireEvent.click(screen.getByTestId('warnings-badge'));

    const report = screen.getByTestId('report');
    expect(report.dataset.mode).toBe('warnings');
    const rows = screen.getAllByTestId('report-row');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.dataset.code === 'W_EMPTY_CHANNEL')).toBe(true);
    expect(screen.getByTestId('report').textContent).toContain('orders.shipped');
    expect(screen.getByTestId('report').textContent).toContain('fraud.alerts');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('report')).toBeNull();
  });

  it('selects the Center of the row that was clicked, and clears it again', () => {
    const store = storeOf();
    render(<App store={store} />);

    fireEvent.click(screen.getAllByTestId('ranked-link')[0]);

    const id = store.derived.ranked.value.rows[0].id;
    expect(screen.getByTestId('center-id').textContent).toBe(id);
    expect(store.center.value?.id).toBe(id);

    fireEvent.click(screen.getByTestId('center-clear'));
    expect(screen.queryByTestId('center-panel')).toBeNull();
    expect(store.center.value).toBeNull();
  });

  it('shows the dismissible missing-Center notice (docs/url-state.md, rule 5)', async () => {
    const store = storeOf();
    render(<App store={store} />);

    // A signal set outside an event handler repaints on its own schedule, so wait for the paint.
    store.actions.select({ kind: 'application', id: 'acme/none/nothing' });
    await waitFor(() => expect(screen.getByTestId('notice')).toBeTruthy());

    const notice = screen.getByTestId('notice');
    expect(notice.textContent).toContain('acme/none/nothing is not in this Catalog.');
    // The sample is loaded, so the notice adds the hint.
    expect(notice.textContent).toContain('Load your Catalog to open it.');
    expect(screen.queryByTestId('center-panel')).toBeNull();
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(53);

    fireEvent.click(screen.getByTestId('notice-dismiss'));
    expect(screen.queryByTestId('notice')).toBeNull();
  });

  it('shows the rejected dialog over the current Catalog, which survives (decision 3)', async () => {
    const store = storeOf();
    render(<App store={store} />);

    await store.actions.load('https://example.invalid/catalog.json');

    await waitFor(() => expect(screen.getByTestId('report').dataset.mode).toBe('rejected'));
    expect(screen.getByTestId('report').textContent).toContain('E_FETCH');
    // The sample is still behind the dialog.
    expect(screen.getByTestId('header-counts').textContent).toBe('34 Applications, 19 Externals');
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(53);
  });

  it('reopens the picker from the report and closes it (decision 4)', () => {
    const store = storeOf();
    render(<App store={store} />);

    fireEvent.click(screen.getByTestId('warnings-badge'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));

    expect(screen.queryByTestId('report')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('picker-input'));
  });

  it('measures file-chosen to ranked-table-painted (docs/performance-budgets.md, budget 2)', async () => {
    performance.clearMarks();
    performance.clearMeasures();

    markLoadStart();
    render(<App store={storeOf()} />);
    await afterPaint();

    await waitFor(() => expect(performance.getEntriesByName(LOAD_MEASURE)).toHaveLength(1));
    expect(performance.getEntriesByName(LOAD_MEASURE)[0].duration).toBeGreaterThanOrEqual(0);
  });
});
