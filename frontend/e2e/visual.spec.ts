import { expect, test } from "@playwright/test";

import {
  FIXTURE_NOW,
  mockHealthyAnalysis,
} from "./fixtures/analysis";

const themes = ["night", "day"] as const;

test.describe("@visual analysis workspace", () => {
  for (const theme of themes) {
    test(`${theme} theme remains visually stable`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ fixedNow, selectedTheme }) => {
          Date.now = () => fixedNow;
          window.localStorage.setItem(
            "azalens-theme",
            selectedTheme,
          );
        },
        {
          fixedNow: FIXTURE_NOW,
          selectedTheme: theme,
        },
      );
      await mockHealthyAnalysis(page);
      await page.emulateMedia({
        reducedMotion: "reduce",
      });
      await page.goto("/analysis/AAPL");

      await expect(
        page.getByRole("tab", { name: "Overview" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        theme,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      await expect(page).toHaveScreenshot(
        `analysis-overview-${theme}.png`,
        {
          animations: "disabled",
          caret: "hide",
          mask: [page.locator("canvas")],
          maxDiffPixelRatio: 0.005,
          threshold: 0.2,
        },
      );
    });
  }
});
