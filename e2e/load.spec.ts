import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { budget } from './budget.ts';

/**
 * The load path of docs/catalog-sources.md and docs/url-state.md, in a real browser: the picker,
 * `?src=` relative and cross-origin, the GitHub hint, the missing-Center deep link, and budget 2
 * from docs/performance-budgets.md.
 */

const DEMO = fileURLToPath(new URL('../samples/catalog.demo.json', import.meta.url));
const THOUSAND = fileURLToPath(new URL('../samples/catalog-1000.json', import.meta.url));

/** The measure `src/app/App.tsx` writes around the load path. */
const LOAD_MEASURE = 'acv:load-to-table';

/**
 * A second origin that serves one Catalog and sends NO `Access-Control-Allow-Origin`, which is what
 * docs/catalog-sources.md decision 2 calls "a host that refuses".
 *
 * Issue #24 expected this to be `createStaticServer({ cors: false })` from `e2e/server.mjs`, and it
 * cannot be: `tsconfig.json` sets neither `allowJs` nor `checkJs`, so importing that `.mjs` from a
 * `.ts` spec is `error TS7016` and `npm run check` goes red. Reproduce with:
 *
 *     printf "import { createStaticServer } from './server.mjs';\nexport const s = createStaticServer();\n" > e2e/probe.ts \
 *       && npx tsc --noEmit; rm e2e/probe.ts
 *
 * The one-line fix belongs to whoever owns `tsconfig.json` (add `"allowJs": true`) or `e2e/`
 * (add an `e2e/server.d.ts`); this slice owns neither, so it serves the bytes itself. Nothing here
 * exercises `server.mjs`; e2e/smoke.spec.ts already does.
 */
function noCorsServer(file: string): Server {
  const body = readFileSync(file);
  return createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-store',
    });
    response.end(body);
  });
}

async function measuredMs(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate((name) => {
    const entries = performance.getEntriesByName(name);
    return entries.length === 0 ? Number.NaN : entries[entries.length - 1].duration;
  }, LOAD_MEASURE);
}

test('the picker loads the demo Catalog: its rows, its counts and its warnings badge', async ({
  page,
}) => {
  await page.goto('/');
  // The bundled sample is the demo Catalog, so load the 1,000-Application fixture first to prove
  // the picker really replaced it rather than leaving what the bundle shipped.
  await page.getByTestId('picker-input').setInputFiles(THOUSAND);
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');

  await page.getByTestId('picker-input').setInputFiles(DEMO);

  await expect(page.getByTestId('header-source')).toContainText('catalog.demo.json');
  await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');
  // 34 Applications and 19 Externals are ranked together (docs/center.md, decision 4); all 53 fit
  // inside the first 100-row page.
  await expect(page.getByTestId('ranked-row')).toHaveCount(53);
  await expect(page.locator('[data-testid="ranked-row"][data-kind="application"]')).toHaveCount(34);
  await expect(page.getByTestId('warnings-badge')).toHaveText('2 warnings');

  // The Applications-only filter leaves exactly the 34 Applications (docs/center.md, decision 4).
  await page.getByTestId('applications-only').check();
  await expect(page.getByTestId('ranked-row')).toHaveCount(34);
});

test('a row selects the Center and writes it to the hash (docs/url-state.md)', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('[data-testid="ranked-row"][data-kind="application"]')
    .first()
    .getByTestId('ranked-link')
    .click();

  await expect(page.getByTestId('center-panel')).toBeVisible();
  const id = await page.getByTestId('center-id').textContent();
  expect(id).not.toBeNull();
  await expect.poll(() => new URL(page.url()).hash).toBe(`#app=${id}`);
});

test('?src= with a relative path loads the Catalog beside the viewer', async ({ page }) => {
  await page.goto('/?src=/samples/catalog-1000.json');

  await expect(page.getByTestId('header-source')).toContainText('catalog-1000.json');
  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');
  // Budget 2's construction: the first 100 rows paint, the rest arrive on scroll.
  await expect(page.getByTestId('ranked-row')).toHaveCount(100);
  await expect(page.getByTestId('report')).toHaveCount(0);
});

test('a cross-origin ?src= without CORS is rejected with E_FETCH naming CORS', async ({ page }) => {
  const server = noCorsServer(DEMO);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await page.goto(`/?src=http://127.0.0.1:${port}/samples/catalog.demo.json`);

    const report = page.getByTestId('report');
    await expect(report).toHaveAttribute('data-mode', 'rejected');
    await expect(report).toContainText('E_FETCH');
    await expect(report).toContainText('CORS');
    await expect(report).toContainText('Access-Control-Allow-Origin');
    // Decision 3: the sample Catalog is still loaded behind the dialog.
    await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a github.com ?src= that fails adds the GitHub hint (docs/catalog-sources.md, decision 4)', async ({
  page,
}) => {
  await page.route('https://github.com/**', (route) => route.abort());

  await page.goto('/?src=https://github.com/acme/private/raw/main/catalog.json');

  const report = page.getByTestId('report');
  await expect(report).toHaveAttribute('data-mode', 'rejected');
  await expect(report).toContainText('E_FETCH');
  await expect(report).toContainText(
    'Private files on GitHub cannot be loaded by the viewer. Download the file and open it, or publish it beside the viewer.',
  );
});

test('a deep link to a missing Center shows the notice and strips the key (rule 5)', async ({
  page,
}) => {
  await page.goto('/#app=acme/none/nothing');

  const notice = page.getByTestId('notice');
  await expect(notice).toContainText('acme/none/nothing is not in this Catalog.');
  // The sample is what is loaded, so rule 5's second sentence applies.
  await expect(notice).toContainText('Load your Catalog to open it.');
  // The default screen is the ranked table, and the hash is left clean.
  await expect(page.getByTestId('ranked-table')).toBeVisible();
  await expect(page.getByTestId('center-panel')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toBe('');

  await page.getByTestId('notice-dismiss').click();
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('budget 2: file chosen to ranked table painted on the 1,000-Application fixture', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('ranked-table')).toBeVisible();
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  await page.getByTestId('picker-input').setInputFiles(THOUSAND);

  await expect(page.getByTestId('header-counts')).toHaveText('1,000 Applications, 25 Externals');
  await expect(page.getByTestId('ranked-row')).toHaveCount(100);

  await expect.poll(async () => Number.isFinite(await measuredMs(page))).toBe(true);
  const elapsed = await measuredMs(page);
  expect(elapsed).toBeLessThanOrEqual(budget(500));
});
