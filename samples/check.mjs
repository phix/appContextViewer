#!/usr/bin/env node
// Checks a Catalog against the schema v1 rules the viewer enforces (docs/schema-v1.md;
// duplicate entries and display-only formats are warnings per docs/validation-surfacing.md)
// and prints row counts. Exit code 1 when any error is found.
//
//   node samples/check.mjs samples/catalog.demo.json [--json]
//
// Structural checks approximate the JSON Schema (types, patterns, unique items, unknown keys).
// For a full JSON Schema validation run ajv against schema/catalog.v1.schema.json.

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const asJson = process.argv.includes('--json');
if (!file) { console.error('usage: node samples/check.mjs <catalog.json> [--json]'); process.exit(2); }

const text = readFileSync(file, 'utf8');
const catalog = JSON.parse(text);

const errors = [];
const warnings = [];
const error = (code, path, message) => errors.push({ code, path, message });
const warn = (code, path, message) => warnings.push({ code, path, message });

const RE = {
  repository: /^[^\s/](?:[^\s]*[^\s/])?$/,
  project: /^[^\s/]+$/,
  applicationRef: /^[^\s]+\/[^\s/]+$/,
  externalRef: /^external:[^\s/]+$/,
  channel: /^\S+$/,
  externalId: /^[^\s/]+$/,
};
const ENVELOPE_KEYS = new Set(['schemaVersion', 'generatedAt', 'source', 'applications', 'externals']);
const APP_KEYS = new Set(['repository', 'project', 'kind', 'team', 'description', 'url', 'dependsOn', 'publishes', 'subscribes', 'attributes']);
const EXT_KEYS = new Set(['id', 'kind', 'name', 'description', 'url', 'attributes']);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v) => ['string', 'number', 'boolean'].includes(typeof v);
const isUri = (v) => { try { new URL(v); return true; } catch { return false; } };

// ---------------------------------------------------------------- envelope
if (!isObject(catalog)) { error('E_INVALID', '$', 'Catalog is not an object'); finish(); }
if (catalog.schemaVersion !== 1) error('E_SCHEMA_VERSION', '$.schemaVersion', `expected 1, got ${JSON.stringify(catalog.schemaVersion)}`);
if (!Array.isArray(catalog.applications)) error('E_INVALID', '$.applications', 'missing or not an array');
if (catalog.externals !== undefined && !Array.isArray(catalog.externals)) error('E_INVALID', '$.externals', 'not an array');
if (catalog.generatedAt !== undefined && typeof catalog.generatedAt !== 'string') error('E_INVALID', '$.generatedAt', 'not a string');
else if (typeof catalog.generatedAt === 'string' && Number.isNaN(Date.parse(catalog.generatedAt))) warn('W_INVALID_FORMAT', '$.generatedAt', `not RFC 3339: ${JSON.stringify(catalog.generatedAt)}`);
if (catalog.source !== undefined && typeof catalog.source !== 'string') error('E_INVALID', '$.source', 'not a string');
for (const key of Object.keys(catalog)) if (!ENVELOPE_KEYS.has(key)) warn('W_UNKNOWN_KEY', `$.${key}`, 'unknown envelope key');
if (errors.length) finish();

// ---------------------------------------------------------------- externals
const externals = new Map();
(catalog.externals ?? []).forEach((ext, i) => {
  const path = `$.externals[${i}]`;
  if (!isObject(ext)) { error('E_INVALID', path, 'not an object'); return; }
  if (typeof ext.id !== 'string' || !RE.externalId.test(ext.id)) error('E_INVALID', `${path}.id`, `missing or invalid id ${JSON.stringify(ext.id)}`);
  if (typeof ext.kind !== 'string' || !ext.kind) error('E_INVALID', `${path}.kind`, 'missing kind');
  for (const key of ['name', 'description', 'url']) if (ext[key] !== undefined && typeof ext[key] !== 'string') error('E_INVALID', `${path}.${key}`, 'not a string');
  if (typeof ext.url === 'string' && !isUri(ext.url)) warn('W_INVALID_FORMAT', `${path}.url`, `not a URI: ${JSON.stringify(ext.url)}`);
  if (ext.attributes !== undefined && !isObject(ext.attributes)) error('E_INVALID', `${path}.attributes`, 'not an object');
  for (const key of Object.keys(ext)) if (!EXT_KEYS.has(key)) warn('W_UNKNOWN_KEY', `${path}.${key}`, 'unknown External key');
  if (typeof ext.id === 'string') {
    if (externals.has(ext.id)) error('E_DUPLICATE_EXTERNAL', `${path}.id`, `duplicate External id ${ext.id}`);
    else externals.set(ext.id, { ...ext, dependents: new Set() });
  }
});

