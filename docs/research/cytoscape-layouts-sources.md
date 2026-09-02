# Cytoscape.js layout candidates — primary-source comparison

Researched 2026-09-02 against primary sources only: official READMEs and source on GitHub, the
Cytoscape.js docs source (`documentation/md/*.md`, rendered at js.cytoscape.org), the npm registry
(`registry.npmjs.org`), the jsDelivr package-file API (`data.jsdelivr.com`), and the Eclipse ELK
reference. No blog posts. Every claim carries its URL; direct quotes are in quotation marks.

Candidates: core `breadthfirst`, core `cose`, `cytoscape-dagre` (+ `@dagrejs/dagre`),
`cytoscape-elk` (+ `elkjs`), `cytoscape-fcose` (+ `cose-base` + `layout-base`), `cytoscape-cola` (+ `webcola`).

Host library at time of research: `cytoscape@3.34.2`, published 2026-08-25, MIT
(https://registry.npmjs.org/cytoscape). Its `dist/cytoscape.min.js` is 435,503 B (425.3 KiB; 133.3 KiB gzip)
(https://data.jsdelivr.com/v1/package/npm/cytoscape@3.34.2/flat).

## Method notes

- Sizes: files downloaded from `https://cdn.jsdelivr.net/npm/<pkg>@<ver>/<file>`; byte counts cross-checked
  against `https://data.jsdelivr.com/v1/package/npm/<pkg>@<ver>/flat`; gzip = `gzip -9` on the same file.
  KiB = 1024 bytes. "Minified?" was judged from the file (line count / average line length / build config).
- Versions, publish dates and licenses: `https://registry.npmjs.org/<pkg>` (`dist-tags.latest`, `time[version]`,
  `versions[version].license`).
- Peer resolution: the extension's own `dependencies` range, resolved against the registry's version list.
- Sync/async: read from the extension's `run()` source; the Cytoscape.js core doc for `layout.run()` defines the
  vocabulary: "If the layout is asynchronous (i.e. continuous), then calling `layout.run()` simply starts the
  layout. Synchronous (i.e. discrete) layouts finish before `layout.run()` returns."
  (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layout/run.md, rendered at
  https://js.cytoscape.org/#layouts/layout-manipulation/layout.run). Every layout below ends by calling core
  `layoutPositions()`, which emits `layoutready`/`layoutstop` — synchronously when `animate` is off, or after
  `Promise.all(animations)` when `animate` is on (https://github.com/cytoscape/cytoscape.js/blob/v3.34.2/src/collection/layout.mjs
  lines 104-177). Callers wait with `layout.promiseOn('layoutstop')` (alias `layout.pon`) or the `stop` callback
  (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layout/promiseOn.md,
  https://js.cytoscape.org/#layouts/layout-events/layout.promiseOn).

## Comparison table

| Candidate | Compound (parent/child) support | Sync / async | Label-dimension option | Extension dist size | Peer dist size | Total (raw / gzip) | Latest version + publish date | License |
|---|---|---|---|---|---|---|---|---|
| core `breadthfirst` | **No grouping.** Layout runs on `eles.nodes().filter(n => n.isChildless())`; parents excluded from BFS and neighbour scoring; parents' bounds inferred afterwards by core. No option. | Synchronous (discrete). `animate` only transitions to the final positions. | `nodeDimensionsIncludeLabels: false` — exists | 0 (in core) | — | 0 extra | in `cytoscape@3.34.2`, 2026-08-25 | MIT |
| core `cose` | **Yes, automatic.** "it has additional logic to support compound graphs well"; `nestingFactor`, `isCompound: cy.hasCompoundNodes()`. No switch. | `animate:true` (default) → async rAF loop; `animate:false` → synchronous; `animate:'end'` → sync compute + end animation. `layout.stop()` works. | `nodeDimensionsIncludeLabels: false` — exists | 0 (in core) | — | 0 extra | in `cytoscape@3.34.2`, 2026-08-25 | MIT |
| `cytoscape-dagre` + `@dagrejs/dagre` | **Yes, automatic.** Builds `graphlib.Graph({ compound: true })` and calls `g.setParent()` for every child; edges touching a parent are re-targeted to the first leaf child (`getDagreNode`, added in 4.0.1). No option. | Synchronous (`dagre.layout(g)` then `layoutPositions`). | `nodeDimensionsIncludeLabels: false` — exists | `dist/cytoscape-dagre.min.js` 45,649 B = **44.6 KiB** (15.2 KiB gz), minified; dagre **bundled** | none needed (bundled). Standalone `@dagrejs/dagre@3.1.1 dist/dagre.min.js` = 47.8 KiB (16.7 gz) for reference | **44.6 KiB / 15.2 KiB** | `4.0.1`, 2026-08-28 (peer `@dagrejs/dagre@3.1.1`, 2026-08-08) | MIT (both) |
| `cytoscape-elk` + `elkjs` | **Yes, via ELK hierarchy.** Extension nests children into ELK `children` arrays; all edges put at root. ELK option `'elk.hierarchyHandling': 'INCLUDE_CHILDREN'` needed for cross-hierarchy edges (default `INHERIT` → `SEPARATE_CHILDREN`). | Asynchronous (Promise: `elk.layout(graph).then(...)`). `stop()` is a no-op. No Web Worker (`new ELK()` without `workerUrl`) — compute runs on main thread. | `nodeDimensionsIncludeLabels: false` — exists | `dist/cytoscape-elk.js` 11,301 B = **11.0 KiB** (3.7 KiB gz), **not minified** (`minimize:false`); elkjs external | `elkjs@0.9.3 lib/elk.bundled.js` 1,606,238 B = **1,568.6 KiB** (456.1 KiB gz), minified (`^0.9.3` resolves to 0.9.3; latest 0.12.0 is 1,572.0 KiB / 455.8 gz) | **1,579.6 KiB / 459.8 KiB** | `2.3.0`, 2024-11-26 (dep `elkjs@0.9.3`, 2024-04-16; elkjs latest `0.12.0`, 2026-07-17) | MIT (ext); elkjs `EPL-2.0 OR GPL-3.0-or-later` |
| `cytoscape-fcose` + `cose-base` + `layout-base` | **Yes, native.** "its full support for compound graphs"; `nestingFactor`, `gravityCompound`, `gravityRangeCompound`, `tile`. No switch. | Synchronous compute (no timers/promises in `run()`); `animate:true` (default) animates to end positions. | `nodeDimensionsIncludeLabels: false` — exists, but README: "Valid in \"proof\" quality" | `cytoscape-fcose.js` 57,239 B = **55.9 KiB** (13.1 KiB gz), **not minified**; cose-base external | `cose-base@2.2.0 cose-base.js` 118,906 B = 116.1 KiB (21.9 gz) + `layout-base@2.0.1 layout-base.js` 147,958 B = 144.5 KiB (32.8 gz), both **not minified** | **316.5 KiB / 67.8 KiB** (unminified) | `2.2.0`, 2023-01-17 (deps `cose-base@2.2.0` 2023-01-17, `layout-base@2.0.1` 2021-06-25) | MIT (all) |
| `cytoscape-cola` + `webcola` | **Yes, automatic.** "It supports noncompound and compound graphs well."; parents become WebCola `groups` (leaves + nested groups, padding from parent CSS `padding` + `nodeSpacing`). Edges touching a parent node are dropped from the simulation. | Continuous simulation. `animate:true` (default) → async rAF ticks, capped by `maxSimulationTime` (4000 ms); `animate:false` → synchronous `while(!tick())` inside `run()` (timer cannot pre-empt it). | `nodeDimensionsIncludeLabels: false` — exists | `cytoscape-cola.js` 21,866 B = **21.4 KiB** (6.0 KiB gz), **not minified**; webcola external | `webcola@3.4.0 WebCola/cola.min.js` 79,814 B = **77.9 KiB** (22.2 KiB gz), minified | **99.3 KiB / 28.2 KiB** | `2.5.1`, 2022-02-23 (dep `webcola@3.4.0`, 2019-05-10) | MIT (both) |

Size sources: https://data.jsdelivr.com/v1/package/npm/cytoscape-dagre@4.0.1/flat,
https://data.jsdelivr.com/v1/package/npm/@dagrejs/dagre@3.1.1/flat, https://data.jsdelivr.com/v1/package/npm/cytoscape-elk@2.3.0/flat,
https://data.jsdelivr.com/v1/package/npm/elkjs@0.9.3/flat, https://data.jsdelivr.com/v1/package/npm/elkjs@0.12.0/flat,
https://data.jsdelivr.com/v1/package/npm/cytoscape-fcose@2.2.0/flat, https://data.jsdelivr.com/v1/package/npm/cose-base@2.2.0/flat,
https://data.jsdelivr.com/v1/package/npm/layout-base@2.0.1/flat, https://data.jsdelivr.com/v1/package/npm/cytoscape-cola@2.5.1/flat,
https://data.jsdelivr.com/v1/package/npm/webcola@3.4.0/flat. Gzip figures are my own `gzip -9` measurements of the same files.

---

## Core docs: which built-ins support compound nodes, and `breadthfirst`

- The Layouts intro (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layout/intro.md,
  rendered at https://js.cytoscape.org/#layouts) makes **no** per-layout statement about compound support. The
  rendered option blocks on js.cytoscape.org are generated verbatim from each layout's `defaults = {...}` object in
  `src/extensions/layout/<name>.mjs` (https://github.com/cytoscape/cytoscape.js/blob/unstable/documentation/docmaker.mjs
  lines 259-262), so the source files cited below *are* the docs' option lists.
- The only built-in whose doc text mentions compound graphs is `cose`: "The `cose` (Compound Spring Embedder)
  layout uses a physics simulation to lay out graphs. It works well with noncompound graphs and it has additional
  logic to support compound graphs well." (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layouts/cose.md,
  https://js.cytoscape.org/#layouts/cose).
- `breadthfirst` doc text: "The `breadthfirst` layout puts nodes in a hierarchy, based on a breadthfirst traversal
  of the graph. It is best suited to trees and forests in its default downward direction, and it is best suited to
  DAGs in its circle mode." — nothing about compound nodes
  (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layouts/breadthfirst.md,
  https://js.cytoscape.org/#layouts/breadthfirst).
- General compound rule that governs every layout: "A compound parent node does not have independent dimensions
  (position and size), as those values are automatically inferred by the positions and dimensions of the descendant
  nodes." (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/notation.md,
  https://js.cytoscape.org/#notation/compound-nodes). Core `layoutPositions()` accordingly positions only
  `this.nodes().filter(n => !n.isParent())` (https://github.com/cytoscape/cytoscape.js/blob/v3.34.2/src/collection/layout.mjs line 42).
- Maintainer statement on the issue tracker (2014, not docs): "The breadthfirst layout isn't designed to work with
  compound nodes. Have you tried `cose`?" (https://github.com/cytoscape/cytoscape.js/issues/420#issuecomment-33564064
  area; issue https://github.com/cytoscape/cytoscape.js/issues/420, comment by maxkfranz 2014-01-29).
- `node.layoutDimensions(options)` is the shared primitive that every extension uses to honour
  `nodeDimensionsIncludeLabels` (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/collection/layoutDimensions.md,
  https://js.cytoscape.org/#node.layoutDimensions). Note the doc's example says "default true" for the function
  argument, while every layout's own default is `false`.

---

## Per-candidate notes

### 1. core `breadthfirst` (cytoscape@3.34.2)

Source: https://github.com/cytoscape/cytoscape.js/blob/v3.34.2/src/extensions/layout/breadthfirst.mjs

1. **Compound.** `const nodes = eles.nodes().filter( n => n.isChildless() );` (line 46); BFS visit adds
   "only childless nodes" (lines 113-114, 125-126); neighbour scoring skips `neighbor.isParent()` (line 243).
   Parents therefore never get a depth; they are sized/positioned afterwards by core from their children. There is
   no option to change this. Consequence (inference from the code, not a documented statement): children are placed
   by BFS depth with no regard to which parent they belong to, so a parent's inferred box can span several ranks.
2. **Sync.** Discrete: computes depths then `eles.nodes().layoutPositions( this, options, getPosition)` (line 403).
   Finishes before `run()` returns unless `animate: true`, in which case `layoutstop` fires after the transition.
3. **Labels.** `nodeDimensionsIncludeLabels: false, // Excludes the label when calculating node bounding boxes for
   the layout algorithm` (line 16); used via `node.boundingBox({ includeLabels: options.nodeDimensionsIncludeLabels })` (line 339).
4. **Size.** In core; no extra bytes.
5. **Version.** cytoscape 3.34.2, 2026-08-25, MIT (https://registry.npmjs.org/cytoscape).
6. **DAG/tree options** (lines 7-31): `directed: false, // whether the tree is directed downwards (or edges can point in
   any direction if false)`; `direction: 'downward', // ... 'downward', 'upward', 'rightward', or 'leftward'`;
   `circle: false, // put depths in concentric circles if true, put depths top down if false`; `grid: false`;
   `spacingFactor: 1.75`; `avoidOverlap: true`; `roots`; `depthSort`. Deprecated `maximal` / `acyclic`:
   `maximal: false, // whether to shift nodes down their natural BFS depths in order to avoid upwards edges (DAGS only)`.
   No rank-separation option (spacing is derived from average node size × `spacingFactor`), no edge routing.
   **Cycles:** BFS tolerates them, but the maximal-shift pass bails with `util.warn('Detected double maximal shift
   for node ... Bailing maximal adjustment due to cycle. Use `options.maximal: true` only on DAGs.')` (line 208).
7. **Performance / limitations.** No documented guidance. Limitation is item 1.

### 2. core `cose` (cytoscape@3.34.2)

Source: https://github.com/cytoscape/cytoscape.js/blob/v3.34.2/src/extensions/layout/cose.mjs

1. **Compound.** Doc: "It works well with noncompound graphs and it has additional logic to support compound graphs
   well." (https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/layouts/cose.md). Source:
   `isCompound: cy.hasCompoundNodes()` (line 287); `nestingFactor: 1.2` scales ideal edge length by nesting depth
   (`idealLength *= depth * options.nestingFactor`, line 446); compound bounds tracked during iteration (lines 1089-1208).
   Automatic; no enabling option.
2. **Sync/async.** From the defaults comments (lines 27-31): `animate: true` = "Animate continuously as the layout is
   running", `false` = "Just show the end result", `'end'` = "Animate with the end result, from the initial positions
   to the end positions". Implementation: `animate === true` drives `util.requestAnimationFrame(frame)` with
   `refresh: 20` iterations per frame (lines 207-232) → asynchronous; otherwise `while( loopRet ){ loopRet = mainLoop(i) }`
   runs all `numIter` synchronously then emits `layoutstop` (lines 237-246, 190-195). `layout.stop()` sets
   `stopped = true` (line 252).
3. **Labels.** `nodeDimensionsIncludeLabels: false` with comment "Excludes the label when calculating node bounding
   boxes for the layout algorithm" (lines 61-62).
4. **Size.** In core.
5. **Version.** As above.
6. **DAG/tree options.** None — force-directed; no rank direction, no edge routing. Cycles irrelevant.
7. **Performance.** Doc: "The `cose` layout is very fast and produces good results." and points at `cose-bilkent` as
   "more computationally expensive but produces near-perfect results" (cose.md). Knobs: `numIter: 1000`,
   `animationThreshold: 250` ("The layout animates only after this many milliseconds for animate:true"),
   `componentSpacing: 40, // Extra spacing between components in non-compound graphs`.

### 3. `cytoscape-dagre` 4.0.1 (+ `@dagrejs/dagre` 3.1.1, bundled)

README: https://github.com/cytoscape/cytoscape.js-dagre/blob/master/README.md (identical text in the npm README,
https://registry.npmjs.org/cytoscape-dagre). Source: https://github.com/cytoscape/cytoscape.js-dagre/blob/master/src/layout.mjs,
defaults https://github.com/cytoscape/cytoscape.js-dagre/blob/master/src/defaults.mjs,
build https://github.com/cytoscape/cytoscape.js-dagre/blob/master/rollup.config.mjs.

1. **Compound.** README has no sentence about compound nodes. Source: the graph is created as
   `new dagre.graphlib.Graph({ multigraph: true, compound: true })`, then `// set compound parents ...
   if( node.isChild() ){ g.setParent( node.id(), node.parent().id() ); }`. Edges are registered on
   `getDagreNode(edge.source())` / `getDagreNode(edge.target())` — a helper that "Recursively find[s] the first leaf
   child inside the compound parent" — with the comment "Resolve source and target to non-parent leaf nodes if
   needed". That helper came from PR #178 "Fix edge handling for compound parent nodes (#153)"
   (https://github.com/cytoscape/cytoscape.js-dagre/pull/178, merged 2026-07-27, in 4.0.1): "Previously,
   layout.mjs filtered out all edges connected to compound parent nodes ... This caused edges connected to parent
   nodes to be omitted from Dagre layout calculations, leaving target child nodes unranked (at Rank 0)." Original
   report: https://github.com/cytoscape/cytoscape.js-dagre/issues/153. Dagre itself handles clusters through its
   nesting graph: "A nesting graph creates dummy nodes for the tops and bottoms of subgraphs, adds appropriate edges
   to ensure that all cluster nodes are placed between these boundaries, and ensures that the graph is connected."
   ... "The nesting graph idea comes from Sander, \"Layout of Compound Directed Graphs.\""
   (https://github.com/dagrejs/dagre/blob/master/lib/nesting-graph.ts). graphlib documents the primitive:
   "**compound**: set to `true` to allow a graph to have compound nodes - nodes which can be the parent of other
   nodes." and `graph.setParent(v, parent)` (https://github.com/dagrejs/graphlib/wiki/API-Reference). Dagre 3.x also
   lays out clusters "with their own rankdir" (https://github.com/dagrejs/dagre/blob/master/lib/layout.ts line 63),
   but cytoscape-dagre does not expose a per-parent `rankdir`.
2. **Sync.** `dagre.layout( g );` then `nodes.layoutPositions(layout, options, ...)` — synchronous, discrete.
3. **Labels.** README/defaults: `nodeDimensionsIncludeLabels: false, // whether labels should be included in
   determining the space used by a node`; applied through `node.layoutDimensions( options )`.
4. **Size.** README: "Dagre v3 is bundled into the distributed extension files" and "Dagre v3 is bundled into
   `dist/cytoscape-dagre.js`, so you do not need to include a separate dagre script." `package.json` 4.0.1 has no
   `dependencies` (only `peerDependencies: { cytoscape: "^3.2.22" }`; `@dagrejs/dagre` is a devDependency)
   (https://registry.npmjs.org/cytoscape-dagre). Rollup builds UMD + ESM, plain and terser-minified
   (rollup.config.mjs). Files: `dist/cytoscape-dagre.min.js` 45,649 B, `dist/cytoscape-dagre.js` 57,231 B,
   `dist/cytoscape-dagre.min.mjs` 45,423 B, `dist/cytoscape-dagre.mjs` 55,866 B
   (https://data.jsdelivr.com/v1/package/npm/cytoscape-dagre@4.0.1/flat). Reference peers: `@dagrejs/dagre@3.1.1
   dist/dagre.min.js` 48,956 B (https://data.jsdelivr.com/v1/package/npm/@dagrejs/dagre@3.1.1/flat); legacy
   `dagre@0.8.5 dist/dagre.min.js` 283,803 B (bundles lodash+graphlib;
   https://data.jsdelivr.com/v1/package/npm/dagre@0.8.5/flat) — the legacy package is what cytoscape-dagre ≤2.5.0
   depended on (`dagre: ^0.8.5`). Dagre README: "There are 2 versions on NPM, but only the one in the DagreJs org is
   receiving updates right now." (https://github.com/dagrejs/dagre/blob/master/README.md).
5. **Version.** cytoscape-dagre 4.0.1, 2026-08-28, MIT (https://registry.npmjs.org/cytoscape-dagre); history 2.5.0
   (2022-10-31) → 3.0.0 (2026-05-15) → 4.0.0 (2026-06-04) → 4.0.1. `@dagrejs/dagre` 3.1.1, 2026-08-08, MIT
   (https://registry.npmjs.org/@dagrejs%2Fdagre); legacy `dagre` 0.8.5, 2019-12-03, MIT (https://registry.npmjs.org/dagre).
6. **DAG/tree options** (README "API" block): `rankDir: undefined, // 'TB' for top to bottom flow, 'LR' for left to
   right`; `rankSep: undefined, // the separation between each rank in the layout`; `nodeSep`, `edgeSep`;
   `align: ... 'UL', 'UR', 'DL', or 'DR'`; `ranker: ... 'network-simplex', 'tight-tree' or 'longest-path'`;
   `minLen`, `edgeWeight` ("higher weight edges are generally made shorter and straighter"); `spacingFactor`;
   `sort`. Dagre's own defaults: `ranksep: 50, edgesep: 20, nodesep: 50, rankdir: "TB"`
   (https://github.com/dagrejs/dagre/blob/master/lib/layout.ts line 409; wiki table
   https://github.com/dagrejs/dagre/wiki#configuring-the-layout). **Edge routing:** `useDagreEdgeControlPoints:
   false` — "When `useDagreEdgeControlPoints` is `true` the layout algoritm maps Dagre's edge control points to
   Cytoscape edge coordinates." using `curve-style: 'unbundled-bezier'` (README). **Cycles:** README:
   `acyclicer: undefined, // If set to 'greedy', uses a greedy heuristic for finding a feedback arc set for a
   graph.`; dagre always removes cycles before ranking — `acyclicer === "greedy" ? greedyFAS(...) : dfsFAS(...)`
   and reverses the chosen edges (https://github.com/dagrejs/dagre/blob/master/lib/acyclic.ts lines 9-18). README:
   "The `dagre` layout organises the graph using a DAG (directed acyclic graph) system ... It is especially suitable
   for DAGs and trees."
7. **Performance / limitations.** Dagre wiki design priority: "**Speed**. Dagre must be able to draw medium sized
   graphs quickly, potentially at the cost of not being able to adopt more optimal or exact algorithms."
   (https://github.com/dagrejs/dagre/wiki#design-priorities). Extension limitation from source: an edge whose
   endpoint is a compound parent is ranked as if it ended at that parent's *first* leaf child.

### 4. `cytoscape-elk` 2.3.0 (+ `elkjs` 0.9.3)

README: https://github.com/cytoscape/cytoscape.js-elk/blob/master/README.md. Source:
https://github.com/cytoscape/cytoscape.js-elk/blob/master/src/layout.js, defaults
https://github.com/cytoscape/cytoscape.js-elk/blob/master/src/defaults.js, build
https://github.com/cytoscape/cytoscape.js-elk/blob/master/webpack.config.js.

1. **Compound.** README has no sentence about compound nodes. Source `makeGraph`: "// make hierarchy" — a child
   node is pushed into `parentK.children` instead of `graph.children`; parents get no `width`/`height`
   (`if (!node.isParent()) {...}` in `makeNode`); all edges are placed at the root with the comment "// put all edges
   in the top level for now // TODO does this cause issues in certain edgecases?". Only non-parents receive
   positions: `nodes.filter((n) => !n.isParent()).layoutPositions(...)`, and child positions are converted from
   ELK's parent-relative top-left to Cytoscape absolute centres in `getPos`. The ELK-side switch is
   `org.eclipse.elk.hierarchyHandling`: "Determines whether separate layout runs are triggered for different
   compound nodes in a hierarchical graph. Setting a node's hierarchy handling to INCLUDE_CHILDREN will lay out that
   node and all of its descendants in a single layout run ... If the root node is set to INHERIT (or not set at all),
   the default behavior is SEPARATE_CHILDREN." — values `INHERIT | INCLUDE_CHILDREN | SEPARATE_CHILDREN`
   (https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html). It is passed via
   `elk: { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' }` because the extension sets `graph.layoutOptions = options.elk`.
   The PR that added hierarchy support states: "ELK recommends that you set `org.eclipse.elk.hierarchyHandling` to
   `INCLUDE_CHILDREN`, in order to lay out graphs that have edges between nodes inside compound nodes to other
   nodes." (https://github.com/cytoscape/cytoscape.js-elk/pull/32, merged 2021-07-15). ELK Layered: "Furthermore,
   full layout of compound graphs with cross-hierarchy edges is supported when the respective option is activated on
   the top level." (https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html).
2. **Async.** `elk.layout(graph).then(() => { ... layoutPositions(...) })` — Promise-based; `run()` returns
   immediately; wait via `layout.promiseOn('layoutstop')` / `stop` callback. `stop() { return this; }` is a no-op, so
   an in-flight layout cannot be cancelled. The extension imports `elkjs/lib/elk.bundled.js` and constructs
   `new ELK()` with no `workerUrl`, so the layout computation runs on the main thread (elkjs README: "`workerUrl` -
   a path to the `elk-worker.js` script. As a consequence the `ELK` will use a Web Worker to execute the layout.
   Default: `undefined`." https://github.com/kieler/elkjs/blob/master/README.md).
3. **Labels.** README/defaults: `nodeDimensionsIncludeLabels: false, // Boolean which changes whether label
   dimensions are included when calculating node dimensions`; applied via `node.layoutDimensions(options)` for
   non-parent nodes (fixed `width`/`height` are sent, so ELK's own `org.eclipse.elk.nodeSize.constraints`
   `NODE_LABELS` is not involved; https://eclipse.dev/elk/reference/options/org-eclipse-elk-nodeSize-constraints.html).
4. **Size.** `dist/cytoscape-elk.js` 11,301 B, unminified (`optimization: { minimize: false }`), with
   `externals: { 'elkjs/lib/elk.bundled.js': { ..., root: 'ELK' } }` in production (webpack.config.js) — the dist
   header does `require("elkjs/lib/elk.bundled.js")`. `dependencies: { elkjs: "^0.9.3" }` resolves to
   `elkjs@0.9.3` (latest 0.9.x; published 2024-04-16): `lib/elk.bundled.js` 1,606,238 B, `lib/elk-worker.min.js`
   1,594,464 B, `lib/elk-api.js` 8,591 B (https://data.jsdelivr.com/v1/package/npm/elkjs@0.9.3/flat). elkjs latest
   0.12.0: `lib/elk.bundled.js` 1,609,707 B (https://data.jsdelivr.com/v1/package/npm/elkjs@0.12.0/flat). elkjs
   README on the files: "`elk.bundled.js`: A bundled version of the two previous files, ready to be dropped into a
   browser's `<script>` tag."
5. **Version.** cytoscape-elk 2.3.0, 2024-11-26, MIT, `peerDependencies: { cytoscape: "^3.2.0" }`
   (https://registry.npmjs.org/cytoscape-elk). elkjs 0.12.0, 2026-07-17, license `EPL-2.0 OR GPL-3.0-or-later`
   (https://registry.npmjs.org/elkjs); README: "the minor version number is always the same" as ELK. Note the npm
   README of 2.3.0 says "elkjs >= 0.8.1" while GitHub master says "elkjs >= 0.9.2"; package.json says `^0.9.3`.
6. **DAG/tree options** (all passed through `options.elk`, "'org.eclipse.' can be dropped from the identifier"):
   `'algorithm': 'layered'` — README: "`layered` : ... Apply a hierarchical layout, appropriate for DAGs and trees."
   and `mrtree` "Apply a traditional, hierarchical tree layout."; `'elk.direction'`: "Overall direction of edges:
   horizontal (right / left) or vertical (down / up)." values `UNDEFINED RIGHT LEFT DOWN UP`
   (https://eclipse.dev/elk/reference/options/org-eclipse-elk-direction.html); rank separation
   `'elk.layered.spacing.nodeNodeBetweenLayers'`: "The spacing to be preserved between any pair of nodes of two
   adjacent layers." default 20 (https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-spacing-nodeNodeBetweenLayers.html);
   `'elk.edgeRouting'`: "What kind of edge routing style should be applied for the content of a parent node." values
   `UNDEFINED POLYLINE ORTHOGONAL SPLINES`, Layered default `ORTHOGONAL`
   (https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html; defaults table on the layered page).
   **However the extension applies node positions only** — `src/layout.js` never reads ELK edge sections/bend points,
   so ELK's orthogonal routing does not reach Cytoscape edges; the maintainers' demos imitate it with
   `'curve-style': 'taxi'` (https://github.com/cytoscape/cytoscape.js-elk/blob/master/demo/demo-layered.js).
   **Cycles:** `'elk.layered.cycleBreaking.strategy'`: "Cycle breaking looks for cycles in the graph and determines
   which edges to reverse to break the cycles." default `GREEDY`
   (https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html). Layering:
   `'elk.layered.layering.strategy'` default `NETWORK_SIMPLEX`
   (https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-layering-strategy.html). The README's
   `priority` option ("Edges with a non-nil value are skipped when geedy edge cycle breaking is enabled") is not
   referenced anywhere in `src/layout.js` (documented but unused).
7. **Performance / limitations.** elkjs README: "Since laying out diagrams can be a time-consuming job (even for the
   computer), and since we don't want to freeze your UI, Web Workers are supported out of the box." — but see item 2:
   cytoscape-elk does not use one. `'elk.layered.thoroughness'`: "How much effort should be spent to produce a nice
   layout." default 7 (https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-thoroughness.html). elkjs
   FAQ lists recurring problems: "Issues due to the underlying code transpilation by GWT and/or due to the outdated
   usage of js modules: `g is not defined`, `Can't resolve web-worker`, and general usage as part of react, webpack,
   etc." and "#6 Poor modularization" (https://github.com/kieler/elkjs/blob/master/README.md). Bundle cost ≈1.5 MiB
   raw / ≈456 KiB gzip (item 4).

### 5. `cytoscape-fcose` 2.2.0 (+ `cose-base` 2.2.0 + `layout-base` 2.0.1)

READMEs: master (matches npm 2.2.0) https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/master/README.md;
unstable (newer, unpublished features) https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/unstable/README.md.
Source: https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/unstable/src/fcose/index.js,
https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/unstable/src/fcose/cose.js, build
https://github.com/iVis-at-Bilkent/cytoscape.js-fcose/blob/unstable/webpack.config.js.

1. **Compound.** README: "fCoSE (pron. \"f-cosay\", **f**ast **Co**mpound **S**pring **E**mbedder), is a faster
   version of our earlier compound spring embedder algorithm named CoSE" and "fCoSE supports user-defined placement
   constraints as well as its full support for compound graphs." Compound knobs: `nestingFactor: 0.1`,
   `gravityRangeCompound: 1.5`, `gravityCompound: 1.0`, `tile: true`. Source comment: "transfer calculated positions
   to nodes (positions of only simple nodes are evaluated, compounds are positioned automatically)" (index.js line 467).
   Automatic; no enabling option.
2. **Sync.** `run()` executes spectral layout then CoSE synchronously and ends with
   `eles.nodes().not(":parent")...layoutPositions(layout, options, getPositions)`; the file contains no
   `setTimeout`/`requestAnimationFrame`/Promise. `animate: true` (default) therefore means an end-animation
   (README: "Whether or not to animate the layout"), and `layoutstop` fires when that animation completes.
3. **Labels.** README: `nodeDimensionsIncludeLabels: false, // Whether to include labels in node dimensions. Valid in
   "proof" quality`. Source sets `CoSEConstants.NODE_DIMENSIONS_INCLUDE_LABELS` (cose.js line 230) and shifts final
   positions by label width/height (index.js lines 423-436).
4. **Size.** `cytoscape-fcose.js` 57,239 B (webpack UMD, `optimization.minimize: MIN ? true : false` — the
   published file is 1,548 lines, i.e. unminified), `cose-base` external in production (`root: 'coseBase'`)
   (webpack.config.js; https://data.jsdelivr.com/v1/package/npm/cytoscape-fcose@2.2.0/flat). Deps chain
   `cose-base ^2.2.0` → `layout-base ^2.0.0`: `cose-base.js` 118,906 B, `layout-base.js` 147,958 B, both unminified
   UMD (https://data.jsdelivr.com/v1/package/npm/cose-base@2.2.0/flat,
   https://data.jsdelivr.com/v1/package/npm/layout-base@2.0.1/flat). README script-tag usage lists all three files.
   No minified build is published for any of the three.
5. **Version.** cytoscape-fcose 2.2.0, 2023-01-17, MIT, `peerDependencies: { cytoscape: "^3.2.0" }`,
   `dependencies: { "cose-base": "^2.2.0" }` (https://registry.npmjs.org/cytoscape-fcose); cose-base 2.2.0,
   2023-01-17, MIT (https://registry.npmjs.org/cose-base); layout-base 2.0.1, 2021-06-25, MIT
   (https://registry.npmjs.org/layout-base). Repo still active (pushed 2026-04-17,
   https://api.github.com/repos/iVis-at-Bilkent/cytoscape.js-fcose) but the unstable README's `treeConstraint`,
   `boundaryNodeConstraint`, `fixedPositionOnBoundary`, `parentSideAdhesion` are absent from the published 2.2.0
   dist (grep of `cytoscape-fcose.js`: 0 hits), while `fixedNodeConstraint`, `alignmentConstraint`,
   `relativePlacementConstraint`, `packComponents`, `uniformNodeDimensions` are present.
6. **DAG/tree options.** Force-directed — no rank direction or rank separation; readability levers are
   `idealEdgeLength`, `nodeSeparation: 75`, `nodeRepulsion`, and the constraints: `alignmentConstraint`
   ("align two or more nodes (with respect to their centers) vertically or horizontally"),
   `relativePlacementConstraint` ("constrain the position of a node relative to another node in either vertical or
   horizontal direction"), `fixedNodeConstraint`. The unstable README adds `treeConstraint: {direction: 'T-B', gap:
   200}` ("If the graph is known to be a tree/forest, this option allows to set the node positions to be in tree
   layout") — unpublished, see item 5. No edge routing; cycles irrelevant.
7. **Performance / limitations.** README: "fCoSE runs up to 2 times as fast as CoSE while achieving similar
   aesthetics." `quality: "default"` — "\"draft\" only applies spectral layout / \"default\" improves the quality with
   incremental layout (fast cooling rate) / \"proof\" improves the quality with incremental layout (slow cooling
   rate)". `randomize: true, // ... if this is set to false, then quality option must be \"proof\"` (the source's
   runtime message says "must be 'default' or 'proof'", index.js line 481). `numIter: 2500` "is a suggested value and
   might be adjusted by the algorithm as required". `packComponents: true` requires the separate
   `cytoscape-layout-utilities` extension ("cytoscape-layout-utilities extension should be registered and
   initialized"); otherwise packing is silently disabled (`cy.layoutUtilities && options.packComponents`).

### 6. `cytoscape-cola` 2.5.1 (+ `webcola` 3.4.0)

README: https://github.com/cytoscape/cytoscape.js-cola/blob/master/README.md. Source:
https://github.com/cytoscape/cytoscape.js-cola/blob/master/src/cola.js, defaults
https://github.com/cytoscape/cytoscape.js-cola/blob/master/src/defaults.js, rAF shim
https://github.com/cytoscape/cytoscape.js-cola/blob/master/src/raf.js, build
https://github.com/cytoscape/cytoscape.js-cola/blob/master/webpack.config.js. WebCola (published 3.4.0 source):
https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/src/layout.ts; README https://github.com/tgdwyer/WebCola/blob/master/README.md.

1. **Compound.** README: "It supports noncompound and compound graphs well." (plus a "compound demo" link). Source:
   "// add compound nodes to cola" → `adaptor.groups( parentNodes.map(...) )`, each group getting `leaves` ("leaves
   should only contain direct descendants (children), not the leaves of nested compound nodes or any nodes that are
   compounds themselves"), nested `groups`, and `padding: Math.max(pleft, pright, ptop, pbottom)` computed from the
   parent's CSS `padding-*` plus `nodeSpacing`. Only non-parent nodes are simulated; positions are written to
   non-parents and `nodes.updateCompoundBounds()` is called. Edges are filtered to those whose source **and** target
   are non-parents (`edges.stdFilter(... nonparentNodes.contains(edge.source()) && nonparentNodes.contains(edge.target()))`),
   so an edge attached to a compound parent exerts no force. Automatic; no enabling option.
2. **Sync/async.** Continuous simulation on WebCola's `tick()`. The extension supplies its own `kick`: when
   `options.animate` is true it schedules `raf(frame)` (async); otherwise `while( !inftick() ){ }` runs the whole
   simulation synchronously. WebCola's `start(..., keepRunning = true, ...)` ("@param [keepRunning=true] keep
   iterating asynchronously via the tick method") ends with `return keepRunning ? this.resume() : this;`, and
   `resume()` → `alpha(0.1)` → `this.kick()` (layout.ts lines 495-503, 647, 419-433, 705-707); the extension passes
   `undefined` for `keepRunning`, so `kick` is invoked inside `adaptor.start()` — i.e. with `animate: false` the
   layout completes before `run()` returns. `layoutstop` is emitted from `onDone()` on WebCola's `end` event
   (`tick()` fires `end` when `_alpha < _threshold`, layout.ts lines 144-149). Time cap: `setTimeout(() =>
   adaptor.stop(), options.maxSimulationTime)` — README `maxSimulationTime: 4000, // max length in ms to run the
   layout` — which can only pre-empt the animated (async) path. `layout.stop()` sets `manuallyStopped` and calls
   `adaptor.stop()`. An undocumented `infinite: false // overrides all other options for a forces-all-the-time mode`
   exists in defaults.js.
3. **Labels.** README/defaults: `nodeDimensionsIncludeLabels: false, // whether labels should be included in
   determining the space used by a node`; applied via `node.layoutDimensions( options )` plus `2*nodeSpacing`.
4. **Size.** `cytoscape-cola.js` 21,866 B, unminified UMD (737 lines; UglifyJS only when `MIN` is set),
   `externals: PROD ? Object.keys(pkg.dependencies)` → `require("webcola")` / `root["webcola"]` (webpack.config.js;
   https://data.jsdelivr.com/v1/package/npm/cytoscape-cola@2.5.1/flat). `dependencies: { webcola: "^3.4.0" }` →
   `webcola@3.4.0`, whose npm package ships the browser bundle `WebCola/cola.min.js` 79,814 B and `WebCola/cola.js`
   765,328 B alongside the CommonJS `main: dist/index.js` (which depends on `d3-dispatch`, `d3-drag`, `d3-timer`,
   `d3-shape`) (https://data.jsdelivr.com/v1/package/npm/webcola@3.4.0/flat, https://registry.npmjs.org/webcola).
   WebCola README: "This creates the `cola.js` and `cola.min.js` files in the `dist` directory".
5. **Version.** cytoscape-cola 2.5.1, 2022-02-23, MIT, `peerDependencies: { cytoscape: "^3.2.0" }`
   (https://registry.npmjs.org/cytoscape-cola). webcola 3.4.0, 2019-05-10, MIT — last publish
   (https://registry.npmjs.org/webcola). README dependency line says "Cola.js ^3.1.2".
6. **DAG/tree options.** README: `flow: undefined, // use DAG/tree flow layout if specified, e.g. { axis: 'y',
   minSeparation: 30 }` (source also accepts a string axis, a number, or `true`). WebCola `flowLayout` doc: "causes
   constraints to be generated such that directed graphs are laid out either from left-to-right or top-to-bottom. a
   separation constraint is generated in the selected axis for each edge that is not involved in a cycle (part of a
   strongly connected component)" (layout.ts lines 291-297) — so **cycles are handled by exempting SCC edges from
   the flow constraint**. Also `alignment` (README note: "The `alignment` option isn't as flexible as the raw Cola
   option. Here, only integers can be used to specify relative positioning"), `gapInequalities`, `edgeLength` /
   `edgeSymDiffLength` / `edgeJaccardLength`, `avoidOverlap`, `handleDisconnected`. No rank-separation setting beyond
   `minSeparation`; no edge routing.
7. **Performance / limitations.** README knobs: `maxSimulationTime: 4000`, `refresh: 1, // number of ticks per
   frame; higher is faster but more jerky`, `convergenceThreshold: 0.01, // when the alpha value (system energy)
   falls below this value, the layout stops`, `unconstrIter` / `userConstIter` / `allConstIter`. No documented
   guidance on graph size. Peer library unchanged since 2019 (item 5).

---

## Unverified (could not confirm from a primary source)

- Any *visual* statement about how `breadthfirst` renders compound parents (e.g. parents spanning ranks or
  overlapping) — inferred from the source's childless-only filtering; no doc or maintainer text describes the result.
- "ELK is slow on large graphs": no primary source quantifies this. The only related primary statements are the
  elkjs README's "laying out diagrams can be a time-consuming job" and the `thoroughness` option description.
- Whether `cytoscape-elk` 2.3.0 works with `elkjs@0.12.0` when the `^0.9.3` range is overridden — not tested here;
  the extension's dist hard-codes `elkjs/lib/elk.bundled.js` as its external.
- Bundler-side size of `webcola` when consumed through `main: dist/index.js` (CommonJS modules + d3 deps) rather
  than the shipped `WebCola/cola.min.js`; only the shipped bundle was measured.
- Actual minified sizes of `cytoscape-elk`, `cytoscape-fcose`, `cose-base`, `layout-base`, `cytoscape-cola`: none
  of these packages publish a minified file, so only raw and gzip sizes of the published files are reported
  (no local minifier was run, per the no-install constraint).
- Whether `cytoscape-fcose`'s unstable-branch features (`treeConstraint`, boundary constraints) have a planned
  release; the npm registry shows no publish after 2.2.0 (2023-01-17).
- WebCola's behaviour when `flow` is combined with `groups` on cyclic graphs beyond the SCC-exemption sentence quoted
  above.
- Cytoscape.js issue #420 is a 2014 maintainer comment (v2.0.4 era), not current documentation; the current source
  behaviour was verified independently, but no current doc text addresses `breadthfirst` + compound nodes.
