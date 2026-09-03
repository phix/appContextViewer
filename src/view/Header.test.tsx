import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { Source } from '@/state';
import { Header } from '@/view';

const SAMPLE: Source = { kind: 'sample', name: 'sample Catalog (demo)' };

function noop() {
  /* the test does not care */
}

function renderHeader(props: Partial<Parameters<typeof Header>[0]> = {}) {
  return render(
    <Header
      source={SAMPLE}
      applications={34}
      externals={19}
      warnings={0}
      depth={2}
      onDepthChange={noop}
      onOpenWarnings={noop}
      {...props}
    />,
  );
}

describe('Header', () => {
  it('names the Catalog source and its counts', () => {
    renderHeader();
    expect(screen.getByTestId('header-source').textContent).toContain('sample Catalog (demo)');
    expect(screen.getByTestId('header-counts').textContent).toBe('34 Applications, 19 Externals');
  });

  it('has no warnings badge at zero (docs/validation-surfacing.md, decision 5)', () => {
    renderHeader({ warnings: 0 });
    expect(screen.queryByTestId('warnings-badge')).toBeNull();
  });

  it('counts warnings on the badge and opens the report with it (decision 5)', () => {
    const onOpenWarnings = vi.fn();
    renderHeader({ warnings: 2, onOpenWarnings });

    const badge = screen.getByTestId('warnings-badge');
    expect(badge.textContent).toBe('2 warnings');
    fireEvent.click(badge);
    expect(onOpenWarnings).toHaveBeenCalledTimes(1);
  });

  it('says "1 warning" for a single one', () => {
    renderHeader({ warnings: 1 });
    expect(screen.getByTestId('warnings-badge').textContent).toBe('1 warning');
  });

  it('offers Depth 1, 2, 3 and All, and reports the choice (docs/url-state.md)', () => {
    const onDepthChange = vi.fn();
    renderHeader({ depth: 2, onDepthChange });

    const select = screen.getByTestId('depth-select') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['1', '2', '3', 'all']);
    expect(select.value).toBe('2');

    select.value = '3';
    fireEvent.change(select);
    expect(onDepthChange).toHaveBeenLastCalledWith(3);

    select.value = 'all';
    fireEvent.change(select);
    expect(onDepthChange).toHaveBeenLastCalledWith(Number.POSITIVE_INFINITY);
  });

  it('shows depth=all as the selected option', () => {
    renderHeader({ depth: Number.POSITIVE_INFINITY });
    expect((screen.getByTestId('depth-select') as HTMLSelectElement).value).toBe('all');
  });

  it('keeps an empty search slot for the board slice, and fills it when given children', () => {
    const { rerender } = renderHeader();
    expect(screen.getByTestId('header-search-slot').textContent).toBe('');

    rerender(
      <Header
        source={SAMPLE}
        applications={34}
        externals={19}
        warnings={0}
        depth={2}
        onDepthChange={noop}
        onOpenWarnings={noop}
        searchSlot={<input data-testid="search-box" />}
      />,
    );
    expect(screen.getByTestId('search-box')).toBeTruthy();
  });

  it('disables Expand canvas until a handler arrives with the Overview slice', () => {
    const { rerender } = renderHeader();
    expect((screen.getByTestId('expand-canvas') as HTMLButtonElement).disabled).toBe(true);

    const onExpandCanvas = vi.fn();
    rerender(
      <Header
        source={SAMPLE}
        applications={34}
        externals={19}
        warnings={0}
        depth={2}
        onDepthChange={noop}
        onOpenWarnings={noop}
        onExpandCanvas={onExpandCanvas}
      />,
    );
    const button = screen.getByTestId('expand-canvas') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onExpandCanvas).toHaveBeenCalledTimes(1);
  });

  it('offers Space alongside Overview and reports its pressed state', () => {
    const onExpandSpace = vi.fn();
    renderHeader({ onExpandSpace, spaceExpanded: true, overviewExpanded: false });
    const space = screen.getByTestId('space-toggle');
    expect(space.getAttribute('aria-pressed')).toBe('true');
    expect(space.textContent).toBe('Close Space');
    fireEvent.click(space);
    expect(onExpandSpace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('expand-canvas').textContent).toBe('Overview');
  });
});
