import { expect, type Page, test } from '@playwright/test';
import { budget } from './budget.ts';

/**
 * Tags in a real browser (docs/tags.md). The unit tests pin membership, the accessible names and the
 * one-DOM-write property; what only a browser can show is the three surfaces Highlighting together,
 * that CSS actually de-emphasises the rest, `prefers-reduced-motion`, and budget 8's timing.
 *
 * Every timed assertion goes through `e2e/budget.ts`, which CI scales by BUDGET_FACTOR=4. Budget 8
 * fails with a small factor (`BUDGET_FACTOR=0.00001 npx playwright test e2e/tags.spec.ts`), which is
 * what says it is measuring something rather than passing vacuously.
 */

const ORDER_SERVICE = 'acme/commerce/order-service';
const THOUSAND = '/?src=/samples/catalog-1000.json';

/** Budget 8: pointing at a Tag to the Highlight painted. */
const HIGHLIGHT_MEASURE = 'acv:highlight-to-paint';

function rankedLink(page: Page, id: string) {
  return page.getByTestId('ranked-link').filter({ hasText: id }).first();
}

/** The injected stylesheet's text: empty when nothing is Highlighted. */
function injectedRule(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('acv-highlight')?.textContent ?? '');
}

/** How many elements the injected rule actually selects, by asking the browser to match it. */
function highlightedCount(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const rule = document.getElementById('acv-highlight')?.textContent ?? '';
    const token = /\[data-groups~="([^"]+)"\]/.exec(rule)?.[1];
    if (token === undefined) {
      return 0;
    }
    return document.querySelectorAll(`[data-testid="${id}"][data-groups~="${token}"]`).length;
  }, testId);
}

async function longestMs(page: Page, name: string): Promise<number> {
  return page.evaluate((measure) => {
    const entries = performance.getEntriesByName(measure);
    return entries.length === 0 ? Number.NaN : Math.max(...entries.map((entry) => entry.duration));
  }, name);
}

test('pointing at a Tag Highlights its Group on all three surfaces at once', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  await expect(page.getByTestId('impact-board')).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // A Team Tag on the Center card: `commerce` spans several Applications, so the Highlight has
  // somewhere to land on every surface.
  const teamTag = page.getByTestId('center-tags').locator('[data-tag="team"]').first();
  await teamTag.hover();

  await expect.poll(() => injectedRule(page)).toContain('data-groups~=');
  // Each surface separately, and each with a non-zero count: a Highlight that reached nothing would
  // satisfy "the rule was injected" and prove nothing at all.
  await expect.poll(() => highlightedCount(page, 'ranked-row')).toBeGreaterThan(0);
  await expect.poll(() => highlightedCount(page, 'board-row')).toBeGreaterThan(0);
  // The canvas is not reachable by CSS, so it reports how many of its own nodes it styled. This
  // must assert a POSITIVE COUNT, not the absence of a value: `not.toHaveAttribute` also passes
  // when the attribute was never written at all, which let a mutant that unsubscribed the canvas
  // entirely survive this test until the assertion was tightened.
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-tagged', /^[1-9][0-9]*$/);

  // Non-members are de-emphasised, not removed: the row count and the counts line are untouched.
  const rowsWhileHighlighted = await page.getByTestId('ranked-row').count();
  await expect(page.getByTestId('ranked-counts')).toContainText('34 Applications');
  expect(rowsWhileHighlighted).toBeGreaterThan(await highlightedCount(page, 'ranked-row'));

  // And a non-member is still ON SCREEN, not merely still in the DOM. A Highlight that hid the rest
  // would leave every count above intact, so visibility is the assertion that separates
  // de-emphasis from a filter (CONTEXT.md, **Highlight**).
  const nonMember = page
    .locator('[data-testid="ranked-row"]:not([data-groups~="team=commerce"])')
    .first();
  await expect(nonMember).toBeVisible();
  const dimmed = await nonMember.evaluate((node) => Number(getComputedStyle(node).opacity));
  expect(dimmed).toBeGreaterThan(0);
  expect(dimmed).toBeLessThan(1);
});

