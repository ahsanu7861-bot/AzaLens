import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { layeredContrast, parseCssColor } from "./contrast";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
  type RequestAudit,
} from "./requestPolicy";

const TOKEN = "fixtureheader.fixturepayload.fixturesignature";
const AUTH_FIXTURE = /\/auth\/demo\/status(?:\?|$)/;
const ENTRY = "Open personal risk controls";
const SAVE = "Save preferences";
const BADGE = "Owner authenticated";

/**
 * `/settings` previously had no accessibility coverage at all: axe ran only in analysis.spec.ts and
 * personal-risk.spec.ts. This spec measures the page itself instead of inferring a result from a class
 * pattern observed on another route.
 *
 * Deliberate scope. It gates the primary entry control that this change repairs, and it records — without
 * asserting — every other violation axe reports on the page. Two residual problems are real, measured and
 * outside a single-file repair, so they are logged for separate scoped work rather than hidden behind a
 * weakened assertion or "fixed" with a new token or carve-out:
 *
 *   1. In the night theme the brand surface `--az-brand: #06b6d4` cannot carry any light label at 4.5:1;
 *      pure white on it is 2.428:1. The existing primary "Save preferences" Button fails identically, so
 *      this is a shared design-token gap, not a defect of this control.
 *   2. Other pre-existing nodes on the page (a `text-positive` badge, `text-ink-muted` labels inside a
 *      selected choice, and a duplicate-landmark `aside` from the app shell) also violate.
 *
 * Measurement method. `measure()` reads the control's resolved text colour and the background colour of
 * every element from the control up to the root, and `layeredContrast` (./contrast.ts) composites them in
 * paint order down to the first opaque layer. This replaced a `parseRgb` that read only the first three
 * numbers of a colour string and a walk that stopped at the nearest non-transparent background, which
 * miscomputed any translucent surface: Chromium reports `bg-positive/10` as `oklab(L a b / 0.1)`, so the
 * badge below read as near-black with alpha dropped. The opaque `bg-brand` Buttons were unaffected and still
 * measure 2.428:1 in night. `measure()` refuses, rather than estimates, a chain containing a background
 * image, group opacity, a filter or a blend mode, and it does not see pseudo-element backgrounds.
 */
async function owner(page: Page): Promise<RequestAudit> {
  const audit = await installRequestPolicy(page, { fixtures: [AUTH_FIXTURE] });
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

/**
 * Reads an element's resolved text colour and the background colours of it and every ancestor (innermost
 * first), then composites them. Effects the compositing does not model make it throw instead of guessing.
 */
async function measure(target: Locator) {
  const shape = await target.evaluate((element) => {
    const layers: { background: string; image: string; opacity: string; filter: string; blend: string }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      layers.push({
        background: style.backgroundColor,
        image: style.backgroundImage,
        opacity: style.opacity,
        filter: style.filter,
        blend: style.mixBlendMode,
      });
    }
    return {
      tag: element.tagName,
      type: element.getAttribute("type"),
      hasBgBrand: element.classList.contains("bg-brand"),
      nestedInteractive: element.querySelectorAll("a,button,input,select,textarea,[tabindex]").length,
      insideAnchor: Boolean(element.closest("a")),
      color: getComputedStyle(element).color,
      layers,
    };
  });
  const { layers, ...rest } = shape;
  const base = layers.findIndex((layer) => parseCssColor(layer.background).alpha >= 1);
  const unmodelled = layers.filter(
    (layer, index) =>
      layer.opacity !== "1" ||
      layer.filter !== "none" ||
      layer.blend !== "normal" ||
      (index <= base && layer.image !== "none"),
  );
  if (base < 0 || unmodelled.length) {
    throw new Error(`Cannot composite ${JSON.stringify(layers)}`);
  }
  const backgrounds = layers.slice(0, base + 1).map((layer) => layer.background);
  const painted = backgrounds.filter((layer) => parseCssColor(layer).alpha > 0);
  const { background, ratio } = layeredContrast(shape.color, backgrounds);
  return {
    ...rest,
    layers: painted,
    background: `rgb(${background.map((channel) => Number(channel.toFixed(3))).join(", ")})`,
    ratio,
  };
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
    const badgeIsFlagged = results.violations.some(
      (violation) => violation.id === "color-contrast" && violation.nodes.some((node) => node.html.includes(BADGE)),
    );
    console.log(
      `SETTINGS_AXE[${theme}] total=${results.violations.length} ids=${JSON.stringify(
        results.violations.map((violation) => violation.id),
      )} entryFlagged=${entryIsFlagged} badgeFlagged=${badgeIsFlagged}`,
    );
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        console.log(`SETTINGS_RESIDUAL[${theme}][${violation.id}]=${JSON.stringify({ html: node.html })}`);
      }
    }

    expect(badgeIsFlagged).toBe(badgeRatio < 4.5);

    if (theme === "day") {
      // The repaired control clears AA on the day brand surface, and axe no longer flags it.
      expect(entryRatio).toBeGreaterThanOrEqual(4.5);
      expect(entryIsFlagged).toBe(false);
    } else {
      // Night's brand token cannot carry a light label at AA. Assert only that the entry is treated exactly
      // like the page's existing primary Button, so no control is uniquely worse; the shared token gap is
      // recorded above and tracked separately rather than papered over here.
      expect(Number(entryRatio.toFixed(3))).toBe(Number(saveRatio.toFixed(3)));
      expect(entryRatio).toBeLessThan(4.5);
    }

    reportRequestAudit(audit, `settings accessibility ${theme}`);
    assertRequestPolicy(audit, `settings accessibility ${theme}`);
  });
}

test("settings entry activates by keyboard and navigates to personal risk controls", async ({ page }) => {
  const audit = await owner(page);
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
