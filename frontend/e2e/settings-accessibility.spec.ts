import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
 * Measurement limits. `parseRgb` reads only the first three channels and therefore ignores any alpha, and
 * `measure()` walks up to the nearest background that is not fully transparent, skipping only
 * `rgba(0, 0, 0, 0)` and `transparent`. The contrast it computes is valid for the opaque `bg-brand` Buttons
 * measured here, whose backgrounds are fully opaque. Extending either helper to a partially transparent
 * surface — `bg-positive/10` on the "Owner authenticated" badge, for example — would require compositing
 * that alpha over the surfaces beneath it first; without that step the resulting ratio would be wrong, so
 * axe remains the authority for those nodes and they are recorded, not measured, above.
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

/** WCAG relative luminance and contrast, from colours the browser itself resolved. */
function contrastRatio(foreground: number[], background: number[]): number {
  const luminance = (channels: number[]) => {
    const [r, g, b] = channels.map((value) => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): number[] {
  const parts = value.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) throw new Error(`Unparsable colour: ${value}`);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** Reads a control's own resolved colour and its nearest painted background. */
async function measure(page: Page, accessibleName: string) {
  return page.getByRole("button", { name: accessibleName }).evaluate((element) => {
    const style = getComputedStyle(element);
    let node: HTMLElement | null = element as HTMLElement;
    let background = "";
    while (node) {
      const candidate = getComputedStyle(node).backgroundColor;
      if (candidate && candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") {
        background = candidate;
        break;
      }
      node = node.parentElement;
    }
    return {
      tag: element.tagName,
      type: element.getAttribute("type"),
      hasBgBrand: element.classList.contains("bg-brand"),
      nestedInteractive: element.querySelectorAll("a,button,input,select,textarea,[tabindex]").length,
      insideAnchor: Boolean(element.closest("a")),
      color: style.color,
      background,
    };
  });
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
    const entryShape = await measure(page, ENTRY);
    const entryRatio = contrastRatio(parseRgb(entryShape.color), parseRgb(entryShape.background));
    console.log(
      `SETTINGS_ENTRY[${theme}]=` + JSON.stringify({ ...entryShape, ratio: Number(entryRatio.toFixed(3)) }),
    );
    expect(entryShape.tag).toBe("BUTTON");
    expect(entryShape.type).toBe("button");
    expect(entryShape.hasBgBrand).toBe(true);
    expect(entryShape.nestedInteractive).toBe(0);
    expect(entryShape.insideAnchor).toBe(false);

    // The page's pre-existing primary Button, measured for comparison on the same surface.
    const saveShape = await measure(page, SAVE);
    const saveRatio = contrastRatio(parseRgb(saveShape.color), parseRgb(saveShape.background));
    console.log(
      `SETTINGS_EXISTING_PRIMARY[${theme}]=` + JSON.stringify({ ...saveShape, ratio: Number(saveRatio.toFixed(3)) }),
    );

    const results = await new AxeBuilder({ page }).analyze();
    const entryIsFlagged = results.violations.some((violation) =>
      violation.nodes.some((node) => node.html.includes(ENTRY)),
    );
    console.log(
      `SETTINGS_AXE[${theme}] total=${results.violations.length} ids=${JSON.stringify(
        results.violations.map((violation) => violation.id),
      )} entryFlagged=${entryIsFlagged}`,
    );
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        console.log(`SETTINGS_RESIDUAL[${theme}][${violation.id}]=${JSON.stringify({ html: node.html })}`);
      }
    }

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
