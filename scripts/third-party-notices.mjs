#!/usr/bin/env node
/**
 * Generates THIRD-PARTY-NOTICES.md, the notices file docs/licensing.md (decision 4) and
 * docs/adr/0001-elkjs-under-epl-2.0.md (obligation 1) require to travel with the site.
 *
 *   node scripts/third-party-notices.mjs          write THIRD-PARTY-NOTICES.md
 *   node scripts/third-party-notices.mjs --check  exit 1 when the committed file is stale
 *
 * The packages listed are the runtime dependency tree: every package-lock.json entry that is not
 * flagged `dev`, which is the top-level `dependencies` and whatever they pull in. Dev dependencies
 * are not shipped and are not listed. For each package the script reads its package.json (licence
 * id, author, repository) and its licence file from node_modules, so `npm ci` must have run. The
 * output is deterministic: packages sorted by name, texts verbatim with line endings normalised.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(repoRoot, 'THIRD-PARTY-NOTICES.md');
const OUTPUT_NAME = path.relative(repoRoot, OUTPUT);

/**
 * Facts a package does not state about itself, each with where it comes from. elkjs is dual
 * licensed; ADR 0001 accepts it under EPL-2.0 alone and obliges the notice to say so, to carry the
 * full EPL-2.0 text (the package's own LICENSE.md) and to name the source repository.
 */
const OVERRIDES = {
  elkjs: {
    licence: 'EPL-2.0',
    licenceNote:
      'published as "EPL-2.0 OR GPL-3.0-or-later"; used here under the Eclipse Public License 2.0 only, the GPL secondary licence is not elected (docs/adr/0001-elkjs-under-epl-2.0.md)',
    copyright:
      'the respective authors or their employers, per the Eclipse Layout Kernel NOTICE (https://github.com/eclipse-elk/elk/blob/master/NOTICE.md); the elkjs port is maintained by Ulf Rüegg',
    source: 'https://github.com/kieler/elkjs',
    sourceNote: 'used unmodified; its source code is available there (EPL-2.0, section 3.1)',
  },
};

function runtimePackages() {
  const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const seen = new Set();
  const packages = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || entry.dev || entry.devOptional || entry.link) {
      continue;
    }
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const id = `${name}@${entry.version}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    packages.push({ name, version: entry.version, dir: path.join(repoRoot, key) });
  }
  return packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function readLicenceFile(dir) {
  const candidates = readdirSync(dir).filter((f) => /^(LICEN[CS]E|COPYING)(\.|$)/i.test(f));
  if (candidates.length === 0) {
    return null;
  }
  // The bare LICENSE before LICENSE.md and friends.
  candidates.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  const file = candidates[0];
  const text = readFileSync(path.join(dir, file), 'utf8').replace(/\r\n?/g, '\n').trim();
  return { file, text };
}

function copyrightLine(text) {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^copyright\b/i.test(line)) {
      return line;
    }
  }
  return null;
}

function authorName(pkg) {
  const author = pkg.author;
  const raw = typeof author === 'string' ? author : author?.name;
  if (typeof raw !== 'string') {
    return null;
  }
  const name = raw
    .replace(/\s*<[^>]*>/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  return name === '' ? null : name;
}

function repositoryUrl(pkg) {
  let url = pkg.repository;
  if (url && typeof url === 'object') {
    url = url.url;
  }
  if (typeof url !== 'string' || url === '') {
    return typeof pkg.homepage === 'string' ? pkg.homepage : null;
  }
  url = url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/');
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    url = `https://github.com/${url}`;
  }
  return url;
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

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
function anchor(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
}

function describe(info) {
  const pkg = JSON.parse(readFileSync(path.join(info.dir, 'package.json'), 'utf8'));
  const override = OVERRIDES[info.name] ?? {};
  const licenceFile = readLicenceFile(info.dir);
  if (licenceFile === null) {
    throw new Error(
      `${info.name}@${info.version}: no licence file in ${info.dir}; add an OVERRIDES entry naming where its text comes from`,
    );
  }
  const licence = override.licence ?? licenceId(pkg);
  if (licence === null) {
    throw new Error(`${info.name}@${info.version}: package.json declares no licence`);
  }
  const author = authorName(pkg);
  const copyright =
    override.copyright ??
    copyrightLine(licenceFile.text) ??
    (author === null
      ? `not stated in ${licenceFile.file}`
      : `not stated in ${licenceFile.file}; package author: ${author}`);
  return {
    ...info,
    licence,
    licenceNote: override.licenceNote ?? null,
    copyright,
    source: override.source ?? repositoryUrl(pkg),
    sourceNote: override.sourceNote ?? null,
    licenceFile,
  };
}

function render(entries) {
  const lines = [
    '# Third-party notices',
    '',
    'App Context Viewer is MIT licensed (see LICENSE) and bundles the packages below. Each entry carries the package name, version, licence, copyright line and the full licence text, which their licences require to travel with the software.',
    '',
    'Generated by `scripts/third-party-notices.mjs` from `package-lock.json` and the installed packages; do not edit by hand. Regenerate with `node scripts/third-party-notices.mjs`; CI runs it with `--check` and fails when this file is stale.',
    '',
    '| Package | Version | Licence |',
    '| --- | --- | --- |',
  ];
  for (const entry of entries) {
    lines.push(`| [${entry.name}](#${anchor(entry.name)}) | ${entry.version} | ${entry.licence} |`);
  }
  for (const entry of entries) {
    lines.push(
      '',
      `## ${entry.name}`,
      '',
      `- Version: ${entry.version}`,
      `- Licence: ${entry.licence}${entry.licenceNote ? ` (${entry.licenceNote})` : ''}`,
      `- Copyright: ${entry.copyright}`,
      `- Source: ${entry.source ?? 'not stated'}${entry.sourceNote ? ` (${entry.sourceNote})` : ''}`,
      '',
      '```text',
      entry.licenceFile.text,
      '```',
    );
  }
  return `${lines.join('\n')}\n`;
}

const entries = runtimePackages().map(describe);
const generated = render(entries);

if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : null;
  if (current !== generated) {
    console.error(
      `${OUTPUT_NAME} is ${current === null ? 'missing' : 'stale'}: run \`node scripts/third-party-notices.mjs\` and commit the result`,
    );
    process.exit(1);
  }
  console.log(`${OUTPUT_NAME} is up to date (${entries.length} runtime packages)`);
} else {
  writeFileSync(OUTPUT, generated);
  console.log(`wrote ${OUTPUT_NAME} (${entries.length} runtime packages)`);
}
