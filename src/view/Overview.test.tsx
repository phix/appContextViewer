import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { validateCatalog } from '@/catalog';
import type { OverviewLayout, OverviewSpec, Positions } from '@/layout';
import { type Center, createStore, type OverviewModel, type Store } from '@/state';
import { demoStore } from './fixtures.test-helper';
import {
  CANCELLED_NOTE,
  COLLAPSED_HEIGHT,
  COLLAPSED_WIDTH,
  expandAllTooltip,
  LABEL_HEIGHT,
  LABEL_WIDTH,
  MEMBER_HEIGHT,
  MEMBER_WIDTH,
  Overview,
  OverviewControls,
  overviewRenderOf,
} from './Overview';

/**
 * Cytoscape cannot mount in jsdom, so the canvas is stubbed with a button per node that calls the
 * same three callbacks the real one does. That keeps the component's own logic — progress, cancel,
 * the previous positions surviving a cancel, and the locked Centre Group — testable here, and
 * leaves the drawing itself to e2e/overview.spec.ts.
 */
type StubProps = {
  elements: ReturnType<typeof overviewRenderOf>['elements'];
  positions: ReadonlyMap<string, { x: number; y: number }>;
  onOpenGroup: (id: string) => void;
  onCollapseGroup: (id: string) => void;
  onSelectApplication: (id: string) => void;
};

vi.mock('./canvas/OverviewCanvas', () => ({
  ANIMATION_MS: -1,
  OverviewCanvas: ({
    elements,
    positions,
    onOpenGroup,
    onCollapseGroup,
    onSelectApplication,
  }: StubProps) => (
    <div
      data-testid="overview-canvas"
      data-positions={String(positions.size)}
      data-collapsed={String(elements.nodes.filter((n) => n.kind === 'collapsed').length)}
      data-open={String(elements.nodes.filter((n) => n.kind === 'open').length)}
      data-members={String(elements.nodes.filter((n) => n.kind === 'member').length)}
    >
      {elements.nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-testid={`node-${node.id}`}
          data-highlighted={String(node.highlighted === true)}
          onClick={() => {
            if (node.kind === 'collapsed') {
              onOpenGroup(node.sourceId);
            } else if (node.kind === 'label') {
              onCollapseGroup(node.sourceId);
            } else if (node.kind === 'member') {
              onSelectApplication(node.sourceId);
            }
          }}
        >
          {node.label}
        </button>
      ))}
    </div>
  ),
}));

const COMMERCE = 'repository=ATT-IDP4/commerce';
const PLATFORM_CORE = 'repository=ATT-IDP5/platform-core';
const ORDER_SERVICE: Center = { kind: 'application', id: 'ATT-IDP4/commerce/order-service' };

function expanded(mutate: (store: Store) => void = () => undefined): {
  store: Store;
  model: OverviewModel;
} {
  const store = demoStore();
  store.actions.expandOverview(true);
  mutate(store);
  return { store, model: store.derived.overviewModel.value };
}

// ---------------------------------------------------------------- element mapping

