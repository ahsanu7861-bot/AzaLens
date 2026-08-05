"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const {
  requestObservability,
} = require("../utils/observability");
const {
  createGlobalLimiter,
  createStrictLimiter,
} = require("../utils/rateLimit");

// ============================================================
// AzaLens - Rate Limit Bucket Contract Tests
//
// Exercises createGlobalLimiter/createStrictLimiter directly on
// small, purpose-built Express apps (not the full server) so each
// scenario gets a completely fresh in-memory limiter store. This
// proves the limiter/store behavior itself is deterministic and
// correctly shared/isolated; testRateLimitHttp.js proves the real
// server wiring matches this same contract end to end.
// ============================================================

async function bootApp(configure) {
  const app = express();

  app.use(requestObservability);
  configure(app);

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

function okHandler(req, res) {
  res.status(200).json({ ok: true });
}

async function request(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function fireSequentially(baseUrl, paths) {
  const statuses = [];

  for (const path of paths) {
    const response = await request(baseUrl, path);

    statuses.push(response.status);
  }

  return statuses;
}

function repeat(path, count) {
  return Array.from({ length: count }, () => path);
}

async function testGlobalBucket() {
  const { baseUrl, close } = await bootApp((app) => {
    app.use(createGlobalLimiter());
    app.get("/ordinary", okHandler);
  });

  try {
    const statuses = await fireSequentially(
      baseUrl,
      repeat("/ordinary", 31)
    );

    assert.deepEqual(
      statuses.slice(0, 30),
      Array(30).fill(200),
      "requests 1-30 must be allowed"
    );
    assert.equal(
      statuses[30],
      429,
      "request 31 must be rejected"
    );
  } finally {
    await close();
  }
}

async function testStrictBucket() {
  const { baseUrl, close } = await bootApp((app) => {
    app.get(
      "/api/analyze/:symbol",
      createStrictLimiter(),
      okHandler
    );
  });

  try {
    const statuses = await fireSequentially(
      baseUrl,
      repeat("/api/analyze/AAPL", 11)
    );

    assert.deepEqual(
      statuses.slice(0, 10),
      Array(10).fill(200),
      "requests 1-10 must be allowed"
    );
    assert.equal(
      statuses[10],
      429,
      "request 11 must be rejected"
    );
  } finally {
    await close();
  }
}

async function bootStrictApp() {
  return bootApp((app) => {
    const strictLimiter = createStrictLimiter();

    app.get(
      "/api/analyze/:symbol",
      strictLimiter,
      okHandler
    );
  });
}

async function testStrictBucketAcrossSymbols() {
  const { baseUrl, close } = await bootStrictApp();

  try {
    const sequence = [
      ...repeat("/api/analyze/AAPL", 4),
      ...repeat("/api/analyze/GOOG", 3),
      ...repeat("/api/analyze/MSFT", 3),
    ];
    const statuses = await fireSequentially(
      baseUrl,
      sequence
    );

    assert.deepEqual(
      statuses,
      Array(10).fill(200),
      "all 10 strict requests across symbols must be allowed"
    );

    const eleventh = await request(
      baseUrl,
      "/api/analyze/AAPL"
    );

    assert.equal(
      eleventh.status,
      429,
      "the 11th strict request must be rejected"
    );
  } finally {
    await close();
  }
}

async function testReorderedStrictBucket() {
  const { baseUrl, close } = await bootStrictApp();

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
    const statuses = await fireSequentially(
      baseUrl,
      sequence
    );

    assert.deepEqual(
      statuses,
      Array(10).fill(200),
      "all 10 strict requests must be allowed regardless of symbol order"
    );

    const eleventh = await request(
      baseUrl,
      "/api/analyze/AAPL"
    );

    assert.equal(
      eleventh.status,
      429,
      "the next request to the strict route must be rejected"
    );
  } finally {
    await close();
  }
}

async function testSingleInvocationProof() {
  // A single strict endpoint, fresh limiter: exactly 10 allowed
  // then a 429. If the limiter were accidentally mounted/invoked
  // twice, this would either allow 20 requests or reject earlier
  // than request 11 - either way this assertion would fail.
  const { baseUrl, close } = await bootApp((app) => {
    app.get(
      "/api/analyze/:symbol",
      createStrictLimiter(),
      okHandler
    );
  });

  try {
    const statuses = await fireSequentially(
      baseUrl,
      repeat("/api/analyze/AAPL", 11)
    );

    assert.deepEqual(
      statuses.slice(0, 10),
      Array(10).fill(200)
    );
    assert.equal(statuses[10], 429);
  } finally {
    await close();
  }
}

async function testNoDoubleCounting() {
  const { baseUrl, close } = await bootApp((app) => {
    const strictLimiter = createStrictLimiter();

    app.use(createGlobalLimiter());
    app.get("/ordinary", okHandler);
    app.get(
      "/api/analyze/:symbol",
      strictLimiter,
      okHandler
    );
  });

  try {
    // Exhaust the strict bucket across several symbols first.
    const strictSequence = [
      ...repeat("/api/analyze/AAPL", 4),
      ...repeat("/api/analyze/GOOG", 3),
      ...repeat("/api/analyze/MSFT", 3),
    ];
    const strictStatuses = await fireSequentially(
      baseUrl,
      strictSequence
    );

    assert.deepEqual(
      strictStatuses,
      Array(10).fill(200)
    );

    const strictOverflow = await request(
      baseUrl,
      "/api/analyze/AAPL"
    );

    assert.equal(strictOverflow.status, 429);

    // Strict-route traffic must not have touched the global bucket:
    // 30 ordinary requests remain fully available.
    const ordinaryStatuses = await fireSequentially(
      baseUrl,
      repeat("/ordinary", 31)
    );

    assert.deepEqual(
      ordinaryStatuses.slice(0, 30),
      Array(30).fill(200),
      "the global bucket must still have its full 30-request allowance"
    );
    assert.equal(
      ordinaryStatuses[30],
      429,
      "only ordinary request 31 should receive the global 429"
    );
  } finally {
    await close();
  }
}

async function testFreshStateProof() {
  // Exhaust one app's global bucket completely...
  const exhausted = await bootApp((app) => {
    app.use(createGlobalLimiter());
    app.get("/ordinary", okHandler);
  });

  try {
    await fireSequentially(
      exhausted.baseUrl,
      repeat("/ordinary", 30)
    );

    const blocked = await request(
      exhausted.baseUrl,
      "/ordinary"
    );

    assert.equal(blocked.status, 429);
  } finally {
    await exhausted.close();
  }

  // ...then prove a brand new factory/app construction starts with
  // empty counters, unaffected by the exhausted instance above.
  const fresh = await bootApp((app) => {
    app.use(createGlobalLimiter());
    app.get("/ordinary", okHandler);
  });

  try {
    const first = await request(fresh.baseUrl, "/ordinary");

    assert.equal(
      first.status,
      200,
      "a newly constructed limiter must begin with empty counters"
    );
  } finally {
    await fresh.close();
  }
}

async function testOptionsDoesNotConsumeAllowance() {
  const { baseUrl, close } = await bootApp((app) => {
    app.use(createGlobalLimiter());
    app.get(
      "/api/analyze/:symbol",
      createStrictLimiter(),
      okHandler
    );
  });

  try {
    const optionsStatuses = [];

    for (let index = 0; index < 40; index += 1) {
      const response = await request(
        baseUrl,
        "/api/analyze/AAPL",
        { method: "OPTIONS" }
      );

      optionsStatuses.push(response.status);
    }

    assert.ok(
      optionsStatuses.every(
        (status) => status !== 429
      ),
      "OPTIONS must never receive a limiter-generated 429"
    );

    // Full strict allowance (10) must still be available afterward.
    const statuses = await fireSequentially(
      baseUrl,
      repeat("/api/analyze/AAPL", 11)
    );

    assert.deepEqual(
      statuses.slice(0, 10),
      Array(10).fill(200),
      "OPTIONS traffic must not have reduced the strict allowance"
    );
    assert.equal(statuses[10], 429);
  } finally {
    await close();
  }
}

const originalConsoleLog = console.log;

async function run() {
  console.log = () => {};

  try {
    await testGlobalBucket();
    await testStrictBucket();
    await testStrictBucketAcrossSymbols();
    await testReorderedStrictBucket();
    await testSingleInvocationProof();
    await testNoDoubleCounting();
    await testFreshStateProof();
    await testOptionsDoesNotConsumeAllowance();
  } finally {
    console.log = originalConsoleLog;
  }

  console.log(
    "Rate limit bucket contract tests: all scenarios passed."
  );
}

run().catch((error) => {
  console.log = originalConsoleLog;
  console.error(error);
  process.exitCode = 1;
});
