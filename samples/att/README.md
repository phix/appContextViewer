# Fictitious AT&T-style Catalog

**Nothing here is real.** The organisations, systems, teams, vendors and identifiers are invented to
exercise the viewer against telecom-shaped data. No AT&T system, identifier or datum appears in this
directory. Every file carries the same notice in its `source` field.

Emitted by [`generate-att.mjs`](./generate-att.mjs). Deterministic — same input, same bytes, no
clock — so regenerating is a no-op in git:

```bash
node samples/att/generate-att.mjs
```

## The three files, and why there are three

| file | bytes | what it is |
|---|---:|---|
| `catalog.att.json` | 124,835 | The Catalog the viewer loads. [Schema v1](../../docs/schema-v1.md) and nothing else. |
| `index.att.json` | 53,062 | id / name / description / ordinal per Application. The lookup that makes an opaque id readable. |
| `details.att.json` | 129,597 | Operational context schema v1 has no home for, keyed by APM id. |

The split exists because of the naming rule. Schema v1 has no `name` key on an Application — the id
*was* the name, back when it read `acme/commerce/order-service`. With `project` reduced to an APM
number the id says nothing, so the readable name has to live somewhere, and the two somewheres the
schema allows are `description` (display only) and `attributes` (scalar, so searchable and
groupable). Both are used. The index then exists for everything that is not the viewer: a human
scanning for a system, or an agent resolving `apm10003` before analysing it.

Load it with `?src=/samples/att/catalog.att.json`.

## Naming

- **Application id** is `repository + "/" + project`, split at the last slash — so
  `ATT-IDP1/network-fault-management/apm10003` is Repository `ATT-IDP1/network-fault-management`,
  Project `apm10003`.
- **Project** is `apm` plus five digits, assigned in file order from `apm10000` to `apm10140`.
  Globally unique across the Catalog, not per Repository.
- **Repository** is `<org>/<repo>`, where org is one of `ATT-IDP1` … `ATT-IDP5`. Each org is one
  delivery portfolio, and its repos are named for the domain they serve.

| org | portfolio | Applications | Repositories |
|---|---|---:|---:|
| `ATT-IDP1` | Network Assurance & OSS | 30 | 6 |
| `ATT-IDP2` | Service Fulfillment & Provisioning | 26 | 6 |
| `ATT-IDP3` | Billing, Rating & Revenue | 26 | 6 |
| `ATT-IDP4` | Customer & Digital Channels | 28 | 6 |
| `ATT-IDP5` | Identity, Security & Shared Platform | 31 | 7 |

## Row counts

141 Applications · 31 Repositories · 16 Teams (1 Application without one) · 32 Externals ·
26 Channels (2 one-sided) · 534 Dependencies = 351 to Applications (254 cross-Repository) + 183 to
Externals · 85 Flows · 2 cycles · largest Blast radius 118 at Depth 2 · max Depth 7.

`node samples/check.mjs samples/att/catalog.att.json` reports **0 errors, 2 warnings**, both
`W_EMPTY_CHANNEL` and both deliberate: `assurance.remediation.attempted` has a publisher and no
subscriber, `partner.settlement.due` the reverse.

## What it exercises

- **Deep chains and real hubs.** The top of the ranking is `apm10133` (Common Logging Library) with
  a Blast radius of **118 of 141**, 84% of the Catalog — the shape a shared library actually has.
  Behind it sit `apm10135` (Telecom Model Library, 101) and the event bus (83).
- **Cross-org Dependencies**: 254 of 351 Application Dependencies cross a Repository, and the
  fulfilment chain runs ATT-IDP4 → ATT-IDP2 → ATT-IDP1 through order, activation and inventory.
- **Cycles**, which the schema allows and the viewer must survive: Secrets Broker ⇄ Certificate
  Manager, and Order State Manager ⇄ Fallout Management Service.
- **Sparse records**: `apm10069` (Proration Calculator) and `apm10135` (Retry Policy Library) carry no `attributes` at
  all; `apm10133` has no
  `team`, `apm10136` has no `kind`.
- **Groupable Attributes** the menu will discover: `org`, `portfolio`, `businessUnit`, `tier`,
  `lifecycle`, `hosting`, `language`, `cpni`, `pci`, `sox`, and `appName`.
- **Externals of every convention kind** plus `search` and `secrets`, weighted the way a telecom
  estate is: the event bus has 57 Dependents, the fulfilment database 22.

## The cost of the naming rule, stated plainly

The ranked table now reads `ATT-IDP5/shared-libraries/apm10133`, not `Common Logging Library`. The
id no longer carries meaning, so **the impact-first view is unreadable without a second lookup** —
which is what `index.att.json` is for, and what `attributes.appName` restores inside the viewer
(search finds "Fault Correlation" and resolves it to `apm10003`; verified against the built app).

Two things follow, neither of them fixed here:

1. **The board and the ranked table still label rows by id.** They could label by
   `attributes.appName` and fall back to the id. That is a product decision, not a data one.
2. **`appName` is a groupable Attribute with 139 distinct values**, so it will appear in the
   group-by menu as a useless grouping. Worth a rule that hides near-unique keys from that menu.
