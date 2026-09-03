#!/usr/bin/env node
// Deterministic synthetic Catalog generator for schema v1 (docs/schema-v1.md).
//
//   node samples/generate.mjs --apps 1000 --out samples/catalog-1000.json
//
// Options: --apps N (1000), --seed S (1), --deps MEAN requested Dependencies per Application (5.5), --out FILE (stdout).
// Same arguments, same bytes. No dependencies. Node 20 or newer. The model is described in samples/README.md.

import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- arguments
const usage = 'usage: node samples/generate.mjs [--apps N] [--seed S] [--deps MEAN] [--out FILE]';
const opts = { apps: 1000, seed: 1, deps: 5.5, out: null };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  const value = process.argv[i + 1];
  if (!(key in opts) || value === undefined) { console.error(usage); process.exit(2); }
  opts[key] = key === 'out' ? value : Number(value);
  if (key !== 'out' && !Number.isFinite(opts[key])) { console.error(usage); process.exit(2); }
}
if (opts.apps < 1) { console.error('--apps must be at least 1'); process.exit(2); }

// ---------------------------------------------------------------- PRNG (mulberry32)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(opts.seed);
const int = (n) => Math.floor(rnd() * n); // 0 .. n-1
const between = (lo, hi) => lo + int(hi - lo + 1); // inclusive
const pick = (arr) => arr[int(arr.length)];
const chance = (p) => rnd() < p;
function weighted(pairs) {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}
// mean-`m` exponential, rounded, clipped
const outDegree = (m, cap) => Math.min(cap, Math.round(-m * Math.log(1 - rnd())));

// ---------------------------------------------------------------- vocabulary
// Telecom-flavored, matching samples/att/ (ATT-IDP1..5): billing, network, identity, activation,
// mediation, assurance, provisioning. A few generic platform terms stay — they fit any estate.
const DOMAINS = ['billing', 'identity', 'network', 'provisioning', 'assurance', 'mediation', 'activation',
  'fulfillment', 'care', 'commerce', 'accounts', 'messaging', 'media', 'reporting', 'ledger', 'auth', 'gateway',
  'content', 'support', 'growth', 'platform', 'infra', 'observability', 'compliance', 'risk', 'roaming',
  'topology', 'spectrum', 'inventory', 'transport', 'wireless', 'fiber', 'ran', 'geo', 'scheduling', 'catalog',
  'customer', 'partner', 'vendor', 'procurement', 'finance', 'hr', 'legal', 'security', 'devex', 'mobile', 'web',
  'data', 'ml', 'experiments', 'localization', 'imaging', 'video', 'oss', 'bss', 'affiliate', 'digital'];
const REPO_SUFFIXES = [['', 40], ['-platform', 12], ['-services', 12], ['-core', 10], ['-tools', 8], ['-apps', 6], ['-jobs', 6], ['-monorepo', 6]];
const ORGS = [['ATT-IDP1', 17], ['ATT-IDP2', 17], ['ATT-IDP3', 17], ['ATT-IDP4', 17], ['ATT-IDP5', 17], [null, 15]]; // null: single-segment Repository with no org prefix
const NOUNS = ['alarm', 'fault', 'circuit', 'subscriber', 'sim', 'esim', 'port', 'trunk', 'route', 'coverage',
  'tariff', 'cdr', 'ticket', 'incident', 'kpi', 'counter', 'threshold', 'dispatch', 'technician', 'appointment',
  'session', 'token', 'profile', 'avatar', 'email', 'sms', 'push', 'webhook', 'export', 'import', 'sync', 'audit',
  'event', 'metric', 'trace', 'alert', 'report', 'dashboard', 'feed', 'ranking', 'index', 'crawler', 'parser',
  'renderer', 'scheduler', 'dispatcher', 'router', 'proxy', 'cache', 'ledger', 'wallet', 'refund', 'dispute',
  'kyc', 'consent', 'policy', 'tenant', 'org', 'team', 'role', 'permission', 'license', 'plan', 'rate', 'quote',
  'price', 'stock', 'topology', 'spectrum', 'tracking', 'translate', 'locale', 'currency', 'tax', 'score',
  'model', 'feature', 'training', 'inference', 'image', 'video', 'thumbnail', 'upload', 'download', 'backup',
  'archive', 'cleanup', 'migration', 'config', 'secret', 'flag', 'bff', 'graphql', 'grpc', 'admin', 'portal',
  'onboarding', 'signup', 'login', 'settings', 'billing', 'payout', 'statement', 'reconcile', 'settlement',
  'notify', 'digest', 'campaign', 'segment'];
