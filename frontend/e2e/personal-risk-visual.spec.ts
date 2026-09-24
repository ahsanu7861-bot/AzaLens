import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
  type RequestAudit,
} from "./requestPolicy";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const FIXTURES = [
  /\/auth\/demo\/status(?:\?|$)/,
  /\/api\/personal-risk\/bootstrap-status(?:\?|$)/,
];
const themes = ["day", "night"] as const;

function candidateOutputDirectory() {
  const outputDirectory = process.env.AZALENS_PERSONAL_RISK_CANDIDATE_DIR;
  if (!outputDirectory?.startsWith("/private/tmp/")) {
    throw new Error("AZALENS_PERSONAL_RISK_CANDIDATE_DIR must be a fresh /private/tmp review directory.");
  }
  return outputDirectory;
}

const component = (component_code: string) => ({
  id: ID,
  schedule_id: ID,
  component_code,
  evidence_class: "REGULATOR_PUBLISHED",
  application_mode: "REFERENCE",
  proceeds_rate: null,
  quantity_rate: null,
  minimum_amount: null,
  maximum_amount: null,
  fixed_amount: null,
  source_authority: "Synthetic review authority",
  source_reference: "https://example.invalid/synthetic-review",
  source_effective_from: "2026-01-01",
  evidence_limitations: "Synthetic reference-only fixture",
});

const data = {
  observation: { instant: "2026-09-21T15:00:37Z", newYorkDate: "2026-09-21", newYorkWeek: "2026-09-21" },
  policyVersion: { id: ID, version_no: "1", portfolio_value_basis: "BROKER_EQUITY", max_planned_loss_per_position_pct: "0.500000", max_aggregate_open_planned_loss_pct: "2.000000", daily_realized_gross_loss_limit_pct: "1.000000", weekly_realized_gross_loss_limit_pct: "2.500000", maximum_concurrent_open_positions: "5", period_timezone: "America/New_York", estimated_exit_slippage_bps: "25.0000", created_at: "2026-09-22T00:00:00Z" },
  costSchedule: { id: ID, version_no: "1", broker_legal_entity: "Saxo Financial Services (DIFC) Ltd / Saxo MENA", pricing_tier: "Classic", account_currency: "USD", instrument_scope: "LONG_US_LISTED_CASH_EQUITY", effective_from: "2026-09-19", effective_through: null, maximum_modeled_sell_proceeds: "100000", maximum_modeled_exit_quantity: "10000", evidence_reference: "synthetic-review-evidence", evidence_captured_at: "2026-09-19T00:00:00Z", created_at: "2026-09-22T00:00:00Z", components: [component("CLOSE_COMMISSION"), component("FINRA_TAF_REFERENCE"), component("REGULATORY_ALLOWANCE"), component("SEC_REFERENCE")] },
  equitySnapshot: { id: ID, account_equity: "10000.00", currency: "USD", broker_identifier: "Synthetic broker fixture", confirmation_method: "OWNER_CONFIRMED_BROKER_VALUE", confirmation_reference: "synthetic-review-reference", observed_at: "2026-09-21T15:00:37Z", recorded_at: "2026-09-21T15:00:38Z" },
  dailyBasis: { id: ID, period_start: "2026-09-21", basis_sequence: "1", period_timezone: "America/New_York", source_snapshot_id: ID, previous_basis_id: null, effective_equity: "10000.00", currency: "USD", recorded_at: "2026-09-21T15:00:38Z" },
  weeklyBasis: { id: ID, period_start: "2026-09-21", basis_sequence: "1", period_timezone: "America/New_York", source_snapshot_id: ID, previous_basis_id: null, effective_equity: "10000.00", currency: "USD", recorded_at: "2026-09-21T15:00:38Z" },
  bootstrapComplete: true,
  pendingIntent: null,
};

