import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { measure } from "./measureContrast";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
  type RequestAudit,
} from "./requestPolicy";

const TOKEN = "fixtureheader.fixturepayload.fixturesignature";
const AUTH_FIXTURE = /\/auth\/demo\/status(?:\?|$)/;
const STATUS_FIXTURE = /\/api\/personal-risk\/bootstrap-status(?:\?|$)/;
const ENTRY = "Open personal risk controls";
const SAVE = "Save preferences";
const BADGE = "Owner authenticated";

/**
 * `/settings` previously had no accessibility coverage at all: axe ran only in analysis.spec.ts and
 * personal-risk.spec.ts. This spec measures the page itself instead of inferring a result from a class
 * pattern observed on another route.
 *
 * Deliberate scope. It gates the page's two primary Buttons and records — without asserting — every other
 * violation axe reports on the page, so none is hidden behind a weakened assertion:
 *
 *   1. Resolved. In the night theme the brand surface `--az-brand: #06b6d4` cannot carry a light label at
 *      4.5:1; white on it was 2.428:1 on both primary Buttons, a shared design-token gap. Primary Buttons
 *      now take their label from `--az-primary-button-label`: `#0a0e1a` in night (7.931:1 on the unchanged
 *      cyan) and `#ffffff` in day, so the day figure is unchanged at 5.358:1.
 *   2. Still open. Other pre-existing nodes on the page (a `text-positive` badge, `text-ink-muted` labels
 *      inside a selected choice, and a duplicate-landmark `aside` from the app shell) also violate, so
 *      `/settings` is not accessibility-clean.
 *
 * Measurement method. `measure()` (./measureContrast.ts) reads the control's resolved text colour and the
 * background colour of every element from the control up to the root, and `layeredContrast` (./contrast.ts)
 * composites them in paint order down to the first opaque layer. This replaced a `parseRgb` that read only
 * the first three numbers of a colour string and a walk that stopped at the nearest non-transparent
 * background, which miscomputed any translucent surface: Chromium reports `bg-positive/10` as
 * `oklab(L a b / 0.1)`, so the badge below read as near-black with alpha dropped. The opaque `bg-brand`
 * Buttons were unaffected by that change: they sit on one opaque layer. `measure()` refuses, rather than
 * estimates, a chain containing a background image, group opacity, a filter or a blend mode, and it does not
 * see pseudo-element backgrounds.
 */
async function owner(page: Page, fixtures: RegExp[] = []): Promise<RequestAudit> {
  const audit = await installRequestPolicy(page, { fixtures: [AUTH_FIXTURE, ...fixtures] });
  await page.addInitScript(({ token }) => {
    window.localStorage.setItem(
      "sb-aaaaaaaaaaaaaaaaaaaa-auth-token",
      JSON.stringify({
        access_token: token,
        refresh_token: "synthetic-fixture",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated" },
      }),
    );
  }, { token: TOKEN });
  await page.route("**/auth/demo/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, enabled: true, authorized: true }),
    }),
  );
  return audit;
}