const KINDS = [['service', 53], ['library', 12], ['job', 10], ['pipeline', 8], ['web-app', 5], ['mobile-app', 3], ['cli', 1], ['function', 1], [null, 7]];
const KIND_SUFFIX = {
  service: [['-service', 55], ['-api', 25], ['', 20]],
  library: [['-lib', 40], ['-sdk', 30], ['-client', 30]],
  job: [['-job', 40], ['-cron', 30], ['-worker', 30]],
  pipeline: [['-pipeline', 60], ['-etl', 40]],
  'web-app': [['-web', 40], ['-portal', 30], ['-console', 30]],
  'mobile-app': [['-ios', 50], ['-android', 50]],
  cli: [['-cli', 100]],
  function: [['-fn', 50], ['-lambda', 50]],
  null: [['', 100]],
};
const TEAMS = ['platform', 'commerce', 'payments', 'growth', 'data', 'search', 'mobile', 'web', 'infra', 'identity',
  'logistics', 'support', 'risk', 'content', 'analytics', 'messaging', 'billing', 'catalog', 'fulfillment', 'observability',
  'security', 'devex', 'ads', 'partners', 'finance', 'experiments', 'localization', 'media', 'ml', 'core'];
const LANGS = [['go', 22], ['java', 20], ['typescript', 18], ['python', 15], ['node', 10], ['kotlin', 8], ['rust', 3], ['csharp', 2], ['ruby', 1], ['php', 1]];
const RUNTIMES = ['k8s', 'k8s', 'k8s', 'lambda', 'ecs', 'vm', 'vercel', 'airflow'];
const TAGS = ['critical-path', 'strangler', 'pci', 'gdpr', 'experimental', 'internal', 'public-api', 'batch', 'legacy', 'edge'];
const EXTERNALS = [ // [id, kind, name?, attributes?]
  ['postgres-main', 'database', 'Postgres (main cluster)', { engine: 'postgres', version: 16, region: 'us-east-1' }],
  ['redis-main', 'cache', 'Redis (shared cluster)'],
  ['kafka', 'queue', 'Kafka (MSK)', { region: 'us-east-1' }],
  ['s3-assets', 'storage', 'S3 assets bucket', { region: 'us-east-1' }],
  ['okta', 'identity', null],
  ['stripe', 'saas', null],
  ['postgres-orders', 'database', 'Postgres (orders)', { engine: 'postgres', version: 16 }],
  ['cloudflare', 'network', 'Cloudflare (WAF, DNS)'],
  ['sendgrid', 'saas', null],
  ['redis-sessions', 'cache', 'Redis (sessions)'],
  ['mysql-legacy', 'database', 'MySQL 5.7 (legacy)', { engine: 'mysql', deprecated: true }],
  ['rabbitmq', 'queue', null],
  ['s3-events', 'storage', 'S3 events bucket'],
  ['bigquery', 'database', 'BigQuery warehouse'],
  ['vault', 'secrets', 'HashiCorp Vault'],
  ['twilio', 'saas', null],
  ['elasticsearch', 'search', 'Elasticsearch 8'],
  ['dynamodb-sessions', 'database', 'DynamoDB (sessions)'],
  ['sqs-events', 'queue', 'SQS (events)'],
  ['gcs-backups', 'storage', 'GCS backups'],
  ['auth0', 'identity', null],
  ['salesforce', 'saas', null],
  ['zendesk', 'saas', null],
  ['contentful', 'saas', 'Contentful CMS'],
  ['segment', 'saas', null],
  ['launchdarkly', 'saas', 'LaunchDarkly'],
  ['nginx-ingress', 'network', 'NGINX ingress'],
  ['envoy-mesh', 'network', 'Envoy service mesh'],
  ['memcached', 'cache', null],
  ['mongo-profiles', 'database', 'MongoDB (profiles)'],
  ['cockroach-ledger', 'database', 'CockroachDB (ledger)'],
  ['firebase', 'saas', 'Firebase (push, crash reporting)'],
  ['datadog', 'saas', null],
  ['pagerduty', 'saas', null],
  ['snowflake', 'database', 'Snowflake warehouse'],
];
const EXTERNAL_KINDS = ['database', 'cache', 'queue', 'storage', 'saas', 'identity', 'network', 'other'];
const CHANNEL_EVENTS = ['created', 'updated', 'deleted', 'placed', 'confirmed', 'shipped', 'captured', 'failed', 'expired', 'changed', 'requested', 'completed'];

