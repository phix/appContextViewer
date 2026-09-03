import { expect, test } from '@playwright/test';

/**
 * The APM-naming case, end to end: docs/retrospective-2026-09-03.md, items N6 and N10.
 *
 * Every other fixture in this repo has ids that read as names, so every other spec would still pass
 * if the viewer rendered raw ids everywhere. This one loads samples/att/, where an Application is
 * `ATT-IDP5/shared-libraries/apm10133`, and asserts the thing that fixture exists to protect: a
 * reader can tell what the top of the Blast-radius ranking actually is.
 */

const ATT = '/?src=/samples/att/catalog.att.json';

test('the ranked table reads by name when the id is an APM number', async ({ page }) => {
  await page.goto(ATT);
  await expect(page.getByTestId('header-counts')).toHaveText('141 Applications, 32 Externals');

  // apm10133 is the Common Logging Library: 118 of 141 Applications break with it, which is only
  // useful to know if you can tell what it is.
  await expect(page.getByTestId('ranked-label').first()).toHaveText('Common Logging Library');

  // The id is never hidden — an operator still has to copy the identity somewhere — and it sits
  // inside the same button, so the control's accessible name carries both.
  await expect(page.getByTestId('ranked-id').first()).toHaveText(
    'ATT-IDP5/shared-libraries/apm10133',
  );
});

test('search finds an Application by name and selects it by id', async ({ page }) => {
  await page.goto(ATT);

  await page.getByTestId('search-input').fill('Fault Correlation');
  const result = page.getByTestId('search-result').first();
  await expect(result).toContainText('Fault Correlation Engine');

  await page.getByTestId('search-choose').first().click();
  await expect(page.getByTestId('center-id')).toHaveText(
    'ATT-IDP1/network-fault-management/apm10003',
  );
});

test('the impact board labels its rows by name too', async ({ page }) => {
  await page.goto(ATT);
  await page.getByTestId('search-input').fill('Fault Correlation');
  await page.getByTestId('search-choose').first().click();

  const board = page.getByTestId('impact-board');
  await expect(board).toBeVisible();
  // Its Dependencies include the Alarm Enrichment Service and the two shared libraries; none of
  // those would be legible as apm numbers.
  await expect(board).toContainText('Alarm Enrichment Service');
  await expect(board).not.toContainText('apm10002');
});