// ---------------------------------------------------------------- applications
const apps = new Map();
const order = [];
catalog.applications.forEach((app, i) => {
  const path = `$.applications[${i}]`;
  if (!isObject(app)) { error('E_INVALID', path, 'not an object'); return; }
  if (typeof app.repository !== 'string' || !RE.repository.test(app.repository)) error('E_INVALID', `${path}.repository`, `missing or invalid repository ${JSON.stringify(app.repository)}`);
  if (typeof app.project !== 'string' || !RE.project.test(app.project)) error('E_INVALID', `${path}.project`, `missing or invalid project ${JSON.stringify(app.project)}`);
  for (const key of ['kind', 'description', 'url']) if (app[key] !== undefined && typeof app[key] !== 'string') error('E_INVALID', `${path}.${key}`, 'not a string');
  if (typeof app.url === 'string' && !isUri(app.url)) warn('W_INVALID_FORMAT', `${path}.url`, `not a URI: ${JSON.stringify(app.url)}`);
  if (app.team !== undefined && (typeof app.team !== 'string' || !app.team)) error('E_INVALID', `${path}.team`, 'not a non-empty string');
  if (app.attributes !== undefined && !isObject(app.attributes)) error('E_INVALID', `${path}.attributes`, 'not an object');
  for (const [key, re] of [['dependsOn', null], ['publishes', RE.channel], ['subscribes', RE.channel]]) {
    const list = app[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { error('E_INVALID', `${path}.${key}`, 'not an array'); continue; }
    list.forEach((item, j) => {
      const ok = typeof item === 'string' && (re ? re.test(item) : RE.applicationRef.test(item) || RE.externalRef.test(item));
      if (!ok) error('E_INVALID', `${path}.${key}[${j}]`, `invalid entry ${JSON.stringify(item)}`);
    });
    if (new Set(list).size !== list.length) warn('W_DUPLICATE_ENTRY', `${path}.${key}`, 'duplicate entries; the viewer keeps the first');
  }
  for (const key of Object.keys(app)) if (!APP_KEYS.has(key)) warn('W_UNKNOWN_KEY', `${path}.${key}`, 'unknown Application key');
  if (typeof app.repository === 'string' && typeof app.project === 'string') {
    const id = `${app.repository}/${app.project}`;
    if (apps.has(id)) { error('E_DUPLICATE_APPLICATION', path, `duplicate Application id ${id}`); return; }
    apps.set(id, { ...app, id, path, dependencies: [], dependents: [] });
    order.push(id);
  }
});

// ---------------------------------------------------------------- references, ownership, flows
let toApplications = 0, toExternals = 0, crossRepository = 0;
for (const id of order) {
  const app = apps.get(id);
  (Array.isArray(app.dependsOn) ? app.dependsOn : []).forEach((ref, j) => {
    if (typeof ref !== 'string') return;
    if (ref === id) { error('E_SELF_DEPENDENCY', `${app.path}.dependsOn[${j}]`, `${id} depends on itself`); return; }
    if (ref.startsWith('external:')) {
      const ext = externals.get(ref.slice('external:'.length));
      if (!ext) { error('E_UNRESOLVED_REF', `${app.path}.dependsOn[${j}]`, `undeclared External ${ref}`); return; }
      ext.dependents.add(id);
      toExternals++;
    } else {
      const target = apps.get(ref);
      if (!target) { error('E_UNRESOLVED_REF', `${app.path}.dependsOn[${j}]`, `unknown Application ${ref}`); return; }
      app.dependencies.push(ref);
      target.dependents.push(id);
      toApplications++;
      if (target.repository !== app.repository) crossRepository++;
    }
  });
}
const channels = new Map();
const touch = (name) => channels.get(name) ?? channels.set(name, { publishers: new Set(), subscribers: new Set() }).get(name);
for (const id of order) {
  const app = apps.get(id);
  for (const c of Array.isArray(app.publishes) ? app.publishes : []) if (typeof c === 'string') touch(c).publishers.add(id);
  for (const c of Array.isArray(app.subscribes) ? app.subscribes : []) if (typeof c === 'string') touch(c).subscribers.add(id);
}
const emptyChannels = [];
for (const [name, c] of channels) {
  if (!c.publishers.size) { warn('W_EMPTY_CHANNEL', name, `${c.subscribers.size} subscriber(s), no publisher`); emptyChannels.push(name); }
  else if (!c.subscribers.size) { warn('W_EMPTY_CHANNEL', name, `${c.publishers.size} publisher(s), no subscriber`); emptyChannels.push(name); }
}

// ---------------------------------------------------------------- statistics
const histogram = (values) => {
  const h = {};
  for (const v of values) h[v] = (h[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
};
const list = [...apps.values()];
const repositories = new Set(list.map((a) => a.repository));
const teams = new Set(list.filter((a) => a.team).map((a) => a.team));
const repoSizes = Object.values(histogram(list.map((a) => a.repository)));

// blast radius: transitive Dependents, with the size at each Depth
function blastRadius(id) {
  const seen = new Set([id]);
  const perDepth = [];
  let frontier = [id];
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) for (const d of apps.get(cur).dependents) if (!seen.has(d)) { seen.add(d); next.push(d); }
    if (next.length) perDepth.push(next.length);
    frontier = next;
  }
  return { size: seen.size - 1, perDepth };
}
const radii = list.map((a) => ({ id: a.id, ...blastRadius(a.id) })).sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1));