// ---------------------------------------------------------------- repositories
const N = opts.apps;
const repositories = [];
const repoNames = new Set();
{
  let assigned = 0;
  while (assigned < N) {
    let size = weighted([[1, 40], [between(2, 5), 25], [between(6, 15), 20], [between(16, 50), 15]]);
    size = Math.min(size, N - assigned);
    const org = weighted(ORGS);
    let base = pick(DOMAINS) + weighted(REPO_SUFFIXES);
    let name = org ? `${org}/${base}` : base;
    for (let n = 2; repoNames.has(name); n++) name = org ? `${org}/${base}-${n}` : `${base}-${n}`;
    repoNames.add(name);
    repositories.push({ name, size, org, pci: base.startsWith('payments') || base.startsWith('billing') || base.startsWith('ledger') });
    assigned += size;
  }
}

// ---------------------------------------------------------------- teams
const teamCount = Math.max(3, Math.round(N / 12));
const teams = [];
for (let i = 0; i < teamCount; i++) teams.push(i < TEAMS.length ? TEAMS[i] : `team-${i + 1}`);
for (const repo of repositories) repo.team = pick(teams);

// ---------------------------------------------------------------- applications
const apps = [];
for (const repo of repositories) {
  const used = new Set();
  for (let i = 0; i < repo.size; i++) {
    const kind = weighted(KINDS);
    let project = pick(NOUNS) + weighted(KIND_SUFFIX[kind]);
    for (let n = 2; used.has(project); n++) project = `${pick(NOUNS)}${weighted(KIND_SUFFIX[kind])}-${n}`;
    used.add(project);
    const teamRoll = rnd();
    const team = teamRoll < 0.85 ? repo.team : teamRoll < 0.93 ? pick(teams) : null;
    // Tiers layer the Dependency graph the way real estates do: 0 clients, 1 edges and BFFs,
    // 2-3 domain services, 4 platform services, 5 hubs. Edges run from a lower tier to a higher one.
    let tier;
    if (kind === 'web-app' || kind === 'mobile-app') tier = 0;
    else if (kind === 'job' || kind === 'pipeline') tier = weighted([[0, 30], [1, 40], [2, 30]]);
    else tier = weighted([[1, 20], [2, 30], [3, 30], [4, 20]]);
    apps.push({ repo, project, id: `${repo.name}/${project}`, kind, team, tier, rank: tier + rnd(), hub: false, inDegree: 0 });
  }
}
const edgeBearing = apps.filter((a) => a.kind !== 'library'); // libraries are cataloged but carry no runtime edges

