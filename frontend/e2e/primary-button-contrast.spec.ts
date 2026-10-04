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
 * Primary `Button` labels take `--az-primary-button-label`: `#0a0e1a` in night on the unchanged cyan
 * `--az-brand` `#06b6d4`, and `#ffffff` in day on `--az-brand` `#0e7490`, which is the day appearance it
 * replaced. White on the night cyan was 2.428:1, and 1.807:1 on hover.
 *
 * Coverage is limited to the controls named here. Every other primary Button inherits the same token, so its
 * colours are predicted, not measured. Every application call is mocked; the request policy fails the run
 * on anything unmocked.
 */
const TOKEN = "fixtureheader.fixturepayload.fixturesignature";
const AUTH_FIXTURE = /\/auth\/demo\/status(?:\?|$)/;
const STATUS_FIXTURE = /\/api\/personal-risk\/bootstrap-status(?:\?|$)/;
const LIFECYCLE_API = /\/api\/personal-risk\/lifecycle(?:\/|\?|$)/;
const LIFECYCLE_PENDING_KEY = "azalens-personal-risk-lifecycle-pending";

const PRIMARY = {
  day: {
    color: "rgb(255, 255, 255)",
    background: "rgb(14, 116, 144)",
    ratio: 5.358,
    hoverBackground: "rgb(21, 94, 117)",
    hoverRatio: 7.267,
  },
  night: {
    color: "rgb(10, 14, 26)",
    background: "rgb(6, 182, 212)",
    ratio: 7.931,
    hoverBackground: "rgb(34, 211, 238)",
    hoverRatio: 10.655,
  },
} as const;

/** The secondary variant must be untouched by this change; these are its base-commit colours. */
const SECONDARY = {
  day: { color: "rgb(15, 23, 42)", background: "rgb(241, 245, 249)" },
  night: { color: "rgb(240, 244, 248)", background: "rgb(26, 35, 50)" },
} as const;

type Theme = keyof typeof PRIMARY;
const themes: Theme[] = ["day", "night"];

async function owner(page: Page, theme: Theme, fixtures: RegExp[] = []): Promise<RequestAudit> {
  const audit = await installRequestPolicy(page, { fixtures: [AUTH_FIXTURE, ...fixtures] });
  await page.addInitScript(
    ({ token, value }) => {
      window.localStorage.setItem("azalens-theme", value);
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
    },
    { token: TOKEN, value: theme },
  );
  await page.route("**/auth/demo/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, enabled: true, authorized: true }),
    }),
  );
  return audit;
}

async function expectTheme(page: Page, theme: Theme) {
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(theme);
}

/** Measures one enabled primary Button and pins it to the theme's exact token pair. */
async function expectPrimary(control: Locator, theme: Theme, tag: string) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  const { ratio, ...shape } = await measure(control);
  console.log(`PRIMARY_LABEL[${tag}][${theme}]=` + JSON.stringify({ ...shape, ratio: Number(ratio.toFixed(3)) }));
  expect(shape.tag).toBe("BUTTON");
  expect(shape.hasBgBrand).toBe(true);
  expect(shape.layers).toHaveLength(1);
  expect(shape.color).toBe(PRIMARY[theme].color);
  expect(shape.background).toBe(PRIMARY[theme].background);
  expect(Number(ratio.toFixed(3))).toBe(PRIMARY[theme].ratio);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

/** Runs axe and asserts that none of the given labels is a `color-contrast` node; logs everything else. */
async function expectNoContrastFinding(page: Page, theme: Theme, tag: string, labels: string[]) {
  const results = await new AxeBuilder({ page }).analyze();
  const contrast = results.violations.find((violation) => violation.id === "color-contrast");
  const flagged = labels.filter((label) => contrast?.nodes.some((node) => node.html.includes(label)) ?? false);
  console.log(
    `PRIMARY_AXE[${tag}][${theme}] total=${results.violations.length} ids=${JSON.stringify(
      results.violations.map((violation) => violation.id),
    )} flaggedPrimaryLabels=${JSON.stringify(flagged)}`,
  );
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      console.log(`PRIMARY_AXE_RESIDUAL[${tag}][${theme}][${violation.id}]=${JSON.stringify({ html: node.html })}`);
    }
  }
  expect(flagged).toEqual([]);
}

test.beforeEach(async ({ browser }, testInfo) => {
  console.log(`BROWSER[${testInfo.project.name}]=${browser.browserType().name()} ${browser.version()}`);
});

