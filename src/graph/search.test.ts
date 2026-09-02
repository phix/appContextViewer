import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { catalogOf } from './fixtures.test-helper';
import { buildGraph, buildSearchIndex, search } from './index';

const demo = buildGraph(demoCatalog);
const index = buildSearchIndex(demo);

describe('search: case-insensitive substrings with typed hits', () => {
  it('indexes every Application, External and Channel once', () => {
    expect(index.entries).toHaveLength(34 + 19 + 11);
  });

  it('finds an Application by id, ignoring case', () => {
    expect(search(index, 'AUTH-SERVICE')).toEqual([
      {
        kind: 'application',
        id: 'acme/platform-core/auth-service',
        field: 'id',
        value: 'acme/platform-core/auth-service',
      },
    ]);
  });

  it('finds Externals by id, name and kind', () => {
    expect(search(index, 'postgres (main')).toEqual([
      { kind: 'external', id: 'postgres-main', field: 'name', value: 'Postgres (main cluster)' },
    ]);
    const saas = search(index, 'saas');
    expect(saas.map((hit) => hit.id)).toEqual([
      'contentful',
      'firebase',
      'sendgrid',
      'stripe',
      'twilio',
    ]);
    expect(saas.every((hit) => hit.kind === 'external' && hit.field === 'kind')).toBe(true);
  });

  it('finds Channels by name', () => {
    const hits = search(index, 'orders.');
    expect(hits.map((hit) => hit.id)).toEqual([
      'orders.confirmed',
      'orders.placed',
      'orders.shipped',
    ]);
    expect(hits.every((hit) => hit.kind === 'channel' && hit.field === 'name')).toBe(true);
  });

  it('finds Applications by scalar Attribute values, Team and Kind', () => {
    const airflow = search(index, 'airflow');
    expect(airflow.map((hit) => hit.id)).toEqual([
      'acme/data/events-pipeline',
      'acme/data/warehouse-loader',
    ]);
    expect(airflow[0]).toMatchObject({ field: 'attributes.runtime', value: 'airflow' });
    expect(search(index, 'data-science').map((hit) => hit.id)).toEqual([
      'acme/data/ml-recommender',
    ]);
    expect(search(index, 'mobile-app').map((hit) => hit.id)).toEqual([
      'acme/mobile/android-app',
      'acme/mobile/ios-app',
    ]);
    const booleans = search(index, 'true', 100).map((hit) => hit.id);
    expect(booleans).toContain('acme/data/ml-recommender');
    expect(booleans).toContain('acme/payments/ledger-service');
    expect(booleans).toContain('mysql-legacy');
  });

  it('ignores descriptions, urls and non-scalar Attribute values', () => {
    expect(search(index, 'strangler')).toEqual([]);
    expect(search(index, 'grafana')).toEqual([]);
    expect(search(index, 'Terminates TLS')).toEqual([]);
    expect(search(index, 'shop.example.com')).toEqual([]);
  });

  it('ranks an exact id or name first, then a prefix, then a substring, then other fields', () => {
    const graph = buildGraph(
      catalogOf(
        [
          { repository: 'x', project: 'barfoo' },
          { repository: 'x', project: 'baz', attributes: { lang: 'foo' } },
          { repository: 'x', project: 'foo' },
          { repository: 'foo', project: 'qux' },
        ],
        [{ id: 'foo', kind: 'saas', name: 'Foo Cloud' }],
      ),
    );
    const hits = search(buildSearchIndex(graph), 'foo');
    expect(hits.map((hit) => `${hit.kind}:${hit.id}:${hit.field}`)).toEqual([
      'external:foo:id',
      'application:foo/qux:id',
      'application:x/foo:id',
      'application:x/barfoo:id',
      'application:x/baz:attributes.lang',
    ]);
  });

  it('returns nothing for an empty or blank query', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, '   ')).toEqual([]);
  });

  it('honours the limit, defaulting to 20', () => {
    expect(search(index, 'a', 3)).toHaveLength(3);
    expect(search(index, 'a')).toHaveLength(20);
    expect(search(index, 'a', 0)).toEqual([]);
    expect(search(index, 'a', 1000).length).toBeGreaterThan(20);
  });

  it('reports the matched value in its original case', () => {
    expect(search(index, 'REDIS')[0]).toEqual({
      kind: 'external',
      id: 'redis',
      field: 'id',
      value: 'redis',
    });
    expect(search(index, 'shared cluster')[0]).toMatchObject({ value: 'Redis (shared cluster)' });
  });
});
