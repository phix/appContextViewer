#!/usr/bin/env node
/**
 * Every `src/**\/*.test.{ts,tsx}` file must be claimed by exactly one Vitest project, or it is never
 * run and nobody notices (a file outside every project's `include` passes silently). This asks
 * Vitest itself which files each project in vitest.config.ts claims and compares that with the
 * files on disk.
 *
 *   node scripts/check-test-files.mjs
 *
 * Exit 1 when a test file is claimed by no project or by more than one.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'src');
const isTestFile = (name) => /\.test\.tsx?$/.test(name);

function testFilesOnDisk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...testFilesOnDisk(full));
    } else if (isTestFile(entry.name)) {
      files.push(path.relative(repoRoot, full).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function claimedByVitest() {
  const output = execFileSync(
    process.execPath,
    [path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'list', '--filesOnly', '--json'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const claims = new Map();
  for (const entry of JSON.parse(output)) {
    const file = path.relative(repoRoot, entry.file).split(path.sep).join('/');
    const projects = claims.get(file) ?? [];
    projects.push(entry.projectName ?? '(unnamed)');
    claims.set(file, projects);
  }
  return claims;
}

const onDisk = testFilesOnDisk(src);
const claims = claimedByVitest();
const unclaimed = onDisk.filter((file) => !claims.has(file));
const contested = onDisk.filter((file) => (claims.get(file) ?? []).length > 1);

if (unclaimed.length > 0 || contested.length > 0) {
  for (const file of unclaimed) {
    console.error(
      `unclaimed: ${file} matches no project include in vitest.config.ts, so it never runs`,
    );
  }
  for (const file of contested) {
    console.error(`contested: ${file} is claimed by ${claims.get(file).join(' and ')}`);
  }
  console.error(
    'every src/**/*.test.{ts,tsx} file must fall inside exactly one project include in vitest.config.ts',
  );
  process.exit(1);
}

const perProject = new Map();
for (const file of onDisk) {
  const project = claims.get(file)[0];
  perProject.set(project, (perProject.get(project) ?? 0) + 1);
}
const summary = [...perProject].map(([project, count]) => `${project}: ${count}`).join(', ');
console.log(
  `test files: ${onDisk.length} in src/, each claimed by exactly one Vitest project (${summary})`,
);
