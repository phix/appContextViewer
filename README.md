# appContextViewer

A browser viewer for the dependency and relationship graph of hundreds of applications.

You give it a **Catalog** — one sparse JSON file where every record has a repository name and a
project name and everything else is optional — and it draws the graph around whichever Application
you are looking at: what it depends on, what depends on it, and how far that reach goes. It runs
entirely in the browser. There is no server, no database, no sign-in, and no credential: a Catalog
you open through the file picker never leaves your machine.

- **Load a Catalog** with the file picker, by dropping the file onto the page, or with
  `?src=<url>` — a relative path on the same origin, or an absolute URL whose host sends CORS.
- **Explore** from a Center: the columns and the pane show its neighbourhood at the Depth you
  choose, grouped by repository, team, kind, or any attribute your Catalog carries.
- **Share what you are looking at**: the URL carries the Catalog source in the query and the view
  in the fragment, so a link reopens the same screen.
- **See what is wrong with your Catalog** instead of guessing: a validation report names every
  rejected record and why.

Nothing is persisted. The Catalog, its source and its file are held in memory only.

## Running it

Node 24 or newer, then `npm ci`.

| command | what it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | production build into `dist/` (and the deployment's Catalog step, below) |
| `npm run preview` | serve the built `dist/` locally |
| `npm run check` | the full gate: lint, types, both Vitest projects, build, bundle budgets, licences |
| `npm run test` | unit tests only |
| `npm run test:e2e` | Playwright end-to-end tests (first run: `npx playwright install chromium`) |
| `npm run lint` | Biome |

`npm run check` is what CI runs, along with `npm run test:e2e`. Run it before opening a pull
request.

## Documentation

Start with the glossary — every capitalised term above is defined there.

- [`CONTEXT.md`](CONTEXT.md) — the glossary and the domain model.
- [`docs/architecture.md`](docs/architecture.md) — modules, seams, import rules, test strategy.
- [`docs/schema-v1.md`](docs/schema-v1.md) and [`schema/`](schema/) — the producer contract: what a
  Catalog must contain, and the JSON Schema that says so.
- [`samples/`](samples/README.md) — fixture Catalogs, including the sample the viewer ships with.
- [`docs/catalog-sources.md`](docs/catalog-sources.md) — where a Catalog may come from, and why the
  viewer never holds a token.
- [`docs/url-state.md`](docs/url-state.md) — what a link carries.
- [`docs/center.md`](docs/center.md) — the Center and the screens built around it.
- [`docs/performance-budgets.md`](docs/performance-budgets.md) — the numbers the build and the
  interaction must stay under.
- [`docs/validation-surfacing.md`](docs/validation-surfacing.md) — how a bad Catalog is reported.
- [`docs/licensing.md`](docs/licensing.md) and
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) — the licence obligations and the generated
  notices.
- [`docs/deploy.md`](docs/deploy.md) — hosting on Vercel, and how a private Catalog is published
  beside the viewer without any credential reaching the browser.
- [`docs/adr/`](docs/adr/) and [`docs/research/`](docs/research/) — the decisions and the
  primary-source research behind them.

The build is tracked in
[Build the viewer v1: slice index](https://github.com/phix/appContextViewer/issues/30).

## Licence

MIT — see [`LICENSE`](LICENSE). Bundled third-party code and its licences are listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
