import type {
  Application,
  Catalog,
  External,
  Finding,
  FindingCode,
  ValidationResult,
} from './types';
import { FINDING_CODES } from './types';

/** The report holds at most this many rows, errors first (docs/validation-surfacing.md, decision 7). */
export const MAX_FINDINGS = 1000;

// The patterns of schema/catalog.v1.schema.json, verbatim. The agreement test keeps them honest.
const RE = {
  repository: /^[^\s/](?:[^\s]*[^\s/])?$/,
  project: /^[^\s/]+$/,
  applicationRef: /^[^\s]+\/[^\s/]+$/,
  externalRef: /^external:[^\s/]+$/,
  channelName: /^\S+$/,
  externalId: /^[^\s/]+$/,
};
const EXTERNAL_PREFIX = 'external:';

const CATALOG_KEYS = new Set([
  'schemaVersion',
  'generatedAt',
  'source',
  'applications',
  'externals',
]);
const APPLICATION_KEYS = new Set([
  'repository',
  'project',
  'kind',
  'team',
  'description',
  'url',
  'dependsOn',
  'publishes',
  'subscribes',
  'attributes',
]);
const EXTERNAL_KEYS = new Set(['id', 'kind', 'name', 'description', 'url', 'attributes']);
const CODE_RANK: Record<FindingCode, number> = Object.fromEntries(
  FINDING_CODES.map((code, index) => [code, index]),
) as Record<FindingCode, number>;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const isRef = (value: string): boolean =>
  RE.applicationRef.test(value) || RE.externalRef.test(value);

const isChannelName = (value: string): boolean => RE.channelName.test(value);

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

class Collector {
  readonly errors: Finding[] = [];
  readonly warnings: Finding[] = [];

  error(code: FindingCode, path: string, message: string, id?: string, value?: unknown): void {
    this.errors.push(finding(code, path, message, id, value));
  }

  warn(code: FindingCode, path: string, message: string, id?: string, value?: unknown): void {
    this.warnings.push(finding(code, path, message, id, value));
  }
}

function finding(
  code: FindingCode,
  path: string,
  message: string,
  id?: string,
  value?: unknown,
): Finding {
  const row: Finding = { code, path, message };
  if (id !== undefined) {
    row.id = id;
  }
  if (value !== undefined) {
    row.value = value;
  }
  return row;
}

/**
 * Checks a parsed document against every rule of docs/schema-v1.md. Pure: the document is never
 * mutated, and the returned Catalog is a fresh object holding only the keys schema v1 defines, with
 * duplicate list entries removed. Every rule runs and every finding is collected before returning;
 * the only short-circuits are a document that is not an object and `E_SCHEMA_VERSION`, since every
 * later rule assumes the major. Findings come back grouped in report order, then document order,
 * capped at `MAX_FINDINGS` rows with errors taking precedence over warnings.
 */
export function validateCatalog(document: unknown): ValidationResult {
  const out = new Collector();
  if (!isObject(document)) {
    out.error('E_INVALID', '', 'the document must be a JSON object', undefined, document);
    return finish(out);
  }
  if (document.schemaVersion !== 1) {
    const message =
      document.schemaVersion === undefined
        ? 'schemaVersion is missing; this viewer reads schema v1'
        : `schemaVersion must be 1; got ${JSON.stringify(document.schemaVersion)}`;
    out.error('E_SCHEMA_VERSION', 'schemaVersion', message, undefined, document.schemaVersion);
    return finish(out);
  }
  checkEnvelope(document, out);
  const { records, byId: applicationsById } = checkApplications(document.applications, out);
  const externalsById = checkExternals(document.externals, out);
  checkReferences(records, applicationsById, externalsById, out);
  checkChannels(records, out);
  return finish(out, out.errors.length === 0 ? buildCatalog(document) : undefined);
}

function finish(out: Collector, catalog?: Catalog): ValidationResult {
  const errors = sortByCode(out.errors).slice(0, MAX_FINDINGS);
  const warnings = sortByCode(out.warnings).slice(0, Math.max(0, MAX_FINDINGS - errors.length));
  return catalog ? { catalog, errors, warnings } : { errors, warnings };
}

