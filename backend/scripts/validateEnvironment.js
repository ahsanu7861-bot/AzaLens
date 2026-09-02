"use strict";

const {
  getEnvironmentConfig,
  parseFlag,
} = require("../config/environment");
const {
  validateSupabaseEnvironment,
} = require("../config/supabaseEnvironment");
const {
  getCapabilityProviders,
  getProviderConfigurationProblems,
  getRequiredProviderKeys,
} = require("../providers/marketDataProvider");
const { resolveTwelveDataGovernorRuntime } = require("../services/twelveDataCreditGovernor");

/*
  Secrets required regardless of which market-data providers are selected.

  Provider API keys are deliberately NOT listed here. They are derived from the
  active capability selection instead - see getRequiredEnvironmentKeys - so the
  service demands a provider's key when and only when some capability actually
  selects that provider.

  Before this change FINNHUB_API_KEY was unconditional in staging and
  production. A deployment that had migrated every capability to Twelve Data
  would still have refused to start without a Finnhub key it never intended to
  use. That is technical boot parity only: it does not switch any default, and
  under the accepted defaults the required set is byte-identical to the old
  static list.
*/
const REQUIRED_BY_ENVIRONMENT = {
  development: [],
  test: [],
  staging: ["OBSERVABILITY_METRICS_TOKEN"],
  production: ["OBSERVABILITY_METRICS_TOKEN"],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
  The full required-secret list for an environment under a given provider
  selection. Names only - no value is read, compared or returned.
*/
function getRequiredEnvironmentKeys(environment, env = process.env) {
  const base = REQUIRED_BY_ENVIRONMENT[environment] || [];

  if (base.length === 0) {
    return [];
  }

  return [...new Set([...base, ...getRequiredProviderKeys(env)])].sort();
}

function validateEnvironment(env = process.env) {
  const config = getEnvironmentConfig(env);
  const required = getRequiredEnvironmentKeys(
    config.environment,
    env
  );
  const missing = required.filter(
    (key) => !String(env[key] || "").trim()
  );
  const errors = [];

  if (missing.length > 0) {
    /*
      Name the capability selection that made each key required, so a missing
      key is diagnosable in one restart rather than several. Provider ids and
      variable names only - never a value.
    */
    const selection = getCapabilityProviders(env);
    const selectionSummary = Object.entries(selection)
      .map(([capability, provider]) => `${capability}=${provider}`)
      .join(", ");

    errors.push(
      `Missing required ${config.environment} secrets: ${missing.join(", ")}. ` +
        `Required by the active provider selection (${selectionSummary}).`
    );
  }

  /*
    A provider selection that cannot serve a request must refuse to boot.

    Key derivation used to double as provider validation, so an unknown or
    blank provider contributed no required key and the service started green -
    then failed on the first real request, in front of a user. The same was true
    of selecting Twelve Data for profile or fundamentals without
    TWELVE_DATA_PROFILE_ENABLED: boot was happy and every request was not.

    A refused boot is visible and recoverable in minutes. A green boot that
    fails per-request is neither.

    Only variable names, provider ids and capability names appear in these
    messages. No key value is read or printed.
  */
  const providerProblems = getProviderConfigurationProblems(env);

  for (const problem of providerProblems) {
    errors.push(`${problem.code}: ${problem.message}`);
  }

  if (
    ["production", "staging"].includes(config.environment) &&
    getCapabilityProviders(env).history === "twelve_data"
  ) {
    const governor = resolveTwelveDataGovernorRuntime(env);
    if (!governor.enabled || !governor.multiInstanceSafe) {
      errors.push(
        "Twelve Data history requires TWELVE_DATA_CREDIT_COORDINATION_MODE=shared_atomic " +
        "and a usable service-role Supabase coordinator."
      );
    }
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

  /*
    ==========================================================
    Boot invariant: an internet-reachable environment must not
    run without the closed-demo gate.
    ==========================================================

    /api/watchlist and /api/portfolio have no authentication and no
    tenant identity. Every caller reads and writes ONE shared
    collection. The closed-demo gate is the only thing standing in
    front of them, and until now nothing required it: an absent or
    mistyped CLOSED_DEMO_ENABLED resolved to false in silence, and
    the service would start and serve unauthenticated read/write
    access to that shared data with no error and no log line.

    This deliberately chooses a hard outage over silent public
    exposure. A refused boot is visible and recoverable in minutes;
    silent public exposure is neither.

    parseFlag is used rather than list membership on purpose. It is
    the codebase's own intentional definition of a boolean flag -
    1/true/yes/on and 0/false/no/off - and it THROWS on anything
    else, so "ture" or "enabled" can never quietly become false. The
    permissive membership test that used to live here is exactly the
    failure mode this invariant exists to remove.

    The predicate is the RESOLVED environment, not NODE_ENV.
    getEnvironmentConfig reads APP_ENV || NODE_ENV, so keying on
    NODE_ENV alone would be wrong in both directions.

    Development and test are untouched and still start with no gate.
    When authentication and tenant identity exist, this rule should
    be revisited alongside them.
  */
  const GATE_REQUIRED_ENVIRONMENTS = new Set([
    "production",
    "staging",
  ]);

  let closedDemoEnabled = false;

  try {
    closedDemoEnabled = parseFlag(env.CLOSED_DEMO_ENABLED);
  } catch {
    errors.push(
      "CLOSED_DEMO_ENABLED is not a valid boolean. Use one of: " +
        "1, true, yes, on, 0, false, no, off."
    );
  }

  if (
    GATE_REQUIRED_ENVIRONMENTS.has(config.environment) &&
    !closedDemoEnabled
  ) {
    errors.push(
      `CLOSED_DEMO_ENABLED must be explicitly true in ${config.environment}: ` +
        "/api/watchlist and /api/portfolio have no authentication and no " +
        "tenant identity, so the closed-demo gate is the only access control " +
        "in front of one shared collection."
    );
  }

  const trustedOrigins = String(env.TRUSTED_FRONTEND_ORIGINS || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (GATE_REQUIRED_ENVIRONMENTS.has(config.environment) && closedDemoEnabled) {
    if (trustedOrigins.length === 0) errors.push("Owner-only mode requires TRUSTED_FRONTEND_ORIGINS with explicit exact origins.");
    for (const origin of trustedOrigins) {
      try {
        if (origin.includes("*") || new URL(origin).origin !== origin || !origin.startsWith("https://")) throw new Error();
      } catch {
        errors.push("TRUSTED_FRONTEND_ORIGINS entries must be exact HTTPS origins without paths or wildcards.");
        break;
      }
    }
  }

  let privatePersonalMode = false;
  try {
    privatePersonalMode = parseFlag(env.PRIVATE_PERSONAL_PROVIDER_MODE);
  } catch {
    errors.push("PRIVATE_PERSONAL_PROVIDER_MODE is not a valid boolean.");
  }

  const personalCredentialsConfigured = Boolean(
    String(env.FINNHUB_API_KEY || "").trim() ||
    String(env.TWELVE_DATA_API_KEY || "").trim()
  );

  if (
    GATE_REQUIRED_ENVIRONMENTS.has(config.environment) &&
    personalCredentialsConfigured &&
    (!privatePersonalMode || !closedDemoEnabled)
  ) {
    errors.push(
      "Personal-provider credentials in production or staging require " +
      "PRIVATE_PERSONAL_PROVIDER_MODE=true and owner-only CLOSED_DEMO_ENABLED=true."
    );
  }

  if (GATE_REQUIRED_ENVIRONMENTS.has(config.environment) && privatePersonalMode) {
    const ownerUserId = String(env.PRIVATE_OWNER_USER_ID || "").trim();
    if (!UUID_PATTERN.test(ownerUserId)) {
      errors.push(
        "PRIVATE_PERSONAL_PROVIDER_MODE requires PRIVATE_OWNER_USER_ID as an exact UUID in production and staging."
      );
    }
  }

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
    providerSelection: getCapabilityProviders(env),
    requiredProviderKeys: getRequiredProviderKeys(env),
    providerConfigurationProblems: providerProblems,
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
  getRequiredEnvironmentKeys,
  validateEnvironment,
};
