"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
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

/*
  The load below goes through a dedicated agent, not global fetch().

  fetch()'s global dispatcher has no per-origin connection limit, so
  160 concurrent calls opened 160 simultaneous TCP connections. A
  listening socket's accept queue is kernel-bounded (somaxconn is 128
  on macOS; Linux clamps the requested backlog too), and when the
  queue momentarily overflowed the kernel answered with RST instead
  of queueing. The losing connection failed in the connect syscall -
  "connect ECONNRESET", before any request reached the server - and
  that rejection escaped Promise.all before a single assertion ran,
  reddening a blocking gate ~40% of the time.

  What this test proves is that 160 concurrent requests are served
  correctly with per-request id correlation and exact observability
  totals. Simultaneous TCP connection count is a client artifact, not
  a product property. So all 160 requests are still dispatched at
  once and every assertion is unchanged; only the transport is
  bounded, with keep-alive connections reused below the accept queue.

  Do not restore fetch() here without solving the same problem.
*/
const MAX_LOAD_SOCKETS = 64;

function createLoadAgent() {
  return new http.Agent({
    keepAlive: true,
    maxSockets: MAX_LOAD_SOCKETS,
    maxFreeSockets: MAX_LOAD_SOCKETS,
  });
}

/*
  Fetch-shaped result, so the assertions below read as they did
  before. The body is always fully consumed and the promise settles
  only on "end" or "error", so no request is still in flight when
  teardown begins.
*/
function loadRequest(agent, url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      { agent, headers },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode,
              headers: new Map(
                Object.entries(response.headers)
              ),
              body: JSON.parse(raw),
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

/*
  agent.destroy() destroys every socket it holds, but the freeSockets
  bookkeeping is cleared by each socket's own "close" handler, which
  runs on a later tick. Awaiting those close events is what makes
  teardown deterministic - the alternative would be a sleep, which
  would only hide the same race.
*/
async function destroyAgent(agent) {
  const sockets = [
    ...Object.values(agent.sockets || {}).flat(),
    ...Object.values(agent.freeSockets || {}).flat(),
  ];

  const closed = sockets.map((socket) =>
    socket.destroyed
      ? Promise.resolve()
      : once(socket, "close")
  );

  agent.destroy();

  await Promise.all(closed);
}

function agentSocketCount(agent) {
  const count = (pool) =>
    Object.values(pool || {}).reduce(
      (total, sockets) => total + sockets.length,
      0
    );

  return {
    active: count(agent.sockets),
    free: count(agent.freeSockets),
    queued: count(agent.requests),
  };
}

async function testConcurrentLiveness() {
  resetObservabilityForTests();
  console.log = () => {};

  // Bound to loopback explicitly: the requests below target
  // 127.0.0.1, so the listener should not be reachable on any other
  // interface for the duration of the test.
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const agent = createLoadAgent();

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
          const response = await loadRequest(
            agent,
            `${baseUrl}/health/live`,
            { "x-request-id": requestId }
          );

          return {
            body: response.body,
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
    /*
      Order matters: destroy the client agent first so no keep-alive
      socket outlives the server, then close the listener. Previously
      160 keep-alive sockets were still open at server.close(), so
      closing depended on an external dispatcher's idle timer.
      closeAllConnections() covers a socket still attached because an
      assertion threw mid-flight.
    */
    await destroyAgent(agent);
    server.closeAllConnections?.();
    await closeServer(server);
    console.log = originalConsoleLog;

    // Fails here, deterministically, if a future change reintroduces
    // an unbounded or unclosed transport.
    const sockets = agentSocketCount(agent);

    assert.deepEqual(
      sockets,
      { active: 0, free: 0, queued: 0 },
      `Load agent leaked sockets: ${JSON.stringify(sockets)}`
    );
    assert.equal(
      server.listening,
      false,
      "Server must not still be listening after teardown."
    );
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
