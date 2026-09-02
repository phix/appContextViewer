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
 * The Groups for one Attribute. Values are compared by their string form (1 and "1" share a
 * Group, "Platform" and "platform" do not); a non-scalar or absent value puts the Application into
 * the "No <attribute>" Group, listed last. Value Groups are ordered numerically when their labels
 * are numbers, then by code unit.
 */
export function groupBy(graph: Graph, attribute: string): Group[] {
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
