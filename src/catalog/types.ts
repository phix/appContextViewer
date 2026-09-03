/**
 * Schema v1 types (docs/schema-v1.md, schema/catalog.v1.schema.json) and the shapes the module
 * returns. The Catalog types mirror the JSON exactly: optional keys are optional here too and no
 * defaults are applied, so a valid document, a hand-written literal and the object `validateCatalog`
 * returns all have the same type.
 */

/** Free-form producer fields. Scalar values can drive grouping; other values are display only. */
export type Attributes = Record<string, unknown>;

export type Application = {
  /** Repository name. May contain `/`, never whitespace or a leading or trailing `/`. */
  repository: string;
  /** Name within the Repository. No `/`, no whitespace. */
  project: string;
  /**
   * Human-readable name, for display and search. Absent whenever the id already reads as one;
   * present whenever `project` is opaque (docs/schema-v1.md, "When the id names nothing").
   */
  name?: string;
  kind?: string;
  team?: string;
  description?: string;
  url?: string;
  /** Application ids (`repository/project`) and External refs (`external:<id>`). */
  dependsOn?: string[];
  publishes?: string[];
  subscribes?: string[];
  attributes?: Attributes;
};

export type External = {
  /** Referenced from `dependsOn` as `external:<id>`. No `/`, no whitespace. */
  id: string;
  kind: string;
  name?: string;
  description?: string;
  url?: string;
  attributes?: Attributes;
};

export type Catalog = {
  schemaVersion: 1;
  generatedAt?: string;
  source?: string;
  applications: Application[];
  externals?: External[];
};

/** Every code the module emits, in the order the report groups them (docs/validation-surfacing.md). */
export const FINDING_CODES = [
  'E_FETCH',
  'E_TOO_LARGE',
  'E_PARSE',
  'E_SCHEMA_VERSION',
  'E_INVALID',
  'E_DUPLICATE_APPLICATION',
  'E_DUPLICATE_EXTERNAL',
  'E_UNRESOLVED_REF',
  'E_SELF_DEPENDENCY',
  'W_UNKNOWN_KEY',
  'W_DUPLICATE_ENTRY',
  'W_INVALID_FORMAT',
  'W_EMPTY_CHANNEL',
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/**
 * One report row. `path` is the JSON location in the `applications[17].dependsOn[2]` form (`''` for
 * the document as a whole); `id` is the Application id (`repository/project`) or External id when
 * the row belongs to one; `value` is the offending value. Per code: `W_UNKNOWN_KEY` carries the key
 * name in `value`, `W_EMPTY_CHANNEL` carries the Channel name in `value` and points `path` and `id`
 * at the first Flow naming it, `E_TOO_LARGE` carries the byte count.
 */
export type Finding = {
  code: FindingCode;
  path: string;
  id?: string;
  message: string;
  value?: unknown;
};

/** `catalog` is present exactly when `errors` is empty. */
export type ValidationResult = {
  catalog?: Catalog;
  errors: Finding[];
  warnings: Finding[];
};

export type CatalogSource = { kind: 'file' | 'url'; name: string };

export type LoadResult = ValidationResult & { source: CatalogSource };

export type LoadDeps = {
  /** Injected for tests; defaults to the global `fetch`. Never carries a credential. */
  fetch?: typeof fetch;
  /** Refuse documents larger than this before parsing. Defaults to `MAX_CATALOG_BYTES`. */
  maxBytes?: number;
  /** What a relative URL resolves against. Defaults to the page location when there is one. */
  base?: string | URL;
};
