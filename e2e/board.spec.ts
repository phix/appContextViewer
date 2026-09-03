import { expect, type Page, test } from '@playwright/test';
import { budget } from './budget.ts';

/**
 * The impact board, search and the Channel card in a real browser (docs/center.md), plus budgets 5,
 * 6 and 7 from docs/performance-budgets.md. The bands, the Markdown and the keyboard handling are
 * pinned by the Vitest tests in `src/view/*.test.tsx`; what is proved here is the wiring through the
 * real store and URL, and the three timings, which only a browser can measure.
 *
 * The measures come from `src/view/ImpactBoard.tsx` and `src/view/Search.tsx`; `e2e/budget.ts`
 * scales every ceiling by BUDGET_FACTOR, which CI sets to 2. Each assertion below fails with a small
 * factor (`BUDGET_FACTOR=0.00001 npx playwright test e2e/board.spec.ts`), which is what says it is
 * measuring something rather than passing vacuously.
 */

const PRODUCT_SERVICE = 'ATT-IDP4/commerce/product-service';
const ORDER_SERVICE = 'ATT-IDP4/commerce/order-service';
const THOUSAND = '/?src=/samples/catalog-1000.json';

/** Budget 5: a selection to the board painted. */
const SELECT_MEASURE = 'acv:select-to-board';
/** Budget 6: a header Depth change to the board repainted. */
const DEPTH_MEASURE = 'acv:depth-to-board';
/** Budget 7: one keystroke to its results. */
const SEARCH_MEASURE = 'acv:search-to-results';

function rankedLink(page: Page, id: string) {
  return page.getByTestId('ranked-link').filter({ hasText: id }).first();
}

function band(page: Page, column: 'Needs' | 'Breaks') {
  return page.locator(`[data-testid="board-band"][data-column="${column}"]`);
}

function rows(page: Page, column: 'Needs' | 'Breaks') {
  return page.locator(`[data-testid="board-row"][data-column="${column}"]`);
}

async function clearTimings(page: Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });
}

/** The longest measure of that name, or NaN when none was written. */
async function longestMs(page: Page, name: string): Promise<number> {
  return page.evaluate((measure) => {
    const entries = performance.getEntriesByName(measure);
    return entries.length === 0 ? Number.NaN : Math.max(...entries.map((entry) => entry.duration));
  }, name);
}

test('an Application Center bands what breaks by Depth (docs/center.md)', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, PRODUCT_SERVICE).click();

  await expect(page.getByTestId('center-id')).toHaveText(PRODUCT_SERVICE);
  await expect(page.getByTestId('center-kind')).toHaveText('Application · service');

  // Depth 3 reaches the whole Blast radius of product-service in the demo Catalog.
  await page.getByTestId('depth-select').selectOption('3');

  await expect(band(page, 'Breaks')).toHaveCount(3);
  await expect(rows(page, 'Breaks')).toHaveCount(12);
  await expect(page.getByTestId('center-badge')).toHaveText('12 break across 7 Teams');
  // Depth 1, 2 and 3 in order, with the Catalog's own order inside a band.
  await expect(band(page, 'Breaks').first()).toHaveAttribute('data-depth', '1');
  await expect(band(page, 'Breaks').nth(2)).toHaveAttribute('data-depth', '3');
  // Its own Dependencies are the other column, and a row there carries its chips.
  await expect(rows(page, 'Needs').first().locator('[data-testid="board-chip"]')).not.toHaveCount(
    0,
  );
});

test('an External Center shows its card and the Needs note (decision 5)', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, 'redis').click();

  await expect(page.getByTestId('center-id')).toHaveText('redis');
  await expect(page.getByTestId('center-kind')).toHaveText('External · cache');
  await expect(page.getByTestId('center-name')).toHaveText('Redis (shared cluster)');
  await expect(page.getByTestId('board-note')).toHaveText(
    'An External has no Dependencies in the Catalog',
  );
  // The column keeps its place, so the three columns are still in order.
  await expect(page.getByTestId('board-needs')).toBeVisible();
  await expect(band(page, 'Needs')).toHaveCount(0);
  await expect(band(page, 'Breaks')).toHaveCount(2);
  await expect(rows(page, 'Breaks')).toHaveCount(20);
  // An External has no Flows on its card.
  await expect(page.getByTestId('center-flows')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe('#external=redis');
});

