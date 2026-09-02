#!/usr/bin/env node
/**
 * Licence allowlist over the runtime dependency tree (docs/licensing.md decision 5, ADR 0001
 * obligation 4): only what ships in the bundle is gated, so a runtime licence outside the allowlist
 * fails the build and the next non-MIT dependency is a decision, not an accident. Dev-only packages
 * never reach the bundle and are not checked.
 *
 *   node scripts/check-licences.mjs [--lockfile <path>]
 *
 * Walks package-lock.json (or the lockfile given, for testing) and takes every entry not flagged
 * `dev` or `devOptional`: the top-level `dependencies` and everything they pull in, on every
 * platform. Each licence is checked against ALLOWED, evaluating SPDX expressions: `MIT OR Apache-2.0`
 * passes when either side is allowed, `A AND B` needs both. The check fails closed: a package with
 * no licence, or an expression it cannot parse, fails. EXCEPTIONS holds the packages accepted outside
 * the allowlist, each with the licence and the reason; elkjs is the only one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
]);

/** Each entry is a recorded decision. Delete a row and CI goes red for that package. */
const EXCEPTIONS = [
  {
    name: 'elkjs',
    licence: 'EPL-2.0',
    reason:
      'docs/adr/0001-elkjs-under-epl-2.0.md: accepted under EPL-2.0 alone, never the GPL secondary licence; THIRD-PARTY-NOTICES.md carries the EPL text',
  },
];

function licenceId(pkg) {
  const licence = pkg.license ?? pkg.licence;
  if (typeof licence === 'string') {
    return licence;
  }
  if (licence && typeof licence === 'object' && typeof licence.type === 'string') {
    return licence.type;
  }
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry.type))
      .join(' OR ');
  }
  return null;
}

/** Evaluates an SPDX expression against `allowed(id)`; `X WITH exception` is judged on X. */
function evaluate(expression, allowed) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let index = 0;
  const peek = () => tokens[index]?.toUpperCase();
  const next = () => tokens[index++];
  const primary = () => {
    const token = next();
    if (token === undefined) {
      throw new Error(`unexpected end of licence expression "${expression}"`);
    }
    if (token === '(') {
      const value = or();
      if (next() !== ')') {
        throw new Error(`unbalanced parentheses in licence expression "${expression}"`);
      }
      return value;
    }
    if (peek() === 'WITH') {
      next();
      next();
    }
    return allowed(token.replace(/\+$/, ''));
  };
  const and = () => {
    let value = primary();
    while (peek() === 'AND') {
      next();
      const right = primary();
      value = value && right;
    }
    return value;
  };
  const or = () => {
    let value = and();
    while (peek() === 'OR') {
      next();
      const right = and();
      value = value || right;
    }
    return value;
  };
  const value = or();
  if (index !== tokens.length) {
    throw new Error(`trailing tokens in licence expression "${expression}"`);
  }
  return value;
}

/** The runtime tree: every lockfile entry that is not dev-only, one row per name@version. */
function runtimePackages(lockfile) {
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  const byId = new Map();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === '' || entry.link || entry.dev || entry.devOptional) {
      continue;
    }
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const id = `${name}@${entry.version}`;
    if (byId.has(id)) {
      continue;
    }
    let licence = typeof entry.license === 'string' ? entry.license : null;
    if (licence === null) {
      try {
        licence = licenceId(
          JSON.parse(readFileSync(path.join(repoRoot, key, 'package.json'), 'utf8')),
        );
      } catch {
        licence = null;
      }
    }
    byId.set(id, { id, name, version: entry.version, licence });
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const flag = process.argv.indexOf('--lockfile');
const lockfile =
  flag >= 0 ? path.resolve(process.argv[flag + 1]) : path.join(repoRoot, 'package-lock.json');
const rows = runtimePackages(lockfile);
const failures = [];
const applied = [];
for (const row of rows) {
  const plain = (id) => ALLOWED.has(id);
  const exception = EXCEPTIONS.find((candidate) => candidate.name === row.name);
  const withException = (id) => plain(id) || (exception !== undefined && exception.licence === id);
  try {
    if (row.licence === null) {
      failures.push({ ...row, detail: 'no licence declared' });
    } else if (!evaluate(row.licence, plain)) {
      if (evaluate(row.licence, withException)) {
        applied.push(row);
      } else {
        failures.push({ ...row, detail: row.licence });
      }
    }
  } catch (error) {
    failures.push({ ...row, detail: `${row.licence} (${error.message})` });
  }
}

console.log(`licences: ${rows.length} runtime packages in ${path.relative(repoRoot, lockfile)}`);
for (const row of applied) {
  console.log(`  exception: ${row.id} ${row.licence}`);
}
if (failures.length > 0) {
  console.error(`licence check failed for ${failures.length} runtime package(s):`);
  for (const row of failures) {
    console.error(`  ${row.id}  ${row.detail}`);
  }
  console.error(
    `allowed: ${[...ALLOWED].join(', ')}. A new runtime licence is a decision (docs/licensing.md): add an EXCEPTIONS row in scripts/check-licences.mjs with its reason, or replace the package.`,
  );
  process.exit(1);
}
console.log('every runtime licence is on the allowlist or covered by a recorded exception');
