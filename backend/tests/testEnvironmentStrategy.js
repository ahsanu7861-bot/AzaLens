"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const {
  getEnvironmentConfig,
  parseFlag,
} = require("../config/environment");
const {
  validateEnvironment,
} = require("../scripts/validateEnvironment");
const {
  inspectMigrations,
} = require("../scripts/checkMigrations");
const {
  createManifest,
} = require("../scripts/createReleaseManifest");

assert.equal(parseFlag("on"), true);
assert.equal(parseFlag("false"), false);
assert.throws(() => parseFlag("sometimes"));

const defaults = getEnvironmentConfig({
  NODE_ENV: "test",
});
assert.equal(defaults.environment, "test");
assert.deepEqual(defaults.featureFlags, {
  scanner: false,
  portfolioPro: false,
  liveShariah: false,
});

const production = validateEnvironment({
  APP_ENV: "production",
  FINNHUB_API_KEY: "x",
  TWELVE_DATA_API_KEY: "x",
  OBSERVABILITY_METRICS_TOKEN: "x",
});
assert.equal(production.valid, true);
assert.equal(
  validateEnvironment({ APP_ENV: "production" }).valid,
  false
);
assert.equal(
  validateEnvironment({
    APP_ENV: "staging",
    FINNHUB_API_KEY: "x",
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
    FEATURE_LIVE_SHARIAH_ENABLED: "true",
  }).valid,
  false
);

const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "azalens-release-")
);
const migrations = path.join(temp, "migrations");
fs.mkdirSync(migrations);
fs.writeFileSync(
  path.join(migrations, "20260727010000_create_users.sql"),
  "-- up\n"
);
assert.equal(inspectMigrations(migrations).valid, true);
fs.writeFileSync(path.join(migrations, "bad.sql"), "-- bad\n");
assert.equal(inspectMigrations(migrations).valid, false);

const artifact = path.join(temp, "backend.tgz");
fs.writeFileSync(artifact, "deterministic artifact");
const manifest = createManifest({
  commit: "abc123",
  version: "1.2.3",
  artifacts: [artifact],
  createdAt: "2026-07-27T00:00:00.000Z",
});
assert.equal(manifest.commit, "abc123");
assert.equal(manifest.artifacts[0].bytes, 22);
assert.match(manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);

fs.rmSync(temp, { recursive: true, force: true });
console.log("Environment, migration, and release artifact contracts passed.");
