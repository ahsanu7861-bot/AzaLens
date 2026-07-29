const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");

const {
  fetchScreening,
} = require("../providers/halalTerminalProvider");
const {
  clearAllCache,
} = require("../utils/cache");
const {
  getEstimatedBudgetSnapshot,
  readLedger,
} = require("../utils/halalTerminalBudget");

const ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "SHARIAH_DATA_MODE",
  "SHARIAH_FIXTURE_DIRECTORY",
  "HALAL_TERMINAL_API_KEY",
  "HALAL_TERMINAL_ALLOW_LIVE_IN_DEV",
  "HALAL_TERMINAL_LIVE_ENABLED",
  "HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET",
  "HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST",
  "HALAL_TERMINAL_USAGE_LEDGER_PATH",
];

function preserveEnvironment() {
  return ENVIRONMENT_KEYS.reduce((snapshot, key) => {
    snapshot[key] = process.env[key];
    return snapshot;
  }, {});
}

function restoreEnvironment(snapshot) {
  ENVIRONMENT_KEYS.forEach((key) => {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  });
}

function setSafeTestEnvironment(temporaryDirectory) {
  process.env.NODE_ENV = "test";
  process.env.SHARIAH_FIXTURE_DIRECTORY = path.join(
    temporaryDirectory,
    "fixtures"
  );
  process.env.HALAL_TERMINAL_USAGE_LEDGER_PATH = path.join(
    temporaryDirectory,
    "usage.json"
  );
  process.env.HALAL_TERMINAL_API_KEY = "test-key-never-sent";
  process.env.HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST = "10";
}

function buildFixture(symbol) {
  return {
    symbol,
    canonical_symbol: symbol,
    name: "Development Fixture Company",
    asset_type: "Equity",
    is_compliant: true,
    shariah_compliance_status: "COMPLIANT",
    compliance_explanation:
      "Synthetic fixture used only to test the offline data path.",
    by_methodology: {
      AAOIFI: {
        is_compliant: true,
        verified: false,
        disposition: "development_fixture",
      },
    },
  };
}