test('a Highlight changes neither the Center nor the URL', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);

  // The hash is non-empty BEFORE the Highlight, so "unchanged" is a claim about a real URL rather
  // than about a page whose URL was never going to change.
  const hashBefore = new URL(page.url()).hash;
  expect(hashBefore).not.toBe('');

  await page.getByTestId('center-tags').locator('[data-tag="team"]').first().hover();
  await expect.poll(() => injectedRule(page)).toContain('data-groups~=');

  expect(new URL(page.url()).hash).toBe(hashBefore);
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);
});

test('leaving clears the Highlight, and so does Escape', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  const tag = page.getByTestId('center-tags').locator('[data-tag="team"]').first();

  await tag.hover();
  await expect.poll(() => injectedRule(page)).not.toBe('');
  await page.getByTestId('center-id').hover();
  await expect.poll(() => injectedRule(page)).toBe('');

  // Escape, from a Tag held by keyboard focus rather than by the pointer.
  await tag.focus();
  await expect.poll(() => injectedRule(page)).not.toBe('');
  await page.keyboard.press('Escape');
  await expect.poll(() => injectedRule(page)).toBe('');
});

test('a Tag is keyboard operable, and choosing one sets the grouping Attribute', async ({
  page,
}) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  const tag = page.getByTestId('center-tags').locator('[data-tag="team"]').first();

  // The accessible name says what the control does, not just the value it shows.
  await expect(tag).toHaveAttribute('aria-label', /Highlight this Group/);
  await expect(tag).toHaveAttribute('aria-label', /group the Catalog by team/);
  // Repository is the grouping the viewer opens with, so this Tag is not pressed yet.
  await expect(tag).toHaveAttribute('aria-pressed', 'false');

  // Focus Highlights, then Enter chooses — both without a pointer.
  await tag.focus();
  await expect.poll(() => injectedRule(page)).not.toBe('');
  await page.keyboard.press('Enter');

  await expect(
    page.getByTestId('center-tags').locator('[data-tag="team"]').first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByTestId('center-tags').locator('[data-tag="repository"]').first(),
  ).toHaveAttribute('aria-pressed', 'false');
  // Choosing does not change the Center either.
  await expect(page.getByTestId('center-id')).toHaveText(ORDER_SERVICE);
});

test('a Tag whose Attribute has too many values Highlights but cannot group', async ({ page }) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();

  // order-service carries `oncall` and `sla`, both of which the demo Catalog gives 3 or fewer
  // carriers and as many values — the disqualifying shape item N7 is about, pinned with its real
  // numbers by src/graph/grouping.test.ts.
  const disqualified = page.getByTestId('center-tags').locator('[data-groupable="false"]').first();
  await expect(disqualified).toHaveAttribute('aria-disabled', 'true');
  // Playwright reads `aria-disabled` the way assistive technology does, so this assertion is the
  // accessibility claim: the control announces that its action is unavailable.
  await expect(disqualified).toBeDisabled();

  // It still Highlights, which is the half of its job that survives (docs/tags.md, item N7).
  await disqualified.hover();
  await expect.poll(() => injectedRule(page)).not.toBe('');
  await expect.poll(() => highlightedCount(page, 'ranked-row')).toBeGreaterThan(0);

  const attribute = await disqualified.getAttribute('data-tag');
  // `force` because the assertion above just established Playwright will not click an
  // aria-disabled control on its own. A real pointer is not stopped by `aria-disabled` — only by
  // the real `disabled` attribute, which this control deliberately does not carry — so forcing the
  // click is what reproduces what a user can actually do, and the point is that it achieves nothing.
  await disqualified.click({ force: true });
  // The grouping did not move to it: the Repository Tag is still the pressed one.
  await expect(
    page.getByTestId('center-tags').locator('[data-tag="repository"]').first(),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(attribute).not.toBe('repository');
});

