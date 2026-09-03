import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { validateCatalog } from '@/catalog';
import { createStore, type PaneModel } from '@/state';
import catalog1000 from '../../samples/catalog-1000.json';
import { demoStore } from './fixtures.test-helper';
import { NeighborhoodPane, paneRenderOf } from './NeighborhoodPane';

const ORDER_SERVICE = { kind: 'application', id: 'acme/commerce/order-service' } as const;

function paneOfDemo(): PaneModel {
  const store = demoStore();
  store.actions.select(ORDER_SERVICE);
  const pane = store.derived.paneModel.value;
  if (pane === null) {
    throw new Error('expected a pane model');
  }
  return pane;
}

function thousandStore() {
  const validated = validateCatalog(catalog1000);
  if (validated.catalog === undefined) {
    throw new Error('the 1,000-Application fixture must validate');
  }
  return createStore({ catalog: validated.catalog });
}

describe('paneRenderOf', () => {
  it('maps a fixed paneModel to selectable leaves, open Groups, edges and a layout spec', () => {
    const model = paneOfDemo();
    const render = paneRenderOf(model);
    const leaves = render.elements.nodes.filter((node) => node.kind !== 'group');
    const groups = render.elements.nodes.filter((node) => node.kind === 'group');

    expect(leaves).toHaveLength(model.applications.length + model.externals.length);
    expect(groups).toHaveLength(model.groups.length);
    expect(render.elements.edges).toHaveLength(model.dependencies.length);
    expect(render.spec.nodes).toHaveLength(leaves.length);
    expect(render.spec.edges).toHaveLength(model.dependencies.length);
    expect(render.spec.parents?.size).toBe(model.applications.length);

    expect(leaves.find((node) => node.sourceId === ORDER_SERVICE.id)).toMatchObject({
      kind: 'application',
      label: 'order-service',
      center: true,
      parent: 'group:repository=acme/commerce',
    });
    expect(leaves.find((node) => node.kind === 'external')?.parent).toBeUndefined();
    expect(groups.find((node) => node.sourceId === 'repository=acme/commerce')).toMatchObject({
      label: 'acme/commerce',
    });
  });
});

describe('NeighborhoodPane notices', () => {
  it('links a Depth fallback notice to expanding the Overview', () => {
    const store = thousandStore();
    store.actions.select({ kind: 'application', id: 'acme/billing-platform/auth-service' });
    const model = store.derived.paneModel.value;
    if (model === null) throw new Error('expected pane model');
    const expand = vi.fn();

    render(<NeighborhoodPane model={model} onSelect={vi.fn()} onExpandOverview={expand} />);

    expect(screen.getByTestId('pane-notice').textContent).toBe(model.notice);
    fireEvent.click(screen.getByTestId('pane-overview-link'));
    expect(expand).toHaveBeenCalledOnce();
  });

  it('shows the Center-only notice without an Overview link', () => {
    const store = thousandStore();
    store.actions.select({ kind: 'external', id: 'mysql-legacy' });
    store.actions.setDepth(1);
    const model = store.derived.paneModel.value;
    if (model === null) throw new Error('expected pane model');

    render(<NeighborhoodPane model={model} onSelect={vi.fn()} onExpandOverview={vi.fn()} />);

    expect(screen.getByTestId('pane-notice').textContent).toBe(
      '197 Dependents, more than the pane can draw; see the Breaks column',
    );
    expect(screen.queryByTestId('pane-overview-link')).toBeNull();
  });
});