// cycles: Tarjan SCC over Application Dependencies
function stronglyConnected() {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], components = [];
  function visit(v) {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of apps.get(v).dependencies) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1) components.push(comp);
    }
  }
  for (const id of order) if (!idx.has(id)) visit(id);
  return components;
}
const cycles = stronglyConnected();

// groupable Attributes, per the grouping decision: every present value is a string, number or boolean
const attributeKeys = new Map();
for (const a of list) for (const [k, v] of Object.entries(isObject(a.attributes) ? a.attributes : {})) {
  const entry = attributeKeys.get(k) ?? attributeKeys.set(k, { present: 0, scalar: true, values: new Set() }).get(k);
  entry.present++;
  if (isScalar(v)) entry.values.add(`${typeof v}:${v}`); else entry.scalar = false;
}
const groupable = {}, displayOnly = [];
for (const [k, e] of [...attributeKeys].sort()) {
  if (e.scalar) groupable[k] = { applications: e.present, distinctValues: e.values.size, missing: list.length - e.present };
  else displayOnly.push(k);
}

const stats = {
  file,
  bytes: Buffer.byteLength(text),
  applications: list.length,
  repositories: repositories.size,
  repositorySize: repoSizes.length ? { max: Math.max(...repoSizes), mean: +(list.length / repoSizes.length).toFixed(1), singletons: repoSizes.filter((s) => s === 1).length } : null,
  teams: teams.size,
  applicationsWithoutTeam: list.filter((a) => !a.team).length,
  kinds: histogram(list.map((a) => a.kind ?? '(none)')),
  externals: externals.size,
  externalKinds: histogram([...externals.values()].map((e) => e.kind)),
  channels: channels.size,
  emptyChannels: emptyChannels.length,
  dependencies: { total: toApplications + toExternals, toApplications, toExternals, crossRepository, intraRepository: toApplications - crossRepository },
  flows: {
    publishes: list.reduce((s, a) => s + (Array.isArray(a.publishes) ? a.publishes.length : 0), 0),
    subscribes: list.reduce((s, a) => s + (Array.isArray(a.subscribes) ? a.subscribes.length : 0), 0),
  },
  applicationsWithoutDependencies: list.filter((a) => !(a.dependsOn?.length)).length,
  maxOutDegree: list.reduce((m, a) => Math.max(m, a.dependsOn?.length ?? 0), 0),
  topDependents: list.map((a) => ({ id: a.id, dependents: a.dependents.length })).sort((x, y) => y.dependents - x.dependents || (x.id < y.id ? -1 : 1)).slice(0, 5),
  topExternals: [...externals.values()].map((e) => ({ id: e.id, dependents: e.dependents.size })).sort((x, y) => y.dependents - x.dependents || (x.id < y.id ? -1 : 1)).slice(0, 5),
  cycles: { components: cycles.length, applicationsInCycles: cycles.reduce((s, c) => s + c.length, 0), largest: cycles.reduce((m, c) => Math.max(m, c.length), 0) },
  blastRadius: {
    largest: radii.slice(0, 5).map((r) => ({ id: r.id, size: r.size, perDepth: r.perDepth })),
    mean: +(radii.reduce((s, r) => s + r.size, 0) / (radii.length || 1)).toFixed(1),
    zero: radii.filter((r) => r.size === 0).length,
    maxDepth: radii.reduce((m, r) => Math.max(m, r.perDepth.length), 0),
  },
  groupableAttributes: groupable,
  displayOnlyAttributes: displayOnly,
  errors: errors.length,
  warnings: warnings.length,
};

