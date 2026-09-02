# Sample Catalogs

Catalogs that conform to [schema v1](../docs/schema-v1.md), plus the scripts that make and check them. Produced by the wayfinder ticket [Build sample catalog and generator](https://github.com/phix/appContextViewer/issues/9). Real Catalogs never enter this repository; these are for docs, demos and tests.

| file | purpose |
|---|---|
| `catalog.example.json` | Minimal worked example linked from the schema doc. 9 Applications. Hand-written. |
| `catalog.demo.json` | Demo Catalog for docs and screenshots. 34 Applications across 10 Repositories; exercises every schema feature (list below). Hand-written. |
| `catalog-200.json`, `catalog-500.json`, `catalog-1000.json` | Performance fixtures emitted by `generate.mjs` with its default arguments. Deterministic: regenerating gives the same bytes. |
| `generate.mjs` | The generator. Node 20+, no dependencies. |
| `check.mjs` | Enforces every rule in `docs/schema-v1.md` (error and warning codes) and prints row counts. Exit 1 on any error. |

All five Catalogs also validate against [`schema/catalog.v1.schema.json`](../schema/catalog.v1.schema.json) with ajv (draft 2020-12, strict mode, formats enabled).

## Row counts

| file | Applications | Repositories | Teams (Applications without one) | Externals | Channels (one-sided) | Dependencies: total = to Applications + to Externals (cross-Repository) | Flows | cycles | largest Blast radius (per Depth) | max Depth | bytes |
|---|---:|---:|---:|---:|---:|---|---:|---|---|---:|---:|
| `catalog.example.json` | 9 | 5 | 5 (0) | 5 | 2 (0) | 13 = 5 + 8 (3) | 6 | none | 3 [2, 1] | 2 | 3,211 |
| `catalog.demo.json` | 34 | 10 | 9 (4) | 19 | 11 (2) | 82 = 38 + 44 (22) | 31 | one of 3 | 12 [5, 6, 1] | 4 | 14,519 |
| `catalog-200.json` | 200 | 20 | 16 (16) | 5 | 20 (0) | 900 = 758 + 142 (355) | 153 | 2 of 2 | 134 [53, 63, 17, 1] | 6 | 75,397 |
| `catalog-500.json` | 500 | 57 | 37 (40) | 13 | 50 (0) | 2,579 = 2,086 + 493 (1,100) | 431 | 5 of 2 | 384 [74, 234, 65, 10, 1] | 8 | 207,285 |
| `catalog-1000.json` | 1,000 | 123 | 74 (67) | 25 | 100 (4) | 5,395 = 4,395 + 1,000 (2,539) | 798 | 10 of 2 | 780 [97, 444, 201, 36, 2] | 9 | 415,910 |

Flows count `publishes` plus `subscribes` entries. A cycle is a strongly connected component of Application Dependencies; "10 of 2" means ten components of two Applications each. Blast radius is the transitive set of Dependents; the bracket is how many Applications join at each Depth. `node samples/check.mjs <file>` prints the full set, including kinds, top Dependents, the most-depended-on Externals, and which Attribute keys qualify for grouping.

Facts worth knowing before setting budgets: the 1,000-Application file is 416 KB; `check.mjs` parses it, enforces every rule and computes the Blast radius of all 1,000 Applications in about 40 ms in Node 24 on an M-series laptop; the largest Blast radius is 78% of the Catalog and reaches Depth 5; the most-depended-on External has 197 direct Dependents, which is why the Overview omits Externals; Repositories, the default grouping, number 123 with the largest holding 50 Applications and 51 holding one.

## What the demo Catalog exercises

- All three relation kinds: `dependsOn` (Dependencies), `publishes` / `subscribes` (Flows through 11 Channels), `team` (Ownership by 9 Teams).
- Cross-Repository references (22 of 38 Application Dependencies) and External references (44, to 19 Externals covering every convention kind plus two non-convention kinds, `search` and `secrets`).
- Repository names with an org prefix (`acme/platform-core`) and without (`legacy-monolith`), so ids split at the last slash in both shapes.
- Sparse records: `acme/tools/doc-site` has only `repository` and `project`; `legacy-monolith/monolith` has no `kind` and no `team`; `acme/commerce/shared-models` and `acme/tools/cli` have no Dependencies and no `attributes`; eight Applications lack `tier` (five with other Attributes, three with none) and form the "No tier" Group.
- A Dependency cycle: `auth-service` → `config-service` → `secrets-broker` → `auth-service`.
- Both `W_EMPTY_CHANNEL` cases: `orders.shipped` has subscribers and no publisher, `fraud.alerts` a publisher and no subscriber.
- Libraries nothing depends on at runtime (`rate-limiter`, `shared-models`) and a non-convention kind (`cli`).
- Attribute values of every scalar type (`tier` numbers, `pci` and `deprecated` booleans, strings) and two non-scalar values that stay display-only (`links` object, `tags` array), so the grouping menu discovers eleven groupable keys and skips two.
- A Team that owns Applications in a Repository it does not own (`growth` inside `acme/platform-core` and `acme/commerce`), and a Dependency chain six hops long from a mobile app to a database.

## Regenerate

```bash
node samples/generate.mjs --apps 200 --out samples/catalog-200.json
node samples/generate.mjs --apps 500 --out samples/catalog-500.json
node samples/generate.mjs --apps 1000 --out samples/catalog-1000.json
node samples/check.mjs samples/catalog-1000.json
```

Options: `--apps N` (default 1000), `--seed S` (1), `--deps MEAN` requested Dependencies per Application (5.5; Applications near the root of the graph get fewer, so 1,000 Applications realize about 5.4), `--out FILE` (stdout when omitted). `check.mjs --json` prints the counts as JSON. A different seed gives a different Catalog with the same shape. The `source` field records the exact arguments.

## The generated model

The generator draws a Catalog the way a company of that size tends to look, from a seeded PRNG (mulberry32) so the output is reproducible.

- **Repositories** are sized by a skewed draw: 40% hold one Application, 25% two to five, 20% six to fifteen, 15% sixteen to fifty. Names combine a domain word and a suffix under `acme/`, `acme-labs/`, or no org prefix (5%).
- **Teams** number one per twelve Applications. Each Repository has a home Team; 85% of its Applications belong to it, 8% to another Team, 7% to none.
- **Kinds**: service 53%, library 12%, job 10%, pipeline 8%, web-app 5%, mobile-app 3%, `cli` 1%, `function` 1%, none 7%. Libraries are cataloged but carry no runtime edges in either direction.
- **Tiers** layer the Dependency graph: 0 clients (web and mobile apps), 1 edges and BFFs, 2 and 3 domain services, 4 platform services, 5 hubs. One Application in fifty is a hub, renamed to a platform-style project such as `auth-service` or `config-service`. Every Dependency runs from a lower rank to a higher one, so the graph is a DAG until the cycle pass.
- **Dependencies** per Application follow an exponential draw around `--deps` (cap 20). Each slot goes 15% to an External, else 60% to a deeper member of the same Repository, else half to a hub and half to an Application one or two tiers deeper chosen by preferential attachment (weight 1 + current Dependents), so most Applications have few Dependents and a handful have a hundred.
- **Cycles**: one per hundred Applications, each a 2- or 3-cycle inside one Repository, closed onto a target with exactly one Dependent so the component stays that small.
- **Externals** number one per forty Applications from a fixed list (databases, caches, queues, storage, SaaS, identity, network, plus non-convention kinds `secrets` and `search`), chosen by preferential attachment so a couple of them dominate.
- **Channels** number one per ten Applications. A quarter of edge-bearing Applications publish one or two, 30% subscribe to one to three, with a Zipf preference for popular Channels; every Channel is then backfilled with a publisher and a subscriber except 5% left one-sided on purpose.
- **Attributes**: 8% of Applications have none; the rest get `language`, mostly `tier` (1 to 4) and `runtime`, sometimes `sla`, `oncall`, `pci`, `deprecated`, a `links` object and a `tags` array (the last two are display-only). 60% get a description, 30% a URL.

## Schema gaps found while building these

None blocked the work. Recorded for the tickets they touch.

1. **Dependencies carry no qualifier.** A producer cannot mark a Dependency as soft or optional, or name its protocol; `notification-service` degrades without `sendgrid` but the Catalog says it breaks. Schema v1 deliberately keeps bare string refs and reserves an object form for v2 (decided in [Define catalog schema v1](https://github.com/phix/appContextViewer/issues/3)). If "soft Dependencies do not count toward Blast radius" ever matters, it is a v2 question.
2. **Externals and Channels have no owner and Channels have no record at all.** An External has no `team`; a Channel exists only as a name inside `publishes` and `subscribes`. When an External or Channel is the selected center ([Decide whether an External or Channel can be the selected center](https://github.com/phix/appContextViewer/issues/17)), the middle card has nothing but an id and a kind to show.
3. **Attribute and Team values have no comparison rule.** `tier: 1` and `tier: "1"`, or `team: "platform"` and `team: "Platform"`, are different Groups today. Nothing says whether grouping and filtering compare values strictly or normalize them. Noted on the map under Not yet specified.
4. **A duplicated entry in `dependsOn`, `publishes` or `subscribes` is `E_INVALID` and stops the load** because the schema declares `uniqueItems`. Producers that merge sources emit duplicates routinely, and the viewer could dedupe with a warning instead. A candidate case for [Decide how validation errors and warnings are surfaced](https://github.com/phix/appContextViewer/issues/12), which also has to cope with the volume of `W_EMPTY_CHANNEL` a real Catalog produces (four at 1,000 Applications here, likely more in the wild).

Smaller notes: the Catalog envelope has no display name, only free-text `source`; the `kind` conventions could list `cli` and `function`, both used here and loading fine as open strings.

These scripts have no `package.json` on purpose. The repository has no build yet; when the Vite project lands they can move under its tooling and the fixtures can feed its tests.

## Invalid fixtures

`invalid/` holds one fixture per code in [`docs/schema-v1.md`](../docs/schema-v1.md), named `<CODE>.json`, plus one that mixes errors and warnings. They feed the tests of `src/catalog`: one test per code, and an agreement test that runs ajv (draft 2020-12, strict mode, `ajv-formats`) and `validateCatalog` over every `.json` file in this directory and in `invalid/`, asserting the same accept or reject verdict from both, with the three downgrades and the four rules the JSON Schema cannot express as the only permitted differences.

| file | what it carries | ajv | viewer |
|---|---|---|---|
| `E_SCHEMA_VERSION.json` | `schemaVersion: 2`, plus an unknown key, a bad `generatedAt` and an unresolved ref that must stay unreported: this code ends checking. | rejects | rejects, one row |
| `E_INVALID.json` | Fourteen schema violations and nothing else: a non-string `source`, an empty `team`, a bare project name and a whitespace-bearing External ref in `dependsOn`, a Channel name with a space, a `repository` with a leading slash, a `project` with a space, an array `attributes`, a missing `repository`, a numeric `kind`, an Application that is a string, an External `id` with a slash, an External without `kind`, a numeric `url`. | rejects | rejects |
| `E_DUPLICATE_APPLICATION.json` | The same `repository` and `project` twice. | accepts | rejects |
| `E_DUPLICATE_EXTERNAL.json` | Two Externals with the id `redis`. | accepts | rejects |
| `E_UNRESOLVED_REF.json` | A ref to an Application not in the Catalog and one to an undeclared External. | accepts | rejects |
| `E_SELF_DEPENDENCY.json` | An Application listing its own id in `dependsOn`. | accepts | rejects |
| `W_UNKNOWN_KEY.json` | An unknown key on the Catalog, two on an Application and one on an External; the returned Catalog drops them. | rejects | loads, 4 warnings |
| `W_DUPLICATE_ENTRY.json` | Duplicates in `dependsOn`, `publishes` and `subscribes`; the returned Catalog keeps the first occurrence of each. | rejects | loads, 3 warnings |
| `W_INVALID_FORMAT.json` | A `generatedAt` that is not RFC 3339 and two `url` values that are not URIs, beside one that is. | rejects | loads, 3 warnings |
| `W_EMPTY_CHANNEL.json` | A Channel with a publisher and no subscriber, and one with two subscribers and no publisher. | accepts | loads, 2 warnings |
| `E_FETCH.json`, `E_TOO_LARGE.json` | Valid Catalogs. The load tests serve them through an injected `fetch` that fails (network error, non-2xx status, cross-origin refusal, an oversize `Content-Length`) and open them as a `File` with `maxBytes` below their size, so the document is refused before it is parsed. | accepts | loads |
| `E_PARSE.json` | Not JSON: a trailing comma on line 4. The only file here that does not parse; the loader reports the line and column. | cannot parse | rejects |
| `mixed.json` | Five errors across four codes (a duplicate Application, a duplicate External, two unresolved refs, a self-dependency) and six warnings across four codes (two unknown keys, a duplicate entry, two bad formats, a one-sided Channel), so a report shows both lists at once. | rejects | rejects |
