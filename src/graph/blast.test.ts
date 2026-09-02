import { describe, expect, it } from 'vitest';
import demoCatalog from '../../samples/catalog.demo.json';
import { readSampleCatalog } from './fixtures.test-helper';
import { blastRadius, buildGraph, rankedByBlastRadius } from './index';

// The fixture numbers are the ones samples/README.md lists and `node samples/check.mjs` prints.
const demo = buildGraph(demoCatalog);
const thousand = buildGraph(readSampleCatalog('catalog-1000.json'));

const sizes = (bands: readonly (readonly string[])[]) => bands.map((band) => band.length);

describe('blastRadius: Dependents banded by Depth', () => {
  it('gives 12 in bands [5, 6, 1] for acme/commerce/product-service on the demo Catalog', () => {
    const bands = blastRadius(demo, 'acme/commerce/product-service');
    expect(sizes(bands)).toEqual([5, 6, 1]);
    expect(bands.flat()).toHaveLength(12);
    expect(new Set(bands.flat()).size).toBe(12);
  });

  it('never includes the Center, even inside the auth -> config -> secrets -> auth cycle', () => {
    for (const id of [
      'acme/platform-core/auth-service',
      'acme/platform-infra/config-service',
      'acme/platform-infra/secrets-broker',
    ]) {
      const flat = blastRadius(demo, id).flat();
      expect(flat).not.toContain(id);
      expect(flat).toHaveLength(10);
    }
    expect(sizes(blastRadius(demo, 'acme/platform-core/auth-service'))).toEqual([4, 6]);
    expect(sizes(blastRadius(demo, 'acme/platform-infra/secrets-broker'))).toEqual([1, 1, 3, 5]);
  });

  it('gives 780 in bands [97, 444, 201, 36, 2] for acme/billing-platform/auth-service at 1,000 Applications', () => {
    const bands = blastRadius(thousand, 'acme/billing-platform/auth-service');
    expect(sizes(bands)).toEqual([97, 444, 201, 36, 2]);
    expect(bands.flat()).toHaveLength(780);
  });

  it('is empty for an Application nothing depends on', () => {
    expect(blastRadius(demo, 'acme/tools/cli')).toEqual([]);
    expect(blastRadius(demo, 'acme/platform-infra/rate-limiter')).toEqual([]);
  });

  it('caps the bands at maxDepth', () => {
    expect(sizes(blastRadius(demo, 'acme/commerce/product-service', 1))).toEqual([5]);
    expect(sizes(blastRadius(demo, 'acme/commerce/product-service', 2))).toEqual([5, 6]);
    expect(blastRadius(demo, 'acme/commerce/product-service', 0)).toEqual([]);
  });

  it('puts an Application at the Depth of its shortest chain of Dependents', () => {
    // api-gateway depends on product-service directly and through cart-service and pricing-service.
    const [direct] = blastRadius(demo, 'acme/commerce/product-service');
    expect(direct).toContain('acme/platform-core/api-gateway');
  });
});

describe('blastRadius: an External as the Center (docs/center.md)', () => {
  it('works the same for redis, with 10 direct Dependents on the demo Catalog', () => {
    const bands = blastRadius(demo, 'redis');
    expect(bands[0]).toHaveLength(10);
    expect(bands.flat()).not.toContain('redis');
  });

  it('gives mysql-legacy 197 direct Dependents at 1,000 Applications', () => {
    expect(blastRadius(thousand, 'mysql-legacy')[0]).toHaveLength(197);
  });

  it('accepts a Center object of either kind as well as a bare id', () => {
    expect(blastRadius(demo, { kind: 'external', id: 'redis' })).toEqual(
      blastRadius(demo, 'redis'),
    );
    expect(blastRadius(demo, { kind: 'application', id: 'acme/commerce/product-service' })).toEqual(
      blastRadius(demo, 'acme/commerce/product-service'),
    );
  });

  it('rejects a Center that is not in the Graph, or is of the wrong kind', () => {
    expect(() => blastRadius(demo, 'acme/nowhere/nothing')).toThrow(/acme\/nowhere\/nothing/);
    expect(() => blastRadius(demo, { kind: 'application', id: 'redis' })).toThrow(/redis/);
    expect(() => blastRadius(demo, { kind: 'external', id: 'acme/tools/cli' })).toThrow(
      /acme\/tools\/cli/,
    );
  });
});

describe('rankedByBlastRadius: the default screen’s rows', () => {
  it('lists Applications and Externals together with a kind, largest first', () => {
    const rows = rankedByBlastRadius(demo);
    expect(rows).toHaveLength(34 + 19);
    // docs/center.md, decision 4: Externals will often top the list; that is the table doing its job.
    expect(rows[0]).toEqual({ kind: 'external', id: 'redis', size: 23 });
    expect(rows[0].size).toBe(blastRadius(demo, 'redis').flat().length);
    expect(rows.find((row) => row.kind === 'application')).toEqual({
      kind: 'application',
      id: 'acme/commerce/product-service',
      size: 12,
    });
  });

  it('sorts by size descending, then id ascending', () => {
    const rows = rankedByBlastRadius(demo);
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const row = rows[i];
      const ordered =
        previous.size > row.size || (previous.size === row.size && previous.id < row.id);
      expect(ordered, `${previous.id} (${previous.size}) before ${row.id} (${row.size})`).toBe(
        true,
      );
    }
  });

  it('agrees with blastRadius for every row', () => {
    for (const row of rankedByBlastRadius(demo)) {
      expect(row.size, row.id).toBe(blastRadius(demo, row).flat().length);
    }
  });

  it('ranks acme/billing-platform/auth-service as the largest Application at 1,000 Applications', () => {
    const rows = rankedByBlastRadius(thousand);
    expect(rows).toHaveLength(1000 + 25);
    expect(rows.find((row) => row.kind === 'application')).toEqual({
      kind: 'application',
      id: 'acme/billing-platform/auth-service',
      size: 780,
    });
    // rabbitmq reaches auth-service, so its Blast radius is strictly larger and it tops the table.
    expect(rows[0]).toEqual({ kind: 'external', id: 'rabbitmq', size: 783 });
    expect(blastRadius(thousand, 'rabbitmq').flat()).toContain(
      'acme/billing-platform/auth-service',
    );
  });
});