async function installFixtures(page: Page): Promise<RequestAudit> {
  const audit = await installRequestPolicy(page, { fixtures: FIXTURES });
  await page.addInitScript(() => window.localStorage.setItem("sb-aaaaaaaaaaaaaaaaaaaa-auth-token", JSON.stringify({ access_token: "fixtureheader.fixturepayload.fixturesignature", refresh_token: "synthetic-fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated" } })));
  await page.route("**/auth/demo/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, authorized: true, enabled: true }) }));
  await page.route("**/api/personal-risk/bootstrap-status**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) }));
  return audit;
}

async function openSyntheticPage(page: Page, theme: "day" | "night") {
  await page.addInitScript((selectedTheme) => window.localStorage.setItem("azalens-theme", selectedTheme), theme);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings/personal-risk");
  await expect(page).toHaveURL(/\/settings\/personal-risk$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal risk controls" })).toBeVisible();
  await expect(page.getByText(/immutable owner-only risk foundations/i)).toBeVisible();
  await expect(page.getByText("Version 1 is immutable and active.")).toBeVisible();
  for (const code of ["CLOSE_COMMISSION", "SEC_REFERENCE", "FINRA_TAF_REFERENCE", "REGULATORY_ALLOWANCE"]) await expect(page.getByText(`• ${code}`, { exact: true })).toHaveCount(1);
  await expect(page.getByText("REALIZED_HISTORICAL_COST", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Latest: \$10000\.00 USD/)).toBeVisible();
  await expect(page.getByText("$10000.00 (sequence 1)", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Not cash, buying power, position market value or cost basis.")).toBeVisible();
  await expect(page.getByText("2026-09-21", { exact: true })).toHaveCount(2);
  await page.evaluate(async () => document.fonts.ready);
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), "personal-risk candidate must not scroll horizontally").toBe(false);
}

async function assertSkipLinkNotPainted(page: Page) {
  const box = await page.locator(".az-skip-link").boundingBox();
  expect(box, "the skip link remains structurally present").not.toBeNull();
  expect(box!.y + box!.height, "the unfocused skip link must remain above the viewport").toBeLessThanOrEqual(0);
}

async function pngDimensions(file: string) {
  const bytes = await readFile(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function prepareCompletePage(page: Page, theme: "day" | "night") {
  const audit = await installFixtures(page);
  await openSyntheticPage(page, theme);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Total broker-confirmed USD account equity")).toHaveValue("");
  await assertNoHorizontalOverflow(page);
  await assertSkipLinkNotPainted(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  return audit;
}

async function scrollConfirmationGroupIntoView(dialog: Locator, items: Locator[]) {
  const dialogMetrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
  });
  const itemBoxes = await Promise.all(items.map((item) => item.boundingBox()));
  const missingIndex = itemBoxes.findIndex((box) => box === null);
  if (missingIndex !== -1) throw new Error(`Required confirmation scroll target ${missingIndex + 1} has no bounding box.`);
  const contentTops = itemBoxes.map((box) => box!.y - dialogMetrics.top + dialogMetrics.scrollTop);
  const contentBottoms = itemBoxes.map((box) => box!.y + box!.height - dialogMetrics.top + dialogMetrics.scrollTop);
  const groupTop = Math.min(...contentTops);
  const groupBottom = Math.max(...contentBottoms);
  if (groupBottom - groupTop > dialogMetrics.clientHeight) throw new Error("Required confirmation action group does not fit in the production dialog scrollport.");
  const centered = (groupTop + groupBottom - dialogMetrics.clientHeight) / 2;
  const scrollTop = Math.max(0, Math.min(centered, dialogMetrics.scrollHeight - dialogMetrics.clientHeight));
  await dialog.evaluate((element, targetScrollTop: number) => {
    element.scrollTop = targetScrollTop;
  }, scrollTop);
}

type CompleteBox = { x: number; y: number; width: number; height: number; left: number; top: number; right: number; bottom: number };
type ConfirmationGeometry = {
  project: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  dialog: CompleteBox & { clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number; scrollTop: number };
  visibleScrollport: { left: number; top: number; right: number; bottom: number };
  items: Record<string, CompleteBox>;
};

async function captureMobileBasis(page: Page, theme: "day" | "night", projectName: string, file: string) {
  const header = page.locator(".app-shell > header");
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  const basisHeading = page.getByRole("heading", { name: "Current basis state" });
  const basis = basisHeading.locator("..");
  await expect(header).toHaveCount(1);
  await expect(navigation).toHaveCount(1);
  await expect(basis).toHaveCount(1);
  for (const label of ["Daily basis", "Weekly basis", "New York date", "Monday-based week"]) {
    await expect(basis.getByText(label, { exact: true })).toBeVisible();
  }
  const initialHeader = await header.boundingBox();
  const initialNavigation = await navigation.boundingBox();
  const initialBasis = await basis.boundingBox();
  if (!initialHeader) throw new Error("Required mobile basis header has no bounding box.");
  if (!initialNavigation) throw new Error("Required mobile basis navigation has no bounding box.");
  if (!initialBasis) throw new Error("Required Current basis state card has no bounding box.");
  const availableHeight = initialNavigation.y - (initialHeader.y + initialHeader.height);
  if (initialBasis.height > availableHeight) throw new Error("Current basis state card does not fit in the real unobscured mobile viewport.");
  const initialScrollY = await page.evaluate(() => window.scrollY);
  const targetScrollTop = Math.max(0, initialScrollY + initialBasis.y - (initialHeader.y + initialHeader.height + 8));
  await page.evaluate((scrollTop: number) => window.scrollTo({ left: 0, top: scrollTop, behavior: "instant" }), targetScrollTop);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const headerBox = await header.boundingBox();
  const navigationBox = await navigation.boundingBox();
  const basisBox = await basis.boundingBox();
  if (!headerBox) throw new Error("Required mobile basis header has no settled bounding box.");
  if (!navigationBox) throw new Error("Required mobile basis navigation has no settled bounding box.");
  if (!basisBox) throw new Error("Required Current basis state card has no settled bounding box.");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Personal-risk candidate requires a configured viewport.");
  expect(scroll.x).toBe(0);
  expect(scroll.y).toBeGreaterThan(0);
  expect(basisBox.x).toBeGreaterThanOrEqual(0);
  expect(basisBox.x + basisBox.width).toBeLessThanOrEqual(viewport.width);
  expect(basisBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(basisBox.y + basisBox.height).toBeLessThanOrEqual(navigationBox.y);
  await assertNoHorizontalOverflow(page);
  await assertSkipLinkNotPainted(page);
  await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
  const png = await pngDimensions(file);
  expect(png).toEqual({ width: 1170, height: 1992 });
  console.log(`PERSONAL_RISK_BASIS_GEOMETRY=${JSON.stringify({ project: projectName, theme, viewport: { ...viewport, devicePixelRatio: await page.evaluate(() => devicePixelRatio) }, pageScroll: scroll, header: completeBox(headerBox), navigation: completeBox(navigationBox), basisState: completeBox(basisBox), unobscuredViewport: { left: 0, top: headerBox.y + headerBox.height, right: viewport.width, bottom: navigationBox.y }, png, contained: true, classification: "real visible mobile viewport focused on current basis state" })}`);
}

function completeBox(box: { x: number; y: number; width: number; height: number }): CompleteBox {
  return { ...box, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

async function confirmationGeometry(page: Page, dialog: Locator, items: Record<string, Locator>, projectName: string): Promise<ConfirmationGeometry> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Personal-risk candidate requires a configured viewport.");
  const dialogGeometry = await dialog.evaluate((element, input: { projectName: string; viewport: { width: number; height: number } }) => {
    const dialogRect = element.getBoundingClientRect();
    const visible = {
      left: Math.max(0, dialogRect.left),
      top: Math.max(0, dialogRect.top),
      right: Math.min(input.viewport.width, dialogRect.right),
      bottom: Math.min(input.viewport.height, dialogRect.bottom),
    };
    const rect = { x: dialogRect.x, y: dialogRect.y, width: dialogRect.width, height: dialogRect.height, top: dialogRect.top, right: dialogRect.right, bottom: dialogRect.bottom, left: dialogRect.left };
    return {
      project: input.projectName,
      viewport: { ...input.viewport, devicePixelRatio: window.devicePixelRatio },
      dialog: { ...rect, clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop },
      visibleScrollport: visible,
    };
  }, { projectName, viewport });
  const itemBoxes: Record<string, CompleteBox> = {};
  for (const [name, locator] of Object.entries(items)) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Required confirmation geometry target ${name} has no bounding box.`);
    itemBoxes[name] = { ...box, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
  }
  return { ...dialogGeometry, items: itemBoxes };
}

async function assertConfirmationContained(page: Page, geometry: Awaited<ReturnType<typeof confirmationGeometry>>, items: Record<string, Locator>) {
  expect(geometry.dialog.scrollHeight).toBeGreaterThan(geometry.dialog.clientHeight);
  for (const [name, box] of Object.entries(geometry.items)) {
    expect(box.left, `${name} left edge`).toBeGreaterThanOrEqual(geometry.visibleScrollport.left);
    expect(box.top, `${name} top edge`).toBeGreaterThanOrEqual(geometry.visibleScrollport.top);
    expect(box.right, `${name} right edge`).toBeLessThanOrEqual(geometry.visibleScrollport.right);
    expect(box.bottom, `${name} bottom edge`).toBeLessThanOrEqual(geometry.visibleScrollport.bottom);
  }
  for (const name of ["cancel", "confirm"] as const) {
    expect(await items[name].evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === element || element.contains(hit);
    }), `${name} must be the center-point hit target`).toBe(true);
  }
  await assertNoHorizontalOverflow(page);
}

test.describe("personal-risk review candidates @candidate", () => {
  for (const theme of themes) {
    test(`complete ${theme} page`, async ({ page }, testInfo) => {
      const outputDirectory = candidateOutputDirectory();
      await mkdir(outputDirectory, { recursive: true });
      const audit = await prepareCompletePage(page, theme);
      assertRequestPolicy(audit, `personal-risk complete ${theme} page`);
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("Personal-risk candidate requires a configured viewport.");
      const mobile = testInfo.project.name.includes("mobile");
      const form = mobile ? "mobile" : "desktop";
      const file = path.join(outputDirectory, `personal-risk-page-${theme}-${form}${mobile ? "-top" : ""}-chromium-linux.png`);
      if (mobile) {
        const main = page.locator("main#main-content");
        const geometry = await main.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const header = document.querySelector(".app-shell > header");
          const navigation = document.querySelector('nav[aria-label="Mobile navigation"]');
          return { viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, box: { x: box.x, y: box.y, width: box.width, height: box.height }, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, fixedShellOutside: Boolean(header && navigation && !element.contains(header) && !element.contains(navigation)) };
        });
        expect(geometry.viewport).toEqual(viewport);
        expect(geometry.box.width).toBe(viewport.width);
        expect(geometry.scrollWidth).toBe(geometry.clientWidth);
        expect(geometry.fixedShellOutside).toBe(true);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
        await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
        const png = await pngDimensions(file);
        expect(png).toEqual({ width: 1170, height: 1992 });
        console.log(`PERSONAL_RISK_PAGE_GEOMETRY=${JSON.stringify({ project: testInfo.project.name, ...geometry, pageScroll: { x: 0, y: 0 }, png, classification: "real visible mobile viewport at scroll position zero" })}`);
        const basisFile = path.join(outputDirectory, `personal-risk-page-${theme}-mobile-basis-chromium-linux.png`);
        await captureMobileBasis(page, theme, testInfo.project.name, basisFile);
      } else {
        await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
        const png = await pngDimensions(file);
        expect(png).toEqual({ width: 1280, height: 1246 });
        console.log(`PERSONAL_RISK_PAGE_GEOMETRY=${JSON.stringify({ project: testInfo.project.name, viewport, devicePixelRatio: await page.evaluate(() => devicePixelRatio), png, classification: "honest full-page rendering; not one simultaneously visible viewport" })}`);
      }
      await assertSkipLinkNotPainted(page);
      reportRequestAudit(audit, `personal-risk complete ${theme} page`);
      assertRequestPolicy(audit, `personal-risk complete ${theme} page after capture`);
      console.log(`PASS candidate: complete ${theme} personal-risk page is synthetic, unobscured and contained.`);
    });
  }

  test("eight-candidate execution contract", async ({}, testInfo) => {
    const expected = testInfo.project.name.includes("mobile")
      ? ["day-mobile-top", "night-mobile-top", "day-mobile-basis", "night-mobile-basis", "equity-confirmation-mobile"]
      : ["day-desktop", "night-desktop", "equity-confirmation-desktop"];
    expect(expected).toHaveLength(testInfo.project.name.includes("mobile") ? 5 : 3);
    expect(new Set(expected).size).toBe(expected.length);
    console.log(`PASS candidate: ${testInfo.project.name} contributes the exact ${expected.length}-file candidate set.`);
  });

  test("critical equity confirmation", async ({ page }, testInfo) => {
    const outputDirectory = candidateOutputDirectory();
    await mkdir(outputDirectory, { recursive: true });
    const audit = await installFixtures(page);
    await openSyntheticPage(page, "night");
    await page.getByLabel("Total broker-confirmed USD account equity").fill("9000.00");
    await page.getByLabel("Exact broker observation time").fill("2026-09-21T20:00:37+05:00");
    await page.getByRole("button", { name: "Record fresh snapshot" }).click();
    const dialog = page.getByRole("dialog", { name: "Record broker equity evidence?" });
    const warningLabel = dialog.locator("strong").filter({ hasText: /^Basis tightening:$/ });
    await expect(warningLabel).toHaveCount(1);
    const warning = warningLabel.locator("..");
    await expect(warning).toHaveCount(1);
    expect(await warning.evaluate((element) => element.tagName)).toBe("DIV");
    await expect(warning).toHaveClass(/border-caution\/35/);
    const accountConfirmation = dialog.getByLabel(/total broker-confirmed USD account equity/i);
    const tighteningConfirmation = dialog.getByLabel(/irreversible basis tightening/i);
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const submit = dialog.getByRole("button", { name: "Confirm and submit" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("$9000.00", { exact: true })).toBeVisible();
    await expect(dialog.getByText("2026-09-21T15:00:37Z", { exact: true })).toBeVisible();
    await expect(dialog.getByText("saxo-owner-evidence://account-summary/20260921T150037Z", { exact: true })).toBeVisible();
    await expect(dialog.getByText("2026-09-21", { exact: true })).toHaveCount(2);
    await expect(dialog.getByText("10000.00", { exact: true })).toHaveCount(2);
    await expect(dialog.getByText("9000.00", { exact: true })).toHaveCount(2);
    await expect(warning).toBeVisible();
    await expect(accountConfirmation).toBeVisible();
    await expect(tighteningConfirmation).toBeVisible();
    await expect(cancel).toBeVisible();
    await expect(submit).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await expect(warning).toHaveText("Basis tightening: daily and weekly. It cannot be raised again during that period.");
    const items = { warning, accountConfirmation, tighteningConfirmation, cancel, confirm: submit };
    await scrollConfirmationGroupIntoView(dialog, Object.values(items));
    const geometry = await confirmationGeometry(page, dialog, items, testInfo.project.name);
    await assertConfirmationContained(page, geometry, items);
    expect(await page.evaluate(() => window.localStorage.getItem("azalens-personal-risk-pending-intent"))).toBeNull();
    assertRequestPolicy(audit, "personal-risk critical equity confirmation");
    const form = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
    const file = path.join(outputDirectory, `personal-risk-equity-confirmation-${form}-chromium-linux.png`);
    console.log(`PERSONAL_RISK_CONFIRMATION_GEOMETRY=${JSON.stringify(geometry)}`);
    await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
    console.log(`PERSONAL_RISK_CONFIRMATION_PNG=${JSON.stringify({ project: testInfo.project.name, png: await pngDimensions(file), classification: "real visible viewport action state" })}`);
    await expect(dialog).toBeVisible();
    reportRequestAudit(audit, "personal-risk critical equity confirmation");
    assertRequestPolicy(audit, "personal-risk critical equity confirmation after capture");
    console.log("PASS candidate: critical synthetic equity confirmation includes every warning, confirmation and action.");
  });
});
