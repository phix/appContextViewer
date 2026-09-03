/**
 * Unit tests for scripts/fetch-catalog.mjs, run by Node's own test runner:
 *
 *   node --test scripts/fetch-catalog.test.mjs
 *
 * They do not run under Vitest and cannot: vitest.config.ts claims only
 * `src/{catalog,graph,layout,state,app,view}/**`, scripts/check-test-files.mjs fails `npm run check`
 * on a test file no project claims, and this slice owns neither vitest.config.ts nor src/. So the
 * `build` script runs this file before `vite build`; every local build and every Vercel deployment
 * therefore runs these tests, and a broken fetch step fails the build instead of shipping.
 *
 * Every case injects `fetch` and writes into a fresh temp directory, so nothing here touches the
 * network or dist/.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { fetchCatalog } from './fetch-catalog.mjs';

const CATALOG = { schemaVersion: 1, applications: [] };
const TOKEN = 'ghp_notARealTokenJustForThisTest';

const workspaces = [];
function outFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fetch-catalog-'));
  workspaces.push(dir);
  return path.join(dir, 'dist', 'catalog.json');
}
after(() => {
  for (const dir of workspaces) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A `fetch` that records its calls and answers with `response`. */
function stubFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) {
      throw response;
    }
    return response;
  };
  return { fetchImpl, calls };
}

function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return { ok, status, statusText, text: async () => body };
}

test('does nothing and succeeds when CATALOG_URL is unset', async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse('{}'));
  const target = outFile();
  const log = [];

  const result = await fetchCatalog({
    url: undefined,
    token: TOKEN,
    fetch: fetchImpl,
    outFile: target,
    log: (line) => log.push(line),
  });

  assert.equal(result.written, false);
  assert.equal(calls.length, 0, 'no CATALOG_URL means no request');
  assert.throws(() => readFileSync(target), { code: 'ENOENT' });
  assert.ok(
    log.join('\n').includes('CATALOG_URL'),
    'the skip is explained, so a build log says why no Catalog shipped',
  );
});

test('an empty CATALOG_URL counts as unset', async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse('{}'));

  const result = await fetchCatalog({ url: '   ', fetch: fetchImpl, outFile: outFile() });

  assert.equal(result.written, false);
  assert.equal(calls.length, 0);
});

test('fetches with a bearer token and writes dist/catalog.json', async () => {
  const body = JSON.stringify(CATALOG);
  const { fetchImpl, calls } = stubFetch(jsonResponse(body));
  const target = outFile();

  const result = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    token: TOKEN,
    fetch: fetchImpl,
    outFile: target,
  });

  assert.equal(result.written, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://catalogs.example.com/acme.json');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(readFileSync(target, 'utf8'), body, 'the body is written through byte for byte');
});

test('sends no Authorization header when CATALOG_TOKEN is unset', async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse('{}'));

  await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    token: undefined,
    fetch: fetchImpl,
    outFile: outFile(),
  });

  assert.equal(calls.length, 1);
  assert.ok(
    !('Authorization' in calls[0].init.headers),
    'an unauthenticated source must not get an empty bearer header',
  );
});

test('an empty CATALOG_TOKEN counts as unset', async () => {
  const { fetchImpl, calls } = stubFetch(jsonResponse('{}'));

  await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    token: '',
    fetch: fetchImpl,
    outFile: outFile(),
  });

  assert.ok(!('Authorization' in calls[0].init.headers));
});

test('a non-ok response fails the build, naming the status', async () => {
  const { fetchImpl } = stubFetch(
    jsonResponse('nope', { ok: false, status: 403, statusText: 'Forbidden' }),
  );
  const target = outFile();

  const error = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    token: TOKEN,
    fetch: fetchImpl,
    outFile: target,
  }).then(
    () => undefined,
    (thrown) => thrown,
  );

  assert.ok(error instanceof Error, 'a failed fetch rejects rather than resolving');
  assert.match(error.message, /403/);
  assert.match(error.message, /Forbidden/);
  assert.ok(error.message.includes('CATALOG_URL'), 'the message names the variable to check');
  assert.throws(() => readFileSync(target), { code: 'ENOENT' }, 'nothing is written on failure');
});

test('a network error fails the build, naming the cause', async () => {
  const { fetchImpl } = stubFetch(new TypeError('getaddrinfo ENOTFOUND catalogs.example.com'));

  const error = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    fetch: fetchImpl,
    outFile: outFile(),
  }).then(
    () => undefined,
    (thrown) => thrown,
  );

  assert.ok(error instanceof Error);
  assert.match(error.message, /ENOTFOUND catalogs\.example\.com/);
});

test('a network error names the real cause, not just "fetch failed"', async () => {
  // What Node's fetch actually rejects with: a bare TypeError whose reason is one `cause` down.
  const shallow = new TypeError('fetch failed');
  shallow.cause = new Error('connect ECONNREFUSED 127.0.0.1:443');
  const { fetchImpl } = stubFetch(shallow);

  const error = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    fetch: fetchImpl,
    outFile: outFile(),
  }).then(
    () => undefined,
    (thrown) => thrown,
  );

  assert.match(error.message, /fetch failed/);
  assert.match(error.message, /ECONNREFUSED/, 'the cause chain is unwrapped into the message');
});

test('a non-http URL is described, never echoed', async () => {
  // A data: URL carries its payload where neither origin nor path can hide it, so the log must
  // name the scheme and stop.
  const log = [];
  const { fetchImpl } = stubFetch(jsonResponse('{}'));

  await fetchCatalog({
    url: 'data:application/json,{"someone-elses-private-catalog":1}',
    fetch: fetchImpl,
    outFile: outFile(),
    log: (line) => log.push(line),
  });

  const said = log.join('\n');
  assert.ok(!said.includes('private-catalog'), `the URL body leaked into the log: ${said}`);
  assert.match(said, /data:/);
});

test('a body that is not JSON fails the build', async () => {
  // The failure this catches: a protected host answering a tokenless request with its own HTML
  // login page at 200, which would otherwise ship as catalog.json and fail in the browser instead.
  const { fetchImpl } = stubFetch(jsonResponse('<!doctype html><title>Sign in</title>'));
  const target = outFile();

  const error = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    fetch: fetchImpl,
    outFile: target,
  }).then(
    () => undefined,
    (thrown) => thrown,
  );

  assert.ok(error instanceof Error);
  assert.match(error.message, /JSON/);
  assert.throws(() => readFileSync(target), { code: 'ENOENT' });
});

test('the token never reaches the log or an error message', async () => {
  const log = [];
  const collect = (line) => log.push(line);

  await fetchCatalog({
    url: `https://catalogs.example.com/acme.json?debug=${TOKEN}`,
    token: TOKEN,
    fetch: stubFetch(jsonResponse('{}')).fetchImpl,
    outFile: outFile(),
    log: collect,
  });

  const failure = await fetchCatalog({
    url: 'https://catalogs.example.com/acme.json',
    token: TOKEN,
    fetch: stubFetch(jsonResponse('no', { ok: false, status: 401, statusText: 'Unauthorized' }))
      .fetchImpl,
    outFile: outFile(),
    log: collect,
  }).then(
    () => undefined,
    (thrown) => thrown,
  );

  const everythingSaid = [...log, failure.message].join('\n');
  assert.ok(
    !everythingSaid.includes(TOKEN),
    `the token leaked into build output: ${everythingSaid}`,
  );
});
