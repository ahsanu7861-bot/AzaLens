const path = require("path");

// ============================================================
// AzaLens - Shariah Runtime Configuration
// Safe by default: no paid provider request is allowed unless
// live mode, explicit opt-in, and a positive monthly budget agree.
// ============================================================

const DATA_MODES = Object.freeze({
  OFFLINE: "offline",
  FIXTURE: "fixture",
  CACHE_ONLY: "cache-only",
  LIVE: "live",
});

const VALID_DATA_MODES = new Set(Object.values(DATA_MODES));
const DEFAULT_ESTIMATED_TOKENS_PER_REQUEST = 10;
const DEFAULT_SHARIAH_CACHE_MINUTES = 1440;

function parseBoolean(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePath(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return path.resolve(value.trim());
  }

  return fallback;
}

function getShariahRuntimeConfig(env = process.env) {
  const requestedMode =
    typeof env.SHARIAH_DATA_MODE === "string"
      ? env.SHARIAH_DATA_MODE.trim().toLowerCase()
      : "";

  const dataMode = VALID_DATA_MODES.has(requestedMode)
    ? requestedMode
    : DATA_MODES.OFFLINE;
  const liveApiRequested = parseBoolean(
    env.HALAL_TERMINAL_LIVE_ENABLED,
    false
  );
  const isProduction = env.NODE_ENV === "production";
  const liveInDevelopmentAllowed = parseBoolean(
    env.HALAL_TERMINAL_ALLOW_LIVE_IN_DEV,
    false
  );

  return {
    dataMode,
    requestedMode: requestedMode || null,
    invalidMode:
      Boolean(requestedMode) && !VALID_DATA_MODES.has(requestedMode),
    liveApiEnabled:
      liveApiRequested &&
      (isProduction || liveInDevelopmentAllowed),
    monthlyTokenBudget: parseNonNegativeInteger(
      env.HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET,
      0
    ),
    estimatedTokensPerRequest: parsePositiveInteger(
      env.HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST,
      DEFAULT_ESTIMATED_TOKENS_PER_REQUEST
    ),
    fixtureDirectory: resolvePath(
      env.SHARIAH_FIXTURE_DIRECTORY,
      path.resolve(__dirname, "..", "fixtures", "shariah")
    ),
    usageLedgerPath: resolvePath(
      env.HALAL_TERMINAL_USAGE_LEDGER_PATH,
      path.resolve(
        __dirname,
        "..",
        "storage",
        "halal-terminal-usage.json"
      )
    ),
  };
}

module.exports = {
  DATA_MODES,
  DEFAULT_SHARIAH_CACHE_MINUTES,
  getShariahRuntimeConfig,
  parseBoolean,
  parseNonNegativeInteger,
  parsePositiveInteger,
};
