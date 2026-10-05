import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { compositeOver, contrastRatio, flattenBackground, parseCssColor } from "./contrast";
import { measure } from "./measureContrast";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
  type RequestAudit,
} from "./requestPolicy";

/**
 * `ClosedDemoGate` renders two raw `bg-brand` submit buttons rather than the shared `Button`, so they take
 * `text-primary-button-label` directly: `#0a0e1a` in night on the cyan `--az-brand` `#06b6d4`, and `#ffffff`
 * in day on `--az-brand` `#0e7490`. White on the night cyan was 2.428:1.
 *
 * Every application call is a declared local fixture and no owner session is seeded, so the gate stays
 * closed; the request policy fails the run on anything else, including Supabase. These are local mocked
 * fixture measurements, not authenticated production measurements.
 */
const STATUS_FIXTURE = /\/auth\/demo\/status(?:\?|$)/;
const UNLOCK_FIXTURE = /\/auth\/demo\/unlock(?:\?|$)/;
const ACCESS_CODE = "fixture-access-code";

const LABEL = {
  day: { color: "rgb(255, 255, 255)", background: "rgb(14, 116, 144)", ratio: 5.358 },
  night: { color: "rgb(10, 14, 26)", background: "rgb(6, 182, 212)", ratio: 7.931 },
} as const;

/** `:focus-visible { outline: 2px solid var(--az-ring); outline-offset: 3px; }` with each theme's ring. */
const RING = {
  day: "rgba(8, 145, 178, 0.7)",
  night: "rgba(6, 182, 212, 0.55)",
} as const;

type Theme = keyof typeof LABEL;
const themes: Theme[] = ["day", "night"];

const SCREENS = {
  locked: { authorized: false, button: "Enter workspace", previous: "#demo-access-code" },
  "sign-in": { authorized: true, button: "Owner sign in", previous: "#owner-password" },
} as const;
type Screen = keyof typeof SCREENS;
const screens: Screen[] = ["locked", "sign-in"];

