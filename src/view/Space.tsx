import { useEffect, useMemo, useState } from 'preact/hooks';
import { type Graph, groupBy as groupsFor, labelOf, neighborhood } from '@/graph';
import type { Center } from '@/state';
import { SpaceCanvas } from './canvas/SpaceCanvas';
import type { SpaceEdge, SpaceGraph, SpaceNode, SpaceStyle } from './canvas/space-layout';
import { currentHighlight, type Highlight, onHighlight } from './highlight';

const PALETTE = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185'];

export interface SpaceProps {
  readonly graph: Graph;
  readonly center: Center | null;
  readonly depth: number;
  readonly grouping: string;
  readonly onSelect: (center: Center) => void;
}

export function spaceGraphOf(graph: Graph): SpaceGraph {
  const nodes: SpaceNode[] = [];
  const edges: SpaceEdge[] = [];
  for (const application of graph.applications.values()) {
    nodes.push({
      id: `application:${application.id}`,
      sourceId: application.id,
      kind: 'application',
      label: labelOf(application),
      group: '',
    });
    for (const dependency of application.dependencies) {
      const target =
        dependency.kind === 'application'
          ? `application:${dependency.id}`
          : `external:${dependency.id}`;
      edges.push({
        id: `${application.id}->${dependency.kind}:${dependency.id}`,
        source: `application:${application.id}`,
        target,
      });
    }
  }
  for (const external of graph.externals.values()) {
    nodes.push({
      id: `external:${external.id}`,
      sourceId: external.id,
      kind: 'external',
      label: labelOf(external),
      group: '',
    });
  }
  return { nodes, edges };
}

function colour(group: string, alpha: number): string {
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) | 0;
  const hex = PALETTE[Math.abs(hash) % PALETTE.length];
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function spaceStyleOf(
  graph: Graph,
  center: Center | null,
  depth: number,
  grouping: string,
  highlight: Highlight | null,
): SpaceStyle {
  const groups = new Map<string, string>();
  for (const group of groupsFor(graph, grouping))
    for (const id of group.members) groups.set(id, group.id);
  const emphasized = new Set<string>();
  if (center !== null) {
    const found = neighborhood(graph, center, { depth, direction: 'both' });
    for (const member of found.applications) emphasized.add(member.id);
    for (const member of found.externals) emphasized.add(member.id);
  }
  const active = (node: SpaceNode) => highlight === null || highlight.members.has(node.sourceId);
  const near = (node: SpaceNode) => center === null || emphasized.has(node.sourceId);
  return {
    nodeColour: (node) =>
      colour(
        node.kind === 'external' ? 'external' : (groups.get(node.sourceId) ?? grouping),
        active(node) && near(node) ? 1 : 0.16,
      ),
    nodeSize: (node) =>
      center?.kind === node.kind && center.id === node.sourceId
        ? 12
        : near(node) && active(node)
          ? 4
          : 0.7,
    linkColour: () =>
      highlight === null && center === null ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.06)',
  };
}

export function Space({ graph, center, depth, grouping, onSelect }: SpaceProps) {
  const topology = useMemo(() => spaceGraphOf(graph), [graph]);
  const [highlight, setHighlight] = useState<Highlight | null>(() => currentHighlight());
  // Read synchronously at mount, not in an effect: `SpaceCanvas` re-creates its whole scene (a
  // fresh engine chunk boot, a fresh simulation) whenever `reducedMotion` changes, because it is one
  // of that effect's deps. Starting at a hard-coded `false` and correcting it in a post-mount effect
  // meant every reduced-motion visitor briefly got the WRONG value, then a second real render tore
  // the just-created scene down and rebuilt it -- a needless double engine boot on every load for
  // exactly the visitors this setting exists for, and the actual cause of a click-selection e2e test
  // landing on a scene that was mid-recreation (space.spec.ts).
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => onHighlight(setHighlight), []);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const style = useMemo(
    () => spaceStyleOf(graph, center, depth, grouping, highlight),
    [center, depth, graph, grouping, highlight],
  );

  return (
    <section aria-label="Space" data-testid="space">
      <h2>Space</h2>
      <p>Orbit, pan or zoom to inspect the Catalog’s shape. Select a node to make it the Center.</p>
      <SpaceCanvas
        graph={topology}
        style={style}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
      />
    </section>
  );
}
