/**
 * One report component for both surfaces docs/validation-surfacing.md decides: the "Catalog
 * rejected" dialog over the current screen (`mode: 'rejected'`, decision 4) and the warnings side
 * sheet the header badge opens (`mode: 'warnings'`, decision 5). Same rows, same grouping, same
 * actions; only the chrome differs.
 *
 * Decisions this file implements: groups in FINDING_CODES order, collapsible with counts, 50 rows
 * then "show all" (7); `W_UNKNOWN_KEY` folded by key name with the first five ids (8); a row is
 * code, location, message and value, rows naming an Application select it and rows naming a Channel
 * open its card (6); actions Choose another file, Copy report as Markdown, Close (4, 10).
 *
 * It renders view models only: `Report` comes from `@/state`, and every interaction is a callback.
 */

import { useState } from 'preact/hooks';
import { FINDING_CODES, type Finding, type FindingCode } from '@/catalog';
import type { Report as ReportModel, Source } from '@/state';

/** Rows shown per group before "Show all" (docs/validation-surfacing.md, decision 7). */
export const GROUP_FOLD = 50;
/** Ids listed for one `W_UNKNOWN_KEY` key before its own "Show all" (decision 8). */
export const UNKNOWN_KEY_IDS = 5;

/**
 * An Application id is `repository/project` and always carries a `/`; an External id never may
 * (docs/schema-v1.md). That is the only discriminator a report row has, because a rejected Catalog
 * was never built into a Graph — decision 6's "rows that name an Application" is read this way.
 */
export function isApplicationId(id: string | undefined): id is string {
  return id?.includes('/') === true;
}

/** Singular and plural nouns for the summary line ("2 unresolved refs, 1 duplicate Application"). */
const CODE_NOUNS: Record<FindingCode, readonly [string, string]> = {
  E_FETCH: ['fetch failure', 'fetch failures'],
  E_TOO_LARGE: ['oversize Catalog', 'oversize Catalogs'],
  E_PARSE: ['JSON syntax error', 'JSON syntax errors'],
  E_SCHEMA_VERSION: ['unsupported schemaVersion', 'unsupported schemaVersions'],
  E_INVALID: ['schema violation', 'schema violations'],
  E_DUPLICATE_APPLICATION: ['duplicate Application', 'duplicate Applications'],
  E_DUPLICATE_EXTERNAL: ['duplicate External', 'duplicate Externals'],
  E_UNRESOLVED_REF: ['unresolved ref', 'unresolved refs'],
  E_SELF_DEPENDENCY: ['self-dependency', 'self-dependencies'],
  W_UNKNOWN_KEY: ['unknown key', 'unknown keys'],
  W_DUPLICATE_ENTRY: ['duplicate entry', 'duplicate entries'],
  W_INVALID_FORMAT: ['invalid format', 'invalid formats'],
  W_EMPTY_CHANNEL: ['one-sided Channel', 'one-sided Channels'],
};

function noun(code: FindingCode, count: number): string {
  const [one, many] = CODE_NOUNS[code];
  return count === 1 ? one : many;
}

/** Every finding in the report, errors first, as decision 7 orders them. */
export function reportFindings(report: ReportModel): readonly Finding[] {
  return [...report.errors, ...report.warnings];
}

/** The findings of each code present, in FINDING_CODES order, path order preserved within a code. */
export function groupFindings(report: ReportModel): readonly (readonly [FindingCode, Finding[]])[] {
  const byCode = new Map<FindingCode, Finding[]>();
  for (const finding of reportFindings(report)) {
    const rows = byCode.get(finding.code);
    if (rows === undefined) {
      byCode.set(finding.code, [finding]);
    } else {
      rows.push(finding);
    }
  }
  return FINDING_CODES.filter((code) => byCode.has(code)).map(
    (code) => [code, byCode.get(code) ?? []] as const,
  );
}

/** "2 unresolved refs, 1 duplicate Application" (docs/validation-surfacing.md, decision 4). */
export function summarize(report: ReportModel): string {
  const parts = groupFindings(report).map(
    ([code, rows]) => `${rows.length} ${noun(code, rows.length)}`,
  );
  return parts.length === 0 ? 'no findings' : parts.join(', ');
}

