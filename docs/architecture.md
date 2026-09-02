# Architecture

Reference for the build tickets. The decision and its reasons are [ADR 0002](./adr/0002-module-architecture.md); this page holds the interfaces, the target file tree, the test strategy and the import rules. Vocabulary: [`CONTEXT.md`](../CONTEXT.md). Budgets: [`performance-budgets.md`](./performance-budgets.md). Validation surface: [`validation-surfacing.md`](./validation-surfacing.md).

## Stack

Vite (`base: './'`), TypeScript strict, Preact with `@preact/signals`, Cytoscape with `cytoscape-dagre` and `elkjs` (worker build), Vitest, Playwright, Biome for lint and format, npm, Node 24. The sample Catalog is imported into the bundle, not fetched. `index.html` carries a classic inline script that detects `file:` and renders a one-line "open the hosted URL" message.

## Modules and their interfaces

Each module is a folder with an `index.ts` that is its whole interface. Callers and tests import only from the index. A module's interface is everything a caller must know: signature, invariants, error modes, performance.

### `catalog`: from a source to a validated Catalog

```ts
loadCatalog(source: File | string, deps?: { fetch?: typeof fetch; maxBytes?: number }): Promise<LoadResult>
validateCatalog(document: unknown): ValidationResult

type Finding = { code: string; path: string; id?: string; message: string; value?: unknown }
type ValidationResult = { catalog?: Catalog; errors: Finding[]; warnings: Finding[] }
type LoadResult = ValidationResult & { source: { kind: 'file' | 'url'; name: string } }
```

Invariants: `catalog` is present exactly when `errors` is empty; every rule runs and every finding is collected (cap 1,000) before returning; `E_SCHEMA_VERSION` short-circuits the schema and semantic rules; load-stage codes (`E_FETCH` naming CORS, `E_TOO_LARGE` at 50 MB, `E_PARSE` with line and column) come alone. Downgrades (`W_UNKNOWN_KEY`, `W_DUPLICATE_ENTRY`, `W_INVALID_FORMAT`) are applied here, and duplicates are removed from the returned Catalog. `validateCatalog` is pure; `loadCatalog` takes its `fetch` as a parameter so tests inject one. Performance: budget 1 covers this plus `buildGraph` plus all Blast radii.

### `graph`: the normalized model and every query

```ts
buildGraph(catalog: Catalog): Graph                       // immutable; ids, adjacency both ways, Channels, Teams
blastRadius(graph, center: Id | ExternalId, maxDepth?: number): Id[][]   // Dependents banded by Depth, cycles handled; an External works the same
rankedByBlastRadius(graph): { id: Id; size: number }[]      // the default screen's rows
neighborhood(graph, id, opts: { depth: number; direction: 'dependencies' | 'dependents' | 'both' }): Neighborhood
paneNeighborhood(graph, id, depth: number, cap?: number): Neighborhood & { depthShown: number; hidden: number }
groupableAttributes(graph): string[]                        // Repository, Team, Kind, then scalar attribute keys
groupBy(graph, attribute: string): Group[]                  // includes the synthetic "No <Attribute>" Group, last
groupDependencies(graph, groups: Group[], open: ReadonlySet<GroupId>): GroupEdge[]
buildSearchIndex(graph): SearchIndex
search(index: SearchIndex, text: string, limit?: number): Hit[]
```

Invariants: `Graph` is never mutated after build; `paneNeighborhood` returns the largest Depth at or below the one asked whose node count (Applications plus Externals) fits the cap, default 150; Flows never contribute to a Blast radius; a Team is never a node. Performance: the whole module is pure and is where budgets 1 and 7 are asserted, in Node, on `samples/catalog-1000.json`. This module contains the domain; nothing outside it traverses the graph.

### `layout`: positions from a node and edge list

```ts
layoutNeighborhood(spec: LayoutSpec): Positions                                  // dagre, synchronous; throws on failure
createOverviewLayout(): { run(spec: OverviewSpec, signal?: AbortSignal): Promise<Positions>; dispose(): void }
type Positions = Map<Id, { x: number; y: number }>
```

Two adapters behind one seam: `dagre` for the pane and `elk` for the Overview, the latter created through Vite's `?worker` import in the browser and called directly in Node tests. The fallback chain (dagre, then elk, then breadthfirst) lives here. Nothing in this module knows about Cytoscape; positions are plain data, which is what keeps it testable in Node. Budgets 3, 4, 9, 10 and 11 are measured through it, in the browser, with the animation constant applied by the view.

### `state`: one store, derived view models, a URL seam

```ts
store: { source, catalog, graph, selection, depth, groupBy, openGroups, overviewExpanded, report }  // signals
actions: load(source), select(id), setDepth(n), setGroupBy(attribute), toggleGroup(id), expandAll(), collapseAll(), expandOverview(bool), closeReport()
derived: ranked, board (Needs and Breaks bands), paneModel, overviewModel, warningsCount                 // computed signals
url: readUrl(): Partial<ViewState>; writeUrl(state: ViewState): void                                   // seam; contents decided by the URL-state ticket
```

