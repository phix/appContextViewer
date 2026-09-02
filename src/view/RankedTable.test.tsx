import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { RankedModel } from '@/state';
import { FIRST_PAGE, RankedTable } from '@/view';

function modelOf(overrides: Partial<RankedModel> = {}): RankedModel {
  const rows = overrides.rows ?? [
    { kind: 'external' as const, id: 'redis', size: 12 },
    { kind: 'application' as const, id: 'acme/platform-core/auth-service', size: 9 },
    { kind: 'external' as const, id: 'postgres', size: 4 },
    { kind: 'application' as const, id: 'acme/tools/cli', size: 0 },
  ];
  return {
    rows,
    applicationsOnly: false,
    applications: 34,
    externals: 19,
    ...overrides,
  };
}

function noop() {
  /* the test does not care */
}

function renderTable(props: Partial<Parameters<typeof RankedTable>[0]> = {}) {
  return render(<RankedTable model={modelOf()} onSelect={noop} onFilterChange={noop} {...props} />);
}

function manyRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'application' as const,
    id: `acme/repo/app-${index}`,
    size: count - index,
  }));
}

describe('RankedTable', () => {
  it('lists Applications and Externals together, each with a kind chip (docs/center.md, decision 4)', () => {
    renderTable({ externalKinds: new Map([['redis', 'cache']]) });

    const rows = screen.getAllByTestId('ranked-row');
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual([
      'external',
      'application',
      'external',
      'application',
    ]);
    const chips = screen.getAllByTestId('ranked-chip').map((chip) => chip.textContent);
    // The External kind comes from the shell's map; without it the chip falls back to "External".
    expect(chips).toEqual(['External · cache', 'Application', 'External', 'Application']);
  });

  it('reports the Applications-only filter rather than filtering itself (decision 4)', () => {
    const onFilterChange = vi.fn();
    const { rerender } = renderTable({ onFilterChange });

    const checkbox = screen.getByTestId('applications-only') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onFilterChange).toHaveBeenCalledWith(true);

    // The store owns the filtering; the table renders whatever rows come back.
    rerender(
      <RankedTable
        model={modelOf({
          rows: [{ kind: 'application', id: 'acme/platform-core/auth-service', size: 9 }],
          applicationsOnly: true,
        })}
        onSelect={noop}
        onFilterChange={onFilterChange}
      />,
    );
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(1);
    expect((screen.getByTestId('applications-only') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('ranked-counts').textContent).toContain('Externals hidden');
  });

  it('selects the Center of the row that was clicked', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });

    fireEvent.click(screen.getAllByTestId('ranked-link')[0]);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'external', id: 'redis' });

    fireEvent.click(screen.getAllByTestId('ranked-link')[1]);
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: 'application',
      id: 'acme/platform-core/auth-service',
    });
  });

  it('paints the first 100 rows and the rest on scroll (docs/performance-budgets.md, budget 2)', () => {
    renderTable({ model: modelOf({ rows: manyRows(250) }) });

    expect(screen.getAllByTestId('ranked-row')).toHaveLength(FIRST_PAGE);

    const box = screen.getByTestId('ranked-scroll');
    // jsdom reports every box as zero-sized, so the scroll geometry is set by hand; the component
    // only asks whether the scroll position has reached the bottom.
    Object.defineProperty(box, 'scrollHeight', { value: 4_000, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(box, 'scrollTop', { value: 3_600, configurable: true });
    fireEvent.scroll(box);
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(2 * FIRST_PAGE);

    fireEvent.scroll(box);
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(250);
    expect(screen.queryByTestId('ranked-more')).toBeNull();
  });

  it('offers the same next page as a button, for the keyboard', () => {
    renderTable({ model: modelOf({ rows: manyRows(250) }) });

    const more = screen.getByTestId('ranked-more');
    expect(more.textContent).toBe('Show 100 more of 250');
    fireEvent.click(more);
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(2 * FIRST_PAGE);
  });

  it('starts the paging over when a new Catalog arrives', () => {
    const { rerender } = renderTable({ model: modelOf({ rows: manyRows(250) }) });
    fireEvent.click(screen.getByTestId('ranked-more'));
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(2 * FIRST_PAGE);

    rerender(
      <RankedTable
        model={modelOf({ rows: manyRows(300) })}
        onSelect={noop}
        onFilterChange={noop}
      />,
    );
    expect(screen.getAllByTestId('ranked-row')).toHaveLength(FIRST_PAGE);
  });

  it('reports when the browser has painted its rows, so the shell can stamp budget 2', async () => {
    const onPainted = vi.fn();
    renderTable({ onPainted });

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(onPainted).toHaveBeenCalled();
  });
});
