/**
 * Search: case-insensitive substring matches over Application ids, External ids, names and kinds,
 * Channel names, Application Teams and scalar Attribute values, with hits typed by kind
 * (application, external, channel). Budget 7 in docs/performance-budgets.md; docs/center.md.
 */
import { type Attributes, compareIds, type Graph, isScalar, type Scalar } from './model';

export type HitKind = 'application' | 'external' | 'channel';

export interface Hit {
  readonly kind: HitKind;
  /** The Application id, External id or Channel name. */
  readonly id: string;
  /** What matched: `id`, `name`, `kind`, `team` or `attributes.<key>`. */
  readonly field: string;
  /** The matched text, in its original case. */
  readonly value: string;
}

interface Term {
  readonly field: string;
  readonly value: string;
  readonly folded: string;
  /** An id or a name: the fields that rank above the rest. */
  readonly primary: boolean;
}

export interface SearchEntry {
  readonly kind: HitKind;
  readonly id: string;
  readonly terms: readonly Term[];
}

export interface SearchIndex {
  readonly entries: readonly SearchEntry[];
}

/** One entry per Application, External and Channel, with every searchable field folded once. */
export function buildSearchIndex(graph: Graph): SearchIndex {
  const entries: SearchEntry[] = [];
  for (const application of graph.applications.values()) {
    const terms: Term[] = [term('id', application.id, true)];
    // Ranked with the id, not below it: when `project` is an APM number the name is the only thing
    // a person can actually type (docs/schema-v1.md, "When the id names nothing").
    if (application.name !== undefined) {
      terms.push(term('name', application.name, true));
    }
    if (application.kind !== undefined) {
      terms.push(term('kind', application.kind, false));
    }
    if (application.team !== undefined) {
      terms.push(term('team', application.team, false));
    }
    addAttributeTerms(application.attributes, terms);
    entries.push({ kind: 'application', id: application.id, terms });
  }
  for (const external of graph.externals.values()) {
    const terms: Term[] = [term('id', external.id, true)];
    if (external.name !== undefined) {
      terms.push(term('name', external.name, true));
    }
    terms.push(term('kind', external.kind, false));
    addAttributeTerms(external.attributes, terms);
    entries.push({ kind: 'external', id: external.id, terms });
  }
  for (const channel of graph.channels.values()) {
    entries.push({ kind: 'channel', id: channel.name, terms: [term('name', channel.name, true)] });
  }
  return { entries };
}

function term(field: string, value: Scalar, primary: boolean): Term {
  const text = String(value);
  return { field, value: text, folded: text.toLowerCase(), primary };
}

function addAttributeTerms(attributes: Attributes, into: Term[]): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (isScalar(value)) {
      into.push(term(`attributes.${key}`, value, false));
    }
  }
}

const KIND_ORDER: Readonly<Record<HitKind, number>> = { application: 0, external: 1, channel: 2 };

/**
 * Hits for a query, best first: an exact id or name, then an id or name starting with the query
 * (at its start or after a slash), then one containing it, then any other field; ties by kind
 * (Applications, Externals, Channels) and id. Blank queries match nothing.
 */
export function search(index: SearchIndex, text: string, limit = 20): Hit[] {
  const query = text.trim().toLowerCase();
  if (query === '' || !(limit > 0)) {
    return [];
  }
  const ranked: { readonly rank: number; readonly hit: Hit }[] = [];
  for (const entry of index.entries) {
    let bestRank = Number.POSITIVE_INFINITY;
    let bestTerm: Term | undefined;
    for (const candidate of entry.terms) {
      if (!candidate.folded.includes(query)) {
        continue;
      }
      const rank = rankOf(candidate, query);
      if (rank < bestRank) {
        bestRank = rank;
        bestTerm = candidate;
      }
      if (rank === 0) {
        break;
      }
    }
    if (bestTerm !== undefined) {
      ranked.push({
        rank: bestRank,
        hit: { kind: entry.kind, id: entry.id, field: bestTerm.field, value: bestTerm.value },
      });
    }
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      KIND_ORDER[a.hit.kind] - KIND_ORDER[b.hit.kind] ||
      compareIds(a.hit.id, b.hit.id),
  );
  return ranked.slice(0, limit).map((entry) => entry.hit);
}

function rankOf(candidate: Term, query: string): number {
  if (!candidate.primary) {
    return 3;
  }
  if (candidate.folded === query) {
    return 0;
  }
  return candidate.folded.startsWith(query) || candidate.folded.includes(`/${query}`) ? 1 : 2;
}
