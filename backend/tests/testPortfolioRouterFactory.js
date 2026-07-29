"use strict";

const assert = require("node:assert/strict");
const createPortfolioRouter = require("../routes/portfolioRoutes");

// ============================================================
// AzaLens - Portfolio Router Factory Fail-Closed Contract
//
// createPortfolioRouter mounts the portfolio-intelligence route
// behind a caller-supplied rate limiter. If that limiter were ever
// missing, the route must not silently mount without rate limiting
// - the factory must refuse to build the router at all.
// ============================================================

function noopLimiter(req, res, next) {
  next();
}

function run() {
  // A valid middleware function allows router construction.
  assert.doesNotThrow(() => {
    createPortfolioRouter({
      intelligenceLimiter: noopLimiter,
    });
  });

  // A missing intelligenceLimiter throws.
  assert.throws(
    () => createPortfolioRouter({}),
    /intelligenceLimiter/,
    "missing intelligenceLimiter must throw immediately"
  );
  assert.throws(
    () => createPortfolioRouter(),
    /intelligenceLimiter/,
    "omitting the options object entirely must throw immediately"
  );

  // A non-function intelligenceLimiter throws.
  for (const invalidLimiter of [
    null,
    undefined,
    "limiter",
    123,
    {},
    [],
  ]) {
    assert.throws(
      () =>
        createPortfolioRouter({
          intelligenceLimiter: invalidLimiter,
        }),
      /intelligenceLimiter/,
      `non-function intelligenceLimiter (${String(
        invalidLimiter
      )}) must throw immediately`
    );
  }

  console.log(
    "Portfolio router factory fail-closed tests: all scenarios passed."
  );
}

run();
