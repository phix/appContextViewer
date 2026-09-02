#!/usr/bin/env node
/**
 * Bundle budgets 13 and 14 from docs/performance-budgets.md, read from Vite's build manifest.
 *
 *   13  initial JS + CSS, everything loaded on /             <= 250 KB gzipped
 *   14  any chunk not loaded initially (the elk worker later)  <= 500 KB gzipped
 *
 * "KB" follows the budgets doc, which calls 415,910 bytes "406 KB": kibibytes. Run after
 * `vite build`; the manifest is dist/.vite/manifest.json (build.manifest in vite.config.ts). The
 * initial set is the HTML entry, its CSS and the closure of its static imports; every other JS or
 * CSS file the build emitted, listed in the manifest or not, is a non-initial chunk. Sizes are
 * deterministic, so BUDGET_FACTOR does not apply here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const INITIAL_BUDGET = 250 * KB;
const CHUNK_BUDGET = 500 * KB;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repoRoot, 'dist');
const manifestPath = path.join(dist, '.vite', 'manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.error(`${path.relative(repoRoot, manifestPath)} is missing: run \`vite build\` first`);
  process.exit(1);
}

const initial = new Set();
function visit(key) {
  const chunk = manifest[key];
  if (chunk === undefined || initial.has(chunk.file)) {
    return;
  }
  initial.add(chunk.file);
  for (const css of chunk.css ?? []) {
    initial.add(css);
  }
  for (const dependency of chunk.imports ?? []) {
    visit(dependency);
  }
}
const htmlEntries = Object.keys(manifest).filter(
  (key) => manifest[key].isEntry && key.endsWith('.html'),
);
if (htmlEntries.length === 0) {
  console.error('the manifest has no HTML entry; is index.html the build input?');
  process.exit(1);
}
for (const key of htmlEntries) {
  visit(key);
}

function emittedFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.vite') {
        files.push(...emittedFiles(full));
      }
    } else if (/\.(m?js|css)$/.test(entry.name)) {
      files.push(path.relative(dist, full).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

const format = (bytes) => `${(bytes / KB).toFixed(1)} KB`;
const rows = emittedFiles(dist).map((file) => ({
  file,
  initial: initial.has(file),
  gzip: gzipSync(readFileSync(path.join(dist, file))).length,
}));
const initialTotal = rows.filter((row) => row.initial).reduce((sum, row) => sum + row.gzip, 0);

console.log('bundle budgets (gzipped):');
for (const row of rows) {
  console.log(
    `  ${row.initial ? 'initial' : 'chunk  '}  ${format(row.gzip).padStart(10)}  ${row.file}`,
  );
}
console.log(`  initial total ${format(initialTotal)} of ${format(INITIAL_BUDGET)} (budget 13)`);

const failures = [];
if (initialTotal > INITIAL_BUDGET) {
  failures.push(
    `budget 13: initial JS+CSS is ${format(initialTotal)}, over ${format(INITIAL_BUDGET)}`,
  );
}
for (const row of rows) {
  if (!row.initial && row.gzip > CHUNK_BUDGET) {
    failures.push(`budget 14: ${row.file} is ${format(row.gzip)}, over ${format(CHUNK_BUDGET)}`);
  }
}
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
console.log('every bundle budget holds');
