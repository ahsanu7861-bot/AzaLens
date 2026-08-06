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
      const guidance = page.getByTestId("guidance-verdict");
      await expect(
        guidance.getByRole("heading", {
          name: "CONSTRUCTIVE — UPSIDE EVIDENCE DOMINATES",
        }),
      ).toBeVisible();
      await expect(
        guidance.getByRole("heading", {
          name: "What the evidence means",
        }),
      ).toBeVisible();
      await expect(
        guidance.getByText("What supports this scenario"),
      ).toBeVisible();
      await expect(
        guidance.getByText("What challenges this scenario"),
      ).toBeVisible();
      await expect(
        guidance.getByText("What to observe next"),
      ).toBeVisible();
      await expect(
        guidance.getByText("Confirmation condition"),
      ).toBeVisible();
      await expect(
        guidance.getByText("Scope and freshness"),
      ).toBeVisible();
      await expect(
        guidance.getByText("Limitations", { exact: true }),
      ).toBeVisible();
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
