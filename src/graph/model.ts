/**
 * The normalized model. `buildGraph` turns a validated Catalog (docs/schema-v1.md) into an
 * immutable `Graph`: Applications and Externals by id, Dependencies and Dependents both ways,
 * Channels with their publishers and subscribers, Teams with their Applications.
 * Vocabulary: CONTEXT.md. Interface: docs/architecture.md, "graph".
 */

export type ApplicationId = string;
export type ExternalId = string;
export type ChannelName = string;
export type TeamName = string;

/** A JSON scalar: the only kind of Attribute value that can drive grouping and search. */
export type Scalar = string | number | boolean;

/** Free-form producer fields, kept whole; non-scalar values are display-only. */
export type Attributes = Readonly<Record<string, unknown>>;

export function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * An Application record as `buildGraph` reads it: schema v1, everything but `repository` and
 * `project` optional. Declared structurally, so the catalog module's validated `Catalog`
 * (issue #20, built in parallel) satisfies it without an import, and so does a schema-v1 document
 * parsed with `JSON.parse`. model.test.ts pins both shapes.
 */
export interface ApplicationInput {
  readonly repository: string;
  readonly project: string;
  /** Human-readable name. Present when `project` is opaque; absent when the id already reads as one. */
  readonly name?: string;
  readonly kind?: string;
  readonly team?: string;
  readonly description?: string;
  readonly url?: string;
  /** Application ids and `external:<id>` refs. */
  readonly dependsOn?: readonly string[];
  readonly publishes?: readonly string[];
  readonly subscribes?: readonly string[];
  readonly attributes?: Attributes;
}

export interface ExternalInput {
  readonly id: string;
  readonly kind: string;
  readonly name?: string;
  readonly description?: string;
  readonly url?: string;
  readonly attributes?: Attributes;
}

/** A validated Catalog's `applications` and `externals`; the envelope's other keys are display-only. */
export interface CatalogInput {
  readonly applications: readonly ApplicationInput[];
  readonly externals?: readonly ExternalInput[];
}

export type NodeKind = 'application' | 'external';

/** A reference to an Application or an External: a Dependency target, and the shape of a Center. */
export interface NodeRef {
  readonly kind: NodeKind;
  readonly id: ApplicationId | ExternalId;
}

/** The Application or External a query is computed from (docs/center.md). A Channel never is. */
export type Center = NodeRef;

/**
 * How a query names its Center: a `Center`, or a bare id of either kind. A bare id is unambiguous
 * because an Application id always contains a slash and an External id never does (schema v1).
 */
export type CenterRef = Center | ApplicationId | ExternalId;

export interface Application {
  readonly id: ApplicationId;
  readonly repository: string;
  readonly project: string;
  /**
   * Human-readable name, when the producer supplied one. `label(application)` is what callers
   * should render: it falls back to the id, so no view needs to know whether this is set.
   */
  readonly name?: string;
  readonly kind?: string;
  readonly team?: TeamName;
  readonly description?: string;
  readonly url?: string;
  readonly attributes: Attributes;
  /** Dependencies in Catalog order, a duplicated entry kept once. */
  readonly dependencies: readonly NodeRef[];
  /** Dependents in the Catalog order of the Applications that declare the Dependency. */
  readonly dependents: readonly ApplicationId[];
  readonly publishes: readonly ChannelName[];
  readonly subscribes: readonly ChannelName[];
}

export interface External {
  readonly id: ExternalId;
  readonly kind: string;
  readonly name?: string;
  readonly description?: string;
  readonly url?: string;
  readonly attributes: Attributes;
  readonly dependents: readonly ApplicationId[];
}

export interface Channel {
  readonly name: ChannelName;
  readonly publishers: readonly ApplicationId[];
  readonly subscribers: readonly ApplicationId[];
}

export interface Team {
  readonly name: TeamName;
  readonly applications: readonly ApplicationId[];
}

/**
 * The normalized Catalog. Never mutated after `buildGraph`: every record and every list is
 * frozen, and the maps are typed read-only (a Map cannot be frozen at runtime).
 */
export interface Graph {
  readonly applications: ReadonlyMap<ApplicationId, Application>;
  readonly externals: ReadonlyMap<ExternalId, External>;
  readonly channels: ReadonlyMap<ChannelName, Channel>;
  readonly teams: ReadonlyMap<TeamName, Team>;
}

const EXTERNAL_REF_PREFIX = 'external:';

interface ApplicationBuilder extends Application {
  dependencies: NodeRef[];
  dependents: ApplicationId[];
  publishes: ChannelName[];
  subscribes: ChannelName[];
}

interface ExternalBuilder extends External {
  dependents: ApplicationId[];
}

interface ChannelBuilder extends Channel {
  publishers: ApplicationId[];
  subscribers: ApplicationId[];
}

interface TeamBuilder extends Team {
  applications: ApplicationId[];
}

/**
 * Builds the Graph from a validated Catalog. The three structural faults a validated Catalog can
 * never carry (a duplicate id, an unresolved ref, a self Dependency) throw rather than being
 * modelled wrongly; a duplicated list entry is kept once, as the validator's `W_DUPLICATE_ENTRY`
 * downgrade does. Adjacency lists follow Catalog order, so every query is deterministic.
 */
/**
 * What to render for a node, so no view has to branch on whether the producer supplied a `name`.
 *
 * An id is only a name by luck. `ATT-IDP4/commerce/order-service` reads as one; the same Application
 * under an APM scheme is `ATT-IDP3/billing-core/apm10064`, which names nothing a reader recognises
 * (docs/schema-v1.md, "When the id names nothing"). So `name` wins where it exists, and the fallback
 * is the narrowest part of the id that still identifies the node: the Project for an Application,
 * which is what a reader scanning one Repository wants, and the id itself for an External.
 *
 * This never returns the full Application id. A caller that wants it has it already — the label is
 * for reading, the id is for identity, and a surface that needs both should show both.
 */
export function labelOf(node: Application | External): string {
  if ('project' in node) {
    return node.name ?? node.project;
  }
  return node.name ?? node.id;
}

export function buildGraph(catalog: CatalogInput): Graph {
  const applications = new Map<ApplicationId, ApplicationBuilder>();
  const externals = new Map<ExternalId, ExternalBuilder>();
  const channels = new Map<ChannelName, ChannelBuilder>();
  const teams = new Map<TeamName, TeamBuilder>();

  for (const input of catalog.externals ?? []) {
    if (externals.has(input.id)) {
      throw new Error(`duplicate External id: ${input.id}`);
    }
    externals.set(input.id, {
      id: input.id,
      kind: input.kind,
      name: input.name,
      description: input.description,
      url: input.url,
      attributes: frozenAttributes(input.attributes),
      dependents: [],
    });
  }

  const pending: [ApplicationInput, ApplicationBuilder][] = [];
  for (const input of catalog.applications) {
    const id = `${input.repository}/${input.project}`;
    if (applications.has(id)) {
      throw new Error(`duplicate Application id: ${id}`);
    }
    const application: ApplicationBuilder = {
      id,
      repository: input.repository,
      project: input.project,
      name: input.name,
      kind: input.kind,
      team: input.team,
      description: input.description,
      url: input.url,
      attributes: frozenAttributes(input.attributes),
      dependencies: [],
      dependents: [],
      publishes: [],
      subscribes: [],
    };
    applications.set(id, application);
    pending.push([input, application]);
  }

  // Relations run in a second pass, once every target exists.
  for (const [input, application] of pending) {
    for (const ref of unique(input.dependsOn)) {
      if (ref.startsWith(EXTERNAL_REF_PREFIX)) {
        const external = externals.get(ref.slice(EXTERNAL_REF_PREFIX.length));
        if (external === undefined) {
          throw new Error(`${application.id} depends on an undeclared External: ${ref}`);
        }
        application.dependencies.push(frozenRef('external', external.id));
        external.dependents.push(application.id);
        continue;
      }
      if (ref === application.id) {
        throw new Error(`${application.id} depends on itself`);
      }
      const target = applications.get(ref);
      if (target === undefined) {
        throw new Error(`${application.id} depends on an unknown Application: ${ref}`);
      }
      application.dependencies.push(frozenRef('application', ref));
      target.dependents.push(application.id);
    }
    for (const name of unique(input.publishes)) {
      application.publishes.push(name);
      channelOf(channels, name).publishers.push(application.id);
    }
    for (const name of unique(input.subscribes)) {
      application.subscribes.push(name);
      channelOf(channels, name).subscribers.push(application.id);
    }
    if (application.team !== undefined) {
      const team = teams.get(application.team) ?? { name: application.team, applications: [] };
      teams.set(application.team, team);
      team.applications.push(application.id);
    }
  }

  for (const application of applications.values()) {
    Object.freeze(application.dependencies);
    Object.freeze(application.dependents);
    Object.freeze(application.publishes);
    Object.freeze(application.subscribes);
    Object.freeze(application);
  }
  for (const external of externals.values()) {
    Object.freeze(external.dependents);
    Object.freeze(external);
  }
  for (const channel of channels.values()) {
    Object.freeze(channel.publishers);
    Object.freeze(channel.subscribers);
    Object.freeze(channel);
  }
  for (const team of teams.values()) {
    Object.freeze(team.applications);
    Object.freeze(team);
  }
  return Object.freeze({ applications, externals, channels, teams });
}

function unique(entries: readonly string[] | undefined): readonly string[] {
  return entries === undefined ? [] : [...new Set(entries)];
}

/**
 * A private, deeply frozen copy of a record's Attributes, so nested values (`links`, `tags`) are
 * neither shared with the caller's Catalog nor writable through the Graph.
 */
function frozenAttributes(attributes: Attributes | undefined): Attributes {
  return deepFreeze(structuredClone(attributes ?? {}));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function frozenRef(kind: NodeKind, id: string): NodeRef {
  const ref: NodeRef = { kind, id };
  return Object.freeze(ref);
}

function channelOf(channels: Map<ChannelName, ChannelBuilder>, name: ChannelName): ChannelBuilder {
  const existing = channels.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const channel: ChannelBuilder = { name, publishers: [], subscribers: [] };
  channels.set(name, channel);
  return channel;
}

// ---------------------------------------------------------------- shared by the queries

/** Resolves a `CenterRef` to a `Center` that exists in the Graph, or throws naming the id. */
export function resolveCenter(graph: Graph, ref: CenterRef): Center {
  if (typeof ref === 'string') {
    if (graph.applications.has(ref)) {
      return { kind: 'application', id: ref };
    }
    if (graph.externals.has(ref)) {
      return { kind: 'external', id: ref };
    }
    throw new Error(`unknown Center: ${ref}`);
  }
  const known =
    ref.kind === 'application' ? graph.applications.has(ref.id) : graph.externals.has(ref.id);
  if (!known) {
    throw new Error(`unknown ${ref.kind} Center: ${ref.id}`);
  }
  return { kind: ref.kind, id: ref.id };
}

export function applicationOf(graph: Graph, id: ApplicationId): Application {
  const application = graph.applications.get(id);
  if (application === undefined) {
    throw new Error(`unknown Application: ${id}`);
  }
  return application;
}

export function externalOf(graph: Graph, id: ExternalId): External {
  const external = graph.externals.get(id);
  if (external === undefined) {
    throw new Error(`unknown External: ${id}`);
  }
  return external;
}

export function dependentsOf(graph: Graph, center: Center): readonly ApplicationId[] {
  return center.kind === 'application'
    ? applicationOf(graph, center.id).dependents
    : externalOf(graph, center.id).dependents;
}

/** Code-unit order: deterministic in every runtime, unlike a locale-aware comparison. */
export function compareIds(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
