import { expect, test } from '@playwright/test';

const GUARD_MESSAGE = 'This viewer runs from its hosted URL';
const builtIndex = new URL('../dist/index.html', import.meta.url).href;

// Issue #14: the hosted build is the only target; opened from disk, the page shows one line and
// nothing else, rendered by the classic inline script in index.html, never by the module bundle.
test('dist/index.html opened through file:// shows only the guard message', async ({ page }) => {
  // Chromium's preload scanner may still request the bundle speculatively before the guard runs;
  // window.stop() aborts that fetch, so no request other than the document itself ever finishes.
  const finished: string[] = [];
  page.on('requestfinished', (request) => {
    if (request.url() !== builtIndex) {
      finished.push(request.url());
    }
  });

  // The guard stops the parser, so neither DOMContentLoaded nor load ever fires; wait for the
  // commit only and let the assertions poll.
  await page.goto(builtIndex, { waitUntil: 'commit' });

  await expect(page.locator('body')).toHaveText(GUARD_MESSAGE);
  await expect(page.locator('body p')).toHaveCount(1);
  // Nothing the bundle renders exists: no placeholder heading, no stamped mount.
  await expect(page.locator('h1')).toHaveCount(0);
  await expect(page.locator('[data-rendered-by]')).toHaveCount(0);
  // The parser stopped before the module script tag entered the document, so the bundle had no
  // element to execute from; the guard's own classic inline script is the only script there is.
  await expect(page.locator('script[type="module"]')).toHaveCount(0);
  await expect(page.locator('script')).toHaveCount(1);
  expect(await page.evaluate(() => document.readyState)).toBe('complete');
  expect(finished).toEqual([]);
});

test('the guard still shows only the message when a browser keeps parsing after window.stop()', async ({
  page,
}) => {
  // Chromium aborts the parser on window.stop(). A browser that did not would go on to parse the
  // <body> and the module tag (whose fetch fails from file://) and then fire DOMContentLoaded, so
  // the guard's repaint has to rebuild the document. Neutralising stop() walks that path for real.
  await page.addInitScript(() => {
    window.stop = () => {};
  });

  await page.goto(builtIndex);

  // The parser did keep going: the module tag entered the document this time.
  await expect(page.locator('script[type="module"]')).toHaveCount(1);
  // One body, holding the message and nothing else.
  await expect(page.locator('body')).toHaveCount(1);
  await expect(page.locator('body')).toHaveText(GUARD_MESSAGE);
  await expect(page.locator('body p')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(0);
  await expect(page.locator('[data-rendered-by]')).toHaveCount(0);
});