for (const theme of ["day", "night"] as const) {
  test(`settings primary entry control is measured and recorded in the ${theme} theme`, async ({ page }) => {
    const audit = await owner(page);
    await page.addInitScript((value) => {
      window.localStorage.setItem("azalens-theme", value);
    }, theme);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    const entry = page.getByRole("button", { name: ENTRY });
    await expect(entry).toBeVisible();

    const resolved = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(resolved).toBe(theme);

    // The entry follows the page's existing primary-control convention and nests nothing interactive.
    const { ratio: entryRatio, ...entryShape } = await measure(entry);
    console.log(
      `SETTINGS_ENTRY[${theme}]=` + JSON.stringify({ ...entryShape, ratio: Number(entryRatio.toFixed(3)) }),
    );
    expect(entryShape.tag).toBe("BUTTON");
    expect(entryShape.type).toBe("button");
    expect(entryShape.hasBgBrand).toBe(true);
    expect(entryShape.nestedInteractive).toBe(0);
    expect(entryShape.insideAnchor).toBe(false);

    // The page's pre-existing primary Button, measured for comparison on the same surface.
    const { ratio: saveRatio, ...saveShape } = await measure(page.getByRole("button", { name: SAVE }));
    console.log(
      `SETTINGS_EXISTING_PRIMARY[${theme}]=` + JSON.stringify({ ...saveShape, ratio: Number(saveRatio.toFixed(3)) }),
    );
    // Both brand Buttons sit on one opaque layer, so compositing cannot change their historical figures.
    expect(entryShape.layers).toHaveLength(1);
    expect(saveShape.layers).toHaveLength(1);

    // A translucent surface: the badge's `bg-positive/10` over a translucent card over the opaque canvas.
    // Recorded rather than gated; the only assertion is that this measurement and axe reach the same verdict.
    const { ratio: badgeRatio, ...badgeShape } = await measure(page.getByText(BADGE, { exact: true }));
    console.log(
      `SETTINGS_TRANSLUCENT_BADGE[${theme}]=` +
        JSON.stringify({ color: badgeShape.color, layers: badgeShape.layers, background: badgeShape.background, ratio: Number(badgeRatio.toFixed(3)) }),
    );
    expect(badgeShape.layers.length).toBeGreaterThan(1);

    const results = await new AxeBuilder({ page }).analyze();
    const entryIsFlagged = results.violations.some((violation) =>
      violation.nodes.some((node) => node.html.includes(ENTRY)),
    );
    const contrastFlags = (label: string) =>
      results.violations.some(
        (violation) => violation.id === "color-contrast" && violation.nodes.some((node) => node.html.includes(label)),
      );
    const badgeIsFlagged = contrastFlags(BADGE);
    const saveContrastFlagged = contrastFlags(SAVE);
    console.log(
      `SETTINGS_AXE[${theme}] total=${results.violations.length} ids=${JSON.stringify(
        results.violations.map((violation) => violation.id),
      )} entryFlagged=${entryIsFlagged} badgeFlagged=${badgeIsFlagged} saveContrastFlagged=${saveContrastFlagged}`,
    );
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        console.log(`SETTINGS_RESIDUAL[${theme}][${violation.id}]=${JSON.stringify({ html: node.html })}`);
      }
    }

    expect(badgeIsFlagged).toBe(badgeRatio < 4.5);

    // Both primary Buttons resolve to the theme's exact token pair, and axe flags neither for contrast.
    // Day is pinned to its unchanged figures; night proves the dark `--az-primary-button-label` on the
    // unchanged cyan, replacing the earlier assertion that recorded white at 2.428:1 as a known failure.
    const expected =
      theme === "day"
        ? { color: "rgb(255, 255, 255)", background: "rgb(14, 116, 144)", ratio: 5.358 }
        : { color: "rgb(10, 14, 26)", background: "rgb(6, 182, 212)", ratio: 7.931 };
    for (const [shape, ratio] of [
      [entryShape, entryRatio],
      [saveShape, saveRatio],
    ] as const) {
      expect(shape.color).toBe(expected.color);
      expect(shape.background).toBe(expected.background);
      expect(Number(ratio.toFixed(3))).toBe(expected.ratio);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    expect(entryIsFlagged).toBe(false);
    expect(saveContrastFlagged).toBe(false);

    reportRequestAudit(audit, `settings accessibility ${theme}`);
    assertRequestPolicy(audit, `settings accessibility ${theme}`);
  });
}

test("settings entry activates by keyboard and navigates to personal risk controls", async ({ page }) => {
  // Navigating to /settings/personal-risk issues its bootstrap read. It was previously unmocked, so whether the
  // request policy saw it before the final assertion depended on timing; it is now declared and fulfilled.
  const audit = await owner(page, [STATUS_FIXTURE]);
  await page.route("**/api/personal-risk/bootstrap-status**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          observation: { instant: "2026-09-21T15:00:37Z", newYorkDate: "2026-09-21", newYorkWeek: "2026-09-21" },
          policyVersion: null,
          costSchedule: null,
          equitySnapshot: null,
          dailyBasis: null,
          weeklyBasis: null,
          bootstrapComplete: false,
          pendingIntent: null,
        },
      }),
    }),
  );
  await page.goto("/settings");
  const entry = page.getByRole("button", { name: ENTRY });
  await expect(entry).toBeVisible();

  await entry.focus();
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/personal-risk$/);
  console.log(`SETTINGS_ENTRY_ENTER=ok ${page.url()}`);

  await page.goBack();
  const again = page.getByRole("button", { name: ENTRY });
  await again.focus();
  await page.keyboard.press(" ");
  await expect(page).toHaveURL(/\/settings\/personal-risk$/);
  console.log(`SETTINGS_ENTRY_SPACE=ok ${page.url()}`);

  reportRequestAudit(audit, "settings entry keyboard");
  assertRequestPolicy(audit, "settings entry keyboard");
});
