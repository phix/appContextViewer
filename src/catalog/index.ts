/**
 * catalog: from a source to a validated Catalog (docs/architecture.md).
 *
 *   loadCatalog(source, { fetch, maxBytes, base }) -> Promise<LoadResult>
 *   validateCatalog(document) -> ValidationResult
 *
 * Invariants: `catalog` is present exactly when `errors` is empty; every rule runs and every finding
 * is collected before returning, capped at MAX_FINDINGS rows with errors first; `E_SCHEMA_VERSION`
 * short-circuits the schema and semantic rules; the load-stage codes (`E_FETCH` naming CORS,
 * `E_TOO_LARGE` at MAX_CATALOG_BYTES, `E_PARSE` with line and column) come alone. The three
 * downgrades (`W_UNKNOWN_KEY`, `W_DUPLICATE_ENTRY`, `W_INVALID_FORMAT`) are applied here: the
 * returned Catalog drops unknown keys and duplicate list entries and keeps display-only fields as
 * written. Findings are ordered as the report groups them (FINDING_CODES), document order within a
 * code. `validateCatalog` is pure; `loadCatalog` takes its `fetch` as a parameter.
 */
export { GITHUB_HINT, loadCatalog, MAX_CATALOG_BYTES } from './load';
export type {
  Application,
  Attributes,
  Catalog,
  CatalogSource,
  External,
  Finding,
  FindingCode,
  LoadDeps,
  LoadResult,
  ValidationResult,
} from './types';
export { FINDING_CODES } from './types';
export { MAX_FINDINGS, validateCatalog } from './validate';
