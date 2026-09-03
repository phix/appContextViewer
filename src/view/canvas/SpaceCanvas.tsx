import { useEffect, useRef } from 'preact/hooks';
import type { Center } from '@/state';
import {
  createSpaceScene,
  type SpaceGraph,
  type SpaceScene,
  type SpaceStyle,
} from './space-layout';

export interface SpaceCanvasProps {
  readonly graph: SpaceGraph;
  readonly style: SpaceStyle;
  readonly reducedMotion: boolean;
  readonly onSelect: (center: Center) => void;
}

export function SpaceCanvas({ graph, style, reducedMotion, onSelect }: SpaceCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SpaceScene | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    const container = host.current;
    if (container === null) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    performance.mark('acv:space-entry-start');
    void createSpaceScene({
      container,
      reducedMotion,
      onSelect,
      onSettled: () => {
        container.dataset.settled = 'true';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            performance.measure('acv:space-entry-to-paint', 'acv:space-entry-start');
          }),
        );
      },
    }).then((next) => {
      if (cancelled) {
        next.dispose();
        return;
      }
      scene.current = next;
      next.setStyle(styleRef.current);
      next.setGraph(graph);
      const resize = () => next.resize(container.clientWidth, container.clientHeight);
      resize();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(resize);
        observer.observe(container);
      }
      container.dataset.nodes = String(next.drawn().nodes);
      container.dataset.edges = String(next.drawn().edges);
      container.dataset.reducedMotion = String(reducedMotion);
      (container as HTMLDivElement & { __spaceScene?: SpaceScene }).__spaceScene = next;
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, [graph, onSelect, reducedMotion]);

  useEffect(() => {
    const started = performance.now();
    scene.current?.setStyle(style);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const container = host.current;
        if (container !== null) container.dataset.recolourMs = String(performance.now() - started);
      }),
    );
  }, [style]);

  return (
    <div
      ref={host}
      data-testid="space-canvas"
      role="img"
      aria-label="Three-dimensional Catalog dependency graph"
      style="height: min(70vh, 760px); min-height: 480px; width: 100%; overflow: hidden; border-radius: 0.75rem; background: #0b1020"
    />
  );
}