async function run() {
  const environmentSnapshot = preserveEnvironment();
  const originalAxiosPost = axios.post;
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "azalens-shariah-safety-")
  );
  let networkCalls = 0;

  try {
    clearAllCache();
    setSafeTestEnvironment(temporaryDirectory);

    axios.post = async (_url, _body, options) => {
      networkCalls += 1;

      return {
        data: buildFixture(
          options?.headers?.["X-Test-Symbol"] || "LIVE1"
        ),
      };
    };

    process.env.SHARIAH_DATA_MODE = "offline";
    process.env.HALAL_TERMINAL_LIVE_ENABLED = "true";
    process.env.HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET = "500";

    const offlineResult = await fetchScreening("OFFLINE1");
    assert.strictEqual(offlineResult.success, false);
    assert.strictEqual(
      offlineResult.error.code,
      "SHARIAH_LIVE_API_DISABLED"
    );
    assert.strictEqual(networkCalls, 0);

    const fixtureDirectory =
      process.env.SHARIAH_FIXTURE_DIRECTORY;
    fs.mkdirSync(fixtureDirectory, {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fixtureDirectory, "FIXTURE1.json"),
      `${JSON.stringify(buildFixture("FIXTURE1"), null, 2)}\n`,
      "utf8"
    );

    process.env.SHARIAH_DATA_MODE = "fixture";

    const fixtureResult = await fetchScreening("FIXTURE1");
    assert.strictEqual(fixtureResult.success, true);
    assert.strictEqual(
      fixtureResult.provider.id,
      "halal_terminal_fixture"
    );
    assert.strictEqual(fixtureResult.metadata.fixture, true);
    assert.strictEqual(networkCalls, 0);

    process.env.SHARIAH_DATA_MODE = "live";
    process.env.HALAL_TERMINAL_LIVE_ENABLED = "false";

    const optInResult = await fetchScreening("LIVELOCK1");
    assert.strictEqual(optInResult.success, false);
    assert.strictEqual(
      optInResult.error.code,
      "HALAL_TERMINAL_LIVE_OPT_IN_REQUIRED"
    );
    assert.strictEqual(networkCalls, 0);

    process.env.HALAL_TERMINAL_LIVE_ENABLED = "true";
    delete process.env.HALAL_TERMINAL_ALLOW_LIVE_IN_DEV;
    process.env.HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET = "10";

    const developmentGuardResult =
      await fetchScreening("DEVGUARD1");
    assert.strictEqual(developmentGuardResult.success, false);
    assert.strictEqual(
      developmentGuardResult.error.code,
      "HALAL_TERMINAL_LIVE_OPT_IN_REQUIRED"
    );
    assert.strictEqual(networkCalls, 0);

    process.env.HALAL_TERMINAL_ALLOW_LIVE_IN_DEV = "true";
    process.env.HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET = "0";

    const zeroBudgetResult = await fetchScreening("BUDGET0");
    assert.strictEqual(zeroBudgetResult.success, false);
    assert.strictEqual(
      zeroBudgetResult.error.code,
      "HALAL_TERMINAL_BUDGET_DISABLED"
    );
    assert.strictEqual(networkCalls, 0);

    process.env.HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET = "10";

    const ledgerLockPath =
      `${process.env.HALAL_TERMINAL_USAGE_LEDGER_PATH}.lock`;
    fs.writeFileSync(ledgerLockPath, "another-process\n", "utf8");

    const lockedLedgerResult = await fetchScreening("LOCKED1");
    assert.strictEqual(lockedLedgerResult.success, false);
    assert.strictEqual(
      lockedLedgerResult.error.code,
      "HALAL_TERMINAL_LEDGER_BUSY"
    );
    assert.strictEqual(networkCalls, 0);
    fs.unlinkSync(ledgerLockPath);

    const liveResult = await fetchScreening("LIVE1");
    assert.strictEqual(liveResult.success, true);
    assert.strictEqual(networkCalls, 1);
    assert.strictEqual(
      liveResult.metadata.costProtection.estimatedTokensUsed,
      10
    );

    const cachedLiveResult = await fetchScreening("LIVE1");
    assert.strictEqual(cachedLiveResult.success, true);
    assert.strictEqual(cachedLiveResult.metadata.fromCache, true);
    assert.strictEqual(networkCalls, 1);

    const { ledger, error } = readLedger(
      process.env.HALAL_TERMINAL_USAGE_LEDGER_PATH
    );
    assert.strictEqual(error, null);

    const month = new Date().toISOString().slice(0, 7);
    assert.strictEqual(
      ledger.months[month].estimatedTokensUsed,
      10
    );

    const budgetSnapshot =
      getEstimatedBudgetSnapshot(
        {
          monthlyTokenBudget: 500,
          usageLedgerPath:
            process.env
              .HALAL_TERMINAL_USAGE_LEDGER_PATH,
        },
        new Date(`${month}-15T12:00:00.000Z`)
      );

    assert.deepStrictEqual(
      budgetSnapshot,
      {
        source: "local-estimate",
        month,
        configuredMonthlyBudget: 500,
        ledgerStorage: "local-filesystem",
        ledgerPersistence: "not-guaranteed",
        available: true,
        locallyEstimatedUsed: 10,
        locallyEstimatedRemaining: 490,
        locallyRecordedRequests: 1,
      }
    );
    assert.strictEqual(ledger.months[month].requests, 1);

    const exhaustedResult = await fetchScreening("LIVE2");
    assert.strictEqual(exhaustedResult.success, false);
    assert.strictEqual(
      exhaustedResult.error.code,
      "HALAL_TERMINAL_MONTHLY_BUDGET_EXCEEDED"
    );
    assert.strictEqual(networkCalls, 1);

    console.log(
      "Shariah cost-safety tests passed with zero real API calls."
    );
  } finally {
    axios.post = originalAxiosPost;
    restoreEnvironment(environmentSnapshot);
    clearAllCache();
    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
