# Retrospective: what the APM naming change exposed

Written 2026-09-03, after loading [`samples/att/`](../samples/att/README.md) — a 141-Application
Catalog that identifies Applications by APM number under five `ATT-IDP*` organisations — into the
viewer for the first time.

One dataset changed one thing: **the id stopped being a name.** Everything below follows from that,
and most of it is not about the dataset at all. It is about assumptions the build had been making
without stating them, which a readable id had been hiding.

## What held, unchanged

Worth saying first, because it is the larger part.

- **Schema v1 accepted the new naming with no change.** `apm10003` matches the `project` pattern,
  `ATT-IDP1/network-fault-management` matches `repository`, and ids split at the last slash
  correctly across both. `node samples/check.mjs` reports **0 errors**.
- **Every graph query was correct on data shaped nothing like the fixtures it was built against**:
  141 Applications, 31 Repositories, 534 Dependencies (254 cross-Repository), 2 cycles, a Blast
  radius of 118 reaching Depth 7, sparse records with no `attributes`, one Application with no
  `team`, one with no `kind`.
- **The rule that ids split at the *last* slash earned itself.** `ATT-IDP1/network-fault-management`
  is a two-segment Repository; had `project` been allowed to contain a slash, the id would have been
  ambiguous. That constraint was written in the schema ticket for exactly this case, before there was
  a case.

## What broke, and why it was invisible until now

### 1. The id was doing a job nobody had assigned it

`acme/commerce/order-service` is an id that reads as a name. Every surface in the viewer — ranked
table, board rows, search results, canvas labels, the Center card — labelled things by id, and it
looked fine, because the fixtures all had ids like that.

With APM numbers the ranked table's top row is `ATT-IDP5/shared-libraries/apm10133`: an Application
whose Blast radius is 118 of 141, **84% of the Catalog**. A viewer built to answer "what breaks if X
dies" cannot answer it while X is unreadable. This is not cosmetic — it is the product's central
claim failing on its first contact with realistic identifiers.

The fault is not the dataset's. It is that **"the id is human-readable" was an unstated assumption**
inherited from the sample data, never written down and therefore never checked.

### 2. Schema v1 had no `name` on an Application

An External has always had `name`. An Application never did, because the id was the name. The
asymmetry was invisible while it did not matter.

**Fixed** (`6c06934`): `name` is an optional key on Application. Additive, so this stays v1 under the
versioning rule. The validator, the graph model, `samples/check.mjs` and the search index all carry
it; search ranks it **beside** the id rather than beneath it, because with an APM number the name is
the only thing a person can type. Both mutations of that ranking turn the suite red.

### 3. The workaround was worse than the gap

Before the schema gained `name`, the generator smuggled the name into `attributes.appName` — the one
place the schema allowed free-form data that search would reach. It worked, and it produced a
**139-value scalar Attribute**, which the group-by menu discovers as a grouping and offers as
"group by appName": 139 groups of one.

That is a general defect the dataset merely revealed: **the group-by menu has no cardinality rule**.
Any near-unique scalar Attribute — a serial number, a URL, a timestamp — offers itself as a grouping
that produces one Group per Application.

### 4. The verifier's own numbers were an artifact

Unrelated to naming, found the same night and worth recording together. The pane review reported that
the largest drawable pane in `catalog-1000.json` was 123 nodes / 347 Dependencies, and concluded a new
fixture was needed to reach the 150-node cap. That ceiling **was a symptom of the defect being
reviewed** — the Dependency cap wrongly forcing a Depth fallback. With the cap fixed the same fixture
reaches 150 nodes on its own, and no new bytes were needed.

The lesson is narrow and useful: **a measurement taken through a defect describes the defect, not the
system.** The review was right about the defect and wrong about what followed from it, and the
implementer was right to push back rather than build the fixture.

## Items

Numbered so they can be referred to. Status as of writing.

| # | item | status |
|---|---|---|
| N1 | Optional `name` on Application in schema v1, JSON Schema and `docs/schema-v1.md` | **done** `6c06934` |
| N2 | Validator, graph model, `samples/check.mjs` carry `name` | **done** `6c06934` |
| N3 | Search indexes `name` as a primary field, ranked with the id | **done** `6c06934` |
| N4 | Budget 3 ruled at 750 ms from measurement, replacing an unmeasured 500 ms | **done** `6c06934` |
| N5 | `label()` in the graph module: `name` when present, id otherwise — one place every view calls | open |
| N6 | Ranked table, board rows, Center card, search results and canvas nodes label by `label()`, id as secondary | open |
| N7 | Group-by menu hides near-unique Attributes (a cardinality rule, stated in the doc) | open |
| N8 | Tags: pointing at one Highlights its Group; choosing one makes it the grouping Attribute | open |
| N9 | `samples/README.md` links `samples/att/` | open |
| N10 | An e2e case that loads `catalog.att.json` and asserts a name is rendered, not an APM id | open |

N5 through N8 all touch `src/view/`, which two slice workers hold open right now (#26 pane, #27
Overview). They are sequenced after those merge, not deferred for any other reason.

## N8, stated properly, because it is the one new capability

A **Tag** is the visible handle of a **Group** (both now in [`CONTEXT.md`](../CONTEXT.md)). The
viewer already renders Tags everywhere — `Team: Billing Platform`, `External · database`, the
Repository chip on a board row — and treats them as decoration. They are not decoration: each one
names a set.

- **Point at a Tag** (hover **or** keyboard focus, since a hover-only affordance is unusable without
  a mouse) and every node sharing that Attribute value **Highlights** — in the ranked table, both
  board columns and the canvas at once. Nothing is removed, nothing is selected, the URL does not
  change. A Highlight is transient by definition.
- **Choose a Tag** and its Attribute becomes the grouping Attribute, which the Overview already knows
  how to lay out.

This is not a new relation in the model, which is what makes it cheap: a Group is already "the set
sharing one Attribute value", and the Overview already groups by an Attribute. The only genuinely new
idea is that the Attribute a Tag names need not be the *current* grouping Attribute — which is why
`CONTEXT.md`'s definition of Group was generalised from "the current grouping Attribute" to "one
Attribute", with **grouping Attribute** named separately for the one the Overview draws boxes for.

**Origin, stated honestly:** this was asked for as a restoration — "in the original mockup there were
3D hovering tags that connected to other like things". The prototype's tags were **CSS only**:
`.chip`, `.chip.ext`, `.chip.team`, no hover handler, no linking, no connection of any kind. So this
is a new capability, not a recovery of a lost one, and it should be judged as one.

**Constraints it must meet:**

- Budget 8 (canvas hover, 50 ms) governs, and a Highlight may cross 1,000 ranked rows. Re-rendering
  rows per pointer move will not hold it. Drive it from **one** DOM write — a single injected rule
  matching a `data-` attribute — so the cost is independent of row count.
- Keyboard reachable and screen-reader sane. Tags currently sit **inside** the row button
  (`ImpactBoard.tsx`: "One row is one button"), and a button inside a button is invalid; the row needs
  restructuring before a Tag can be independently interactive.
- `prefers-reduced-motion` must disable the lift. The "3D" is a transform and a shadow, nothing more.
- A Highlight must never write to the URL — [`url-state.md`](./url-state.md) says the hash names the
  view, and a transient emphasis is not view state.

## The one-line lesson

The dataset did not break anything the code got wrong; it broke the things the code had been
**assuming without saying** — that an id reads as a name, that any scalar Attribute makes a sensible
grouping — and both had survived every test because every fixture shared the assumption.