Invariants: `load` never replaces `catalog` until the new one validates; `select` repaints the board before any layout runs (budgets 5 and 6); the pane and Overview layouts are requested from derived models, never from components. Signals are plain values in Node, so the store is unit-tested without a DOM.

### `view`: Preact components that render view models

`Header`, `Picker`, `RankedTable`, `ImpactBoard`, `NeighborhoodPane`, `Overview`, `Report`, and under `view/canvas/` the two components that import Cytoscape: `Canvas` (the pane) and `OverviewCanvas` (compound Groups, collapse and expand, Group Dependencies). Components take view models from `state` and call actions; they contain no graph traversal and no layout calls. The ranked table renders its first 100 rows and the rest on scroll.

### `app`

`main.tsx` mounts the shell, imports the sample Catalog, applies `?src=` and the URL seam.

## Target file tree

```
appContextViewer/
├── index.html                      root mount, file:// guard (classic inline script)
├── package.json                    npm scripts: dev, build, preview, test, test:e2e, lint, check
├── vite.config.ts                  base './', preact preset, '@/' alias, worker format 'es'
├── vitest.config.ts                projects: node (catalog, graph, layout, state), jsdom (view)
├── playwright.config.ts            webServer: vite preview; BUDGET_FACTOR=2 on CI
├── biome.json                      lint + format, import restrictions
├── tsconfig.json
├── THIRD-PARTY-NOTICES.md          elkjs under EPL-2.0 and every bundled licence
├── src/
│   ├── app/            main.tsx, App.tsx
│   ├── catalog/        index.ts, types.ts, load.ts, validate.ts, *.test.ts
│   ├── graph/          index.ts, model.ts, blast.ts, neighborhood.ts, grouping.ts, search.ts, *.test.ts, *.perf.test.ts
│   ├── layout/         index.ts, dagre.ts, elk.ts, elk.worker.ts, breadthfirst.ts, *.test.ts
│   ├── state/          index.ts, store.ts, derived.ts, url.ts, *.test.ts
│   └── view/           Header.tsx, Picker.tsx, RankedTable.tsx, ImpactBoard.tsx, NeighborhoodPane.tsx,
│                       Overview.tsx, Report.tsx, canvas/{Canvas.tsx, OverviewCanvas.tsx, style.ts}, *.test.tsx
├── e2e/                load.spec.ts, budgets.spec.ts, canvas.spec.ts, file-guard.spec.ts
├── samples/            existing Catalogs and scripts, plus invalid/ (one fixture per code)
├── schema/             catalog.v1.schema.json (producer contract, used by the agreement test)
└── docs/               this page, ADRs, budgets, validation surface, research
```

## Test strategy

| layer | runner | what it proves | fixtures |
|---|---|---|---|
| `catalog`, `graph`, `layout` (dagre, elk direct), `state` | Vitest, Node | every rule and query through the module index; budgets 1 and 7 as `*.perf.test.ts` with `BUDGET_FACTOR` | `samples/*.json`, `samples/invalid/*.json` |
| schema agreement | Vitest, Node | ajv (dev dependency) and `validateCatalog` accept and reject the same fixtures, with the three documented downgrades as the only differences | all of `samples/` |
| `view` except canvas | Vitest, jsdom, Testing Library for Preact | components render fixed view models and dispatch actions; the report renders the 1,000-row cap | view models built from the demo Catalog |
| canvas, load path, budgets 2 to 11, file:// guard | Playwright against `vite preview` | real Cytoscape and Worker; timings from `performance.mark` read through `page.evaluate`; the guard renders from disk | `samples/catalog-1000.json` served statically, `samples/catalog.demo.json` for behaviour |

Rules: tests cross the same seam callers do (no imports past a module's index); every schema code has a fixture and a test; every budget row has exactly one assertion, in the runner the budgets doc names; CI runs both runners with `BUDGET_FACTOR=2`.

## Import rules, enforced by lint

- `catalog`, `graph` and `state` import nothing from `view`, `layout`, `preact` or `cytoscape`.
- `layout` imports `@dagrejs/dagre` and `elkjs`, nothing from `view` or `cytoscape`.
- `cytoscape` is imported only under `view/canvas/`.
- Everything imports a module through its `index.ts`, never a deeper path.
- `elkjs` is never patched or forked (ADR 0001); a CI licence allowlist covers MIT, ISC, BSD, Apache-2.0 and EPL-2.0 for elkjs alone.

## Seams left open on purpose

- `state/url.ts`: contents decided by [Decide URL state and deep links](https://github.com/phix/appContextViewer/issues/16).
- The selection type is decided: a `Center` of `{ kind: 'application' | 'external', id }` (see [`center.md`](./center.md)); `graph` queries accept either kind, `rankedByBlastRadius` returns both, the search index covers Applications, Externals and Channels, and the Channel card is transient view state.
- Private Catalog loading: `loadCatalog` takes `fetch` as a parameter, so a token-bearing fetch from [Decide whether the viewer may hold a GitHub token for private Catalogs](https://github.com/phix/appContextViewer/issues/15) plugs in without touching the validator.
