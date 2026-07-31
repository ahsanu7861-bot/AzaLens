"use strict";

const {
  getEnvironmentConfig,
} = require("../config/environment");

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

  return {
    valid: errors.length === 0,
    environment: config.environment,
    releaseVersion: config.releaseVersion,
    featureFlags: config.featureFlags,
    missing,
    errors,
  };
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
  validateEnvironment,
};
