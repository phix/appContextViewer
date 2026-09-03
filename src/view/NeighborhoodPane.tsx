/**
 * Turns the render-ready PaneModel into Cytoscape elements and a plain layout spec. Layout is
 * deferred until after the impact board's paint opportunity; Canvas only receives the result.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type LayoutSpec, layoutWithFallback, type Positions } from '@/layout';
import type { Center, PaneModel } from '@/state';
import { Canvas, type CanvasElements } from './canvas/Canvas';

export const PANE_LAYOUT_MARK = 'acv:pane-layout-start';
export const PANE_PAINT_MARK = 'acv:pane-painted';
export const PANE_PAINT_MEASURE = 'acv:pane-layout-to-paint';

const NODE_WIDTH = 156;
const NODE_HEIGHT = 42;
const CENTER_WIDTH = 176;
const CENTER_HEIGHT = 48;

export interface NeighborhoodPaneProps {
  readonly model: PaneModel;
  readonly onSelect: (center: Center) => void;
  readonly onExpandOverview: () => void;
}

export function NeighborhoodPane({ model, onSelect, onExpandOverview }: NeighborhoodPaneProps) {
  const render = useMemo(() => paneRenderOf(model), [model]);
  const [layout, setLayout] = useState<{ positions: Positions; engine: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const run = ++sequence.current;
    setLayout(null);
    setError(null);
    // The board's own paint marker uses two frames. Queue pane work after those frames and then a
    // task, so selection and Depth changes can commit the board before dagre uses the main thread.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          performance.mark(PANE_LAYOUT_MARK);
          void layoutWithFallback(render.spec).then(
            (result) => {
              if (sequence.current === run) {
                setLayout({ positions: result.positions, engine: result.engine });
              }
            },
            (reason) => {
              if (sequence.current === run) {
                setError(reason instanceof Error ? reason.message : String(reason));
              }
            },
          );
        }, 0);
      });
    });
    return () => {
      sequence.current++;
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [render]);

  const painted = () => {
    performance.mark(PANE_PAINT_MARK);
    performance.measure(PANE_PAINT_MEASURE, PANE_LAYOUT_MARK, PANE_PAINT_MARK);
  };

  return (
    <section class="neighborhood" data-testid="neighborhood-pane" aria-label="Neighborhood">
      <header class="neighborhood__header">
        <h2>Neighborhood</h2>
        {layout === null ? (
          <span data-testid="pane-progress" role="status">
            Laying out…
          </span>
        ) : (
          <span data-testid="pane-engine">Layout: {layout.engine}</span>
        )}
      </header>

      {model.notice === null ? null : (
        <p class="neighborhood__notice" data-testid="pane-notice">
          {noticeParts(model.notice, onExpandOverview)}
        </p>
      )}

      {error === null ? null : (
        <p role="alert" data-testid="pane-error">
          The Neighborhood could not be laid out: {error}
        </p>
      )}

      {layout === null ? null : (
        <Canvas
          elements={render.elements}
          positions={layout.positions}
          onSelect={onSelect}
          onPainted={painted}
        />
      )}
    </section>
  );
}

function noticeParts(notice: string, onExpandOverview: () => void) {
  const marker = 'Overview';
  const index = notice.indexOf(marker);
  if (index < 0) {
    return notice;
  }
  return (
    <>
      {notice.slice(0, index)}
      <button type="button" data-testid="pane-overview-link" onClick={onExpandOverview}>
        {marker}
      </button>
      {notice.slice(index + marker.length)}
    </>
  );
}

export function paneRenderOf(model: PaneModel): {
  elements: CanvasElements;
  spec: LayoutSpec;
} {
  const idOf = (kind: 'application' | 'external', id: string) => `${kind}:${id}`;
  const groupIdOf = (id: string) => `group:${id}`;
  const centerId = idOf(model.center.kind, model.center.id);
  const nodes = model.nodes.map((node) => {
    const id = idOf(node.kind, node.id);
    return {
      id,
      sourceId: node.id,
      label: node.label,
      kind: node.kind,
      parent: node.group === undefined ? undefined : groupIdOf(node.group),
      center: id === centerId,
      width: id === centerId ? CENTER_WIDTH : NODE_WIDTH,
      height: id === centerId ? CENTER_HEIGHT : NODE_HEIGHT,
    } as const;
  });
  const groups = model.groups.map((group) => ({
    id: groupIdOf(group.id),
    sourceId: group.id,
    label: group.label,
    kind: 'group' as const,
  }));
  const edges = model.dependencies.map((edge, index) => ({
    id: `dependency:${index}`,
    source: idOf('application', edge.from),
    target: idOf(edge.to.kind, edge.to.id),
  }));
  const parents = new Map<string, string>();
  for (const node of nodes) {
    if (node.parent !== undefined) {
      parents.set(node.id, node.parent);
    }
  }
  return {
    elements: { nodes: [...nodes, ...groups], edges },
    spec: {
      nodes: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
      parents,
    },
  };
}
