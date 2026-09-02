# Licensing

Resolves [Choose the repository's own licence](https://github.com/phix/appContextViewer/issues/18). What licence the viewer's own code carries, whose name is on it, and how bundled third-party licences are shipped. The elkjs question is settled separately in [ADR 0001](./adr/0001-elkjs-under-epl-2.0.md).

## Decisions

1. **MIT for everything the repository holds**: source, docs, research, the JSON Schema, the sample Catalogs and the generator. One licence, the same one every runtime dependency except elkjs uses, with the fewest obligations on anyone who deploys the viewer inside a company.
2. **Holder line: `Copyright (c) 2026 1337 Software`.** The repository's public git identity is deliberately minimal (`Nick <phix@users.noreply.github.com>`), the Vercel team and the public site are 1337 Software, and no earlier repository of Nick's sets a precedent (the licensed ones are forks). If 1337 Software is not the legal owner, the line becomes Nick's own name; nothing else changes.
3. **Files.** `LICENSE` at the repository root with the MIT text; `"license": "MIT"` in `package.json`; no SPDX headers in source files; no contributor licence agreement, since MIT inbound equals outbound.
4. **`THIRD-PARTY-NOTICES.md` is generated, committed and shipped.** MIT itself requires the copyright and permission notice of every bundled library to travel with the bundle, so the notices file is not only for elkjs. A build script generates it from the runtime dependencies actually bundled (Cytoscape, cytoscape-dagre, dagre, Preact, signals, elkjs with the EPL-2.0 text and source URL), the file is committed at the root, CI fails when it is stale, and the build copies it into the site, linked from the viewer's about or footer. Dev dependencies are not listed.
5. **CI licence allowlist over the runtime dependency tree**: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0 and Unlicense, plus EPL-2.0 for elkjs alone, checked on every push. Only what ships is checked: dev-only packages (the build tool's platform binaries under MPL-2.0, browser data under CC-BY-4.0, jsdom's helpers) never reach the bundle and are not gated, which the scaffold review (PR #31) confirmed is the only way the literal list passes without hand-maintained exceptions. A new runtime licence is a decision, not an accident.
6. **The schema's `$id`** stays the raw GitHub URL of `schema/catalog.v1.schema.json`; producers may fetch and vendor it under the same MIT terms.

## Rejected

- **No licence** (the state today): all rights reserved by default, so nobody may legally deploy the viewer or reuse the schema.
- **Apache-2.0**: the patent grant is irrelevant for a viewer and the NOTICE mechanics add ceremony for no gain.
- **A copyleft licence**: would collide with deploying the viewer inside companies and with the goal that producers vendor the schema freely.
- **Separate licences for docs or samples** (CC-BY and the like): two licences to explain for a repository whose docs and samples exist only to serve the code.

## Consequences

- **Slicing:** the scaffold slice adds `LICENSE`, the `package.json` field, the notices generator and its CI staleness check, and the allowlist check; the app shell slice links the notices file.
- **ADR 0001** stands; its notices requirement is now the general mechanism rather than an elkjs special case.
