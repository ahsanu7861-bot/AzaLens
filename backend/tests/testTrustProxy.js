"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const axios = require("axios");

// ============================================================
// AzaLens - Trust Proxy / Genuine-Client Resolution Contract Tests
//
// Verified production proxy topology (Render):
//   client -> edge proxy (172.x) -> internal proxy (10.x) -> app
// req.socket.remoteAddress is the app's direct peer (the innermost
// hop); the genuine client sits 3 hops back through
// X-Forwarded-For. app.set("trust proxy", 3) in server.js encodes
// exactly that topology.
//
// These tests boot the real Express app (require("../server").app)
// and prove, end to end, that:
//   1. Requests with no X-Forwarded-For still get keyed/limited
//      safely (fall back to the socket address).
//   2. A verified three-hop chain resolves req.ip to the genuine
//      client (proven via rate-limit bucket identity).
//   3. Values an attacker prepends beyond the genuine client's hop
//      are never mistaken for the client and cannot be used to
//      evade or reset the bucket.
//   4. Different genuine clients (same edge/internal proxy hops)
//      get independent rate-limit buckets.
//   5/6. The strict limiter still returns a 429 with the expected
//      JSON shape and requestId once its configured limit is hit.
//   7. Existing global exemptions and strict-route protections keep
//      working when requests carry a realistic proxy chain.
//
// axios.get/post are stubbed with canned, deterministic responses
// (same approach as testRateLimitHttp.js) so /api/analyze/:symbol
// never makes a real network call.
// ============================================================

process.env.NODE_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "false";
process.env.FINNHUB_API_KEY = "trust-proxy-test-key";
process.env.TWELVE_DATA_API_KEY = "trust-proxy-test-key";
process.env.SHARIAH_DATA_MODE = "offline";
delete process.env.HALAL_TERMINAL_LIVE_ENABLED;

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;
const originalConsoleLog = console.log;

