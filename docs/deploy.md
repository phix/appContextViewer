# Deploying the viewer

The hosted viewer is a plain Vite static build on Vercel: no functions, no server code, no
database. Why Vercel and not GitHub Pages, with every claim tied to a primary source:
[`research/static-hosting.md`](./research/static-hosting.md) and
[`research/static-hosting-sources.md`](./research/static-hosting-sources.md). Why a private Catalog
arrives at build time instead of through a token in the browser:
[`catalog-sources.md`](./catalog-sources.md), decisions 1 and 3.

Everything an agent can prepare is committed: [`vercel.json`](../vercel.json),
[`scripts/fetch-catalog.mjs`](../scripts/fetch-catalog.mjs) and the `build` script that chains them.
What is left is the part that needs a signed-in human in the Vercel dashboard, and that is this
runbook.

**Production URL:** <https://appcontextviewer.vercel.app> — live, public, serving the bundled
sample Catalog. Project `appcontextviewer` (`prj_fISpmuxYKxTxSAkgsL1i4iRTy6XK`) on team
`1337-software`, Git-connected to `phix/appContextViewer` with production branch `main`.

## Verified against the live project (2026-09-02)

Everything above this line was research until the project existed. These are the facts as the live
API reports them, and where the runbook below was written from documentation, this section says
whether reality agreed.

| claim | as measured |
| --- | --- |
| team and plan | `1337-software`, **hobby** — so every Hobby caveat below applies |
| the three `vercel.json` settings survive import | framework **Vite**, build `npm run build`, output `dist`, all three live |
| Node version | **24.x**, taken from `engines` with no dashboard edit |
| production branch | `main` |
| a build with no `CATALOG_URL` | log ends `fetch-catalog: CATALOG_URL is unset, so no Catalog is placed beside the viewer.` — the exact line step 4 predicts |
| build time | 11 fetch-script tests pass, `vite build` in 133 ms, deployment Ready in 13 s |
| Vercel Authentication | on, `deploymentType: all_except_custom_domains`; password protection is off (it is the paid add-on) |

**The Hobby protection boundary, measured rather than inferred.** With Vercel Authentication on, an
unauthenticated request to the **deployment URL** `appcontextviewer-<hash>-1337-software.vercel.app`
answers **302 to `vercel.com/sso-api`**, while the same request to the **production alias**
`appcontextviewer.vercel.app` answers **200 with the page**. So protection covers previews and
per-deployment URLs, and the production alias is public — which is what makes the scoping rule in
step 5 load-bearing rather than cautious: on Hobby, `CATALOG_URL` and `CATALOG_TOKEN` belong to
**Preview only**, because a Production-scoped Catalog would be readable by anyone with the alias.

**One live warning the docs did not predict.** The build log says `"engines": { "node": ">=24" }`
*will automatically upgrade when a new major Node.js Version is released*. An open range means a
future Node 26 silently becomes the build runtime. That is fine today and worth pinning the day a
build breaks for no reason anyone changed.

**Creating the project needs the CLI, not the MCP server.** The Vercel MCP connection can read
teams and projects but answers **403 `forbidden`** on project creation and **404** on the
deployment-protection endpoint. `vercel link --yes --scope 1337-software --project appcontextviewer`,
signed in as `phix-4747`, created the project *and* connected the GitHub repository in one step.

## What is already decided in the repository

`vercel.json` pins three settings, so a dashboard override cannot silently change them:

| key | value | why |
| --- | --- | --- |
| `framework` | `vite` | the zero-configuration preset; Vercel detects Vite anyway, this makes it explicit |
| `buildCommand` | `npm run build` | the preset's own default, pinned because this is the command that also fetches the Catalog |
| `outputDirectory` | `dist` | only the contents of the output directory are served statically |

There is no `functions` key and there is nothing to add one for: a plain Vite build has no
server-side code, and Vercel's framework matrix lists SSR as not applicable for Vite.

There is also **no `rewrites` entry**, deliberately, though Vercel's Vite guide suggests one for
SPAs. This viewer has no path-based routes — a link is `/?src=…#app=…&depth=…`, per
[`url-state.md`](./url-state.md), so the query and the fragment carry every deep link and the path
is always `/`. A catch-all rewrite to `/index.html` would additionally *break* deep paths rather
than serve them, because `vite.config.ts` sets `base: './'`: `index.html` served at `/a/b` would
resolve its hashed asset URLs against `/a/`, which does not exist. A 404 on a stray path is the
better answer. Revisit this only if the viewer ever grows a real route.

`npm run build` runs three things in order: the unit tests for the fetch script, `vite build`, then
the fetch script itself. The tests run inside the build on purpose — see "Why the tests run during
the build" below.

## Runbook: create the project (once)

Account: team **`1337-software`**, user **`phix-4747`**. **This has been done** — steps 1 to 4 are
recorded here for the next environment, and their outcomes are in the table above. The one-command
equivalent of steps 1 and 3, which is what was actually run:

```bash
vercel link --yes --scope 1337-software --project appcontextviewer
```

1. **Import the repository.** Vercel dashboard → the `1337-software` team → **Add New… → Project**
   → **Import Git Repository** → `phix/appContextViewer`. If the repository is not listed, use
   **Adjust GitHub App Permissions** and grant the Vercel GitHub App access to it.
2. **Confirm the build settings.** The import screen should show **Framework Preset: Vite**, build
   command `npm run build`, output directory `dist`, install command inferred from
   `package-lock.json`. These come from `vercel.json` and need no editing; if the screen disagrees
   with the table above, stop and fix `vercel.json` rather than the dashboard, so the setting stays
   in version control. Node version: the project requires **Node 24 or newer** (`engines` in
   `package.json`); set the Node.js Version in **Settings → Build and Deployment** to match.
