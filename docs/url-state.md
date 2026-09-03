# URL state and deep links

Resolves [Decide URL state and deep links](https://github.com/phix/appContextViewer/issues/16). What a link carries, how the viewer writes it, and what happens when it does not match the loaded Catalog. Lands in the `state/url.ts` seam from [`architecture.md`](./architecture.md). Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## Shape

```
https://viewer.example.com/?src=./catalog.json#app=acme/commerce/order-service&depth=3&group=team&view=overview
                            \_______________/ \____________________________________________________________/
                              data (query)                            view (hash)
```

1. **The query names the data, the hash names the view.** `?src=` stays in the query, resolved relative to the page URL and fetched as [`catalog-sources.md`](./catalog-sources.md) decides. Every view key lives in the fragment. The fragment never reaches the server, so internal Application ids stay out of access logs; a slash in an id reads raw there; and fragment edits never trigger a navigation.
2. **Four view keys, fixed order, defaults omitted, empty hash removed.**

| key | value | default | meaning |
|---|---|---|---|
| `app` | an Application id, raw slashes | none | the Center, when it is an Application |
| `external` | an External id | none | the Center, when it is an External; mutually exclusive with `app` |
| `depth` | a positive integer or `all` | `2` | the header Depth, applied to both columns and the pane |
| `group` | `none`, `repository`, `team`, `kind`, or an `attributes` key | `repository` | the grouping Attribute (the menu's value verbatim; built-in names win over a colliding key) |
| `view` | `overview` or `space` | absent | the canvas is expanded to the Overview, or to the Space ([`space-view.md`](./space-view.md)); mutually exclusive |

3. **Not in the URL:** open Groups (transient; the selection's Group auto-opens on arrival, per the grouping decision), search text, whether the report is open, scroll and hover. Filters, once the search-and-filter fog is resolved, join the hash under their own keys.
4. **History.** A change of `app` pushes a history entry, so Back returns to the previous Application; changes of `depth`, `group` and `view` replace the current entry. `popstate` and `hashchange` apply the URL to the store, which makes the URL the source of truth for view state: the store writes it, and reads it back on navigation.
5. **A deep link naming an Application that is not in the loaded Catalog** shows the default screen (the ranked table) with a dismissible inline notice, "`acme/x/y` is not in this Catalog", and strips `app` from the hash. When the current Catalog is the sample, the notice adds "Load your Catalog to open it." Loading a new Catalog re-validates the selection: kept if present, otherwise cleared with the same notice.
6. **Invalid values.** Unknown keys are ignored and dropped on the next write; an unparsable or out-of-range `depth` or an unknown `group` falls back to its default and is stripped.
7. **Ordering at load.** `?src=` loads first; the hash is applied to whatever Catalog is current once loading settles. If `src` fails, the report dialog shows over the sample and the hash is applied to the sample.
8. **A picker-loaded Catalog is never identified by the URL.** No persistence, so a copied link reproduces the view only for someone who loads the same file; rule 5 covers the mismatch. A reload after a picker load shows the sample with the notice.
9. **Encoding.** The fragment is parsed and written with `URLSearchParams`; the writer restores raw `/` in ids, and the reader accepts both raw and percent-encoded forms.

## Rejected

- **Everything in the query string.** Ids with slashes turn into `%2F` soup, view changes become server-visible, and every `replaceState` competes with `?src=`.
- **Open Groups in the URL.** Expand all is 123 values at 1,000 Applications; the auto-opened Group of the selection is the part of that state a link needs.
- **Search text in the URL.** Transient; the results are a dropdown, not a screen.
- **Replace-only history.** Back is the natural "previous Application" for an exploration tool.
- **Silently ignoring a missing Application.** The reader would see the sample's ranked table and assume the link was to that.

## Consequences

- **Slicing:** one slice owns `state/url.ts` with Vitest tests for read, write, defaults, invalid values and the raw-slash round trip, and one Playwright test that opens a deep link on the served 1,000-Application fixture and asserts the board, Depth, grouping and Overview state, plus the missing-Application notice.
- **External or Channel as Center:** decided; `external=<id>` is a key, `channel=` stays reserved and unused because a Channel is never a Center (see [`center.md`](./center.md)). The missing-Center notice in rule 5 applies to both kinds.
- **Validation surfacing:** the missing-Application notice is an inline notice, not a report row; it is view state, not a Catalog finding.
