---
status: accepted
---

# Accept elkjs under EPL-2.0 for the Overview layout

Every other dependency is MIT, but the [layout research](../research/cytoscape-layouts.md) found elk `layered` is the only hierarchical layout that keeps Groups as separate boxes at 1,000 compound nodes, and elkjs 0.12.0 is licensed `EPL-2.0 OR GPL-3.0-or-later` (its LICENSE.md designates GPL-3.0-or-later as a Secondary License under EPL-2.0 Exhibit A). We accept elkjs **under EPL-2.0 only**, never electing the GPL option, and we use it unmodified as a separate, lazy-loaded chunk running in a Web Worker. Decided in [Decide whether elkjs's EPL-2.0 licence is acceptable](https://github.com/phix/appContextViewer/issues/13).

**Why it is safe for the rest of the code.** EPL-2.0 section 1 says Modified Works "shall not include works that contain only declarations, interfaces, types, classes, structures, or files of the Program solely in each case in order to link to, bind by name, or subclass the Program", and Contributions "do not include changes or additions to the Program that are not Modified Works". Our adapter only calls elkjs's API, so the EPL's obligations attach to the elkjs chunk alone; the viewer's own code carries whatever licence [Choose the repository's own licence](https://github.com/phix/appContextViewer/issues/18) picks. Section 3.1 obliges a distributor of object code to state that the source is available and to disclaim warranties and liability in its own terms; a notices file does both. This is an engineering reading of the licence text, not legal advice.

**Obligations for the build**

1. Ship `THIRD-PARTY-NOTICES.md` with the site and in the repo, listing elkjs with the full EPL-2.0 text, its copyright line, and the statement that its source is available at https://github.com/kieler/elkjs. Link it from the viewer's about or footer.
2. Keep the licence comment in the built elkjs chunk (esbuild's legal-comments setting) or point from the chunk to the notices file. A single-file disk build inlines the chunk, so the notice must survive inlining.
3. Never fork or patch elkjs in-tree. A local modification would itself be a Modified Work to publish under EPL-2.0; fixes go upstream.
4. A licence allowlist check in CI over the runtime dependency tree (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, CC0-1.0, Unlicense, plus EPL-2.0 for elkjs alone; see `docs/licensing.md`) so the next non-MIT dependency that ships is a decision, not an accident.

**Rejected**

- **fcose (MIT) for the Overview.** 5x faster and 67 KB, but not hierarchical, so Dependencies have no consistent direction, and it produced 8,368 Group intrusions at 1,000 compound nodes in the headless run. Taking it would oblige the prototype to prove Group separation and re-measure the Expand-all budget. The Overview's value is Group boxes with directional Dependencies; that is what elk gives.
- **Electing the GPL-3.0-or-later secondary licence.** Nothing needs it, and it would bring a strong copyleft into a repo that is otherwise permissive.
- **Running ELK outside the browser.** No backend, by decision.
