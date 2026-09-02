#!/usr/bin/env node
/**
 * Licence allowlist over the whole dependency tree (docs/licensing.md decision 5, ADR 0001
 * obligation 4): a licence outside the allowlist fails the build, so the next non-MIT dependency is
 * a decision, not an accident.
 *
 *   node scripts/check-licences.mjs
 *
 * Reads every package in package-lock.json, runtime and dev, on every platform, and checks its
 * licence against ALLOWED, evaluating SPDX expressions: `MIT OR Apache-2.0` passes when either side
 * is allowed, `A AND B` needs both. EXCEPTIONS lists the packages accepted outside the allowlist,
 * each with the licence, the scope it is accepted in, and why. A `dev` exception stops applying the
 * moment the package enters the runtime tree.
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
    scope: 'runtime',
    reason:
      'docs/adr/0001-elkjs-under-epl-2.0.md: accepted under EPL-2.0 alone, never the GPL secondary licence; THIRD-PARTY-NOTICES.md carries the EPL text',
  },
  {
    name: 'caniuse-lite',
    licence: 'CC-BY-4.0',
    scope: 'dev',
    reason:
      'browser-support data behind @preact/preset-vite (through @babel/core and browserslist); consulted at build time, never bundled',
  },
  {
    name: 'lightningcss',
    licence: 'MPL-2.0',
    scope: 'dev',
    reason: "Vite 8's CSS transformer, used unmodified at build time; nothing of it ships",
  },
  {
    name: 'lightningcss-*',
    licence: 'MPL-2.0',
    scope: 'dev',
    reason: 'the platform binaries of lightningcss',
  },
  {
    name: 'lru-cache',
    licence: 'BlueOak-1.0.0',
    scope: 'dev',
    reason: 'permissive licence; a jsdom dependency used at test time only',
  },
  {
    name: '@csstools/color-helpers',
    licence: 'MIT-0',
    scope: 'dev',
    reason: 'MIT without the attribution clause; a jsdom dependency used at test time only',
  },
  {
    name: '@csstools/css-syntax-patches-for-csstree',
    licence: 'MIT-0',
    scope: 'dev',
    reason: 'MIT without the attribution clause; a jsdom dependency used at test time only',
  },
];

function matchesName(pattern, name) {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

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

function packages() {
  const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const byId = new Map();
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || entry.link) {
      continue;
    }
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const scope = entry.dev || entry.devOptional ? 'dev' : 'runtime';
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
    const id = `${name}@${entry.version}`;
    const known = byId.get(id);
    if (known === undefined) {
      byId.set(id, { id, name, version: entry.version, scope, licence });
    } else if (scope === 'runtime') {
      known.scope = 'runtime';
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const rows = packages();
const failures = [];
const applied = [];
for (const row of rows) {
  const plain = (id) => ALLOWED.has(id);
  const exception = EXCEPTIONS.find((candidate) => matchesName(candidate.name, row.name));
  const withException = (id) =>
    plain(id) ||
    (exception !== undefined &&
      exception.licence === id &&
      (exception.scope === 'runtime' || row.scope === 'dev'));
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

const runtimeCount = rows.filter((row) => row.scope === 'runtime').length;
console.log(
  `licences: ${rows.length} packages in package-lock.json (${runtimeCount} runtime, ${rows.length - runtimeCount} dev)`,
);
for (const row of applied) {
  console.log(`  exception: ${row.id} ${row.licence} (${row.scope})`);
}
if (failures.length > 0) {
  console.error(`licence check failed for ${failures.length} package(s):`);
  for (const row of failures) {
    console.error(`  ${row.id}  ${row.detail}  (${row.scope})`);
  }
  console.error(
    `allowed: ${[...ALLOWED].join(', ')}. A new licence is a decision (docs/licensing.md): add an EXCEPTIONS row in scripts/check-licences.mjs with its reason, or replace the package.`,
  );
  process.exit(1);
}
console.log('every licence is on the allowlist or covered by a recorded exception');
