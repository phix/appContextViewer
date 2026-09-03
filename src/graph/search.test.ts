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
        id: 'ATT-IDP5/platform-core/auth-service',
        field: 'id',
        value: 'ATT-IDP5/platform-core/auth-service',
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
      'ATT-IDP5/data/events-pipeline',
      'ATT-IDP5/data/warehouse-loader',
    ]);
    expect(airflow[0]).toMatchObject({ field: 'attributes.runtime', value: 'airflow' });
    expect(search(index, 'data-science').map((hit) => hit.id)).toEqual([
      'ATT-IDP5/data/ml-recommender',
    ]);
    expect(search(index, 'mobile-app').map((hit) => hit.id)).toEqual([
      'ATT-IDP4/mobile/android-app',
      'ATT-IDP4/mobile/ios-app',
    ]);
    const booleans = search(index, 'true', 100).map((hit) => hit.id);
    expect(booleans).toContain('ATT-IDP5/data/ml-recommender');
    expect(booleans).toContain('ATT-IDP3/payments/ledger-service');
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

describe('an Application name', () => {
  // docs/schema-v1.md, "When the id names nothing": with an opaque project the name is the only
  // thing a person can type. A Catalog whose ids already read well must not regress either.
  const named = buildGraph(
    catalogOf([
      {
        repository: 'ATT-IDP1/network-fault-management',
        project: 'apm10003',
        name: 'Fault Correlation Engine',
      },
      { repository: 'ATT-IDP4/commerce', project: 'order-service' },
    ]),
  );
  const namedIndex = buildSearchIndex(named);

  it('is searchable, and reports name as the field that matched', () => {
    const hits = search(namedIndex, 'fault correlation');
    expect(hits.map((hit) => hit.id)).toEqual(['ATT-IDP1/network-fault-management/apm10003']);
    expect(hits[0]?.field).toBe('name');
  });

  it('ranks as a primary field, so a name beats an Attribute that also contains the query', () => {
    // rankOf: a non-primary term is rank 3 whatever it matched, a primary one that starts with the
    // query is rank 1. Demote the name term and this order inverts, which is the whole point of
    // indexing it beside the id rather than beneath it.
    const graph = buildGraph(
      catalogOf([
        {
          repository: 'ATT-IDP3/revenue-core',
          project: 'apm10064',
          name: 'Billing Cycle Scheduler',
        },
        {
          repository: 'ATT-IDP1/network-performance',
          project: 'apm10009',
          name: 'KPI Collection Service',
          attributes: { owner: 'runs the billing feed' },
        },
      ]),
    );
    const hits = search(buildSearchIndex(graph), 'billing');
    expect(hits.map((hit) => hit.id)).toEqual([
      'ATT-IDP3/revenue-core/apm10064',
      'ATT-IDP1/network-performance/apm10009',
    ]);
    expect(hits[0]?.field).toBe('name');
    expect(hits[1]?.field).toBe('attributes.owner');
  });

  it('does not stop the opaque id itself from matching', () => {
    expect(search(namedIndex, 'apm10003')[0]?.id).toBe(
      'ATT-IDP1/network-fault-management/apm10003',
    );
  });

  it('leaves an Application without a name matching by id', () => {
    expect(search(namedIndex, 'order-service')[0]?.id).toBe('ATT-IDP4/commerce/order-service');
  });
});
