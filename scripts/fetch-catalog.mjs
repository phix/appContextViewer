#!/usr/bin/env node
/**
 * Places a private Catalog beside the built viewer, per docs/catalog-sources.md decision 3: the
 * token belongs to the deployment pipeline, never to the browser. Runs after `vite build` from the
 * `build` script, so on Vercel it executes on the build machine with the project's environment
 * variables and writes dist/catalog.json next to index.html. The viewer then loads it same-origin
 * with `?src=./catalog.json`, carrying the deployment's own auth cookie and no credential of its
 * own. Runbook: docs/deploy.md.
 *
 *   CATALOG_URL    where to fetch the Catalog from. Unset: do nothing, exit 0 (the sample ships).
 *   CATALOG_TOKEN  optional; sent as `Authorization: Bearer <token>` when set.
 *
 * A failed fetch exits 1 and fails the build, naming the status or the network error, because a
 * deployment that silently lost its Catalog looks identical to one that never had one. The token is
 * redacted from everything this script prints.
 *
 * Tests: scripts/fetch-catalog.test.mjs (`node --test`), which the `build` script runs first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const OUT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'catalog.json',
);

/** Empty and whitespace-only environment variables are how "unset" reaches a build machine. */
function present(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Nothing this script prints may carry the token, whatever string it was spliced into. */
function redact(text, token) {
  return token === undefined ? text : text.split(token).join('***');
}

/**
 * A build log should say which source it fetched, but a query string is where a signed URL keeps
 * its signature, so only the origin and path are ever printed — and only for http(s), because
 * every other scheme (a `data:` URL above all) can carry the whole payload in the part that is
 * neither origin nor path.
 */
function safeToPrint(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? `${parsed.origin}${parsed.pathname}`
      : `a ${parsed.protocol} URL`;
  } catch {
    return 'CATALOG_URL';
  }
}

/**
 * `fetch` rejects with a bare "fetch failed" and hides the real reason — ECONNREFUSED, a DNS
 * failure, a bad certificate — one or two `cause` links down. A build log needs the whole chain.
 */
function describeCause(error) {
  const messages = [];
  for (let link = error; link !== undefined && link !== null; link = link.cause) {
    const message = typeof link === 'object' && 'message' in link ? link.message : String(link);
    if (message && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return messages.length > 0 ? messages.join(': ') : String(error);
}

/**
 * @param {object} options
 * @param {string|undefined} options.url        CATALOG_URL, or undefined to do nothing.
 * @param {string|undefined} [options.token]    CATALOG_TOKEN, sent as a bearer token when present.
 * @param {typeof globalThis.fetch} [options.fetch] injected for tests; defaults to global fetch.
 * @param {string} [options.outFile]            defaults to dist/catalog.json.
 * @param {(line: string) => void} [options.log] defaults to console.log.
 * @returns {Promise<{written: boolean, outFile: string}>}
 */
export async function fetchCatalog({
  url,
  token,
  fetch: fetchImpl = globalThis.fetch,
  outFile = OUT_FILE,
  log = console.log,
} = {}) {
  const source = present(url);
  const secret = present(token);
  const say = (line) => log(redact(line, secret));
  const fail = (message) => {
    throw new Error(redact(message, secret));
  };

  if (source === undefined) {
    say('fetch-catalog: CATALOG_URL is unset, so no Catalog is placed beside the viewer.');
    return { written: false, outFile };
  }

  const headers = secret === undefined ? {} : { Authorization: `Bearer ${secret}` };
  say(
    `fetch-catalog: fetching ${safeToPrint(source)} ` +
      `${secret === undefined ? 'without' : 'with'} a bearer token.`,
  );

  let response;
  try {
    response = await fetchImpl(source, { headers });
  } catch (cause) {
    fail(`fetch-catalog: CATALOG_URL could not be fetched: ${describeCause(cause)}`);
  }
  if (!response.ok) {
    fail(
      `fetch-catalog: CATALOG_URL answered ${response.status} ${response.statusText}. ` +
        'Check CATALOG_URL and, for a private source, CATALOG_TOKEN.',
    );
  }

  const body = await response.text();
  try {
    JSON.parse(body);
  } catch (cause) {
    fail(
      `fetch-catalog: CATALOG_URL answered 200 with a body that is not JSON (${cause.message}). ` +
        'A sign-in page is the usual cause: check that CATALOG_TOKEN reaches the host.',
    );
  }

  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, body);
  say(
    `fetch-catalog: wrote ${outFile} (${body.length} bytes). Open the viewer at ?src=./catalog.json`,
  );
  return { written: true, outFile };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await fetchCatalog({ url: process.env.CATALOG_URL, token: process.env.CATALOG_TOKEN });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