/**
 * CHANGED BY THE TAGS SLICE (#43), deliberately and as the only assertion it moved.
 *
 * This used to assert that clicking a CHIP selects its row's node (docs/center.md, decision 3). A
 * chip is now a Tag (docs/tags.md): pointing at it Highlights its Group and clicking it sets the
 * grouping Attribute, which the spec says must NOT change the Center. One gesture cannot both
 * change the Center and leave it alone, so the two specs collide here and the newer one wins.
 *
 * Decision 3's PURPOSE — that a node in the Needs column, an External included, is selectable from
 * its row — is unchanged and is what the second half asserts. Only its mechanism moved: from "the
 * chip too" to "the row's own control", which is also what made a Tag possible at all, because a
 * `<button>` cannot nest inside a `<button>`.
 */
test('a Needs row selects its node, and its Tag groups instead (decision 3, docs/tags.md)', async ({
  page,
}) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);

  const row = rows(page, 'Needs').first();
  const link = row.locator('[data-testid="board-link"]');
  const id = await link.getAttribute('data-id');
  expect(id).not.toBeNull();
  expect(id).not.toBe(ORDER_SERVICE);

  // The Tag does not select: the Center is still what it was.
  await row.locator('[data-testid="board-chip"]').first().click();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);

  // The row's own control does, which is how the Needs column stays navigable.
  await link.click();
  await expect(page.getByTestId('center-id')).toHaveText(id ?? '');
});

test('search opens the Channel card, which selects nothing (decision 8)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('search-input').fill('orders.');

  const result = page.locator('[data-testid="search-result"][data-id="orders.placed"]');
  await expect(result.getByTestId('search-chip')).toHaveText('Channel');
  await result.getByTestId('search-choose').click();

  const card = page.getByTestId('channel-card');
  await expect(card.getByTestId('channel-name')).toHaveText('orders.placed');
  await expect(card.getByTestId('channel-publishers').getByTestId('channel-row')).toHaveCount(1);
  await expect(card.getByTestId('channel-subscribers').getByTestId('channel-row')).toHaveCount(4);
  // No selection, no URL (decision 8): the ranked table is still the screen behind it.
  await expect(page.getByTestId('center-panel')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');

  // A publisher row selects, which closes the card.
  await card.getByTestId('channel-link').first().click();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);
  await expect(page.getByTestId('channel-card')).toHaveCount(0);
});

test('the Channel card is dismissible', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('search-input').fill('orders.placed');
  await page.getByTestId('search-choose').first().click();

  await expect(page.getByTestId('channel-card')).toBeVisible();
  await page.getByTestId('channel-dismiss').click();
  await expect(page.getByTestId('channel-card')).toHaveCount(0);
});

test('search selects an Application, and Back returns to the previous Center', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('search-input').fill(ORDER_SERVICE);
  await page
    .locator(`[data-testid="search-result"][data-id="${ORDER_SERVICE}"]`)
    .getByTestId('search-choose')
    .click();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);

  await rankedLink(page, PRODUCT_SERVICE).click();
  await expect(page.getByTestId('center-id')).toHaveText(PRODUCT_SERVICE);

  // docs/url-state.md rule 4: a change of Center pushes, so Back is the previous one.
  await page.goBack();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);
  await expect(rows(page, 'Breaks')).toHaveCount(6);
});

test('budget 5: a selection to the impact board painted, on the 1,000-Application fixture', async ({
  page,
}) => {
  await page.goto(THOUSAND);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');
  await clearTimings(page);

  await page.getByTestId('ranked-link').first().click();
  await expect(page.getByTestId('impact-board')).toBeVisible();

  await expect.poll(() => longestMs(page, SELECT_MEASURE)).toBeLessThanOrEqual(budget(100));
});

test('budget 6: a Depth change to the impact board repainted, on the 1,000-Application fixture', async ({
  page,
}) => {
  await page.goto(THOUSAND);
  await page.getByTestId('ranked-link').first().click();
  await expect(page.getByTestId('impact-board')).toBeVisible();
  await clearTimings(page);

  await page.getByTestId('depth-select').selectOption('3');
  await expect.poll(() => longestMs(page, DEPTH_MEASURE)).toBeLessThanOrEqual(budget(100));
});

test('budget 7: one keystroke to results, on the 1,000-Application fixture', async ({ page }) => {
  await page.goto(THOUSAND);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');
  await clearTimings(page);

  // Seven keystrokes, each one a query over 1,000 ids and every scalar Attribute.
  await page.getByTestId('search-input').pressSequentially('service', { delay: 60 });
  await expect(page.getByTestId('search-results')).toBeVisible();

  const keystrokes = await page.evaluate(
    (name) => performance.getEntriesByName(name).length,
    SEARCH_MEASURE,
  );
  expect(keystrokes).toBe(7);
  expect(await longestMs(page, SEARCH_MEASURE)).toBeLessThanOrEqual(budget(50));
});