3. **Confirm the Git behaviour.** **Settings → Git**: production branch **`main`**, so every push to
   `main` deploys production, and every pull request gets its own preview deployment. Both are the
   defaults for a Git-imported project; confirm rather than change them.
4. **Deploy once without a Catalog.** The first deployment needs no environment variables. With
   `CATALOG_URL` unset the fetch script does nothing and exits 0, and the site ships with the bundled
   sample Catalog. Confirm the build log contains
   `fetch-catalog: CATALOG_URL is unset, so no Catalog is placed beside the viewer.`

## Runbook: publish a private Catalog

**Not in use.** The deployment ships the bundled sample Catalog and sets neither variable — Nick
confirmed on 2026-09-02 that there is no private Catalog to point at
([issue #29](https://github.com/phix/appContextViewer/issues/29)). Everything below is the path if
that changes; **none of it has been exercised against a real private source**, so treat the steps as
written-from-documentation, not observed. The `fetch-catalog` script itself is covered by 11 tests
that run inside every build, including one asserting the token never reaches the log.


Real Catalog data never enters this public repository. It arrives at build time, from a location
only the build machine can read, and lands beside `index.html` as `dist/catalog.json`.

5. **Add the environment variables.** **Settings → Environment Variables**:

   | name | value | environments | sensitive |
   | --- | --- | --- | --- |
   | `CATALOG_URL` | where the build fetches the Catalog from | the environments that should carry real data | yes |
   | `CATALOG_TOKEN` | the credential that URL needs, if any | the same environments | yes |

   Mark **both** as **Sensitive**. A sensitive variable can be written and used by a build but never
   read back in the dashboard or the API, which is what you want for a credential nobody needs to
   see again. `CATALOG_TOKEN` is optional: if the source is reachable without a credential — a
   signed URL, an allow-listed bucket — set only `CATALOG_URL` and the build sends no
   `Authorization` header at all.

   Scope them deliberately. On Hobby only previews can be protected (step 6), so on Hobby these
   belong to **Preview** only; putting them on Production there would publish real data on a public
   URL. On Pro, with production protected, they can go on both.

6. **Turn on Deployment Protection.** **Settings → Deployment Protection → Vercel Authentication**.
   Read the plan caveat plainly:

   - **Hobby**: only **Standard Protection** is available, which gates **preview deployments only**.
     Your **production domain stays publicly accessible**, whatever else you configure. A private
     Catalog on Hobby is therefore a *preview-only* arrangement.
   - **Pro or Enterprise**: **All Deployments** protection gates production too. This is what a
     private production viewer requires. Password Protection is a separate paid add-on and is not
     needed here — Vercel Authentication (team members sign in with their Vercel account) is
     sufficient and cheaper.
   - Hobby is also licensed for non-commercial personal use only, so a work Catalog needs Pro
     regardless of the protection question.

7. **Redeploy** so the build picks up the new variables (**Deployments → … → Redeploy**, or push a
   commit). The build log should say
   `fetch-catalog: fetching <origin>/<path> with a bearer token.` followed by
   `fetch-catalog: wrote …/dist/catalog.json (N bytes)`. The token itself never appears in the log:
   the script redacts it and prints the URL without its query string.

   If the fetch fails, the **build fails** — deliberately. A deployment that quietly lost its
   Catalog is indistinguishable from one that never had it. The message names either the HTTP status
   (`answered 403 Forbidden`), the network error, or the case where the host answered `200` with
   something that is not JSON, which is almost always a sign-in page and means the token is not
   reaching the host.

## Verify it (the check that matters)

Do this on a **preview** deployment, which is protected on every plan.

1. Open the preview URL and sign in at the Vercel Authentication prompt. Getting the prompt is
   itself the evidence that protection is on.
2. Open the viewer at **`<preview-url>/?src=./catalog.json`**.
3. Confirm the private Catalog loads — the header and the ranked table show *your* Applications, not
   the sample's.
4. Open the browser's **network panel**, reload, and inspect the request for `catalog.json`:
   - the **request headers contain no `Authorization` header** and no token anywhere;
   - the request goes to the **same origin** as the page, so there is no CORS preflight;
   - it carries the deployment's own session **cookie**, which is what authorises it.

   That is the whole point of the arrangement, and it is checkable in ten seconds: the credential
   lives in the build, the browser holds nothing but a login cookie it already had.
5. In a private window (not signed in), the same preview URL must show the Vercel login page and
   never the Catalog.

## Why the tests run during the build

`npm run build` starts with `node --test scripts/fetch-catalog.test.mjs`. That is unusual and it is
a deliberate second choice.

The natural home for those tests is Vitest, but `vitest.config.ts` claims only
`src/{catalog,graph,layout,state,app,view}/**`, and `scripts/check-test-files.mjs` fails
`npm run check` on any test file no project claims — so a test under `scripts/` would either be
silently never run or would red the gate, and the slice that added this script owns neither
`vitest.config.ts` nor `src/`. `npm run check` (which CI runs) calls `vite build` directly rather
than `npm run build`, so it does not reach these tests either.

Chaining them into `build` is the one place inside those constraints where a machine still checks
the script: every local `npm run build` and, more importantly, **every Vercel deployment** runs
them, so a broken fetch step fails the deploy instead of shipping. They are hermetic — an injected
`fetch`, a temp directory, no network — and finish in well under a second.

If a later change is free to touch `vitest.config.ts`, the better home is a Vitest project that
claims `scripts/**`, and this line in `build` should go away with it.
