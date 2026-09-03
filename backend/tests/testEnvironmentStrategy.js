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

// Slice 2 added mandatory Supabase configuration for staging and production.
// These fixtures gained those three variables; the provider-key expectations
// below are unchanged. Structurally valid, obviously fake, not credentials.
const SUPABASE_PRODUCTION = {
  SUPABASE_URL: "https://jexphwidcfbgxpthgwum.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_notarealkey000000000",
  SUPABASE_SECRET_KEY: "sb_secret_notarealkey000000000",
};

const SUPABASE_STAGING = {
  SUPABASE_URL: "https://xhxlgalaytuqdnmmwypv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_notarealkey000000000",
  SUPABASE_SECRET_KEY: "sb_secret_notarealkey000000000",
};

/*
  CLOSED_DEMO_ENABLED is part of a valid production configuration as
  of PR A2: /api/watchlist and /api/portfolio have no authentication
  and no tenant identity, so an internet-reachable environment must
  not start without the closed-demo gate. This fixture previously
  asserted production was valid with no gate at all, which described
  the hole rather than the contract.
*/
const production = validateEnvironment({
  TWELVE_DATA_CREDIT_COORDINATION_MODE: "shared_atomic",
  APP_ENV: "production",
  FINNHUB_API_KEY: "x",
  TWELVE_DATA_API_KEY: "x",
  OBSERVABILITY_METRICS_TOKEN: "x",
  CLOSED_DEMO_ENABLED: "true",
  PRIVATE_PERSONAL_PROVIDER_MODE: "true",
  PRIVATE_OWNER_USER_ID: "11111111-1111-4111-8111-111111111111",
  CLOSED_DEMO_ACCESS_CODE: "not-a-real-code",
  CLOSED_DEMO_SIGNING_SECRET: "0".repeat(32),
  TRUSTED_FRONTEND_ORIGINS: "https://azalens.com",
  ...SUPABASE_PRODUCTION,
});
assert.equal(production.valid, true, production.errors.join(" | "));
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
    ...SUPABASE_STAGING,
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
