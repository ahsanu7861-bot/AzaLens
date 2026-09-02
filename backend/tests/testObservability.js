"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

process.env.NODE_ENV = "test";

const {
  buildReadinessSnapshot,
  getCurrentRequestId,
  getMetricsSnapshot,
  isMetricsAuthorized,
  recordProviderAttempt,
  recordProviderBreakerEvent,
  recordProviderRetry,
  recordProviderResult,
  requestObservability,
  resetObservabilityForTests,
} = require("../utils/observability");

function createRequest({
  requestId = null,
  method = "GET",
  route = "/api/analyze/:symbol",
} = {}) {
  return {
    method,
    baseUrl: "",
    route: {
      path: route,
    },
    headers: requestId
      ? {
          "x-request-id": requestId,
        }
      : {},
    get(name) {
      return this.headers[
        String(name).toLowerCase()
      ];
    },
  };
}

function createResponse(statusCode = 200) {
  const response = new EventEmitter();

  response.statusCode = statusCode;
  response.headers = {};
  response.setHeader = (name, value) => {
    response.headers[
      String(name).toLowerCase()
    ] = value;
  };

  return response;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();

  return {
    response,
    body,
  };
}

async function run() {
  resetObservabilityForTests();

  const preservedRequestId =
    "release-health-check-001";
  const request = createRequest({
    requestId: preservedRequestId,
  });
  const response = createResponse(503);
  const unsafeRequest = createRequest({
    requestId: "unsafe request id",
    route: "/health/live",
  });
  const unsafeResponse = createResponse(200);
  let middlewareContinued = false;
  let contextualRequestId = null;

  requestObservability(
    request,
    response,
    () => {
      middlewareContinued = true;
      contextualRequestId =
        getCurrentRequestId();
    }
  );

  assert.equal(middlewareContinued, true);
  assert.equal(
    request.requestId,
    preservedRequestId
  );
  assert.equal(
    contextualRequestId,
    preservedRequestId
  );
  assert.equal(
    response.headers["x-request-id"],
    preservedRequestId
  );

  response.emit("finish");
  response.emit("close");

  requestObservability(
    unsafeRequest,
    unsafeResponse,
    () => {}
  );
  unsafeResponse.emit("finish");

  assert.notEqual(
    unsafeRequest.requestId,
    "unsafe request id"
  );
  assert.match(
    unsafeRequest.requestId,
    /^[A-Za-z0-9-]{32,36}$/
  );

  recordProviderResult({
    provider: "Finnhub",
    operation: "live_quote",
    result: {
      success: true,
      limitations: [
        "Company profile enrichment is unavailable because the Finnhub rate limit was reached.",
      ],
      cache: {
        status: "HIT",
        hit: true,
      },
    },
    durationMs: 12,
  });
  recordProviderResult({
    provider: "Finnhub",
    operation: "live_quote",
    result: {
      success: false,
      code: "FINNHUB_TIMEOUT",
      error: "Finnhub request timed out.",
      cache: {
        status: "MISS",
        hit: false,
      },
    },
    durationMs: 10000,
  });
  recordProviderResult({
    provider: "TwelveData",
    operation: "historical_ohlcv",
    result: {
      success: false,
      code: "TWELVE_DATA_RATE_LIMIT",
      httpStatus: 429,
      cache: "MISS",
    },
    durationMs: 320,
  });
  recordProviderResult({
    provider: "Halal Terminal",
    operation: "shariah_screening",
    result: {
      success: false,
      error: {
        code: "SHARIAH_LIVE_API_DISABLED",
      },
      metadata: {
        dataMode: "offline",
        fromCache: false,
      },
    },
    durationMs: 1,
  });

  assert.equal(
    recordProviderAttempt({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      outcome: "rate_limit",
      symbol: "MUST_NOT_BE_RECORDED",
      query: "MUST_NOT_BE_RECORDED",
      credential: "MUST_NOT_BE_RECORDED",
      payload: "MUST_NOT_BE_RECORDED",
    }),
    true
  );
  assert.equal(
    recordProviderAttempt({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      outcome: "success",
    }),
    true
  );
  assert.equal(
    recordProviderRetry({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      reason: "rate_limit",
      delayMs: 250,
    }),
    true
  );
  assert.equal(
    recordProviderBreakerEvent({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      event: "opened",
    }),
    true
  );
  assert.equal(
    recordProviderBreakerEvent({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      event: "rejected",
    }),
    true
  );
  assert.equal(
    recordProviderBreakerEvent({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      event: "half_opened",
    }),
    true
  );
  assert.equal(
    recordProviderBreakerEvent({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      event: "closed",
    }),
    true
  );

  for (const rejectedEvent of [
    {
      provider: "UnboundedProvider",
      operation: "historical_ohlcv",
      outcome: "success",
    },
    {
      provider: "TwelveData",
      operation: "symbol:AAPL",
      outcome: "success",
    },
    {
      provider: "TwelveData",
      operation: "historical_ohlcv",
      outcome: "credential:test-key",
    },
  ]) {
    assert.equal(
      recordProviderAttempt(rejectedEvent),
      false
    );
  }

  assert.equal(
    recordProviderRetry({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      reason: "server_error",
      delayMs: 250,
    }),
    false
  );
  assert.equal(
    recordProviderRetry({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      reason: "timeout",
      delayMs: "250",
    }),
    false,
    "numeric-looking strings must not become recorded delay measurements"
  );
  assert.equal(
    recordProviderRetry({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      reason: "timeout",
      delayMs: 86_400_001,
    }),
    false
  );
  assert.equal(
    recordProviderBreakerEvent({
      provider: "TwelveData",
      operation: "historical_ohlcv",
      event: "forced_open_with_symbol",
    }),
    false
  );

  const metrics = getMetricsSnapshot();
  const httpRoute = metrics.http.routes.find(
    ({ route }) =>
      route === "/api/analyze/:symbol"
  );
  const finnhub = metrics.providers.find(
    ({ provider }) => provider === "Finnhub"
  );
  const twelveData = metrics.providers.find(
    ({ provider }) =>
      provider === "TwelveData"
  );
  const shariah = metrics.providers.find(
    ({ provider }) =>
      provider === "Halal Terminal"
  );
  const historyResilience =
    metrics.providerResilience.find(
      ({ provider, operation }) =>
        provider === "TwelveData" &&
        operation === "historical_ohlcv"
    );

  assert.equal(metrics.http.count, 2);
  assert.equal(metrics.http.successes, 1);
  assert.equal(metrics.http.failures, 1);
  assert.equal(metrics.http.inFlight, 0);
  assert.equal(
    metrics.http.statusCodes["503"],
    1
  );
  assert.equal(httpRoute.count, 1);
  assert.equal(finnhub.count, 2);
  assert.equal(finnhub.successes, 0);
  assert.equal(finnhub.failures, 1);
  assert.equal(finnhub.degraded, 1);
  assert.equal(finnhub.timeouts, 1);
  assert.equal(finnhub.rateLimits, 1);
  assert.equal(finnhub.cacheHits, 1);
  assert.equal(finnhub.cacheMisses, 1);
  assert.equal(twelveData.rateLimits, 1);
  assert.equal(shariah.blocked, 1);
  assert.equal(shariah.failures, 0);
  assert.deepEqual(historyResilience, {
    provider: "TwelveData",
    operation: "historical_ohlcv",
    attempts: {
      total: 2,
      successes: 1,
      failures: 0,
      timeouts: 0,
      rateLimits: 1,
    },
    retries: {
      total: 1,
      timeouts: 0,
      rateLimits: 1,
      totalDelayMs: 250,
      maximumDelayMs: 250,
    },
    breaker: {
      state: "closed",
      opened: 1,
      halfOpened: 1,
      closed: 1,
      rejected: 1,
    },
  });
  assert.equal(
    metrics.providerResilience.length,
    1,
    "rejected labels must not create unbounded metric series"
  );

  const serializedMetrics = JSON.stringify(metrics);

  for (const forbiddenValue of [
    "MUST_NOT_BE_RECORDED",
    "UnboundedProvider",
    "symbol:AAPL",
    "credential:test-key",
    "forced_open_with_symbol",
  ]) {
    assert.equal(
      serializedMetrics.includes(forbiddenValue),
      false,
      `protected metrics must not retain ${forbiddenValue}`
    );
  }

  const incompleteReadiness =
    buildReadinessSnapshot({
      strict: true,
      env: {
        NODE_ENV: "production",
        SHARIAH_DATA_MODE: "offline",
      },
    });
  const completeReadiness =
    buildReadinessSnapshot({
      strict: true,
      env: {
        NODE_ENV: "production",
        FINNHUB_API_KEY: "configured",
        TWELVE_DATA_API_KEY: "configured",
        TWELVE_DATA_CREDIT_COORDINATION_MODE: "shared_atomic",
        SUPABASE_URL: "https://example.invalid",
        SUPABASE_SECRET_KEY: "configured",
        SHARIAH_DATA_MODE: "offline",
      },
    });

  assert.equal(
    incompleteReadiness.ready,
    false
  );
  assert.equal(
    incompleteReadiness.checks
      .marketProviders,
    "incomplete"
  );
  assert.equal(
    completeReadiness.ready,
    true
  );

  assert.equal(
    isMetricsAuthorized(
      {
        headers: {
          authorization: "Bearer correct-token",
        },
      },
      {
        NODE_ENV: "production",
        OBSERVABILITY_METRICS_TOKEN:
          "correct-token",
      }
    ),
    true
  );
  assert.equal(
    isMetricsAuthorized(
      {
        headers: {
          authorization: "Bearer wrong-token",
        },
      },
      {
        NODE_ENV: "production",
        OBSERVABILITY_METRICS_TOKEN:
          "correct-token",
      }
    ),
    false
  );

  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve) => {
      if (server.listening) {
        resolve();
        return;
      }

      server.once("listening", resolve);
    });

    const address = server.address();
    const baseUrl =
      `http://127.0.0.1:${address.port}`;
    const live = await requestJson(
      `${baseUrl}/health/live`
    );
    const ready = await requestJson(
      `${baseUrl}/health/ready`
    );
    const operations = await requestJson(
      `${baseUrl}/ops/metrics`
    );
    const missing = await requestJson(
      `${baseUrl}/missing`
    );
    const environmentSnapshot = {
      NODE_ENV: process.env.NODE_ENV,
      OBSERVABILITY_METRICS_TOKEN:
        process.env
          .OBSERVABILITY_METRICS_TOKEN,
    };

    assert.equal(live.response.status, 200);
    assert.equal(live.body.status, "healthy");
    assert.equal(
      live.response.headers.get(
        "cache-control"
      ),
      "no-store"
    );
    assert.equal(
      live.body.requestId,
      live.response.headers.get("x-request-id")
    );
    assert.equal(ready.response.status, 200);
    assert.equal(ready.body.ready, true);
    assert.equal(
      operations.response.status,
      200
    );
    assert.equal(
      operations.body.success,
      true
    );
    assert.equal(
      operations.body.data
        .halalTerminalBudget.source,
      "local-estimate"
    );
    assert.equal(
      operations.body.data
        .halalTerminalBudget.ledgerPersistence,
      "not-guaranteed"
    );
    assert.equal(
      typeof operations.body.data
        .halalTerminalBudget
        .configuredMonthlyBudget,
      "number"
    );
    assert.equal(missing.response.status, 404);
    assert.equal(
      missing.body.requestId,
      missing.response.headers.get(
        "x-request-id"
      )
    );

    try {
      process.env.NODE_ENV = "production";
      delete process.env
        .OBSERVABILITY_METRICS_TOKEN;

      const disabledMetrics = await requestJson(
        `${baseUrl}/ops/metrics`
      );

      assert.equal(
        disabledMetrics.response.status,
        404
      );

      process.env
        .OBSERVABILITY_METRICS_TOKEN =
        "production-metrics-token";

      const unauthenticatedMetrics =
        await requestJson(
          `${baseUrl}/ops/metrics`
        );
      const authenticatedMetrics =
        await requestJson(
          `${baseUrl}/ops/metrics`,
          {
            headers: {
              Authorization:
                "Bearer production-metrics-token",
            },
          }
        );

      assert.equal(
        unauthenticatedMetrics.response.status,
        401
      );
      assert.equal(
        "providerResilience" in
          (unauthenticatedMetrics.body.data || {}),
        false,
        "resilience telemetry must stay behind metrics authorization"
      );
      assert.equal(
        authenticatedMetrics.response.status,
        200
      );
      assert.equal(
        Array.isArray(
          authenticatedMetrics.body.data
            .providerResilience
        ),
        true
      );
    } finally {
      if (
        environmentSnapshot.NODE_ENV ===
        undefined
      ) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV =
          environmentSnapshot.NODE_ENV;
      }

      if (
        environmentSnapshot
          .OBSERVABILITY_METRICS_TOKEN ===
        undefined
      ) {
        delete process.env
          .OBSERVABILITY_METRICS_TOKEN;
      } else {
        process.env
          .OBSERVABILITY_METRICS_TOKEN =
          environmentSnapshot
            .OBSERVABILITY_METRICS_TOKEN;
      }
    }
  } finally {
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

  console.log(
    "Observability and health-contract tests passed."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
