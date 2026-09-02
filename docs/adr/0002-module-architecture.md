---
status: accepted
---

# Pure core, thin Preact view, Cytoscape behind adapters, two test runners

The viewer is five modules plus an app shell: `catalog` (load and validate), `graph` (the normalized model and every query: Blast radius, Neighborhood with the pane cap, grouping, search), `layout` (dagre and elk behind one positions-returning interface, elk in a Web Worker), `state` (a signals store with derived view models and a URL-sync seam), and `view` (Preact components, with Cytoscape imported only under `view/canvas/`). `catalog`, `graph`, `layout` and `state` are pure and run in Node, so the domain logic and the normalize and search budgets are unit-tested with Vitest against the committed fixtures; the view's non-canvas components are tested with Vitest in jsdom; the canvas, the load path and the timed budgets run in headless Chromium under Playwright. Decided in [Decide module architecture and test strategy](https://github.com/phix/appContextViewer/issues/10); the interfaces and target file tree are in [`docs/architecture.md`](../architecture.md).

**Why Preact rather than React or no framework.** The initial bundle budget is 250 KB gzipped with Cytoscape and dagre already taking 151 KB. Preact with signals costs about 6 KB and keeps the React idiom (TSX, hooks, `preact/compat` if a React library is ever needed); React 19 would cost about 45 KB and leave the budget with almost no room for app code. The prototype's vanilla DOM approach does not scale to five views sharing selection, Depth, grouping and report state.

**Why a hand-written validator rather than ajv in the bundle.** The report needs the Application or External id and a downgrade decision per row, which ajv's errors do not carry, and ajv plus the schema would cost about 30 KB of the budget. ajv stays a dev dependency: a test validates every fixture with both and asserts they agree, so the hand-written rules cannot drift from the JSON Schema that producers validate against.

**Why the layout seam returns positions, not a Cytoscape layout.** Cytoscape's layout extensions run on the main thread and, for elk, ignore its worker build. Taking node and edge lists in and returning positions keeps both engines testable in Node, lets elk run in a Worker through its own API (which the EPL decision also requires), and makes the fallback chain (dagre, then elk, then breadthfirst) a property of one module.

**Rejected.** A separate `query` module beside `graph` (one type, one caller, a seam that nothing varies across); ajv at runtime; Cytoscape's own elk extension; Vitest browser mode as the only browser harness (the timed budgets need a real page load); React, Svelte or Solid; a component-local state approach without a store.
