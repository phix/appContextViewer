# PROTOTYPE: impact-first UX

Question: what does the impact-first screen look like? Default screen after a Catalog loads, the "what breaks if X dies" flow, how canvas, side panel and outline tree relate, where grouping and depth controls sit.

Run: open `prototype/impact-ux.html` directly (no build; CDN scripts, embedded generated Catalog of 45 Applications). Switch variants with the bottom bar, `←`/`→`, or `?variant=A|B|C`. `?app=<id>` deep-links a selection.

- **A — Canvas-first.** Graph fills the screen; side panel holds blast radius by depth, direct Dependencies, Flows, Attributes. Picker overlay on load.
- **B — Outline-first.** Index by Repository on the left; the blast radius as an expandable tree in the middle (the incident-doc view, with Copy as Markdown); a small depth-2 graph on the right. Ranked "largest blast radius" table on load.
- **C — Impact board.** Three columns: Needs | the Application | Breaks, each banded by depth; graph in a bottom drawer. Catalog stats on load.

Verdict: _pending Nick's review_ (record here and in wayfinder ticket #6).
