# Static hosting and private catalog loading

Resolves [Research: static hosting and private catalog loading](https://github.com/phix/appContextViewer/issues/5).

**Question.** Where does the built static viewer live, and how does it load a private Catalog? Compare GitHub Pages and Vercel for a Vite build of this public repo; check whether `?src=<url>` works against typical private hosts; check whether opening the built `index.html` from disk must keep working.

**Answer.**
- **Host on Vercel.** Decided by Nick during this ticket ("use my Vercel"); GitHub Pages was the cheaper default but Vercel wins on the one thing Pages cannot do: **Deployment Protection** gates a deployment behind Vercel login, which turns the private-Catalog problem into a same-origin file next to the viewer, with no CORS and no token in the browser. Caveat from the docs: on **Hobby** that protection covers **preview deployments only** and production stays public; gating production needs **Pro**, and Password Protection needs the paid Advanced Deployment Protection add-on. Hobby is also licensed for non-commercial personal use only, so a work catalog needs Pro regardless. Deploy is the Vite framework preset from the GitHub integration, no functions, with one SPA rewrite to `index.html`. Plan limits, custom domain and protection details are in [static-hosting-sources.md](./static-hosting-sources.md).
- **Loading a Catalog: file picker and drag-drop are the primary path.** They need no CORS, no token and no host, and they work from every origin including `file://`. `?src=<url>` is a convenience for URLs that already send `Access-Control-Allow-Origin: *` (public GitHub raw, gists, jsDelivr, any bucket with a CORS rule) and for a **same-origin `?src=./catalog.json`** on a protected Vercel deployment. A **private GitHub repository is reachable only through the REST contents API with a token**, never through `raw.githubusercontent.com`; whether the viewer should accept a token at all is a security decision, ticketed separately.
- **Running from disk is possible only as a single-file build**, and the Catalog must then arrive through the file picker, because `fetch()` of a sibling file is refused on `file://`. Whether disk support is required is a product decision, ticketed separately.

## Measured: CORS at the usual "just put the JSON somewhere" hosts

Probed 2026-09-02 with `curl` sending `Origin: https://phix.github.io`. Simple `GET`, and a preflight `OPTIONS` asking to send an `Authorization` header (what a private fetch needs).

| host | simple GET | preflight with `Authorization` | verdict |
|---|---|---|---|
| `raw.githubusercontent.com` (public file) | 200, `access-control-allow-origin: *` | **403** on `OPTIONS` | public files only; a browser cannot send a token here, so private raw URLs are dead on arrival |
| `cdn.jsdelivr.net/gh/…` | 200, `allow-origin: *`, `expose-headers: *`, cached 7 days | 200 | public files only; note the week-long CDN cache |
| `gist.githubusercontent.com/…/raw/` | 200, `allow-origin: *` | not probed (same service as raw) | public gists only |
| `api.github.com/repos/…/contents/…` | 200, `allow-origin: *` | **204**, `allow-headers` includes `Authorization`, `max-age: 86400` | works for private repos with a token; response is base64 in JSON unless `Accept: application/vnd.github.raw+json` |

Consequences:
- A private Catalog on GitHub is fetchable from the browser only via `api.github.com` with a fine-grained PAT scoped to that repo's contents. The token lives in the user's browser, so the viewer would be handling a credential. Decision needed.
- `Access-Control-Allow-Origin: *` cannot be combined with cookies, so "the user is already logged in to the intranet host" never helps a cross-origin fetch. An intranet host must either send an explicit CORS allow for the viewer's origin, or serve the viewer itself (same origin, no CORS at all).
- The simplest private setup that needs no token is therefore **same-origin**: put `catalog.json` next to the built viewer on whatever host already gates access, and load it with a relative `?src=./catalog.json`.

## Measured: opening the built viewer from disk

Test page under `file://` in Chrome for Testing 151 (Playwright's headless shell), then the same page over `http://localhost` as control.

| feature | `file://` | `http://` |
|---|---|---|
| classic inline `<script>` | runs | runs |
| `<script type="module" src="./a.js">` | **blocked**: `Access to script at 'file:///…/a.js' from origin 'null' has been blocked by CORS policy` | runs |
| inline `<script type="module">` importing `./a.js` | **blocked** (same reason) | runs |
| `fetch('./catalog.json')` | **fails**: `Fetch API cannot load file:///…/catalog.json. URL scheme "file" is not supported.` | ok |

Consequences:
- A default Vite build (module script tags pointing at hashed chunks) does not run from disk in Chrome. Only a build with every script and style inlined into one HTML file does; `vite-plugin-singlefile` is the community tool for that (status in the sources doc).
- Even inlined, the viewer cannot read a Catalog file next to it on disk. Disk mode means file picker or drag-drop, and a lazy-loaded layout chunk (the elk worker recommended by the layout research) cannot be lazy on `file://` either; it must be inlined or the disk build must fall back to dagre/fcose.
- `localStorage` and `FileReader` are unaffected, so "remember the last Catalog" still works on disk.

## Recommendation

1. **Vercel**, Vite framework preset, connected to `phix/appContextViewer` through the GitHub integration so every push to `main` deploys production and every PR gets a preview. No functions, no server code. The sample Catalog ships with the site; real Catalogs never enter the repo. When a private Catalog needs hosting, enable **Deployment Protection** and place `catalog.json` beside the build, then open the viewer with `?src=./catalog.json`; the relative fetch carries the auth cookie. On Hobby this only works on preview URLs, so a private production viewer means the Pro plan. Vercel Blob is not a shortcut: public blobs are world-readable, private blobs need a Function. Target account: team `1337-software`, user `phix-4747`, no project exists yet.
2. **Catalog sources, in priority order:** file picker and drag-drop (always); `?src=` relative URL for same-origin deployments; `?src=` absolute URL only when the host sends CORS, with a clear error naming CORS when it does not; GitHub private via API token only if the security ticket says yes.
3. **Disk support is opt-in**, produced as a separate single-file build target if the product ticket says it is required. The default hosted build stays a normal Vite build so code-splitting and the layout worker work.

## New decisions surfaced

- Must the viewer run from disk (`file://`)? If yes: a second, single-file build target with no lazy chunks and no `?src=`.
- May the viewer accept a GitHub token for private Catalogs over the contents API, and how is it stored? If no: private Catalogs load only via file picker or same-origin hosting.
