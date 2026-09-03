# Handoff — 2026-09-03

Short session: verified the prior (compacted) session's acme-cleanup work actually landed, then
chased down and **fixed** why `viewer.1337-software.com` — the AT&T-safe custom domain — wasn't
reachable. Took two real fixes, not one: the DNS record, then an explicit certificate issuance
Vercel does not do automatically for an externally-DNS-hosted domain.

## The headline

**`viewer.1337-software.com` is live.** `curl -sI --resolve viewer.1337-software.com:443:76.76.21.21
https://viewer.1337-software.com/` returns `HTTP/2 200`. Getting there needed both the DNS `A`
record (created via the now-authorized `cloudflare-api` MCP) and a separate, non-obvious step:
`vercel certs issue viewer.1337-software.com --scope 1337-software`. The record alone left HTTPS
failing TLS handshake for ~11 minutes while plain HTTP on the same host already worked — Vercel
does not auto-provision a cert just because the DNS resolves.

## Current state

| what | value (verified this session) |
|---|---|
| `main` | `32b6299`, clean, in sync with `origin/main` |
| `npm run check` | green: **536 unit tests in 40 files**, build, bundle budgets, licences, notices |
| `npm run test:e2e` | not re-run this session; last known green (63 tests, one worker) from the prior session |
| `appcontextviewer.vercel.app` | live, serving the regenerated `ATT-IDPn` demo catalog correctly |
| `viewer.1337-software.com` | **live**, `HTTP/2 200`, cert issued — verified via `curl --resolve …:443:76.76.21.21` and (after a few minutes' local resolver lag) plain `dig` |
| `cloudflare-api` MCP | `claude mcp list` reports **Connected**; used successfully this session (from a session started after authorization) to create the `A` record |
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
- **In the next session** (fresh tool catalog, `cloudflare-api` now visible), created the DNS
  record: `A viewer.1337-software.com 76.76.21.21`, proxied off, on the `1337-software.com` zone
  (Cloudflare zone id `e6d9b812329490259d1587e2850d5ad3`). Confirmed via `vercel domains verify`
  that Vercel considered the domain correctly attached, verified, and DNS-valid — but HTTPS still
  failed `SSL_ERROR_SYSCALL` at the TLS Client Hello for ~11 minutes, while plain HTTP on the same
  host (forced via `--resolve`) already served the real app HTML. Isolated the cause by comparing
  against `appcontextviewer.vercel.app` on the same IP (`76.76.21.21`), which worked fine — proving
  the IP/edge was healthy and the gap was specific to this hostname's cert.
- **The actual fix**: `vercel certs issue viewer.1337-software.com --scope 1337-software`. Cert was
  live within ~10 seconds of that command succeeding. Vercel does not appear to auto-issue a cert
  for an externally-DNS-hosted (non-Vercel-nameserver) custom domain just because its `A` record
  resolves — this explicit step was required.
- **Saved a memory note** (`vercel-app-blocked-att-custom-domain.md` in the auto-memory store)
  recording the full two-step fix (DNS record + explicit cert issuance) and the diagnostic order to
  use if a similar domain looks broken again: DNS → HTTP via `--resolve` → HTTPS via `--resolve`.

## Blocked

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
  record to add — it never got entered on Cloudflare. This session fixed it directly instead.
- **A correct DNS record is not the same as a working HTTPS site on Vercel.** DNS resolving and
  `vercel domains verify` reporting "valid configuration" both held true for ~11 minutes while HTTPS
  still failed — the cert needed an explicit `vercel certs issue <domain> --scope <scope>`. Don't
  assume it'll auto-provision on an externally-DNS-hosted domain; check HTTP-via-`--resolve` first
  (proves routing/attachment) then HTTPS-via-`--resolve` (proves the cert) before concluding it's
  "just propagation."
- **This session's Bash sandbox silently blocks plain `curl`** — `curl -sI <url>` returns nothing, no
  error, even against a known-good site. Use `rtk proxy curl` for any real external HTTP check here.

## Where the numbers disagree with the docs

Nothing new this session. Carried forward, unverified again: `docs/performance-budgets.md`'s
"Measured on the reference environment" table still names `ATT-IDP4/gateway-jobs/billing-api` /
799 / 838 ms for budget 3's row, even though `e2e/pane.spec.ts` was switched to
`ATT-IDP1/gateway-monorepo/archive` / 643 / 491 ms after `billing-api` failed a real run. The doc
row was never updated to match.

## Next, in order

1. Close issue #40 — implementation already on `main` via `df6d6f2`.
2. Have the group-by menu adopt `qualifiesAsGrouping` from `src/graph/grouping.ts` — still not
   called anywhere outside its own module and tests.
3. Confirm or change the `LICENSE` holder line.
4. Fix `docs/performance-budgets.md`'s stale budget-3 row (see "Where the numbers disagree", above).

## What this session taught, in one line

Two things looked like the same fact and weren't: a DNS record resolving is not a working HTTPS
site, and an MCP server being authorized is not the same as this session being able to call it —
each needed its own explicit verification (`--resolve` past DNS to test the cert; a fresh session
to test the tool) before either was actually true.
