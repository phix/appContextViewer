/**
 * Grouping, per the map's grouping decision (issue #7) and docs/url-state.md: the groupable
 * Attributes, the Groups for one of them with the synthetic "No <Attribute>" Group last, and the
 * Group Dependencies the Overview draws between collapsed Groups.
 */
import {
  type Application,
  type ApplicationId,
  applicationOf,
  compareIds,
  type Graph,
  isScalar,
  type Scalar,
} from './model';

/** The grouping keys that read an Application's own fields; every other key reads `attributes`. */
export const BUILT_IN_ATTRIBUTES = ['repository', 'team', 'kind'] as const;

export type GroupId = string;

export interface Group {
  /** Stable within one grouping: `<attribute>=<label>` for a value, `<attribute>` alone for the missing Group. */
  readonly id: GroupId;
  readonly attribute: string;
  /** The value's string form, or `No <attribute>`. */
  readonly label: string;
  /** True for the synthetic Group of Applications lacking the Attribute. */
  readonly missing: boolean;
  /** Sorted by id. */
  readonly members: readonly ApplicationId[];
}

/**
 * An edge of the Overview: a Group Dependency between two Groups while either is collapsed, with
 * the count of Dependencies it stands for, or a member-level Dependency when both ends are open.
 */
export type GroupEdge =
  | { readonly kind: 'group'; readonly from: GroupId; readonly to: GroupId; readonly count: number }
  | { readonly kind: 'member'; readonly from: ApplicationId; readonly to: ApplicationId };

/**
 * Repository, Team, Kind, then every `attributes` key whose values are all scalar wherever
 * present, sorted by name. A key that collides with a built-in name is dropped: the built-in wins.
 */
export function groupableAttributes(graph: Graph): string[] {
  const allScalar = new Map<string, boolean>();
  for (const application of graph.applications.values()) {
    for (const [key, value] of Object.entries(application.attributes)) {
      if (!isScalar(value)) {
        allScalar.set(key, false);
      } else if (!allScalar.has(key)) {
        allScalar.set(key, true);
      }
    }
  }
  const builtIn: readonly string[] = BUILT_IN_ATTRIBUTES;
  const keys: string[] = [];
  for (const [key, scalar] of allScalar) {
    if (scalar && !builtIn.includes(key)) {
      keys.push(key);
    }
  }
  return [...builtIn, ...keys.sort(compareIds)];
}

/**
 * The Groups for one Attribute, which must be one `groupableAttributes` lists; any other key
 * throws naming it, as `resolveCenter` does for an unknown Center, so a bad `#group=` value can
 * never render as one all-member Group (the state slice maps invalid values to the default first).
 * Values are compared by their string form (1 and "1" share a Group, "Platform" and "platform" do
 * not); an absent value puts the Application into the "No <attribute>" Group, listed last. Value
 * Groups are ordered numerically when their labels are numbers, then by code unit.
 */
export function groupBy(graph: Graph, attribute: string): Group[] {
  if (!groupableAttributes(graph).includes(attribute)) {
    throw new Error(`not a groupable Attribute: ${attribute}`);
  }
  const byLabel = new Map<string, ApplicationId[]>();
  const missing: ApplicationId[] = [];
  for (const application of graph.applications.values()) {
    const value = groupingValue(application, attribute);
    if (!isScalar(value)) {
      missing.push(application.id);
      continue;
    }
    const label = String(value);
    const members = byLabel.get(label);
    if (members === undefined) {
      byLabel.set(label, [application.id]);
    } else {
      members.push(application.id);
    }
  }
  const groups: Group[] = [];
  for (const [label, members] of byLabel) {
    groups.push({
      id: `${attribute}=${label}`,
      attribute,
      label,
      missing: false,
      members: members.sort(compareIds),
    });
  }
  groups.sort((a, b) => compareLabels(a.label, b.label));
  if (missing.length > 0) {
    groups.push({
      id: attribute,
      attribute,
      label: `No ${attribute}`,
      missing: true,
      members: missing.sort(compareIds),
    });
  }
  return groups;
}

function groupingValue(application: Application, attribute: string): unknown {
  switch (attribute) {
    case 'repository':
      return application.repository;
    case 'team':
      return application.team;
    case 'kind':
      return application.kind;
    default:
      return application.attributes[attribute];
  }
}

function compareLabels(a: string, b: string): number {
  const aNumber = canonicalNumber(a);
  const bNumber = canonicalNumber(b);
  if (aNumber !== undefined && bNumber !== undefined) {
    return aNumber - bNumber;
  }
  if (aNumber !== undefined) {
    return -1;
  }
  if (bNumber !== undefined) {
    return 1;
  }
  return compareIds(a, b);
}

/** The number a label denotes when it is one in canonical form (so "10" is, "010" is not). */
function canonicalNumber(label: string): number | undefined {
  const value = Number(label);
  return label !== '' && Number.isFinite(value) && String(value) === label ? value : undefined;
}

interface GroupDependency {
  readonly kind: 'group';
  readonly from: GroupId;
  readonly to: GroupId;
  count: number;
}

