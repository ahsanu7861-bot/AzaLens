import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const themes = ["night", "day"] as const;

/*
 * Read from the landing contract rather than retyped here, so a capture can
 * never assert a verdict the backend parity test has not pinned. Loaded with
 * `fs` rather than a JSON import: Playwright's ESM loader would require an
 * import attribute, and this keeps the spec free of that coupling.
 */
const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../src/data/landingDemo.contract.json", import.meta.url)),
    "utf8",
  ),
) as { confirmed: { presentation: { publicLabel: string; horizonToken: string } } };

const PUBLIC_LABEL = contract.confirmed.presentation.publicLabel;
const HORIZON_LABEL = "Swing · 2–10 sessions";

/*
 * Landing-page visual coverage (roadmap item 1.11).
 *
 * Every committed baseline before this file covered /analysis/AAPL, so visual CI
 * was structurally incapable of observing Navbar, Hero, MarketSnapshot,
 * ProductPreview or ComplianceDemo. The landing truthfulness work in items
 * 2.15-2.17 changes all of those, which is why this coverage is a prerequisite
 * for verifying that work rather than a follow-up to it.
 *
 * Six captures, and six is the minimum:
 *
 *   4 full-page   {desktop, mobile} x {day, night}. Page level has exactly two
 *                 independent axes. The nav is `hidden md:flex`, so the removed
 *                 anchors are observable only at desktop; ComplianceDemo's grid
 *                 collapses to one column only at mobile; and the eyebrow pills
 *                 are token-coloured, so day and night differ.
 *
 *   2 scoped      the confirmed verdict card, at desktop and mobile.
 *                 `maxDiffPixelRatio: 0.005` is a fraction of *total* pixels: a
 *                 desktop full-page landing capture is ~6.6M px, giving a
 *                 ~33,000 px tolerance. Reverting the horizon badge to "Bullish"
 *                 is a ~2-3k px change and would pass a full-page comparison
 *                 silently. Scoping collapses the denominator to the card. Both
 *                 viewports are captured because the 43-character public label
 *                 wraps differently inside a 390px single-column card, which is
 *                 where truncation would first appear.
 *
 * Baselines for these are Linux-only and are accepted in a separate, explicitly
 * authorised step. A run that finds them missing must fail without writing them;
 * playwright.config.ts sets `updateSnapshots: "none"` under CI to guarantee that.
 */

/*
 * Everything a capture must be true of before the shutter opens. If any of this
 * fails the run stops with a readable assertion instead of banking a screenshot
 * of a blank page, a demo-gate shell or the wrong route.
 */
async function assertLandingIsCapturable(page: Page, theme: string) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("main#main-content")).toBeVisible();

  // Hero.
  await expect(
    page.getByRole("heading", { level: 1, name: /Listed Stocks\./ }),
  ).toBeVisible();
  await expect(
    page.getByText("EXPLAINABLE STOCK ANALYSIS", { exact: true }),
  ).toBeVisible();

  // ProductPreview / ComplianceDemo region.
  await expect(page.locator("#product")).toBeVisible();
  await expect(
    page.getByText("HOW THE VERDICT IS REACHED", { exact: true }),
  ).toBeVisible();

  const confirmed = page.getByTestId("landing-demo-confirmed");
  await expect(confirmed).toBeVisible();
  await expect(page.getByTestId("landing-demo-withheld")).toBeVisible();

  // The canonical verdict and horizon, in the exact slots the captures guard.
  const verdict = confirmed.getByRole("heading", {
    name: PUBLIC_LABEL.toUpperCase(),
  });
  await expect(verdict).toBeVisible();
  await expect(confirmed.getByText(HORIZON_LABEL, { exact: true })).toBeVisible();

  /*
   * The canonical label must wrap only between words.
   *
   * Asserted by measurement, not by class name: each word is measured with a
   * Range, and a word split across lines yields more than one client rect. That
   * is what caught CONSTRU/CTIVE and ESTABLIS/HED, and a class assertion alone
   * would not have.
   */
  const fragmented = await verdict.evaluate((heading) => {
    const node = heading.firstChild;
    if (!node) return ["<no text node>"];
    const text = heading.textContent ?? "";
    const broken: string[] = [];
    let index = 0;
    for (const token of text.split(/(\s+)/)) {
      if (token.trim()) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + token.length);
        if (range.getClientRects().length > 1) broken.push(token);
      }
      index += token.length;
    }
    return broken;
  });
  expect(
    fragmented,
    "the canonical verdict must wrap only at word boundaries",
  ).toEqual([]);

  // The headline must also stay inside the card it is rendered in.
  const headlineOverflows = await confirmed.evaluate((card) => {
    const heading = card.querySelector("h2");
    if (!heading) return true;
    const a = heading.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    return a.right > b.right + 1 || a.left < b.left - 1;
  });
  expect(headlineOverflows, "the verdict headline must not overflow its card").toBe(
    false,
  );

  // The internal agreement direction must reach neither slot. Scoped to the
  // verdict row: "Bullish" in the Evidence Agreement strip is a family vote,
  // which is evidence, not a published verdict.
  const verdictRow = confirmed.locator("h2").first().locator("..");
  await expect(verdictRow).not.toContainText(/bullish/i);

  // No dead anchors survive in the mounted DOM.
  for (const dead of ["#features", "#pricing", "#about"]) {
    await expect(page.locator(`a[href="${dead}"]`)).toHaveCount(0);
  }
  await expect(page.locator('a[href="#product"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /start free/i })).toHaveCount(0);

  // No model-driven claim anywhere in what the visitor actually receives.
  await expect(page.locator("body")).not.toContainText(/\bAI\b/);
  await expect(page.locator("body")).not.toContainText(/AI[-\s]powered/i);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows, "the landing page must not scroll horizontally").toBe(false);
}

