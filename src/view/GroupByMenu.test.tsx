import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { GROUP_BY_FALLBACK, GroupByMenu, groupByLabel } from '@/view';

/** What `groupableAttributes` returns for a Catalog whose Applications carry `language`. */
const ATTRIBUTES = ['repository', 'team', 'kind', 'language'];

function renderMenu(props: Partial<Parameters<typeof GroupByMenu>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <GroupByMenu
      attributes={ATTRIBUTES}
      value="repository"
      effective="repository"
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

function optionLabels(): string[] {
  return [...screen.getByTestId<HTMLSelectElement>('groupby-select').options].map(
    (option) => option.textContent ?? '',
  );
}

describe('GroupByMenu', () => {
  it('lists None, Repository, Team, Kind, then the discovered scalar keys, in that order', () => {
    renderMenu();
    // Pinned to the literals: renaming a built-in or reordering the menu must turn this red.
    expect(optionLabels()).toEqual(['None', 'Repository', 'Team', 'Kind', 'Language']);
    expect(
      [...screen.getByTestId<HTMLSelectElement>('groupby-select').options].map(
        (option) => option.value,
      ),
    ).toEqual(['none', 'repository', 'team', 'kind', 'language']);
  });

  it('says the Overview falls back to Repository while None is selected', () => {
    renderMenu({ value: 'none', effective: 'repository' });
    expect(screen.getByTestId('groupby-fallback').textContent).toBe(GROUP_BY_FALLBACK);
    expect(GROUP_BY_FALLBACK).toContain('Repository');
    // The menu also publishes what the Overview really groups by, so a test can read it.
    expect(screen.getByTestId('groupby-select').getAttribute('data-effective')).toBe('repository');
  });

  it('says nothing about a fallback while a real Attribute is selected', () => {
    renderMenu({ value: 'team', effective: 'team' });
    expect(screen.queryByTestId('groupby-fallback')).toBeNull();
  });

  it('reports the chosen Attribute', () => {
    const { onChange } = renderMenu();
    fireEvent.change(screen.getByTestId('groupby-select'), { target: { value: 'team' } });
    expect(onChange).toHaveBeenCalledWith('team');
  });

  it('capitalises a key without renaming it', () => {
    expect(groupByLabel('none')).toBe('None');
    expect(groupByLabel('repository')).toBe('Repository');
    expect(groupByLabel('runtime')).toBe('Runtime');
  });
});
