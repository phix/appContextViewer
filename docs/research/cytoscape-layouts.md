# Cytoscape layouts for compound graphs at 1,000 nodes

Resolves [Research: Cytoscape layouts for compound graphs at 1k nodes](https://github.com/phix/appContextViewer/issues/4).

**Question.** Which Cytoscape layout(s) should the spec mandate for (a) a focused Neighborhood of tens of nodes and (b) an overview of up to ~1,000 Applications grouped into compound parents by an arbitrary Attribute?

**Answer.** Neighborhood: **dagre**, capped at ~200 nodes, with an exception handler that falls back to elk. Overview: **elk `layered`** with `hierarchyHandling: INCLUDE_CHILDREN`, budget ~3 s at 1,000 nodes. Call elkjs directly with its `workerUrl` option through a thin adapter rather than `cytoscape-elk`: the extension runs ELK on the main thread and only applies node positions anyway (sources doc, item 4). **fcose** is the only other candidate worth carrying into the prototype, as a possible "quick" overview mode; it is 5x faster than elk but is not hierarchical and its group separation was poor in the headless run. Reject breadthfirst, cose, and cola.

Primary-source facts (compound support, options, async model, versions, licences) are in [cytoscape-layouts-sources.md](./cytoscape-layouts-sources.md). This file holds the measurements and the recommendation.

## Method

Headless Cytoscape 3.34.2 in Node 24.16 on an Apple M5, 16 GB. Extensions: cytoscape-dagre 4.0.1 (bundles @dagrejs/dagre), cytoscape-elk 2.3.0 over its pinned elkjs 0.9.3, cytoscape-fcose 2.2.0, cytoscape-cola 2.5.1. Script and generator in [`cytoscape-layout-bench/`](./cytoscape-layout-bench/). Synthetic graph: N nodes at 120x30 px, 3 outgoing edges per node, 95% forward (DAG-like) and 5% backward so cycles exist. **Compound** runs bucket 10 nodes per parent (a 1,000-app catalog with 100 Repositories) and keep 60% of edges inside the bucket. Timing is `layout.run()` to `layoutstop`. Quality metrics are straight-line edge crossings, node overlaps (center distance under node size), and **intrusions**: foreign node centers inside a parent's children bounding box, so 0 means groups are rendered as separate boxes.

Caveats. Headless timings track browser layout math but not paint. Crossings are measured on straight lines; that is also what Cytoscape draws, because cytoscape-elk applies node positions only and ELK's edge routing never reaches the canvas. One synthetic graph family; real catalogs are less uniform. fcose and cose were run twice; the numbers below use `idealEdgeLength` 160, above the 120 px node width, because the first run with the extension defaults (80) packed nodes on top of each other and made fcose 5x slower at 1,000 nodes.

## Layout time, milliseconds

| layout | 30 flat | 30 cmp | 200 flat | 200 cmp | 500 flat | 500 cmp | 1000 flat | 1000 cmp |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| breadthfirst | 5 | 3 | 10 | 12 | 17 | 23 | 30 | 51 |
| dagre | 23 | 40 | 365 | 696 | 5,868 | 7,770 | 25,085 | **throws** |
| elk layered | 80 | 60 | 346 | 336 | 1,624 | 1,080 | 4,321 | 2,648 |
| fcose | 28 | 17 | 247 | 76 | 1,139 | 216 | 4,740 | 557 |
| cose | 15 | 10 | 459 | 49 | 3,136 | 176 | 13,248 | 412 |
| cola | 43 | 9 | 725 | 47 | 4,279 | 241 | 20,830 | 1,334 |

dagre compound at 700 nodes: 13,142 ms. At 850 and 1,000 it throws `Error: Not possible to find intersection inside of the rectangle` from `intersectRect` in dagre's `lib/util.js`, which fires when an edge endpoint coincides with a node center (`if (!dx && !dy) throw`). No positions are produced. cytoscape-dagre 4.0.1 bundles its own dagre, so the standalone `dagre` package does not change this.

Force-directed layouts get *faster* with compounds because cose-base computes repulsion per hierarchy level: 100 groups of 10 is ~9,500 node pairs instead of ~500,000.

## Quality at 1,000 nodes, compound

| layout | crossings | intrusions | overlaps | bbox area (Mpx) |
|---|---:|---:|---:|---:|
| breadthfirst | 401,165 | 45,744 | 0 | 43 |
| dagre | n/a (throws) | | | |
| elk layered | **116,027** | **0** | 0 | 1,766 |
| fcose | 146,700 | 8,368 | 1,060 | 13 |
| cose | 129,727 | 10,031 | 9 | 13,876 |
| cola | 167,493 | 0 | 0 | 7 |

## Quality at 30 nodes (Neighborhood scale), flat

| layout | ms | crossings | overlaps |
|---|---:|---:|---:|
| breadthfirst | 5 | 331 | 0 |
| dagre | 23 | 172 | 0 |
| elk layered | 80 | 245 | 0 |
| fcose | 28 | 168 | 0 |
| cose | 15 | 242 | 4 |
| cola | 43 | 523 | 0 |

## Bundle cost (gzip, from the installed packages)

| layout | extension | peer | total gz | licence |
|---|---:|---:|---:|---|
| breadthfirst, cose | 0 (core) | 0 | 0 | MIT |
| dagre | cytoscape-dagre 4.0.1, 18 KB (bundles dagre) | 0 | ~18 KB | MIT |
| elk | cytoscape-elk 2.3.0, 3 KB | elkjs 0.12.0 `elk.bundled.js` 458 KB (worker build 453 KB) | ~460 KB | ext MIT; elkjs **EPL-2.0 OR GPL-3.0-or-later** |
| fcose | cytoscape-fcose 2.2.0, 13 KB | cose-base 22 KB + layout-base 32 KB | ~67 KB | MIT |
| cola | cytoscape-cola 2.5.1, 6 KB | webcola 3.4.0 `cola.min.js` | ~28 KB | MIT |

Cytoscape core itself is 133 KB gz. Exact byte counts, publish dates and licence sources are in the sources doc; note fcose's last release is 2023-01, cola's 2022-02 on a 2019 webcola, cytoscape-elk's 2024-11, while dagre shipped 4.0.1 in 2026-08.

## Per-candidate verdict

- **breadthfirst.** Fastest by far and zero cost, but it ignores compound parents entirely: 45,744 intrusions at 1,000 nodes means groups are meaningless boxes drawn over an unrelated tree. Crossings are 2.5-3.5x every other layout. Reject for both views; acceptable only as an emergency fallback when everything else fails.
- **dagre.** Best readability at Neighborhood scale (fewest crossings among hierarchical layouts, no overlaps), synchronous, 18 KB. It does respect compounds (0 intrusions at 200-700) but time is superlinear, 5.9 s at 500 flat and 25 s at 1,000, and compound layouts **crash** somewhere between 700 and 850 nodes. Mandate for the Neighborhood with a node cap around 200 and a try/catch fallback; never for the overview.
- **elk layered.** The only hierarchical layout that scales: 2.6 s at 1,000 compound with 0 intrusions and the fewest crossings, and compounds make it faster, not slower. elkjs ships a worker build, but `cytoscape-elk` does not use it, so a worker means calling elkjs directly. Costs are a 458 KB gz chunk and a non-MIT licence that needs a decision. Mandate for the overview, lazy-loaded.
- **fcose.** Fastest at scale with compounds (0.56 s) and small, but not hierarchical, so a Dependency graph has no consistent direction, and groups overlapped heavily in the headless run (8,368 intrusions). Padding, `packComponents` and browser-side dimensions may fix the overlap; that needs to be seen in the prototype before it is allowed anywhere. Its `nodeDimensionsIncludeLabels` only applies with `quality: "proof"`, which is slower than the `default` quality measured here. Carry as a candidate quick mode only.
- **cose.** Flat is 13 s at 1,000; compound blows the bounding box out to 13,876 Mpx by spacing groups absurdly. Reject.
- **cola.** 21 s flat at 1,000 (bounded by `maxSimulationTime`), worst crossings of the force layouts, and a ~788 KB unminified peer. Reject.

## Consequences for other tickets

- **Performance budgets:** overview layout ≤ 3 s at 1,000 Applications / 3,000 Dependencies using elk in a worker; Neighborhood layout ≤ 100 ms at 50 nodes using dagre; a hard cap on Neighborhood size (~200) with a defined degrade path.
- **Module architecture:** layout runs behind an interface with two implementations and a fallback chain (dagre, then elk, then breadthfirst); the elk chunk is code-split and runs in a Web Worker via elkjs directly; dagre's throw is caught, not trusted.
- **Grouping behaviour:** elk keeps groups as boxes, so collapse/expand semantics can be defined on boxes; group *overlap* is not a case the overview has to handle.
- **New decision:** whether elkjs's EPL-2.0 / GPL-3.0 dual licence is acceptable in this public repo. If not, the overview falls to fcose and the prototype must prove its group separation.
