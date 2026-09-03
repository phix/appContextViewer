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
  `lifecycle`, `hosting`, `language`, `cpni`, `pci`, and `sox`. Ten keys, all of them plausible
  groupings — see the note below on the one that was not.
- **Externals of every convention kind** plus `search` and `secrets`, weighted the way a telecom
  estate is: the event bus has 57 Dependents, the fulfilment database 22.

## The cost of the naming rule, and what it changed in the schema

The ranked table would read `ATT-IDP5/shared-libraries/apm10133`, not `Common Logging Library`: the id
no longer carries meaning, so **the impact-first view is unreadable without a second lookup**. That is
what `index.att.json` is for.

Inside the viewer it is fixed at the source. This fixture is why schema v1 gained an optional
**`name`** on an Application ([`docs/schema-v1.md`](../../docs/schema-v1.md), "When the id names
nothing"): an External always had one, an Application never did, because the id *was* the name. The
viewer labels by `name` and falls back to the id, and searches both, so the table reads
`Common Logging Library` with the id beside it.

**The workaround this replaced is worth recording, because it caused a second defect.** Before `name`
existed, the generator smuggled the readable name into `attributes.appName` — the only place the
schema allowed free-form data that search would reach. It worked, and it produced a **139-value
scalar Attribute over 141 Applications**, which the group-by menu offered as a grouping: 139 Groups
of one. That forced the cardinality rule now in [`docs/tags.md`](../../docs/tags.md) — an Attribute
qualifies as a grouping when it has at least two values and at most half as many values as the
Applications carrying it.

`appName` is gone from this fixture, so **nothing here exercises that rule in the failing direction
any more**; the tests that pin it reconstruct `appName` over these same 141 records, and use
`catalog.demo.json`'s `pci` for the exact boundary. A fixture that fails the rule outright would be
better than a reconstruction.
