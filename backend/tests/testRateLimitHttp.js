"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const axios = require("axios");

// ============================================================
// AzaLens - Rate Limit HTTP Contract Tests
//
// Boots the real Express app (require("../server").app) on an
// ephemeral loopback port, the same way testCorsAllowlist.js and
// testLoadResilience.js do, and issues real HTTP requests through
// the full middleware stack (requestObservability, CORS, helmet,
// global limiter and strict limiter).
//
// /api/analyze/:symbol calls getMasterAnalysis(), which reaches into Finnhub and
// Twelve Data. (/api/portfolio/intelligence used to be the third
// such route; it is no longer mounted - see
// routes/portfolioRoutes.js and testRemovedRoutesContract.js.)
// axios.get is stubbed below with safe, deterministic canned
// responses before any of those routes are ever hit - no test in
// this file makes a real network call. SHARIAH_DATA_MODE is forced
// to "offline" (the codebase's safe default) regardless of what a
// local .env may set, so the Halal Terminal branch short-circuits
// before it would ever reach axios.post - which is stubbed to throw
// if it is ever somehow invoked, as a defense-in-depth safety net.
// ============================================================

process.env.NODE_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "false";
process.env.FINNHUB_API_KEY = "rate-limit-http-test-key";
process.env.TWELVE_DATA_API_KEY = "rate-limit-http-test-key";
process.env.SHARIAH_DATA_MODE = "offline";
delete process.env.HALAL_TERMINAL_LIVE_ENABLED;

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;
const originalConsoleLog = console.log;

let axiosPostCallCount = 0;

function buildTwelveDataBars(count = 120, basePrice = 200) {
  const bars = [];
  const startMs = Date.parse("2026-01-01T00:00:00Z");

  for (let index = 0; index < count; index += 1) {
    const timestamp = new Date(
      startMs + index * 86_400_000
    )
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    const close =
      basePrice +
      Math.sin(index / 5) * 2 +
      index * 0.05;

    bars.push({
      datetime: timestamp,
      open: (close - 0.5).toFixed(2),
      high: (close + 1).toFixed(2),
      low: (close - 1).toFixed(2),
      close: close.toFixed(2),
      volume: String(
        1_000_000 + (index % 10) * 5_000
      ),
    });
  }

  return bars.reverse();
}

axios.get = async (url) => {
  if (url.endsWith("/quote")) {
    return {
      data: {
        c: 215.5,
        pc: 213.4,
        o: 214,
        h: 216,
        l: 212.8,
        d: 2.1,
        dp: 0.98,
        t: 1785052800,
      },
    };
  }

  if (url.endsWith("/stock/profile2")) {
    return {
      data: {
        name: "Test Company",
        ticker: "TEST",
        exchange: "NASDAQ",
        currency: "USD",
      },
    };
  }

  if (url.includes("time_series")) {
    return {
      data: {
        status: "ok",
        values: buildTwelveDataBars(),
      },
    };
  }

  throw new Error(
    `Unexpected axios.get URL in rate limit HTTP tests: ${url}`
  );
};

axios.post = async (url) => {
  axiosPostCallCount += 1;

  throw new Error(
    `axios.post must never be called with SHARIAH_DATA_MODE=offline: ${url}`
  );
};

const SERVER_MODULE_PATH = require.resolve("../server");

async function bootServer() {
  delete require.cache[SERVER_MODULE_PATH];

  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  return { app, server, baseUrl, close };
}

