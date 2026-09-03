import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Browser suite per docs/architecture.md: headless Chromium against a static server that serves the
 * built site at / and the repository's fixtures at /samples/ (e2e/server.mjs). Timed budgets are
 * scaled through e2e/budget.ts; CI sets BUDGET_FACTOR=4 (docs/performance-budgets.md).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  // Files run serially in one worker on CI so the timed budgets are not skewed by contention.
  fullyParallel: false,
  // One worker everywhere, not just on CI. Half of this suite asserts a *duration*, and parallel
  // files contend for the same cores, so a timed budget measured beside three other specs is
  // measuring the machine's load rather than the code. That contention is what made budgets 3, 4
  // and 6 fail intermittently in whole-suite runs while passing file by file — the most misleading
  // shape a test can have, because "it passes when I run it alone" reads as flake rather than as
  // the harness telling the truth about a loaded box. The suite runs in well under a minute
  // serially, which is a cheap price for a timing assertion that means something.
  workers: 1,
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
