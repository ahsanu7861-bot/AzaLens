"use strict";

const assert = require("node:assert/strict");
const {
  normalizePathname,
  isGlobalLimiterExempt,
} = require("../utils/rateLimitPaths");

// ============================================================
// AzaLens - Rate Limit Path Matching Contract Tests
//
// Unit tests against normalizePathname/isGlobalLimiterExempt
// directly (no HTTP server involved). testRateLimitHttp.js proves
// these functions actually gate the real middleware stack; this
// suite proves the matching logic itself is correct against the
// exact boundary traps called out in the rate-limit design.
// ============================================================

function run() {
  // 1. Lowercase normalization
  assert.equal(
    normalizePathname("/API/Analyze/AAPL"),
    "/api/analyze/aapl"
  );

  // 2. Trailing-slash normalization (root preserved)
  assert.equal(
    normalizePathname("/api/analyze/AAPL/"),
    "/api/analyze/aapl"
  );
  assert.equal(normalizePathname("/"), "/");
  assert.equal(normalizePathname(""), "/");
  assert.equal(normalizePathname("///"), "/");

  // 3. Query strings do not change pathname classification
  assert.equal(
    normalizePathname("/api/analyze/AAPL?x=1&y=2"),
    "/api/analyze/aapl"
  );
  assert.equal(
    normalizePathname({
      path: "/api/analyze/AAPL",
      url: "/api/analyze/AAPL?x=1",
    }),
    "/api/analyze/aapl"
  );

  // 4. Valid Analyze path is exempt
  assert.equal(
    isGlobalLimiterExempt("/api/analyze/AAPL"),
    true
  );

  // 5. Valid Explanation path is exempt
  assert.equal(
    isGlobalLimiterExempt("/api/explanation/AAPL"),
    true
  );

  /*
    6. The Portfolio Intelligence path is NOT exempt.

    Its route is no longer mounted (routes/portfolioRoutes.js), so
    it has no strict limiter of its own and therefore no reason to
    skip the global one. This assertion is the guard against the
    exemption being re-added without the route: an exempt path with
    no route is an unrate-limited 404, and a remounted route that
    silently inherited the exemption would be less protected than
    the code review implied.
  */
  assert.equal(
    isGlobalLimiterExempt("/api/portfolio/intelligence"),
    false
  );

  // 7. Health and metrics paths are exempt
  assert.equal(isGlobalLimiterExempt("/health"), true);
  assert.equal(isGlobalLimiterExempt("/health/live"), true);
  assert.equal(isGlobalLimiterExempt("/health/ready"), true);
  assert.equal(isGlobalLimiterExempt("/ops/metrics"), true);

  // A trailing slash on a non-param route also matches in real
  // Express 5 (non-strict routing), so it must stay exempt too.
  assert.equal(isGlobalLimiterExempt("/health/"), true);

  // 8. Mixed-case equivalents are classified identically
  assert.equal(
    isGlobalLimiterExempt("/API/Analyze/AAPL"),
    isGlobalLimiterExempt("/api/analyze/AAPL")
  );
  assert.equal(
    isGlobalLimiterExempt("/API/Analyze/AAPL"),
    true
  );

  // 9. Trailing-slash equivalents are classified identically
  assert.equal(
    isGlobalLimiterExempt("/api/analyze/AAPL/"),
    isGlobalLimiterExempt("/api/analyze/AAPL")
  );
  assert.equal(
    isGlobalLimiterExempt("/api/analyze/AAPL/"),
    true
  );

  // 10. Boundary traps are NOT exempt
  const boundaryTraps = [
    "/api/analyze",
    "/api/analyze/",
    "/api/analyze-extra/AAPL",
    "/api/analyze/AAPL/extra",
    "/api/explanation",
    "/api/explanation-extra/AAPL",
    "/api/explanation/AAPL/extra",
    "/api/portfolio/intelligence-extra",
    "/api/portfolio",
    "/api/portfolio/",
    "/health-extra",
    "/ops/metrics-extra",
  ];

  for (const trap of boundaryTraps) {
    assert.equal(
      isGlobalLimiterExempt(trap),
      false,
      `expected boundary trap "${trap}" to NOT be exempt`
    );
  }

  // 11. Encoded separators and malformed encodings fail safely and
  // cannot widen exemption behavior. These are never decoded, so an
  // encoded slash is just literal text within a single segment -
  // matching what Express itself does when it routes these paths.
  assert.equal(
    isGlobalLimiterExempt("/api/analyze/AAPL%2Fextra"),
    true,
    "an encoded slash inside the :symbol segment stays a single " +
      "segment, exactly like real Express routing"
  );
  assert.equal(
    isGlobalLimiterExempt("/api%2Fanalyze/AAPL"),
    false,
    "an encoded slash cannot be used to fake the /api/analyze prefix"
  );
  assert.equal(
    isGlobalLimiterExempt(
      "/api/portfolio/intelligence%2Fextra"
    ),
    false
  );
  assert.doesNotThrow(() => {
    isGlobalLimiterExempt("/api/analyze/AAPL%");
    isGlobalLimiterExempt("/api/analyze/AAPL%zz");
    isGlobalLimiterExempt("/api/analyze/AAPL%00");
  });

  // 12. Root and unrelated paths remain non-exempt
  assert.equal(isGlobalLimiterExempt("/"), false);
  assert.equal(isGlobalLimiterExempt("/api/watchlist"), false);
  assert.equal(isGlobalLimiterExempt("/api/portfolio"), false);
  assert.equal(isGlobalLimiterExempt("/version"), false);

  // Safely handle the values the middleware can receive.
  assert.doesNotThrow(() => {
    isGlobalLimiterExempt(undefined);
    isGlobalLimiterExempt(null);
    isGlobalLimiterExempt({});
    isGlobalLimiterExempt(42);
  });
  assert.equal(isGlobalLimiterExempt(undefined), false);
  assert.equal(isGlobalLimiterExempt(null), false);
  assert.equal(isGlobalLimiterExempt({}), false);

  console.log(
    "Rate limit path matching tests: all scenarios passed."
  );
}

run();
