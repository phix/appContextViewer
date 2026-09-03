import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { tagToken } from '@/graph';
import type { RankedModel } from '@/state';
import { currentHighlight, FIRST_PAGE, RankedTable } from '@/view';
import { tagsOf } from './fixtures.test-helper';
import { resetHighlight } from './highlight';

function modelOf(overrides: Partial<RankedModel> = {}): RankedModel {
  const rows = overrides.rows ?? [
    { kind: 'external' as const, id: 'redis', label: 'redis', size: 12 },
    {
      kind: 'application' as const,
      id: 'acme/platform-core/auth-service',
      label: 'acme/platform-core/auth-service',
      size: 9,
    },
    { kind: 'external' as const, id: 'postgres', label: 'postgres', size: 4 },
    { kind: 'application' as const, id: 'acme/tools/cli', label: 'acme/tools/cli', size: 0 },
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
    label: `app-${index}`,
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
          rows: [
            {
              kind: 'application',
              id: 'acme/platform-core/auth-service',
              label: 'acme/platform-core/auth-service',
              size: 9,
            },
          ],
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

describe('an Application whose id names nothing', () => {
  // docs/retrospective-2026-09-03.md, N6. Under an APM scheme the id is `…/apm10133`, so a table
  // that renders the id renders nothing a reader can act on. The label reads; the id stays visible
  // beside it, because an operator still needs to copy the identity.
  const apmRows = [
    {
      kind: 'application' as const,
      id: 'ATT-IDP5/shared-libraries/apm10133',
      label: 'Common Logging Library',
      size: 118,
    },
    { kind: 'external' as const, id: 'kafka-event-bus', label: 'Kafka', size: 83 },
  ];

  it('renders the name, not the APM id', () => {
    renderTable({ model: modelOf({ rows: apmRows }) });
    const labels = screen.getAllByTestId('ranked-label');
    expect(labels[0]?.textContent).toBe('Common Logging Library');
    expect(labels[1]?.textContent).toBe('Kafka');
  });

  it('still shows the id, so identity is never hidden', () => {
    renderTable({ model: modelOf({ rows: apmRows }) });
    expect(screen.getAllByTestId('ranked-id').map((node) => node.textContent)).toEqual([
      'ATT-IDP5/shared-libraries/apm10133',
      'kafka-event-bus',
    ]);
    // Both live inside the button, so the control's own accessible name carries the identity.
    expect(screen.getAllByTestId('ranked-link')[0]?.textContent).toBe(
      'Common Logging LibraryATT-IDP5/shared-libraries/apm10133',
    );
  });

  it('does not repeat itself when the label already is the id', () => {
    renderTable({
      model: modelOf({
        rows: [{ kind: 'external' as const, id: 'redis', label: 'redis', size: 4 }],
      }),
    });
    expect(screen.getByTestId('ranked-label').textContent).toBe('redis');
    expect(screen.queryByTestId('ranked-id')).toBeNull();
  });
});

/**
 * The ranked table's half of the Highlight (docs/tags.md). What matters most here is `data-groups`:
 * the table takes part in a Highlight raised from any surface without re-rendering, and it does so
 * because every row already carries its tokens.
 */
describe('Tags in the ranked table', () => {
  const tags = tagsOf();

  it('carries the Tag tokens of every row, Applications included', () => {
    const rows = [
      { kind: 'application' as const, id: 'acme/commerce/order-service', label: 'x', size: 3 },
      { kind: 'external' as const, id: 'redis', label: 'redis', size: 2 },
    ];
    renderTable({ model: modelOf({ rows }), tags });

    const rendered = screen.getAllByTestId('ranked-row');
    expect(rendered[0]?.dataset.groups?.split(' ')).toContain(tagToken('team', 'commerce'));
    expect(rendered[1]?.dataset.groups?.split(' ')).toContain(tagToken('kind', 'cache'));
  });

  it('makes an External kind chip a Tag, and leaves an Application chip inert', () => {
    renderTable({ tags, externalKinds: new Map([['redis', 'cache']]) });

    const chips = screen.getAllByTestId('ranked-chip');
    // "External · cache" names `kind=cache`; "Application" is a node kind and names no Group.
    expect(chips[0]?.tagName).toBe('BUTTON');
    expect(chips[1]?.tagName).toBe('SPAN');
    // An External whose kind the shell did not supply reads "External" and names nothing either.
    expect(chips[2]?.tagName).toBe('SPAN');
  });

  it('Highlights the caches when its kind Tag is pointed at', () => {
    renderTable({ tags, externalKinds: new Map([['redis', 'cache']]) });
    fireEvent.mouseEnter(screen.getAllByTestId('ranked-chip')[0] as Element);

    expect(currentHighlight()?.token).toBe(tagToken('kind', 'cache'));
    expect(currentHighlight()?.members.size).toBeGreaterThan(0);
    resetHighlight();
  });

  it('renders exactly as before when the shell supplies no Tags', () => {
    renderTable({ externalKinds: new Map([['redis', 'cache']]) });
    expect(screen.getAllByTestId('ranked-chip')[0]?.tagName).toBe('SPAN');
    expect(screen.getAllByTestId('ranked-row')[0]?.hasAttribute('data-groups')).toBe(false);
  });
});
