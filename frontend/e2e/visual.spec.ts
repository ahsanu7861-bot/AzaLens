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

      const settle = async () => {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });
      };

      /*
       * Page-level coverage, captured at the configured viewport with `fullPage`.
       *
       * It must NOT be captured by growing the viewport to document.scrollHeight.
       * The app sizes itself with viewport-relative minimum heights
       * (AppShell.tsx:105,226 `min-h-[100dvh]`, AnalysisPage.tsx:157
       * `min-h-[calc(100dvh-68px)]`), so enlarging the viewport enlarges those
       * minimums, which grows the document, which would enlarge the viewport
       * again. On mobile the shell adds `pb-24` (96px, `lg:pb-0`), so each pass
       * through that loop added exactly 96px and never converged: run
       * 31334206777 produced 390x4419 on the first attempt and 390x4515 on the
       * retry, differing only in the trailing rows. `fullPage` never touches the
       * viewport, so 100dvh stays fixed and the height is content-determined.
       *
       * The chart canvas is masked: lightweight-charts rasterises to a canvas and
       * its output depends on GPU, driver and font hinting rather than on
       * anything this repository can regress. Its data is already deterministic
       * (the fixture mocks history), so the mask removes machine variance, not
       * meaningful coverage. Everything else is deterministic: Date.now is
       * stubbed to FIXTURE_NOW, the timezone is pinned to UTC in
       * playwright.config.ts, animations are disabled, reduced motion is on, and
       * fonts are awaited above.
       */
      await settle();

      // Regression guard: if anyone reintroduces a scrollHeight-driven resize
      // before this capture, the viewport will no longer match the configured
      // one and this fails loudly instead of producing a flaky baseline.
      expect(page.viewportSize()).toEqual(viewport);

      /*
       * Fixed application chrome is hidden for this capture only.
       * A full-page screenshot extends past the viewport, but `position: fixed`
       * elements stay pinned to the viewport box, so Playwright stitches them
       * *into* the page content: the desktop rail stopped after the first 720px
       * and the mobile bottom bar landed mid-page, covering the Evidence
       * Agreement card and its 74% figure. Both are out of flow, so hiding them
       * changes neither the page height nor the layout of the content this
       * snapshot exists to guard. The fixed top header is deliberately kept: it
       * renders at y=0, which is where the page already reserves space for it.
       *
       * This must be injected with addStyleTag. `toHaveScreenshot` has no
       * inline `style` option - only `stylePath` - so passing `style` here is
       * silently ignored, which is exactly how commit 81f8672 shipped a no-op.
       */
      const fixedChromeStyle = await page.addStyleTag({
        content: [
          ".app-shell > aside,",
          'nav[aria-label="Mobile navigation"] {',
          "  display: none !important;",
          "}",
        ].join("\n"),
      });

      /*
       * Both captures are soft so one screenshot mismatch does not hide the
       * second review candidate; any mismatch still fails the test.
       */
      try {
        await expect.soft(page).toHaveScreenshot(
          `analysis-overview-${theme}.png`,
          {
            fullPage: true,
            animations: "disabled",
            caret: "hide",
            mask: [chartCanvas],
            maxDiffPixelRatio: 0.005,
            threshold: 0.2,
          },
        );
      } finally {
        // Restore the chrome even if the assertion fails, so the guidance
        // capture below always runs against the unmodified page.
        await fixedChromeStyle.evaluate((node) => node.parentNode?.removeChild(node));
      }

      /*
       * The Technical workspace is the only mounted surface that can prove the
       * indicator readings behind the Evidence Agreement are present and agree
       * with the fixture's declared members. Keep this as an element capture:
       * application chrome is irrelevant to that contract, and a scoped image
       * remains stable if unrelated page sections grow.
       */
      await page.getByRole("tab", { name: "Technical" }).click();
      const technical = page.getByRole("tabpanel");
      await expect(technical.getByText("58", { exact: true })).toBeVisible();
      await expect(
        technical.getByText("No decisive pattern", { exact: true }),
      ).toBeVisible();
      await settle();
      await expect.soft(technical).toHaveScreenshot(
        `analysis-technical-${theme}.png`,
        {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.005,
          threshold: 0.2,
        },
      );

      await page.getByRole("tab", { name: "Overview" }).click();
      await expect(guidance).toBeVisible();

      /*
       * The scoped guidance capture keeps the viewport-growing approach added in
       * 580e6e6 and its already-approved baselines. The 100dvh feedback above
       * only changes trailing page height, which an element screenshot does not
       * include - the guidance actuals were byte-identical across attempt and
       * retry in runs 31278866725 and 31334206777.
       */
      for (let pass = 0; pass < 2; pass += 1) {
        const documentHeight = await page.evaluate(() =>
          Math.ceil(document.documentElement.scrollHeight),
        );
        await page.setViewportSize({
          width: viewport.width,
          height: Math.max(viewport.height, documentHeight),
        });
      }
      await settle();

      await expect.soft(guidance).toHaveScreenshot(
        `analysis-guidance-${theme}.png`,
        {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.005,
          threshold: 0.2,
        },
      );
    });
  }
});
