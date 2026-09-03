# The Center: Applications and Externals

Resolves [Decide whether an External or Channel can be the selected center](https://github.com/phix/appContextViewer/issues/17). Which things the impact board can be centered on, what each shows, and what a Channel gets instead. Vocabulary: [`CONTEXT.md`](../CONTEXT.md), where **Center** is now defined.

## Decisions

1. **An External can be the Center.** "What breaks if the database dies" is the most common impact question there is, and the domain already answers it: an External has Dependents, so its Blast radius is the transitive set of those Dependents, computed exactly as for an Application. The glossary's Blast radius and Neighborhood now read "of an Application or External". In the fixtures the most-depended-on External has 10 direct Dependents in the demo and 197 at 1,000 Applications, both above any Application.
2. **A Channel cannot be the Center.** Flows never contribute to a Blast radius (schema v1), so "what breaks if this Channel stops" has no answer in this domain; the honest question is "what goes stale", a different relation that would redefine Blast radius. Ruled out of this effort, recorded on the map.
3. **Where an External is selectable:** search (indexed by id, name and kind, shown with a kind chip), the Needs column rows, the Neighborhood pane, and the ranked table. *(Amended 2026-09-03: this originally said "the Needs column chips", because an External was expected to appear there as a chip rather than a row. It has its own row and its own control, so the requirement — that an External is never a dead end — is met by the row. A chip is now a **Tag**, which groups rather than selects; see [`tags.md`](./tags.md).)* Selecting one sets the Center like an Application does and writes `external=<id>` to the URL hash.
4. **The ranked table lists Externals with Applications**, each row marked by a kind chip ("External · database"), sorted by Blast radius together, with a one-click filter to Applications only (default: both, not persisted). Externals will often top the list; that is the table doing its job.
5. **The impact board with an External at the Center:** the middle card shows id, kind, name, description, url and attributes, the "N break across T Teams" badge, and Copy as Markdown as for an Application. The Needs column holds one line, "An External has no Dependencies in the Catalog", and keeps its place so the layout never shifts. The Breaks column is banded by Depth as usual.
6. **The Neighborhood pane with an External at the Center** draws the External in the middle with its Dependents outward; there is no Dependencies side. The pane cap applies unchanged, with one rule the budgets did not yet state and now do: when even Depth 1 exceeds the cap, the pane draws the Center alone with the notice "197 Dependents, more than the pane can draw; see the Breaks column".
7. **The Overview never draws Externals** (grouping decision). With an External at the Center, the Overview highlights the Groups of its direct Dependents, collapsed with counts, and no Group auto-opens, since the Center belongs to none.
8. **A Channel gets a card, not a Center.** Search finds Channels by name; choosing one opens a **Channel card**: the Channel's name, its publishers and its subscribers as clickable Application rows. It sets no selection, drives no board, and is not URL state; the `channel=` key stays reserved and unused. Report rows naming a Channel (`W_EMPTY_CHANNEL`) open the same card. Channels also remain listed under Flows on every Application's middle card.

## Rejected

- **Externals excluded from the Center.** The viewer would refuse the question its users ask first, and the Needs chips would be dead ends.
- **Externals in a separate ranked list.** Two lists sorted by the same number, and the prototype's "most depended-on Externals" box was the weaker screen.
- **Channels as a Center with subscribers counted as affected.** Contradicts the schema decision that Flows are not Dependencies and would make every Blast radius depend on which relation kind the reader had in mind.
- **Truncating an over-cap Depth 1.** Truncation by rank was rejected in the budgets decision; the Center-only fallback keeps the pane honest.

## Consequences

- **Graph module:** `blastRadius`, `rankedByBlastRadius`, `neighborhood` and `paneNeighborhood` accept an External id; `rankedByBlastRadius` returns rows for both kinds; the search index includes Externals and Channels.
- **State module:** the selection is a `Center` of `{ kind: 'application' | 'external', id }`; the Channel card is transient UI state.
- **URL state:** `external=<id>` joins the hash, mutually exclusive with `app`; the missing-Center notice covers both kinds.
- **Validation surfacing:** Channel rows in the report open the Channel card.
- **Performance budgets:** the pane cap gains the Center-only fallback; the ranked table's first-100-rows rule now counts Externals too.
- **Slicing:** the ranked table, impact board, pane, search and URL slices each carry an External-Center case in their acceptance tests, using `redis` in the demo Catalog (10 direct Dependents) and `mysql-legacy` in the 1,000-Application fixture (197, over the pane cap).