/** Stable, so rows inside one code group keep document order. */
const sortByCode = (rows: Finding[]): Finding[] =>
  rows.sort((a, b) => CODE_RANK[a.code] - CODE_RANK[b.code]);

// ------------------------------------------------------------------------------------ envelope

function checkEnvelope(doc: JsonObject, out: Collector): void {
  checkUnknownKeys(doc, '', CATALOG_KEYS, 'the Catalog', undefined, out);
  if (doc.generatedAt !== undefined) {
    if (typeof doc.generatedAt !== 'string') {
      out.error(
        'E_INVALID',
        'generatedAt',
        'generatedAt must be a string',
        undefined,
        doc.generatedAt,
      );
    } else if (!isRfc3339DateTime(doc.generatedAt)) {
      out.warn(
        'W_INVALID_FORMAT',
        'generatedAt',
        'generatedAt is not an RFC 3339 date-time; the viewer shows the raw value',
        undefined,
        doc.generatedAt,
      );
    }
  }
  if (doc.source !== undefined && typeof doc.source !== 'string') {
    out.error('E_INVALID', 'source', 'source must be a string', undefined, doc.source);
  }
  if (doc.applications === undefined) {
    out.error('E_INVALID', 'applications', 'applications is missing');
  } else if (!Array.isArray(doc.applications)) {
    out.error(
      'E_INVALID',
      'applications',
      'applications must be an array',
      undefined,
      doc.applications,
    );
  }
  if (doc.externals !== undefined && !Array.isArray(doc.externals)) {
    out.error('E_INVALID', 'externals', 'externals must be an array', undefined, doc.externals);
  }
}

// ----------------------------------------------------------------------------------- externals

/** Returns every External id with the index of its first occurrence. */
function checkExternals(raw: unknown, out: Collector): Map<string, number> {
  const byId = new Map<string, number>();
  if (!Array.isArray(raw)) {
    return byId;
  }
  for (const [i, ext] of (raw as unknown[]).entries()) {
    const path = `externals[${i}]`;
    if (!isObject(ext)) {
      out.error('E_INVALID', path, 'External must be an object', undefined, ext);
      continue;
    }
    const id = nonEmptyString(ext.id);
    checkRequiredPattern(
      ext,
      path,
      'id',
      RE.externalId,
      'id must be a string without slashes or whitespace',
      id,
      out,
    );
    if (ext.kind === undefined) {
      out.error('E_INVALID', `${path}.kind`, 'kind is missing', id);
    } else if (typeof ext.kind !== 'string') {
      out.error('E_INVALID', `${path}.kind`, 'kind must be a string', id, ext.kind);
    }
    checkStrings(ext, path, ['name', 'description', 'url'], id, out);
    checkUrl(ext, path, id, out);
    checkAttributes(ext, path, id, out);
    checkUnknownKeys(ext, path, EXTERNAL_KEYS, id ? `External ${id}` : 'the External', id, out);
    if (id === undefined) {
      continue;
    }
    const first = byId.get(id);
    if (first === undefined) {
      byId.set(id, i);
    } else {
      out.error(
        'E_DUPLICATE_EXTERNAL',
        `${path}.id`,
        `another External already has the id "${id}" (externals[${first}])`,
        id,
        id,
      );
    }
  }
  return byId;
}

// -------------------------------------------------------------------------------- applications

/** A kept list entry (first occurrence) with its index in the document. */
type Entry = { name: string; index: number };

type ApplicationRecord = {
  index: number;
  /** Undefined when repository or project is missing or empty; the record is still checked in full. */
  id?: string;
  /** False for a duplicate Application, which the Catalog would not contain. */
  kept: boolean;
  dependsOn: Entry[];
  publishes: Entry[];
  subscribes: Entry[];
};

