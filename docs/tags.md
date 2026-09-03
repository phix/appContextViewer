# Tags: a Group you can point at

Resolves item N8 of [the retrospective](./retrospective-2026-09-03.md). Vocabulary:
[`CONTEXT.md`](../CONTEXT.md) — **Tag**, **Group**, **Highlight**, **grouping Attribute**.

## What this is, and what it is not

The viewer already renders Tags on almost every surface: `Team: Billing Platform` and the Repository
chip on a board row, `External · database` in the ranked table, the Team chip on the Center card. It
treats them as decoration. They are not decoration — **each one names a set**, and the reader can
already see that two rows carry the same Tag but has no way to ask "what else".

So this adds no new relation to the model. `CONTEXT.md` already defines a **Group** as the set of
Applications sharing one value of one Attribute, and the Overview already lays out by a **grouping
Attribute**. The only new idea is that **the Attribute a Tag names need not be the current grouping
Attribute** — pointing at `Team: Billing Platform` should show you that Group whether or not the
Overview is currently grouped by Team.

**This was asked for as a restoration and it is not one.** The prototype's tags were CSS only —
`.chip`, `.chip.ext`, `.chip.team`, no hover handler, no linking. Judge it as a new capability.

## Behaviour

**Point at a Tag** — hover **or** keyboard focus, because a hover-only affordance does not exist for
anyone navigating by keyboard — and every node in that Tag's Group **Highlights**, simultaneously in
the ranked table, both impact-board columns, and the Neighborhood pane's canvas.

A **Highlight** is transient emphasis and nothing else:

- It **never changes the Center**. The board keeps reading what it was reading.
- It **never removes anything**. Non-members are de-emphasised, not filtered out; the row count does
  not change and neither does the ranking.
- It **never writes to the URL**. [`url-state.md`](./url-state.md) says the hash names the view, and
  a transient emphasis is not view state. A shared link must not carry someone's mouse position.
- It **clears** when the pointer or focus leaves, and on `Escape`.

**Choose a Tag** — click, or `Enter`/`Space` when focused — and its Attribute becomes the **grouping
Attribute**, which the Overview already knows how to lay out. Choosing does not change the Center
either; it changes how the Catalog is grouped.

This splits cleanly from what a row already does: **the row selects, the Tag groups.** A row click
still sets the Center, exactly as today.

## The Tags a node carries

Whatever the surface already shows, plus nothing invented for this feature:

| surface | Tags |
|---|---|
| ranked table row | the node's kind (`External · database`) |
| board row, Application | Repository, Team |
| board row, External | kind |
| Center card | Repository, Team, kind, and every scalar Attribute |

An Attribute whose value is not scalar is not a Tag; it has no Group to name.

## Constraints that decide the implementation

1. **Budget 8 governs: 50 ms.** A Highlight can cross 1,000 ranked rows and 150 canvas nodes. It
   must therefore cost **one DOM write, not one per row** — a single injected stylesheet rule
   matching a `data-` attribute already on each row, so the cost is independent of row count.
   Re-rendering rows from a signal on every pointer move will not hold the budget and must not be
   the mechanism.
2. **A Tag must be independently operable, which the current markup forbids.** `ImpactBoard.tsx` says
   "One row is one button", and a `<button>` inside a `<button>` is invalid HTML — browsers reparent
   it and the inner control stops working. The row must be restructured first: the row's own control
   and its Tags become siblings, not nested. Whatever replaces it must keep a row click selecting the
   node, which `e2e/board.spec.ts` already asserts.
3. **Keyboard and screen reader.** Each Tag is a real control with an accessible name that says what
   it does — not the bare value. A Highlight is decorative emphasis, so it is announced by nothing;
   `aria-pressed` on the chosen grouping Tag is what a screen reader should get.
4. **`prefers-reduced-motion: reduce` disables the lift.** The "3D" is one `transform` and one
   `box-shadow`, applied on hover and focus. Under reduced motion the Tag still highlights its Group;
   it just does not move.
5. **The Catalog decides how many Groups a Tag has, and some Attributes are useless as Groups.** See
   below.

## The cardinality rule (item N7)

`samples/att/` produced a 139-value Attribute on 141 Applications, which the group-by menu happily
offered as a grouping: 139 Groups of one. That is not a grouping, and pointing at such a Tag would
Highlight only the row it sits on.

**An Attribute qualifies as a grouping when it has at least two values and at most half as many
values as there are Applications carrying it.** The menu hides the rest; a Tag for a hidden Attribute
still renders and still Highlights, because "what else shares this exact value" is a fair question
even when the answer is usually "nothing" — it just cannot become the grouping Attribute.

The threshold is a judgement, not a measurement, and it is written here so it is one decision rather
than one per surface.

## What a first stylesheet has to settle

**The viewer has no CSS at all today** — no `.css` file exists in the repo, which is why every
screenshot so far is unstyled. This feature cannot be seen without one, so it brings the first
stylesheet, and that makes it the place where a few repo-wide choices get made: where styles live,
how they are loaded, and the token set (colour, spacing, radius) that later work extends.

Keep it small and boring. This is not a visual design pass and must not become one — the goal is
that a Highlight is visibly distinct from a non-Highlight, that the lift reads as a lift, and that
the existing surfaces stop looking broken. Anything beyond that is a separate decision.
