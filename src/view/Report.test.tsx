import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '@/catalog';
import type { Report as ReportModel } from '@/state';
import { GROUP_FOLD, Report, reportMarkdown, UNKNOWN_KEY_IDS } from '@/view';

/**
 * The report component against fixed view models, as docs/architecture.md prescribes for the view
 * layer. Every assertion here traces to a decision in docs/validation-surfacing.md.
 *
 * CI runs on a slower box, so the cap test carries its own timeout scaled by BUDGET_FACTOR
 * (2 on CI) rather than leaning on Vitest's 5,000 ms default.
 */
const BUDGET_FACTOR = Number(process.env.BUDGET_FACTOR ?? 1);
/**
 * A ceiling for the 1,000-row cap render, not a row of docs/performance-budgets.md: it exists so
 * "without freezing" fails loudly if the fold ever stops working, and it is deliberately loose.
 */
const CAP_RENDER_CEILING_MS = 1_000 * BUDGET_FACTOR;
const CAP_TEST_TIMEOUT_MS = 20_000 * BUDGET_FACTOR;

function reportOf(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    mode: 'rejected',
    source: { kind: 'file', name: 'mixed.json' },
    errors: [],
    warnings: [],
    ...overrides,
  };
}

function noop() {
  /* the test does not care */
}

function renderReport(report: ReportModel, props: Partial<Parameters<typeof Report>[0]> = {}) {
  return render(
    <Report
      report={report}
      onClose={noop}
      onChooseAnother={noop}
      onSelectApplication={noop}
      onOpenChannel={noop}
      {...props}
    />,
  );
}

// The five errors and six warnings samples/invalid/mixed.json produces, verbatim from the loader.
const MIXED_ERRORS: Finding[] = [
  {
    code: 'E_DUPLICATE_APPLICATION',
    path: 'applications[2]',
    id: 'acme/platform-core/auth-service',
    message: 'another Application already has the id "acme/platform-core/auth-service"',
    value: 'acme/platform-core/auth-service',
  },
  {
    code: 'E_DUPLICATE_EXTERNAL',
    path: 'externals[1].id',
    id: 'redis',
    message: 'another External already has the id "redis"',
    value: 'redis',
  },
  {
    code: 'E_UNRESOLVED_REF',
    path: 'applications[0].dependsOn[2]',
    id: 'acme/platform-core/api-gateway',
    message: 'acme/platform-core/user-service names no Application in the Catalog',
    value: 'acme/platform-core/user-service',
  },
  {
    code: 'E_UNRESOLVED_REF',
    path: 'applications[0].dependsOn[3]',
    id: 'acme/platform-core/api-gateway',
    message: 'external:okta names no declared External',
    value: 'external:okta',
  },
  {
    code: 'E_SELF_DEPENDENCY',
    path: 'applications[1].dependsOn[0]',
    id: 'acme/platform-core/auth-service',
    message: 'acme/platform-core/auth-service lists itself in dependsOn',
    value: 'acme/platform-core/auth-service',
  },
];

const MIXED_WARNINGS: Finding[] = [
  {
    code: 'W_UNKNOWN_KEY',
    path: 'generator',
    message: 'unknown key "generator" on the Catalog',
    value: 'generator',
  },
  {
    code: 'W_EMPTY_CHANNEL',
    path: 'applications[0].publishes[0]',
    id: 'acme/platform-core/api-gateway',
    message: 'Channel "requests.logged" has 1 publisher and no subscriber',
    value: 'requests.logged',
  },
];

