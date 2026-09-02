import type { CatalogSource, Finding, FindingCode, LoadDeps, LoadResult } from './types';
import { validateCatalog } from './validate';

/** Documents above this size are refused before parsing (docs/performance-budgets.md). */
export const MAX_CATALOG_BYTES = 50 * 1024 * 1024;

/** Appended to an `E_FETCH` row for a GitHub host (docs/catalog-sources.md, decision 4). */
export const GITHUB_HINT =
  'Private files on GitHub cannot be loaded by the viewer. Download the file and open it, or publish it beside the viewer.';

const GITHUB_HOSTS = new Set(['github.com', 'raw.githubusercontent.com']);

/**
 * Obtains a document from a `File` (read as text) or a URL (fetched with the injected `fetch`, or
 * the global one), refuses it above `maxBytes` before parsing, parses it, and hands it to
 * `validateCatalog`. A load-stage failure (`E_FETCH`, `E_TOO_LARGE`, `E_PARSE`) is the only row in
 * the result. The loader never holds or sends a credential; a private Catalog is served beside the
 * viewer or opened from disk (docs/catalog-sources.md).
 */
export async function loadCatalog(source: File | string, deps: LoadDeps = {}): Promise<LoadResult> {
  const maxBytes = deps.maxBytes ?? MAX_CATALOG_BYTES;
  return typeof source === 'string' ? loadUrl(source, deps, maxBytes) : loadFile(source, maxBytes);
}

async function loadFile(file: File, maxBytes: number): Promise<LoadResult> {
  const source: CatalogSource = { kind: 'file', name: file.name };
  if (file.size > maxBytes) {
    return rejected(source, 'E_TOO_LARGE', tooLarge(file.name, file.size, maxBytes), file.size);
  }
  let text: string;
  try {
    text = await file.text();
  } catch (cause) {
    return rejected(source, 'E_FETCH', `${file.name} could not be read: ${describe(cause)}`);
  }
  return parsed(source, text);
}

async function loadUrl(href: string, deps: LoadDeps, maxBytes: number): Promise<LoadResult> {
  const base = deps.base ?? pageHref();
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    const why = base === undefined ? ' (a relative URL needs a page to resolve against)' : '';
    return rejected({ kind: 'url', name: href }, 'E_FETCH', `"${href}" is not a valid URL${why}`);
  }
  const source: CatalogSource = { kind: 'url', name: url.href };
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return rejected(
      source,
      'E_FETCH',
      withHint(url, `GET ${url.href} failed: fetch is not available`),
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(url.href);
  } catch (cause) {
    // A browser reports a cross-origin refusal as a bare TypeError, the same as a network failure;
    // the origin comparison is what tells them apart.
    const pageOrigin = base === undefined ? undefined : new URL(base).origin;
    const crossOrigin = pageOrigin !== undefined && pageOrigin !== url.origin;
    const message =
      cause instanceof TypeError && crossOrigin
        ? `GET ${url.href} was refused as a cross-origin request (CORS); the host must send Access-Control-Allow-Origin for a plain GET`
        : `GET ${url.href} failed: ${describe(cause)}`;
    return rejected(source, 'E_FETCH', withHint(url, message));
  }
  if (!response.ok) {
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    return rejected(source, 'E_FETCH', withHint(url, `GET ${url.href} returned ${status}`));
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return rejected(source, 'E_TOO_LARGE', tooLarge(url.href, declared, maxBytes), declared);
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (cause) {
    const message = `GET ${url.href} failed while reading the body: ${describe(cause)}`;
    return rejected(source, 'E_FETCH', withHint(url, message));
  }
  if (bytes.byteLength > maxBytes) {
    return rejected(
      source,
      'E_TOO_LARGE',
      tooLarge(url.href, bytes.byteLength, maxBytes),
      bytes.byteLength,
    );
  }
  return parsed(source, new TextDecoder().decode(bytes));
}

function parsed(source: CatalogSource, text: string): LoadResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (cause) {
    return rejected(source, 'E_PARSE', parseMessage(cause));
  }
  return { ...validateCatalog(document), source };
}

/** V8 and Firefox put "line L column C" in the message; other engines give no position. */
function parseMessage(cause: unknown): string {
  const raw = describe(cause);
  const at = /line (\d+) column (\d+)/.exec(raw);
  const detail = raw.replace(/\s*\(line \d+ column \d+\)$/, '');
  return at
    ? `not valid JSON at line ${at[1]}, column ${at[2]}: ${detail}`
    : `not valid JSON: ${detail}`;
}

function rejected(
  source: CatalogSource,
  code: FindingCode,
  message: string,
  value?: unknown,
): LoadResult {
  const row: Finding = { code, path: '', message };
  if (value !== undefined) {
    row.value = value;
  }
  return { errors: [row], warnings: [], source };
}

const withHint = (url: URL, message: string): string =>
  GITHUB_HOSTS.has(url.hostname) ? `${message}. ${GITHUB_HINT}` : message;

const tooLarge = (name: string, bytes: number, maxBytes: number): string =>
  `${name} is ${megabytes(bytes)}; files over ${megabytes(maxBytes)} are refused before parsing`;

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const pageHref = (): string | undefined =>
  typeof location === 'undefined' ? undefined : location.href;
