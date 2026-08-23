"use strict";

const {
  CACHE_CONTRACT_VERSION
} = require("../utils/cache");

function finnhub() {
  return require("./finnhubProvider");
}

function twelveData() {
  return require("./twelveDataProvider");
}

/*
  ==========================================================================
  Accepted production defaults
  ==========================================================================

  PR A adds tested Twelve Data parity BEHIND explicit capability selection. It
  does not switch production. This object is the boundary, and
  backend/tests/testProviderAdapter.js asserts it byte-for-byte.

  Changing any value here is a PR B decision requiring endpoint/plan access,
  external-display authorization, parity evidence, cache-transition
  verification and explicit production authorization.
*/
const DEFAULTS = Object.freeze({
  quote: "finnhub",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

const CAPABILITIES = Object.freeze(Object.keys(DEFAULTS));

/*
  Provider ids used in configuration and cache keys, mapped to the display
  labels that already travel on the wire in normalized responses. The two are
  deliberately separate: the id is configuration, the label is provenance, and
  conflating them is how a response ends up claiming a provider that did not
  produce it.
*/
const PROVIDER_LABELS = Object.freeze({
  finnhub: "Finnhub",
  twelve_data: "TwelveData",
});

/*
  The environment variable each provider needs in order to serve a capability.
  Boot validation derives its requirements from this map and the ACTIVE
  selection, so an unused provider's key is never demanded.
*/
const PROVIDER_API_KEYS = Object.freeze({
  finnhub: "FINNHUB_API_KEY",
  twelve_data: "TWELVE_DATA_API_KEY",
});

/*
  ==========================================================================
  Which providers each capability is actually implemented for
  ==========================================================================

  This matrix is the single source of truth for "is this configuration even
  possible", and it is deliberately per-capability rather than a flat provider
  list: a provider may implement one capability and not another, and a flat list
  would wave through `HISTORY_PROVIDER=some_provider_that_only_does_quotes`.

  It exists because key derivation used to double as provider validation:

      const keyName = PROVIDER_API_KEYS[provider];
      if (keyName) required.add(keyName);

  An unknown provider - a typo, a blank value, a provider AzaLens never
  implemented - simply fell out of that lookup and contributed no required key.
  The service then booted green, strict readiness reported ready, and the
  configuration failed for the first time on a real user's request. A
  misconfiguration that survives boot is far more expensive than one that
  refuses to start, because it fails in front of someone.

  Support is now proven FIRST, from this matrix. Key lookup happens only after.
*/
const CAPABILITY_PROVIDER_MATRIX = Object.freeze({
  quote: Object.freeze(["finnhub", "twelve_data"]),
  profile: Object.freeze(["finnhub", "twelve_data"]),
  search: Object.freeze(["finnhub", "twelve_data"]),
  history: Object.freeze(["finnhub", "twelve_data"]),
  fundamentals: Object.freeze(["finnhub", "twelve_data"]),
});

/*
  Capabilities that need an explicit feature flag before their Twelve Data
  implementation may be selected. Selecting one without the flag is a
  configuration mistake, not a runtime condition, so boot must refuse it
  rather than letting every request discover it separately.
*/
const CAPABILITY_REQUIRED_FLAGS = Object.freeze({
  profile: Object.freeze({ twelve_data: "TWELVE_DATA_PROFILE_ENABLED" }),
  fundamentals: Object.freeze({ twelve_data: "TWELVE_DATA_PROFILE_ENABLED" }),
});

function isProviderSupported(capability, provider) {
  return (CAPABILITY_PROVIDER_MATRIX[capability] || []).includes(provider);
}

/*
  Every reason the ACTIVE selection could not serve a request, found before a
  single request is made. Returns structured records - capability, provider id,
  machine-readable code, and the variable NAMES involved. Never a key value.
*/
function getProviderConfigurationProblems(env = process.env) {
  const capabilities = getCapabilityProviders(env);
  const flags = getProviderCapabilities(env);
  const problems = [];

  for (const capability of CAPABILITIES) {
    const provider = capabilities[capability];
    const variable = `${capability.toUpperCase()}_PROVIDER`;

    if (!isProviderSupported(capability, provider)) {
      problems.push({
        capability,
        provider,
        variable,
        code: "PROVIDER_UNSUPPORTED",
        message:
          `${variable} is set to ${provider ? `"${provider}"` : "an empty value"}, ` +
          `which is not a supported ${capability} provider. Supported: ` +
          `${(CAPABILITY_PROVIDER_MATRIX[capability] || []).join(", ")}.`,
      });

      continue;
    }

    const requiredFlag = CAPABILITY_REQUIRED_FLAGS[capability]?.[provider];

    if (requiredFlag && !flags.twelveDataProfile) {
      problems.push({
        capability,
        provider,
        variable,
        requiredFlag,
        code: "PROVIDER_CAPABILITY_FLAG_DISABLED",
        message:
          `${variable}=${provider} requires ${requiredFlag} to be explicitly true. ` +
          "Set both, or neither - this configuration must not start and then fail " +
          "on its first request.",
      });
    }
  }

  return problems;
}

/*
  ==========================================================================
  An absent variable and an explicitly blank one are different things
  ==========================================================================

  This used to read:

      String(env[key] || DEFAULTS[capability]).trim().toLowerCase()

  `||` cannot tell "nobody configured this" from "somebody configured it to
  nothing". An explicitly empty QUOTE_PROVIDER="" is falsy, so it collapsed into
  the accepted default and the service silently selected Finnhub - reporting
  `usesDefaults: true`, booting green, and passing readiness. An operator who
  blanked a variable to unset it would have been told, in effect, that their
  edit had no consequences.

  Absence is now checked explicitly. `undefined` - the property missing, or
  present with no value - takes the default. Anything actually present is
  returned as configured, trimmed and lowercased, including the empty string.
  An empty or whitespace-only value therefore arrives at validation as "", which
  is not a supported provider for any capability, and is refused there.

  Truthiness is not usable for this decision, and neither is a blank check: the
  point is precisely to let a blank value through to be rejected rather than
  quietly replaced.
*/
function configuredProvider(capability, env = process.env) {
  const key = `${capability.toUpperCase()}_PROVIDER`;
  const configured = env[key];

  if (configured === undefined) {
    return DEFAULTS[capability];
  }

  return String(configured).trim().toLowerCase();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

function getProviderCapabilities(env = process.env) {
  return {
    twelveDataProfile: enabled(env.TWELVE_DATA_PROFILE_ENABLED),
  };
}

function getProviderLabel(provider) {
  return (
    PROVIDER_LABELS[String(provider || "").trim().toLowerCase()] ||
    "Unknown"
  );
}

/*
  The runtime guard. Boot validation now rejects the same configurations
  earlier, but this stays as defence in depth: boot validation runs once, and
  nothing stops a future code path from resolving a capability that never went
  through it.
*/
function unsupported(capability, provider) {
  const error = new Error(
    `${provider} does not implement the ${capability} capability.`,
  );
  error.code = "PROVIDER_CAPABILITY_UNSUPPORTED";
  error.capability = capability;
  error.provider = provider;
  throw error;
}

/*
  A capability that is SELECTED but switched off by its feature flag is a
  configuration mistake, and it must say so.

  Before PR A this path silently returned a complete Finnhub profile. An
  operator could set PROFILE_PROVIDER=twelve_data, see the service come up
  healthy, and believe the migration was live while every profile on the site
  was still being bought from Finnhub. There was no log line and no provenance
  warning - the response even carried `provider: "Finnhub"`, which was true and
  therefore unremarkable.

  Failing loudly is the honest behaviour: the two variables must agree, and a
  mistake is recoverable in minutes when it is visible.
*/
function capabilityDisabled(capability, provider, flagName) {
  const error = new Error(
    `${capability} is configured to use ${provider}, but ${flagName} is not enabled. ` +
      "Set both, or neither - this configuration must not silently serve another provider.",
  );
  error.code = "PROVIDER_CAPABILITY_DISABLED";
  error.capability = capability;
  error.provider = provider;
  error.requiredFlag = flagName;
  throw error;
}

function getCapabilityProviders(env = process.env) {
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [
      capability,
      configuredProvider(capability, env),
    ]),
  );
}

/*
  ==========================================================================
  Fundamentals capability ownership
  ==========================================================================

  Two separate truths, both verified against executable code, both easy to get
  wrong from the variable names alone:

  1. FUNDAMENTALS_PROVIDER used to be decorative. `getFundamentals` delegated to
     `getCompanyProfile`, which re-dispatched on PROFILE_PROVIDER - so setting
     FUNDAMENTALS_PROVIDER=finnhub with PROFILE_PROVIDER=twelve_data produced
     Twelve Data fundamentals. It now dispatches on its own capability.

  2. The MOUNTED Fundamentals workspace is not served by this function at all.
     `getFundamentals` has no caller anywhere in the repository. The workspace
     is populated from `market.companyProfile`, which comes from the PROFILE
     capability via marketEngine. So PROFILE_PROVIDER owns what a user actually
     sees on that screen, and FUNDAMENTALS_PROVIDER owns only this function.

  Reporting (2) rather than quietly leaving the impression that
  FUNDAMENTALS_PROVIDER controls the workspace is the point of this map.
  backend/tests/testProviderAdapter.js pins both facts.

  No statement endpoints are added. Financial statements, valuation, earnings,
  filings and ownership are reported UNAVAILABLE by the mounted product, and
  they stay that way: `/income_statement` alone is 100 credits per symbol, and
  buying data no screen renders would be pure cost.
*/
const CAPABILITY_OWNERSHIP = Object.freeze({
  fundamentals: Object.freeze({
    configVariable: "FUNDAMENTALS_PROVIDER",
    governs: "getFundamentals",
    mountedConsumers: Object.freeze([]),
    mountedFundamentalsSurfaceOwnedBy: "profile",
    dispatchesThroughProfileProvider: false,
    statementEndpointsImplemented: Object.freeze([]),
  }),
});

function getCapabilityOwnership() {
  return CAPABILITY_OWNERSHIP;
}

/*
  The API-key environment variable names required by the CURRENT selection, so
  boot validation can demand a Finnhub key when and only when some capability
  actually selects Finnhub. Returns names only - never values.
*/
function getRequiredProviderKeys(env = process.env) {
  const capabilities = getCapabilityProviders(env);

  const required = new Set();

  for (const capability of CAPABILITIES) {
    const provider = capabilities[capability];

    /*
      Support is proven before the key is looked up. An unsupported provider is
      reported by getProviderConfigurationProblems and contributes no key here -
      but it can no longer pass unnoticed, because boot validation and strict
      readiness both consult those problems and refuse the configuration.
    */
    if (!isProviderSupported(capability, provider)) {
      continue;
    }

    const keyName = PROVIDER_API_KEYS[provider];

    if (keyName) {
      required.add(keyName);
    }
  }

  return [...required].sort();
}

/*
  A non-sensitive description of which provider owns each capability, for
  protected observability. Contains configuration NAMES and provider IDS only:
  no key values, no quotas, no endpoints, no provider account detail.
*/
function getProviderSelectionSnapshot(env = process.env) {
  const capabilities = getCapabilityProviders(env);
  const providerCapabilities = getProviderCapabilities(env);

  return {
    cacheContractVersion: CACHE_CONTRACT_VERSION,
    defaults: { ...DEFAULTS },
    capabilities,
    capabilityLabels: Object.fromEntries(
      Object.entries(capabilities).map(([capability, provider]) => [
        capability,
        getProviderLabel(provider),
      ]),
    ),
    usesDefaults: CAPABILITIES.every(
      (capability) => capabilities[capability] === DEFAULTS[capability],
    ),
    featureFlags: {
      twelveDataProfileEnabled: providerCapabilities.twelveDataProfile,
    },
    /*
      There is no cross-provider fallback in any capability. Every dispatch
      below resolves to exactly one provider or throws. This field exists so
      PR B can prove that from a protected endpoint rather than from a promise
      in a document.
    */
    fallbackEnabled: false,
    requiredProviderKeys: getRequiredProviderKeys(env),
    activeProviders: [...new Set(Object.values(capabilities))].sort(),
    /*
      Configuration problems, for the PROTECTED metrics endpoint only. Variable
      names and provider ids, never a key value.
    */
    configurationProblems: getProviderConfigurationProblems(env),
  };
}

// ==================================================
// Capability dispatch
// ==================================================

async function getQuote(symbol) {
  const provider = configuredProvider("quote");
  if (provider === "finnhub") return finnhub().getFinnhubQuote(symbol);
  if (provider === "twelve_data") {
    return twelveData().getTwelveDataQuote(symbol);
  }
  return unsupported("quote", provider);
}

async function getCompanyProfile(symbol) {
  const provider = configuredProvider("profile");
  if (provider === "finnhub") return finnhub().getFinnhubCompanyProfile(symbol);
  if (provider === "twelve_data") {
    if (!getProviderCapabilities().twelveDataProfile) {
      return capabilityDisabled(
        "profile",
        "twelve_data",
        "TWELVE_DATA_PROFILE_ENABLED",
      );
    }

    /*
      Twelve Data only. No Finnhub fallback, and no Finnhub enrichment.

      The removed enrichment call ran UNCONDITIONALLY - before the `||` that
      looked like it made it conditional - so every Twelve Data profile bought
      a Finnhub request even when Twelve Data had already answered. It existed
      solely to populate `ipoDate`, which feeds no calculation, verdict, risk
      value, guidance state, Shariah gate or scanner decision and appears in
      exactly one presentation row.

      Under Twelve Data that row reads "Unavailable", which is the truth. It is
      not filled from Finnhub, and it is not filled from `/ipo_calendar` - a
      100-credit date-ranged event feed that returns nothing for a company
      listed decades ago.
    */
    return twelveData().getTwelveDataCompanyProfile(symbol);
  }
  return unsupported("profile", provider);
}

async function searchSymbols(query, limit) {
  const provider = configuredProvider("search");
  if (provider === "finnhub") return finnhub().searchListedEquities(query, limit);
  if (provider === "twelve_data") {
    return twelveData().searchTwelveDataEquities(query, limit);
  }
  return unsupported("search", provider);
}

async function getHistoricalCandles(symbol, interval) {
  const provider = configuredProvider("history");
  if (provider === "twelve_data") {
    return twelveData().getHistoricalData(symbol, interval);
  }
  if (provider === "finnhub") {
    return finnhub().getHistoricalCandles(symbol, interval);
  }
  return unsupported("history", provider);
}

/*
  Dispatches on its OWN capability. It no longer re-enters getCompanyProfile,
  so FUNDAMENTALS_PROVIDER can never be overridden by PROFILE_PROVIDER.

  Under the accepted defaults (fundamentals: finnhub, profile: finnhub) the
  returned record is identical to the previous delegating implementation, which
  is what keeps default behaviour invariant.
*/
async function getFundamentals(symbol) {
  const provider = configuredProvider("fundamentals");
  if (provider === "finnhub") {
    return finnhub().getFinnhubCompanyProfile(symbol);
  }
  if (provider === "twelve_data") {
    if (!getProviderCapabilities().twelveDataProfile) {
      return capabilityDisabled(
        "fundamentals",
        "twelve_data",
        "TWELVE_DATA_PROFILE_ENABLED",
      );
    }

    return twelveData().getTwelveDataCompanyProfile(symbol);
  }
  return unsupported("fundamentals", provider);
}

module.exports = {
  CAPABILITIES,
  CAPABILITY_PROVIDER_MATRIX,
  CAPABILITY_REQUIRED_FLAGS,
  DEFAULTS,
  PROVIDER_API_KEYS,
  PROVIDER_LABELS,
  getProviderConfigurationProblems,
  isProviderSupported,
  getCapabilityOwnership,
  getCapabilityProviders,
  getCompanyProfile,
  getProviderCapabilities,
  getProviderLabel,
  getProviderSelectionSnapshot,
  getFundamentals,
  getHistoricalCandles,
  getQuote,
  getRequiredProviderKeys,
  searchSymbols,
};
