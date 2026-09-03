import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { validateCatalog } from '@/catalog';
import type { FallbackEngines, LayoutSpec, Positions } from '@/layout';
import { createStore, type PaneModel } from '@/state';
import catalog1000 from '../../samples/catalog-1000.json';
import type { CanvasProps } from './canvas/Canvas';
import { demoStore } from './fixtures.test-helper';
import { NeighborhoodPane, paneRenderOf } from './NeighborhoodPane';

const ORDER_SERVICE = { kind: 'application', id: 'ATT-IDP4/commerce/order-service' } as const;

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
      parent: 'group:repository=ATT-IDP4/commerce',
    });
    expect(leaves.find((node) => node.kind === 'external')?.parent).toBeUndefined();
    expect(groups.find((node) => node.sourceId === 'repository=ATT-IDP4/commerce')).toMatchObject({
      label: 'ATT-IDP4/commerce',
    });
  });
});

describe('NeighborhoodPane notices', () => {
  it('links a Depth fallback notice to expanding the Overview', () => {
    const store = thousandStore();
    store.actions.select({ kind: 'application', id: 'billing/auth-service' });
    const model = store.derived.paneModel.value;
    if (model === null) throw new Error('expected pane model');
    const expand = vi.fn();

    render(<NeighborhoodPane model={model} onSelect={vi.fn()} onExpandOverview={expand} />);

    // The literal, not `model.notice`: asserting the component against the very model it was handed
    // passes for any notice text at all, and a mutated notice string survived exactly that.
    expect(screen.getByTestId('pane-notice').textContent).toBe(
      'Showing Depth 1 of 2; 497 more in the Overview, and 19 Externals not drawn',
    );
    fireEvent.click(screen.getByTestId('pane-overview-link'));
    expect(expand).toHaveBeenCalledOnce();
  });

  it('shows the Center-only notice without an Overview link', () => {
    const store = thousandStore();
    store.actions.select({ kind: 'external', id: 'sendgrid' });
    store.actions.setDepth(1);
    const model = store.derived.paneModel.value;
    if (model === null) throw new Error('expected pane model');

    render(<NeighborhoodPane model={model} onSelect={vi.fn()} onExpandOverview={vi.fn()} />);

    expect(screen.getByTestId('pane-notice').textContent).toBe(
      '151 Dependents, more than the pane can draw; see the Breaks column',
    );
    expect(screen.queryByTestId('pane-overview-link')).toBeNull();
  });
});

describe('NeighborhoodPane layout states', () => {
  // `pane-progress`, `pane-engine` and `pane-error` had no test either way. The error branch exists
  // because dagre really does throw on some Neighborhoods ("Not possible to find intersection"),
  // and until now it had never rendered even once.

  const positions = (spec: LayoutSpec): Positions =>
    new Map(spec.nodes.map((node, index) => [node.id, { x: index * 10, y: index * 10 }]));

  function renderPane(engines: FallbackEngines) {
    return render(
      <NeighborhoodPane
        model={paneOfDemo()}
        onSelect={vi.fn()}
        onExpandOverview={vi.fn()}
        engines={engines}
      />,
    );
  }

  it('shows the progress status until the layout settles', () => {
    // Layout is deferred past the board's paint, so the first render always shows this.
    renderPane({ dagre: positions });
    expect(screen.getByTestId('pane-progress')).toHaveProperty('role', 'status');
    expect(screen.queryByTestId('pane-engine')).toBeNull();
  });

  it('names dagre when dagre succeeds', async () => {
    renderPane({ dagre: positions });
    await waitFor(() =>
      expect(screen.getByTestId('pane-engine').textContent).toBe('Layout: dagre'),
    );
    expect(screen.queryByTestId('pane-progress')).toBeNull();
    expect(screen.queryByTestId('pane-error')).toBeNull();
  });

  it('names the fallback engine when dagre and elk both fail', async () => {
    const breadthfirst = vi.fn(positions);
    renderPane({
      dagre: () => {
        throw new Error('Not possible to find intersection');
      },
      elk: () => Promise.reject(new Error('elk is unavailable')),
      breadthfirst,
    });

    await waitFor(() =>
      expect(screen.getByTestId('pane-engine').textContent).toBe('Layout: breadthfirst'),
    );
    expect(breadthfirst).toHaveBeenCalledOnce();
    // A pane that fell back is still a drawn pane, not an error.
    expect(screen.queryByTestId('pane-error')).toBeNull();
  });

  it('raises an alert naming the reason when every engine rejects', async () => {
    renderPane({
      dagre: () => {
        throw new Error('Not possible to find intersection');
      },
      elk: () => Promise.reject(new Error('elk is unavailable')),
      breadthfirst: () => {
        throw new Error('breadthfirst gave up');
      },
    });

    const alert = await screen.findByTestId('pane-error');
    expect(alert).toHaveProperty('role', 'alert');
    expect(alert.textContent).toBe('The Neighborhood could not be laid out: breadthfirst gave up');
    // Nothing was drawn, so the pane keeps saying so rather than naming an engine.
    expect(screen.queryByTestId('pane-engine')).toBeNull();
    expect(screen.getByTestId('pane-progress')).toBeTruthy();
  });
});

// Records the props `NeighborhoodPane` hands to `Canvas`, so the identity of the callbacks it
// passes can be asserted. Cytoscape does not initialize under jsdom -- the real Canvas leaves its
// container untouched there -- so the core itself cannot be compared; the callback identity that
// decides whether the core is rebuilt can be, and is the actual subject.
const canvasProps: CanvasProps[] = [];
vi.mock('./canvas/Canvas', () => ({
  Canvas: (props: CanvasProps) => {
    canvasProps.push(props);
    return <div data-testid="canvas-stub" />;
  },
}));

describe('NeighborhoodPane callback identity', () => {
  const positions = (spec: LayoutSpec): Positions =>
    new Map(spec.nodes.map((node, index) => [node.id, { x: index * 10, y: index * 10 }]));

  it('hands Canvas the same onPainted across an unrelated re-render', async () => {
    // `onPainted` is one of the dependencies of the effect in Canvas.tsx that builds the Cytoscape
    // core, so a fresh closure per render tears a 164-element core down and rebuilds it. Today
    // nothing in the shell re-renders this component while leaving its model identical, so the
    // damage is latent -- but the day a signal read moves into App's body, every keystroke would
    // rebuild the core, and because `performance.measure` reuses the stale layout-start mark while
    // e2e/pane.spec.ts takes the MAX of the measure, budgets 3 and 4 would then fail with a number
    // unrelated to layout. Identity is the property, so identity is what is asserted.
    canvasProps.length = 0;
    const model = paneOfDemo();
    const props = {
      model,
      onSelect: vi.fn(),
      onExpandOverview: vi.fn(),
      engines: { dagre: positions },
    };

    const { rerender } = render(<NeighborhoodPane {...props} />);
    await waitFor(() => expect(canvasProps.length).toBeGreaterThan(0));
    const first = canvasProps.length;

    // A fresh `onSelect` with the same model: exactly what the shell hands this component when it
    // re-renders for an unrelated reason. The pane must not add a second changed callback of its
    // own on top of it.
    rerender(<NeighborhoodPane {...props} onSelect={vi.fn()} />);
    await waitFor(() => expect(canvasProps.length).toBeGreaterThan(first));

    expect(canvasProps.at(-1)?.onSelect).not.toBe(canvasProps[0].onSelect); // the re-render happened
    expect(canvasProps.at(-1)?.onPainted).toBe(canvasProps[0].onPainted);
  });
});
