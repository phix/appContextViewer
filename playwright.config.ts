import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Browser suite per docs/architecture.md: headless Chromium against a static server that serves the
 * built site at / and the repository's fixtures at /samples/ (e2e/server.mjs). Timed budgets are
 * scaled through e2e/budget.ts; CI sets BUDGET_FACTOR=2 (docs/performance-budgets.md).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  // Files run serially in one worker on CI so the timed budgets are not skewed by contention.
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && node e2e/server.mjs --port ${port}`,
    url: `${baseURL}/`,
    // Never reuse: a server left running would serve a stale dist/ and hide a broken build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