/**
 * The edges the Overview draws for `groups` given the open set: Dependencies between members of
 * two Groups aggregate into one Group Dependency per ordered pair while either Group is collapsed;
 * a collapsed Group hides its intra-Group Dependencies; open Groups show member-level edges among
 * themselves and inside. Dependencies on Externals, and on Applications outside `groups`, are not
 * drawn. Group Dependencies come first, in first-encounter order, then member edges.
 */
export function groupDependencies(
  graph: Graph,
  groups: readonly Group[],
  open: ReadonlySet<GroupId>,
): GroupEdge[] {
  const groupOf = new Map<ApplicationId, Group>();
  for (const group of groups) {
    for (const id of group.members) {
      groupOf.set(id, group);
    }
  }
  const aggregated = new Map<GroupId, Map<GroupId, GroupDependency>>();
  const memberEdges: GroupEdge[] = [];
  for (const group of groups) {
    const groupOpen = open.has(group.id);
    for (const id of group.members) {
      for (const target of applicationOf(graph, id).dependencies) {
        if (target.kind !== 'application') {
          continue;
        }
        const other = groupOf.get(target.id);
        if (other === undefined) {
          continue;
        }
        if (other === group) {
          if (groupOpen) {
            memberEdges.push({ kind: 'member', from: id, to: target.id });
          }
          continue;
        }
        if (groupOpen && open.has(other.id)) {
          memberEdges.push({ kind: 'member', from: id, to: target.id });
          continue;
        }
        let outgoing = aggregated.get(group.id);
        if (outgoing === undefined) {
          outgoing = new Map();
          aggregated.set(group.id, outgoing);
        }
        const edge = outgoing.get(other.id);
        if (edge === undefined) {
          outgoing.set(other.id, { kind: 'group', from: group.id, to: other.id, count: 1 });
        } else {
          edge.count += 1;
        }
      }
    }
  }
  const edges: GroupEdge[] = [];
  for (const outgoing of aggregated.values()) {
    for (const edge of outgoing.values()) {
      edges.push(edge);
    }
  }
  return edges.concat(memberEdges);
}

// ---------------------------------------------------------------- N7: the cardinality rule

/**
 * docs/tags.md, "The cardinality rule (item N7)": `samples/att/` once carried an Attribute with 139
 * values over 141 Applications, and the group-by menu offered it — 139 Groups of one, which is not
 * a grouping. An Attribute qualifies when it has at least two values and at most half as many
 * values as the Applications carrying it, so every Group averages at least this many members.
 *
 * The threshold is a judgement, written down once here rather than per surface. This is a queryable
 * predicate on purpose: the group-by menu and a Tag both ask it, and neither owns it. Note what it
 * deliberately does NOT do — it does not stop `groupBy` from grouping by a disqualified Attribute.
 * A Tag for one still names a real set and still Highlights (docs/tags.md); it just cannot become
 * the grouping Attribute.
 */
export const MIN_APPLICATIONS_PER_VALUE = 2;

export interface AttributeCardinality {
  readonly attribute: string;
  /** Applications carrying a scalar value for it; the ones in "No <Attribute>" count for neither side. */
  readonly applications: number;
  /** Distinct values by string form, the same comparison `groupBy` groups by. */
  readonly values: number;
}

/** How many Applications carry `attribute`, and how many distinct values they carry between them. */
export function attributeCardinality(graph: Graph, attribute: string): AttributeCardinality {
  const values = new Set<string>();
  let applications = 0;
  for (const application of graph.applications.values()) {
    const value = groupingValue(application, attribute);
    if (isScalar(value)) {
      applications++;
      values.add(String(value));
    }
  }
  return { attribute, applications, values: values.size };
}

/** Whether `attribute` may become the grouping Attribute. A key that is not groupable never can. */
export function qualifiesAsGrouping(graph: Graph, attribute: string): boolean {
  if (!groupableAttributes(graph).includes(attribute)) {
    return false;
  }
  const { applications, values } = attributeCardinality(graph, attribute);
  return values >= 2 && values * MIN_APPLICATIONS_PER_VALUE <= applications;
}

/** `groupableAttributes` minus the ones the cardinality rule disqualifies, in the same order. */
export function groupingAttributes(graph: Graph): string[] {
  return groupableAttributes(graph).filter((attribute) => qualifiesAsGrouping(graph, attribute));
}

// ---------------------------------------------------------------- the Tag index

/**
 * A Tag's stable token: the Group id (`<attribute>=<value>`) percent-encoded, which is what makes it
 * usable as ONE word of a `data-groups` attribute and therefore reachable by a single
 * `[data-groups~="<token>"]` CSS rule (docs/tags.md, constraint 1 — budget 8 is held by one DOM
 * write, not one per row). Encoding is not decoration: Team values contain spaces, and a space would
 * split one token into two words and match the wrong rows. The output is limited to unreserved
 * characters and `%`, so it never contains whitespace, a quote or a backslash.
 */
export function tagToken(attribute: string, value: Scalar): string {
  // Each half is encoded separately and then joined by a literal `=`. Encoding the joined string
  // instead makes `a` + `b=c` and `a=b` + `c` the same token, which grouping.test.ts pins.
  return `${encodeURIComponent(attribute)}=${encodeURIComponent(String(value))}`;
}

