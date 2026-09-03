/**
 * Blast radius: the transitive Dependents of an Application or External, banded by Depth
 * (CONTEXT.md; docs/center.md for Externals as Centers). Flows never contribute.
 */
import {
  type ApplicationId,
  applicationOf,
  type Center,
  type CenterRef,
  compareIds,
  dependentsOf,
  type Graph,
  labelOf,
  type NodeKind,
  resolveCenter,
} from './model';

/**
 * Dependents banded by Depth: `bands[0]` is Depth 1, and every Application appears once, at the
 * Depth of its shortest chain of Dependents, so a cycle never revisits a node and the Center is
 * never included. `maxDepth` caps the number of bands (0 gives none).
 */
export function blastRadius(
  graph: Graph,
  center: CenterRef,
  maxDepth: number = Number.POSITIVE_INFINITY,
): ApplicationId[][] {
  return bandsFrom(graph, resolveCenter(graph, center), maxDepth);
}

function bandsFrom(graph: Graph, origin: Center, maxDepth: number): ApplicationId[][] {
  const bands: ApplicationId[][] = [];
  const seen = new Set<ApplicationId>();
  if (origin.kind === 'application') {
    seen.add(origin.id);
  }
  let band: ApplicationId[] = [];
  collectUnseen(dependentsOf(graph, origin), seen, band);
  while (band.length > 0 && bands.length < maxDepth) {
    bands.push(band);
    const next: ApplicationId[] = [];
    for (const id of band) {
      collectUnseen(applicationOf(graph, id).dependents, seen, next);
    }
    band = next;
  }
  return bands;
}

function collectUnseen(
  ids: readonly ApplicationId[],
  seen: Set<ApplicationId>,
  into: ApplicationId[],
): void {
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      into.push(id);
    }
  }
}

/** A row of the default screen: an Application or External with the size of its Blast radius. */
export interface RankedRow {
  readonly kind: NodeKind;
  readonly id: ApplicationId | string;
  /** What to render: `labelOf`, so a table of APM ids still reads. The id stays for identity. */
  readonly label: string;
  readonly size: number;
}

/** Every Application and External, largest Blast radius first, ties broken by id. */
export function rankedByBlastRadius(graph: Graph): RankedRow[] {
  const rows: RankedRow[] = [];
  for (const [id, application] of graph.applications) {
    rows.push({
      kind: 'application',
      id,
      label: labelOf(application),
      size: sizeFrom(graph, { kind: 'application', id }),
    });
  }
  for (const [id, external] of graph.externals) {
    rows.push({
      kind: 'external',
      id,
      label: labelOf(external),
      size: sizeFrom(graph, { kind: 'external', id }),
    });
  }
  return rows.sort((a, b) => b.size - a.size || compareIds(a.id, b.id));
}

function sizeFrom(graph: Graph, origin: Center): number {
  let size = 0;
  for (const band of bandsFrom(graph, origin, Number.POSITIVE_INFINITY)) {
    size += band.length;
  }
  return size;
}