async function gate(page: Page, theme: Theme, screen: Screen): Promise<{ audit: RequestAudit; button: Locator }> {
  const audit = await installRequestPolicy(page, { fixtures: [STATUS_FIXTURE, UNLOCK_FIXTURE] });
  await page.addInitScript((value) => window.localStorage.setItem("azalens-theme", value), theme);
  await page.route("**/auth/demo/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, enabled: true, authorized: SCREENS[screen].authorized }),
    }),
  );
  await page.goto("/dashboard");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(theme);
  if (screen === "locked") {
    await expect(page.getByLabel("Owner access code")).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Owner sign in" })).toBeVisible();
  }
  const button = page.getByRole("button", { name: SCREENS[screen].button, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  return { audit, button };
}

function finish(audit: RequestAudit, context: string) {
  reportRequestAudit(audit, context);
  assertRequestPolicy(audit, context);
  expect(audit.externalHosts(), `${context}: no non-loopback request`).toEqual([]);
  expect(audit.refused, `${context}: nothing refused`).toEqual([]);
}

test.beforeEach(async ({ browser }, testInfo) => {
  console.log(`BROWSER[${testInfo.project.name}]=${browser.browserType().name()} ${browser.version()}`);
});

for (const theme of themes) {
  for (const screen of screens) {
    test.describe(`ClosedDemoGate ${screen} button in the ${theme} theme`, () => {
      test("label colour, contrast and axe", async ({ page }) => {
        const { audit, button } = await gate(page, theme, screen);
        const label = SCREENS[screen].button;

        const { ratio, ...shape } = await measure(button);
        console.log(`GATE_LABEL[${screen}][${theme}]=` + JSON.stringify({ ...shape, ratio: Number(ratio.toFixed(3)) }));
        const results = await new AxeBuilder({ page }).analyze();
        const contrast = results.violations.find((violation) => violation.id === "color-contrast");
        const flagged = contrast?.nodes.some((node) => node.html.includes(`${label}</button>`)) ?? false;
        console.log(
          `GATE_AXE[${screen}][${theme}] total=${results.violations.length} ids=${JSON.stringify(
            results.violations.map((violation) => violation.id),
          )} gateButtonFlagged=${flagged}`,
        );
        for (const violation of results.violations) {
          for (const node of violation.nodes) {
            console.log(`GATE_AXE_RESIDUAL[${screen}][${theme}][${violation.id}]=${JSON.stringify({ html: node.html })}`);
          }
        }

        expect(shape.tag).toBe("BUTTON");
        expect(shape.type).toBe("submit");
        expect(shape.hasBgBrand).toBe(true);
        expect(shape.layers).toHaveLength(1);
        expect(shape.color).toBe(LABEL[theme].color);
        expect(shape.background).toBe(LABEL[theme].background);
        expect(Number(ratio.toFixed(3))).toBe(LABEL[theme].ratio);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        expect(flagged).toBe(false);
        finish(audit, `gate ${screen} ${theme}`);
      });

      test("hover leaves the label and background unchanged (desktop)", async ({ page }, testInfo) => {
        test.skip(
          testInfo.project.name.includes("mobile"),
          "Touch emulation has no persistent pointer hover, so hover is desktop-only.",
        );
        const { audit, button } = await gate(page, theme, screen);
        await button.hover();
        expect(await button.evaluate((element) => element.matches(":hover"))).toBe(true);
        const hover = await measure(button);
        console.log(`GATE_HOVER[${screen}][${theme}]=` + JSON.stringify({ ...hover, ratio: Number(hover.ratio.toFixed(3)) }));
        expect(hover.color).toBe(LABEL[theme].color);
        expect(hover.background).toBe(LABEL[theme].background);
        expect(Number(hover.ratio.toFixed(3))).toBe(LABEL[theme].ratio);
        finish(audit, `gate hover ${screen} ${theme}`);
      });

      test("keyboard Tab from the preceding field shows the global focus-visible outline", async ({ page }) => {
        const { audit, button } = await gate(page, theme, screen);
        await page.locator(SCREENS[screen].previous).focus();
        await page.keyboard.press("Tab");
        expect(await button.evaluate((element) => element === document.activeElement)).toBe(true);
        const focus = await button.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            focusVisible: element.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineColor: style.outlineColor,
            outlineOffset: style.outlineOffset,
            ringToken: getComputedStyle(document.documentElement).getPropertyValue("--az-ring").trim(),
            color: style.color,
            background: style.backgroundColor,
          };
        });
        console.log(`GATE_FOCUS[${screen}][${theme}]=` + JSON.stringify(focus));
        // Observation of the global rule only: this is not a full focus-appearance assessment.
        expect(focus.focusVisible).toBe(true);
        expect(focus.outlineStyle).toBe("solid");
        expect(focus.outlineWidth).toBe("2px");
        expect(focus.outlineOffset).toBe("3px");
        expect(focus.outlineColor).toBe(RING[theme]);
        expect(focus.color).toBe(LABEL[theme].color);
        expect(focus.background).toBe(LABEL[theme].background);
        finish(audit, `gate focus ${screen} ${theme}`);
      });
    });
  }

  test(`ClosedDemoGate unlock by keyboard Enter while pending in the ${theme} theme`, async ({ page }) => {
    const { audit } = await gate(page, theme, "locked");
    const unlocks: { method: string; body: unknown }[] = [];
    page.on("request", (request) => {
      if (UNLOCK_FIXTURE.test(request.url())) unlocks.push({ method: request.method(), body: request.postDataJSON() });
    });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let handled: Promise<void> = Promise.resolve();
    await page.route("**/auth/demo/unlock", (route) => {
      handled = held.then(() =>
        route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false }) }),
      );
      return handled;
    });

    try {
      await page.getByLabel("Owner access code").fill(ACCESS_CODE);
      await page.keyboard.press("Enter");
      const pending = page.getByRole("button", { name: "Checking…", exact: true });
      await expect(pending).toBeVisible();
      await expect(pending).toBeDisabled();
      await expect.poll(() => unlocks.length).toBe(1);
      expect(unlocks).toEqual([{ method: "POST", body: { accessCode: ACCESS_CODE } }]);

      const state = await pending.evaluate((element) => {
        const backdrop: { background: string; image: string; opacity: string }[] = [];
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          backdrop.push({ background: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity });
        }
        const style = getComputedStyle(element);
        return {
          disabled: (element as HTMLButtonElement).disabled,
          text: element.textContent,
          opacity: style.opacity,
          color: style.color,
          background: style.backgroundColor,
          backdrop,
        };
      });
      expect(state.disabled).toBe(true);
      expect(state.text).toBe("Checking…");
      expect(state.opacity).toBe("0.6");
      expect(state.color).toBe(LABEL[theme].color);
      expect(state.background).toBe(LABEL[theme].background);

      // Observational figure CALCULATED from browser-reported values, not an AA pass claim: the control painted
      // at 0.6 over its flattened ancestor backdrop.
      const base = state.backdrop.findIndex((layer) => parseCssColor(layer.background).alpha >= 1);
      const modelled =
        base >= 0 && state.backdrop.slice(0, base + 1).every((layer) => layer.image === "none" && layer.opacity === "1");
      if (modelled) {
        const under = flattenBackground(state.backdrop.slice(0, base + 1).map((layer) => layer.background));
        const faded = (value: string) => compositeOver({ ...parseCssColor(value), alpha: 0.6 }, under);
        const fg = faded(state.color);
        const bg = faded(state.background);
        const ratio = contrastRatio([fg.r, fg.g, fg.b], [bg.r, bg.g, bg.b]);
        console.log(
          `GATE_DISABLED_CALCULATED_FROM_BROWSER_VALUES[unlock][${theme}]=` +
            JSON.stringify({ color: state.color, background: state.background, opacity: state.opacity, ratio: Number(ratio.toFixed(3)) }),
        );
      } else {
        console.log(`GATE_DISABLED_CALCULATED_FROM_BROWSER_VALUES[unlock][${theme}]=unmodelled backdrop`);
      }
    } finally {
      release();
      await handled;
    }
    await expect(page.getByRole("alert")).toHaveText("That access code is not valid. Please check it and try again.");
    expect(unlocks).toHaveLength(1);
    finish(audit, `gate unlock pending ${theme}`);
  });
}