async function get(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function fireSequentially(baseUrl, paths, options) {
  const responses = [];

  for (const path of paths) {
    responses.push(
      await get(baseUrl, path, options)
    );
  }

  return responses;
}

function statuses(responses) {
  return responses.map(
    (response) => response.status
  );
}

function repeat(path, count) {
  return Array.from({ length: count }, () => path);
}

// ------------------------------------------------------------
// 1. Global 30/minute behavior
// ------------------------------------------------------------
async function testGlobal30PerMinute() {
  const { baseUrl, close } = await bootServer();

  try {
    const responses = await fireSequentially(
      baseUrl,
      repeat("/version", 31)
    );
    const statusList = statuses(responses);

    assert.deepEqual(
      statusList.slice(0, 30),
      Array(30).fill(200)
    );
    assert.equal(statusList[30], 429);
  } finally {
    await close();
  }
}

function expectedHandlerStatus(urlPath) {
  if (urlPath.startsWith("/api/analyze/")) {
    return 200;
  }

  throw new Error(
    `No expected handler status recorded for ${urlPath}`
  );
}

// ------------------------------------------------------------
// 2, 3, 4. Strict 10/minute, mixed interleaved and
// reordered, across symbols on the real expensive route.
// ------------------------------------------------------------
async function testSharedStrictBucketMixedAndReordered() {
  {
    const { baseUrl, close } = await bootServer();

    try {
      const sequence = [
        ...repeat("/api/analyze/AAPL", 4),
        ...repeat("/api/analyze/GOOG", 3),
        ...repeat("/api/analyze/MSFT", 3),
      ];
      const responses = await fireSequentially(
        baseUrl,
        sequence
      );

      /*
        Strict-equal against the per-route handler status, not
        merely "not 429". A 404 is also not 429, so a route that
        silently disappeared would otherwise satisfy this assertion
        while consuming none of the bucket - and the 11th-request
        check below would then fail for a reason nobody could read
        from the output.
      */
      assert.deepEqual(
        statuses(responses),
        sequence.map(expectedHandlerStatus),
        "all 10 combined expensive requests must be allowed and must reach a real handler"
      );

      const eleventh = await get(
        baseUrl,
        "/api/analyze/AAPL"
      );

      assert.equal(eleventh.status, 429);
    } finally {
      await close();
    }
  }

  {
    const { baseUrl, close } = await bootServer();

    try {
      const sequence = [
        "/api/analyze/AAPL",
        "/api/analyze/GOOG",
        "/api/analyze/MSFT",
        "/api/analyze/AAPL",
        "/api/analyze/MSFT",
        "/api/analyze/GOOG",
        "/api/analyze/AAPL",
        "/api/analyze/MSFT",
        "/api/analyze/MSFT",
        "/api/analyze/GOOG",
      ];
      const responses = await fireSequentially(
        baseUrl,
        sequence
      );

      // Strict-equal for the same reason as above: a 404 would pass
      // a "not 429" check without consuming the bucket.
      assert.deepEqual(
        statuses(responses),
        sequence.map(expectedHandlerStatus),
        "all 10 combined expensive requests must be allowed regardless of order, and must reach a real handler"
      );

      const eleventh = await get(
        baseUrl,
        "/api/analyze/AAPL"
      );

      assert.equal(eleventh.status, 429);
    } finally {
      await close();
    }
  }
}

// ------------------------------------------------------------
// 5. No double-counting between strict and global buckets
// ------------------------------------------------------------
async function testNoDoubleCountingBetweenBuckets() {
  const { baseUrl, close } = await bootServer();

  try {
    const strictSequence = [
      ...repeat("/api/analyze/AAPL", 4),
      ...repeat("/api/analyze/GOOG", 3),
      ...repeat("/api/analyze/MSFT", 3),
    ];

    await fireSequentially(baseUrl, strictSequence);

    const strictOverflow = await get(
      baseUrl,
      "/api/analyze/AAPL"
    );

    assert.equal(strictOverflow.status, 429);

    const ordinaryResponses =
      await fireSequentially(
        baseUrl,
        repeat("/version", 31)
      );
    const ordinaryStatuses = statuses(
      ordinaryResponses
    );

    assert.deepEqual(
      ordinaryStatuses.slice(0, 30),
      Array(30).fill(200),
      "strict-route traffic must not have consumed any of the global bucket"
    );
    assert.equal(ordinaryStatuses[30], 429);
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 6. Health and metrics exemptions beyond 30 requests
// ------------------------------------------------------------
async function testHealthAndMetricsExemptBeyond30() {
  const { baseUrl, close } = await bootServer();

  try {
    for (const path of [
      "/health",
      "/health/live",
      "/health/ready",
      "/ops/metrics",
    ]) {
      const responses = await fireSequentially(
        baseUrl,
        repeat(path, 35)
      );

      assert.ok(
        statuses(responses).every(
          (status) => status !== 429
        ),
        `${path} must never be rate limited`
      );
    }
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 8, 9. OPTIONS never receives a limiter 429 and never reduces
// either allowance.
// ------------------------------------------------------------
async function testOptionsNeverLimited() {
  const { baseUrl, close } = await bootServer();

  try {
    const ordinaryOptions = await fireSequentially(
      baseUrl,
      repeat("/version", 40),
      { method: "OPTIONS" }
    );
    const strictOptions = await fireSequentially(
      baseUrl,
      repeat("/api/analyze/AAPL", 40),
      { method: "OPTIONS" }
    );

    assert.ok(
      statuses(ordinaryOptions).every(
        (status) => status !== 429
      )
    );
    assert.ok(
      statuses(strictOptions).every(
        (status) => status !== 429
      )
    );

    const ordinaryResponses =
      await fireSequentially(
        baseUrl,
        repeat("/version", 31)
      );

    assert.deepEqual(
      statuses(ordinaryResponses).slice(0, 30),
      Array(30).fill(200),
      "OPTIONS traffic must not have reduced the global allowance"
    );
    assert.equal(
      statuses(ordinaryResponses)[30],
      429
    );

    const strictResponses = await fireSequentially(
      baseUrl,
      repeat("/api/analyze/AAPL", 11)
    );

    assert.ok(
      statuses(strictResponses)
        .slice(0, 10)
        .every((status) => status !== 429),
      "OPTIONS traffic must not have reduced the strict allowance"
    );
    assert.equal(
      statuses(strictResponses)[10],
      429
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 10. Existing CORS behavior unchanged (regression check)
// ------------------------------------------------------------
async function testCorsRegression() {
  const { baseUrl, close } = await bootServer();

  try {
    const allowed = await get(baseUrl, "/health", {
      headers: { Origin: "https://azalens.com" },
    });

    assert.equal(
      allowed.headers.get(
        "access-control-allow-origin"
      ),
      "https://azalens.com"
    );

    const rejected = await get(baseUrl, "/health", {
      headers: { Origin: "https://evil.com" },
    });

    assert.equal(rejected.status, 200);
    assert.equal(
      rejected.headers.get(
        "access-control-allow-origin"
      ),
      null
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 11, 12, 13, 14. 429 response shape, standard headers present,
// legacy headers absent, header coherence around the boundary.
// ------------------------------------------------------------
async function testResponseShapeAndHeaders() {
  const { baseUrl, close } = await bootServer();

  try {
    const responses = await fireSequentially(
      baseUrl,
      repeat("/version", 31)
    );
    const lastAllowed = responses[29];
    const firstRejected = responses[30];

    assert.equal(lastAllowed.status, 200);
    assert.equal(firstRejected.status, 429);

    const body = await firstRejected.json();

    assert.equal(body.success, false);
    assert.equal(typeof body.error, "string");
    assert.ok(body.error.length > 0);
    assert.equal(typeof body.requestId, "string");
    assert.ok(body.requestId.length > 0);
    assert.equal(
      body.requestId,
      firstRejected.headers.get("x-request-id"),
      "429 requestId must come through requestObservability"
    );

    for (const response of [
      lastAllowed,
      firstRejected,
    ]) {
      assert.equal(
        response.headers.get("ratelimit-limit"),
        "30"
      );
      assert.ok(
        response.headers.get("ratelimit-remaining") !==
          null
      );
      assert.equal(
        response.headers.get("x-ratelimit-limit"),
        null
      );
      assert.equal(
        response.headers.get(
          "x-ratelimit-remaining"
        ),
        null
      );
    }

    assert.equal(
      lastAllowed.headers.get(
        "ratelimit-remaining"
      ),
      "0",
      "the last allowed request must show zero remaining"
    );
    assert.equal(
      firstRejected.headers.get(
        "ratelimit-remaining"
      ),
      "0"
    );
    assert.ok(
      firstRejected.headers.get("retry-after") !== null,
      "a rejected request should carry a Retry-After hint"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 15. Path-boundary traps do not receive the strict-path global
// exemption - they still get rate limited by the global bucket.
// ------------------------------------------------------------
async function testBoundaryTrapsNotGloballyExempt() {
  const { baseUrl, close } = await bootServer();

  try {
    const responses = await fireSequentially(
      baseUrl,
      repeat("/api/analyze", 31)
    );
    const statusList = statuses(responses);

    assert.ok(
      statusList
        .slice(0, 30)
        .every((status) => status === 404),
      "/api/analyze (no symbol) is unmatched and must 404, not exempt from counting"
    );
    assert.equal(
      statusList[30],
      429,
      "/api/analyze must still be counted by the global bucket"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 16. Mixed-case and trailing-slash equivalents do not get
// double-counted: they must stay exempt from the global bucket
// while sharing the same strict bucket as their canonical route.
// ------------------------------------------------------------
async function testCaseAndTrailingSlashNoDoubleCounting() {
  const { baseUrl, close } = await bootServer();

  try {
    const variantResponses = await fireSequentially(
      baseUrl,
      [
        "/API/Analyze/AAPL",
        "/api/analyze/AAPL/",
        "/API/Analyze/MSFT",
        "/api/analyze/MSFT/",
      ]
    );

    assert.ok(
      statuses(variantResponses).every(
        (status) => status !== 429
      ),
      "case/trailing-slash variants of strict routes must be allowed"
    );

    // If a variant had wrongly escaped the global exemption, it
    // would have also been consumed from the global bucket - prove
    // the global bucket still has its full 30-request allowance.
    const ordinaryResponses =
      await fireSequentially(
        baseUrl,
        repeat("/version", 31)
      );

    assert.deepEqual(
      statuses(ordinaryResponses).slice(0, 30),
      Array(30).fill(200),
      "strict-path case/trailing-slash variants must not leak into the global bucket"
    );
    assert.equal(
      statuses(ordinaryResponses)[30],
      429
    );
  } finally {
    await close();
  }
}

const originalAxiosPostCallCountAtStart = 0;

async function run() {
  console.log = () => {};

  try {
    await testGlobal30PerMinute();
    await testSharedStrictBucketMixedAndReordered();
    await testNoDoubleCountingBetweenBuckets();
    await testHealthAndMetricsExemptBeyond30();
    await testOptionsNeverLimited();
    await testCorsRegression();
    await testResponseShapeAndHeaders();
    await testBoundaryTrapsNotGloballyExempt();
    await testCaseAndTrailingSlashNoDoubleCounting();
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(
    axiosPostCallCount,
    originalAxiosPostCallCountAtStart,
    "no test may reach the Halal Terminal (axios.post) provider"
  );

  console.log(
    "Rate limit HTTP contract tests: all scenarios passed. " +
      "No real provider network calls were made."
  );
}

run()
  .catch((error) => {
    console.log = originalConsoleLog;
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalAxiosGet;
    axios.post = originalAxiosPost;
  });
