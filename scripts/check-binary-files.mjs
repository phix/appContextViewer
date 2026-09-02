#!/usr/bin/env node
/**
 * No tracked source file may be one git treats as binary, or its diff never reaches a reviewer:
 * `gh pr diff` and GitHub's review UI render it as "Binary files differ" and every line in it goes
 * unread. A single stray control byte does it — a literal NUL in a template literal hid all 114
 * lines of src/layout/sample-specs.ts in PR #34, the file that decides which fixture the layout
 * timings rest on. Write control characters as escapes (`\0`, `\x1b`) instead.
 *
 *   node scripts/check-binary-files.mjs
 *
 * Asks git itself, so the answer is the one the review tools use: `git ls-files --eol` reports the
 * index (`i/`) and worktree (`w/`) classification of every tracked file, and `-text` means binary.
 * Both are checked: the worktree is what you are about to commit, the index what a reviewer fetches.
 * Exit 1 naming each file and the first offending byte offset.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['src', 'e2e', 'scripts', 'schema', 'docs', 'samples', '*.ts', '*.json', '*.md'];

const output = execFileSync('git', ['ls-files', '--eol', '-z', '--', ...SCANNED], {
  cwd: repoRoot,
  encoding: 'utf8',
});

const offenders = [];
for (const record of output.split('\0')) {
  if (record === '') {
    continue;
  }
  // "i/<index>  w/<worktree>  attr/<attr>\t<path>"
  const [attributes, file] = record.split('\t');
  const [index, worktree] = attributes.trim().split(/\s+/);
  if (index === 'i/-text' || worktree === 'w/-text') {
    offenders.push({ file, index, worktree });
  }
}

if (offenders.length > 0) {
  for (const { file, index, worktree } of offenders) {
    let where = '';
    try {
      const at = readFileSync(path.join(repoRoot, file)).indexOf(0);
      where = at >= 0 ? `; first NUL byte at offset ${at}` : '';
    } catch {
      // The file may be deleted in the worktree; the index classification still stands.
    }
    console.error(`binary: ${file} (${index}, ${worktree})${where}`);
  }
  console.error(
    'git treats these tracked files as binary, so their diffs are invisible in review; write control characters as escapes',
  );
  process.exit(1);
}

const count = output.split('\0').filter((record) => record !== '').length;
console.log(`binary check: ${count} tracked source files, none that git treats as binary`);
