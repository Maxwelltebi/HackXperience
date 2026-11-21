// End-to-end tests (Q26). Run with `pnpm e2e` against the DEV Supabase project only.
// See README, "End-to-end tests", for the one-time setup.
import { defineConfig, devices } from '@playwright/test';
import { baseURL } from './e2e/env';

/** Without E2E_BASE_URL, the suite uses (or starts) `pnpm dev` on this machine. */
const local = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One journey through shared data: run it once, in order, without retries hiding flakiness.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // `next dev` compiles each page on first visit, which is slow on a small machine.
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/results',
  use: {
    baseURL,
    navigationTimeout: 120_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(local
    ? {
        webServer: {
          command: 'pnpm dev',
          url: `${baseURL}/api/v1/health`,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }
    : {}),
});
