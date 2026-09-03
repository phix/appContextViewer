# Handoff — 2026-09-03

The viewer went from seven merged slices to a finished MVP, then past it. All eleven build slices are
merged, the site is deployed and public, and two capabilities that were not in the original spec — an
optional `name` on an Application, and Tags that Highlight their Group — are built and live. Four
performance budgets were re-decided from measurement, three of them because the original numbers had
never been measured at all.

## The headline

**`https://appcontextviewer.vercel.app` is live and styled, and it reads.** The APM-named Catalog at
`?src=./catalog.att.json` ranks `Common Logging Library` at the top — 118 of 141 Applications in its
Blast radius — rather than `ATT-IDP5/shared-libraries/apm10133`. Pointing at a Tag Highlights every
node sharing that Attribute across the table, the board and the canvas at once. This morning the repo
had no CSS at all.

## Current state

| what | value (verified this session) |
|---|---|
| `main` | `4ccb8a6`, clean, in sync with `origin/main` |
| `npm run check` | green: Biome, tsc, test-file claims, binary gate, **508 unit tests in 37 files**, build, bundle, licences, notices |
| `npm run test:e2e` | green: **59 Playwright tests**, ~1.2 min, one worker |
| initial bundle | 187.0 KB gzipped of the 250 KB budget (budget 13) |
| deployed | `appcontextviewer` on team `1337-software`, Git-connected, production branch `main` |
| build slices | **all 11 merged** (#19–#29) |
| open issues | #44 (Overview cap, in flight), #40 (member-level Overview highlighting), #30 (slice index) |
| open PRs | none |
| running agent | one slice-worker on #44, worktree `.claude/worktrees/slice-44` |

## What changed this session

- **The MVP finished.** The Neighborhood pane (#26) and the Overview (#27) merged, after review
  rounds that found real defects in both.
- **An APM-named Catalog exists and is loadable.** `samples/att/` — 141 Applications across five
  `ATT-IDP*` orgs, identified `apm10000`+ — plus an index and a details file. The build ships it, so
  the hosted viewer can load it; `samples/` is not served in production and a `?src=/samples/…` link
  404s there.
- **Schema v1 gained an optional `name` on an Application.** Additive, so still v1. An External always
  had one; an Application never did, because the id *was* the name. Everything reads it through one
  seam, `labelOf`.
- **Tags became operable.** Pointing at one Highlights its Group across three surfaces at once;
  choosing one sets the grouping Attribute. One injected CSS rule, not one write per row, which is how
  budget 8 holds across 1,000 ranked rows.
- **The repository got its first stylesheet**, brought by the tags slice because the feature could not
  be seen without one.
- **Vercel was connected and every claim in `docs/deploy.md` checked against the live API.**

## Blocked

- **Nothing needs a person.** #44 is with a worker; #40 is specified and unclaimed.
- **The `LICENSE` holder line is still a recommendation nobody confirmed.** It reads
  `Copyright (c) 2026 1337 Software`. Nothing depends on the string.
- **The private-Catalog path in `docs/deploy.md` has never been exercised.** Nick confirmed there is
  no private Catalog, so the deployment sets neither `CATALOG_URL` nor `CATALOG_TOKEN`. The runbook
  stays, flagged as written-from-documentation rather than observed.

## Known open bugs

None on `main`. Worth knowing what was fixed, because of what each looked like:

- **The "Show 100 more" button was unreachable.** Two-line rows made 100 rows a 4,642 px table inside
  a 535 px scroll box, stranding the paging control under a sticky header; Playwright reported a
  `<td>` intercepting the click, and a real user would have hit the same wall. Moved out of the scroll
  container into a footer. Caught by CI *after* a local run passed.
- **The Center card showed the raw id and the Markdown export lost every name.** `centerCardOf`
  carried `name` for Externals but not Applications. The card's own tests built their model by hand,
  so the broken code path was never executed.
- **The Overview's Dependency cap was implemented as a Depth fallback**, costing 162 Centers a whole
  Depth ring, and the test band was widened to match the code rather than the spec.

## Verify before you push

```bash
npm run check
```
Biome, tsc, test-file claims, the binary gate, 508 unit tests, build, bundle budgets 13 and 14, the
runtime licence allowlist, the notices file, and the deploy script's own tests. About 40 seconds.

```bash
npm run test:e2e
```
59 Playwright tests in Chromium against a static server over `dist/`. About 1.2 minutes. **Run it
whole, not file by file** — see Traps.

CI runs both at `BUDGET_FACTOR=4`. Read a PR's status with
`gh api repos/phix/appContextViewer/commits/<sha>/check-runs`, never `gh pr checks`.

## Traps

- **"It passes when I run it alone" is a result, not a flake report.** Half the browser suite asserts
  a duration, and `playwright.config.ts` ran parallel workers locally while CI ran one, so timed
  budgets were measuring the machine's load. Budgets 3, 4 and 6 all failed in whole-suite runs and
  passed file by file. Now one worker everywhere.
- **A persisted shell working directory puts commits on the wrong branch, silently.** A `cd` into a
  worker's worktree survived into later calls, so a `docs/tags.md` commit landed on that branch while
  `git push origin main` reported success. Use `git -C <path>` for every git call.
- **`gh issue view --comments` prints nothing and exits 0**; `gh pr checks` fabricates counts. Both
  are recorded in `docs/agents/issue-tracker.md` with the working commands.
- **The governing contract files this repo's briefs reference do not exist.** No
  `.claude/skills/slice/SKILL.md`, no `.claude/rules/`, no `.claude/scripts/`. Three workers reported
  this independently. No ownership guard has ever been in force; the discipline has been the workers'.
- **A `<button>` cannot nest in a `<button>`.** It cost a board-row restructure to make Tags operable.
- **Cytoscape will not give a compound parent a clickable band** — `padding` does not widen it and a
  tap resolves to the background. The Overview uses an explicit label chip. `Canvas.tsx` has the same
  pattern, harmless only because its Group boxes set `events: 'no'`.

## Where the numbers disagree with the docs

Four budgets moved, for four different reasons. `docs/performance-budgets.md` tabulates them so the
pattern is auditable rather than looking like drift:

| budget | what was wrong | what changed |
|---|---|---|
| 3 | the **number** was a design-time guess, wrong by ~20% | 500 ms → 750 ms |
| 4 | the **measurement** was one frame-quantized sample, 72–118 ms on identical work | the method (median of five); **ceiling unmoved** |
| 9 | the **input** was unbounded — 1,498 Group Dependencies over 123 nodes | capped at 700; **ceiling unmoved** |
| 11 | the **number** was never measured, on the one row already specified as long-running | 5 s → 10 s |

The rule: fix the input or the method first, and move a number only when the number itself is the
thing that was never measured.

## Next, in order

1. Land #44 (the 700-edge Overview cap), which turns budgets 9, 10 and 11 into real assertions.
2. Have the group-by menu adopt `qualifiesAsGrouping` from `src/graph/grouping.ts` — the predicate
   ships, the menu does not call it yet.
3. #40: member-level Neighborhood highlighting on `OverviewModel`.
4. Confirm or change the `LICENSE` holder line.
5. Consider a fixture that fails the cardinality rule outright; today's tests reconstruct one.

## What this session taught, in one line

Every defect that mattered was **an assertion that never touched its subject** — and the same shape
one level up produced the budget errors, where a number was read off a curve that did not describe
the thing being measured.
