/**
 * Thin Cytoscape renderer for the Neighborhood pane. It receives render-ready elements and fixed
 * positions, applies style.ts, and emits interaction callbacks. It knows no graph domain and never
 * calls a layout engine.
 */

import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useRef } from 'preact/hooks';
import { currentHighlight, type Highlight, onHighlight } from '../highlight';
import { canvasStyle } from './style';

export const HOVER_MARK = 'acv:pane-hover-start';
export const HOVER_PAINT_MEASURE = 'acv:pane-hover-to-paint';

export type CanvasNodeKind = 'application' | 'external' | 'group';

export interface CanvasNode {
  readonly id: string;
  readonly sourceId: string;
  readonly label: string;
  readonly kind: CanvasNodeKind;
  readonly parent?: string;
  readonly center?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface CanvasEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface CanvasElements {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
}

export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

export interface CanvasProps {
  readonly elements: CanvasElements;
  readonly positions: ReadonlyMap<string, CanvasPosition>;
  readonly onHover?: (node: { kind: 'application' | 'external'; id: string } | null) => void;
  readonly onSelect: (node: { kind: 'application' | 'external'; id: string }) => void;
  readonly onPainted?: () => void;
}

export function Canvas({ elements, positions, onHover, onSelect, onPainted }: CanvasProps) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mount.current;
    if (container === null) {
      return;
    }

    const definitions: ElementDefinition[] = [
      ...elements.nodes.map((node) => ({
        group: 'nodes' as const,
        data: {
          id: node.id,
          sourceId: node.sourceId,
          label: node.label,
          kind: node.kind,
          center: node.center ? 'true' : 'false',
          parent: node.parent,
          width: node.width ?? (node.kind === 'group' ? 1 : 156),
          height: node.height ?? (node.kind === 'group' ? 1 : 42),
        },
        position: positions.get(node.id),
      })),
      ...elements.edges.map((edge) => ({
        group: 'edges' as const,
        data: { id: edge.id, source: edge.source, target: edge.target },
      })),
    ];

    const cy = cytoscape({
      container,
      elements: definitions,
      style: canvasStyle,
      layout: { name: 'preset', fit: false },
      minZoom: 0.08,
      maxZoom: 3,
      wheelSensitivity: 0.22,
    });
    cy.fit(undefined, 28);
    container.dataset.ready = 'true';
    container.dataset.nodes = String(elements.nodes.filter((node) => node.kind !== 'group').length);
    container.dataset.edges = String(elements.edges.length);
    // Group boxes drawn. Zero is the flat-above-the-Dependency-cap case from the budgets doc's
    // "Pane cap" policy, and this is what lets e2e/pane.spec.ts see that policy from outside.
    container.dataset.groups = String(
      elements.nodes.filter((node) => node.kind === 'group').length,
    );
    (container as HTMLDivElement & { __cy?: Core }).__cy = cy;

    const selectable = (target: cytoscape.NodeSingular) => {
      const kind = target.data('kind');
      if (kind !== 'application' && kind !== 'external') {
        return null;
      }
      return { kind, id: String(target.data('sourceId')) } as const;
    };
    cy.on('mouseover', 'node', (event) => {
      const node = selectable(event.target);
      if (node === null) {
        return;
      }
      performance.mark(HOVER_MARK);
      event.target.addClass('is-hovered');
      event.target.connectedEdges().addClass('is-hovered');
      onHover?.(node);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          performance.measure(HOVER_PAINT_MEASURE, HOVER_MARK);
        });
      });
    });
    cy.on('mouseout', 'node', (event) => {
      if (selectable(event.target) === null) {
        return;
      }
      event.target.removeClass('is-hovered');
      event.target.connectedEdges().removeClass('is-hovered');
      onHover?.(null);
    });
    cy.on('tap', 'node', (event) => {
      const node = selectable(event.target);
      if (node !== null) {
        onSelect(node);
      }
    });

    /*
     * The Highlight (docs/tags.md). Cytoscape paints to a `<canvas>`, so the one injected CSS rule
     * that reaches every DOM row cannot reach a node here; the canvas subscribes instead and styles
     * its own nodes, which the pane's cap holds at 150. This is the only surface whose cost scales
     * with the node count, and it is deliberately the small one.
     *
     * Membership is decided by `sourceId`, not by anything the pane passes in, so the pane component
     * needs no change to take part -- which matters, because another slice owns it.
     */
    const applyHighlight = (highlight: Highlight | null): void => {
      cy.batch(() => {
        cy.elements().removeClass('is-tagged is-dimmed');
        if (highlight === null) {
          container.dataset.tagged = '';
          return;
        }
        const tagged = cy
          .nodes()
          .filter((node) => highlight.members.has(String(node.data('sourceId'))));
        tagged.addClass('is-tagged');
        // Non-members are de-emphasised, never removed: a Highlight is not a filter (CONTEXT.md).
        cy.elements().difference(tagged).addClass('is-dimmed');
        // Read off the very collection that was just styled, so it reports what this canvas DID
        // rather than what it would have done. Recomputing membership here instead let a mutant
        // that styled nothing still publish the right count, and e2e/tags.spec.ts stayed green.
        container.dataset.tagged = String(tagged.length);
      });
    };
    applyHighlight(currentHighlight());
    const unsubscribe = onHighlight(applyHighlight);

    // ONE frame, deliberately. `onPainted` closes budgets 3 and 4, which are LAYOUT budgets: the
    // measure must span layout plus the one paint that puts the pane on screen. A second rAF fence
    // adds a frame of the runner's own compositor cadence to every reading -- a quantity that
    // scales with the display's refresh rate rather than with anything the pane does. Measured on
    // the reference laptop at budget 4's Center, six runs each, median of the warm five: 70.9 ms
    // with one frame against 77.3 ms with two, so the fence was contributing 6.4 ms. That is small
    // here and larger on a slower runner, and either way it is the wrong quantity to put inside a
    // layout budget. Re-measure by restoring the second frame rather than trusting this number.
    const paintFrame = requestAnimationFrame(() => onPainted?.());
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            cy.resize();
          })
        : null;
    observer?.observe(container);
    // Cytoscape caches the container's page offset. The pane is usually created below the fold, so
    // scrolling it into view must refresh that cache even though its dimensions did not change.
    const refreshOffset = () => cy.resize();
    window.addEventListener('scroll', refreshOffset, { passive: true, capture: true });

    return () => {
      unsubscribe();
      cancelAnimationFrame(paintFrame);
      observer?.disconnect();
      window.removeEventListener('scroll', refreshOffset, { capture: true });
      delete (container as HTMLDivElement & { __cy?: Core }).__cy;
      destroy(cy);
    };
  }, [elements, positions, onHover, onPainted, onSelect]);

  return (
    <div
      ref={mount}
      class="canvas"
      data-testid="canvas"
      role="application"
      aria-label="Neighborhood graph"
      style="width:100%;height:min(58vh,620px);min-height:360px;border:1px solid #d8dee9;border-radius:10px;background:#fff"
    />
  );
}

function destroy(cy: Core): void {
  cy.destroy();
}
