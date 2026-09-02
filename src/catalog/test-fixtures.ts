/** Paths and readers for the committed fixtures, shared by this module's tests. Not part of the interface. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLES_DIR = fileURLToPath(new URL('../../samples/', import.meta.url));
export const INVALID_DIR = path.join(SAMPLES_DIR, 'invalid');

/** `samples/<name>` */
export const sample = (name: string): string => path.join(SAMPLES_DIR, name);

/** `samples/invalid/<code>.json` */
export const invalid = (code: string): string => path.join(INVALID_DIR, `${code}.json`);

export const readText = (file: string): string => readFileSync(file, 'utf8');

export const readJson = (file: string): unknown => JSON.parse(readText(file));

/** Every `.json` file directly inside `dir`, sorted by name. */
export const listJson = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
