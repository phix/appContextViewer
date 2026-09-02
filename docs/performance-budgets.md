# Performance budgets

Resolves [Set performance budgets to 1,000 apps](https://github.com/phix/appContextViewer/issues/8). These numbers become acceptance tests in the build tickets. Vocabulary: [`CONTEXT.md`](../CONTEXT.md). Fixtures: [`samples/`](../samples/README.md).

## Reference environment

- **Fixture:** [`samples/catalog-1000.json`](../samples/catalog-1000.json): 1,000 Applications, 5,395 Dependencies (4,395 between Applications), 123 Repositories, 25 Externals, 100 Channels, 406 KB.
- **Where:** headless Chromium driven by Playwright on an Apple-silicon laptop, cold load, no cache. Pure functions are timed in Node under Vitest.
- **CI:** the same assertions run with **2x** every number below, so a slow runner does not block a merge and a real regression still does.
- **Smaller Catalogs are never slower.** Every number is a ceiling at the fixture size; the 34-Application demo must feel instant.

## Budgets

| # | what is measured | at 1,000 Applications / 5,395 Dependencies | asserted by |
|---|---|---|---|
| 1 | **Normalize**: parse, validate every schema rule, build the graph, compute all Blast radii | <= 100 ms | Vitest, pure function, Node |
| 2 | **Load to table**: file chosen (picker, drop, `?src=`) to the ranked Blast-radius table painted | <= 500 ms | browser |
| 3 | **Pane at the cap**: Neighborhood laid out (dagre) and painted at 150 nodes | <= 500 ms | browser |
| 4 | **Pane, typical**: Neighborhood laid out and painted at 50 nodes | <= 100 ms | browser |
| 5 | **Select**: choosing an Application from the table, search, a chip or the canvas to the impact board columns painted | <= 100 ms | browser |
| 6 | **Depth change** in the header to the impact board repainted | <= 100 ms | browser |
| 7 | **Search**: one keystroke to results over 1,000 ids and every scalar Attribute | <= 50 ms | Vitest or browser |
| 8 | **Canvas hover** highlight | <= 50 ms | browser |
| 9 | **Overview, collapsed**: 123 Group nodes with Group Dependencies laid out (elk in a worker) and painted | <= 750 ms | browser |
| 10 | **Overview, one Group opened or closed**: re-layout done and painted | <= 1.5 s | browser |
| 11 | **Overview, Expand all**: 1,000 compound nodes laid out in the worker | <= 5 s, with a progress state, cancelable, main thread stays interactive throughout | browser |
| 12 | **Animation** of Overview nodes to new positions | 300 ms, fixed | design constant |
| 13 | **Initial bundle**: JS and CSS needed for budgets 1 to 8 (Cytoscape, dagre, app code) | <= 250 KB gzipped | build manifest |
| 14 | **Overview layout chunk**: the layout engine loaded on first expand (elkjs today; fcose if the licence ticket says so) | <= 500 KB gzipped | build manifest |

The ranked table paints its first 100 rows and the rest on scroll or a show-more, so 1,000 rows never sit between the user and first paint; Externals are rows in the same table (Center decision), so the count includes them.

## Policies

**Pane cap.** The pane holds at most **150 nodes** (Applications and Externals together). When the Neighborhood at the header Depth exceeds the cap, the pane draws the largest Depth that fits (2 falls to 1, 3 to 2) and says so: "Showing Depth 1 of 2; 431 more in the Overview", with the Overview one click away. When even Depth 1 exceeds the cap, as it does for an External with 197 Dependents, the pane draws the Center alone and says "197 Dependents, more than the pane can draw; see the Breaks column". The impact board columns keep the full header Depth; they are lists and hold 700 rows. At 1,000 Applications roughly 45% of Depth-2 Neighborhoods fall back to Depth 1 this way; 33% exceed 200 nodes and 59% exceed 100, which is why the cap sits at 150.

**The board never waits for the pane.** Selection and Depth changes repaint the impact board first, under budgets 5 and 6; the pane re-lays out afterwards under budget 3 and never blocks input.

**Above the supported envelope.** The envelope is 1,000 Applications / 5,000 Dependencies, where every number above is asserted. A larger Catalog is **never refused for its size**:

- The index, ranked table, impact board and pane keep their budgets by construction (top rows first, 150-node cap), so they simply work.
- **Expand all is disabled above 1,000 Applications.** The collapsed Overview and opening single Groups remain.
- **The Overview is disabled above 3,000 Applications**, with a notice naming the Catalog's counts and the limit.
- **Files over 50 MB are refused before parsing**, with a message naming the size. This is a safety rail for the browser tab, not a budget.

**Budgets are test assertions, not runtime gates.** A slower machine gets a slower viewer, never different behaviour. The one runtime control is Expand all's progress state and cancel.

## Consequences for open tickets

- **Module architecture and test strategy:** budgets 1 and 7 want pure, Node-timed functions; budgets 2 to 11 need a headless-Chromium harness, so browser tests are required at least for performance assertions. The layout runs behind an interface that owns the 150-node cap and the Depth fallback. The Overview engine sits behind a code-splitting boundary and a Web Worker.
- **Slicing:** every build ticket that touches a numbered row above carries that row as an acceptance test at the fixture size, plus the 2x CI variant.
- **elkjs licence:** budget 14 holds for elk (458 KB) or fcose (67 KB); the Expand-all number was set for elk and needs re-measuring if fcose replaces it.
- **Run from disk (file://):** ruled out in [Decide whether the viewer must run from disk (file://)](https://github.com/phix/appContextViewer/issues/14); the hosted build is the only target, so budgets 13 and 14 apply without exception.
