"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const { performance } = require("node:perf_hooks");
const axios = require("axios");

process.env.NODE_ENV = "test";
process.env.FINNHUB_API_KEY = "load-test-key";

const { app } = require("../server");
const {
  clearFinnhubProfileCache,
  clearFinnhubQuoteCache,
  getFinnhubCacheStats,
  getFinnhubQuote,
} = require("../providers/finnhubProvider");
const {
  getMetricsSnapshot,
  resetObservabilityForTests,
} = require("../utils/observability");

const originalAxiosGet = axios.get;
const originalConsoleLog = console.log;

function percentile(values, percentileValue) {
  const sorted = [...values].sort(
    (first, second) => first - second
  );
  const index = Math.min(
    sorted.length - 1,
    Math.max(
      0,
      Math.ceil(
        sorted.length * percentileValue
      ) - 1
    )
  );

  return sorted[index] || 0;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function closeServer(server) {
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

async function testConcurrentLiveness() {
  resetObservabilityForTests();
  console.log = () => {};

  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();

    assert.equal(
      typeof address,
      "object"
    );

    const requestCount = 160;
    const baseUrl =
      `http://127.0.0.1:${address.port}`;
    const wallStartedAt = performance.now();
    const results = await Promise.all(
      Array.from(
        { length: requestCount },
        async (_, index) => {
          const requestId =
            `load-test-${String(index).padStart(4, "0")}`;
          const startedAt = performance.now();
          const response = await fetch(
            `${baseUrl}/health/live`,
            {
              headers: {
                "x-request-id": requestId,
              },
            }
          );
          const body = await response.json();

          return {
            body,
            durationMs:
              performance.now() - startedAt,
            requestId,
            response,
          };
        }
      )
    );
    const wallDurationMs =
      performance.now() - wallStartedAt;

    for (const {
      body,
      requestId,
      response,
    } of results) {
      assert.equal(response.status, 200);
      assert.equal(body.status, "healthy");
      assert.equal(body.requestId, requestId);
      assert.equal(
        response.headers.get("x-request-id"),
        requestId
      );
      assert.equal(
        response.headers.get("cache-control"),
        "no-store"
      );
    }

    const requestIds = new Set(
      results.map(({ body }) => body.requestId)
    );
    const p95 = percentile(
      results.map(
        ({ durationMs }) => durationMs
      ),
      0.95
    );
    const metrics = getMetricsSnapshot();

    assert.equal(
      requestIds.size,
      requestCount
    );
    assert.equal(
      metrics.http.count,
      requestCount
    );
    assert.equal(
      metrics.http.successes,
      requestCount
    );
    assert.equal(metrics.http.failures, 0);
    assert.equal(metrics.http.inFlight, 0);
    assert.equal(
      metrics.http.statusCodes["200"],
      requestCount
    );
    assert.equal(
      metrics.providers.length,
      0,
      "Health load must never spend provider quota."
    );
    assert.ok(
      p95 < 2_000,
      `Loopback liveness p95 ${p95.toFixed(2)}ms exceeded 2000ms.`
    );
    assert.ok(
      wallDurationMs < 10_000,
      `Liveness load took ${wallDurationMs.toFixed(2)}ms.`
    );
  } finally {
    await closeServer(server);
    console.log = originalConsoleLog;
  }
}

async function testProviderRequestCoalescing() {
  clearFinnhubQuoteCache();
  clearFinnhubProfileCache();

  let quoteCalls = 0;
  let profileCalls = 0;

  axios.get = async (url) => {
    await sleep(25);

    if (url.endsWith("/quote")) {
      quoteCalls += 1;

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
      profileCalls += 1;

      return {
        data: {
          name: "Apple Inc.",
          ticker: "AAPL",
          exchange: "NASDAQ",
          currency: "USD",
        },
      };
    }

    throw new Error(
      `Unexpected Finnhub URL: ${url}`
    );
  };

  const concurrentResults =
    await Promise.all(
      Array.from(
        { length: 32 },
        () => getFinnhubQuote("aapl")
      )
    );
  const cacheStatuses =
    concurrentResults.map(
      ({ cache }) => cache.status
    );

  assert.equal(quoteCalls, 1);
  assert.equal(profileCalls, 0);
  assert.equal(
    cacheStatuses.filter(
      (status) => status === "MISS"
    ).length,
    1
  );
  assert.equal(
    cacheStatuses.filter(
      (status) => status === "COALESCED"
    ).length,
    31
  );
  assert.ok(
    concurrentResults.every(
      ({ success }) => success === true
    )
  );

  const cachedResult =
    await getFinnhubQuote("AAPL");

  assert.equal(
    cachedResult.cache.status,
    "HIT"
  );
  assert.equal(quoteCalls, 1);
  assert.equal(profileCalls, 0);
  assert.deepEqual(
    getFinnhubCacheStats(),
    {
      quoteCache: {
        entries: 1,
        ttlSeconds: 20,
        pendingRequests: 0,
      },
      profileCache: {
        entries: 0,
        ttlSeconds: 21600,
        pendingRequests: 0,
      },
    }
  );
}

async function testRecoveryAfterCoalescedFailure() {
  clearFinnhubQuoteCache();
  clearFinnhubProfileCache();

  let shouldFail = true;
  let quoteCalls = 0;

  axios.get = async (url) => {
    await sleep(20);

    if (url.endsWith("/stock/profile2")) {
      return {
        data: {
          name: "Microsoft Corp.",
          ticker: "MSFT",
          exchange: "NASDAQ",
          currency: "USD",
        },
      };
    }

    if (url.endsWith("/quote")) {
      quoteCalls += 1;

      if (shouldFail) {
        const error =
          new Error("Provider timed out.");

        error.code = "ECONNABORTED";
        throw error;
      }

      return {
        data: {
          c: 505,
          pc: 500,
          o: 501,
          h: 507,
          l: 499,
          d: 5,
          dp: 1,
          t: 1785052800,
        },
      };
    }

    throw new Error(
      `Unexpected Finnhub URL: ${url}`
    );
  };

  const failedResults = await Promise.all(
    Array.from(
      { length: 12 },
      () => getFinnhubQuote("MSFT")
    )
  );

  assert.equal(quoteCalls, 1);
  assert.ok(
    failedResults.every(
      ({ success }) => success === false
    )
  );
  assert.match(
    failedResults[0].error,
    /timed out/i
  );
  assert.equal(
    getFinnhubCacheStats()
      .quoteCache.pendingRequests,
    0
  );

  shouldFail = false;

  const recovered =
    await getFinnhubQuote("MSFT");

  assert.equal(recovered.success, true);
  assert.equal(
    recovered.cache.status,
    "MISS"
  );
  assert.equal(quoteCalls, 2);
  assert.equal(
    getFinnhubCacheStats()
      .quoteCache.pendingRequests,
    0
  );
}

async function run() {
  await testConcurrentLiveness();
  await testProviderRequestCoalescing();
  await testRecoveryAfterCoalescedFailure();

  console.log(
    "Load and resilience tests passed: 160 correlated HTTP requests, 32-way provider coalescing, and timeout recovery."
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    axios.get = originalAxiosGet;
    console.log = originalConsoleLog;
    clearFinnhubQuoteCache();
    clearFinnhubProfileCache();
  });
