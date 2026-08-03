"use strict";

const {
  getEnvironmentConfig,
} = require("../config/environment");
const {
  validateSupabaseEnvironment,
} = require("../config/supabaseEnvironment");

const REQUIRED_BY_ENVIRONMENT = {
  development: [],
  test: [],
  staging: [
    "FINNHUB_API_KEY",
    "TWELVE_DATA_API_KEY",
    "OBSERVABILITY_METRICS_TOKEN",
  ],
  production: [
    "FINNHUB_API_KEY",
    "TWELVE_DATA_API_KEY",
    "OBSERVABILITY_METRICS_TOKEN",
  ],
};

function validateEnvironment(env = process.env) {
  const config = getEnvironmentConfig(env);
  const missing = REQUIRED_BY_ENVIRONMENT[
    config.environment
  ].filter((key) => !String(env[key] || "").trim());
  const errors = [];

  if (missing.length > 0) {
    errors.push(
      `Missing required ${config.environment} secrets: ${missing.join(", ")}.`
    );
  }

  if (
    config.featureFlags.liveShariah &&
    String(env.SHARIAH_DATA_MODE || "").toLowerCase() !==
      "live"
  ) {
    errors.push(
      "FEATURE_LIVE_SHARIAH_ENABLED requires SHARIAH_DATA_MODE=live."
    );
  }

  const closedDemoEnabled = ["1", "true", "yes", "on"].includes(
    String(env.CLOSED_DEMO_ENABLED || "").trim().toLowerCase()
  );

  if (
    closedDemoEnabled &&
    String(env.CLOSED_DEMO_ACCESS_CODE || "").trim().length < 8
  ) {
    errors.push(
      "CLOSED_DEMO_ENABLED requires CLOSED_DEMO_ACCESS_CODE with at least 8 characters."
    );
  }

  if (
    closedDemoEnabled &&
    String(env.CLOSED_DEMO_SIGNING_SECRET || "").trim().length < 32
  ) {
    errors.push(
      "CLOSED_DEMO_ENABLED requires CLOSED_DEMO_SIGNING_SECRET with at least 32 characters."
    );
  }

  if (
    config.featureFlags.liveShariah &&
    !String(env.HALAL_TERMINAL_API_KEY || "").trim()
  ) {
    errors.push(
      "FEATURE_LIVE_SHARIAH_ENABLED requires HALAL_TERMINAL_API_KEY."
    );
  }

  // Supabase rules live in config/supabaseEnvironment.js. They are additive:
  // provider keys keep exactly the optionality they already had.
  errors.push(
    ...validateSupabaseEnvironment(config.environment, env)
  );

  return {
    valid: errors.length === 0,
    environment: config.environment,
    releaseVersion: config.releaseVersion,
    featureFlags: config.featureFlags,
    missing,
    errors,
  };
}

/*
  Startup guard.

  Called by server.js before any service is constructed, so a misconfigured
  deployment fails immediately and loudly instead of booting and failing on
  the first request that happens to need the missing value. The message lists
  every problem at once - fixing them one restart at a time is miserable.

  No value is printed. Only variable names and structural reasons appear, so a
  crash log can never leak a key.
*/
function assertEnvironmentValid(env = process.env) {
  const result = validateEnvironment(env);

  if (!result.valid) {
    const detail = result.errors.map((line) => `  - ${line}`).join("\n");
    throw new Error(
      `Environment validation failed for "${result.environment}":\n${detail}\n\n` +
        "The server will not start. Fix the environment and try again."
    );
  }

  return result;
}

function main() {
  const result = validateEnvironment();
  console.log(JSON.stringify(result, null, 2));

  if (!result.valid) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_BY_ENVIRONMENT,
  assertEnvironmentValid,
  validateEnvironment,
};
