import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  assertRequestPolicy,
  installRequestPolicy,
  reportRequestAudit,
  type RequestAudit,
} from "./requestPolicy";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = "fixtureheader.fixturepayload.fixturesignature";
const AUTH_FIXTURE = /\/auth\/demo\/status(?:\?|$)/;
const STATUS_FIXTURE = /\/api\/personal-risk\/bootstrap-status(?:\?|$)/;
const POLICY_FIXTURE = /\/api\/personal-risk\/policy-versions(?:\?|$)/;
const SCHEDULE_FIXTURE = /\/api\/personal-risk\/cost-schedules(?:\?|$)/;
const EQUITY_FIXTURE = /\/api\/personal-risk\/equity-snapshots(?:\?|$)/;

const component = (code: string) => ({ id: ID, schedule_id: ID, component_code: code, evidence_class: "REGULATOR_PUBLISHED", application_mode: "REFERENCE", proceeds_rate: null, quantity_rate: null, minimum_amount: null, maximum_amount: null, fixed_amount: null, source_authority: "Synthetic fixture authority", source_reference: "https://example.invalid/synthetic-evidence", source_effective_from: "2026-01-01", evidence_limitations: "Synthetic fixture" });
const policy = { id: ID, version_no: "1", portfolio_value_basis: "BROKER_EQUITY", max_planned_loss_per_position_pct: "0.500000", max_aggregate_open_planned_loss_pct: "2.000000", daily_realized_gross_loss_limit_pct: "1.000000", weekly_realized_gross_loss_limit_pct: "2.500000", maximum_concurrent_open_positions: "5", period_timezone: "America/New_York", estimated_exit_slippage_bps: "25.0000", created_at: "2026-09-22T00:00:00Z" };
const schedule = { id: ID, version_no: "1", broker_legal_entity: "Saxo Bank", pricing_tier: "Classic", account_currency: "USD", instrument_scope: "LONG_US_LISTED_CASH_EQUITY", effective_from: "2026-09-19", effective_through: null, maximum_modeled_sell_proceeds: "100000", maximum_modeled_exit_quantity: "10000", evidence_reference: "synthetic", evidence_captured_at: "2026-09-19T00:00:00Z", created_at: "2026-09-22T00:00:00Z", components: [component("CLOSE_COMMISSION"), component("FINRA_TAF_REFERENCE"), component("REGULATORY_ALLOWANCE"), component("SEC_REFERENCE")] };
const snapshot = { id: ID, account_equity: "10000.00", currency: "USD", broker_identifier: "Synthetic broker fixture", confirmation_method: "OWNER_CONFIRMED_BROKER_VALUE", confirmation_reference: "synthetic-owner-evidence", observed_at: "2026-09-21T15:00:37Z", recorded_at: "2026-09-21T15:00:38Z" };
const basis = (equity = "10000.00") => ({ id: ID, period_start: "2026-09-21", basis_sequence: "1", period_timezone: "America/New_York", source_snapshot_id: ID, previous_basis_id: null, effective_equity: equity, currency: "USD", recorded_at: "2026-09-21T15:00:38Z" });
const status = (phase = 0, pendingIntent: null | Record<string, unknown> = null) => ({ success: true, data: { observation: { instant: "2026-09-21T15:00:37Z", newYorkDate: "2026-09-21", newYorkWeek: "2026-09-21" }, policyVersion: phase >= 1 ? policy : null, costSchedule: phase >= 2 ? schedule : null, equitySnapshot: phase >= 3 ? snapshot : null, dailyBasis: phase >= 3 ? basis() : null, weeklyBasis: phase >= 3 ? basis() : null, bootstrapComplete: phase >= 3, pendingIntent } });

async function owner(page: Page, fixtures: RegExp[]): Promise<RequestAudit> {
  const audit = await installRequestPolicy(page, { fixtures: [AUTH_FIXTURE, STATUS_FIXTURE, ...fixtures] });
  await page.addInitScript(({ token }) => window.localStorage.setItem("sb-aaaaaaaaaaaaaaaaaaaa-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated" } })), { token: TOKEN });
  await page.route("**/auth/demo/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, enabled: true, authorized: true }) }));
  return audit;
}

function fulfill(route: Route, body: unknown, statusCode = 200) {
  return route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify(body) });
}

function finishAudit(audit: RequestAudit, context: string) {
  reportRequestAudit(audit, context);
  assertRequestPolicy(audit, context);
}

test("empty bootstrap proceeds policy then schedule with exact mocked requests", async ({ page }) => {
  const audit = await owner(page, [POLICY_FIXTURE, SCHEDULE_FIXTURE]);
  let phase = 0;
  let pendingOperation = "";
  const calls: string[] = [];
  await page.route("**/api/personal-risk/bootstrap-status**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("operation")) {
      const committed = pendingOperation === "POLICY_VERSION" ? { operation: pendingOperation, state: "COMMITTED", policyVersionId: ID, versionNo: "1", replayed: true } : { operation: pendingOperation, state: "COMMITTED", scheduleVersionId: ID, versionNo: "1", replayed: true };
      return fulfill(route, status(phase, committed));
    }
    return fulfill(route, status(phase));
  });
  for (const routePattern of ["**/api/personal-risk/policy-versions", "**/api/personal-risk/cost-schedules"]) await page.route(routePattern, async (route) => {
    const request = route.request();
    calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
    expect(request.headers().authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.postDataJSON()).toEqual({ confirmed: true });
    pendingOperation = request.url().includes("policy") ? "POLICY_VERSION" : "COST_SCHEDULE";
    phase += 1;
    return fulfill(route, { success: true, data: pendingOperation === "POLICY_VERSION" ? { policyVersionId: ID, versionNo: "1", replayed: false } : { scheduleVersionId: ID, versionNo: "1", replayed: false } }, 201);
  });
  await page.goto("/settings/personal-risk");
  await page.getByRole("button", { name: "Create policy version" }).click();
  await page.getByRole("button", { name: "Confirm and submit" }).click();
  await expect(page.getByText("Version 1 is immutable and active.")).toBeVisible();
  await page.getByRole("button", { name: "Create cost schedule" }).click();
  await page.getByRole("button", { name: "Confirm and submit" }).click();
  await expect(page.getByRole("button", { name: "Review first snapshot" })).toBeEnabled();
  expect(calls).toEqual(["POST /api/personal-risk/policy-versions", "POST /api/personal-risk/cost-schedules"]);
  finishAudit(audit, "personal-risk empty bootstrap");
});

