"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TRIAL_SYMBOL_MATRIX } = require("../config/twelveDataTrialMatrix");
const { ABORT_CRITERIA, CACHE_OBSERVATION_PLAN, DAY_SCHEDULE, ENDPOINT_WEIGHTS, EXIT_CRITERIA,
  PLAN_VERSION, PROVIDER_ENTITLEMENT, TRIAL_BUDGET, VENTURE_CREDITS_PER_MINUTE } = require("../config/twelveDataTrialPlan");
const { BLOCKED_ENDPOINTS, ENDPOINTS, EVIDENCE_ROOT, EVIDENCE_SCHEMA_VERSION, LIVE_ACK, assertLiveAuthority,
  createBudget, parseArgs, redact, requireAllowedEndpoint, resolveEvidencePath, runHarness, writeEvidence } = require("../scripts/twelveDataTrialHarness");

async function rejects(fn, pattern) { await assert.rejects(Promise.resolve().then(fn), pattern); }

async function run() {
  assert.equal(TRIAL_SYMBOL_MATRIX.length, 9);
  assert.equal(new Set(TRIAL_SYMBOL_MATRIX.map((row) => row.bucket)).size, 9);
  assert.deepEqual(Object.keys(ENDPOINTS), ["quote", "profile", "stocks", "logo", "symbol_search", "time_series"]);
  assert.equal(ENDPOINTS, ENDPOINT_WEIGHTS);
  assert.equal(PLAN_VERSION, "b4b-v2");
  assert.equal(VENTURE_CREDITS_PER_MINUTE, 610);
  assert.equal(DAY_SCHEDULE.length, 12);
  assert.deepEqual(DAY_SCHEDULE.map((item) => item.day), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(CACHE_OBSERVATION_PLAN.length, 7);
  assert.ok(ABORT_CRITERIA.length >= 8);
  assert.ok(EXIT_CRITERIA.length >= 6);
  assert.deepEqual(ENDPOINTS.profile, { credits: 10, status: "confirmed_written_provider_support", unit: "per_symbol" });
  assert.deepEqual(ENDPOINTS.logo, { credits: 1, status: "confirmed_written_provider_support", unit: "per_symbol" });
  assert.deepEqual(ENDPOINTS.symbol_search,
    { credits: 1, status: "confirmed_written_provider_support", unit: "per_request" });
  assert.equal(PROVIDER_ENTITLEMENT.confirmedOn, "2026-08-27");
  assert.equal(PROVIDER_ENTITLEMENT.trial.privateInternalValidation, true);
  assert.equal(PROVIDER_ENTITLEMENT.trial.publicDisplay, false);
  assert.equal(PROVIDER_ENTITLEMENT.paidPlan, "venture_business");
  assert.equal(PROVIDER_ENTITLEMENT.authenticatedClientDisplay, true);
  assert.equal(PROVIDER_ENTITLEMENT.defaultUsEquitiesDisplayAddOnRequired, false);
  assert.deepEqual(PROVIDER_ENTITLEMENT.restrictions,
    ["no_raw_data_resale", "no_customer_facing_market_data_api", "no_bulk_downloads"]);
  const expectedDays = [
    [{ quote: 6, time_series: 6 }, { quote: 6, time_series: 6 }, 12, 12],
    [{ quote: 18 }, { quote: 18 }, 18, 18],
    [{ time_series: 18 }, { time_series: 18 }, 18, 18],
    [{ symbol_search: 12 }, { symbol_search: 12 }, 12, 12],
    [{ profile: 9, stocks: 9, logo: 9 }, { profile: 90, stocks: 9, logo: 9 }, 27, 108],
    [{ quote: 12, time_series: 12 }, { quote: 12, time_series: 12 }, 24, 24],
    [{ quote: 6, profile: 6, time_series: 6 }, { quote: 6, profile: 60, time_series: 6 }, 18, 72],
    [{ quote: 9, time_series: 9 }, { quote: 9, time_series: 9 }, 18, 18],
    [{ quote: 12 }, { quote: 12 }, 12, 12],
    [{ quote: 6, time_series: 6 }, { quote: 6, time_series: 6 }, 12, 12],
    [{}, {}, 0, 0],
    [{}, {}, 0, 0],
  ];
  DAY_SCHEDULE.forEach((item, index) => {
    const [requests, credits, requestBudget, creditBudget] = expectedDays[index];
    assert.deepEqual(item.requestsByEndpoint, requests);
    assert.deepEqual(item.creditsByEndpoint, credits);
    assert.equal(item.requestBudget, requestBudget);
    assert.equal(item.creditBudget, creditBudget);
    assert.equal(Object.hasOwn(item, "liveBudget"), false);
  });
  assert.equal(DAY_SCHEDULE[10].gate,
    "blocked_until_unresolved_findings_have_an_explicit_reviewed_endpoint_plan");
  assert.deepEqual(TRIAL_BUDGET, { requests: 171, credits: 306,
    currency: { amount: null, status: "blocked_pending_activation_and_billing_terms" } });
  assert.equal(JSON.stringify(PROVIDER_ENTITLEMENT).includes("@"), false,
    "entitlement metadata must not contain personal email addresses");
  assert.deepEqual(BLOCKED_ENDPOINTS, ["ipo_calendar", "income_statement", "balance_sheet", "cash_flow", "statistics"]);
  for (const endpoint of BLOCKED_ENDPOINTS) assert.throws(() => requireAllowedEndpoint(endpoint), /explicitly blocked/);
  assert.throws(() => requireAllowedEndpoint("income_statement"), /explicitly blocked/);
  assert.throws(() => requireAllowedEndpoint("unknown"), /not allowlisted/);

  const dry = parseArgs([]);
  assert.equal(dry.live, false);
  assert.throws(() => parseArgs(["--wat"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--request-budget", "-1"]), /non-negative integer/);
  assert.throws(() => parseArgs(["--outputsize", "0"]), /between 1 and 5000/);
  assert.throws(() => parseArgs(["--outputsize", "5001"]), /between 1 and 5000/);
  const allowedEvidence = path.join(EVIDENCE_ROOT, "test.json");
  assert.throws(() => assertLiveAuthority({ live: true, evidencePath: allowedEvidence }, {}), /acknowledgement/);
  assert.throws(() => assertLiveAuthority({ live: true, evidencePath: allowedEvidence }, { B4_TWELVE_DATA_LIVE_ACK: LIVE_ACK }), /API key/);
  assert.throws(() => assertLiveAuthority({ live: true }, { B4_TWELVE_DATA_LIVE_ACK: LIVE_ACK, TWELVE_DATA_API_KEY: "x" }), /evidence path/);
  assert.throws(() => assertLiveAuthority({ live: true, endpoint: "quote", evidencePath: "/tmp/outside.json" }, {
    B4_TWELVE_DATA_LIVE_ACK: LIVE_ACK, TWELVE_DATA_API_KEY: "x",
  }), /must stay inside/);
  assert.doesNotThrow(() => assertLiveAuthority({ live: true, endpoint: "logo", evidencePath: allowedEvidence }, {
    B4_TWELVE_DATA_LIVE_ACK: LIVE_ACK, TWELVE_DATA_API_KEY: "x",
  }));

  let calls = 0;
  const evidence = await runHarness({ ...dry, endpoint: "quote", symbol: "aapl", requestBudget: 1, creditBudget: 1 }, {
    transport: async () => { calls += 1; return { status: 200, data: { symbol: "AAPL", close: "1" } }; }, env: {},
  });
  assert.equal(calls, 1);
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.mode, "stub");
  assert.equal(evidence.symbol, "AAPL");
  assert.equal(evidence.outcome, "success");
  assert.deepEqual(evidence.budget, { requestBudget: 1, creditBudget: 1, requests: 1, estimatedCredits: 1 });
  assert.equal(evidence.rawPayloadStored, false);
  assert.deepEqual(evidence.creditWeight, { credits: 1, status: "confirmed_public_docs", unit: "per_symbol" });
  assert.deepEqual(evidence.responseContract, { valid: true, missing: [] });
  assert.deepEqual(evidence.provenance, { provider: "TwelveData", endpoint: "quote" });
  assert.deepEqual(evidence.requestParameters, {});

  calls = 0;
  await rejects(() => runHarness({ ...dry, endpoint: "quote", symbol: "AAPL", requestBudget: 0, creditBudget: 1 }, {
    transport: async () => { calls += 1; return { status: 200, data: {} }; }, env: {},
  }), /Request budget exceeded/);
  assert.equal(calls, 0, "budget refusal must occur before transport");

  const profileBudget = createBudget({ requestBudget: 3, creditBudget: 12 });
  for (const endpoint of ["profile", "stocks", "logo"]) profileBudget.reserve(endpoint);
  assert.deepEqual(profileBudget.snapshot(), { requestBudget: 3, creditBudget: 12, requests: 3, estimatedCredits: 12 });
  assert.throws(() => profileBudget.reserve("logo"), /Request budget exceeded/);

  calls = 0;
  await rejects(() => runHarness({ ...dry, endpoint: "profile", symbol: "AAPL", requestBudget: 1, creditBudget: 9 }, {
    transport: async () => { calls += 1; return { status: 200, data: {} }; }, env: {},
  }), /Credit budget exceeded/);
  assert.equal(calls, 0, "profile credit refusal must occur before transport");
  const profileEvidence = await runHarness({ ...dry, endpoint: "profile", symbol: "AAPL",
    requestBudget: 1, creditBudget: 10 }, { env: {} });
  assert.equal(profileEvidence.budget.estimatedCredits, 10);
  assert.deepEqual(profileEvidence.creditWeight,
    { credits: 10, status: "confirmed_written_provider_support", unit: "per_symbol" });

  calls = 0;
  const limited = await runHarness({ ...dry, endpoint: "time_series", symbol: "AAPL", simulate429: true,
    requestBudget: 1, creditBudget: 1 }, { transport: async () => { calls += 1; return { status: 200, data: {} }; }, env: {} });
  assert.equal(calls, 0, "simulated 429 must not invoke transport");
  assert.equal(limited.outcome, "rate_limited");
  assert.equal(limited.httpStatus, 429);
  assert.equal(limited.providerCode, 429);

  const providerError = await runHarness({ ...dry, endpoint: "quote", symbol: "AAPL", requestBudget: 1, creditBudget: 1 }, {
    transport: async () => ({ status: 200, data: { status: "error", code: 400, message: "Synthetic provider error" } }), env: {},
  });
  assert.equal(providerError.outcome, "provider_error");

  for (const endpoint of Object.keys(ENDPOINTS)) {
    const fixtureEvidence = await runHarness({ ...dry, endpoint, symbol: "AAPL", requestBudget: 1,
      creditBudget: ENDPOINTS[endpoint].credits }, { env: {} });
    assert.equal(fixtureEvidence.responseContract.valid, true, `${endpoint} fixture must satisfy its minimum contract`);
  }

  const malformed = await runHarness({ ...dry, endpoint: "time_series", symbol: "AAPL", requestBudget: 1, creditBudget: 1 }, {
    transport: async () => ({ status: 200, data: { meta: {}, values: "not-an-array" } }), env: {},
  });
  assert.equal(malformed.responseContract.valid, false);
  assert.deepEqual(malformed.responseContract.missing, ["values[array]"]);
  await rejects(() => runHarness({ ...dry, endpoint: "time_series", symbol: "AAPL", interval: "1min",
    requestBudget: 1, creditBudget: 1 }, { env: {} }), /interval is not approved/);

  process.env.TWELVE_DATA_API_KEY = "super-secret-key";
  const clean = redact({ authorization: "apikey super-secret-key", nested: { apiKey: "super-secret-key" }, message: "x super-secret-key y" });
  assert.deepEqual(clean, { authorization: "[REDACTED]", nested: { apiKey: "[REDACTED]" }, message: "x [REDACTED] y" });
  delete process.env.TWELVE_DATA_API_KEY;

  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const directory = fs.mkdtempSync(path.join(EVIDENCE_ROOT, "test-"));
  const file = path.join(directory, "evidence.json");
  writeEvidence(file, evidence);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(EVIDENCE_ROOT).mode & 0o777, 0o700);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), evidence);
  fs.chmodSync(directory, 0o755);
  fs.chmodSync(file, 0o644);
  const originalOpenSync = fs.openSync;
  let evidenceOpenFlags = null;
  fs.openSync = (target, flags, ...rest) => {
    if (target === file) evidenceOpenFlags = flags;
    return originalOpenSync(target, flags, ...rest);
  };
  try {
    writeEvidence(file, evidence);
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert.ok(evidenceOpenFlags & fs.constants.O_NOFOLLOW, "evidence files must be opened with O_NOFOLLOW");
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.rmSync(directory, { recursive: true, force: true });
  assert.throws(() => resolveEvidencePath(path.resolve(EVIDENCE_ROOT, "../escape.json")), /must stay inside/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "azalens-b4-outside-"));
  const link = path.join(EVIDENCE_ROOT, "outside-link");
  fs.rmSync(link, { force: true });
  fs.symlinkSync(outside, link, "dir");
  assert.throws(() => writeEvidence(path.join(link, "escape.json"), evidence), /real directories|resolves outside/);
  fs.rmSync(link, { force: true });
  fs.rmSync(outside, { recursive: true, force: true });

  const outsideFileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "azalens-b4-file-outside-"));
  const outsideFile = path.join(outsideFileDirectory, "outside.json");
  fs.writeFileSync(outsideFile, "unchanged\n", { mode: 0o600 });
  const fileLink = path.join(EVIDENCE_ROOT, "outside-file-link.json");
  fs.rmSync(fileLink, { force: true });
  fs.symlinkSync(outsideFile, fileLink, "file");
  assert.throws(() => writeEvidence(fileLink, evidence), /regular file, not a symbolic link/);
  assert.equal(fs.readFileSync(outsideFile, "utf8"), "unchanged\n");
  fs.rmSync(fileLink, { force: true });
  fs.rmSync(outsideFileDirectory, { recursive: true, force: true });

  const nonRegularTarget = path.join(EVIDENCE_ROOT, "non-regular-target");
  fs.mkdirSync(nonRegularTarget, { mode: 0o700 });
  assert.throws(() => writeEvidence(nonRegularTarget, evidence), /regular file/);
  fs.rmSync(nonRegularTarget, { recursive: true, force: true });

  const postOpenProbe = path.join(EVIDENCE_ROOT, "post-open-regular-file-probe.json");
  const originalProbeOpenSync = fs.openSync;
  const originalProbeFstatSync = fs.fstatSync;
  let probeDescriptor = null;
  let substitutedProbeStatus = false;
  fs.openSync = (target, flags, ...rest) => {
    const descriptor = originalProbeOpenSync(target, flags, ...rest);
    if (target === postOpenProbe) probeDescriptor = descriptor;
    return descriptor;
  };
  fs.fstatSync = (descriptor, ...rest) => {
    if (descriptor === probeDescriptor && !substitutedProbeStatus) {
      substitutedProbeStatus = true;
      return { isFile: () => false };
    }
    return originalProbeFstatSync(descriptor, ...rest);
  };
  try {
    assert.throws(() => writeEvidence(postOpenProbe, evidence), /must remain a regular file/);
  } finally {
    fs.openSync = originalProbeOpenSync;
    fs.fstatSync = originalProbeFstatSync;
    fs.rmSync(postOpenProbe, { force: true });
  }
  assert.equal(substitutedProbeStatus, true);

  const insideLinkTarget = fs.mkdtempSync(path.join(EVIDENCE_ROOT, "inside-target-"));
  const insideDirectoryLink = path.join(EVIDENCE_ROOT, "inside-directory-link");
  fs.rmSync(insideDirectoryLink, { force: true });
  fs.symlinkSync(insideLinkTarget, insideDirectoryLink, "dir");
  assert.throws(() => writeEvidence(path.join(insideDirectoryLink, "evidence.json"), evidence), /real directories/);
  fs.rmSync(insideDirectoryLink, { force: true });
  fs.rmSync(insideLinkTarget, { recursive: true, force: true });

  console.log("Twelve Data private trial harness contract: PASS");
  console.log("Provider calls: 0; provider credits: 0");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
