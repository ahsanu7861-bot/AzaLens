import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 45_000,
  /*
   * Baselines are accepted deliberately, never as a side effect of a run.
   *
   * Playwright's default is "missing", which — verified in the installed 1.62
   * source, matchers/expect.js `handleMissing` — writes the baseline file and
   * only *then* reports the failure. On a developer machine that silently
   * deposits `-darwin.png` files that can never satisfy Linux CI; in CI it
   * makes "the run wrote a baseline" indistinguishable from "the run compared
   * against one".
   *
   * Under "none" the same missing baseline is a hard failure that writes
   * nothing, while the candidate is still emitted to the gitignored output
   * directory for review. Nothing else changes: the mismatch path never
   * consults this setting, and `npm run test:visual:update` still overrides it
   * from the command line for authorised local rebaselining.
   */
  updateSnapshots: process.env.CI ? "none" : "missing",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      threshold: 0.2,
    },
  },
  reporter: process.env.CI ? "github" : "list",
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "en-US",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
  },
});
