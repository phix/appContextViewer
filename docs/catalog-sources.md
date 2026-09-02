# Catalog sources

Resolves [Decide whether the viewer may hold a GitHub token for private Catalogs](https://github.com/phix/appContextViewer/issues/15). Where a Catalog comes from, and how a private one stays private without the viewer ever holding a credential. Facts behind it: [`research/static-hosting.md`](./research/static-hosting.md). Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## Decisions

1. **The viewer never holds a credential.** No GitHub token, no token paste field, no OAuth or device flow, no `Authorization` header sent from the browser, nothing secret in `localStorage` or `sessionStorage`. The loader's injectable `fetch` exists for tests, not for tokens.
2. **Three supported sources, in priority order.**
   - **File picker and drag-drop.** Works on every origin, needs no host, no CORS and no token. The primary path.
   - **`?src=<relative path>`, same origin.** How a private Catalog is served: `catalog.json` sits beside the built viewer on a deployment gated by Vercel Deployment Protection (or on any intranet host that serves the viewer itself). The relative fetch carries the host's own session cookie; the viewer knows nothing about it.
   - **`?src=<absolute URL>`, only when the host sends `Access-Control-Allow-Origin` for a plain GET**: public raw GitHub files, gists, jsDelivr, a bucket with a CORS rule. A host that refuses gets `E_FETCH` naming CORS.
3. **The token belongs to the deployment pipeline, not the browser.** To publish a private Catalog: the deployment's build step fetches `catalog.json` from the producer's private location with a server-side secret held in the host's environment variables, writes it next to `index.html`, and the deployment is protected. Real data never enters the public repository; the secret never reaches a browser. On Vercel's Hobby plan only preview deployments can be protected; a protected production viewer needs Pro. If no secret is configured, the build ships the sample Catalog alone.
4. **A private GitHub URL gets a specific hint.** When `?src=` names `github.com` or `raw.githubusercontent.com` and the fetch fails, the `E_FETCH` row adds: "Private files on GitHub cannot be loaded by the viewer. Download the file and open it, or publish it beside the viewer." The report's Choose another file action is one click away.
5. **No Catalog content is persisted in the browser.** The viewer keeps a loaded Catalog in memory only. UI preferences (last Depth, grouping Attribute) may persist; the Catalog, its source URL and its file never do. Reopening a file means the picker again; a URL source lives in the address bar, which the URL-state ticket decides.

## Rejected

- **A token pasted per session, memory only.** Still a credential in a static page's JavaScript heap and therefore a target for any script injected into the page, and a fine-grained token with contents read covers the whole repository, never one file. The viewer would become the reason to steal tokens.
- **A token in `localStorage`.** The same, persisted.
- **OAuth or a GitHub App.** Needs a client secret or a backend, and login is out of scope.
- **A serverless proxy that fetches private files.** No backend, by decision.
- **Remembering the last Catalog in `localStorage`.** Private data at rest on a shared machine, for a convenience the picker covers in two clicks.

## Consequences

- **Slicing:** the loader ships with the CORS message and the GitHub hint; there is no token UI to build. A build-ticket acceptance test loads `?src=./catalog.json` same-origin and a cross-origin URL without CORS and checks both outcomes.
- **URL state:** `?src=` relative and absolute both remain valid link content; nothing secret ever appears in a URL.
- **Hosting:** the Vercel project needs, at most, a build-time secret and Deployment Protection; the viewer code has no branch for private hosts.
