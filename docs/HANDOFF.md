# Handoff — 2026-09-03

Short session: verified the prior (compacted) session's acme-cleanup work actually landed, then
chased why `viewer.1337-software.com` — the AT&T-safe custom domain — still isn't reachable. Root
cause found and half-cleared: the Cloudflare MCP plugin is now authorized, but this session's own
tool catalog can't see it, so the DNS record itself is still not created.

## The headline

**`viewer.1337-software.com` is still down, but the reason changed.** It used to be "nobody added
the DNS record." Now it's "the DNS record still isn't added, but the tool that can add it is
authorized and just needs a session that started after the authorization to actually call it."

## Current state

| what | value (verified this session) |
|---|---|
| `main` | `32b6299`, clean, in sync with `origin/main` |
| `npm run check` | green: **536 unit tests in 40 files**, build, bundle budgets, licences, notices |
| `npm run test:e2e` | not re-run this session; last known green (63 tests, one worker) from the prior session |
| `appcontextviewer.vercel.app` | live, serving the regenerated `ATT-IDPn` demo catalog correctly |
| `viewer.1337-software.com` | registered as a Vercel domain, **still not DNS-configured** — `dig +short viewer.1337-software.com` returns nothing; `vercel domains inspect viewer.1337-software.com --scope 1337-software` still warns "not configured properly" |
| `cloudflare-api` MCP | `claude mcp list` reports **Connected** (authorized via `/mcp` in an interactive terminal this session) — but unusable from this Code-tab session, see Blocked |
| open issues | `#40` (member-level Neighborhood highlighting — implementation already merged, see below), `#30` (slice index) |
| open PRs | none |

## What changed this session

- **Confirmed the acme-cleanup sweep and issue #40's implementation both already landed and
  pushed** from the prior (context-compacted) session — `32b6299` and `df6d6f2` on `origin/main`,
  nothing uncommitted. Re-ran `npm run check` clean: 536 tests (was 531 at the last handoff; not
  investigated, just reported as measured).
- **Diagnosed the AT&T-domain fix as never actually applied.** The plan from an earlier session was
  right — add `viewer.1337-software.com` as a Vercel domain, point it at Vercel with an `A` record —
  but the DNS record itself was never created. `1337-software.com`'s nameservers point to Cloudflare
  (`felicity`/`heidi.ns.cloudflare.com`), and no record for `viewer` exists there.
- **Nick authorized the `cloudflare-api` MCP plugin**, which needed an OAuth flow this (non-interactive)
  Code-tab session can't run. He opened a real terminal, ran `claude`, then `/mcp`, and authorized
  `plugin:cloudflare:cloudflare-api`. `claude mcp list` now shows it Connected.
- **Discovered that authorizing it there didn't make it usable here.** This session's `/mcp
  reconnect`/`enable`/`disable` are unavailable ("aren't available in this session"), and `ToolSearch`
  still returns zero `cloudflare-api` tools after the authorization — only the already-connected
  `cloudflare-docs` tools show up. The tool catalog was fixed when this session started, before the
  authorization existed.
- **Saved a memory note** (`vercel-app-blocked-att-custom-domain.md` in the auto-memory store) recording
  that a "the user was told the fix" claim is not the same as the fix landing — verify with `dig`
  before ever reporting this as working again.

## Blocked

- **The DNS record itself.** `cloudflare-api` is authorized but not callable from here. Needs either:
  a) a **fresh** Code-tab session started after this authorization (its tool catalog will include
  `cloudflare-api`'s DNS write tools), or b) continuing directly in the terminal session where `/mcp`
  was run. Once callable: create `A viewer.1337-software.com 76.76.21.21`, proxy **off** (grey cloud —
  Vercel needs to terminate its own TLS), on the `1337-software.com` zone. Then verify with
  `dig +short viewer.1337-software.com` and `vercel domains inspect viewer.1337-software.com --scope
  1337-software`.
- **Issue #40 is still open on the tracker** even though its implementation merged to `main` in
  `df6d6f2` — that was a direct push, not a PR, so nothing auto-closed it. Close it explicitly,
  referencing `df6d6f2`.
- **The `LICENSE` holder line is still an unconfirmed guess.** Reads `Copyright (c) 2026 1337
  Software`. Carried forward from the last handoff, still nobody's confirmed it.

## Known open bugs

None on `main`.

## Verify before you push

```bash
npm run check
```
Green this session: 536 unit tests, build, bundle budgets 13 and 14, licence allowlist, notices. ~33s.

```bash
npm run test:e2e
```
Not re-run this session — no code changed since the prior session's green run (63 tests, one worker).
Re-run before trusting it if anything touches `src/` or `samples/`.

## Traps

- **A Code-tab (desktop app) session cannot live-reconnect to a newly authorized MCP server.**
  `/mcp reconnect`, `enable`, and `disable` are all unavailable in this session type. Authorizing a
  server happens via `claude` + `/mcp` in a real interactive terminal; **using** it here needs a
  session that started after that authorization — this one doesn't retroactively pick it up.
- **A DNS-record instruction handed to Nick as manual steps is not the same as it being done.** An
  earlier session believed `viewer.1337-software.com` was fixed after handing over the exact `A`
  record to add — it never got entered on Cloudflare. Verify with `dig +short
  viewer.1337-software.com` or `vercel domains inspect … --scope 1337-software` before ever reporting
  this domain as working, don't trust a prior session's claim.

## Where the numbers disagree with the docs

Nothing new this session. Carried forward, unverified again: `docs/performance-budgets.md`'s
"Measured on the reference environment" table still names `ATT-IDP4/gateway-jobs/billing-api` /
799 / 838 ms for budget 3's row, even though `e2e/pane.spec.ts` was switched to
`ATT-IDP1/gateway-monorepo/archive` / 643 / 491 ms after `billing-api` failed a real run. The doc
row was never updated to match.

## Next, in order

1. From a fresh session (or the terminal session that ran `/mcp`), use the now-authorized
   `cloudflare-api` MCP to create `A viewer.1337-software.com 76.76.21.21` (proxy off) on Cloudflare,
   then verify with `dig` and `vercel domains inspect`.
2. Close issue #40 — implementation already on `main` via `df6d6f2`.
3. Have the group-by menu adopt `qualifiesAsGrouping` from `src/graph/grouping.ts` — still not
   called anywhere outside its own module and tests.
4. Confirm or change the `LICENSE` holder line.
5. Fix `docs/performance-budgets.md`'s stale budget-3 row (see "Where the numbers disagree", above).

## What this session taught, in one line

Authorizing an MCP server and being able to *call* it are two different events separated by a
session boundary — nothing is actually fixed until a fresh session proves the tool is callable and
the DNS record resolves.
