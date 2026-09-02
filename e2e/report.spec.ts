import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The two surfaces docs/validation-surfacing.md decides, in a real browser: the "Catalog rejected"
 * dialog over the current screen (decisions 3 and 4) and the warnings side sheet the header badge
 * opens (decision 5). Grouping, folding and the Markdown are pinned by the Vitest tests in
 * src/view/Report.test.tsx; what is proved here is the wiring through the real load path.
 */

const MIXED = fileURLToPath(new URL('../samples/invalid/mixed.json', import.meta.url));
const W_DUPLICATE_ENTRY = fileURLToPath(
  new URL('../samples/invalid/W_DUPLICATE_ENTRY.json', import.meta.url),
);

test('an invalid Catalog is rejected with its codes and paths, and the sample stays loaded', async ({
  context,
  page,
}) => {
  // Decision 10's Copy is `navigator.clipboard`, which a page may only use with permission.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');

  await page.getByTestId('picker-input').setInputFiles(MIXED);

  const report = page.getByTestId('report');
  await expect(report).toHaveAttribute('data-mode', 'rejected');
  await expect(report.getByRole('heading', { level: 2 })).toHaveText('Catalog rejected');
  await expect(page.getByTestId('report-source')).toHaveText('mixed.json');
  // The five errors mixed.json carries, across four codes, plus its six warnings
  // (samples/README.md); decision 7 lists both so the producer sees the whole picture.
  await expect(page.getByTestId('report-summary')).toHaveText(
    '1 duplicate Application, 1 duplicate External, 2 unresolved refs, 1 self-dependency, ' +
      '2 unknown keys, 1 duplicate entry, 2 invalid formats, 1 one-sided Channel',
  );
  await expect(report.locator('[data-testid="report-group"]')).toHaveCount(8);
  await expect(
    report.locator('[data-testid="report-group"][data-code="E_UNRESOLVED_REF"]'),
  ).toContainText('applications[0].dependsOn[2]');
  await expect(
    report.locator('[data-testid="report-group"][data-code="E_SELF_DEPENDENCY"]'),
  ).toContainText('applications[1].dependsOn[0]');
  await expect(
    report.locator('[data-testid="report-group"][data-code="E_DUPLICATE_EXTERNAL"]'),
  ).toContainText('externals[1].id');

  // Decision 3: the current Catalog survives a failed load, dialog or no dialog.
  await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');
  await expect(page.getByTestId('ranked-row')).toHaveCount(53);

  await report.getByRole('button', { name: 'Copy report as Markdown' }).click();
  await expect(report.getByRole('button', { name: 'Copied' })).toBeVisible();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown.split('\n')[0]).toBe('# Catalog rejected: mixed.json');
  expect(markdown).toContain('## E_UNRESOLVED_REF (2)');
  expect(markdown).toContain('| Location | Path | Message | Value |');

  await report.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('report')).toHaveCount(0);
  await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');
});

test('the warnings badge opens the side sheet with the demo’s two one-sided Channels', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('warnings-badge')).toHaveText('2 warnings');
  await page.getByTestId('warnings-badge').click();

  const report = page.getByTestId('report');
  await expect(report).toHaveAttribute('data-mode', 'warnings');
  await expect(report.getByRole('heading', { level: 2 })).toHaveText('Warnings');
  await expect(page.getByTestId('report-summary')).toHaveText('2 one-sided Channels');
  const rows = report.locator('[data-testid="report-row"][data-code="W_EMPTY_CHANNEL"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('orders.shipped');
  await expect(rows.nth(1)).toContainText('fraud.alerts');

  // Decision 6: a row naming a Channel opens the Channel card, which arrives with the board slice;
  // here the click has to reach the action without throwing.
  await report.getByTestId('report-channel').first().click();
  await expect(report).toBeVisible();
});

test('a row naming an Application selects it as the Center (decision 6)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('picker-input').setInputFiles(W_DUPLICATE_ENTRY);

  await page.getByTestId('warnings-badge').click();
  const first = page.getByTestId('report-application').first();
  const id = await first.textContent();
  expect(id).not.toBeNull();
  await first.click();

  await expect(page.getByTestId('center-id')).toHaveText(id ?? '');
});

test('Choose another file closes the report and returns focus to the picker (decision 4)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('warnings-badge').click();
  await expect(page.getByTestId('report')).toBeVisible();

  await page.getByRole('button', { name: 'Choose another file' }).click();

  await expect(page.getByTestId('report')).toHaveCount(0);
  await expect(page.getByTestId('picker-input')).toBeFocused();
});
