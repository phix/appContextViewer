import { expect, test } from '@playwright/test';

test('/ renders the app shell from the module bundle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('App Context Viewer');
  // The bundle stamps the mount it rendered into (src/app/main.tsx).
  await expect(page.locator('#app')).toHaveAttribute('data-rendered-by', 'bundle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('App Context Viewer');
  // The shell's four surfaces from issue #24: header, picker, ranked table, and no report at rest.
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.getByTestId('picker-input')).toBeAttached();
  await expect(page.getByTestId('ranked-table')).toBeVisible();
  await expect(page.getByTestId('report')).toHaveCount(0);
  // 34 Applications is the demo Catalog's row count (samples/README.md), so the number proves the
  // sample is bundled, not fetched.
  await expect(page.getByTestId('header-counts')).toHaveText('34 Applications, 19 Externals');
  // main.tsx sets this once `?src=` (absent here) has settled and `bindUrl` is wired.
  await expect(page.locator('#app')).toHaveAttribute('data-bootstrapped', 'true');
  expect(errors).toEqual([]);
});

test('the static server serves the repository fixtures at /samples/', async ({ request }) => {
  const response = await request.get('/samples/catalog.demo.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const catalog = await response.json();
  expect(catalog.schemaVersion).toBe(1);
  expect(catalog.applications).toHaveLength(34);
});

test('the built site ships THIRD-PARTY-NOTICES.md', async ({ request }) => {
  const response = await request.get('/THIRD-PARTY-NOTICES.md');
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('Eclipse Public License');
});

test('the entry chunk keeps its legal banner pointing at the notices', async ({
  page,
  request,
}) => {
  // ADR 0001, obligation 2, as configured in vite.config.ts: legal comments survive minification.
  await page.goto('/');
  const src = await page.locator('script[type="module"]').getAttribute('src');
  expect(src).toMatch(/^\.\/assets\/.+\.js$/);
  const chunk = await (await request.get(src?.replace(/^\./, '') ?? '')).text();
  expect(chunk).toContain('/*! App Context Viewer');
  expect(chunk).toContain('THIRD-PARTY-NOTICES.md');
});
