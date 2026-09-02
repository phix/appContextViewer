import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../../schema/catalog.v1.schema.json';
import type { FindingCode } from './index';
import { loadCatalog, validateCatalog } from './index';
import { INVALID_DIR, listJson, readText, SAMPLES_DIR } from './test-fixtures';

/**
 * ADR 0002: the validator is hand-written, so this test keeps it honest against the JSON Schema a
 * producer validates with. For every committed fixture both must accept or both must reject, with
 * exactly two kinds of permitted difference: the three downgrades (a schema violation the viewer
 * turns into a warning, docs/validation-surfacing.md decision 9) and the four rules the JSON
 * Schema cannot express (docs/schema-v1.md, "Rules the viewer enforces beyond the JSON Schema").
 */
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const schemaValidate = ajv.compile(schema);

/** ajv keyword of a violation the viewer downgrades, and the warning it becomes. */
const DOWNGRADES: Record<string, FindingCode> = {
  additionalProperties: 'W_UNKNOWN_KEY',
  uniqueItems: 'W_DUPLICATE_ENTRY',
  format: 'W_INVALID_FORMAT',
};
const DOWNGRADE_CODES = new Set<string>(Object.values(DOWNGRADES));

/** Errors the JSON Schema has no way to raise. */
const BEYOND_THE_SCHEMA = new Set<string>([
  'E_DUPLICATE_APPLICATION',
  'E_DUPLICATE_EXTERNAL',
  'E_UNRESOLVED_REF',
  'E_SELF_DEPENDENCY',
]);

type Outcome = 'both accept' | 'both reject' | 'downgraded' | 'beyond the schema' | 'not JSON';
const outcomes = new Map<string, Outcome>();

const files = [...listJson(SAMPLES_DIR), ...listJson(INVALID_DIR)].map((file) => [
  path.relative(SAMPLES_DIR, file),
  file,
]);

describe.each(files)('%s', (name, file) => {
  it('gets the same verdict from ajv and validateCatalog, the documented exceptions aside', async () => {
    const text = readText(file);
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      // Neither validator sees a document that does not parse; the loader rejects it first.
      const loaded = await loadCatalog(new File([text], path.basename(file)));
      expect(loaded.errors.map((e) => e.code)).toEqual(['E_PARSE']);
      outcomes.set(name, 'not JSON');
      return;
    }

    const schemaAccepts = schemaValidate(document);
    const keywords = [...new Set((schemaValidate.errors ?? []).map((e) => e.keyword))];
    const ours = validateCatalog(document);
    const oursAccepts = ours.errors.length === 0;
    const ourCodes = [...new Set(ours.errors.map((e) => e.code))];
    const ourDowngrades = ours.warnings.filter((w) => DOWNGRADE_CODES.has(w.code));

    if (schemaAccepts && oursAccepts) {
      expect(
        ourDowngrades,
        'the schema found nothing to downgrade, so no downgrade may appear',
      ).toEqual([]);
      outcomes.set(name, 'both accept');
    } else if (!schemaAccepts && oursAccepts) {
      expect(
        keywords.filter((keyword) => !(keyword in DOWNGRADES)),
        `validateCatalog accepted what ajv rejected for ${keywords.join(', ')}; only the three downgrades may differ`,
      ).toEqual([]);
      for (const keyword of keywords) {
        expect(
          ours.warnings.map((w) => w.code),
          `ajv's ${keyword} must surface as a warning`,
        ).toContain(DOWNGRADES[keyword]);
      }
      outcomes.set(name, 'downgraded');
    } else if (schemaAccepts && !oursAccepts) {
      expect(
        ourCodes.filter((code) => !BEYOND_THE_SCHEMA.has(code)),
        `validateCatalog rejected what ajv accepted for ${ourCodes.join(', ')}; only the rules beyond the JSON Schema may differ`,
      ).toEqual([]);
      outcomes.set(name, 'beyond the schema');
    } else {
      expect(ours.catalog).toBeUndefined();
      outcomes.set(name, 'both reject');
    }
  });
});

describe('the fixture set', () => {
  it('exercises every branch of the agreement', () => {
    expect(outcomes.size).toBe(files.length);
    const byOutcome = new Map<Outcome, string[]>();
    for (const [name, outcome] of outcomes) {
      byOutcome.set(outcome, [...(byOutcome.get(outcome) ?? []), name]);
    }
    expect([...byOutcome.keys()].sort()).toEqual([
      'beyond the schema',
      'both accept',
      'both reject',
      'downgraded',
      'not JSON',
    ]);
    expect(byOutcome.get('downgraded')).toEqual([
      'invalid/W_DUPLICATE_ENTRY.json',
      'invalid/W_INVALID_FORMAT.json',
      'invalid/W_UNKNOWN_KEY.json',
    ]);
    expect(byOutcome.get('not JSON')).toEqual(['invalid/E_PARSE.json']);
    expect(byOutcome.get('beyond the schema')).toEqual([
      'invalid/E_DUPLICATE_APPLICATION.json',
      'invalid/E_DUPLICATE_EXTERNAL.json',
      'invalid/E_SELF_DEPENDENCY.json',
      'invalid/E_UNRESOLVED_REF.json',
    ]);
  });

  it('is what samples/README.md says: the five Catalogs pass ajv in strict mode with formats', () => {
    for (const [name] of files) {
      if (!name.startsWith('catalog')) {
        continue;
      }
      expect(outcomes.get(name), name).toBe('both accept');
    }
  });
});
