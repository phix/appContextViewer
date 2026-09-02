/**
 * Test-only helpers: the committed samples validated through the real catalog module, and a fake
 * `fetch` so `load` runs end to end in Node. Not exported from the module index.
 */
import { readFileSync } from 'node:fs';
import { type Catalog, type ValidationResult, validateCatalog } from '@/catalog';
import { createStore, type Store, type StoreInit } from './index';

export function readSampleText(fileName: string): string {
  return readFileSync(new URL(`../../samples/${fileName}`, import.meta.url), 'utf8');
}

export function readSampleDocument(fileName: string): unknown {
  return JSON.parse(readSampleText(fileName));
}

/** The sample validated; throws if a committed sample ever stops validating. */
export function validatedSample(fileName: string): ValidationResult & { catalog: Catalog } {
  const result = validateCatalog(readSampleDocument(fileName));
  if (result.catalog === undefined) {
    throw new Error(`${fileName} does not validate: ${result.errors[0]?.message}`);
  }
  return { ...result, catalog: result.catalog };
}

/** A store over the demo Catalog, as the app starts: the sample, with its warnings. */
export function demoStore(init: Partial<StoreInit> = {}): Store {
  const { catalog, warnings } = validatedSample('catalog.demo.json');
  return createStore({ catalog, warnings, ...init });
}

/** A `fetch` that serves one body for every URL, with the status given. */
export function fetchServing(body: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}