describe('overviewRenderOf', () => {
  it('draws a collapsed Group as one node carrying the Group value and its member count', () => {
    const { model } = expanded();
    const result = overviewRenderOf(model, null);

    expect(model.groups).toHaveLength(10);
    expect(result.elements.nodes).toHaveLength(10);
    expect(result.elements.nodes.every((node) => node.kind === 'collapsed')).toBe(true);
    expect(result.elements.nodes.find((node) => node.sourceId === COMMERCE)).toMatchObject({
      id: `group:${COMMERCE}`,
      label: 'ATT-IDP4/commerce · 8',
      kind: 'collapsed',
      width: COLLAPSED_WIDTH,
      height: COLLAPSED_HEIGHT,
    });
    // Every collapsed Group is a leaf of the layout spec, and nothing has a parent yet.
    expect(result.spec.nodes).toHaveLength(10);
    expect(result.spec.parents?.size).toBe(0);
  });

  it('draws one directed edge per ordered pair of Groups, labelled with the count', () => {
    const { model } = expanded();
    const result = overviewRenderOf(model, null);

    expect(result.elements.edges).toHaveLength(15);
    expect(result.elements.edges.every((edge) => edge.kind === 'group')).toBe(true);
    const pairs = result.elements.edges.map((edge) => `${edge.source}->${edge.target}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(
      result.elements.edges.find(
        (edge) => edge.source === `group:${COMMERCE}` && edge.target === `group:${PLATFORM_CORE}`,
      ),
    ).toMatchObject({ label: '2', kind: 'group' });
  });

  it('labels an open Group’s members with their name, not their id, when the producer supplied one', () => {
    const { catalog } = validateCatalog({
      schemaVersion: 1,
      applications: [
        { repository: 'a', project: 'apm10000', name: 'Alarm Ingest Gateway' },
        { repository: 'a', project: 'apm10001' },
      ],
    });
    if (catalog === undefined) {
      throw new Error('the named-member fixture must validate');
    }
    const store = createStore({ catalog });
    store.actions.expandOverview(true);
    store.actions.toggleGroup('repository=a');
    const result = overviewRenderOf(store.derived.overviewModel.value, null);

    const members = result.elements.nodes.filter((node) => node.kind === 'member');
    expect(members.find((node) => node.sourceId === 'a/apm10000')).toMatchObject({
      label: 'Alarm Ingest Gateway',
    });
    // No `name`: labelOf falls back to the Project, same as the ranked table and the Center card do.
    expect(members.find((node) => node.sourceId === 'a/apm10001')).toMatchObject({
      label: 'apm10001',
    });
  });

  it('hides a collapsed Group’s intra-Group Dependencies and restores them when it opens', () => {
    const closed = overviewRenderOf(expanded().model, null);
    expect(closed.elements.edges.filter((edge) => edge.kind === 'member')).toHaveLength(0);

    const { model } = expanded((store) => store.actions.toggleGroup(COMMERCE));
    const open = overviewRenderOf(model, null);
    const members = open.elements.edges.filter((edge) => edge.kind === 'member');
    expect(members).toHaveLength(8);
    // Every restored edge runs between two members of the Group that opened.
    const inside = new Set(
      open.elements.nodes
        .filter((node) => node.kind === 'member' && node.parent === `group:${COMMERCE}`)
        .map((node) => node.id),
    );
    expect(inside.size).toBe(8);
    for (const edge of members) {
      expect(inside.has(edge.source) && inside.has(edge.target)).toBe(true);
    }
  });

  it('draws an open Group as a compound parent the layout sizes, with its members inside', () => {
    const { model } = expanded((store) => store.actions.toggleGroup(COMMERCE));
    const result = overviewRenderOf(model, null);

    const group = result.elements.nodes.find(
      (node) => node.sourceId === COMMERCE && node.kind === 'open',
    );
    // A compound parent takes no size and no text from the view: elk sizes the box and the label
    // chip below carries the words, because the compound's own padding band cannot be clicked.
    expect(group).toMatchObject({ kind: 'open', label: '' });
    expect(group?.width).toBeUndefined();
    expect(group?.height).toBeUndefined();

    const chip = result.elements.nodes.find((node) => node.kind === 'label');
    expect(chip).toMatchObject({
      id: `label:${COMMERCE}`,
      sourceId: COMMERCE,
      label: 'ATT-IDP4/commerce · 8',
      parent: `group:${COMMERCE}`,
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
    });
    // The chip is drawn, never laid out: elk reserves its room inside the Group's own padding.
    expect(result.spec.nodes.some((node) => node.id === chip?.id)).toBe(false);

    const members = result.elements.nodes.filter((node) => node.kind === 'member');
    expect(members).toHaveLength(8);
    expect(members.every((node) => node.parent === `group:${COMMERCE}`)).toBe(true);
    expect(members[0]).toMatchObject({ width: MEMBER_WIDTH, height: MEMBER_HEIGHT });
    // 9 collapsed Groups plus 8 members are the leaves; the open Group is a parent, not a leaf.
    expect(result.spec.nodes).toHaveLength(17);
    expect(result.spec.parents?.size).toBe(8);
    expect([...(result.spec.parents ?? new Map()).values()]).toEqual(
      Array.from({ length: 8 }, () => `group:${COMMERCE}`),
    );
  });

  it('never draws an External or a Channel, even with every Group open', () => {
    const { store, model } = expanded((s) => s.actions.expandAll());
    // The fixture has both, so the assertion below is not vacuous.
    expect(store.graph.value.externals.size).toBeGreaterThan(0);
    expect(store.graph.value.channels.size).toBeGreaterThan(0);

    const result = overviewRenderOf(model, null);
    const ids = new Set(result.elements.nodes.map((node) => node.id));
    expect(result.elements.nodes.filter((node) => node.kind === 'member')).toHaveLength(34);
    for (const external of store.graph.value.externals.keys()) {
      expect(ids.has(`app:${external}`)).toBe(false);
    }
    // Any External or Channel that leaked in would arrive as an edge end with no node.
    for (const edge of result.elements.edges) {
      expect(ids.has(edge.source) && ids.has(edge.target), edge.id).toBe(true);
    }
  });

  it('locks the Group holding an Application Centre and highlights it', () => {
    const { model } = expanded((store) => store.actions.select(ORDER_SERVICE));
    const result = overviewRenderOf(model, ORDER_SERVICE);

    expect(model.highlighted).toEqual([COMMERCE]);
    expect([...result.locked]).toEqual([COMMERCE]);
    expect(
      result.elements.nodes.filter((node) => node.sourceId === COMMERCE).map((node) => node.kind),
    ).toEqual(['open', 'label']);
    for (const node of result.elements.nodes.filter((node) => node.sourceId === COMMERCE)) {
      expect(node).toMatchObject({ highlighted: true, locked: true });
    }
  });

  it('highlights an External Centre’s Dependents’ Groups, collapsed, and locks none', () => {
    const centre: Center = { kind: 'external', id: 'redis' };
    const { model } = expanded((store) => store.actions.select(centre));
    const result = overviewRenderOf(model, centre);

    expect(model.highlighted.length).toBeGreaterThan(1);
    expect(result.locked.size).toBe(0);
    const highlighted = result.elements.nodes.filter((node) => node.highlighted === true);
    expect(highlighted.map((node) => node.sourceId).sort()).toEqual([...model.highlighted].sort());
    // "opens none": every highlighted Group is still drawn collapsed.
    expect(highlighted.every((node) => node.kind === 'collapsed')).toBe(true);
  });

  /**
   * Issue #40, on the same small hand-built Catalog `derived.test.ts` proves `neighborhood` and
   * `reachedGroupEdges` against: a member glows only within Depth of the Center, and a `group` edge
   * glows when the Neighborhood's own walk actually crosses it -- both narrower than, and independent
   * of, the whole-Group glow `model.highlighted` still carries.
   */
  describe('the Depth-scoped Neighborhood highlight', () => {
    const NEIGHBORHOOD_CATALOG = {
      schemaVersion: 1,
      applications: [
        { repository: 'a', project: 'center', dependsOn: ['a/a2'] },
        { repository: 'a', project: 'a2', dependsOn: ['b/b1'] },
        { repository: 'a', project: 'a3' },
        { repository: 'b', project: 'b1' },
        { repository: 'd', project: 'd1', dependsOn: ['a/center'] },
        { repository: 'e', project: 'e1' },
      ],
    };
    const CENTER: Center = { kind: 'application', id: 'a/center' };

    function neighborhoodModel(): OverviewModel {
      const { catalog } = validateCatalog(NEIGHBORHOOD_CATALOG);
      if (catalog === undefined) {
        throw new Error('the Neighborhood-highlight fixture must validate');
      }
      const store = createStore({ catalog });
      store.actions.select(CENTER);
      store.actions.expandOverview(true);
      return store.derived.overviewModel.value;
    }

    it('glows a member only within Depth of the Center, not every member of its open Group', () => {
      const model = neighborhoodModel();
      const result = overviewRenderOf(model, CENTER);

      const members = result.elements.nodes.filter((node) => node.kind === 'member');
      expect(members.map((node) => node.sourceId).sort()).toEqual(['a/a2', 'a/a3', 'a/center']);
      expect(members.find((node) => node.sourceId === 'a/center')).toMatchObject({
        highlighted: true,
      });
      expect(members.find((node) => node.sourceId === 'a/a2')).toMatchObject({ highlighted: true });
      // a3 shares the open Group with the Center but carries no Dependency to or from anything.
      expect(members.find((node) => node.sourceId === 'a/a3')).toMatchObject({
        highlighted: false,
      });
    });

    it('glows a Group Dependency the Neighborhood reaches into a collapsed Group past the Center’s own', () => {
      const model = neighborhoodModel();
      const result = overviewRenderOf(model, CENTER);

      // Neither Group b nor Group d holds the Center, so neither is in `model.highlighted`.
      expect(model.highlighted).toEqual(['repository=a']);
      const intoB = result.elements.edges.find(
        (edge) => edge.source === 'group:repository=a' && edge.target === 'group:repository=b',
      );
      const fromD = result.elements.edges.find(
        (edge) => edge.source === 'group:repository=d' && edge.target === 'group:repository=a',
      );
      expect(intoB).toMatchObject({ highlighted: true });
      expect(fromD).toMatchObject({ highlighted: true });
    });
  });
});

// ---------------------------------------------------------------- header controls

const OVER_ENVELOPE: OverviewModel = {
  expanded: true,
  attribute: 'repository',
  groups: [],
  open: new Set(),
  edges: [],
  highlighted: [],
  neighborhood: new Set(),
  reachedGroupEdges: new Set(),
  expandAllDisabled: true,
  overviewDisabled: false,
  notice: null,
  applications: 1001,
  dependencies: 5400,
  groupDependencies: 0,
  hiddenGroupDependencies: 0,
  capNotice: null,
  labels: new Map(),
};

describe('OverviewControls', () => {
  function renderControls(model: OverviewModel, props: Record<string, unknown> = {}) {
    const onExpandAll = vi.fn();
    const onCollapseAll = vi.fn();
    const onGroupBy = vi.fn();
    render(
      <OverviewControls
        model={model}
        attributes={['repository', 'team', 'kind']}
        groupBy="repository"
        onGroupBy={onGroupBy}
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        {...props}
      />,
    );
    return { onExpandAll, onCollapseAll, onGroupBy };
  }

  it('shows nothing while the Overview is closed, so the menu is canvas only', () => {
    renderControls({ ...OVER_ENVELOPE, expanded: false, expandAllDisabled: false });
    expect(screen.queryByTestId('overview-controls')).toBeNull();
    expect(screen.queryByTestId('groupby')).toBeNull();
  });

  it('disables Expand all over the envelope, with a tooltip naming the limit and the count', () => {
    const { onCollapseAll } = renderControls(OVER_ENVELOPE);
    const button = screen.getByTestId<HTMLButtonElement>('expand-all');
    // `disabled` is what stops the click in a browser; e2e/overview.spec.ts clicks it for real.
    expect(button.disabled).toBe(true);
    // Pinned to the literals from docs/performance-budgets.md, not to the constant itself.
    expect(button.title).toBe(
      'Expand all is disabled above 1,000 Applications; this Catalog has 1,001.',
    );
    expect(expandAllTooltip(1001)).toBe(button.title);
    // Collapse all is unaffected: the collapsed Overview and single Groups remain.
    fireEvent.click(screen.getByTestId('collapse-all'));
    expect(onCollapseAll).toHaveBeenCalledOnce();
  });

  it('runs Expand all and Collapse all inside the envelope', () => {
    const { onExpandAll, onCollapseAll } = renderControls({
      ...OVER_ENVELOPE,
      expandAllDisabled: false,
      applications: 34,
    });
    const button = screen.getByTestId<HTMLButtonElement>('expand-all');
    expect(button.disabled).toBe(false);
    expect(button.title).toBe('');
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId('collapse-all'));
    expect(onExpandAll).toHaveBeenCalledOnce();
    expect(onCollapseAll).toHaveBeenCalledOnce();
  });

  it('shows the disabled-Overview notice instead of the controls, whether open or closed', () => {
    const notice =
      'The Overview is disabled for this Catalog: 3,001 Applications and 16,000 Dependencies, above the 3,000-Application limit.';
    for (const expandedState of [true, false]) {
      const { unmount } = render(
        <OverviewControls
          model={{
            ...OVER_ENVELOPE,
            expanded: expandedState,
            overviewDisabled: true,
            notice,
            applications: 3001,
          }}
          attributes={['repository']}
          groupBy="repository"
          onGroupBy={vi.fn()}
          onExpandAll={vi.fn()}
          onCollapseAll={vi.fn()}
        />,
      );
      expect(screen.getByTestId('overview-notice').textContent).toBe(notice);
      expect(screen.queryByTestId('overview-controls')).toBeNull();
      unmount();
    }
  });

  it('hosts the group-by menu, which says so when None falls back to Repository', () => {
    renderControls(
      { ...OVER_ENVELOPE, expandAllDisabled: false },
      { groupBy: 'none', model: { ...OVER_ENVELOPE, expandAllDisabled: false } },
    );
    expect(screen.getByTestId('groupby-fallback')).not.toBeNull();
    expect(screen.getByTestId('groupby-select').getAttribute('data-effective')).toBe('repository');
  });
});

// ---------------------------------------------------------------- the component

/** A layout whose runs the test settles by hand, so progress and cancel are deterministic. */
function stubLayout() {
  const runs: {
    spec: OverviewSpec;
    signal: AbortSignal | undefined;
    settle: (positions: Positions) => void;
    fail: (reason: unknown) => void;
  }[] = [];
  let disposed = 0;
  const layout: OverviewLayout = {
    run(spec, signal) {
      return new Promise<Positions>((resolve, reject) => {
        runs.push({ spec, signal, settle: resolve, fail: reject });
        signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
          once: true,
        });
      });
    },
    dispose() {
      disposed += 1;
    },
  };
  return { layout, runs, disposed: () => disposed };
}

function positionsFor(spec: OverviewSpec): Positions {
  return new Map(spec.nodes.map((node, index) => [node.id, { x: index * 10, y: index * 5 }]));
}

describe('Overview', () => {
  /**
   * The cap notice reaching the screen (docs/performance-budgets.md, "Overview cap"). The model is
   * the demo store's with the two cap fields overridden, because the notice's job here is to be
   * RENDERED -- what the numbers are is `src/state/derived.test.ts`'s assertion, over the real
   * 1,000-Application fixture.
   */
  it('shows the cap notice the model carries, and nothing when there is none', () => {
    const { model } = expanded();
    const capped: OverviewModel = {
      ...model,
      groupDependencies: 1498,
      hiddenGroupDependencies: 798,
      capNotice: 'Showing the heaviest 700 Group Dependencies of 1,498; 798 not drawn',
    };
    const props = { center: null, onToggleGroup: vi.fn(), onSelect: vi.fn() };

    const { layout } = stubLayout();
    const { rerender } = render(<Overview model={capped} {...props} createLayout={() => layout} />);
    expect(screen.getByTestId('overview-cap-notice').textContent).toBe(
      'Showing the heaviest 700 Group Dependencies of 1,498; 798 not drawn',
    );

    rerender(<Overview model={model} {...props} createLayout={() => layout} />);
    expect(screen.queryByTestId('overview-cap-notice')).toBeNull();
    expect(model.capNotice).toBeNull();
  });

  it('shows a progress state with a cancel control until the first layout lands', async () => {
    const { layout, runs } = stubLayout();
    const { model } = expanded();
    render(
      <Overview
        model={model}
        center={null}
        onToggleGroup={vi.fn()}
        onSelect={vi.fn()}
        createLayout={() => layout}
      />,
    );

    expect(screen.getByTestId('overview-progress')).not.toBeNull();
    expect(screen.getByTestId('overview-cancel')).not.toBeNull();
    expect(screen.queryByTestId('overview-canvas')).toBeNull();
    expect(runs).toHaveLength(1);

    runs[0]?.settle(positionsFor(runs[0].spec));
    await waitFor(() => expect(screen.queryByTestId('overview-progress')).toBeNull());
    const canvas = screen.getByTestId('overview-canvas');
    expect(canvas.getAttribute('data-collapsed')).toBe('10');
    expect(canvas.getAttribute('data-positions')).toBe('10');
  });

  it('keeps the previous positions when a run is cancelled, and Retry starts a new one', async () => {
    const { layout, runs } = stubLayout();
    const store = demoStore();
    store.actions.expandOverview(true);
    const first = store.derived.overviewModel.value;
    const onToggleGroup = vi.fn();
    const { rerender } = render(
      <Overview
        model={first}
        center={null}
        onToggleGroup={onToggleGroup}
        onSelect={vi.fn()}
        createLayout={() => layout}
      />,
    );
    runs[0]?.settle(positionsFor(runs[0].spec));
    await waitFor(() => expect(screen.getByTestId('overview-canvas')).not.toBeNull());
    expect(screen.getByTestId('overview-canvas').getAttribute('data-collapsed')).toBe('10');

    // Expand all: a second run starts, and the canvas still shows what the first one produced.
    store.actions.expandAll();
    rerender(
      <Overview
        model={store.derived.overviewModel.value}
        center={null}
        onToggleGroup={onToggleGroup}
        onSelect={vi.fn()}
        createLayout={() => layout}
      />,
    );
    await waitFor(() => expect(runs).toHaveLength(2));
    expect(screen.getByTestId('overview-progress')).not.toBeNull();
    expect(screen.getByTestId('overview-canvas').getAttribute('data-members')).toBe('0');

    fireEvent.click(screen.getByTestId('overview-cancel'));
    await waitFor(() => expect(screen.queryByTestId('overview-progress')).toBeNull());
    expect(runs[1]?.signal?.aborted).toBe(true);
    expect(screen.getByTestId('overview-cancelled').textContent).toContain(CANCELLED_NOTE);
    // The previous positions survived: still ten collapsed Groups and no members drawn.
    expect(screen.getByTestId('overview-canvas').getAttribute('data-collapsed')).toBe('10');
    expect(screen.getByTestId('overview-canvas').getAttribute('data-members')).toBe('0');

    fireEvent.click(screen.getByTestId('overview-retry'));
    await waitFor(() => expect(runs).toHaveLength(3));
    runs[2]?.settle(positionsFor(runs[2].spec));
    await waitFor(() =>
      expect(screen.getByTestId('overview-canvas').getAttribute('data-members')).toBe('34'),
    );
    expect(screen.getByTestId('overview-canvas').getAttribute('data-open')).toBe('10');
  });

  it('opens a collapsed Group, selects a member, and refuses to collapse the Centre’s Group', async () => {
    const { layout, runs } = stubLayout();
    const { model } = expanded((store) => store.actions.select(ORDER_SERVICE));
    const onToggleGroup = vi.fn();
    const onSelect = vi.fn();
    render(
      <Overview
        model={model}
        center={ORDER_SERVICE}
        onToggleGroup={onToggleGroup}
        onSelect={onSelect}
        createLayout={() => layout}
      />,
    );
    runs[0]?.settle(positionsFor(runs[0].spec));
    await waitFor(() => expect(screen.getByTestId('overview-canvas')).not.toBeNull());

    // The Centre's Group opened itself and cannot be closed again while it holds the Centre.
    fireEvent.click(screen.getByTestId(`node-label:${COMMERCE}`));
    expect(onToggleGroup).not.toHaveBeenCalled();

    // Any other Group opens on a click.
    fireEvent.click(screen.getByTestId(`node-group:${PLATFORM_CORE}`));
    expect(onToggleGroup).toHaveBeenCalledExactlyOnceWith(PLATFORM_CORE);

    // A member selects, and the board follows through the shell's own select.
    fireEvent.click(screen.getByTestId(`node-app:${ORDER_SERVICE.id}`));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(ORDER_SERVICE);
  });

  it('reports a layout failure instead of an empty canvas', async () => {
    const { layout, runs } = stubLayout();
    const { model } = expanded();
    render(
      <Overview
        model={model}
        center={null}
        onToggleGroup={vi.fn()}
        onSelect={vi.fn()}
        createLayout={() => layout}
      />,
    );
    runs[0]?.fail(new Error('elk gave up'));
    await waitFor(() => expect(screen.getByTestId('overview-error')).not.toBeNull());
    expect(screen.getByTestId('overview-error').textContent).toContain('elk gave up');
    expect(screen.queryByTestId('overview-canvas')).toBeNull();
    expect(screen.queryByTestId('overview-progress')).toBeNull();
  });

  it('disposes the layout on unmount, so the worker never outlives the Overview', () => {
    const { layout, disposed } = stubLayout();
    const { model } = expanded();
    const { unmount } = render(
      <Overview
        model={model}
        center={null}
        onToggleGroup={vi.fn()}
        onSelect={vi.fn()}
        createLayout={() => layout}
      />,
    );
    expect(disposed()).toBe(0);
    unmount();
    expect(disposed()).toBe(1);
  });
});
