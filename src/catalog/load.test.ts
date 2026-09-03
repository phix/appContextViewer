import { afterEach, describe, expect, it, vi } from 'vitest';
import { GITHUB_HINT, loadCatalog, MAX_CATALOG_BYTES } from './index';
import { invalid, readText, sample } from './test-fixtures';

const DEMO = readText(sample('catalog.demo.json'));
const EXAMPLE = readText(sample('catalog.example.json'));
const VIEWER = 'https://viewer.example.com/app/';
const DATA = 'https://data.example.com/catalog.json';

/** A `fetch` that records what it was asked for and answers with `respond`. */
function fetching(respond: (href: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl: typeof fetch = async (input) => {
    calls.push(String(input));
    return respond(String(input));
  };
  return { calls, fetch: impl };
}

const failing =
  (error: unknown): typeof fetch =>
  async () => {
    throw error;
  };

describe('loadCatalog from a File', () => {
  it('reads the file as text, validates it and names the source', async () => {
    const result = await loadCatalog(new File([DEMO], 'catalog.demo.json'));
    expect(result.source).toEqual({ kind: 'file', name: 'catalog.demo.json' });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['W_EMPTY_CHANNEL', 'W_EMPTY_CHANNEL']);
    expect(result.catalog?.applications).toHaveLength(34);
  });

  it('refuses a file above maxBytes before parsing, naming the size', async () => {
    const file = new File([readText(invalid('E_TOO_LARGE'))], 'E_TOO_LARGE.json');
    const result = await loadCatalog(file, { maxBytes: 16 });
    expect(result.errors).toEqual([
      {
        code: 'E_TOO_LARGE',
        path: '',
        message: `E_TOO_LARGE.json is ${(file.size / 1048576).toFixed(1)} MB; files over 0.0 MB are refused before parsing`,
        value: file.size,
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
    expect(result.source).toEqual({ kind: 'file', name: 'E_TOO_LARGE.json' });
  });

  it('defaults the limit to 50 MB', async () => {
    expect(MAX_CATALOG_BYTES).toBe(50 * 1024 * 1024);
    const atLimit = { name: 'big.json', size: MAX_CATALOG_BYTES, text: async () => '{}' } as File;
    const overLimit = { ...atLimit, size: MAX_CATALOG_BYTES + 1 } as File;
    expect((await loadCatalog(atLimit)).errors.map((e) => e.code)).toEqual(['E_SCHEMA_VERSION']);
    expect((await loadCatalog(overLimit)).errors.map((e) => e.code)).toEqual(['E_TOO_LARGE']);
    expect((await loadCatalog(overLimit)).errors[0]?.message).toContain('50.0 MB');
  });

  it('reports invalid JSON with the line and column the engine gives', async () => {
    const result = await loadCatalog(new File([readText(invalid('E_PARSE'))], 'E_PARSE.json'));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: 'E_PARSE', path: '' });
    expect(result.errors[0]?.message).toMatch(
      /^not valid JSON at line 4, column 73: Expected double-quoted property name/,
    );
    expect(result.errors[0]?.message).not.toContain('(line');
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('reports invalid JSON without a position when the engine gives none', async () => {
    const result = await loadCatalog(new File(['nope'], 'nope.json'));
    expect(result.errors.map((e) => e.code)).toEqual(['E_PARSE']);
    expect(result.errors[0]?.message).toMatch(/^not valid JSON: Unexpected token/);
    expect(result.errors[0]?.message).not.toContain('line');
  });

  it('reports a file that cannot be read as E_FETCH', async () => {
    const broken = {
      name: 'gone.json',
      size: 3,
      text: () => Promise.reject(new Error('NotReadableError')),
    } as File;
    const result = await loadCatalog(broken);
    expect(result.errors).toEqual([
      { code: 'E_FETCH', path: '', message: 'gone.json could not be read: NotReadableError' },
    ]);
  });
});

describe('loadCatalog from a URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a relative URL against base, fetches it with the injected fetch and validates', async () => {
    const { calls, fetch } = fetching(() => new Response(EXAMPLE));
    const result = await loadCatalog('./catalog.json', { fetch, base: VIEWER });
    expect(calls).toEqual(['https://viewer.example.com/app/catalog.json']);
    expect(result.source).toEqual({
      kind: 'url',
      name: 'https://viewer.example.com/app/catalog.json',
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog?.applications).toHaveLength(9);
  });

  it('passes validation findings through with the source', async () => {
    const { fetch } = fetching(() => new Response(readText(invalid('W_EMPTY_CHANNEL'))));
    const result = await loadCatalog(DATA, { fetch });
    expect(result.source).toEqual({ kind: 'url', name: DATA });
    expect(result.warnings.map((w) => w.code)).toEqual(['W_EMPTY_CHANNEL', 'W_EMPTY_CHANNEL']);
    expect(result.catalog).toBeDefined();
  });

  it('uses the global fetch when none is injected', async () => {
    const { calls, fetch } = fetching(() => new Response(EXAMPLE));
    vi.stubGlobal('fetch', fetch);
    const result = await loadCatalog(DATA);
    expect(calls).toEqual([DATA]);
    expect(result.catalog).toBeDefined();
  });

  it('decodes a UTF-8 byte order mark', async () => {
    const { fetch } = fetching(() => new Response(`﻿${EXAMPLE}`));
    const result = await loadCatalog(DATA, { fetch });
    expect(result.errors).toEqual([]);
  });

  it('reports a string that is not a URL as E_FETCH', async () => {
    const result = await loadCatalog('./catalog.json');
    expect(result.source).toEqual({ kind: 'url', name: './catalog.json' });
    expect(result.errors).toEqual([
      {
        code: 'E_FETCH',
        path: '',
        message:
          '"./catalog.json" is not a valid URL (a relative URL needs a page to resolve against)',
      },
    ]);
  });

  it('reports a non-2xx status as E_FETCH, alone', async () => {
    const { fetch } = fetching(
      () => new Response('gone', { status: 404, statusText: 'Not Found' }),
    );
    const result = await loadCatalog(DATA, { fetch });
    expect(result.errors).toEqual([
      { code: 'E_FETCH', path: '', message: `GET ${DATA} returned 404 Not Found` },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('names CORS when a cross-origin fetch throws a TypeError', async () => {
    const result = await loadCatalog(DATA, {
      fetch: failing(new TypeError('Failed to fetch')),
      base: VIEWER,
    });
    expect(result.errors).toEqual([
      {
        code: 'E_FETCH',
        path: '',
        message: `GET ${DATA} was refused as a cross-origin request (CORS); the host must send Access-Control-Allow-Origin for a plain GET`,
      },
    ]);
  });

  it('does not name CORS for a same-origin TypeError', async () => {
    const result = await loadCatalog('/catalog.json', {
      fetch: failing(new TypeError('Failed to fetch')),
      base: VIEWER,
    });
    expect(result.errors[0]?.message).toBe(
      'GET https://viewer.example.com/catalog.json failed: Failed to fetch',
    );
  });

  it('does not name CORS when no page origin is known', async () => {
    const result = await loadCatalog(DATA, { fetch: failing(new TypeError('Failed to fetch')) });
    expect(result.errors[0]?.message).toBe(`GET ${DATA} failed: Failed to fetch`);
  });

  it('reports any other failure with its message', async () => {
    const socket = await loadCatalog(DATA, {
      fetch: failing(new Error('socket hang up')),
      base: VIEWER,
    });
    expect(socket.errors[0]?.message).toBe(`GET ${DATA} failed: socket hang up`);
    const thrown = await loadCatalog(DATA, { fetch: failing('boom'), base: VIEWER });
    expect(thrown.errors[0]?.message).toBe(`GET ${DATA} failed: boom`);
  });

  it.each([
    'https://raw.githubusercontent.com/example-org/catalog/main/catalog.json',
    'https://github.com/example-org/catalog/blob/main/catalog.json',
  ])('appends the GitHub hint when %s fails', async (href) => {
    const notFound = await loadCatalog(href, {
      fetch: fetching(() => new Response('', { status: 404, statusText: 'Not Found' })).fetch,
    });
    expect(notFound.errors[0]?.message).toBe(`GET ${href} returned 404 Not Found. ${GITHUB_HINT}`);
    const refused = await loadCatalog(href, {
      fetch: failing(new TypeError('Failed to fetch')),
      base: VIEWER,
    });
    expect(refused.errors[0]?.message).toContain('(CORS)');
    expect(refused.errors[0]?.message.endsWith(`. ${GITHUB_HINT}`)).toBe(true);
  });

  it.each(['https://gist.githubusercontent.com/example-org/1/raw/catalog.json', DATA])(
    'adds no hint for %s',
    async (href) => {
      const result = await loadCatalog(href, {
        fetch: fetching(() => new Response('', { status: 500 })).fetch,
      });
      expect(result.errors[0]?.message).toBe(`GET ${href} returned 500`);
    },
  );

  it('refuses an oversize Content-Length before reading the body', async () => {
    let bodyRead = false;
    const declared = MAX_CATALOG_BYTES + 1;
    const { fetch } = fetching(() => {
      const response = new Response('{}', { headers: { 'content-length': String(declared) } });
      Object.defineProperty(response, 'arrayBuffer', {
        value: async () => {
          bodyRead = true;
          return new ArrayBuffer(0);
        },
      });
      return response;
    });
    const result = await loadCatalog(DATA, { fetch });
    expect(result.errors).toEqual([
      {
        code: 'E_TOO_LARGE',
        path: '',
        message: `${DATA} is 50.0 MB; files over 50.0 MB are refused before parsing`,
        value: declared,
      },
    ]);
    expect(bodyRead).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('refuses a body above maxBytes when no Content-Length is declared', async () => {
    const { fetch } = fetching(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(EXAMPLE));
              controller.close();
            },
          }),
        ),
    );
    const result = await loadCatalog(DATA, { fetch, maxBytes: 100 });
    expect(result.errors.map((e) => e.code)).toEqual(['E_TOO_LARGE']);
    expect(result.errors[0]?.value).toBe(Buffer.byteLength(EXAMPLE));
  });

  it('reports a body that fails while streaming as E_FETCH', async () => {
    const { fetch } = fetching(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              throw new Error('connection reset');
            },
          }),
        ),
    );
    const result = await loadCatalog(DATA, { fetch });
    expect(result.errors).toEqual([
      {
        code: 'E_FETCH',
        path: '',
        message: `GET ${DATA} failed while reading the body: connection reset`,
      },
    ]);
  });

  it('reports invalid JSON from a URL with line and column', async () => {
    const { fetch } = fetching(() => new Response(readText(invalid('E_PARSE'))));
    const result = await loadCatalog(DATA, { fetch });
    expect(result.errors.map((e) => e.code)).toEqual(['E_PARSE']);
    expect(result.errors[0]?.message).toContain('at line 4, column 73');
    expect(result.source).toEqual({ kind: 'url', name: DATA });
  });
});
