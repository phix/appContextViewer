# Handoff — 2026-09-02

One session took appContextViewer from an empty repo with a wayfinder map to seven of eleven build slices merged on `main`. The morning charted and closed the map (seventeen planning tickets, spec written into `docs/`); the afternoon sliced it into eleven build tickets and shipped seven of them through a worker-then-adversarial-verifier-then-merge loop. Nick gave standing authorization mid-session: verified green PRs merge without asking.

## The headline

The viewer loads a Catalog and shows a ranked blast-radius table end to end. `npm run check` and `npm run test:e2e` are green on `main` at `a8adcd9` with 368 unit tests and 19 Playwright tests. This morning there was no `package.json`.

## Current state

| what | value (verified this session) |
|---|---|
| `main` | `a8adcd9`, clean, in sync with `origin/main` |
| `npm run check` | green: Biome, tsc, test-file claims, binary check (134 files), 368 tests in 28 files, build, bundle, licences, notices |
| `npm run test:e2e` | green: 19 Playwright tests |
| initial bundle | 23.2 KB gzipped of the 250 KB budget |
| wayfinder map #1 | closed; spec lives in `CONTEXT.md`, `docs/`, `schema/`, `samples/` |
| build epic #30 | open, the index of slices #19–#29 |
| merged slices | #19 scaffold, #20 catalog, #21 graph, #22 layout, #23 state, #24 shell, #28 deploy prep — all closed |
| open slices | #25 board (PR #38 open, CI in progress), #26 pane (blocked by #25), #27 Overview (blocked by #26), #29 Vercel connect (unblocked, human) |
| PR #38 | head `6cf6eee`, +1,574 lines, 14 files, MERGEABLE, both check runs `in_progress` at handoff time — **unverified** |
| running agent | one slice-worker on `slice/25-board`, worktree `.claude/worktrees/agent-af6417b498a0f4269` |
| stale worktrees | two verifier checkouts under the session scratchpad (`verify-34`, `verify-35`); remove with `git worktree remove --force` |

## What changed this session

- **The spec was decided and written down.** Seventeen wayfinder tickets settled the schema, the impact-first UX, grouping, performance budgets, validation surfacing, catalog sources, URL state, what can be a Center, the elkjs licence, module architecture, and the repo's own licence. Each lives in `docs/`; the map indexes them.
- **`samples/` became the fixture base.** A hand-written 34-Application demo Catalog, a deterministic generator, committed 200/500/1,000-Application fixtures, and a rule checker. Every performance number in the build cites these.
- **Seven slices shipped.** The scaffold (Vite, Preact, two Vitest projects, Playwright, Biome import rules, MIT licence, generated third-party notices, bundle and licence gates, CI); catalog load and validation with every schema code; the graph model and every query; layout behind one seam (dagre for the pane, elk in a Worker for the Overview); the signals store with derived view models and the URL seam; the app shell; and the Vercel deployment prep.
- **Four rtk hook defects were found and fixed** in `~/.claude/RTK.md` and the rtk config: Biome, tsc, and `gh pr checks` commands were being rewritten into wrong or fabricated output. All excluded and verified with `rtk hook check`.

## Blocked

- **#29, connecting the Vercel project, is yours alone.** Runbook: `docs/deploy.md`. Import `phix/appContextViewer` under team `1337-software`, set `CATALOG_URL` and `CATALOG_TOKEN` as sensitive, enable Deployment Protection, then open a protected preview at `?src=./catalog.json` and confirm the Catalog loads with no token in the network panel. Until that runs, **every Vercel fact in `docs/deploy.md` is research, not observation** — nothing has been checked against the live dashboard.
- **The LICENSE holder line is a recommendation you never confirmed.** `LICENSE` says `Copyright (c) 2026 1337 Software`. If that is not the legal owner, change it; nothing else depends on the string.

## Known open bugs

None open. Three found and fixed this session, each worth knowing because of what it looked like:

- **Report fold constants passed vacuously.** `GROUP_FOLD` and `UNKNOWN_KEY_IDS` were only ever asserted through themselves, so changing either kept every suite green while breaking the numbers `docs/validation-surfacing.md` names. Now pinned to their literals; mutating one turns the suite red.
- **A rejected Catalog left the budget-2 stopwatch running**, so a later unrelated row change would emit a wild timing measure. `App.tsx` clears it via `markLoadRejected`.
- **`e2e/server.d.ts` was inert.** TypeScript resolves `./server.mjs` to `server.d.mts`, so the declaration never applied and looked like a solved escalation. Renamed; a probe import now type-checks. `e2e/load.spec.ts` still carries an inlined no-CORS server that can now be deleted.

## Verify before you push

```bash
npm run check
```
Biome, tsc, test-file claims, the binary-file gate, 368 tests, build, bundle budgets 13 and 14, the runtime licence allowlist, the notices file, and the deploy script's own tests. About 40 seconds.

```bash
npm run test:e2e
```
19 Playwright tests in Chromium against a static server over `dist/`: the load path, the report, budget 2, the file:// guard, the elk chunk's code-splitting and EPL notice. About 15 seconds after a build.

CI runs both with `BUDGET_FACTOR=2`. Read a PR's status with `gh api repos/phix/appContextViewer/commits/<sha>/check-runs`, not `gh pr checks` (see Traps).

## Traps

- **`gh issue view <n> --comments` prints nothing** on gh 2.97.0, exit 0. Read comments with `gh api repos/phix/appContextViewer/issues/<n>/comments`. The tracker doc still names the broken command.
- **`gh pr checks` fabricates counts.** It reported 9 passed and 12 pending for a repo with two checks, both green. Excluded from rtk now, but use `gh api .../check-runs` when it matters.
- **CI runners measure roughly 2.5x the reference laptop**, which `BUDGET_FACTOR=2` does not cover. Two timing assertions flaked before their bounds were set from measurement rather than hope. Node sanity bounds are not the browser budgets; keep them apart.
- **Three concurrent heavy agents stall.** All three died at 600 seconds of no progress. Two workers plus one verifier is the safe shape. A model rate limit kills every running agent at once; worktrees survive, so resume where work exists and relaunch fresh where nothing was written.
- **Workers share the session scratchpad.** One overwrote another's PR body draft. Tell each to use a PR-specific filename.
- **A literal NUL byte makes git call a source file binary**, so 114 lines of a fixture builder rendered as "Binary files differ" and no reviewer saw them. `scripts/check-binary-files.mjs` now fails the check on any such file.

## Where the numbers disagree with the docs

- **The pane cap changed from nodes to nodes-and-edges.** `docs/performance-budgets.md` now caps at 150 nodes **and** 350 Dependencies, dropping Group boxes above the Dependency figure. Measured: 110 nodes at 240 Dependencies is 92 ms with Groups; 130 at 507 is 337 ms; the densest 150-node Neighborhood is 582–791 ms. The budgets doc wins.
- **Engine choice was settled by measurement, against the research's implication.** elk is *slower* than dagre at the cap (874 ms vs 678 ms). The pane keeps dagre. `docs/performance-budgets.md` and PR #34's review win over any reading of `docs/research/cytoscape-layouts.md`.
- **Budget 3 has never been measured in a browser with paint.** Every layout figure so far is Node-only. The pane slice must measure it; if it misses, that is a spec decision, not a bug.
- **The licence allowlist gates the runtime tree only.** `docs/licensing.md` records why: dev-only packages never ship, and gating them forced hand-maintained exceptions.

## Next, in order

1. Watch PR #38 (board) to green, run the slice-verifier against issue #25, land follow-ups, merge.
2. Dispatch #26, the Neighborhood pane — the first browser measurement of budget 3, and the slice most likely to return a spec question.
3. Dispatch #27, the Overview, after the pane merges.
4. Do #29 yourself: connect Vercel per `docs/deploy.md` and record the production URL there.
5. Delete the inlined no-CORS server in `e2e/load.spec.ts` now that `e2e/server.d.mts` resolves.
6. Fix the tracker doc's `gh issue view --comments` instruction.

## What this session taught, in one line

Every defect that mattered today was shaped the same way — a green check that proved nothing — so the verifier's habit of mutating the subject and demanding the test go red is what earned its keep, not its opinions.