function checkApplications(
  raw: unknown,
  out: Collector,
): { records: ApplicationRecord[]; byId: Map<string, number> } {
  const records: ApplicationRecord[] = [];
  const byId = new Map<string, number>();
  if (!Array.isArray(raw)) {
    return { records, byId };
  }
  for (const [i, app] of (raw as unknown[]).entries()) {
    const path = `applications[${i}]`;
    if (!isObject(app)) {
      out.error('E_INVALID', path, 'Application must be an object', undefined, app);
      continue;
    }
    const repository = nonEmptyString(app.repository);
    const project = nonEmptyString(app.project);
    const id =
      repository !== undefined && project !== undefined ? `${repository}/${project}` : undefined;
    checkRequiredPattern(
      app,
      path,
      'repository',
      RE.repository,
      'repository must be a string without whitespace and without a leading or trailing slash',
      id,
      out,
    );
    checkRequiredPattern(
      app,
      path,
      'project',
      RE.project,
      'project must be a string without slashes or whitespace',
      id,
      out,
    );
    checkStrings(app, path, ['kind', 'description', 'url'], id, out);
    checkUrl(app, path, id, out);
    if (app.team !== undefined && (typeof app.team !== 'string' || app.team.length === 0)) {
      out.error('E_INVALID', `${path}.team`, 'team must be a non-empty string', id, app.team);
    }
    checkAttributes(app, path, id, out);
    const dependsOn = checkList(
      app,
      path,
      'dependsOn',
      isRef,
      'must be an Application id ("repository/project") or "external:<id>"',
      id,
      out,
    );
    const publishes = checkList(
      app,
      path,
      'publishes',
      isChannelName,
      'must be a Channel name without whitespace',
      id,
      out,
    );
    const subscribes = checkList(
      app,
      path,
      'subscribes',
      isChannelName,
      'must be a Channel name without whitespace',
      id,
      out,
    );
    checkUnknownKeys(
      app,
      path,
      APPLICATION_KEYS,
      id ? `Application ${id}` : 'the Application',
      id,
      out,
    );
    // An invalid identity exempts the record from nothing: its refs and Flows are still checked, so
    // the producer fixes everything in one round (docs/validation-surfacing.md, decision 7).
    let first: number | undefined;
    if (id !== undefined) {
      first = byId.get(id);
      if (first === undefined) {
        byId.set(id, i);
      } else {
        out.error(
          'E_DUPLICATE_APPLICATION',
          path,
          `another Application already has the id "${id}" (applications[${first}])`,
          id,
          id,
        );
      }
    }
    records.push({ index: i, id, kept: first === undefined, dependsOn, publishes, subscribes });
  }
  return { records, byId };
}

// ------------------------------------------------------------------------------- shared checks

function checkRequiredPattern(
  record: JsonObject,
  path: string,
  key: string,
  pattern: RegExp,
  requirement: string,
  id: string | undefined,
  out: Collector,
): void {
  const value = record[key];
  if (value === undefined) {
    out.error('E_INVALID', `${path}.${key}`, `${key} is missing`, id);
  } else if (typeof value !== 'string' || !pattern.test(value)) {
    out.error('E_INVALID', `${path}.${key}`, requirement, id, value);
  }
}

function checkStrings(
  record: JsonObject,
  path: string,
  keys: string[],
  id: string | undefined,
  out: Collector,
): void {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && typeof value !== 'string') {
      out.error('E_INVALID', `${path}.${key}`, `${key} must be a string`, id, value);
    }
  }
}

function checkUrl(record: JsonObject, path: string, id: string | undefined, out: Collector): void {
  if (typeof record.url === 'string' && !isUri(record.url)) {
    out.warn(
      'W_INVALID_FORMAT',
      `${path}.url`,
      'url is not a URI; the viewer shows the raw value',
      id,
      record.url,
    );
  }
}

function checkAttributes(
  record: JsonObject,
  path: string,
  id: string | undefined,
  out: Collector,
): void {
  if (record.attributes !== undefined && !isObject(record.attributes)) {
    out.error(
      'E_INVALID',
      `${path}.attributes`,
      'attributes must be an object',
      id,
      record.attributes,
    );
  }
}

