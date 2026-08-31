import { expect, test } from "@playwright/test";
import { captureMethodologyCandidate } from "./methodologyCandidates";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
} from "./requestPolicy";

const themes = ["night", "day"] as const;

test.describe("@visual public methodology", () => {
  for (const theme of themes) {
    test(`${theme} methodology remains visually stable`, async ({ page }, testInfo) => {
      /*
       * Request enforcement. This replaced a handler that recorded four
       * provider patterns and then `route.continue()`d everything else, so
       * every host nobody had enumerated was permitted by default — including,
       * after F1 vendored the faces, a font host that must no longer appear.
       *
       * The methodology page is static and mocks nothing, so it declares no
       * fixture patterns: every request it makes must be same-origin to the
       * local Vite server. `assertRequestPolicy` still proves the enforcement
       * ran before it reports that nothing was refused.
       */
      const audit = await installRequestPolicy(page);

      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem("azalens-theme", selectedTheme);
      }, theme);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/methodology");
      await expect(page.getByRole("heading", { name: "Methodology & Limitations" })).toBeVisible();
      await expect(page.getByText(/precise edition or revision is not exposed or verified/i)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      assertRequestPolicy(audit, "methodology page");
      await page.evaluate(async () => document.fonts.ready);

      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      if (process.env.CI) {
        await captureMethodologyCandidate({
          page,
          target: page,
          name: `methodology-page-${theme}`,
          baseline: `methodology-page-${theme}`,
          projectName: testInfo.project.name,
          fullPage: true,
        });
      }
      await expect(page).toHaveScreenshot(`methodology-page-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
        threshold: 0.2,
      });

      // Re-asserted after the capture: a request made while the shutter was
      // open is still a request this job must never have made.
      reportRequestAudit(audit, "methodology page");
      assertRequestPolicy(audit, "methodology page (after capture)");
    });
  }
});