test.describe("@visual landing page", () => {
  for (const theme of themes) {
    test(`${theme} theme remains visually stable`, async ({ page }) => {
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem("azalens-theme", selectedTheme);
      }, theme);

      /*
       * The landing page calls no analysis API, and this asserts that rather
       * than assuming it. Fonts are the one intended third party: index.html
       * loads the Google Fonts stylesheet, and the existing analysis baselines
       * were captured with it, so blocking it here would render the captures in
       * fallback type and stop them representing production.
       *
       * Everything else off-site is aborted and recorded, and any request that
       * looks like an analysis endpoint or a market-data provider fails the run
       * outright — a visual job must never be able to spend provider budget or
       * capture provider-backed data.
       */
      const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];
      const PROVIDER_PATTERNS = [
        /\/api\//i,
        /finnhub/i,
        /twelvedata/i,
        /alphavantage/i,
        /yahoo/i,
        /yfinance/i,
      ];

      const blockedRequests: string[] = [];
      const providerRequests: string[] = [];

      await page.route("**/*", async (route) => {
        const url = route.request().url();

        if (PROVIDER_PATTERNS.some((pattern) => pattern.test(url))) {
          providerRequests.push(url);
          await route.abort();
          return;
        }

        const allowed =
          url.startsWith("http://127.0.0.1:") ||
          url.startsWith("http://localhost:") ||
          url.startsWith("data:") ||
          url.startsWith("blob:") ||
          FONT_HOSTS.some((host) => url.startsWith(host));

        if (!allowed) {
          blockedRequests.push(url);
          await route.abort();
          return;
        }

        await route.continue();
      });

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");

      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error("Visual test requires a configured viewport");
      }

      await assertLandingIsCapturable(page, theme);

      expect(
        providerRequests,
        "a visual job must never call an analysis or market-data endpoint",
      ).toEqual([]);
      expect(
        blockedRequests,
        "the landing page must not reach an unexpected third party",
      ).toEqual([]);

      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      await page.evaluate(() => {
        window.scrollTo(0, 0);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });

      // Regression guard: `fullPage` must never be replaced by a
      // scrollHeight-driven viewport resize, which on this app feeds back
      // through `min-h-[100dvh]` and never converges.
      expect(page.viewportSize()).toEqual(viewport);

      /*
       * Both captures are soft so one mismatch does not hide the second review
       * candidate; any mismatch still fails the test.
       */
      await expect.soft(page).toHaveScreenshot(`landing-page-${theme}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
        threshold: 0.2,
      });

      /*
       * The scoped verdict capture is taken at the default theme only. Its
       * failure modes — a reverted label, a reverted badge, a truncated wrap —
       * are theme-independent, while the tone it would otherwise also guard is a
       * large-area change the full-page captures already catch.
       */
      if (theme === "night") {
        const verdictCard = page.getByTestId("landing-demo-confirmed");
        await expect(verdictCard).toBeVisible();

        /*
         * Hide the sticky header for this capture only.
         *
         * Same mechanism as the analysis spec (addStyleTag, removed in a
         * `finally` so it cannot leak into a later capture), with one deliberate
         * difference: that spec hides `position: fixed` chrome with
         * `display: none`, which is safe because fixed elements are out of flow.
         * The landing header is `position: sticky`, which *is* in flow, so
         * `display: none` would reflow the page. `visibility: hidden` removes it
         * from paint while preserving every layout dimension, which is what an
         * element screenshot needs.
         *
         * Without this the header stays pinned to the viewport while Playwright
         * stitches a card taller than the viewport, and composites itself into
         * the middle of the image as a dark band across the card.
         *
         * `.az-skip-link` is hidden for the same reason. It is `position: fixed`
         * at top-left, parked off-screen by a transform until focused — but a
         * fixed element sits at the same viewport position in every stitch
         * slice, so at mobile, where the card spans nearly the full width, it
         * printed into the middle of the card. Desktop never showed it because
         * the card starts to the right of x=10px.
         */
        const stickyChromeStyle = await page.addStyleTag({
          content: [
            "header.sticky,",
            ".az-skip-link {",
            "  visibility: hidden !important;",
            "}",
          ].join("\n"),
        });

        try {
          await expect
            .soft(verdictCard)
            .toHaveScreenshot("landing-verdict.png", {
              animations: "disabled",
              caret: "hide",
              maxDiffPixelRatio: 0.005,
              threshold: 0.2,
            });
        } finally {
          await stickyChromeStyle.evaluate((node) =>
            node.parentNode?.removeChild(node),
          );
        }
      }
    });
  }
});