// hubs: a few platform-style services that most of the Catalog ends up needing
const hubCount = Math.max(2, Math.round(N / 50));
{
  const services = edgeBearing.filter((a) => a.kind === 'service');
  const pool = services.length ? services : edgeBearing;
  const chosen = new Set();
  while (chosen.size < Math.min(hubCount, pool.length)) chosen.add(pick(pool));
  for (const h of chosen) { h.hub = true; h.tier = 5; h.rank = 5 + rnd(); }
}
const hubs = apps.filter((a) => a.hub).sort((a, b) => b.rank - a.rank || (a.id < b.id ? -1 : 1));
{
  // hubs read like the platform services a real Catalog has at its root
  const names = ['auth-service', 'user-service', 'api-gateway', 'config-service', 'feature-flags', 'session-service', 'identity-api',
    'notification-service', 'permissions-service', 'tenant-service', 'audit-service', 'secrets-broker', 'search-api', 'billing-api',
    'geo-service', 'file-service', 'event-bus-api', 'pricing-service', 'catalog-api', 'rate-limiter-api'];
  let next = 0;
  for (const h of hubs) {
    const taken = new Set(apps.filter((a) => a.repo === h.repo).map((a) => a.project));
    let name = names[next % names.length] + (next >= names.length ? `-${Math.floor(next / names.length) + 1}` : '');
    next++;
    if (taken.has(name)) continue; // keep the generated name rather than collide
    h.project = name;
    h.id = `${h.repo.name}/${name}`;
  }
}
const byRank = [...edgeBearing].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
byRank.forEach((a, i) => { a.rankIndex = i; });
for (const repo of repositories) repo.members = byRank.filter((a) => a.repo === repo);
const TIERS = 6;
const byTier = Array.from({ length: TIERS }, (_, t) => byRank.filter((a) => a.tier === t));

// ---------------------------------------------------------------- externals
const externalCount = Math.max(5, Math.round(N / 40));
const externals = [];
for (let i = 0; i < externalCount; i++) {
  if (i < EXTERNALS.length) {
    const [id, kind, name, attributes] = EXTERNALS[i];
    externals.push({ id, kind, name, attributes, inDegree: 0 });
  } else {
    const kind = EXTERNAL_KINDS[i % EXTERNAL_KINDS.length];
    externals.push({ id: `${kind}-${i + 1}`, kind, name: null, attributes: undefined, inDegree: 0 });
  }
}