function checkUnknownKeys(
  record: JsonObject,
  path: string,
  known: Set<string>,
  owner: string,
  id: string | undefined,
  out: Collector,
): void {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      out.warn(
        'W_UNKNOWN_KEY',
        path ? `${path}.${key}` : key,
        `unknown key "${key}" on ${owner}; the schema does not define it and the viewer ignores it (custom data goes under attributes)`,
        id,
        key,
      );
    }
  }
}

/** Checks one of `dependsOn`, `publishes` or `subscribes`; returns the entries the Catalog keeps. */
function checkList(
  record: JsonObject,
  path: string,
  key: 'dependsOn' | 'publishes' | 'subscribes',
  valid: (entry: string) => boolean,
  requirement: string,
  id: string | undefined,
  out: Collector,
): Entry[] {
  const list = record[key];
  if (list === undefined) {
    return [];
  }
  const listPath = `${path}.${key}`;
  if (!Array.isArray(list)) {
    out.error('E_INVALID', listPath, `${key} must be an array`, id, list);
    return [];
  }
  const kept: Entry[] = [];
  const seen = new Set<string>();
  for (const [j, item] of (list as unknown[]).entries()) {
    const itemPath = `${listPath}[${j}]`;
    if (typeof item !== 'string' || !valid(item)) {
      out.error('E_INVALID', itemPath, `${key}[${j}] ${requirement}`, id, item);
      continue;
    }
    if (seen.has(item)) {
      out.warn(
        'W_DUPLICATE_ENTRY',
        itemPath,
        `"${item}" appears more than once in ${key}; the viewer keeps the first occurrence`,
        id,
        item,
      );
      continue;
    }
    seen.add(item);
    kept.push({ name: item, index: j });
  }
  return kept;
}

// ------------------------------------------------------------------------ references, channels

function checkReferences(
  records: ApplicationRecord[],
  applicationsById: Map<string, number>,
  externalsById: Map<string, number>,
  out: Collector,
): void {
  for (const app of records) {
    for (const { name: ref, index } of app.dependsOn) {
      const path = `applications[${app.index}].dependsOn[${index}]`;
      if (app.id !== undefined && ref === app.id) {
        out.error('E_SELF_DEPENDENCY', path, `${app.id} lists itself in dependsOn`, app.id, ref);
      } else if (RE.externalRef.test(ref)) {
        if (!externalsById.has(ref.slice(EXTERNAL_PREFIX.length))) {
          out.error('E_UNRESOLVED_REF', path, `${ref} names no declared External`, app.id, ref);
        }
      } else if (!applicationsById.has(ref)) {
        out.error(
          'E_UNRESOLVED_REF',
          path,
          `${ref} names no Application in the Catalog`,
          app.id,
          ref,
        );
      }
    }
  }
}

type ChannelSides = { publishers: number; subscribers: number; path: string; id?: string };

function checkChannels(records: ApplicationRecord[], out: Collector): void {
  const channels = new Map<string, ChannelSides>();
  const sides = (name: string, path: string, id: string | undefined): ChannelSides => {
    let channel = channels.get(name);
    if (!channel) {
      channel = { publishers: 0, subscribers: 0, path, id };
      channels.set(name, channel);
    }
    return channel;
  };
  for (const app of records) {
    if (!app.kept) {
      continue;
    }
    for (const { name, index } of app.publishes) {
      sides(name, `applications[${app.index}].publishes[${index}]`, app.id).publishers += 1;
    }
    for (const { name, index } of app.subscribes) {
      sides(name, `applications[${app.index}].subscribes[${index}]`, app.id).subscribers += 1;
    }
  }
  for (const [name, channel] of channels) {
    if (channel.publishers > 0 && channel.subscribers > 0) {
      continue;
    }
    const message =
      channel.publishers === 0
        ? `Channel "${name}" has ${count(channel.subscribers, 'subscriber')} and no publisher`
        : `Channel "${name}" has ${count(channel.publishers, 'publisher')} and no subscriber`;
    out.warn('W_EMPTY_CHANNEL', channel.path, message, channel.id, name);
  }
}