let axiosPostCallCount = 0;

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
    const bars = [];
    const startMs = Date.parse("2026-01-01T00:00:00Z");

    for (let index = 0; index < 120; index += 1) {
      const timestamp = new Date(
        startMs + index * 86_400_000
      )
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const close = 200 + Math.sin(index / 5) * 2 + index * 0.05;

      bars.push({
        datetime: timestamp,
        open: (close - 0.5).toFixed(2),
        high: (close + 1).toFixed(2),
        low: (close - 1).toFixed(2),
        close: close.toFixed(2),
        volume: String(1_000_000 + (index % 10) * 5_000),
      });
    }

    return { data: { status: "ok", values: bars.reverse() } };
  }

  throw new Error(
    `Unexpected axios.get URL in trust proxy tests: ${url}`
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

const EDGE_PROXY_IP = "172.16.0.5";
const INTERNAL_PROXY_IP = "10.0.0.5";

function verifiedChain(genuineClientIp, attackerPrefix = []) {
  return [
    ...attackerPrefix,
    genuineClientIp,
    EDGE_PROXY_IP,
    INTERNAL_PROXY_IP,
  ].join(", ");
}

async function get(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function fireSequentially(baseUrl, path, count, xForwardedFor) {
  const responses = [];

  for (let index = 0; index < count; index += 1) {
    responses.push(
      await get(baseUrl, path, {
        headers: xForwardedFor
          ? { "X-Forwarded-For": xForwardedFor }
          : {},
      })
    );
  }

  return responses;
}

function statuses(responses) {
  return responses.map((response) => response.status);
}

// ------------------------------------------------------------
// 1. No X-Forwarded-For: rate limiting still identifies requests
// safely (falls back to the socket address, no crash, no bypass).
// ------------------------------------------------------------
async function testNoXffFallbackIsSafe() {
  const { baseUrl, close } = await bootServer();

  try {
    const responses = await fireSequentially(
      baseUrl,
      "/version",
      31,
      null
    );
    const statusList = statuses(responses);

    assert.deepEqual(
      statusList.slice(0, 30),
      Array(30).fill(200),
      "requests without X-Forwarded-For must still be allowed up to the limit"
    );
    assert.equal(
      statusList[30],
      429,
      "request 31 without X-Forwarded-For must still be rejected"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 2 & 4. A verified three-hop chain resolves req.ip to the genuine
// client (all 30 requests from one client share one bucket), and a
// different genuine client (same edge/internal proxy hops) gets an
// independent bucket.
// ------------------------------------------------------------
async function testThreeHopResolvesGenuineClientAndIsolatesOthers() {
  const { baseUrl, close } = await bootServer();

  try {
    const clientA = verifiedChain("203.0.113.10");
    const clientAResponses = await fireSequentially(
      baseUrl,
      "/version",
      30,
      clientA
    );

    assert.deepEqual(
      statuses(clientAResponses),
      Array(30).fill(200),
      "genuine client A must get its full 30-request allowance"
    );

    const clientAOverflow = await get(baseUrl, "/version", {
      headers: { "X-Forwarded-For": clientA },
    });

    assert.equal(
      clientAOverflow.status,
      429,
      "client A's 31st request must be rejected"
    );

    // A second genuine client, behind the exact same edge/internal
    // proxy hops, must not inherit client A's exhausted bucket.
    const clientB = verifiedChain("203.0.113.20");
    const clientBResponse = await get(baseUrl, "/version", {
      headers: { "X-Forwarded-For": clientB },
    });

    assert.equal(
      clientBResponse.status,
      200,
      "a different genuine client sharing the same proxy hops must get an independent bucket"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 3. Attacker-prepended values beyond the genuine client must never
// be mistaken for the client, and must not let the attacker evade
// (or spuriously reset) the genuine client's bucket.
// ------------------------------------------------------------
async function testAttackerPrependedValuesAreIgnored() {
  const { baseUrl, close } = await bootServer();

  try {
    const genuineClientIp = "203.0.113.30";

    // Exhaust the genuine client's bucket with no attacker prefix.
    const exhaustResponses = await fireSequentially(
      baseUrl,
      "/version",
      30,
      verifiedChain(genuineClientIp)
    );

    assert.deepEqual(
      statuses(exhaustResponses),
      Array(30).fill(200)
    );

    // Now replay the *same* genuine client with several different,
    // varying attacker-prepended prefixes. If req.ip were resolving
    // to the leftmost (attacker-controlled) entry instead of the
    // genuine client's hop, each of these would land in a fresh
    // bucket and be allowed (200) - proving a bypass. It must not.
    const spoofAttempts = [
      verifiedChain(genuineClientIp, ["9.9.9.9"]),
      verifiedChain(genuineClientIp, ["1.2.3.4", "5.6.7.8"]),
      verifiedChain(genuineClientIp, ["203.0.113.30"]), // even reusing the real IP as noise
      verifiedChain(genuineClientIp, ["::1"]),
    ];

    for (const chain of spoofAttempts) {
      const response = await get(baseUrl, "/version", {
        headers: { "X-Forwarded-For": chain },
      });

      assert.equal(
        response.status,
        429,
        `attacker-prepended prefix must not evade the genuine client's exhausted bucket: ${chain}`
      );
    }

    // And an attacker cannot impersonate a *different* victim by
    // putting the victim's IP in the attacker-controlled prefix
    // region: since that region is beyond hop 3, it must be ignored
    // entirely and must not consume the real victim's bucket.
    const victimIp = "203.0.113.40";
    const impersonationAttempt = verifiedChain(genuineClientIp, [
      victimIp,
    ]);
    const impersonationResponse = await get(baseUrl, "/version", {
      headers: { "X-Forwarded-For": impersonationAttempt },
    });

    assert.equal(
      impersonationResponse.status,
      429,
      "the request must still be attributed to the real hop-3 client, not the attacker-prepended victim IP"
    );

    const victimOwnRequest = await get(baseUrl, "/version", {
      headers: { "X-Forwarded-For": verifiedChain(victimIp) },
    });

    assert.equal(
      victimOwnRequest.status,
      200,
      "the victim's own genuine bucket must remain untouched by the attacker's impersonation attempt"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 5 & 6. The strict limiter still returns 429 after its configured
// limit, with the expected JSON shape and requestId, when requests
// carry a realistic three-hop proxy chain.
// ------------------------------------------------------------
async function testStrictLimiter429ShapeWithProxyChain() {
  const { baseUrl, close } = await bootServer();

  try {
    const chain = verifiedChain("203.0.113.50");
    const responses = await fireSequentially(
      baseUrl,
      "/api/analyze/AAPL",
      11,
      chain
    );
    const statusList = statuses(responses);

    assert.ok(
      statusList
        .slice(0, 10)
        .every((status) => status !== 429),
      "requests 1-10 through the verified proxy chain must not be rate-limited"
    );
    assert.equal(
      statusList[10],
      429,
      "request 11 through the verified proxy chain must be rejected"
    );

    const rejected = responses[10];
    const body = await rejected.json();

    assert.equal(body.success, false);
    assert.equal(typeof body.error, "string");
    assert.ok(body.error.length > 0);
    assert.equal(typeof body.requestId, "string");
    assert.ok(body.requestId.length > 0);
    assert.equal(
      body.requestId,
      rejected.headers.get("x-request-id"),
      "429 requestId must still come through requestObservability"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 7. Existing global exemptions and strict-route protections keep
// working when requests carry a realistic proxy chain.
// ------------------------------------------------------------
async function testExemptionsAndStrictIsolationStillWork() {
  const { baseUrl, close } = await bootServer();

  try {
    const chain = verifiedChain("203.0.113.60");

    for (const path of [
      "/health",
      "/health/live",
      "/health/ready",
      "/ops/metrics",
    ]) {
      const responses = await fireSequentially(
        baseUrl,
        path,
        35,
        chain
      );

      assert.ok(
        statuses(responses).every((status) => status !== 429),
        `${path} must remain exempt from the global limiter even with a proxy chain present`
      );
    }

    // Strict-route traffic must still be isolated from the global
    // bucket for the same genuine client.
    const strictResponses = await fireSequentially(
      baseUrl,
      "/api/analyze/AAPL",
      10,
      chain
    );

    assert.ok(
      statuses(strictResponses).every(
        (status) => status !== 429
      ),
      "the first 10 strict requests for this genuine client must not be rate-limited"
    );

    const ordinaryResponses = await fireSequentially(
      baseUrl,
      "/version",
      31,
      chain
    );
    const ordinaryStatuses = statuses(ordinaryResponses);

    assert.deepEqual(
      ordinaryStatuses.slice(0, 30),
      Array(30).fill(200),
      "strict-route traffic must not have consumed the global bucket for the same genuine client"
    );
    assert.equal(ordinaryStatuses[30], 429);
  } finally {
    await close();
  }
}

const originalAxiosPostCallCountAtStart = 0;

async function run() {
  console.log = () => {};

  try {
    await testNoXffFallbackIsSafe();
    await testThreeHopResolvesGenuineClientAndIsolatesOthers();
    await testAttackerPrependedValuesAreIgnored();
    await testStrictLimiter429ShapeWithProxyChain();
    await testExemptionsAndStrictIsolationStillWork();
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(
    axiosPostCallCount,
    originalAxiosPostCallCountAtStart,
    "no test may reach the Halal Terminal (axios.post) provider"
  );

  console.log(
    "Trust proxy contract tests: all scenarios passed. " +
      "Genuine client resolution verified across the 3-hop chain, " +
      "attacker-prepended values ignored, no real provider network calls made."
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
