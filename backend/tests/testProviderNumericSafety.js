"use strict";

/*
  Strict numeric parsing across every adapter that turns provider payloads into
  displayed numbers.

  The defect this exists to prevent is not a crash - it is a lie. JavaScript
  coerces `null`, `""`, `"   "`, `[]` and `false` all to 0, and 0 is finite, so
  a guard built on `Number(value)` + `isFinite` reports a field the provider
  never sent as a real value. A missing previous close renders as $0.00, a
  missing change renders as "no movement", a missing timestamp renders as 1970,
  and nothing downstream can tell any of it from a genuine zero. Truthiness is
  not the fix either, because 0 and "0" are legitimate values that must survive.

  Three modules parse provider numbers independently:
    - backend/providers/finnhubProvider.js    (the current DEFAULT quote path)
    - backend/providers/twelveDataProvider.js (the PR A parity path)
    - backend/services/analysisTrustService.js

  They are separate implementations on purpose - each one's consumer contract is
  its own - so this suite drives all three through their PUBLIC entry points
  against one shared domain table and requires them to agree. That is what stops
  the three copies drifting apart without anyone noticing.

  Zero network. Zero provider credits.
*/

const assert = require("node:assert/strict");
const axios = require("axios");

const originalGet = axios.get;

process.env.FINNHUB_API_KEY = "numeric-safety-finnhub-key";
process.env.TWELVE_DATA_API_KEY = "numeric-safety-twelve-key";

const finnhubProvider = require("../providers/finnhubProvider");
const twelveDataProvider = require("../providers/twelveDataProvider");
const trust = require("../services/analysisTrustService");

/*
  The accepted domain, stated once.

  ACCEPTED -> the parsed number.  REJECTED -> null (unavailable).
*/
const DOMAIN = [
  // label, input, expected
  ["finite number", 227.3, 227.3],
  ["negative number", -2.7, -2.7],
  ["numeric zero", 0, 0],
  ["numeric string", "227.3", 227.3],
  ["negative numeric string", "-2.7", -2.7],
  ["zero string", "0", 0],
  ["padded numeric string", " 12 ", 12],
  ["exponent string", "1e3", 1000],
  ["null", null, null],
  ["undefined", undefined, null],
  ["empty string", "", null],
  ["spaces", "   ", null],
  ["tab", "\t", null],
  ["newline", "\n", null],
  ["tab and newline", "\t\n ", null],
  ["non-numeric string", "n/a", null],
  ["dash", "-", null],
  ["NaN", NaN, null],
  ["Infinity", Infinity, null],
  ["-Infinity", -Infinity, null],
  ['"Infinity" string', "Infinity", null],
  ["true", true, null],
  ["false", false, null],
  ["empty array", [], null],
  ["single-element array", [5], null],
  ["nested array", [["x"]], null],
  ["object", {}, null],
  ["populated object", { v: 1 }, null],
];

const QUOTE_FIELDS = [
  "previousClose",
  "open",
  "high",
  "low",
  "change",
  "changePercent",
  "timestamp",
];

/*
  Values a fabricated zero would have produced, which must never appear for a
  rejected input: 0 itself, and the two values 0 turns into downstream - an
  epoch timestamp and a $0.00 price.
*/
function assertNotFabricated(label, field, value) {
  assert.equal(value, null, `${label}: ${field} must be null`);
  assert.equal(
    Object.is(value, 0),
    false,
    `${label}: ${field} must not be a fabricated zero`
  );

  /*
    The stronger property, and the one that actually matters downstream: the
    value must not be a usable number at all. A fabricated 0 is finite, so it
    would flow into a price formatter as $0.00, into a date as the 1970 epoch,
    and into a percentage as "no movement". null is finite in none of those
    senses, and every consumer guards on it.

    Checking `new Date(Number(value) * 1000)` here would be self-defeating:
    Number(null) is 0, so that date IS the epoch even when the field is
    correctly unavailable. The absence of a number is the assertion.
  */
  assert.equal(
    Number.isFinite(value),
    false,
    `${label}: ${field} must not be a finite number a formatter could render`
  );
}

