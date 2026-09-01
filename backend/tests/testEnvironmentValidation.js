"use strict";

const assert = require("node:assert/strict");

const {
  assertEnvironmentValid,
  getRequiredEnvironmentKeys,
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
  PRIVATE_PERSONAL_PROVIDER_MODE: "true",
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

/*
  ==================================================================
  Conditional provider-key validation
  ==================================================================

  FINNHUB_API_KEY used to be required unconditionally in staging and
  production, regardless of which providers any capability actually selected.
  A deployment that had migrated every capability to Twelve Data would still
  have refused to start without a Finnhub key it never intended to use - the
  boot guard would have blocked a correct configuration.

  Requirements are now derived from the ACTIVE selection. This is technical
  boot parity only: it changes no default, and under the accepted defaults the
  required set is identical to the old static list, which the first check
  below pins.

  No key VALUE is asserted anywhere here. Only names, and obviously fake
  placeholders.
*/

const PRODUCTION_BASE = {
  APP_ENV: "production",
  SUPABASE_URL: PROD_URL,
  SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
  SUPABASE_SECRET_KEY: FAKE_SECRET,
  ...GATE_ON,
};

check("default selection requires exactly the historically required keys", () => {
  assert.deepEqual(getRequiredEnvironmentKeys("production", {}), [
    "FINNHUB_API_KEY",
    "OBSERVABILITY_METRICS_TOKEN",
    "TWELVE_DATA_API_KEY",
  ]);
  assert.deepEqual(
    getRequiredEnvironmentKeys("staging", {}),
    getRequiredEnvironmentKeys("production", {})
  );

  // Development and test still require nothing and still start with no gate.
  assert.deepEqual(getRequiredEnvironmentKeys("development", {}), []);
  assert.deepEqual(getRequiredEnvironmentKeys("test", {}), []);
});

check("default production boot still demands a Finnhub key", () => {
  const withoutFinnhub = validateEnvironment({
    ...PRODUCTION_BASE,
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
  });

  assert.equal(withoutFinnhub.valid, false);
  assert.match(withoutFinnhub.errors.join(" "), /FINNHUB_API_KEY/);

  // The error names the selection that made the key required.
  assert.match(withoutFinnhub.errors.join(" "), /quote=finnhub/);

  const complete = validateEnvironment({
    ...PRODUCTION_BASE,
    ...PROVIDER_KEYS,
  });
  assert.equal(complete.valid, true, complete.errors.join(" "));
  assert.deepEqual(complete.providerSelection, {
    quote: "finnhub",
    profile: "finnhub",
    search: "finnhub",
    history: "twelve_data",
    fundamentals: "finnhub",
  });
});

check("a Twelve Data-only selection without its feature flag is refused", () => {
  /*
    This check previously asserted that exactly this configuration was VALID,
    and that assertion was the blocker: PROFILE_PROVIDER and
    FUNDAMENTALS_PROVIDER were set to twelve_data with
    TWELVE_DATA_PROFILE_ENABLED absent, so the service booted green and every
    profile request then failed with PROVIDER_CAPABILITY_DISABLED.

    The correct Twelve Data-only configuration - the same selection WITH the
    flag - is covered separately below and still boots with no Finnhub key.
  */
  const withoutFlag = validateEnvironment({
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "twelve_data",
    HISTORY_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
    // TWELVE_DATA_PROFILE_ENABLED and FINNHUB_API_KEY both deliberately absent.
  });

  assert.equal(withoutFlag.valid, false);
  assert.deepEqual(
    withoutFlag.missing,
    [],
    "no key is missing - the selection itself is the problem"
  );
  assert.deepEqual(
    withoutFlag.providerConfigurationProblems.map((problem) => problem.capability),
    ["profile", "fundamentals"]
  );

  assert.throws(
    () =>
      assertEnvironmentValid({
        ...PRODUCTION_BASE,
        QUOTE_PROVIDER: "twelve_data",
        PROFILE_PROVIDER: "twelve_data",
        SEARCH_PROVIDER: "twelve_data",
        HISTORY_PROVIDER: "twelve_data",
        FUNDAMENTALS_PROVIDER: "twelve_data",
        TWELVE_DATA_API_KEY: "x",
        OBSERVABILITY_METRICS_TOKEN: "x",
      }),
    /TWELVE_DATA_PROFILE_ENABLED/
  );
});

check("a selected provider with no key still fails boot clearly", () => {
  const missingTwelveData = validateEnvironment({
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "twelve_data",
    HISTORY_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
    OBSERVABILITY_METRICS_TOKEN: "x",
  });

  assert.equal(missingTwelveData.valid, false);
  assert.match(missingTwelveData.errors.join(" "), /TWELVE_DATA_API_KEY/);

  // A single Finnhub capability is enough to make the Finnhub key required.
  const oneFinnhubCapability = validateEnvironment({
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "finnhub",
    HISTORY_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
  });

  assert.equal(oneFinnhubCapability.valid, false);
  assert.match(oneFinnhubCapability.errors.join(" "), /FINNHUB_API_KEY/);
  assert.match(oneFinnhubCapability.errors.join(" "), /search=finnhub/);
});

check("an unused provider key is never demanded", () => {
  assert.equal(
    getRequiredEnvironmentKeys("production", {
      QUOTE_PROVIDER: "twelve_data",
      PROFILE_PROVIDER: "twelve_data",
      SEARCH_PROVIDER: "twelve_data",
      HISTORY_PROVIDER: "twelve_data",
      FUNDAMENTALS_PROVIDER: "twelve_data",
    }).includes("FINNHUB_API_KEY"),
    false
  );

  assert.equal(
    getRequiredEnvironmentKeys("production", {
      HISTORY_PROVIDER: "finnhub",
      QUOTE_PROVIDER: "finnhub",
      PROFILE_PROVIDER: "finnhub",
      SEARCH_PROVIDER: "finnhub",
      FUNDAMENTALS_PROVIDER: "finnhub",
    }).includes("TWELVE_DATA_API_KEY"),
    false
  );
});

check("validation output never contains a key value", () => {
  const result = validateEnvironment({
    ...PRODUCTION_BASE,
    FINNHUB_API_KEY: "finnhub-value-must-not-appear",
    TWELVE_DATA_API_KEY: "twelve-value-must-not-appear",
    OBSERVABILITY_METRICS_TOKEN: "metrics-value-must-not-appear",
  });

  const serialized = JSON.stringify(result);

  for (const secret of [
    "finnhub-value-must-not-appear",
    "twelve-value-must-not-appear",
    "metrics-value-must-not-appear",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

/*
  ==================================================================
  Provider-configuration validity
  ==================================================================

  Key derivation used to double as provider validation:

      const keyName = PROVIDER_API_KEYS[provider];
      if (keyName) required.add(keyName);

  An unknown, misspelled or blank provider fell straight out of that lookup,
  contributed no required key, and the service booted green - then failed on the
  first real request, in front of a user. Selecting Twelve Data for profile or
  fundamentals without TWELVE_DATA_PROFILE_ENABLED had the same shape.

  Every expected result below is written out independently. None of it is
  produced by asking the validator what it thinks, which would only prove the
  validator agrees with itself.
*/

const VALID_PRODUCTION = {
  ...PRODUCTION_BASE,
  ...PROVIDER_KEYS,
};

// Each entry: label, environment overrides, and the independently stated verdict.
const CONFIGURATION_CASES = [
  ["accepted defaults", {}, { valid: true }],
  ["unknown quote provider", { QUOTE_PROVIDER: "alphavantage" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "quote" }],
  ["unknown profile provider", { PROFILE_PROVIDER: "iex" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "profile" }],
  ["unknown search provider", { SEARCH_PROVIDER: "polygon" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "search" }],
  ["unknown history provider", { HISTORY_PROVIDER: "yahoo" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "history" }],
  ["unknown fundamentals provider", { FUNDAMENTALS_PROVIDER: "nope" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "fundamentals" }],
  /*
    This entry previously asserted { valid: true } for an explicitly empty
    QUOTE_PROVIDER, and that assertion was the defect: `env[key] || DEFAULT`
    collapsed "" into the accepted default, so blanking a variable silently
    selected Finnhub and reported usesDefaults: true. An explicitly empty value
    is a configuration statement, and it is now refused.
  */
  ["explicitly empty quote provider", { QUOTE_PROVIDER: "" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "quote" }],
  ["whitespace quote provider", { QUOTE_PROVIDER: "   " }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "quote" }],
  ["whitespace history provider", { HISTORY_PROVIDER: "\t" }, { valid: false, code: "PROVIDER_UNSUPPORTED", capability: "history" }],
  ["twelve data profile, flag absent", { PROFILE_PROVIDER: "twelve_data" }, { valid: false, code: "PROVIDER_CAPABILITY_FLAG_DISABLED", capability: "profile" }],
  ["twelve data profile, flag false", { PROFILE_PROVIDER: "twelve_data", TWELVE_DATA_PROFILE_ENABLED: "false" }, { valid: false, code: "PROVIDER_CAPABILITY_FLAG_DISABLED", capability: "profile" }],
  ["twelve data fundamentals, flag absent", { FUNDAMENTALS_PROVIDER: "twelve_data" }, { valid: false, code: "PROVIDER_CAPABILITY_FLAG_DISABLED", capability: "fundamentals" }],
  ["twelve data fundamentals, flag false", { FUNDAMENTALS_PROVIDER: "twelve_data", TWELVE_DATA_PROFILE_ENABLED: "0" }, { valid: false, code: "PROVIDER_CAPABILITY_FLAG_DISABLED", capability: "fundamentals" }],
  ["twelve data profile and fundamentals, flag true", { PROFILE_PROVIDER: "twelve_data", FUNDAMENTALS_PROVIDER: "twelve_data", TWELVE_DATA_PROFILE_ENABLED: "true" }, { valid: true }],
  ["twelve data quote and search need no flag", { QUOTE_PROVIDER: "twelve_data", SEARCH_PROVIDER: "twelve_data" }, { valid: true }],
];

for (const [label, overrides, expected] of CONFIGURATION_CASES) {
  check(`configuration: ${label}`, () => {
    const result = validateEnvironment({ ...VALID_PRODUCTION, ...overrides });

    assert.equal(
      result.valid,
      expected.valid,
      `${label}: expected valid=${expected.valid}, got ${result.valid} (${result.errors.join(" | ")})`
    );

    if (expected.valid) {
      assert.deepEqual(result.providerConfigurationProblems, []);
      return;
    }

    const problem = result.providerConfigurationProblems.find(
      (candidate) => candidate.capability === expected.capability
    );

    assert.ok(problem, `${label}: expected a problem for the ${expected.capability} capability`);
    assert.equal(problem.code, expected.code);
    assert.match(result.errors.join(" "), new RegExp(expected.code));

    // assertEnvironmentValid is the real startup guard, so it must refuse too.
    assert.throws(
      () => assertEnvironmentValid({ ...VALID_PRODUCTION, ...overrides }),
      /Environment validation failed/,
      `${label}: startup must refuse this configuration`
    );
  });
}

/*
  The full absent / empty / whitespace matrix, for every capability.

  Three distinct states that `||` could not tell apart:
    - the variable is ABSENT      -> the accepted default applies
    - the variable is ""          -> a configuration statement, and refused
    - the variable is whitespace  -> the same
*/
const CAPABILITY_VARIABLES = [
  ["quote", "QUOTE_PROVIDER"],
  ["profile", "PROFILE_PROVIDER"],
  ["search", "SEARCH_PROVIDER"],
  ["history", "HISTORY_PROVIDER"],
  ["fundamentals", "FUNDAMENTALS_PROVIDER"],
];

const BLANK_VALUES = [
  ["empty string", ""],
  ["single space", " "],
  ["spaces", "   "],
  ["tab", "\t"],
  ["newline", "\n"],
  ["tab and newline", "\t\n "],
];

for (const [capability, variable] of CAPABILITY_VARIABLES) {
  for (const [valueLabel, value] of BLANK_VALUES) {
    check(`blank configuration: ${variable} = ${valueLabel}`, () => {
      const env = { ...VALID_PRODUCTION, [variable]: value };
      const result = validateEnvironment(env);

      assert.equal(result.valid, false, `${variable}=${valueLabel} must be refused`);

      const problem = result.providerConfigurationProblems.find(
        (candidate) => candidate.capability === capability
      );

      assert.ok(problem, `expected a problem for the ${capability} capability`);
      assert.equal(problem.code, "PROVIDER_UNSUPPORTED");
      assert.equal(problem.provider, "", "a blank value must normalize to an empty provider, not a default");

      assert.throws(
        () => assertEnvironmentValid(env),
        /Environment validation failed/,
        `${variable}=${valueLabel} must refuse startup`
      );

      // It must not have silently become a default provider.
      assert.notEqual(result.providerSelection[capability], "finnhub");
      assert.notEqual(result.providerSelection[capability], "twelve_data");
    });
  }
}

check("a genuinely absent provider variable still selects the accepted default", () => {
  /*
    The other half of the distinction. Absence must keep working exactly as it
    always did, including when the property is present with the value undefined.
  */
  const absent = validateEnvironment(VALID_PRODUCTION);

  assert.equal(absent.valid, true, absent.errors.join(" | "));
  assert.deepEqual(absent.providerSelection, {
    quote: "finnhub",
    profile: "finnhub",
    search: "finnhub",
    history: "twelve_data",
    fundamentals: "finnhub",
  });

  const explicitlyUndefined = validateEnvironment({
    ...VALID_PRODUCTION,
    QUOTE_PROVIDER: undefined,
    PROFILE_PROVIDER: undefined,
    SEARCH_PROVIDER: undefined,
    HISTORY_PROVIDER: undefined,
    FUNDAMENTALS_PROVIDER: undefined,
  });

  assert.equal(explicitlyUndefined.valid, true, explicitlyUndefined.errors.join(" | "));
  assert.deepEqual(explicitlyUndefined.providerSelection, absent.providerSelection);
  assert.deepEqual(explicitlyUndefined.providerConfigurationProblems, []);
});

check("every capability blanked at once is refused, capability by capability", () => {
  const env = { ...VALID_PRODUCTION };
  for (const [, variable] of CAPABILITY_VARIABLES) env[variable] = "";

  const result = validateEnvironment(env);

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.providerConfigurationProblems.map((problem) => problem.capability),
    ["quote", "profile", "search", "history", "fundamentals"],
    "each blanked capability must be reported individually"
  );
  assert.deepEqual(
    result.requiredProviderKeys,
    [],
    "a wholly blank selection requires no provider key - and is still refused"
  );
});

check("an unsupported provider contributes no silently-missing key requirement", () => {
  /*
    The precise regression: an unsupported provider used to require no key, so
    "every required key is present" was trivially true and nothing objected.
    Requiring no key is still correct - there is no key for a provider that does
    not exist - but it must no longer be the only thing that is checked.
  */
  const result = validateEnvironment({
    ...VALID_PRODUCTION,
    QUOTE_PROVIDER: "alphavantage",
  });

  assert.deepEqual(result.missing, [], "no key is missing for a provider that does not exist");
  assert.equal(result.valid, false, "and yet the configuration must still be refused");
  assert.equal(result.providerConfigurationProblems.length, 1);
});

check("a correctly enabled Twelve Data-only selection still boots without a Finnhub key", () => {
  const env = {
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "twelve_data",
    HISTORY_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
    TWELVE_DATA_PROFILE_ENABLED: "true",
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
  };

  const result = validateEnvironment(env);

  assert.equal(result.valid, true, result.errors.join(" | "));
  assert.deepEqual(result.requiredProviderKeys, ["TWELVE_DATA_API_KEY"]);
  assert.deepEqual(result.providerConfigurationProblems, []);
  assert.doesNotThrow(() => assertEnvironmentValid(env));
});

check("one remaining Finnhub capability still requires its key", () => {
  const env = {
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "finnhub",
    HISTORY_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
    TWELVE_DATA_PROFILE_ENABLED: "true",
    TWELVE_DATA_API_KEY: "x",
    OBSERVABILITY_METRICS_TOKEN: "x",
  };

  const result = validateEnvironment(env);

  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["FINNHUB_API_KEY"]);
  assert.deepEqual(result.providerConfigurationProblems, []);
  assert.match(result.errors.join(" "), /search=finnhub/);
});

check("default provider ownership is unchanged by configuration validation", () => {
  const result = validateEnvironment(VALID_PRODUCTION);

  assert.deepEqual(result.providerSelection, {
    quote: "finnhub",
    profile: "finnhub",
    search: "finnhub",
    history: "twelve_data",
    fundamentals: "finnhub",
  });
  assert.deepEqual(result.requiredProviderKeys, [
    "FINNHUB_API_KEY",
    "TWELVE_DATA_API_KEY",
  ]);
});

check("configuration errors expose no key value", () => {
  const result = validateEnvironment({
    ...PRODUCTION_BASE,
    QUOTE_PROVIDER: "alphavantage",
    PROFILE_PROVIDER: "twelve_data",
    FINNHUB_API_KEY: "config-finnhub-value-must-not-appear",
    TWELVE_DATA_API_KEY: "config-twelve-value-must-not-appear",
    OBSERVABILITY_METRICS_TOKEN: "config-metrics-value-must-not-appear",
  });

  const serialized = JSON.stringify(result);

  for (const secret of [
    "config-finnhub-value-must-not-appear",
    "config-twelve-value-must-not-appear",
    "config-metrics-value-must-not-appear",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }

  // Variable NAMES are expected and useful; values are not.
  assert.match(serialized, /QUOTE_PROVIDER/);
  assert.match(serialized, /TWELVE_DATA_PROFILE_ENABLED/);
});

check("closed-demo and Shariah boot invariants are unchanged", () => {
  const noGate = validateEnvironment({
    APP_ENV: "production",
    SUPABASE_URL: PROD_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
    ...PROVIDER_KEYS,
  });
  assert.equal(noGate.valid, false);
  assert.match(noGate.errors.join(" "), /CLOSED_DEMO_ENABLED must be explicitly true/);

  const liveShariahWithoutMode = validateEnvironment({
    ...PRODUCTION_BASE,
    ...PROVIDER_KEYS,
    FEATURE_LIVE_SHARIAH_ENABLED: "true",
  });
  assert.equal(liveShariahWithoutMode.valid, false);
  assert.match(
    liveShariahWithoutMode.errors.join(" "),
    /SHARIAH_DATA_MODE=live/
  );
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
