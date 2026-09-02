# Surfacing validation errors and warnings

Resolves [Decide how validation errors and warnings are surfaced](https://github.com/phix/appContextViewer/issues/12). The codes themselves are defined in [`schema-v1.md`](./schema-v1.md); this page decides where they appear and what the user can do. Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## Decisions

1. **A Catalog with any error never loads, not even partially.** The viewer exists to answer "what breaks if X dies". A dropped Application or an unresolved Dependency shrinks a Blast radius silently, which is the one wrong answer this tool must never give. Errors are rare and producer-fixable; the report below is built to make the fix one round trip.
2. **Warnings never block.** A Catalog with warnings loads normally and hides nothing; the warnings are listed for the producer to fix at leisure.
3. **The current Catalog survives a failed load.** The viewer always has a Catalog: the sample ships with the site, and a real one replaces it only when it validates. A rejected file leaves the current Catalog untouched, so the user can keep working while the producer fixes theirs. A `?src=` failure at startup shows the report over the sample Catalog.
4. **Errors appear in a load dialog over the current screen**, titled "Catalog rejected" with the source name (file name or URL) and a summary by code ("2 unresolved refs, 1 duplicate Application"). Actions: **Choose another file**, **Copy report as Markdown**, **Close** (keeps the current Catalog). The report is also the place for a `?src=` fetch failure, which names CORS when the browser reports a cross-origin refusal.
5. **Warnings appear as a count badge in the header** next to the Catalog name ("3 warnings"), absent when there are none. Clicking it opens the same report as a side sheet, not a modal. No banner: a banner takes space from the impact board for as long as the Catalog is loaded.
6. **Every row points at the offending record.** A row is *code · location · message · offending value*. Location is the Application id (`repository/project`) or External id when one exists, plus the JSON path (`applications[17].dependsOn[2]`). Rows that name an Application are clickable and select it, driving the impact board. Rows naming a Channel open the Channel card (publishers and subscribers), decided in [Decide whether an External or Channel can be the selected center](https://github.com/phix/appContextViewer/issues/17); a Channel is never a Center. A JSON syntax error reports the line and column the engine gives, or the character offset.
7. **The report is grouped by code in a fixed order** and the viewer **collects every error before reporting**, capped at 1,000 rows, so the producer fixes all of them in one round. Order: the load-stage code if any (`E_FETCH`, `E_TOO_LARGE`, `E_PARSE`, exclusive of everything else), then `E_SCHEMA_VERSION` (which ends checking, since later rules assume the major), then `E_INVALID`, `E_DUPLICATE_APPLICATION`, `E_DUPLICATE_EXTERNAL`, `E_UNRESOLVED_REF`, `E_SELF_DEPENDENCY`, then warnings. Within a group rows follow path order. Each group is collapsible with its count and shows 50 rows before a "show all". When errors and warnings coexist, both are listed so the producer sees the whole picture.
8. **Warning groups collapse by cause, not by record.** `W_UNKNOWN_KEY` groups by key name ("`owner` on 212 Applications", first five ids shown, expandable), because one producer bug produces hundreds of identical rows. `W_EMPTY_CHANNEL` is one row per Channel naming the missing side. `W_DUPLICATE_ENTRY` and `W_INVALID_FORMAT` are one row per record.
9. **Two schema violations become warnings**, added to `schema-v1.md`: a duplicated entry in `dependsOn`, `publishes` or `subscribes` is `W_DUPLICATE_ENTRY` (the viewer keeps the first occurrence), and a display-only field failing its format (`url`, `generatedAt`) is `W_INVALID_FORMAT`. Producers validating with the JSON Schema still get strict rejection; the viewer downgrades, as it already does for unknown keys. Identity and relation keys (`repository`, `project`, refs, External `id` and `kind`, Channel names) stay errors.
10. **Copy report as Markdown** produces a heading with the source and summary line, then one table per code, ready to paste into a ticket for the producer. Same idiom as the impact board's Copy as Markdown.

## Rejected

- **Load valid records and drop the rest**: silently wrong Blast radii, see decision 1.
- **Quarantine invalid records and show them flagged**: every query would need a "but some records are broken" caveat, and the quarantine set has no defined Dependencies to draw.
- **Replace the screen with an error page**: throws away the Catalog the user was reading.
- **A persistent warning banner**: costs impact-board height for the life of the session for information the user needs once.
- **Toast then nothing**: the producer can never find the list again.
- **One row per unknown-key occurrence**: 212 identical rows for one typo.

## Consequences

- **Schema doc:** `schema-v1.md` gains `W_DUPLICATE_ENTRY`, `W_INVALID_FORMAT`, and a load-stage table (`E_FETCH`, `E_TOO_LARGE`, `E_PARSE`); the versioning paragraph now downgrades three kinds of violation, not one.
- **Module architecture:** validation is a pure function returning `{ errors, warnings }` with code, path, id and message per row, collecting everything before returning; the dialog and side sheet are one report component fed by that result; the load path never mutates the current Catalog until the new one is accepted.
- **Slicing:** the build tickets need one invalid fixture per code under `samples/invalid/` and a fixture with both errors and warnings; the report component's acceptance test renders the 1,000-row cap.
- **Performance budgets:** unchanged; collecting every error on the 1,000-Application fixture is inside the 100 ms normalize budget.
- **URL state:** an open report is not URL state.