describe('Report', () => {
  it('names the source and summarizes by code (decision 4)', () => {
    renderReport(reportOf({ errors: MIXED_ERRORS, warnings: MIXED_WARNINGS }));

    expect(screen.getByTestId('report-source').textContent).toBe('mixed.json');
    expect(screen.getByTestId('report-summary').textContent).toBe(
      '1 duplicate Application, 1 duplicate External, 2 unresolved refs, 1 self-dependency, ' +
        '1 unknown key, 1 one-sided Channel',
    );
  });

  it('groups by code in the FINDING_CODES order, errors before warnings (decision 7)', () => {
    renderReport(reportOf({ errors: MIXED_ERRORS, warnings: MIXED_WARNINGS }));

    const codes = screen
      .getAllByTestId('report-group')
      .map((group) => group.getAttribute('data-code'));
    expect(codes).toEqual([
      'E_DUPLICATE_APPLICATION',
      'E_DUPLICATE_EXTERNAL',
      'E_UNRESOLVED_REF',
      'E_SELF_DEPENDENCY',
      'W_UNKNOWN_KEY',
      'W_EMPTY_CHANNEL',
    ]);
  });

  it('is the rejected dialog in one mode and the warnings sheet in the other (decisions 4, 5)', () => {
    const { rerender } = renderReport(reportOf({ errors: MIXED_ERRORS }));
    expect(screen.getByTestId('report').getAttribute('role')).toBe('dialog');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Catalog rejected');

    rerender(
      <Report
        report={reportOf({ mode: 'warnings', warnings: MIXED_WARNINGS })}
        onClose={noop}
        onChooseAnother={noop}
        onSelectApplication={noop}
        onOpenChannel={noop}
      />,
    );
    expect(screen.getByTestId('report').getAttribute('data-mode')).toBe('warnings');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Warnings');
  });

  it('shows 50 rows per group, then all of them on "Show all" (decision 7)', () => {
    const errors: Finding[] = Array.from({ length: 137 }, (_, index) => ({
      code: 'E_UNRESOLVED_REF',
      path: `applications[${index}].dependsOn[0]`,
      id: `acme/repo/app-${index}`,
      message: 'names no Application in the Catalog',
      value: `acme/repo/missing-${index}`,
    }));
    renderReport(reportOf({ errors }));

    expect(GROUP_FOLD).toBe(50); // docs/validation-surfacing.md decision 7 names the number
    expect(screen.getAllByTestId('report-row')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 137' }));
    expect(screen.getAllByTestId('report-row')).toHaveLength(137);
  });

  it('folds W_UNKNOWN_KEY by key name with the first five ids (decision 8)', () => {
    const warnings: Finding[] = Array.from({ length: 12 }, (_, index) => ({
      code: 'W_UNKNOWN_KEY',
      path: `applications[${index}].owner`,
      id: `acme/repo/app-${index}`,
      message: 'unknown key "owner"',
      value: 'owner',
    }));
    renderReport(reportOf({ mode: 'warnings', warnings }));

    const key = screen.getByTestId('report-unknown-key');
    expect(key.getAttribute('data-key')).toBe('owner');
    expect(key.querySelector('.report__key-name')?.textContent).toBe('owner on 12 Applications');
    expect(UNKNOWN_KEY_IDS).toBe(5); // decision 8 names the number
    expect(key.querySelectorAll('.report__key-ids li')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Show all 12' }));
    expect(key.querySelectorAll('.report__key-ids li')).toHaveLength(12);
  });

  it('selects the Application a row names, and opens the Channel a W_EMPTY_CHANNEL row names (decision 6)', () => {
    const onSelectApplication = vi.fn();
    const onOpenChannel = vi.fn();
    renderReport(reportOf({ errors: MIXED_ERRORS, warnings: MIXED_WARNINGS }), {
      onSelectApplication,
      onOpenChannel,
    });

    fireEvent.click(screen.getAllByTestId('report-application')[0]);
    expect(onSelectApplication).toHaveBeenCalledWith('acme/platform-core/auth-service');

    fireEvent.click(screen.getByTestId('report-channel'));
    expect(onOpenChannel).toHaveBeenCalledWith('requests.logged');
  });

  it('leaves a row that names an External unclickable (decision 6)', () => {
    renderReport(reportOf({ errors: MIXED_ERRORS }));
    const duplicateExternal = screen
      .getAllByTestId('report-row')
      .find((row) => row.getAttribute('data-code') === 'E_DUPLICATE_EXTERNAL');
    expect(duplicateExternal?.querySelector('[data-testid="report-application"]')).toBeNull();
    expect(duplicateExternal?.textContent).toContain('redis');
  });

  it('offers Choose another file, Copy report as Markdown and Close (decision 4)', () => {
    const onClose = vi.fn();
    const onChooseAnother = vi.fn();
    renderReport(reportOf({ errors: MIXED_ERRORS }), { onClose, onChooseAnother });

    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(onChooseAnother).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy report as Markdown' })).toBeTruthy();
  });

  it('copies a heading with the source and summary, then one table per code (decision 10)', async () => {
    const copy = vi.fn();
    const report = reportOf({ errors: MIXED_ERRORS, warnings: MIXED_WARNINGS });
    renderReport(report, { copy });

    fireEvent.click(screen.getByRole('button', { name: 'Copy report as Markdown' }));
    expect(copy).toHaveBeenCalledTimes(1);

    const markdown = copy.mock.calls[0][0] as string;
    expect(markdown).toBe(reportMarkdown(report));
    const lines = markdown.split('\n');
    expect(lines[0]).toBe('# Catalog rejected: mixed.json');
    expect(lines[2]).toBe(
      '1 duplicate Application, 1 duplicate External, 2 unresolved refs, 1 self-dependency, ' +
        '1 unknown key, 1 one-sided Channel',
    );
    expect(markdown).toContain('## E_UNRESOLVED_REF (2)');
    expect(markdown).toContain('| Location | Path | Message | Value |');
    expect(markdown).toContain(
      '| acme/platform-core/api-gateway | applications[0].dependsOn[3] | external:okta names no declared External | external:okta |',
    );
    // One table per code present, and no table for a code with no rows.
    expect(markdown.match(/^## /gm)).toHaveLength(6);
    expect(markdown).not.toContain('E_PARSE');

    await Promise.resolve();
  });

  it(
    'renders the 1,000-row cap without freezing (decision 7)',
    () => {
      // MAX_FINDINGS rows spread over four codes, the shape a badly broken Catalog produces.
      const codes = [
        'E_INVALID',
        'E_UNRESOLVED_REF',
        'E_SELF_DEPENDENCY',
        'E_DUPLICATE_APPLICATION',
      ] as const;
      const errors: Finding[] = Array.from({ length: 1_000 }, (_, index) => ({
        code: codes[index % codes.length],
        path: `applications[${index}].dependsOn[0]`,
        id: `acme/repo/app-${index}`,
        message: `row ${index}`,
        value: `value-${index}`,
      }));

      const started = performance.now();
      renderReport(reportOf({ errors }));
      const elapsed = performance.now() - started;

      // The fold is what keeps the DOM bounded: 50 rows per code, not 1,000 rows.
      expect(screen.getAllByTestId('report-row')).toHaveLength(GROUP_FOLD * codes.length);
      expect(screen.getByTestId('report-summary').textContent).toContain('250 schema violations');
      expect(elapsed).toBeLessThanOrEqual(CAP_RENDER_CEILING_MS);
    },
    CAP_TEST_TIMEOUT_MS,
  );
});
