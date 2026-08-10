"use strict";

/*
  AzaLens - synthetic Shariah fixture contract.

  The committed fixtures in backend/fixtures/shariah are entirely invented. They
  exist so tests, local development and internal demonstrations can exercise every
  materially different screening state without contacting the screening provider,
  spending its quota, or storing anything provider-derived.

  These tests hold four properties:

    1. Every fixture normalizes to the state the current contract already defines.
    2. Fixture data is deterministic and unmistakably synthetic.
    3. Not one network request is made while reading them.
    4. Fixtures cannot leak into production: fixture mode is opt-in, a missing or
       malformed fixture fails closed, and no production module imports them.
*/

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures", "shariah");

const EXPECTED = {
  ZZCOMPLIANT: { success: true, overallStatus: "COMPLIANT", isCompliant: true },
  ZZNONCOMPBUS: { success: true, overallStatus: "NON_COMPLIANT", isCompliant: false },
  ZZNONCOMPFIN: { success: true, overallStatus: "NON_COMPLIANT", isCompliant: false },
  ZZUNKNOWN: { success: true, overallStatus: "UNKNOWN", isCompliant: null },
  ZZPROVIDERERROR: { success: false, overallStatus: "UNKNOWN", isCompliant: null }
};

/*
 * Any outbound request during these tests is a failure, not a slow test. The
 * counters are installed before the provider module is loaded so nothing can
 * escape underneath them.
 */
let networkCalls = 0;
const realHttpRequest = http.request;
const realHttpsRequest = https.request;
const realHttpGet = http.get;
const realHttpsGet = https.get;

function trap(name) {
  return function blocked() {
    networkCalls += 1;
    throw new Error(`Synthetic fixture test attempted a live ${name} call.`);
  };
}

http.request = trap("http.request");
https.request = trap("https.request");
http.get = trap("http.get");
https.get = trap("https.get");

const originalFetch = global.fetch;
global.fetch = function blockedFetch() {
  networkCalls += 1;
  throw new Error("Synthetic fixture test attempted a live fetch call.");
};

function restoreNetwork() {
  http.request = realHttpRequest;
  https.request = realHttpsRequest;
  http.get = realHttpGet;
  https.get = realHttpsGet;
  global.fetch = originalFetch;
}

