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
          name: "CONSTRUCTIVE — UPSIDE EVIDENCE ESTABLISHED",
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
        guidance.getByText("Confirmation condition", { exact: true }),
      ).toBeVisible();
      await expect(
        guidance.getByText("Scope and freshness"),
      ).toBeVisible();
      await expect(
        guidance.getByText("What you can reasonably do next"),
      ).toBeVisible();
      await expect(
        guidance.getByText("Risk and limitations"),
      ).toBeVisible();
      await expect(
        guidance.getByText("Limitations", { exact: true }),
      ).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      /*
       * StockChart is lazy-loaded behind a Suspense spinner, so its canvas mounts
       * independently of the guidance content asserted above. Wait for it before
       * measuring the document: if the chart mounts after the viewport is sized,
       * the page grows underneath the capture and both screenshots race a
       * mid-layout state.
       */
      const chartCanvas = page.locator("canvas");
      await expect(chartCanvas.first()).toBeVisible();

      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error("Visual test requires a configured viewport");
      }
      for (let pass = 0; pass < 2; pass += 1) {
        const documentHeight = await page.evaluate(() =>
          Math.ceil(document.documentElement.scrollHeight),
        );
        await page.setViewportSize({
          width: viewport.width,
          height: Math.max(viewport.height, documentHeight),
        });
      }
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });

      await expect(guidance).toHaveScreenshot(
        `analysis-guidance-${theme}.png`,
        {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.005,
          threshold: 0.2,
        },
      );

      /*
       * Page-level coverage, restored after d7fb37d narrowed this spec to the
       * guidance element alone. The scoped shot above proves the verdict surface
       * is correct; this one proves nothing else on the analysis page regressed
       * while it was being fixed.
       *
       * The viewport was grown to the document height above, so a viewport
       * screenshot is already a whole-page screenshot. Reusing that mechanism
       * rather than `fullPage` keeps both captures under one stabilisation path,
       * and keeps the app's fixed header, sidebar and mobile bottom bar rendered
       * against the same expanded viewport in both.
       *
       * The chart canvas is masked: lightweight-charts rasterises to a canvas,
       * and its output depends on GPU, driver and font hinting rather than on
       * anything this PR can regress. Its data is already deterministic (the
       * fixture mocks history), so the mask removes machine variance, not
       * meaningful coverage. Everything else on the page is deterministic:
       * Date.now is stubbed to FIXTURE_NOW, the timezone is pinned to UTC in
       * playwright.config.ts, animations are disabled, reduced motion is on, and
       * fonts are awaited above.
       */
      await expect(page).toHaveScreenshot(
        `analysis-overview-${theme}.png`,
        {
          animations: "disabled",
          caret: "hide",
          mask: [chartCanvas],
          maxDiffPixelRatio: 0.005,
          threshold: 0.2,
        },
      );
    });
  }
});
