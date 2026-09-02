import { readFileSync } from 'node:fs';
import type { CatalogInput } from './model';

/**
 * Test-only: reads a committed Catalog from samples/ and parses it with `JSON.parse`, so the graph
 * tests stay independent of the catalog module (issue #20, built in parallel) while proving that a
 * plain schema-v1 document satisfies `CatalogInput` by structure. Not exported from the module index.
 */
export function readSampleCatalog(fileName: string): CatalogInput {
  const url = new URL(`../../samples/${fileName}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as CatalogInput;
}

/** Builds a Catalog for a focused case; ids are `repository/project` as in schema v1. */
export function catalogOf(
  applications: CatalogInput['applications'],
  externals: CatalogInput['externals'] = [],
): CatalogInput {
  return { applications, externals };
}
