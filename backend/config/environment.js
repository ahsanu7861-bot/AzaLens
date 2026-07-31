"use strict";

const {
  getReleaseVersion,
} = require("./releaseVersion");

const ENVIRONMENTS = new Set([
  "development",
  "test",
  "staging",
  "production",
]);

function normalizeEnvironment(value) {
  const environment = String(
    value || "development"
  )
    .trim()
    .toLowerCase();

  if (!ENVIRONMENTS.has(environment)) {
    throw new Error(
      `APP_ENV must be one of: ${[
        ...ENVIRONMENTS,
      ].join(", ")}.`
    );
  }

  return environment;
}

function parseFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid feature-flag value: ${value}`);
}

function getEnvironmentConfig(env = process.env) {
  const environment = normalizeEnvironment(
    env.APP_ENV || env.NODE_ENV
  );

  return {
    environment,
    isProduction: environment === "production",
    isStaging: environment === "staging",
    releaseVersion: getReleaseVersion(env),
    featureFlags: {
      scanner: parseFlag(env.FEATURE_SCANNER_ENABLED),
      portfolioPro: parseFlag(
        env.FEATURE_PORTFOLIO_PRO_ENABLED
      ),
      liveShariah: parseFlag(
        env.FEATURE_LIVE_SHARIAH_ENABLED
      ),
    },
  };
}

module.exports = {
  ENVIRONMENTS,
  getEnvironmentConfig,
  normalizeEnvironment,
  parseFlag,
};