// ------------------------------------------------------------------------- the returned Catalog

/** Only called when no rule found an error, so the casts hold. */
function buildCatalog(doc: JsonObject): Catalog {
  const catalog: Catalog = {
    schemaVersion: 1,
    applications: (doc.applications as JsonObject[]).map(toApplication),
  };
  if (typeof doc.generatedAt === 'string') {
    catalog.generatedAt = doc.generatedAt;
  }
  if (typeof doc.source === 'string') {
    catalog.source = doc.source;
  }
  if (Array.isArray(doc.externals)) {
    catalog.externals = (doc.externals as JsonObject[]).map(toExternal);
  }
  return catalog;
}

const unique = (list: unknown[]): string[] => [...new Set(list as string[])];

function toApplication(raw: JsonObject): Application {
  const app: Application = { repository: raw.repository as string, project: raw.project as string };
  if (typeof raw.kind === 'string') {
    app.kind = raw.kind;
  }
  if (typeof raw.team === 'string') {
    app.team = raw.team;
  }
  if (typeof raw.description === 'string') {
    app.description = raw.description;
  }
  if (typeof raw.url === 'string') {
    app.url = raw.url;
  }
  if (Array.isArray(raw.dependsOn)) {
    app.dependsOn = unique(raw.dependsOn);
  }
  if (Array.isArray(raw.publishes)) {
    app.publishes = unique(raw.publishes);
  }
  if (Array.isArray(raw.subscribes)) {
    app.subscribes = unique(raw.subscribes);
  }
  if (isObject(raw.attributes)) {
    app.attributes = { ...raw.attributes };
  }
  return app;
}

function toExternal(raw: JsonObject): External {
  const ext: External = { id: raw.id as string, kind: raw.kind as string };
  if (typeof raw.name === 'string') {
    ext.name = raw.name;
  }
  if (typeof raw.description === 'string') {
    ext.description = raw.description;
  }
  if (typeof raw.url === 'string') {
    ext.url = raw.url;
  }
  if (isObject(raw.attributes)) {
    ext.attributes = { ...raw.attributes };
  }
  return ext;
}

// ------------------------------------------------------------------------------------- formats

// RFC 3339 section 5.6 exactly as ajv-formats' full "date-time" reads it, so a producer validating
// with the schema and the viewer agree: full-date, a "T" or whitespace separator, full-time with a
// mandatory offset written "Z", "+HH:MM", "+HHMM" or "+HH", calendar days checked, and a leap
// second (":60") accepted only where it falls on 23:59 UTC once the offset is removed.
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt\s](\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(?:[Zz]|([+-])(\d{2})(?::?(\d{2}))?)$/;
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isRfc3339DateTime(value: string): boolean {
  const match = DATE_TIME.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 && leap ? 29 : (DAYS_IN_MONTH[month] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > days) {
    return false;
  }
  const offsetSign = match[7] === '-' ? -1 : 1;
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  if (offsetHour > 23 || offsetMinute > 59) {
    return false;
  }
  if (hour <= 23 && minute <= 59 && second < 60) {
    return true;
  }
  const utcMinute = minute - offsetMinute * offsetSign;
  const utcHour = hour - offsetHour * offsetSign - (utcMinute < 0 ? 1 : 0);
  return (
    (utcHour === 23 || utcHour === -1) && (utcMinute === 59 || utcMinute === -1) && second < 61
  );
}

// RFC 3986: a scheme, then only the characters a URI may contain (ASCII unreserved, reserved and
// percent-escapes), and a structure the URL parser accepts.
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*$/;
const BAD_PERCENT_ESCAPE = /%(?![0-9A-Fa-f]{2})/;

function isUri(value: string): boolean {
  return URI.test(value) && !BAD_PERCENT_ESCAPE.test(value) && URL.canParse(value);
}