// ---------------------------------------------------------------- channels
const channelCount = Math.max(3, Math.round(N / 10));
const channels = [];
{
  const seen = new Set();
  while (channels.length < channelCount) {
    const name = `${pick(DOMAINS)}.${pick(CHANNEL_EVENTS)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    channels.push(name);
  }
}
const channelWeights = channels.map((c, i) => [c, 1 / (i + 1)]); // a few popular Channels, a long tail

// ---------------------------------------------------------------- dependencies
// Every edge runs from a lower rank to a higher one, so the graph is a DAG until the cycle pass below.
// 60% of edges stay inside the Repository (any deeper member). Cross-Repository edges go half to a hub
// and half to an Application one or two tiers deeper, chosen by preferential attachment so most
// Applications end up with few Dependents and a handful with many.
const meanOut = opts.deps / (edgeBearing.length / apps.length || 1);
const weightedByInDegree = (list) => weighted(list.map((x) => [x, 1 + x.inDegree]));
for (const app of byRank) {
  const wanted = outDegree(meanOut, 20);
  const deps = new Set();
  const localForward = app.repo.members.filter((b) => b.rankIndex > app.rankIndex);
  const deeper = (t) => byTier[t]?.filter((b) => b.rankIndex > app.rankIndex) ?? [];
  let guard = 0;
  while (deps.size < wanted && guard++ < wanted * 8) {
    let target = null;
    if (externals.length && chance(0.15)) {
      target = weightedByInDegree(externals);
      deps.add(`external:${target.id}`);
      target.inDegree++;
      continue;
    }
    if (localForward.length && chance(0.6)) target = pick(localForward);
    if (!target && hubs.length && chance(0.5)) {
      const ahead = hubs.filter((h) => h.rankIndex > app.rankIndex);
      target = ahead.length ? pick(ahead) : null;
    }
    if (!target) {
      const skip = weighted([[1, 65], [2, 25], [3, 7], [4, 3]]);
      let candidates = deeper(Math.min(app.tier + skip, TIERS - 1));
      for (let t = app.tier + 1; !candidates.length && t < TIERS; t++) candidates = deeper(t);
      target = candidates.length ? weightedByInDegree(candidates) : null;
    }
    if (!target || target === app) continue;
    if (deps.has(target.id)) continue;
    deps.add(target.id);
    target.inDegree++;
  }
  app.dependsOn = [...deps];
}
// Cycles: a few 2- and 3-cycles inside one Repository (config -> secrets -> auth -> config).
// Each link is closed onto a target with exactly one Dependent, so no other path joins the cycle
// and every strongly connected component stays at its 2 or 3 members.
{
  const wantedCycles = Math.max(1, Math.round(N / 100));
  const byId = new Map(byRank.map((a) => [a.id, a]));
  let made = 0, guard = 0;
  while (made < wantedCycles && guard++ < wantedCycles * 50) {
    const a = pick(byRank);
    const locals = a.dependsOn.map((id) => byId.get(id)).filter((b) => b && b.repo === a.repo && b.inDegree === 1);
    if (!locals.length) continue;
    const b = pick(locals);
    let closer = b;
    if (chance(0.5)) {
      const next = b.dependsOn.map((id) => byId.get(id)).filter((c) => c && c.repo === a.repo && c !== a && c.inDegree === 1);
      if (next.length) closer = pick(next);
    }
    if (closer === a || closer.dependsOn.includes(a.id)) continue;
    closer.dependsOn.push(a.id);
    a.inDegree++;
    made++;
  }
}

// ---------------------------------------------------------------- flows
for (const app of byRank) {
  if (chance(0.25)) {
    const pub = new Set();
    const n = between(1, 2);
    while (pub.size < n) pub.add(weighted(channelWeights));
    app.publishes = [...pub];
  }
  if (chance(0.3)) {
    const sub = new Set();
    const n = between(1, 3);
    while (sub.size < n) sub.add(weighted(channelWeights));
    app.subscribes = [...sub];
  }
}
{
  // Backfill: every Channel gets a publisher and a subscriber except a few left one-sided on purpose,
  // so W_EMPTY_CHANNEL shows up in every fixture without dominating it.
  const publishers = new Map(channels.map((c) => [c, 0]));
  const subscribers = new Map(channels.map((c) => [c, 0]));
  for (const app of byRank) {
    for (const c of app.publishes ?? []) publishers.set(c, publishers.get(c) + 1);
    for (const c of app.subscribes ?? []) subscribers.set(c, subscribers.get(c) + 1);
  }
  for (const c of channels) {
    if (!publishers.get(c) && !chance(0.05)) { const a = pick(byRank); a.publishes = [...new Set([...(a.publishes ?? []), c])]; }
    if (!subscribers.get(c) && !chance(0.05)) { const a = pick(byRank); a.subscribes = [...new Set([...(a.subscribes ?? []), c])]; }
  }
}

// ---------------------------------------------------------------- attributes and display fields
function attributesFor(app) {
  if (chance(0.08)) return undefined;
  const a = {};
  a.language = weighted(LANGS);
  if (chance(0.85)) a.tier = weighted([[1, 25], [2, 35], [3, 30], [4, 10]]);
  if (chance(0.6)) a.runtime = pick(RUNTIMES);
  if (a.tier !== undefined && a.tier <= 2 && chance(0.4)) a.sla = pick(['99.9%', '99.95%', '99.99%']);
  if (chance(0.3)) a.oncall = `#${app.team ?? 'unowned'}-oncall`;
  if (app.repo.pci) a.pci = true;
  if (chance(0.05)) a.deprecated = true;
  if (chance(0.1)) a.links = { dashboard: `https://grafana.example.com/d/${app.project}`, runbook: `https://runbooks.example.com/${app.project}` };
  if (chance(0.1)) { const t = new Set(); const n = between(1, 3); while (t.size < n) t.add(pick(TAGS)); a.tags = [...t]; }
  return a;
}
const DESCRIPTIONS = ['Owns the {noun} lifecycle.', 'Read path for {noun} lookups.', 'Batch maintenance of {noun} records.', 'Public API for {noun}.', 'Internal {noun} orchestration.'];
for (const app of apps) {
  app.attributes = attributesFor(app);
  if (chance(0.6)) app.description = pick(DESCRIPTIONS).replace('{noun}', app.project.split('-')[0]);
  if (chance(0.3)) app.url = `https://${app.project}.${app.repo.org ?? 'legacy'}.example.com`;
}

// ---------------------------------------------------------------- assemble, self-check, render
const applications = apps
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((a) => {
    const out = { repository: a.repo.name, project: a.project };
    if (a.kind) out.kind = a.kind;
    if (a.team) out.team = a.team;
    if (a.description) out.description = a.description;
    if (a.url) out.url = a.url;
    if (a.dependsOn?.length) out.dependsOn = a.dependsOn;
    if (a.publishes?.length) out.publishes = a.publishes;
    if (a.subscribes?.length) out.subscribes = a.subscribes;
    if (a.attributes) out.attributes = a.attributes;
    return out;
  });
const externalsOut = externals.map((e) => {
  const out = { id: e.id, kind: e.kind };
  if (e.name) out.name = e.name;
  if (e.attributes) out.attributes = e.attributes;
  return out;
});

{
  const ids = new Set();
  const extIds = new Set(externalsOut.map((e) => e.id));
  if (extIds.size !== externalsOut.length) throw new Error('duplicate External id');
  for (const a of applications) {
    const id = `${a.repository}/${a.project}`;
    if (ids.has(id)) throw new Error(`duplicate Application id ${id}`);
    ids.add(id);
  }
  for (const a of applications) {
    const id = `${a.repository}/${a.project}`;
    for (const ref of a.dependsOn ?? []) {
      if (ref === id) throw new Error(`self Dependency ${id}`);
      const ok = ref.startsWith('external:') ? extIds.has(ref.slice(9)) : ids.has(ref);
      if (!ok) throw new Error(`unresolved ref ${ref} from ${id}`);
    }
    for (const key of ['dependsOn', 'publishes', 'subscribes']) {
      if (a[key] && new Set(a[key]).size !== a[key].length) throw new Error(`duplicate ${key} entry on ${id}`);
    }
  }
}

const source = `samples/generate.mjs --apps ${opts.apps} --seed ${opts.seed} --deps ${opts.deps}`;
const lines = (arr) => (arr.length ? arr.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n' : '');
const text = '{\n' +
  '  "schemaVersion": 1,\n' +
  `  "source": ${JSON.stringify(source)},\n` +
  '  "applications": [\n' + lines(applications) + '  ],\n' +
  '  "externals": [\n' + lines(externalsOut) + '  ]\n' +
  '}\n';

if (opts.out) writeFileSync(opts.out, text);
else process.stdout.write(text);

const depCount = applications.reduce((s, a) => s + (a.dependsOn?.length ?? 0), 0);
const flowCount = applications.reduce((s, a) => s + (a.publishes?.length ?? 0) + (a.subscribes?.length ?? 0), 0);
console.error(`${source}: ${applications.length} Applications, ${repositories.length} Repositories, ${teams.length} Teams, ` +
  `${externalsOut.length} Externals, ${channels.length} Channels, ${depCount} Dependencies, ${flowCount} Flows, ${text.length} bytes`);
