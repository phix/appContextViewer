# App Context Viewer

A read-only viewer over a Catalog of Applications and the relations between them, used mainly to answer "what breaks if X dies" across hundreds of Applications.

## Language

### Things in the Catalog

**Catalog**:
The complete set of Applications and their relations at one point in time, as one JSON document emitted by a producer outside this project.
_Avoid_: manifest, inventory, dataset, graph, data

**Application**:
Any unit the producer chose to catalog, identified by its Repository and its Project. "App" is acceptable shorthand. Kind (service, library, pipeline, mobile app) is an Attribute, not a separate noun.
_Avoid_: service, component, node, record, entity, project (as the noun for the thing)

**Repository**:
The source repository an Application lives in. One Repository may contain many Applications.
_Avoid_: repo (in prose; fine in code), codebase

**Project**:
The name that distinguishes an Application within its Repository. Only meaningful paired with a Repository.
_Avoid_: name, app name, service name

**Attribute**:
Any field on an Application that is not a relation: team, tier, language, description, and anything free-form the producer adds.
_Avoid_: property, metadata, field (in prose), tag

**External**:
A dependency target declared by the producer that is not an Application in the Catalog: a database, a SaaS product, a managed queue.
_Avoid_: third-party, vendor, resource, infrastructure, unresolved

**Channel**:
A named conduit an Application publishes to or subscribes from. Covers topics, queues, streams, and webhooks alike.
_Avoid_: topic, queue, stream, event, bus

**Team**:
The organizational unit that owns an Application.
_Avoid_: owner, squad, org, group

### Relations

**Dependency**:
A runtime relation: the Application needs the target (an Application or an External) to function. Plural "Dependencies" means everything X needs.
_Avoid_: upstream, uses, consumes, requires

**Dependent**:
An Application that has X as a Dependency. Plural "Dependents" means everything that needs X.
_Avoid_: downstream, consumer, used by (in prose)

**Flow**:
A data-flow relation: an Application publishes to a Channel or subscribes from one. Directional but not a Dependency.
_Avoid_: event, integration, stream

**Ownership**:
The relation between a Team and the Applications it owns.
_Avoid_: assignment, responsibility

### Exploring

**Center**:
The Application or External the impact board and the Neighborhood are computed from. Set by selecting from the ranked table, search, a chip, or a canvas. A Channel is never a Center.
_Avoid_: selection, focus, root, current app

**Blast radius**:
The transitive set of Dependents of an Application or External: everything that breaks, directly or through others, if it dies.
_Avoid_: impact set, affected apps, downstream, transitive dependents

**Neighborhood**:
The Applications, Externals, and Channels within a chosen Depth of the Center, in a chosen direction (Dependencies, Dependents, or both). An External Center has Dependents only.
_Avoid_: subgraph, context, surroundings

**Depth**:
How many relation hops a Neighborhood or Blast radius extends from the selected Application.
_Avoid_: level, radius, hops (in prose)

**Group**:
A set of Applications sharing one value of the current grouping Attribute. Repository is the default grouping. Applications lacking that Attribute form the Group "No <Attribute>". Values are compared by their string form, case-sensitively: `1` and `"1"` are one Group, `platform` and `Platform` are two; numeric-looking values order numerically. In the Overview a Group is either open, showing its members, or collapsed, standing in for them as one unit.
_Avoid_: cluster, compound, folder, namespace, bucket

**Group Dependency**:
The Dependencies between members of two Groups, shown as one relation between the Groups while either is collapsed.
_Avoid_: aggregated edge, meta-edge, bundle, summary edge

**Overview**:
The whole Catalog drawn at once: every Application inside its Group, with the Dependencies between them. Secondary to the Neighborhood, which is where a selected Application is read.
_Avoid_: full graph, global view, big picture, map