function withFixtureMode(run) {
  const saved = {
    SHARIAH_DATA_MODE: process.env.SHARIAH_DATA_MODE,
    SHARIAH_FIXTURE_DIRECTORY: process.env.SHARIAH_FIXTURE_DIRECTORY,
    HALAL_TERMINAL_LIVE_ENABLED: process.env.HALAL_TERMINAL_LIVE_ENABLED
  };

  process.env.SHARIAH_DATA_MODE = "fixture";
  process.env.SHARIAH_FIXTURE_DIRECTORY = FIXTURE_DIR;
  process.env.HALAL_TERMINAL_LIVE_ENABLED = "false";

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

// ---------------------------------------------------------------------------

function testFixturesAreSyntheticAndDeterministic() {
  const files = fs
    .readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();

  assert.deepEqual(
    files,
    Object.keys(EXPECTED).sort().map((symbol) => `${symbol}.json`),
    "committed fixture set must match the documented scenarios exactly"
  );

  for (const file of files) {
    const filePath = path.join(FIXTURE_DIR, file);
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(text);

    // Deterministic: parsing the same bytes twice yields identical structures,
    // and nothing time-, random- or environment-derived is present.
    assert.deepEqual(parsed, JSON.parse(text), `${file} must parse deterministically`);
    assert.doesNotMatch(
      text,
      /\b(20[0-9]{2}-[0-9]{2}-[0-9]{2}T|Date\.now|Math\.random)\b/,
      `${file} must not embed a timestamp or generated value`
    );

    // Unmistakably synthetic.
    assert.match(parsed.symbol, /^ZZ[A-Z]+$/, `${file} symbol must use the ZZ synthetic prefix`);
    assert.match(
      parsed.name,
      /SYNTHETIC TEST DATA - NOT A REAL COMPANY/,
      `${file} company name must be labelled synthetic`
    );
    assert.equal(parsed.country, "Nowhere", `${file} must use a non-existent country`);
    assert.match(parsed.website, /^https:\/\/example\.invalid\//, `${file} must use a reserved invalid domain`);
    assert.match(
      parsed.disclaimers.join(" "),
      /Synthetic AzaLens test fixture/,
      `${file} must carry the synthetic disclaimer`
    );

    // No credential-shaped or provider-identifying secret material.
    assert.doesNotMatch(
      text,
      /(api[_-]?key|secret|bearer|authorization|token"\s*:|sb_secret_|password)/i,
      `${file} must contain no credential-shaped value`
    );
  }
}

async function testEachFixtureMatchesTheContract() {
  await withFixtureMode(async () => {
    const { fetchScreening } = require("../providers/halalTerminalProvider");

    for (const [symbol, expected] of Object.entries(EXPECTED)) {
      const result = await fetchScreening(symbol);

      assert.equal(result.success, expected.success, `${symbol} success`);
      assert.equal(
        result.screening.overallStatus,
        expected.overallStatus,
        `${symbol} overallStatus`
      );
      assert.equal(
        result.screening.isCompliant,
        expected.isCompliant,
        `${symbol} isCompliant`
      );

      // Fixture provenance is always visible - a fixture can never be mistaken
      // for a live screening result.
      assert.equal(result.provider.id, "halal_terminal_fixture", `${symbol} provider id`);
      assert.equal(result.metadata.fixture, true, `${symbol} fixture flag`);
      assert.equal(result.metadata.dataMode, "fixture", `${symbol} dataMode`);
    }

    // Determinism: the same symbol read twice yields the same screening result.
    const first = await fetchScreening("ZZCOMPLIANT");
    const second = await fetchScreening("ZZCOMPLIANT");
    assert.deepEqual(first.screening, second.screening, "repeat reads must agree");
    assert.deepEqual(first.company, second.company);
  });
}

async function testBusinessAndFinancialRefusalsAreDistinct() {
  await withFixtureMode(async () => {
    const { fetchScreening } = require("../providers/halalTerminalProvider");

    const business = await fetchScreening("ZZNONCOMPBUS");
    assert.equal(business.screening.businessScreen.passed, false);
    assert.equal(business.screening.financialScreen.passed, true);

    const financial = await fetchScreening("ZZNONCOMPFIN");
    assert.equal(financial.screening.businessScreen.passed, true);
    assert.equal(financial.screening.financialScreen.passed, false);

    // Both refuse, but for reasons the contract keeps separable.
    assert.equal(business.screening.overallStatus, "NON_COMPLIANT");
    assert.equal(financial.screening.overallStatus, "NON_COMPLIANT");
  });
}

async function testMissingAndMalformedFixturesFailClosed() {
  await withFixtureMode(async () => {
    const { fetchScreening } = require("../providers/halalTerminalProvider");

    // Missing fixture: never a permissive verdict.
    const missing = await fetchScreening("ZZNOSUCHFIXTURE");
    assert.equal(missing.success, false);
    assert.equal(missing.error.code, "SHARIAH_FIXTURE_NOT_FOUND");
    assert.notEqual(missing.screening?.overallStatus, "COMPLIANT");
  });

  // Malformed fixture: written to a temporary directory so no broken JSON is
  // ever committed to the repository.
  const tempDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "azalens-fixture-"));
  try {
    fs.writeFileSync(path.join(tempDir, "ZZBROKEN.json"), "{ not valid json", "utf8");

    const saved = process.env.SHARIAH_FIXTURE_DIRECTORY;
    process.env.SHARIAH_DATA_MODE = "fixture";
    process.env.SHARIAH_FIXTURE_DIRECTORY = tempDir;

    const { fetchScreening } = require("../providers/halalTerminalProvider");
    const malformed = await fetchScreening("ZZBROKEN");

    assert.equal(malformed.success, false);
    assert.equal(malformed.error.code, "SHARIAH_FIXTURE_INVALID");
    assert.notEqual(malformed.screening?.overallStatus, "COMPLIANT");

    if (saved === undefined) delete process.env.SHARIAH_FIXTURE_DIRECTORY;
    else process.env.SHARIAH_FIXTURE_DIRECTORY = saved;
    delete process.env.SHARIAH_DATA_MODE;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testFixturesAreNeverUsedOutsideFixtureMode() {
  const saved = {
    SHARIAH_DATA_MODE: process.env.SHARIAH_DATA_MODE,
    SHARIAH_FIXTURE_DIRECTORY: process.env.SHARIAH_FIXTURE_DIRECTORY,
    HALAL_TERMINAL_LIVE_ENABLED: process.env.HALAL_TERMINAL_LIVE_ENABLED
  };

  try {
    const { fetchScreening } = require("../providers/halalTerminalProvider");

    // Offline (the default when SHARIAH_DATA_MODE is unset) must refuse, not
    // silently fall back to a committed fixture that exists on disk.
    delete process.env.SHARIAH_DATA_MODE;
    process.env.SHARIAH_FIXTURE_DIRECTORY = FIXTURE_DIR;
    process.env.HALAL_TERMINAL_LIVE_ENABLED = "false";

    const offline = await fetchScreening("ZZCOMPLIANT");
    assert.equal(offline.success, false, "offline mode must not serve a fixture");
    assert.equal(offline.error.code, "SHARIAH_LIVE_API_DISABLED");
    assert.notEqual(offline.screening?.overallStatus, "COMPLIANT");

    // An invalid mode string must also refuse rather than degrade to fixtures.
    process.env.SHARIAH_DATA_MODE = "fixtures";
    const invalidMode = await fetchScreening("ZZCOMPLIANT");
    assert.equal(invalidMode.success, false);
    assert.equal(invalidMode.error.code, "SHARIAH_DATA_MODE_INVALID");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function testNoProductionModuleImportsFixtures() {
  const productionDirs = ["services", "providers", "routes", "analysis", "config", "middleware", "utils"];
  const offenders = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        const text = fs.readFileSync(full, "utf8");
        // A production module may compute the fixture directory path (that is
        // how opt-in fixture mode works). It must never require a fixture file.
        if (/require\([^)]*fixtures\/shariah/.test(text)) offenders.push(full);
      }
    }
  }

  productionDirs.forEach((dir) => walk(path.resolve(__dirname, "..", dir)));

  assert.deepEqual(offenders, [], "no production module may import a fixture file");
}

async function run() {
  try {
    testFixturesAreSyntheticAndDeterministic();
    await testEachFixtureMatchesTheContract();
    await testBusinessAndFinancialRefusalsAreDistinct();
    await testMissingAndMalformedFixturesFailClosed();
    await testFixturesAreNeverUsedOutsideFixtureMode();
    testNoProductionModuleImportsFixtures();

    assert.equal(networkCalls, 0, "synthetic fixture tests must make no network calls");

    console.log(
      "Synthetic Shariah fixture tests passed: 5 scenarios, fail-closed gaps, zero network calls."
    );
  } finally {
    restoreNetwork();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Synthetic Shariah fixture test failed:", error);
    process.exitCode = 1;
  });
}

module.exports = { run };