export function sourceLabel(source: Source): string {
  return source.name;
}

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function valueText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Decision 10: a heading with the source and the summary line, then one table per code, ready to
 * paste into a ticket for the producer.
 */
export function reportMarkdown(report: ReportModel): string {
  const title = report.mode === 'rejected' ? 'Catalog rejected' : 'Catalog warnings';
  const lines = [`# ${title}: ${sourceLabel(report.source)}`, '', summarize(report), ''];
  for (const [code, rows] of groupFindings(report)) {
    lines.push(`## ${code} (${rows.length})`, '');
    lines.push('| Location | Path | Message | Value |', '| --- | --- | --- | --- |');
    for (const row of rows) {
      lines.push(
        `| ${escapeCell(row.id ?? '')} | ${escapeCell(row.path)} | ${escapeCell(row.message)} | ${escapeCell(valueText(row.value))} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface ReportProps {
  readonly report: ReportModel;
  readonly onClose: () => void;
  readonly onChooseAnother: () => void;
  /** A row naming an Application selects it as the Center (decision 6). */
  readonly onSelectApplication: (id: string) => void;
  /** A `W_EMPTY_CHANNEL` row opens the Channel card (decision 6, docs/center.md decision 8). */
  readonly onOpenChannel: (name: string) => void;
  /** Injected so the Markdown is asserted without a clipboard; defaults to the async clipboard. */
  readonly copy?: (text: string) => void | Promise<void>;
}

async function writeToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function Report({
  report,
  onClose,
  onChooseAnother,
  onSelectApplication,
  onOpenChannel,
  copy = writeToClipboard,
}: ReportProps) {
  // The async clipboard rejects when the page has no permission for it; saying so beats a button
  // that looks like it worked.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const rejected = report.mode === 'rejected';
  const title = rejected ? 'Catalog rejected' : 'Warnings';
  const groups = groupFindings(report);

  const onCopy = () => {
    void Promise.resolve(copy(reportMarkdown(report)))
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  const copyLabel =
    copyState === 'copied'
      ? 'Copied'
      : copyState === 'failed'
        ? 'Copy failed'
        : 'Copy report as Markdown';

  return (
    <section
      class={rejected ? 'report report--dialog' : 'report report--sheet'}
      role={rejected ? 'dialog' : 'complementary'}
      aria-label={title}
      data-testid="report"
      data-mode={report.mode}
    >
      <header class="report__head">
        <h2>{title}</h2>
        <p class="report__source" data-testid="report-source">
          {sourceLabel(report.source)}
        </p>
        <p class="report__summary" data-testid="report-summary">
          {summarize(report)}
        </p>
      </header>

      <div class="report__groups">
        {groups.map(([code, rows]) =>
          code === 'W_UNKNOWN_KEY' ? (
            <UnknownKeyGroup key={code} rows={rows} onSelectApplication={onSelectApplication} />
          ) : (
            <FindingGroup
              key={code}
              code={code}
              rows={rows}
              onSelectApplication={onSelectApplication}
              onOpenChannel={onOpenChannel}
            />
          ),
        )}
      </div>

      <footer class="report__actions">
        <button type="button" onClick={onChooseAnother}>
          Choose another file
        </button>
        <button type="button" onClick={onCopy}>
          {copyLabel}
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </footer>
    </section>
  );
}

function FindingGroup({
  code,
  rows,
  onSelectApplication,
  onOpenChannel,
}: {
  code: FindingCode;
  rows: readonly Finding[];
  onSelectApplication: (id: string) => void;
  onOpenChannel: (name: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, GROUP_FOLD);
  return (
    <details class="report__group" data-testid="report-group" data-code={code} open>
      <summary>
        <span class="report__code">{code}</span>
        <span class="report__count">
          {rows.length} {noun(code, rows.length)}
        </span>
      </summary>
      <table class="report__table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Location</th>
            <th scope="col">Message</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <FindingRow
              key={`${row.code}:${row.path}:${valueText(row.value)}`}
              row={row}
              onSelectApplication={onSelectApplication}
              onOpenChannel={onOpenChannel}
            />
          ))}
        </tbody>
      </table>
      {rows.length > GROUP_FOLD && !showAll ? (
        <button type="button" class="report__more" onClick={() => setShowAll(true)}>
          Show all {rows.length}
        </button>
      ) : null}
    </details>
  );
}

function FindingRow({
  row,
  onSelectApplication,
  onOpenChannel,
}: {
  row: Finding;
  onSelectApplication: (id: string) => void;
  onOpenChannel: (name: string) => void;
}) {
  const value = valueText(row.value);
  const channel = row.code === 'W_EMPTY_CHANNEL' && value !== '' ? value : null;
  return (
    <tr data-testid="report-row" data-code={row.code}>
      <td>{row.code}</td>
      <td>
        {isApplicationId(row.id) ? (
          <button
            type="button"
            class="report__link"
            data-testid="report-application"
            onClick={() => onSelectApplication(row.id as string)}
          >
            {row.id}
          </button>
        ) : (
          <span>{row.id ?? ''}</span>
        )}{' '}
        <code>{row.path}</code>
      </td>
      <td>{row.message}</td>
      <td>
        {channel === null ? (
          <code>{value}</code>
        ) : (
          <button
            type="button"
            class="report__link"
            data-testid="report-channel"
            onClick={() => onOpenChannel(channel)}
          >
            {channel}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Decision 8: one producer bug emits hundreds of identical rows, so `W_UNKNOWN_KEY` folds by key
 * name ("`owner` on 212 Applications", first five ids, expandable) instead of one row per record.
 */
function UnknownKeyGroup({
  rows,
  onSelectApplication,
}: {
  rows: readonly Finding[];
  onSelectApplication: (id: string) => void;
}) {
  const byKey = new Map<string, Finding[]>();
  for (const row of rows) {
    const key = valueText(row.value);
    const bucket = byKey.get(key);
    if (bucket === undefined) {
      byKey.set(key, [row]);
    } else {
      bucket.push(row);
    }
  }
  return (
    <details class="report__group" data-testid="report-group" data-code="W_UNKNOWN_KEY" open>
      <summary>
        <span class="report__code">W_UNKNOWN_KEY</span>
        <span class="report__count">
          {rows.length} {noun('W_UNKNOWN_KEY', rows.length)}
        </span>
      </summary>
      <ul class="report__keys">
        {[...byKey.entries()].map(([key, bucket]) => (
          <UnknownKey
            key={key}
            name={key}
            rows={bucket}
            onSelectApplication={onSelectApplication}
          />
        ))}
      </ul>
    </details>
  );
}

function UnknownKey({
  name,
  rows,
  onSelectApplication,
}: {
  name: string;
  rows: readonly Finding[];
  onSelectApplication: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const ids = rows.map((row) => row.id).filter((id): id is string => id !== undefined);
  const shown = showAll ? ids : ids.slice(0, UNKNOWN_KEY_IDS);
  const where =
    ids.length === rows.length && ids.every(isApplicationId) ? 'Applications' : 'record';
  const label =
    where === 'Applications'
      ? rows.length === 1
        ? 'Application'
        : 'Applications'
      : rows.length === 1
        ? 'record'
        : 'records';
  return (
    <li class="report__key" data-testid="report-unknown-key" data-key={name}>
      <span class="report__key-name">
        <code>{name}</code> on {rows.length} {label}
      </span>
      <ul class="report__key-ids">
        {shown.map((id) => (
          <li key={id}>
            {isApplicationId(id) ? (
              <button
                type="button"
                class="report__link"
                data-testid="report-application"
                onClick={() => onSelectApplication(id)}
              >
                {id}
              </button>
            ) : (
              <code>{id}</code>
            )}
          </li>
        ))}
      </ul>
      {ids.length > UNKNOWN_KEY_IDS && !showAll ? (
        <button type="button" class="report__more" onClick={() => setShowAll(true)}>
          Show all {ids.length}
        </button>
      ) : null}
    </li>
  );
}