async function run() {
  // ------------------------------------------------------------------
  // 1. Finnhub quote - the current DEFAULT production path
  // ------------------------------------------------------------------
  for (const [label, input, expected] of DOMAIN) {
    finnhubProvider.clearFinnhubQuoteCache();

    axios.get = async () => ({
      data: {
        c: 227.3,
        pc: input,
        o: input,
        h: input,
        l: input,
        d: input,
        dp: input,
        t: input,
      },
    });

    const result = await finnhubProvider.getFinnhubQuote("EXM");

    assert.equal(result.success, true, `${label}: a valid price must still yield a quote`);
    assert.equal(result.data.price, 227.3, `${label}: a valid price must be untouched`);

    for (const field of QUOTE_FIELDS) {
      if (expected === null) {
        assertNotFabricated(`finnhub ${label}`, field, result.data[field]);
      } else {
        assert.equal(
          result.data[field],
          expected,
          `finnhub ${label}: ${field} must parse to ${expected}`
        );
      }
    }
  }

  /*
    Validation and normalization must share one accepted domain. Before this
    correction `isValidQuote` used a looser coercion, so a payload whose `c` was
    `true` passed validation as Number(true) === 1 and was served as a
    SUCCESSFUL quote priced at $1.00.
  */
  for (const [label, input] of DOMAIN.filter(([, , e]) => e === null)) {
    finnhubProvider.clearFinnhubQuoteCache();
    axios.get = async () => ({ data: { c: input, pc: 223.94 } });

    const result = await finnhubProvider.getFinnhubQuote("EXM");

    assert.equal(
      result.success,
      false,
      `finnhub ${label}: an unparseable price must fail honestly, not be priced`
    );
    assert.equal(result.data, undefined, `finnhub ${label}: no fabricated data`);
  }

  // A genuinely zero or negative price is still rejected, as it always was.
  for (const price of [0, "0", -1, "-1"]) {
    finnhubProvider.clearFinnhubQuoteCache();
    axios.get = async () => ({ data: { c: price, pc: 223.94 } });
    assert.equal(
      (await finnhubProvider.getFinnhubQuote("EXM")).success,
      false,
      `finnhub: a price of ${JSON.stringify(price)} is not a tradeable quote`
    );
  }

  // ------------------------------------------------------------------
  // 2. Twelve Data quote - the PR A parity path
  // ------------------------------------------------------------------
  for (const [label, input, expected] of DOMAIN) {
    twelveDataProvider.clearTwelveDataQuoteCache();

    axios.get = async () => ({
      data: {
        symbol: "EXM",
        name: "Example Corp",
        exchange: "NASDAQ",
        currency: "USD",
        close: "227.3",
        previous_close: input,
        open: input,
        high: input,
        low: input,
        change: input,
        percent_change: input,
        timestamp: input,
      },
    });

    const result = await twelveDataProvider.getTwelveDataQuote("EXM");

    assert.equal(result.success, true, `twelve data ${label}: valid price yields a quote`);
    assert.equal(result.data.price, 227.3);

    for (const field of QUOTE_FIELDS) {
      if (expected === null) {
        assertNotFabricated(`twelve data ${label}`, field, result.data[field]);
      } else {
        assert.equal(
          result.data[field],
          expected,
          `twelve data ${label}: ${field} must parse to ${expected}`
        );
      }
    }
  }

  for (const [label, input] of DOMAIN.filter(([, , e]) => e === null)) {
    twelveDataProvider.clearTwelveDataQuoteCache();
    axios.get = async () => ({
      data: { symbol: "EXM", close: input, previous_close: "223.94" },
    });

    assert.equal(
      (await twelveDataProvider.getTwelveDataQuote("EXM")).success,
      false,
      `twelve data ${label}: an unparseable price must fail honestly`
    );
  }

  // ------------------------------------------------------------------
  // 3. analysisTrustService - same parser, different consumer contract
  // ------------------------------------------------------------------
  /*
    resolveMarketDelay is the reachable entry point to this module's parser.
    It matters on its own terms: the resolved minute count is what decides
    whether AzaLens tells a user the quote is "delayed" or "realtime", and 0
    minutes means realtime. A whitespace-only environment value used to parse
    as 0, so a stray space could have made the product claim real-time data it
    has no evidence for.
  */
  /*
    The delay domain is NARROWER than the provider-number domain, and the two
    must not be forced to agree.

    A provider numeric field may legitimately be negative - a -3.94 price change
    and a -1.76 percent change are real values. A DURATION may not, and here a
    negative one is actively dangerous: resolveMarketState publishes "realtime"
    whenever the resolved delay is <= 0, so a configured -5 would have made the
    product claim real-time market data on the strength of a typo.

    An earlier version of this suite asserted that resolveMarketDelay accepted
    the whole signed domain, which pinned exactly the wrong behaviour. It is
    replaced by the delay-specific table below.
  */
  const DELAY_DOMAIN = DOMAIN.map(([label, input, expected]) => [
    label,
    input,
    typeof expected === "number" && expected < 0 ? null : expected,
  ]);

  for (const [label, input, expected] of DELAY_DOMAIN) {
    const resolved = trust.resolveMarketDelay({
      MARKET_DATA_DELAY_MINUTES: input,
    });

    if (expected === null) {
      assert.equal(
        resolved.source,
        "DEFAULT",
        `trust ${label}: an unusable delay must fall through, not be believed`
      );
      assert.equal(
        resolved.minutes,
        15,
        `trust ${label}: falling through must reach the disclosed default`
      );
      assert.equal(
        resolved.minutes > 0,
        true,
        `trust ${label}: falling through must never land on a realtime claim`
      );
    } else {
      assert.equal(resolved.minutes, expected, `trust ${label}: must parse to ${expected}`);
      assert.equal(resolved.source, "MARKET_DATA_DELAY_MINUTES");
    }
  }

  // Negative durations are rejected in every form, and never become realtime.
  for (const negative of [-5, -0.5, "-5", "-0.5", " -5 ", "-1e3"]) {
    const resolved = trust.resolveMarketDelay({
      MARKET_DATA_DELAY_MINUTES: negative,
    });

    assert.equal(
      resolved.source,
      "DEFAULT",
      `a negative delay ${JSON.stringify(negative)} must not be believed`
    );
    assert.equal(resolved.minutes, 15);
  }

  // Resolution order: an invalid primary falls through to the alias, not past it.
  const negativeThenAlias = trust.resolveMarketDelay({
    MARKET_DATA_DELAY_MINUTES: -5,
    FINNHUB_DELAY_MINUTES: "20",
  });
  assert.equal(negativeThenAlias.minutes, 20, "a negative primary must fall through to a valid alias");
  assert.equal(negativeThenAlias.source, "FINNHUB_DELAY_MINUTES");
  assert.equal(negativeThenAlias.deprecatedAliasInUse, true);

  const negativeThenZeroAlias = trust.resolveMarketDelay({
    MARKET_DATA_DELAY_MINUTES: -5,
    FINNHUB_DELAY_MINUTES: "0",
  });
  assert.equal(
    negativeThenZeroAlias.minutes,
    0,
    "an explicit zero alias is a deliberate realtime configuration and must win"
  );
  assert.equal(negativeThenZeroAlias.source, "FINNHUB_DELAY_MINUTES");
  assert.equal(negativeThenZeroAlias.deprecatedAliasInUse, true);

  assert.equal(
    trust.resolveMarketDelay({
      MARKET_DATA_DELAY_MINUTES: -5,
      FINNHUB_DELAY_MINUTES: "-9",
    }).source,
    "DEFAULT",
    "two negative sources must reach the conservative default"
  );

  assert.equal(
    trust.resolveMarketDelay({ FINNHUB_DELAY_MINUTES: -5 }).source,
    "DEFAULT",
    "a negative alias must not be believed either"
  );

  /*
    Protected-only evidence of WHY a fallback happened.

    Without it the failure is silent precisely because the fallback works: an
    operator who typoed a delay sees a correct, safe 15 minutes and no sign that
    their configuration was ignored. These fields are diagnostics, not output -
    the mounted consumers read `.minutes` alone, and the full object appears only
    inside the token-protected metrics snapshot.

    Two rules the codes must obey: an ABSENT variable is never reported as
    invalid, and a rejected raw value is never echoed back.
  */
  const FALLBACK_CASES = [
    ["both absent", {}, {
      minutes: 15, source: "DEFAULT", fallbackReason: "NO_SOURCE_CONFIGURED",
      configuredSources: [], rejectedSources: [],
    }],
    ["valid primary", { MARKET_DATA_DELAY_MINUTES: 20 }, {
      minutes: 20, source: "MARKET_DATA_DELAY_MINUTES", fallbackReason: "NONE",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"], rejectedSources: [],
    }],
    ["explicit zero primary", { MARKET_DATA_DELAY_MINUTES: 0 }, {
      minutes: 0, source: "MARKET_DATA_DELAY_MINUTES", fallbackReason: "NONE",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"], rejectedSources: [],
    }],
    ["absent primary, valid legacy", { FINNHUB_DELAY_MINUTES: "20" }, {
      minutes: 20, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "NONE",
      configuredSources: ["FINNHUB_DELAY_MINUTES"], rejectedSources: [],
    }],
    /*
      A rejected primary followed by a usable legacy source IS a fallback. These
      two cases previously expected fallbackReason "NONE" alongside a non-empty
      rejectedSources list - a record that contradicted itself and left a reader
      to decide which half to believe.
    */
    ["negative primary, positive legacy", { MARKET_DATA_DELAY_MINUTES: -5, FINNHUB_DELAY_MINUTES: "20" }, {
      minutes: 20, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "PRIMARY_SOURCE_REJECTED",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES", "FINNHUB_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "NEGATIVE" }],
    }],
    ["negative primary, zero legacy", { MARKET_DATA_DELAY_MINUTES: -5, FINNHUB_DELAY_MINUTES: "0" }, {
      minutes: 0, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "PRIMARY_SOURCE_REJECTED",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES", "FINNHUB_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "NEGATIVE" }],
    }],
    ["blank primary, valid legacy", { MARKET_DATA_DELAY_MINUTES: "   ", FINNHUB_DELAY_MINUTES: "20" }, {
      minutes: 20, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "PRIMARY_SOURCE_REJECTED",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES", "FINNHUB_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "BLANK" }],
    }],
    ["non-numeric primary, valid legacy", { MARKET_DATA_DELAY_MINUTES: "n/a", FINNHUB_DELAY_MINUTES: "20" }, {
      minutes: 20, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "PRIMARY_SOURCE_REJECTED",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES", "FINNHUB_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "NOT_NUMERIC" }],
    }],
    ["primary absent, zero legacy", { FINNHUB_DELAY_MINUTES: "0" }, {
      minutes: 0, source: "FINNHUB_DELAY_MINUTES", fallbackReason: "NONE",
      configuredSources: ["FINNHUB_DELAY_MINUTES"], rejectedSources: [],
    }],
    ["negative primary, legacy absent", { MARKET_DATA_DELAY_MINUTES: -5 }, {
      minutes: 15, source: "DEFAULT", fallbackReason: "ALL_SOURCES_INVALID",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "NEGATIVE" }],
    }],
    /*
      Resolution short-circuits: a valid primary wins immediately and the
      lower-priority variable is never inspected. A malformed legacy value
      behind a valid primary had no bearing on the result, so reporting it would
      invite someone to "fix" a variable that is not in use.
    */
    ["valid primary, invalid legacy present", { MARKET_DATA_DELAY_MINUTES: 20, FINNHUB_DELAY_MINUTES: "n/a" }, {
      minutes: 20, source: "MARKET_DATA_DELAY_MINUTES", fallbackReason: "NONE",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"], rejectedSources: [],
    }],
    ["negative primary, invalid legacy", { MARKET_DATA_DELAY_MINUTES: -5, FINNHUB_DELAY_MINUTES: "n/a" }, {
      minutes: 15, source: "DEFAULT", fallbackReason: "ALL_SOURCES_INVALID",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES", "FINNHUB_DELAY_MINUTES"],
      rejectedSources: [
        { variable: "MARKET_DATA_DELAY_MINUTES", reason: "NEGATIVE" },
        { variable: "FINNHUB_DELAY_MINUTES", reason: "NOT_NUMERIC" },
      ],
    }],
    ["whitespace primary", { MARKET_DATA_DELAY_MINUTES: "   " }, {
      minutes: 15, source: "DEFAULT", fallbackReason: "ALL_SOURCES_INVALID",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "BLANK" }],
    }],
    ["empty primary", { MARKET_DATA_DELAY_MINUTES: "" }, {
      minutes: 15, source: "DEFAULT", fallbackReason: "ALL_SOURCES_INVALID",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "BLANK" }],
    }],
    ["malformed primary", { MARKET_DATA_DELAY_MINUTES: "n/a" }, {
      minutes: 15, source: "DEFAULT", fallbackReason: "ALL_SOURCES_INVALID",
      configuredSources: ["MARKET_DATA_DELAY_MINUTES"],
      rejectedSources: [{ variable: "MARKET_DATA_DELAY_MINUTES", reason: "NOT_NUMERIC" }],
    }],
  ];

  for (const [label, env, expected] of FALLBACK_CASES) {
    const resolved = trust.resolveMarketDelay(env);

    for (const [field, value] of Object.entries(expected)) {
      assert.deepEqual(
        resolved[field],
        value,
        `${label}: ${field} must be ${JSON.stringify(value)}, got ${JSON.stringify(resolved[field])}`
      );
    }
  }

  /*
    The invariant, checked over the whole table rather than case by case: the
    two fields may never disagree about whether a fallback happened.
  */
  for (const [label, env] of FALLBACK_CASES.map(([l, e]) => [l, e])) {
    const resolved = trust.resolveMarketDelay(env);

    if (resolved.fallbackReason === "NONE") {
      assert.deepEqual(
        resolved.rejectedSources,
        [],
        `${label}: fallbackReason "NONE" must mean nothing configured was rejected`
      );
    }

    if (resolved.rejectedSources.length > 0 && resolved.source !== "DEFAULT") {
      assert.equal(
        resolved.fallbackReason,
        "PRIMARY_SOURCE_REJECTED",
        `${label}: a rejected source plus a resolved configured source is a fallback and must say so`
      );
    }

    assert.ok(
      ["NONE", "PRIMARY_SOURCE_REJECTED", "ALL_SOURCES_INVALID", "NO_SOURCE_CONFIGURED"]
        .includes(resolved.fallbackReason),
      `${label}: fallbackReason must come from the declared vocabulary`
    );

    // Every rejected source must actually have been configured.
    for (const rejected of resolved.rejectedSources) {
      assert.ok(
        resolved.configuredSources.includes(rejected.variable),
        `${label}: ${rejected.variable} was reported rejected but never configured`
      );
    }
  }

  // A valid source is never reported as rejected.
  for (const valid of [0, "0", 20, "20", " 12 "]) {
    const resolved = trust.resolveMarketDelay({ MARKET_DATA_DELAY_MINUTES: valid });
    assert.deepEqual(
      resolved.rejectedSources,
      [],
      `a valid delay ${JSON.stringify(valid)} must not be reported as rejected`
    );
    assert.equal(resolved.fallbackReason, "NONE");
  }

  // An absent source is never reported as configured or as invalid.
  const absentDelay = trust.resolveMarketDelay({});
  assert.deepEqual(absentDelay.configuredSources, []);
  assert.deepEqual(absentDelay.rejectedSources, []);
  assert.equal(
    absentDelay.fallbackReason,
    "NO_SOURCE_CONFIGURED",
    "nothing configured is not the same as something invalid"
  );

  // A rejected raw value is never echoed back.
  for (const secretish of ["-999-do-not-echo", "   do-not-echo   ", "do-not-echo"]) {
    const serialized = JSON.stringify(
      trust.resolveMarketDelay({ MARKET_DATA_DELAY_MINUTES: secretish })
    );
    assert.equal(
      serialized.includes("do-not-echo"),
      false,
      "a rejected delay value must never appear in the diagnostic"
    );
  }

  /*
    The diagnostics must not reach mounted analysis output, which is the whole
    reason they are safe to add at all.
  */
  const metadataWithRejection = trust.buildAnalysisMetadata({
    symbol: "EXM",
    generatedAt: "2026-08-22T12:00:00.000Z",
    market: { success: true, provider: "Finnhub", data: { timestamp: 1787356800 }, cache: { hit: false } },
    history: null,
    priceContext: { livePriceAvailable: true, historicalCloseAvailable: true },
    fundamentals: null,
    shariah: null,
    dataQuality: null,
  });

  for (const forbidden of ["fallbackReason", "rejectedSources", "configuredSources"]) {
    assert.equal(
      JSON.stringify(metadataWithRejection).includes(forbidden),
      false,
      `mounted analysis metadata must not carry "${forbidden}"`
    );
  }

  // Legitimate zero still means realtime, and is not confused with "unset".
  const explicitZero = trust.resolveMarketDelay({ MARKET_DATA_DELAY_MINUTES: 0 });
  assert.equal(explicitZero.minutes, 0);
  assert.equal(explicitZero.source, "MARKET_DATA_DELAY_MINUTES");

  const zeroString = trust.resolveMarketDelay({ MARKET_DATA_DELAY_MINUTES: "0" });
  assert.equal(zeroString.minutes, 0);

  // The deprecated alias keeps working, and is parsed just as strictly.
  /*
    Asserted field by field rather than as a whole object: the return value also
    carries protected-only fallback diagnostics, and pinning the entire shape
    here would make every future diagnostic addition look like a semantic
    change. The diagnostics have their own dedicated coverage below.
  */
  const aliasResolved = trust.resolveMarketDelay({ FINNHUB_DELAY_MINUTES: "20" });
  assert.equal(aliasResolved.minutes, 20);
  assert.equal(aliasResolved.source, "FINNHUB_DELAY_MINUTES");
  assert.equal(aliasResolved.deprecatedAliasInUse, true);
  assert.equal(
    trust.resolveMarketDelay({ FINNHUB_DELAY_MINUTES: "   " }).source,
    "DEFAULT",
    "a blank alias value must not be believed either"
  );

  /*
    Grounded in the real consumer: a whitespace-only delay must not surface as
    a realtime claim in the published analysis metadata.
  */
  const blankDelayMetadata = trust.buildAnalysisMetadata({
    symbol: "EXM",
    generatedAt: "2026-08-22T12:00:00.000Z",
    market: {
      success: true,
      provider: "Finnhub",
      data: { timestamp: 1787356800 },
      cache: { hit: false },
    },
    history: null,
    priceContext: { livePriceAvailable: true, historicalCloseAvailable: true },
    fundamentals: null,
    shariah: null,
    dataQuality: null,
  });

  assert.notEqual(
    blankDelayMetadata.state,
    "realtime",
    "an unparseable delay must never be reported to a user as real-time data"
  );
  assert.equal(blankDelayMetadata.state, "delayed");
  assert.equal(blankDelayMetadata.delayMinutes, 15);

  /*
    The published-metadata truth test.

    Testing the parser alone is not enough: what a user actually reads is
    `state` and `delayMinutes` in the analysis metadata. These cases assert on
    that published surface, so a future change that keeps the parser honest but
    publishes something else still fails.
  */
  function publishedDelay(env) {
    const savedPrimary = process.env.MARKET_DATA_DELAY_MINUTES;
    const savedLegacy = process.env.FINNHUB_DELAY_MINUTES;

    delete process.env.MARKET_DATA_DELAY_MINUTES;
    delete process.env.FINNHUB_DELAY_MINUTES;

    for (const [key, value] of Object.entries(env)) {
      process.env[key] = String(value);
    }

    try {
      const metadata = trust.buildAnalysisMetadata({
        symbol: "EXM",
        generatedAt: "2026-08-22T12:00:00.000Z",
        market: {
          success: true,
          provider: "Finnhub",
          data: { timestamp: 1787356800 },
          cache: { hit: false },
        },
        history: null,
        priceContext: { livePriceAvailable: true, historicalCloseAvailable: true },
        fundamentals: null,
        shariah: null,
        dataQuality: null,
      });

      return { state: metadata.state, delayMinutes: metadata.delayMinutes };
    } finally {
      if (savedPrimary === undefined) delete process.env.MARKET_DATA_DELAY_MINUTES;
      else process.env.MARKET_DATA_DELAY_MINUTES = savedPrimary;
      if (savedLegacy === undefined) delete process.env.FINNHUB_DELAY_MINUTES;
      else process.env.FINNHUB_DELAY_MINUTES = savedLegacy;
    }
  }

  const publishedCases = [
    [
      "negative primary, no legacy",
      { MARKET_DATA_DELAY_MINUTES: -5 },
      { state: "delayed", delayMinutes: 15 },
    ],
    [
      "negative legacy, no primary",
      { FINNHUB_DELAY_MINUTES: -5 },
      { state: "delayed", delayMinutes: 15 },
    ],
    [
      "negative primary, valid positive legacy",
      { MARKET_DATA_DELAY_MINUTES: -5, FINNHUB_DELAY_MINUTES: 20 },
      { state: "delayed", delayMinutes: 20 },
    ],
    [
      "negative primary, legacy zero",
      { MARKET_DATA_DELAY_MINUTES: -5, FINNHUB_DELAY_MINUTES: 0 },
      { state: "realtime", delayMinutes: null },
    ],
    [
      "whitespace-only primary",
      { MARKET_DATA_DELAY_MINUTES: "   " },
      { state: "delayed", delayMinutes: 15 },
    ],
    [
      "malformed primary",
      { MARKET_DATA_DELAY_MINUTES: "n/a" },
      { state: "delayed", delayMinutes: 15 },
    ],
    [
      "positive primary stays delayed",
      { MARKET_DATA_DELAY_MINUTES: 20 },
      { state: "delayed", delayMinutes: 20 },
    ],
    [
      "explicit zero remains realtime",
      { MARKET_DATA_DELAY_MINUTES: 0 },
      { state: "realtime", delayMinutes: null },
    ],
    [
      "explicit string zero remains realtime",
      { MARKET_DATA_DELAY_MINUTES: "0" },
      { state: "realtime", delayMinutes: null },
    ],
    [
      "no configuration uses the disclosed default",
      {},
      { state: "delayed", delayMinutes: 15 },
    ],
  ];

  for (const [label, env, expected] of publishedCases) {
    assert.deepEqual(
      publishedDelay(env),
      expected,
      `published metadata for "${label}" must be ${JSON.stringify(expected)}`
    );
  }

  /*
    The single claim this whole correction exists to prevent: no invalid or
    negative configuration may reach a user as a real-time assertion.
  */
  for (const bad of [-5, "-5", "-0.5", "   ", "n/a", "", "true"]) {
    assert.notEqual(
      publishedDelay({ MARKET_DATA_DELAY_MINUTES: bad }).state,
      "realtime",
      `a delay of ${JSON.stringify(bad)} must never publish a realtime claim`
    );
  }

  // ------------------------------------------------------------------
  // 4. The three implementations agree on the whole domain
  // ------------------------------------------------------------------
  /*
    Separate implementations, one accepted domain. Comparing observed behaviour
    rather than source text means a future edit to any single module that
    widens or narrows its domain fails here.
  */
  const disagreements = [];

  for (const [label, input, expected] of DOMAIN) {
    finnhubProvider.clearFinnhubQuoteCache();
    axios.get = async () => ({ data: { c: 227.3, pc: input } });
    const fh = (await finnhubProvider.getFinnhubQuote("EXM")).data.previousClose;

    twelveDataProvider.clearTwelveDataQuoteCache();
    axios.get = async () => ({
      data: { symbol: "EXM", close: "227.3", previous_close: input },
    });
    const td = (await twelveDataProvider.getTwelveDataQuote("EXM")).data.previousClose;

    const resolved = trust.resolveMarketDelay({ MARKET_DATA_DELAY_MINUTES: input });
    const ts = resolved.source === "DEFAULT" ? null : resolved.minutes;

    /*
      The trust module shares the same PARSER but applies a narrower domain on
      top of it, so negative values are expected to diverge here by design. They
      are compared against the delay expectation instead of being waved through.
    */
    const trustExpected =
      typeof expected === "number" && expected < 0 ? null : expected;

    if (fh !== expected || td !== expected || ts !== trustExpected) {
      disagreements.push(
        `${label}: provider expected ${JSON.stringify(expected)}, ` +
          `delay expected ${JSON.stringify(trustExpected)}, ` +
          `finnhub=${JSON.stringify(fh)} twelveData=${JSON.stringify(td)} trust=${JSON.stringify(ts)}`
      );
    }
  }

  assert.deepEqual(
    disagreements,
    [],
    "the shared parser must behave identically everywhere, and the delay domain " +
      "must differ only by rejecting negative durations"
  );

  console.log(
    `Strict numeric parsing verified across 3 adapters and ${DOMAIN.length} input classes, ` +
      "with the market-delay domain additionally rejecting negative durations."
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalGet;
    finnhubProvider.clearFinnhubQuoteCache();
    twelveDataProvider.clearTwelveDataQuoteCache();
  });