finish();

function finish() {
  if (asJson) {
    console.log(JSON.stringify({ stats: errors.length ? undefined : stats, errors, warnings }, null, 2));
  } else {
    for (const e of errors) console.log(`ERROR   ${e.code}  ${e.path}  ${e.message}`);
    for (const w of warnings) console.log(`warning ${w.code}  ${w.path}  ${w.message}`);
    if (!errors.length) {
      const s = stats;
      console.log(`\n${s.file}  (${s.bytes.toLocaleString()} bytes)`);
      console.log(`Applications ${s.applications}  Repositories ${s.repositories} (max ${s.repositorySize?.max}, mean ${s.repositorySize?.mean}, singletons ${s.repositorySize?.singletons})  Teams ${s.teams} (+${s.applicationsWithoutTeam} without)  Externals ${s.externals}  Channels ${s.channels} (${s.emptyChannels} empty)`);
      console.log(`kinds: ${Object.entries(s.kinds).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      console.log(`Dependencies ${s.dependencies.total} = ${s.dependencies.toApplications} to Applications (${s.dependencies.crossRepository} cross-Repository) + ${s.dependencies.toExternals} to Externals;  Flows ${s.flows.publishes} publishes + ${s.flows.subscribes} subscribes`);
      console.log(`no Dependencies: ${s.applicationsWithoutDependencies};  max out-degree ${s.maxOutDegree};  top Dependents: ${s.topDependents.map((t) => `${t.id} (${t.dependents})`).join(', ')}`);
      console.log(`top Externals: ${s.topExternals.map((t) => `${t.id} (${t.dependents})`).join(', ')}`);
      console.log(`cycles: ${s.cycles.components} component(s), ${s.cycles.applicationsInCycles} Applications, largest ${s.cycles.largest}`);
      console.log(`Blast radius: largest ${s.blastRadius.largest[0]?.id} = ${s.blastRadius.largest[0]?.size} [${s.blastRadius.largest[0]?.perDepth.join(', ')}];  mean ${s.blastRadius.mean};  zero ${s.blastRadius.zero};  max Depth ${s.blastRadius.maxDepth}`);
      console.log(`groupable Attributes: ${Object.entries(s.groupableAttributes).map(([k, v]) => `${k} (${v.distinctValues} values, ${v.missing} missing)`).join(', ')};  display-only: ${s.displayOnlyAttributes.join(', ') || 'none'}`);
    }
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  process.exit(errors.length ? 1 : 0);
}
