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
   * Under "none" the three paths are:
   *
   *   - baseline present, pixels within tolerance -> pass, nothing written;
   *   - baseline present, pixels outside tolerance -> fail, with the actual and
   *     diff images written to the gitignored `test-results/` output directory
   *     only; the accepted `*-snapshots/` PNG is never touched;
   *   - baseline missing -> hard failure. `toHaveScreenshot` returns before it
   *     even captures a screenshot (expect.js: the `updateSnapshots === "none"
   *     && !hasSnapshot` early return precedes `_expectScreenshot`), so this
   *     path produces no image of any kind.
   *
   * Review candidates are therefore *not* a Playwright by-product. They come
   * from the separate explicit helpers — `npm run visual:candidates` and the
   * methodology/technical candidate specs — which call `page.screenshot()` into
   * gitignored `*-candidate-artifacts/` directories and never call
   * `toHaveScreenshot`.
   *
   * This value is unconditional because `process.env.CI` was never the risk:
   * the installed resolver is
   * `takeFirst(configCLIOverrides.updateSnapshots, userConfig.updateSnapshots,
   * "missing")`, so a bare `-u` on the command line outranks whatever is
   * written here, under CI or not. `globalSetup` below closes that hole by
   * inspecting the *resolved* mode before any worker starts; accepting a
   * baseline requires AZALENS_ACCEPT_BASELINES=1 on Linux.
   */
  updateSnapshots: "none",
  globalSetup: "./e2e/globalSetup.ts",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      threshold: 0.2,
    },
  },
  reporter: [
    [process.env.CI ? "github" : "list"],
    ["./e2e/visualComparisonReporter.ts"],
  ],
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
    env: {
      VITE_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_fixture",
    },
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
