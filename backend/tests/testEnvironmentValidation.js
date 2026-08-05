"use strict";

const assert = require("node:assert/strict");

const {
  assertEnvironmentValid,
  validateEnvironment,
} = require("../scripts/validateEnvironment");
const {
  ENVIRONMENT_PROJECT_REF,
  PROJECT_REFS,
  deriveJwtIssuer,
  parseSupabaseUrl,
} = require("../config/supabaseEnvironment");

/*
  Slice 2 — environment validation.

  The failure this exists to prevent is silent: a deployment pointed at the
  wrong Supabase project boots cleanly, queries succeed, and the only symptom
  is that production and throwaway data have swapped places. Nothing downstream
  would notice, so it has to be caught before the server accepts a request.

  No real key, password or token appears anywhere in this file. Key checks are
  shape-only, using obviously fake values.
*/

const DEV_URL = `https://${PROJECT_REFS.development}.supabase.co`;
const PROD_URL = `https://${PROJECT_REFS.production}.supabase.co`;

// Structurally valid, obviously fake. Not credentials.
const FAKE_PUBLISHABLE = "sb_publishable_notarealkey000000000";
const FAKE_SECRET = "sb_secret_notarealkey000000000";

const PROVIDER_KEYS = {
  FINNHUB_API_KEY: "x",
  TWELVE_DATA_API_KEY: "x",
  OBSERVABILITY_METRICS_TOKEN: "x",
};

/*
  An internet-reachable environment is not "valid" without the
  closed-demo gate, so every fixture that asserts a VALID production
  or staging configuration now has to carry it. Before PR A2 this
  file asserted that production was valid with no gate at all -
  which was an accurate description of the hole being closed.

  Not a secret: a boolean switch, with obviously fake companions.
*/
const GATE_ON = {
  CLOSED_DEMO_ENABLED: "true",
  CLOSED_DEMO_ACCESS_CODE: "not-a-real-code",
  CLOSED_DEMO_SIGNING_SECRET: "0".repeat(32),
};

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message.split("\n")[0] });
  }
}

function errorsFrom(env) {
  return validateEnvironment(env).errors.join(" | ");
}

// ------------------------------------------------------------------
// Valid configurations succeed.
// ------------------------------------------------------------------

