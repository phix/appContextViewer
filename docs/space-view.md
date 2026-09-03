# The Space: the Catalog in three dimensions

A third canvas beside the Neighborhood pane and the Overview, reached by `view=space` in the hash
([`url-state.md`](./url-state.md)). Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## What it is for, and what it is not for

3D earns its place at exactly one thing: **seeing the shape of the whole Catalog at a glance** —
where the clusters are, which Applications are hubs, how tightly a Group holds together. A force
layout in three dimensions has room to separate structure that a 2D layout has to overlap.

It is **bad** at everything the rest of the viewer is good at. Occlusion hides nodes behind other
nodes. There is no stable reading order. Distance is ambiguous under perspective. Nothing precise can
be read off it.

So the Space is a **structural** view, never an authoritative one:

- **The impact board stays the answer to "what breaks if X dies".** The Space never replaces it and
  never becomes the only route to anything.
- **Nothing is reachable only through the Space.** Every node it draws is reachable from the ranked
  table and search, which are keyboard-navigable in a way a WebGL canvas is not. This is an
  accessibility floor, not a nicety.
- **It is not the Overview.** The Overview is grouped, collapsible and laid out for reading
  Dependencies between Groups. The Space is ungrouped, continuous, and laid out for spotting shape.

## Behaviour

- **Applications and Externals as nodes**, Dependencies as edges, positioned by a 3D force layout.
  Channels are not drawn, as in the Overview.
- **Colour carries the grouping Attribute**, so the picture answers "where does this Team's work
  actually sit" without a legend hunt. Changing the grouping Attribute recolours without re-laying out.
- **Orbit, pan and zoom.** Depth is cued by fog and by size falloff, because perspective alone reads
  ambiguously.
- **Click a node to set the Center.** The board follows, exactly as a table row or a canvas node does.
- **Tags still work.** Pointing at a Tag Highlights its Group here too ([`tags.md`](./tags.md)) — the
  Space subscribes and styles its own nodes, as the Neighborhood canvas already does, because a
  WebGL scene cannot be reached by the injected CSS rule.
- **The Center and its Neighborhood at the header Depth are emphasised**; everything else recedes.
- **`prefers-reduced-motion: reduce` disables auto-rotation and animated transitions.** Orbiting on
  drag stays: it is a direct response to input, not motion the page chose.

## Decisions already made

**The engine is [`3d-force-graph`](https://github.com/vasturiano/3d-force-graph), MIT.** It wraps
three.js (MIT), three-forcegraph (MIT) and d3-force-3d (MIT), so nothing here needs an entry in
`scripts/check-licences.mjs`'s EXCEPTIONS — unlike elkjs, which did. Raw three.js was rejected: it
would mean writing a force simulation, a picking implementation and a camera controller that this
package already has.

**It must be a lazy chunk**, loaded on first entry to the Space and never before, exactly as the elk
worker is. Budget 13 (initial JS+CSS <= 250 KB gzipped) currently sits at 187.2 KB and this must not
touch it. Budget 14 caps any non-initial chunk at 500 KB gzipped, and `scripts/check-bundle.mjs`
enforces both.

**The layout runs off the main thread or yields to it.** Whichever is chosen, typing in search and
clicking the header must stay responsive while the simulation settles — the same requirement Expand
all already meets.

## Budgets: to be measured, then set

**No number is written here yet, deliberately.** Four budgets in this document were set at design
time and every one of them was wrong when it was first measured: budget 3 by ~20%, budget 4 by a
frame fence, budget 9 by an uncounted input, budget 11 by never having been measured at all. Writing
a fifth guess would be repeating a mistake this project has already paid for four times.

So the slice that builds the Space **measures first and reports**, on `samples/catalog-1000.json`
(1,000 Applications, 25 Externals, 5,395 Dependencies) and on `samples/att/catalog.att.json`:

| # | what to measure |
|---|---|
| A | first entry to the Space: chunk fetch, scene build, simulation settled, first paint |
| B | re-entry with the chunk already loaded |
| C | frame rate while orbiting a settled scene |
| D | selecting a node to the board painted |
| E | recolouring on a grouping change |
| F | the lazy chunk's gzipped size |

Report the numbers with the fixture and the hardware. The ceilings, and any cap policy the counts
turn out to need, are a spec decision made from those measurements — not by the slice.

**Expect a cap to be needed and do not invent one.** The Overview caps at 700 Group Dependencies
because elk's cost is superlinear in edges; a force simulation over 5,395 Dependencies may want its
own limit, or may not. Measure, then say.

## Consequences for what already exists

- `docs/url-state.md` gains `view=space` alongside `overview`.
- The header's canvas control becomes a choice of canvas rather than a single toggle.
- `docs/architecture.md`'s rule stands: **anything that renders a scene lives under
  `src/view/canvas/`**, and the view calls a layout through an interface rather than importing an
  engine directly.