test('prefers-reduced-motion disables the lift but not the Highlight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  const tag = page.getByTestId('center-tags').locator('[data-tag="team"]').first();

  await tag.hover();
  // The lift is gone...
  await expect(tag).toHaveCSS('transform', 'none');
  await expect(tag).toHaveCSS('box-shadow', 'none');
  // ...and the Highlight is not.
  await expect.poll(() => injectedRule(page)).toContain('data-groups~=');
  await expect.poll(() => highlightedCount(page, 'ranked-row')).toBeGreaterThan(0);
});

test('the lift is there without reduced motion, so the test above is not vacuous', async ({
  page,
}) => {
  await page.goto('/');
  await rankedLink(page, ORDER_SERVICE).click();
  const tag = page.getByTestId('center-tags').locator('[data-tag="team"]').first();

  await tag.hover();
  await expect(tag).not.toHaveCSS('transform', 'none');
  await expect(tag).not.toHaveCSS('box-shadow', 'none');
});

/**
 * The first stylesheet's other job. With no CSS the ranked table rendered an Application's name and
 * its id as one run-on string — `Common Logging LibraryATT-IDP5/shared-libraries/apm10133` on the
 * deployed site. The id stays inside the button (the accessible name and several text queries
 * depend on it), so only CSS can separate them, and only a browser can prove it did.
 */
test('a ranked row reads its name and its id as two things, not one run-on string', async ({
  page,
}) => {
  await page.goto('/?src=/samples/att/catalog.att.json');
  await expect(page.getByTestId('header-counts')).toHaveText('141 Applications, 32 Externals');

  const label = page.getByTestId('ranked-label').first();
  const id = page.getByTestId('ranked-id').first();
  await expect(label).toHaveText('Common Logging Library');

  const labelBox = await label.boundingBox();
  const idBox = await id.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(idBox).not.toBeNull();
  // The id sits on its own line beneath the name. Side by side — which is what no stylesheet and
  // what a bare `margin-left` both give — makes this fail.
  expect(idBox?.y ?? 0).toBeGreaterThanOrEqual((labelBox?.y ?? 0) + (labelBox?.height ?? 0));

  // And it reads as secondary: smaller, and a different colour from the name.
  const sizeOf = (text: string) =>
    Number.parseFloat(text.endsWith('px') ? text.slice(0, -2) : text);
  const labelSize = sizeOf(await label.evaluate((node) => getComputedStyle(node).fontSize));
  const idSize = sizeOf(await id.evaluate((node) => getComputedStyle(node).fontSize));
  expect(idSize).toBeLessThan(labelSize);
  expect(await id.evaluate((node) => getComputedStyle(node).color)).not.toBe(
    await label.evaluate((node) => getComputedStyle(node).color),
  );
});

test('budget 8: a Highlight crossing 1,000 ranked rows, painted in 50 ms', async ({ page }) => {
  await page.goto(THOUSAND);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');

  // Page every row into the DOM first. The budget is about a Highlight crossing 1,000 rows, so the
  // 1,000 rows have to be there — the table paints 100 at a time (docs/performance-budgets.md).
  const more = page.getByTestId('ranked-more');
  while (await more.isVisible()) {
    await more.click();
  }
  const rows = await page.getByTestId('ranked-row').count();
  expect(rows).toBe(1000 + 25);

  // An Application, so the card carries a Repository Tag; the top-ranked node is an External.
  await page
    .locator('[data-testid="ranked-row"][data-kind="application"]')
    .first()
    .getByTestId('ranked-link')
    .click();
  await expect(page.getByTestId('impact-board')).toBeVisible();
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  const tag = page.getByTestId('center-tags').locator('[data-tag="repository"]').first();
  await tag.hover();

  await expect.poll(() => highlightedCount(page, 'ranked-row')).toBeGreaterThan(0);
  await expect.poll(() => longestMs(page, HIGHLIGHT_MEASURE)).toBeLessThanOrEqual(budget(50));
});