for (const theme of themes) {
  test.describe(`primary Button label in the ${theme} theme`, () => {
    test("/settings: both primary Buttons, and the secondary Button is unchanged", async ({ page }) => {
      const audit = await owner(page, theme);
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
      await expectTheme(page, theme);

      await expectPrimary(page.getByRole("button", { name: "Open personal risk controls" }), theme, "settings-entry");
      await expectPrimary(page.getByRole("button", { name: "Save preferences" }), theme, "settings-save");

      const reset = await measure(page.getByRole("button", { name: "Reset defaults" }));
      console.log(`SECONDARY_RESET[${theme}]=` + JSON.stringify({ ...reset, ratio: Number(reset.ratio.toFixed(3)) }));
      expect(reset.hasBgBrand).toBe(false);
      expect(reset.color).toBe(SECONDARY[theme].color);
      expect(reset.background).toBe(SECONDARY[theme].background);

      await expectNoContrastFinding(page, theme, "settings", ["Open personal risk controls", "Save preferences"]);
      reportRequestAudit(audit, `primary label settings ${theme}`);
      assertRequestPolicy(audit, `primary label settings ${theme}`);
    });

    test("/settings/personal-risk/lifecycle: the three review Buttons, with no lifecycle request", async ({ page }) => {
      const audit = await owner(page, theme);
      await page.addInitScript((key) => window.localStorage.removeItem(key), LIFECYCLE_PENDING_KEY);
      await page.goto("/settings/personal-risk/lifecycle");
      await expectTheme(page, theme);
      expect(await page.evaluate((key) => window.localStorage.getItem(key), LIFECYCLE_PENDING_KEY)).toBeNull();

      const labels = ["Review partial exit", "Review final exit", "Review stop tightening"];
      for (const label of labels) {
        await expectPrimary(page.getByRole("button", { name: label }), theme, `lifecycle-${label}`);
      }
      await expectNoContrastFinding(page, theme, "lifecycle", labels);

      const lifecycleRequests = audit.records.filter((entry) => LIFECYCLE_API.test(entry.url));
      expect(lifecycleRequests, "rendering the lifecycle page must not call any lifecycle API").toEqual([]);
      reportRequestAudit(audit, `primary label lifecycle ${theme}`);
      assertRequestPolicy(audit, `primary label lifecycle ${theme}`);
    });

    test("landing /: Analyze, outside the app shell", async ({ page }) => {
      const audit = await installRequestPolicy(page);
      await page.addInitScript((value) => window.localStorage.setItem("azalens-theme", value), theme);
      await page.goto("/");
      await expectTheme(page, theme);

      const analyze = page.getByRole("button", { name: "Analyze", exact: true });
      await expect(analyze).toBeVisible();
      expect(await analyze.evaluate((element) => Boolean(element.closest(".app-shell")))).toBe(false);
      await expectPrimary(analyze, theme, "landing-analyze");

      await expectNoContrastFinding(page, theme, "landing", ["Analyze</"]);
      reportRequestAudit(audit, `primary label landing ${theme}`);
      assertRequestPolicy(audit, `primary label landing ${theme}`);
    });

    test("Save preferences: hover and active states (desktop)", async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name.includes("mobile"),
        "Touch emulation has no persistent pointer hover, so hover/active colours are desktop-only.",
      );
      const audit = await owner(page, theme);
      await page.goto("/settings");
      await expectTheme(page, theme);
      const save = page.getByRole("button", { name: "Save preferences" });
      await expect(save).toBeVisible();

      // Any click during inspection would save settings; count clicks so an accidental one fails the test.
      await save.evaluate((element) => {
        (window as unknown as { __saveClicks: number }).__saveClicks = 0;
        element.addEventListener("click", () => {
          (window as unknown as { __saveClicks: number }).__saveClicks += 1;
        });
      });
      const backgroundOf = () => save.evaluate((element) => getComputedStyle(element).backgroundColor);

      await save.hover();
      await expect.poll(backgroundOf).toBe(PRIMARY[theme].hoverBackground);
      const hover = await measure(save);
      console.log(`PRIMARY_HOVER[settings-save][${theme}]=` + JSON.stringify({ ...hover, ratio: Number(hover.ratio.toFixed(3)) }));
      expect(hover.color).toBe(PRIMARY[theme].color);
      expect(hover.background).toBe(PRIMARY[theme].hoverBackground);
      expect(Number(hover.ratio.toFixed(3))).toBe(PRIMARY[theme].hoverRatio);

      // Hold the button down to inspect :active, then release off the control so no click is dispatched.
      await page.mouse.down();
      expect(await save.evaluate((element) => element.matches(":active"))).toBe(true);
      await expect.poll(backgroundOf).toBe(PRIMARY[theme].hoverBackground);
      const active = await measure(save);
      console.log(`PRIMARY_ACTIVE[settings-save][${theme}]=` + JSON.stringify({ ...active, ratio: Number(active.ratio.toFixed(3)) }));
      expect(active.color).toBe(PRIMARY[theme].color);
      expect(active.background).toBe(PRIMARY[theme].hoverBackground);
      expect(Number(active.ratio.toFixed(3))).toBe(PRIMARY[theme].hoverRatio);
      await page.mouse.move(1, 1);
      await page.mouse.up();
      expect(await page.evaluate(() => (window as unknown as { __saveClicks: number }).__saveClicks)).toBe(0);

      reportRequestAudit(audit, `primary label hover/active ${theme}`);
      assertRequestPolicy(audit, `primary label hover/active ${theme}`);
    });

    test("Save preferences: keyboard focus-visible ring keeps the brand colour", async ({ page }) => {
      const audit = await owner(page, theme);
      await page.goto("/settings");
      await expectTheme(page, theme);
      const save = page.getByRole("button", { name: "Save preferences" });
      await expect(save).toBeVisible();

      // Reach the control by keyboard so :focus-visible reflects a real keyboard path.
      let focused = false;
      for (let step = 0; step < 60 && !focused; step += 1) {
        await page.keyboard.press("Tab");
        focused = await save.evaluate((element) => element === document.activeElement);
      }
      expect(focused).toBe(true);
      // The ring transitions in with the control's `transition` class; wait for the resolved, opaque ring.
      await expect
        .poll(() => save.evaluate((element) => getComputedStyle(element).boxShadow))
        .toContain(PRIMARY[theme].background);
      const ring = await save.evaluate((element) => ({
        focusVisible: element.matches(":focus-visible"),
        boxShadow: getComputedStyle(element).boxShadow,
        color: getComputedStyle(element).color,
      }));
      console.log(`PRIMARY_FOCUS[settings-save][${theme}]=` + JSON.stringify(ring));
      // Existence and colour only: this is not a full focus-appearance assessment.
      expect(ring.focusVisible).toBe(true);
      expect(ring.boxShadow).not.toBe("none");
      expect(ring.boxShadow).toContain(PRIMARY[theme].background);
      expect(ring.color).toBe(PRIMARY[theme].color);

      reportRequestAudit(audit, `primary label focus ${theme}`);
      assertRequestPolicy(audit, `primary label focus ${theme}`);
    });

    test("disabled Create cost schedule keeps its token colours at half opacity", async ({ page }) => {
      const audit = await owner(page, theme, [STATUS_FIXTURE]);
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
      await page.goto("/settings/personal-risk");
      await expectTheme(page, theme);
      // Wait for the bootstrap read to settle: the first gate opens, the second stays closed.
      await expect(page.getByRole("button", { name: "Create policy version" })).toBeEnabled();
      const schedule = page.getByRole("button", { name: "Create cost schedule" });
      await expect(schedule).toBeDisabled();

      const state = await schedule.evaluate((element) => {
        const backdrop: { background: string; image: string; opacity: string }[] = [];
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          backdrop.push({ background: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity });
        }
        const style = getComputedStyle(element);
        return {
          disabled: (element as HTMLButtonElement).disabled,
          opacity: style.opacity,
          color: style.color,
          background: style.backgroundColor,
          backdrop,
        };
      });
      expect(state.disabled).toBe(true);
      expect(state.opacity).toBe("0.5");
      expect(state.color).toBe(PRIMARY[theme].color);
      expect(state.background).toBe(PRIMARY[theme].background);
      // measure() refuses group opacity by design and is not weakened here: this test calls it only to prove
      // that refusal still holds for a disabled control.
      await expect(measure(schedule)).rejects.toThrow(/Cannot composite/);

      // Informational figure, CALCULATED from browser-reported values, not a browser measurement: the whole
      // control painted at 0.5 over its flattened ancestor backdrop. Disabled controls are exempt from 4.5:1.
      const base = state.backdrop.findIndex((layer) => parseCssColor(layer.background).alpha >= 1);
      const modelled =
        base >= 0 && state.backdrop.slice(0, base + 1).every((layer) => layer.image === "none" && layer.opacity === "1");
      if (modelled) {
        const under = flattenBackground(state.backdrop.slice(0, base + 1).map((layer) => layer.background));
        const half = (value: string) => compositeOver({ ...parseCssColor(value), alpha: 0.5 }, under);
        const fg = half(state.color);
        const bg = half(state.background);
        const ratio = contrastRatio([fg.r, fg.g, fg.b], [bg.r, bg.g, bg.b]);
        console.log(
          `DISABLED_CALCULATED_FROM_BROWSER_VALUES[create-cost-schedule][${theme}]=` +
            JSON.stringify({ color: state.color, background: state.background, opacity: state.opacity, ratio: Number(ratio.toFixed(3)) }),
        );
      } else {
        console.log(`DISABLED_CALCULATED_FROM_BROWSER_VALUES[create-cost-schedule][${theme}]=unmodelled backdrop`);
      }

      reportRequestAudit(audit, `primary label disabled ${theme}`);
      assertRequestPolicy(audit, `primary label disabled ${theme}`);
    });
  });
}
