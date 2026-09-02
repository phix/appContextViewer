# Layout benchmark

Headless Cytoscape layout timings used by `docs/research/cytoscape-layouts.md`.

```bash
mkdir /tmp/layoutbench && cd /tmp/layoutbench && npm init -y
npm i cytoscape cytoscape-dagre dagre cytoscape-elk elkjs cytoscape-fcose cytoscape-cola
cp <repo>/docs/research/cytoscape-layout-bench/*.mjs .
node bench.mjs <layouts,comma,separated> <sizes,comma,separated> [flat|cmp]
# e.g. node bench.mjs elk,fcose 200,500,1000 cmp
```

Graph generator: N nodes at 120x30 px, 3 outgoing edges per node, 95% forward (DAG-like), 5% backward (cycles). In compound mode nodes are bucketed 10 per parent and 60% of edges stay inside the bucket. Seeded PRNG, so runs are reproducible. Metrics: wall time of `layout.run()` to `layoutstop`, bounding-box area, node overlaps (center distance under node size), straight-line edge crossings, and "intrusions" (foreign node centers inside a parent's children bounding box; 0 means groups are kept as separate boxes).

`bench-spacious.mjs` is the same with `idealEdgeLength` raised above the node width for fcose and cose, which is the configuration the report quotes for those two.
