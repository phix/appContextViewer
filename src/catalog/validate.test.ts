import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Catalog, Finding, FindingCode } from './index';
import { FINDING_CODES, MAX_FINDINGS, validateCatalog } from './index';
import { invalid, readJson, sample } from './test-fixtures';

const fixture = (code: string): unknown => readJson(invalid(code));

/** The columns a report row is read by. */
const rows = (findings: Finding[]) =>
  findings.map(({ code, path, id, value }) => ({ code, path, id, value }));

const codes = (findings: Finding[]): FindingCode[] => findings.map((f) => f.code);

const rank = (code: FindingCode): number => FINDING_CODES.indexOf(code);

/** A valid document of `n` Applications, each mutated by `tweak`. */
function documentOf(n: number, tweak: (app: Record<string, unknown>, i: number) => void): unknown {
  const applications = Array.from({ length: n }, (_, i) => {
    const app: Record<string, unknown> = { repository: 'example/repo', project: `app-${i}` };
    tweak(app, i);
    return app;
  });
  return { schemaVersion: 1, applications };
}

describe('validateCatalog: the document', () => {
  it.each([null, [], 'catalog', 42, true])('rejects %j with a single root E_INVALID', (input) => {
    const result = validateCatalog(input);
    expect(result.errors).toEqual([
      { code: 'E_INVALID', path: '', message: 'the document must be a JSON object', value: input },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('has one fixture per code plus mixed.json', () => {
    for (const code of FINDING_CODES) {
      expect(existsSync(invalid(code)), `${code}.json`).toBe(true);
    }
    expect(existsSync(invalid('mixed'))).toBe(true);
    expect(FINDING_CODES).toHaveLength(13);
    expect(MAX_FINDINGS).toBe(1000);
  });
});

describe('E_SCHEMA_VERSION', () => {
  it('short-circuits every later rule', () => {
    // The fixture also carries an unknown key, a bad generatedAt and an unresolved ref.
    const result = validateCatalog(fixture('E_SCHEMA_VERSION'));
    expect(result.errors).toEqual([
      {
        code: 'E_SCHEMA_VERSION',
        path: 'schemaVersion',
        message: 'schemaVersion must be 1; got 2',
        value: 2,
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('reports a missing schemaVersion without a value', () => {
    const result = validateCatalog({ applications: [] });
    expect(result.errors).toEqual([
      {
        code: 'E_SCHEMA_VERSION',
        path: 'schemaVersion',
        message: 'schemaVersion is missing; this viewer reads schema v1',
      },
    ]);
  });

  it.each(['1', 1.5, 0, true, null])('refuses schemaVersion %j', (schemaVersion) => {
    const result = validateCatalog({ schemaVersion, applications: [] });
    expect(codes(result.errors)).toEqual(['E_SCHEMA_VERSION']);
    expect(result.catalog).toBeUndefined();
  });
});

describe('E_INVALID', () => {
  const result = validateCatalog(fixture('E_INVALID'));

  it('reports every schema violation on required and reserved keys, with paths, ids and values', () => {
    expect(rows(result.errors)).toEqual([
      { code: 'E_INVALID', path: 'source', id: undefined, value: 42 },
      {
        code: 'E_INVALID',
        path: 'applications[0].team',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: '',
      },
      {
        code: 'E_INVALID',
        path: 'applications[0].dependsOn[0]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'auth-service',
      },
      {
        code: 'E_INVALID',
        path: 'applications[0].dependsOn[1]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'external:postgres main',
      },
      {
        code: 'E_INVALID',
        path: 'applications[0].publishes[0]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'orders placed',
      },
      {
        code: 'E_INVALID',
        path: 'applications[1].repository',
        id: '/ATT-IDP5/platform-core/auth service',
        value: '/ATT-IDP5/platform-core',
      },
      {
        code: 'E_INVALID',
        path: 'applications[1].project',
        id: '/ATT-IDP5/platform-core/auth service',
        value: 'auth service',
      },
      {
        code: 'E_INVALID',
        path: 'applications[1].attributes',
        id: '/ATT-IDP5/platform-core/auth service',
        value: ['tier'],
      },
      { code: 'E_INVALID', path: 'applications[2].repository', id: undefined, value: undefined },
      { code: 'E_INVALID', path: 'applications[2].kind', id: undefined, value: 7 },
      { code: 'E_INVALID', path: 'applications[3]', id: undefined, value: 'not-an-object' },
      { code: 'E_INVALID', path: 'externals[0].id', id: 'postgres/main', value: 'postgres/main' },
      { code: 'E_INVALID', path: 'externals[1].kind', id: 'redis', value: undefined },
      { code: 'E_INVALID', path: 'externals[2].url', id: 'okta', value: 12 },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('says what the key must be', () => {
    const messages = Object.fromEntries(result.errors.map((e) => [e.path, e.message]));
    expect(messages['applications[2].repository']).toBe('repository is missing');
    expect(messages['applications[0].dependsOn[0]']).toBe(
      'dependsOn[0] must be an Application id ("repository/project") or "external:<id>"',
    );
    expect(messages['applications[1].project']).toBe(
      'project must be a string without slashes or whitespace',
    );
    expect(messages['externals[1].kind']).toBe('kind is missing');
  });

  it('omits `value` when the key is missing and keeps null values', () => {
    const missing = result.errors.find((e) => e.path === 'applications[2].repository');
    expect(missing).not.toHaveProperty('value');
    const withNull = validateCatalog({ schemaVersion: 1, applications: null });
    expect(withNull.errors).toEqual([
      {
        code: 'E_INVALID',
        path: 'applications',
        message: 'applications must be an array',
        value: null,
      },
    ]);
  });

  it('accepts an empty External kind, as the schema does', () => {
    const result = validateCatalog({
      schemaVersion: 1,
      applications: [],
      externals: [{ id: 'redis', kind: '' }],
    });
    expect(result.errors).toEqual([]);
  });
});

describe('E_DUPLICATE_APPLICATION', () => {
  it('points at the second occurrence and names the first', () => {
    const result = validateCatalog(fixture('E_DUPLICATE_APPLICATION'));
    expect(result.errors).toEqual([
      {
        code: 'E_DUPLICATE_APPLICATION',
        path: 'applications[2]',
        id: 'ATT-IDP5/platform-core/auth-service',
        message:
          'another Application already has the id "ATT-IDP5/platform-core/auth-service" (applications[0])',
        value: 'ATT-IDP5/platform-core/auth-service',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('compares ids exactly', () => {
    const result = validateCatalog(
      documentOf(2, (app, i) => {
        app.project = i === 0 ? 'Auth-Service' : 'auth-service';
      }),
    );
    expect(result.errors).toEqual([]);
  });
});

describe('E_DUPLICATE_EXTERNAL', () => {
  it('points at the duplicated id and names the first', () => {
    const result = validateCatalog(fixture('E_DUPLICATE_EXTERNAL'));
    expect(result.errors).toEqual([
      {
        code: 'E_DUPLICATE_EXTERNAL',
        path: 'externals[2].id',
        id: 'redis',
        message: 'another External already has the id "redis" (externals[0])',
        value: 'redis',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });
});

describe('E_UNRESOLVED_REF', () => {
  it('reports an unknown Application and an undeclared External, one row each', () => {
    const result = validateCatalog(fixture('E_UNRESOLVED_REF'));
    expect(result.errors).toEqual([
      {
        code: 'E_UNRESOLVED_REF',
        path: 'applications[0].dependsOn[1]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        message: 'ATT-IDP5/platform-core/user-service names no Application in the Catalog',
        value: 'ATT-IDP5/platform-core/user-service',
      },
      {
        code: 'E_UNRESOLVED_REF',
        path: 'applications[0].dependsOn[3]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        message: 'external:postgres-main names no declared External',
        value: 'external:postgres-main',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });
});

describe('E_SELF_DEPENDENCY', () => {
  it('reports an Application that lists its own id', () => {
    const result = validateCatalog(fixture('E_SELF_DEPENDENCY'));
    expect(result.errors).toEqual([
      {
        code: 'E_SELF_DEPENDENCY',
        path: 'applications[0].dependsOn[1]',
        id: 'ATT-IDP5/platform-core/auth-service',
        message: 'ATT-IDP5/platform-core/auth-service lists itself in dependsOn',
        value: 'ATT-IDP5/platform-core/auth-service',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('allows a Dependency cycle', () => {
    const result = validateCatalog(
      documentOf(2, (app, i) => {
        app.dependsOn = [`example/repo/app-${1 - i}`];
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.catalog).toBeDefined();
  });
});

describe('W_UNKNOWN_KEY', () => {
  const document = fixture('W_UNKNOWN_KEY');
  const result = validateCatalog(document);

  it('names the key, on the Catalog, an Application and an External', () => {
    expect(rows(result.warnings)).toEqual([
      { code: 'W_UNKNOWN_KEY', path: 'generator', id: undefined, value: 'generator' },
      {
        code: 'W_UNKNOWN_KEY',
        path: 'applications[0].owner',
        id: 'ATT-IDP5/platform-core/auth-service',
        value: 'owner',
      },
      {
        code: 'W_UNKNOWN_KEY',
        path: 'applications[0].tier',
        id: 'ATT-IDP5/platform-core/auth-service',
        value: 'tier',
      },
      { code: 'W_UNKNOWN_KEY', path: 'externals[0].vendor', id: 'redis', value: 'vendor' },
    ]);
    expect(result.warnings[1]?.message).toBe(
      'unknown key "owner" on Application ATT-IDP5/platform-core/auth-service; the schema does not define it and the viewer ignores it (custom data goes under attributes)',
    );
    expect(result.errors).toEqual([]);
  });

  it('still loads, without the unknown keys, keeping attributes', () => {
    const catalog = result.catalog as Catalog;
    expect(catalog).not.toHaveProperty('generator');
    expect(Object.keys(catalog.applications[0] ?? {})).toEqual([
      'repository',
      'project',
      'attributes',
    ]);
    expect(catalog.applications[0]?.attributes).toEqual({ owner: 'platform' });
    expect(Object.keys(catalog.externals?.[0] ?? {})).toEqual(['id', 'kind']);
  });

  it('leaves the document untouched', () => {
    expect(document).toEqual(fixture('W_UNKNOWN_KEY'));
  });
});

describe('W_DUPLICATE_ENTRY', () => {
  const document = fixture('W_DUPLICATE_ENTRY');
  const result = validateCatalog(document);

  it('points at each duplicate occurrence', () => {
    expect(rows(result.warnings)).toEqual([
      {
        code: 'W_DUPLICATE_ENTRY',
        path: 'applications[0].dependsOn[2]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'ATT-IDP5/platform-core/auth-service',
      },
      {
        code: 'W_DUPLICATE_ENTRY',
        path: 'applications[0].publishes[1]',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'requests.logged',
      },
      {
        code: 'W_DUPLICATE_ENTRY',
        path: 'applications[1].subscribes[2]',
        id: 'ATT-IDP5/platform-core/auth-service',
        value: 'requests.logged',
      },
    ]);
    expect(result.warnings[0]?.message).toBe(
      '"ATT-IDP5/platform-core/auth-service" appears more than once in dependsOn; the viewer keeps the first occurrence',
    );
    expect(result.errors).toEqual([]);
  });

  it('keeps the first occurrence and removes the duplicate from the returned Catalog', () => {
    const catalog = result.catalog as Catalog;
    expect(catalog.applications[0]?.dependsOn).toEqual([
      'ATT-IDP5/platform-core/auth-service',
      'external:redis',
    ]);
    expect(catalog.applications[0]?.publishes).toEqual(['requests.logged']);
    expect(catalog.applications[0]?.subscribes).toEqual(['config.changed']);
    expect(catalog.applications[1]?.subscribes).toEqual(['requests.logged', 'config.changed']);
  });

  it('leaves the document untouched', () => {
    expect(document).toEqual(fixture('W_DUPLICATE_ENTRY'));
  });
});

describe('W_INVALID_FORMAT', () => {
  it('flags generatedAt and url and shows the raw value', () => {
    const result = validateCatalog(fixture('W_INVALID_FORMAT'));
    expect(rows(result.warnings)).toEqual([
      { code: 'W_INVALID_FORMAT', path: 'generatedAt', id: undefined, value: '2026-09-02 18:00' },
      {
        code: 'W_INVALID_FORMAT',
        path: 'applications[0].url',
        id: 'ATT-IDP5/platform-core/api-gateway',
        value: 'gw.example.com',
      },
      {
        code: 'W_INVALID_FORMAT',
        path: 'externals[0].url',
        id: 'okta',
        value: 'example dot okta dot com',
      },
    ]);
    expect(result.warnings.map((w) => w.message)).toEqual([
      'generatedAt is not an RFC 3339 date-time; the viewer shows the raw value',
      'url is not a URI; the viewer shows the raw value',
      'url is not a URI; the viewer shows the raw value',
    ]);
    expect(result.errors).toEqual([]);
    const catalog = result.catalog as Catalog;
    expect(catalog.generatedAt).toBe('2026-09-02 18:00');
    expect(catalog.applications[0]?.url).toBe('gw.example.com');
    expect(catalog.applications[1]?.url).toBe('https://auth.example.com/login');
    expect(catalog.externals?.[0]?.url).toBe('example dot okta dot com');
  });

  const generatedAtWarnings = (generatedAt: string) =>
    validateCatalog({ schemaVersion: 1, generatedAt, applications: [] }).warnings.length;

  // Accept and warn lists were checked against ajv-formats 3.0.1 fullFormats['date-time'] directly.
  it.each([
    '2026-09-02T18:00:00Z',
    '2026-09-02t18:00:00.123+05:30',
    '2026-09-02 18:00:00-00:00',
    '2026-09-02T18:00:00+0530',
    '2026-09-02T18:00:00+05',
    '2024-02-29T23:59:60Z',
    '2024-02-29T18:29:60-05:30',
  ])('accepts the date-time %s, as ajv-formats does', (value) => {
    expect(generatedAtWarnings(value)).toBe(0);
  });

  it.each([
    '2026-09-02T18:00:00',
    '2023-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-09-02T24:00:00Z',
    '2026-09-02T18:00:00+24:00',
    '2024-02-29T12:00:60Z',
    '2026-09-02',
    'Tue, 02 Sep 2026 18:00:00 GMT',
    '',
  ])('warns on the non-RFC 3339 generatedAt %j', (value) => {
    expect(generatedAtWarnings(value)).toBe(1);
  });

  const urlWarnings = (url: string) =>
    validateCatalog({ schemaVersion: 1, applications: [{ repository: 'r', project: 'p', url }] })
      .warnings.length;

  it.each([
    'https://gw.example.com',
    'http://10.0.0.1:8080/health?deep=1#top',
    'mailto:ops@example.com',
    'urn:isbn:0451450523',
    'https://x.example/a%20b',
  ])('accepts the URI %s', (value) => {
    expect(urlWarnings(value)).toBe(0);
  });

  it.each([
    'gw.example.com',
    '/relative/path',
    'https://ex ample.com',
    'https://x.example/a%zz',
    'http://',
    'https://例え.jp',
    '',
  ])('warns on the non-URI %j', (value) => {
    expect(urlWarnings(value)).toBe(1);
  });
});

describe('W_EMPTY_CHANNEL', () => {
  it('reports one row per one-sided Channel, naming the missing side', () => {
    const result = validateCatalog(fixture('W_EMPTY_CHANNEL'));
    expect(result.warnings).toEqual([
      {
        code: 'W_EMPTY_CHANNEL',
        path: 'applications[0].publishes[1]',
        id: 'ATT-IDP4/commerce/order-service',
        message: 'Channel "orders.audited" has 1 producer and no consumer',
        value: 'orders.audited',
      },
      {
        code: 'W_EMPTY_CHANNEL',
        path: 'applications[1].subscribes[1]',
        id: 'ATT-IDP4/commerce/shipping-service',
        message: 'Channel "orders.shipped" has 2 consumers and no producer',
        value: 'orders.shipped',
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.catalog?.applications).toHaveLength(3);
  });

  it('does not count a duplicate Application or a duplicate Flow twice', () => {
    const result = validateCatalog({
      schemaVersion: 1,
      applications: [
        { repository: 'r', project: 'a', publishes: ['c', 'c'] },
        { repository: 'r', project: 'a', publishes: ['c'] },
      ],
    });
    expect(codes(result.errors)).toEqual(['E_DUPLICATE_APPLICATION']);
    expect(result.warnings.filter((w) => w.code === 'W_EMPTY_CHANNEL')).toEqual([
      {
        code: 'W_EMPTY_CHANNEL',
        path: 'applications[0].publishes[0]',
        id: 'r/a',
        message: 'Channel "c" has 1 producer and no consumer',
        value: 'c',
      },
    ]);
  });
});

describe('mixed.json: errors and warnings together', () => {
  const result = validateCatalog(fixture('mixed'));

  it('lists both, grouped in report order, document order within a code', () => {
    expect(codes(result.errors)).toEqual([
      'E_DUPLICATE_APPLICATION',
      'E_DUPLICATE_EXTERNAL',
      'E_UNRESOLVED_REF',
      'E_UNRESOLVED_REF',
      'E_SELF_DEPENDENCY',
    ]);
    expect(codes(result.warnings)).toEqual([
      'W_UNKNOWN_KEY',
      'W_UNKNOWN_KEY',
      'W_DUPLICATE_ENTRY',
      'W_INVALID_FORMAT',
      'W_INVALID_FORMAT',
      'W_EMPTY_CHANNEL',
    ]);
    expect(result.warnings.slice(0, 2).map((w) => w.path)).toEqual([
      'generator',
      'applications[0].owner',
    ]);
    expect(result.errors.slice(2, 4).map((e) => e.path)).toEqual([
      'applications[0].dependsOn[2]',
      'applications[0].dependsOn[3]',
    ]);
    expect(result.catalog).toBeUndefined();
  });

  it('carries at least two errors and two warnings, as the fixture promises', () => {
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('never returns rows out of report order', () => {
    for (const list of [result.errors, result.warnings]) {
      for (let i = 1; i < list.length; i++) {
        expect(rank(list[i]?.code as FindingCode)).toBeGreaterThanOrEqual(
          rank(list[i - 1]?.code as FindingCode),
        );
      }
    }
  });
});

describe('collection and the cap', () => {
  it('collects every finding, then caps the report at MAX_FINDINGS rows with errors first', () => {
    const result = validateCatalog(
      documentOf(1500, (app) => {
        app.dependsOn = ['example/repo/missing'];
        app.owner = 'x';
      }),
    );
    expect(result.errors).toHaveLength(MAX_FINDINGS);
    expect(result.warnings).toEqual([]);
    expect(result.catalog).toBeUndefined();
  });

  it('gives warnings the rows the errors leave', () => {
    const result = validateCatalog(
      documentOf(600, (app) => {
        app.dependsOn = ['example/repo/missing'];
        app.owner = 'x';
      }),
    );
    expect(result.errors).toHaveLength(600);
    expect(result.warnings).toHaveLength(400);
  });

  it('keeps the highest-ranked codes when capping', () => {
    const result = validateCatalog(
      documentOf(1200, (app, i) => {
        app.dependsOn = [`example/repo/app-${i}`];
        if (i >= 1000) {
          app.project = 'app-0';
        }
      }),
    );
    expect(result.errors).toHaveLength(MAX_FINDINGS);
    expect(result.errors.filter((e) => e.code === 'E_DUPLICATE_APPLICATION')).toHaveLength(200);
  });

  it('caps a warnings-only report too', () => {
    const result = validateCatalog(
      documentOf(1200, (app) => {
        app.owner = 'x';
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(MAX_FINDINGS);
    expect(result.catalog?.applications).toHaveLength(1200);
  });
});

describe('every rule runs, whatever failed before it', () => {
  it('checks the refs and Flows of an Application whose identity is invalid', () => {
    // Decision 7 of docs/validation-surfacing.md: the producer fixes everything in one round, so a
    // missing repository must not hide the unresolved ref and the one-sided Channel beside it.
    const result = validateCatalog({
      schemaVersion: 1,
      applications: [{ project: 'x', dependsOn: ['nope/nope'], publishes: ['lonely'] }],
    });
    expect(result.errors).toEqual([
      { code: 'E_INVALID', path: 'applications[0].repository', message: 'repository is missing' },
      {
        code: 'E_UNRESOLVED_REF',
        path: 'applications[0].dependsOn[0]',
        message: 'nope/nope names no Application in the Catalog',
        value: 'nope/nope',
      },
    ]);
    expect(result.warnings).toEqual([
      {
        code: 'W_EMPTY_CHANNEL',
        path: 'applications[0].publishes[0]',
        message: 'Channel "lonely" has 1 producer and no consumer',
        value: 'lonely',
      },
    ]);
    expect(result.catalog).toBeUndefined();
  });

  it('resolves refs from an id-less Application and never invents a self-dependency for it', () => {
    const result = validateCatalog({
      schemaVersion: 1,
      applications: [
        { repository: 'r', project: 'p' },
        { project: 'p', dependsOn: ['r/p', 'external:db'] },
      ],
    });
    expect(rows(result.errors)).toEqual([
      { code: 'E_INVALID', path: 'applications[1].repository', id: undefined, value: undefined },
      {
        code: 'E_UNRESOLVED_REF',
        path: 'applications[1].dependsOn[1]',
        id: undefined,
        value: 'external:db',
      },
    ]);
  });
});

describe('the committed Catalogs', () => {
  it.each([
    ['catalog.example.json', 9, []],
    ['catalog.demo.json', 34, ['fraud.alerts', 'orders.shipped']],
    ['catalog-200.json', 200, []],
    ['catalog-500.json', 500, ['bss.captured']],
    ['catalog-1000.json', 1000, []],
  ])(
    '%s loads with exactly the warnings samples/README.md lists',
    (file, applications, channels) => {
      const result = validateCatalog(readJson(sample(file)));
      expect(result.errors).toEqual([]);
      expect(result.catalog?.applications).toHaveLength(applications);
      expect(codes(result.warnings)).toEqual(channels.map(() => 'W_EMPTY_CHANNEL'));
      expect(result.warnings.map((w) => w.value).sort()).toEqual(channels);
    },
  );

  it('names the missing side of each demo Channel', () => {
    const result = validateCatalog(readJson(sample('catalog.demo.json')));
    expect(result.warnings.map((w) => w.message)).toEqual([
      'Channel "orders.shipped" has 2 consumers and no producer',
      'Channel "fraud.alerts" has 1 producer and no consumer',
    ]);
  });

  it('returns a fresh Catalog equal to a clean document', () => {
    const document = readJson(sample('catalog.example.json'));
    const result = validateCatalog(document);
    expect(result.catalog).toEqual(document);
    expect(result.catalog).not.toBe(document);
  });
});