export interface TagIndex {
  /** Node id to its space-separated token list, ready to become one `data-groups` attribute. */
  readonly tokens: ReadonlyMap<string, string>;
  /** Token to the Applications and Externals carrying that Attribute value. */
  readonly members: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Every Tag in the Catalog, built once per Graph. Applications contribute Repository, Team, Kind and
 * every scalar `attributes` key; Externals contribute their kind and their own scalar attributes, so
 * an "External · cache" Tag names the caches. Kind is one namespace across both, because a Tag names
 * an Attribute VALUE and `kind=cache` is the same value whoever carries it — note this is wider than
 * `groupBy`, which draws Groups of Applications alone.
 */
export function buildTagIndex(graph: Graph): TagIndex {
  const tokens = new Map<string, string>();
  const members = new Map<string, Set<string>>();

  const add = (id: string, into: string[], attribute: string, value: unknown): void => {
    if (!isScalar(value)) {
      return;
    }
    const token = tagToken(attribute, value);
    into.push(token);
    const carrying = members.get(token);
    if (carrying === undefined) {
      members.set(token, new Set([id]));
    } else {
      carrying.add(id);
    }
  };

  for (const application of graph.applications.values()) {
    const own: string[] = [];
    add(application.id, own, 'repository', application.repository);
    add(application.id, own, 'team', application.team);
    add(application.id, own, 'kind', application.kind);
    for (const [key, value] of Object.entries(application.attributes)) {
      if (!BUILT_IN_ATTRIBUTES.includes(key as (typeof BUILT_IN_ATTRIBUTES)[number])) {
        add(application.id, own, key, value);
      }
    }
    tokens.set(application.id, own.join(' '));
  }

  for (const external of graph.externals.values()) {
    const own: string[] = [];
    add(external.id, own, 'kind', external.kind);
    for (const [key, value] of Object.entries(external.attributes)) {
      if (!BUILT_IN_ATTRIBUTES.includes(key as (typeof BUILT_IN_ATTRIBUTES)[number])) {
        add(external.id, own, key, value);
      }
    }
    tokens.set(external.id, own.join(' '));
  }

  return { tokens, members };
}

/**
 * The Overview's Group-Dependency cap (docs/performance-budgets.md, "Overview cap"). elk's cost is
 * superlinear in *edges*, and the collapsed 1,000-Application Overview hands it 1,498 Group
 * Dependencies over 123 Group nodes -- twelve edges per node. The cap is not a performance trade:
 * drawing all of them costs 2.3 s to produce a hairball no reader can follow, so keeping the
 * heaviest 700 and naming the rest in a notice makes the Overview MORE legible, exactly as the pane
 * cap already does. It would be worth having even if budget 9 had held.
 *
 * 700 and not 800, and the doc records why at length: the curve the first ruling read 800 off was
 * measured on an ARBITRARY subset of the edges, while the rule it adopted keeps the HEAVIEST ones.
 * Those are different inputs -- heaviest-first concentrates edges on hub Groups and elk costs more
 * for the same count (764 ms at 800 heaviest against 702 ms at 800 first-encountered), so at 800 the
 * elk half alone was over the whole 750 ms budget before a pixel was painted.
 */
export const OVERVIEW_DEPENDENCY_CAP = 700;

/** What `capGroupDependencies` drew, and the two numbers the Overview's cap notice has to name. */
export interface CappedGroupEdges {
  /** At most `cap` Group Dependencies, heaviest first, then every member edge unchanged. */
  readonly edges: readonly GroupEdge[];
  /** Group Dependencies before the cap. */
  readonly total: number;
  /** Group Dependencies not drawn: `total - cap`, or 0 when everything fits. */
  readonly hidden: number;
}

/**
 * Keeps the `cap` heaviest Group Dependencies by the count each stands for and drops the rest.
 * Ties keep first-encounter order, because `Array.prototype.sort` is stable, so the same Catalog
 * and open set always draw the same edges rather than a different arbitrary 700 each run.
 *
 * Member edges are NOT Group Dependencies and are never capped: they exist only between members of
 * open Groups, and Expand all's 4,395 of them are budget 11's input, not budget 9's.
 */
export function capGroupDependencies(
  edges: readonly GroupEdge[],
  cap: number = OVERVIEW_DEPENDENCY_CAP,
): CappedGroupEdges {
  const groupEdges: Extract<GroupEdge, { kind: 'group' }>[] = [];
  const memberEdges: GroupEdge[] = [];
  for (const edge of edges) {
    if (edge.kind === 'group') {
      groupEdges.push(edge);
    } else {
      memberEdges.push(edge);
    }
  }
  const total = groupEdges.length;
  if (total <= cap) {
    return { edges, total, hidden: 0 };
  }
  const heaviest = groupEdges.slice().sort((a, b) => b.count - a.count);
  heaviest.length = cap;
  return { edges: [...heaviest, ...memberEdges], total, hidden: total - cap };
}