check("valid production configuration passes", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    ...GATE_ON,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("valid development configuration passes", () => {
  const result = validateEnvironment({
    APP_ENV: "development",
    SUPABASE_URL: DEV_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("development without Supabase configuration still passes", () => {
  // Supabase is optional in development so local work is not blocked before
  // Slice 3 exists. Provider optionality is unchanged.
  const result = validateEnvironment({ APP_ENV: "development" });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

// ------------------------------------------------------------------
// Missing required values fail, one variable at a time.
// ------------------------------------------------------------------

for (const missing of [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
]) {
  check(`production fails when ${missing} is missing`, () => {
    const env = {
      APP_ENV: "production",
      ...PROVIDER_KEYS,
      SUPABASE_URL: PROD_URL,
      SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
      SUPABASE_SECRET_KEY: FAKE_SECRET,
    };
    delete env[missing];
    const result = validateEnvironment(env);
    assert.equal(result.valid, false);
    assert.match(result.errors.join(" "), new RegExp(missing));
  });
}

check("existing provider-key requirements are unchanged", () => {
  // Provider keys must keep exactly the optionality they already had:
  // required in production, absent from development's required list.
  const withoutProviders = validateEnvironment({
    APP_ENV: "production",
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(withoutProviders.valid, false);
  assert.match(withoutProviders.errors.join(" "), /FINNHUB_API_KEY/);

  const devNoProviders = validateEnvironment({ APP_ENV: "development" });
  assert.equal(devNoProviders.valid, true);
});

check("partial Supabase configuration fails in development too", () => {
  const result = validateEnvironment({
    APP_ENV: "development",
    SUPABASE_URL: DEV_URL,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Incomplete Supabase configuration/);
});

// ------------------------------------------------------------------
// Malformed URLs.
// ------------------------------------------------------------------

const MALFORMED = [
  ["not-a-url", /not a valid absolute URL/],
  ["http://xhxlgalaytuqdnmmwypv.supabase.co", /must use https/],
  ["https://xhxlgalaytuqdnmmwypv.supabase.co/auth/v1", /must be the bare project origin/],
  ["https://xhxlgalaytuqdnmmwypv.supabase.co/?x=1", /query string or fragment/],
  ["https://attacker.net", /host must end with \.supabase\.co/],
  // Suffix confusion: ends with ".supabase.co.attacker.net", not ".supabase.co".
  [
    `https://${PROJECT_REFS.production}.supabase.co.attacker.net`,
    /host must end with \.supabase\.co/,
  ],
  ["https://short.supabase.co", /20 lowercase alphanumeric/],
];

for (const [url, expected] of MALFORMED) {
  check(`malformed SUPABASE_URL rejected: ${url}`, () => {
    const result = validateEnvironment({
      APP_ENV: "production",
      ...PROVIDER_KEYS,
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
      SUPABASE_SECRET_KEY: FAKE_SECRET,
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join(" "), expected);
  });
}

// ------------------------------------------------------------------
// Placeholder / template values.
// ------------------------------------------------------------------

check("placeholder SUPABASE_URL is rejected", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: "https://<your-project>.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /template placeholder/);
});

check("placeholder key value is rejected", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: "changeme",
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /template placeholder/);
});

// ------------------------------------------------------------------
// The cross-environment guard. This is the point of the module.
// ------------------------------------------------------------------

check("production REJECTS the development project", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: DEV_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /requires project/);
  assert.match(result.errors.join(" "), new RegExp(PROJECT_REFS.production));
});

check("development REJECTS the production project", () => {
  const result = validateEnvironment({
    APP_ENV: "development",
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /requires project/);
});

check("staging rejects the production project", () => {
  const result = validateEnvironment({
    APP_ENV: "staging",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false, "staging must never touch production data");
});

check("an unknown project reference is rejected everywhere", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
});

check("environment name and URL are cross-checked, not trusted singly", () => {
  // Same URL, different environment name -> opposite outcomes. Neither field
  // alone decides acceptance.
  const url = DEV_URL;
  const asDev = validateEnvironment({
    APP_ENV: "development",
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  const asProd = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(asDev.valid, true);
  assert.equal(asProd.valid, false);
});

// ------------------------------------------------------------------
// Key shape, including the swapped-keys mistake.
// ------------------------------------------------------------------

check("a secret key placed in the publishable slot is rejected", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /swapped/);
});

check("a publishable key placed in the secret slot is rejected", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_PUBLISHABLE,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /swapped/);
});

check("legacy JWT-style keys are rejected", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiJ9.fake.fake",
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sb_publishable_/);
});

// ------------------------------------------------------------------
// JWT issuer: derived, never configured.
// ------------------------------------------------------------------

check("issuer is derived from SUPABASE_URL", () => {
  assert.equal(deriveJwtIssuer(DEV_URL), `${DEV_URL}/auth/v1`);
  assert.equal(deriveJwtIssuer(PROD_URL), `${PROD_URL}/auth/v1`);
});

check("issuer derivation refuses an invalid URL", () => {
  assert.throws(() => deriveJwtIssuer("not-a-url"), /Cannot derive a JWT issuer/);
});

check("the derived issuer always tracks the configured project", () => {
  // The drift this prevents: a production URL paired with a development
  // issuer would accept development-signed tokens against production data.
  assert.notEqual(deriveJwtIssuer(DEV_URL), deriveJwtIssuer(PROD_URL));
  assert.ok(deriveJwtIssuer(PROD_URL).includes(PROJECT_REFS.production));
  assert.ok(!deriveJwtIssuer(PROD_URL).includes(PROJECT_REFS.development));
});

check("SUPABASE_JWT_ISSUER cannot be configured independently", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
    SUPABASE_JWT_ISSUER: `${DEV_URL}/auth/v1`,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /SUPABASE_JWT_ISSUER must not be set/);
});

check("no source file reads SUPABASE_JWT_ISSUER as configuration", () => {
  const { execFileSync } = require("node:child_process");
  const path = require("node:path");
  const root = path.resolve(__dirname, "../..");
  // Only the rejection rule and its documentation may mention the name.
  const hits = execFileSync(
    "grep",
    ["-rl", "SUPABASE_JWT_ISSUER", "backend", "frontend/src"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .filter(
      (file) =>
        !file.endsWith("config/supabaseEnvironment.js") &&
        !file.endsWith("tests/testEnvironmentValidation.js")
    );
  assert.deepEqual(hits, [], `unexpected readers: ${hits.join(", ")}`);
});

// ------------------------------------------------------------------
// Startup guard.
// ------------------------------------------------------------------

check("assertEnvironmentValid throws on an invalid environment", () => {
  assert.throws(
    () =>
      assertEnvironmentValid({
        APP_ENV: "production",
        ...PROVIDER_KEYS,
        SUPABASE_URL: DEV_URL,
        SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
        SUPABASE_SECRET_KEY: FAKE_SECRET,
      }),
    /Environment validation failed/
  );
});

check("assertEnvironmentValid returns the result when valid", () => {
  const result = assertEnvironmentValid({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    ...GATE_ON,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.equal(result.valid, true);
  assert.equal(result.environment, "production");
});

// ------------------------------------------------------------------
// Closed-demo boot invariant.
//
// /api/watchlist and /api/portfolio have no authentication and no
// tenant identity, so the closed-demo gate is the only access
// control in front of one shared collection. An internet-reachable
// environment must not start without it.
//
// This deliberately chooses a hard outage over silent public
// exposure.
// ------------------------------------------------------------------

const GATE_BASE = {
  ...PROVIDER_KEYS,
  SUPABASE_URL: PROD_URL,
  SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
  SUPABASE_SECRET_KEY: FAKE_SECRET,
};

const STAGING_BASE = {
  ...PROVIDER_KEYS,
  SUPABASE_URL: DEV_URL,
  SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
  SUPABASE_SECRET_KEY: FAKE_SECRET,
};

function gateErrors(env) {
  return validateEnvironment(env)
    .errors.filter((message) =>
      message.includes("CLOSED_DEMO_ENABLED")
    )
    .join(" | ");
}

check("resolved production with explicit true starts", () => {
  const result = validateEnvironment({
    APP_ENV: "production",
    ...GATE_BASE,
    ...GATE_ON,
  });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("resolved staging with explicit true starts", () => {
  const result = validateEnvironment({
    APP_ENV: "staging",
    ...STAGING_BASE,
    ...GATE_ON,
  });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("production with a missing value fails clearly", () => {
  const message = gateErrors({ APP_ENV: "production", ...GATE_BASE });
  assert.match(message, /must be explicitly true in production/);
});

check("staging with a missing value fails clearly", () => {
  const message = gateErrors({ APP_ENV: "staging", ...STAGING_BASE });
  assert.match(message, /must be explicitly true in staging/);
});

check("production with false fails clearly", () => {
  const message = gateErrors({
    APP_ENV: "production",
    ...GATE_BASE,
    CLOSED_DEMO_ENABLED: "false",
  });
  assert.match(message, /must be explicitly true in production/);
});

check("staging with false fails clearly", () => {
  const message = gateErrors({
    APP_ENV: "staging",
    ...STAGING_BASE,
    CLOSED_DEMO_ENABLED: "false",
  });
  assert.match(message, /must be explicitly true in staging/);
});

/*
  The whole point of the invariant. Before PR A2 both the gate and
  the validator used permissive list membership, so "ture" resolved
  to false in silence and the service started with every CRUD route
  open. It must now be rejected as malformed, and it must NOT be
  reported merely as "not true" - the operator has to see that the
  value itself is wrong.
*/
for (const malformed of ["ture", "enabled", "TRUE!", "1 0", "yess"]) {
  check(
    `production with a malformed value ${JSON.stringify(
      malformed
    )} fails clearly`,
    () => {
      const message = gateErrors({
        APP_ENV: "production",
        ...GATE_BASE,
        CLOSED_DEMO_ENABLED: malformed,
      });
      assert.match(message, /is not a valid boolean/);
      assert.match(message, /must be explicitly true in production/);
    }
  );
}

check("a malformed value is rejected in staging too", () => {
  const message = gateErrors({
    APP_ENV: "staging",
    ...STAGING_BASE,
    CLOSED_DEMO_ENABLED: "ture",
  });
  assert.match(message, /is not a valid boolean/);
});

/*
  Every spelling the codebase already defines intentionally must keep
  working, so an existing deployment cannot be broken by this rule.
*/
for (const spelling of ["true", "1", "yes", "on", "TRUE", " true "]) {
  check(
    `production accepts the intentional true spelling ${JSON.stringify(
      spelling
    )}`,
    () => {
      const result = validateEnvironment({
        APP_ENV: "production",
        ...GATE_BASE,
        ...GATE_ON,
        CLOSED_DEMO_ENABLED: spelling,
      });
      assert.equal(result.valid, true, result.errors.join(" | "));
    }
  );
}

check("APP_ENV takes precedence over NODE_ENV", () => {
  // NODE_ENV says development, APP_ENV says production: the rule
  // must follow the RESOLVED environment and demand the gate.
  const resolvedProduction = gateErrors({
    APP_ENV: "production",
    NODE_ENV: "development",
    ...GATE_BASE,
  });
  assert.match(resolvedProduction, /must be explicitly true in production/);

  // The reverse: NODE_ENV says production, APP_ENV says development.
  // The rule must NOT fire, because the app resolves to development.
  const resolvedDevelopment = validateEnvironment({
    APP_ENV: "development",
    NODE_ENV: "production",
  });
  assert.equal(
    resolvedDevelopment.environment,
    "development",
    "APP_ENV must win"
  );
  assert.equal(
    resolvedDevelopment.errors.filter((message) =>
      message.includes("CLOSED_DEMO_ENABLED")
    ).length,
    0,
    "development must not require the gate even when NODE_ENV says production"
  );
});

check("NODE_ENV alone still resolves the environment", () => {
  const message = gateErrors({ NODE_ENV: "production", ...GATE_BASE });
  assert.match(message, /must be explicitly true in production/);
});

check("development starts without the gate", () => {
  const result = validateEnvironment({ APP_ENV: "development" });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("test starts without the gate", () => {
  const result = validateEnvironment({ APP_ENV: "test" });
  assert.equal(result.valid, true, result.errors.join(" | "));
});

check("the gate failure message exposes no secret value", () => {
  const message = validateEnvironment({
    APP_ENV: "production",
    ...GATE_BASE,
    CLOSED_DEMO_ENABLED: "ture",
    CLOSED_DEMO_ACCESS_CODE: "super-secret-code",
    CLOSED_DEMO_SIGNING_SECRET: "s".repeat(48),
  }).errors.join(" ");

  assert.match(message, /CLOSED_DEMO_ENABLED/);
  assert.ok(
    !message.includes("super-secret-code"),
    "the access code must never appear in a failure message"
  );
  assert.ok(
    !message.includes("s".repeat(48)),
    "the signing secret must never appear in a failure message"
  );
  assert.ok(
    !message.includes("ture"),
    "the offending value itself is not echoed back"
  );
});

check("failure messages never echo a key value", () => {
  const message = errorsFrom({
    APP_ENV: "production",
    ...PROVIDER_KEYS,
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
  });
  assert.ok(!message.includes(FAKE_SECRET), "error text leaked a key value");
});

// ------------------------------------------------------------------
// Mapping is complete for every recognised environment.
// ------------------------------------------------------------------

check("every recognised environment maps to a project", () => {
  for (const environment of ["development", "test", "staging", "production"]) {
    assert.ok(
      ENVIRONMENT_PROJECT_REF[environment],
      `${environment} has no mapped project`
    );
  }
  assert.equal(
    ENVIRONMENT_PROJECT_REF.production,
    PROJECT_REFS.production
  );
  assert.notEqual(
    ENVIRONMENT_PROJECT_REF.development,
    PROJECT_REFS.production
  );
});

check("parseSupabaseUrl extracts the project reference", () => {
  const parsed = parseSupabaseUrl(PROD_URL);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.projectRef, PROJECT_REFS.production);
  assert.equal(parsed.origin, PROD_URL);
});

// ------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"}  ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
}
console.log(
  `\n[environment-validation] ${results.length - failed.length}/${results.length} checks passed`
);

if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
