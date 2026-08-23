"use strict";

/*
  Capability dispatch, configuration truth and the accepted production defaults.

  Zero network. Zero provider credits: every provider function is replaced with
  a counting stub, and the suite fails if a call reaches a provider it was not
  supposed to.
*/

const assert = require("node:assert/strict");

const adapter = require("../providers/marketDataProvider");

// ====================================================================
// 1. The accepted production defaults, pinned byte-for-byte
// ====================================================================

/*
  PR A adds Twelve Data parity BEHIND explicit capability selection. It does
  not switch production. If this assertion ever fails, a default changed, and
  that is a PR B decision requiring endpoint and plan access, external-display
  authorization, parity evidence, cache-transition verification and explicit
  production authorization - none of which a code change can grant itself.
*/
assert.deepEqual(adapter.DEFAULTS, {
  quote: "finnhub",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

assert.equal(
  Object.isFrozen(adapter.DEFAULTS),
  true,
  "the accepted defaults must not be mutable at runtime"
);

assert.deepEqual(adapter.getCapabilityProviders({}), {
  quote: "finnhub",
  profile: "finnhub",
  search: "finnhub",
  history: "twelve_data",
  fundamentals: "finnhub",
});

assert.deepEqual(
  adapter.getCapabilityProviders({
    QUOTE_PROVIDER: " Twelve_Data ",
    SEARCH_PROVIDER: "finnhub",
  }),
  {
    quote: "twelve_data",
    profile: "finnhub",
    search: "finnhub",
    history: "twelve_data",
    fundamentals: "finnhub",
  }
);

assert.deepEqual(adapter.getProviderCapabilities({}), {
  twelveDataProfile: false,
});
assert.deepEqual(
  adapter.getProviderCapabilities({ TWELVE_DATA_PROFILE_ENABLED: "true" }),
  { twelveDataProfile: true }
);

// ====================================================================
// 2. Provider ids, labels and the keys each one requires
// ====================================================================

assert.equal(adapter.getProviderLabel("finnhub"), "Finnhub");
assert.equal(adapter.getProviderLabel("twelve_data"), "TwelveData");
assert.equal(adapter.getProviderLabel("nonsense"), "Unknown");

assert.deepEqual(adapter.getRequiredProviderKeys({}), [
  "FINNHUB_API_KEY",
  "TWELVE_DATA_API_KEY",
]);

assert.deepEqual(
  adapter.getRequiredProviderKeys({
    QUOTE_PROVIDER: "twelve_data",
    PROFILE_PROVIDER: "twelve_data",
    SEARCH_PROVIDER: "twelve_data",
    FUNDAMENTALS_PROVIDER: "twelve_data",
  }),
  ["TWELVE_DATA_API_KEY"],
  "a selection that uses no Finnhub capability must not require a Finnhub key"
);

assert.deepEqual(
  adapter.getRequiredProviderKeys({ HISTORY_PROVIDER: "finnhub" }),
  ["FINNHUB_API_KEY"],
  "a wholly Finnhub selection must not require a Twelve Data key"
);

// ====================================================================
// 3. Fundamentals configuration ownership
// ====================================================================

/*
  Two separate truths that the variable names alone get wrong.

  FUNDAMENTALS_PROVIDER used to be decorative: getFundamentals delegated to
  getCompanyProfile, which re-dispatched on PROFILE_PROVIDER, so the variable
  appeared to control a capability it did not. It now dispatches on its own
  capability.

  And the MOUNTED Fundamentals workspace is not served by getFundamentals at
  all - that function has no caller anywhere in the repository. The workspace
  reads market.companyProfile, which comes from the PROFILE capability. So
  PROFILE_PROVIDER owns what a user actually sees on that screen.
*/
const ownership = adapter.getCapabilityOwnership().fundamentals;

assert.equal(ownership.configVariable, "FUNDAMENTALS_PROVIDER");
assert.equal(ownership.dispatchesThroughProfileProvider, false);
assert.equal(ownership.mountedFundamentalsSurfaceOwnedBy, "profile");
assert.deepEqual(ownership.mountedConsumers, []);

/*
  No statement endpoint is implemented, and none may be added speculatively.
  The mounted product reports financial statements, valuation, earnings,
  filings and ownership as UNAVAILABLE and says so on screen. Buying data no
  screen renders would be pure provider cost - `/income_statement` alone is
  100 API credits per symbol.
*/
assert.deepEqual(ownership.statementEndpointsImplemented, []);

/*
  Scanned with comments stripped, deliberately.

  The adapter EXPLAINS in prose why it does not call /ipo_calendar, and a naive
  substring scan would match that explanation and report the very thing the
  comment exists to prevent. A control that fails on its own documentation is
  not evidence of anything.
*/
function executableSource(modulePath) {
  return require("node:fs")
    .readFileSync(require.resolve(modulePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const providerSource = executableSource(
  "../providers/twelveDataProvider.js"
);

assert.ok(
  providerSource.includes("/symbol_search"),
  "the comment-stripping scan must still see real endpoint usage"
);

for (const endpoint of [
  "income_statement",
  "balance_sheet",
  "cash_flow",
  "statistics",
  "ipo_calendar",
  "earnings",
]) {
  assert.equal(
    providerSource.includes(`/${endpoint}`),
    false,
    `no mounted field needs ${endpoint}; it must not be requested`
  );
}

/*
  The static proof behind mountedConsumers: no MOUNTED code calls
  getFundamentals - only its own definition and export.

  Test files are excluded deliberately. The claim is about the mounted product,
  and a suite that exercises the capability directly is not a mounted consumer.
  Scanning them too also made this assertion depend on which files happened to
  be tracked at the time it ran: `git grep` only sees tracked files, so a suite
  calling getFundamentals passed while it was untracked and failed the moment it
  was committed. An assertion whose result depends on staging state is not
  evidence about the product.

  Production paths are still scanned in full: if any route, service, engine or
  frontend module starts calling getFundamentals, this fails and the ownership
  map has to change with it.
*/
const { execFileSync } = require("node:child_process");
const callers = execFileSync(
  "git",
  [
    "grep",
    "-l",
    "getFundamentals",
    "--",
    "backend",
    "frontend",
    ":(exclude)backend/tests",
    ":(exclude)frontend/src/**/*.test.*",
    ":(exclude)frontend/e2e",
  ],
  { cwd: require("node:path").resolve(__dirname, "../.."), encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  .filter((file) => file !== "backend/providers/marketDataProvider.js");

assert.deepEqual(
  callers,
  [],
  "getFundamentals has no mounted caller; if that changes, the ownership map must change with it"
);

(async () => {
  const finnhubProvider = require("../providers/finnhubProvider");
  const twelveDataProvider = require("../providers/twelveDataProvider");

  const originals = {
    finnhubProfile: finnhubProvider.getFinnhubCompanyProfile,
    finnhubQuote: finnhubProvider.getFinnhubQuote,
    finnhubSearch: finnhubProvider.searchListedEquities,
    twelveDataProfile: twelveDataProvider.getTwelveDataCompanyProfile,
    twelveDataQuote: twelveDataProvider.getTwelveDataQuote,
    twelveDataSearch: twelveDataProvider.searchTwelveDataEquities,
  };

  const savedEnv = {};
  for (const key of [
    "QUOTE_PROVIDER",
    "PROFILE_PROVIDER",
    "SEARCH_PROVIDER",
    "FUNDAMENTALS_PROVIDER",
    "TWELVE_DATA_PROFILE_ENABLED",
  ]) {
    savedEnv[key] = process.env[key];
  }

  const calls = {
    finnhubProfile: 0,
    finnhubQuote: 0,
    finnhubSearch: 0,
    twelveDataProfile: 0,
    twelveDataQuote: 0,
    twelveDataSearch: 0,
  };

  function resetCalls() {
    for (const key of Object.keys(calls)) calls[key] = 0;
  }

  try {
    finnhubProvider.getFinnhubCompanyProfile = async (symbol) => {
      calls.finnhubProfile += 1;
      return {
        success: true,
        provider: "Finnhub",
        symbol,
        data: { ticker: symbol, name: "Finnhub Co", ipoDate: "1980-12-12" },
      };
    };
    finnhubProvider.getFinnhubQuote = async (symbol) => {
      calls.finnhubQuote += 1;
      return { success: true, provider: "Finnhub", symbol, data: { symbol } };
    };
    finnhubProvider.searchListedEquities = async () => {
      calls.finnhubSearch += 1;
      return [{ symbol: "EXM", name: "Example", securityType: "Common Stock" }];
    };
    twelveDataProvider.getTwelveDataCompanyProfile = async (symbol) => {
      calls.twelveDataProfile += 1;
      return {
        success: true,
        provider: "TwelveData",
        symbol,
        data: { ticker: symbol, name: "Twelve Data Co", ipoDate: null },
      };
    };
    twelveDataProvider.getTwelveDataQuote = async (symbol) => {
      calls.twelveDataQuote += 1;
      return { success: true, provider: "TwelveData", symbol, data: { symbol } };
    };
    twelveDataProvider.searchTwelveDataEquities = async () => {
      calls.twelveDataSearch += 1;
      return [
        {
          symbol: "EXM",
          name: "Example",
          securityType: "Common Stock",
          provider: "TwelveData",
        },
      ];
    };

    // ----------------------------------------------------------------
    // 4. Default selection still routes every capability to Finnhub
    // ----------------------------------------------------------------
    for (const key of Object.keys(savedEnv)) delete process.env[key];
    resetCalls();

    assert.equal((await adapter.getQuote("AAPL")).provider, "Finnhub");
    assert.equal((await adapter.getCompanyProfile("AAPL")).provider, "Finnhub");
    assert.equal((await adapter.searchSymbols("apple"))[0].symbol, "EXM");
    assert.equal((await adapter.getFundamentals("AAPL")).provider, "Finnhub");

    assert.deepEqual(calls, {
      finnhubProfile: 2,
      finnhubQuote: 1,
      finnhubSearch: 1,
      twelveDataProfile: 0,
      twelveDataQuote: 0,
      twelveDataSearch: 0,
    });

    // ----------------------------------------------------------------
    // 5. A selected-but-disabled capability fails explicitly
    // ----------------------------------------------------------------
    /*
      This path used to return a complete Finnhub profile in silence. An
      operator could set PROFILE_PROVIDER=twelve_data, watch the service come
      up healthy, and believe the migration was live while every profile was
      still being bought from Finnhub - the response even carried
      provider: "Finnhub", which was true and therefore unremarkable.

      A configuration mistake must be loud. It is recoverable in minutes when
      it is visible, and invisible for months when it is not.
    */
    process.env.PROFILE_PROVIDER = "twelve_data";
    delete process.env.TWELVE_DATA_PROFILE_ENABLED;
    resetCalls();

    await assert.rejects(adapter.getCompanyProfile("AAPL"), (error) => {
      assert.equal(error.code, "PROVIDER_CAPABILITY_DISABLED");
      assert.equal(error.capability, "profile");
      assert.equal(error.provider, "twelve_data");
      assert.equal(error.requiredFlag, "TWELVE_DATA_PROFILE_ENABLED");
      assert.match(error.message, /TWELVE_DATA_PROFILE_ENABLED/);
      return true;
    });

    assert.equal(
      calls.finnhubProfile,
      0,
      "a disabled Twelve Data capability must never silently serve Finnhub"
    );
    assert.equal(calls.twelveDataProfile, 0);

    // The same rule applies to fundamentals.
    process.env.FUNDAMENTALS_PROVIDER = "twelve_data";
    resetCalls();

    await assert.rejects(adapter.getFundamentals("AAPL"), (error) => {
      assert.equal(error.code, "PROVIDER_CAPABILITY_DISABLED");
      assert.equal(error.capability, "fundamentals");
      return true;
    });
    assert.equal(calls.finnhubProfile, 0);

    // ----------------------------------------------------------------
    // 6. An enabled Twelve Data profile uses Twelve Data ONLY
    // ----------------------------------------------------------------
    process.env.TWELVE_DATA_PROFILE_ENABLED = "true";
    resetCalls();

    const profile = await adapter.getCompanyProfile("AAPL");

    assert.equal(profile.provider, "TwelveData");
    assert.equal(calls.twelveDataProfile, 1);
    assert.equal(
      calls.finnhubProfile,
      0,
      "no Finnhub fallback and no Finnhub IPO enrichment"
    );

    /*
      The removed enrichment call ran unconditionally - before the `||` that
      looked like it made it conditional - so every Twelve Data profile bought
      a Finnhub request even when Twelve Data had already answered. It existed
      only to populate ipoDate, which feeds no calculation, verdict, risk
      value, guidance state, Shariah gate or scanner decision and appears in
      exactly one presentation row.
    */
    assert.equal(
      profile.data.ipoDate,
      null,
      "a missing IPO date stays unavailable rather than being bought from Finnhub"
    );
    assert.equal(profile.data.name, "Twelve Data Co");

    // ----------------------------------------------------------------
    // 7. Quote and search dispatch to Twelve Data with no fallback
    // ----------------------------------------------------------------
    process.env.QUOTE_PROVIDER = "twelve_data";
    process.env.SEARCH_PROVIDER = "twelve_data";
    resetCalls();

    assert.equal((await adapter.getQuote("AAPL")).provider, "TwelveData");
    assert.equal(
      (await adapter.searchSymbols("apple"))[0].provider,
      "TwelveData"
    );
    assert.equal((await adapter.getFundamentals("AAPL")).provider, "TwelveData");

    assert.deepEqual(calls, {
      finnhubProfile: 0,
      finnhubQuote: 0,
      finnhubSearch: 0,
      twelveDataProfile: 1,
      twelveDataQuote: 1,
      twelveDataSearch: 1,
    });

    // A failing Twelve Data quote must NOT fall back to Finnhub.
    twelveDataProvider.getTwelveDataQuote = async (symbol) => {
      calls.twelveDataQuote += 1;
      return {
        success: false,
        provider: "TwelveData",
        symbol,
        error: "Twelve Data rate limit was reached.",
        code: "TWELVE_DATA_RATE_LIMIT",
      };
    };
    resetCalls();

    const failedQuote = await adapter.getQuote("AAPL");
    assert.equal(
      failedQuote.success,
      false,
      "a failing Twelve Data quote must stay failed, not be papered over with Finnhub"
    );
    assert.equal(failedQuote.provider, "TwelveData");
    assert.equal(
      calls.finnhubQuote,
      0,
      "a Twelve Data quote failure must be reported, not papered over with Finnhub"
    );

    // ----------------------------------------------------------------
    // 8. FUNDAMENTALS_PROVIDER is no longer overridden by PROFILE_PROVIDER
    // ----------------------------------------------------------------
    twelveDataProvider.getTwelveDataQuote = originals.twelveDataQuote;
    process.env.FUNDAMENTALS_PROVIDER = "finnhub";
    process.env.PROFILE_PROVIDER = "twelve_data";
    process.env.TWELVE_DATA_PROFILE_ENABLED = "true";
    resetCalls();

    const fundamentals = await adapter.getFundamentals("AAPL");

    assert.equal(
      fundamentals.provider,
      "Finnhub",
      "FUNDAMENTALS_PROVIDER=finnhub must mean Finnhub even when the profile capability is Twelve Data"
    );
    assert.equal(calls.finnhubProfile, 1);
    assert.equal(calls.twelveDataProfile, 0);

    // ----------------------------------------------------------------
    // 9. An unimplemented provider fails loudly, never silently
    // ----------------------------------------------------------------
    for (const [variable, call] of [
      ["QUOTE_PROVIDER", () => adapter.getQuote("AAPL")],
      ["PROFILE_PROVIDER", () => adapter.getCompanyProfile("AAPL")],
      ["SEARCH_PROVIDER", () => adapter.searchSymbols("apple")],
      ["FUNDAMENTALS_PROVIDER", () => adapter.getFundamentals("AAPL")],
    ]) {
      const saved = process.env[variable];
      process.env[variable] = "alphavantage";
      resetCalls();

      await assert.rejects(call(), (error) => {
        assert.equal(error.code, "PROVIDER_CAPABILITY_UNSUPPORTED");
        return true;
      });

      assert.equal(
        Object.values(calls).reduce((sum, count) => sum + count, 0),
        0,
        `${variable}=alphavantage must reach no provider at all`
      );

      if (saved === undefined) delete process.env[variable];
      else process.env[variable] = saved;
    }

    // ----------------------------------------------------------------
    // 10. Behavioural pin for mountedFundamentalsSurfaceOwnedBy
    // ----------------------------------------------------------------
    /*
      Until now this field was a claim asserted against itself: the test read
      the string "profile" out of the ownership object and compared it to the
      literal "profile". That proves the object is internally consistent and
      nothing else - the claim could have been false about the product and the
      assertion would still have passed.

      What the field actually claims is that the MOUNTED Fundamentals workspace
      gets its company data through the PROFILE capability, not through the
      FUNDAMENTALS_PROVIDER selector. That is a statement about dispatch, so it
      is provable by dispatch.

      The method: run the real mounted path - marketEngine.getMarketData feeding
      masterAnalysisService.buildFundamentalsSnapshot, which is exactly how the
      workspace is populated - twice, with PROFILE_PROVIDER and
      FUNDAMENTALS_PROVIDER set to OPPOSITE providers, and see which selector
      the displayed data follows. A spy on getFundamentals proves the mounted
      path never touches the decorative selector at all.

      This fails if mounted ownership moves away from profile, if the mounted
      consumer starts dispatching through another selector, or if the ownership
      report diverges from real dispatch. No production surface was widened to
      make it possible.
    */
    const marketEngine = require("../services/marketEngine");
    const masterAnalysisService = require("../services/masterAnalysisService");

    const originalGetFundamentals = adapter.getFundamentals;
    let mountedFundamentalsCalls = 0;
    adapter.getFundamentals = async (...args) => {
      mountedFundamentalsCalls += 1;
      return originalGetFundamentals(...args);
    };

    try {
      const observed = [];

      for (const [profileProvider, fundamentalsProvider] of [
        ["twelve_data", "finnhub"],
        ["finnhub", "twelve_data"],
      ]) {
        process.env.PROFILE_PROVIDER = profileProvider;
        process.env.FUNDAMENTALS_PROVIDER = fundamentalsProvider;
        process.env.TWELVE_DATA_PROFILE_ENABLED = "true";
        process.env.QUOTE_PROVIDER = "finnhub";
        resetCalls();
        mountedFundamentalsCalls = 0;

        const market = await marketEngine.getMarketData("AAPL");
        const snapshot = masterAnalysisService.buildFundamentalsSnapshot({
          market,
          generatedAt: "2026-08-22T12:00:00.000Z",
        });

        assert.equal(
          snapshot.success,
          true,
          "the mounted fundamentals surface must be populated for this probe to mean anything"
        );

        /*
          Which capability produced the displayed company name? The two stubs
          return distinguishable names, so the answer is read off the product
          output rather than assumed.
        */
        const displayedName = snapshot.companyProfile.name;
        const producedBy =
          displayedName === "Twelve Data Co"
            ? "twelve_data"
            : displayedName === "Finnhub Co"
              ? "finnhub"
              : "unknown";

        observed.push({
          profileProvider,
          fundamentalsProvider,
          producedBy,
          followedSelector:
            producedBy === profileProvider
              ? "profile"
              : producedBy === fundamentalsProvider
                ? "fundamentals"
                : "unknown",
          fundamentalsDispatches: mountedFundamentalsCalls,
        });
      }

      assert.deepEqual(
        observed.map((run) => run.followedSelector),
        ["profile", "profile"],
        "the mounted fundamentals surface must follow PROFILE_PROVIDER under both opposing configurations"
      );

      assert.deepEqual(
        observed.map((run) => run.fundamentalsDispatches),
        [0, 0],
        "the mounted fundamentals surface must never dispatch through FUNDAMENTALS_PROVIDER"
      );

      /*
        Finally, tie the observation back to the reported claim. This compares
        the report against MEASURED dispatch, so the two cannot drift apart.
      */
      const observedOwner = observed[0].followedSelector;
      assert.equal(
        adapter.getCapabilityOwnership().fundamentals
          .mountedFundamentalsSurfaceOwnedBy,
        observedOwner,
        "the ownership report must match the capability that actually produced the mounted surface"
      );
    } finally {
      adapter.getFundamentals = originalGetFundamentals;
    }

    console.log(
      "Provider adapter defaults, dispatch, capability-ownership and call-budget tests passed."
    );
  } finally {
    finnhubProvider.getFinnhubCompanyProfile = originals.finnhubProfile;
    finnhubProvider.getFinnhubQuote = originals.finnhubQuote;
    finnhubProvider.searchListedEquities = originals.finnhubSearch;
    twelveDataProvider.getTwelveDataCompanyProfile = originals.twelveDataProfile;
    twelveDataProvider.getTwelveDataQuote = originals.twelveDataQuote;
    twelveDataProvider.searchTwelveDataEquities = originals.twelveDataSearch;

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
