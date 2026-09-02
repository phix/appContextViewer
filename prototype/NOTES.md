# PROTOTYPE: impact-first UX

Question: what does the impact-first screen look like? Default screen after a Catalog loads, the "what breaks if X dies" flow, how canvas, side panel and outline tree relate, where grouping and depth controls sit.

Run: open `prototype/impact-ux.html` directly (no build; CDN scripts, embedded generated Catalog of 45 Applications). Switch variants with the bottom bar, `←`/`→`, or `?variant=A|B|C`. `?app=<id>` deep-links a selection.

- **A — Canvas-first.** Graph fills the screen; side panel holds blast radius by depth, direct Dependencies, Flows, Attributes. Picker overlay on load.
- **B — Outline-first.** Index by Repository on the left; the blast radius as an expandable tree in the middle (the incident-doc view, with Copy as Markdown); a small depth-2 graph on the right. Ranked "largest blast radius" table on load.
- **C — Impact board.** Three columns: Needs | the Application | Breaks, each banded by depth; graph in a bottom drawer. Catalog stats on load.

Verdict (Nick, 2026-09-02): **C, the impact board, wins** for the selected-Application screen. The default screen after load is **B's ranked "largest blast radius" table**. The canvas is **B's always-visible side pane** showing the depth-2 Neighborhood, expandable on demand, never the primary reading surface. Depth control sits in the header and applies to both columns; direction needs no control because Needs and Breaks are the two columns; grouping controls belong to the canvas pane. "Copy as Markdown" of the blast radius stays in the middle card. Recorded in wayfinder ticket #6; this prototype is throwaway and is deleted at slicing time.
