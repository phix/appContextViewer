# appContextViewer

Dependency and relationship graph viewer for hundreds of applications, fed by a sparse JSON catalog (every record has a repository name and a project name; everything else is optional).

Status: spec complete (wayfinder map #1 closed 2026-09-02). Build tracked in #30; slices #19–#29 carry File Ownership blocks and native blocking. Decisions live in `docs/`; do not re-decide them in a slice.

## Agent skills

### Issue tracker

GitHub Issues on `phix/appContextViewer` via `gh`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