test("pending NOT_FOUND recovery reuses the saved key and equity requires re-entry", async ({ page }) => {
  const audit = await owner(page, [EQUITY_FIXTURE]);
  await page.addInitScript(({ key, id }) => window.localStorage.setItem(key, JSON.stringify({ operation: "EQUITY_SNAPSHOT", idempotencyKey: id })), { key: "azalens-personal-risk-pending-intent", id: ID });
  let posts = 0;
  await page.route("**/api/personal-risk/bootstrap-status**", (route) => fulfill(route, status(3, { operation: "EQUITY_SNAPSHOT", state: "NOT_FOUND" })));
  await page.route("**/api/personal-risk/equity-snapshots", async (route) => {
    const request = route.request();
    posts += 1;
    expect(request.headers()["idempotency-key"]).toBe(ID);
    expect(request.postDataJSON()).toEqual({ accountEquity: "9000.00", observedAt: "2026-09-21T15:00:37Z", accountValueConfirmed: true, basisTighteningConfirmed: true });
    return fulfill(route, { success: true, data: { equitySnapshotId: ID, dailyBasisId: ID, weeklyBasisId: ID, dailyEffectiveEquity: "9000.00", weeklyEffectiveEquity: "9000.00", replayed: true } });
  });
  await page.goto("/settings/personal-risk");
  await expect(page.getByText(/Re-enter every equity field/)).toBeVisible();
  await page.getByLabel("Total broker-confirmed USD account equity").fill("9000.00");
  await page.getByLabel("Exact broker observation time").fill("2026-09-21T20:00:37+05:00");
  await page.getByRole("button", { name: "Retry same request key" }).click();
  await page.getByLabel("I confirm this is total broker-confirmed USD account equity.", { exact: true }).check();
  await page.getByLabel(/irreversible basis tightening/).check();
  await page.getByRole("button", { name: "Confirm and submit" }).click();
  await expect.poll(() => posts).toBe(1);
  finishAudit(audit, "personal-risk pending recovery");
});

test("complete state supports lower-equity tightening, repeat snapshots, keyboard and axe", async ({ page }) => {
  const audit = await owner(page, []);
  await page.route("**/api/personal-risk/bootstrap-status**", (route) => fulfill(route, status(3)));
  await page.goto("/settings/personal-risk");
  await expect(page.getByRole("button", { name: "Record fresh snapshot" })).toBeEnabled();
  await page.getByLabel("Total broker-confirmed USD account equity").fill("9000.00");
  await page.getByLabel("Exact broker observation time").fill("2026-09-21T20:00:37+05:00");
  await page.getByRole("button", { name: "Record fresh snapshot" }).press("Enter");
  await expect(page.getByText("Basis tightening: daily and weekly. It cannot be raised again during that period.")).toBeVisible();
  await expect(page.getByLabel(/irreversible basis tightening/)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  finishAudit(audit, "personal-risk complete state");
});

test("owner-origin rejection is distinct and sanitized", async ({ page }) => {
  const audit = await owner(page, []);
  await page.route("**/api/personal-risk/bootstrap-status**", (route) => fulfill(route, { success: false, code: "OWNER_ORIGIN_REQUIRED", message: "A trusted owner origin is required." }, 403));
  await page.goto("/settings/personal-risk");
  await expect(page.getByRole("alert")).toContainText("trusted AzaLens origin");
  await expect(page.getByText(/session expired/i)).toHaveCount(0);
  finishAudit(audit, "personal-risk owner-origin rejection");
});

test("phone viewport keeps the real scrollable dialog actions visible and unobscured", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only.");
  const audit = await owner(page, []);
  await page.route("**/api/personal-risk/bootstrap-status**", (route) => fulfill(route, status(3)));
  await page.goto("/settings/personal-risk");
  await page.getByLabel("Total broker-confirmed USD account equity").fill("9000.00");
  await page.getByLabel("Exact broker observation time").fill("2026-09-21T20:00:37+05:00");
  await page.getByRole("button", { name: "Record fresh snapshot" }).click();
  const dialog = page.getByRole("dialog", { name: "Record broker equity evidence?" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const submit = dialog.getByRole("button", { name: "Confirm and submit" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await cancel.scrollIntoViewIfNeeded();
  await submit.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Mobile project requires a viewport.");
  for (const button of [cancel, submit]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    })).toBe(true);
  }
  await cancel.focus();
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  finishAudit(audit, "personal-risk true-mobile dialog");
});
