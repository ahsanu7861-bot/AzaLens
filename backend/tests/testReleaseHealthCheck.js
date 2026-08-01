"use strict";

const assert = require("node:assert/strict");

const {
  createConfig,
  runReleaseHealthCheck,
} = require("../scripts/releaseHealthCheck");

const DEPLOYED_COMMIT =
  "4a7f46bc39bd765a7b5739b64e4faa11b97e7ffd";

function createHeaders(values = {}) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(
      ([key, value]) => [
        key.toLowerCase(),
        value,
      ]
    )
  );

  return {
    get(name) {
      return (
        normalized[
          String(name).toLowerCase()
        ] || null
      );
    },
  };
}

function createResponse(
  status,
  body,
  headers = {}
) {
  const text =
    typeof body === "string"
      ? body
      : JSON.stringify(body);

  return {
    status,
    headers: createHeaders(headers),
    async text() {
      return text;
    },
  };
}

function requestHeader(options, name) {
  const headers = options?.headers || {};
  const match = Object.entries(headers).find(
    ([key]) =>
      key.toLowerCase() ===
      name.toLowerCase()
  );

  return match?.[1] || null;
}

function createFetchMock({
  deployedCommit = DEPLOYED_COMMIT,
  expectMetricsToken = false,
  calls = [],
} = {}) {
  return async (url, options = {}) => {
    calls.push({
      url,
      headers: {
        ...(options.headers || {}),
      },
    });

    if (url === "https://frontend.test") {
      return createResponse(
        200,
        "<html><body><div id=\"root\"></div></body></html>",
        {
          "content-type":
            "text/html; charset=utf-8",
        }
      );
    }

    const requestId = requestHeader(
      options,
      "x-request-id"
    );
    const commonHeaders = {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": requestId,
    };

    if (url.endsWith("/health/live")) {
      return createResponse(
        200,
        {
          status: "healthy",
          service: "azalens-backend",
          timestamp: new Date().toISOString(),
          deployment: {
            commit: deployedCommit,
          },
          requestId,
        },
        commonHeaders
      );
    }

    if (url.endsWith("/health/ready")) {
      return createResponse(
        200,
        {
          status: "ready",
          ready: true,
          strict: true,
          timestamp: new Date().toISOString(),
          checks: {
            runtime: "pass",
            marketProviders: "configured",
            shariahDataMode: "offline",
          },
          deployment: {
            commit: deployedCommit,
          },
          requestId,
        },
        commonHeaders
      );
    }

    if (url.endsWith("/ops/metrics")) {
      const authorization = requestHeader(
        options,
        "authorization"
      );

      if (expectMetricsToken) {
        assert.equal(
          authorization,
          "Bearer test-metrics-token"
        );

        return createResponse(
          200,
          {
            success: true,
            requestId,
            data: {
              process: {},
              http: {},
              providers: [],
            },
          },
          commonHeaders
        );
      }

      assert.equal(authorization, null);

      return createResponse(
        404,
        {
          success: false,
          error: "Route not found.",
          requestId,
        },
        commonHeaders
      );
    }

    throw new Error(`Unexpected URL: ${url}`);
  };
}

function createTestConfig(overrides = {}) {
  return createConfig({
    HEALTH_FRONTEND_URL:
      "https://frontend.test",
    HEALTH_API_URL: "https://api.test",
    EXPECTED_COMMIT: DEPLOYED_COMMIT,
    HEALTH_REQUEST_TIMEOUT_MS: "1000",
    HEALTH_MAX_DEPLOYMENT_ATTEMPTS: "1",
    ...overrides,
  });
}

async function run() {
  const failClosedReport =
    await runReleaseHealthCheck(
      createTestConfig(),
      {
        fetchImpl: createFetchMock(),
      }
    );

  assert.equal(
    failClosedReport.success,
    true
  );
  assert.equal(
    failClosedReport.status,
    "PASS_WITH_LIMITATIONS"
  );
  assert.equal(
    failClosedReport.checks.length,
    4
  );
  assert.equal(
    failClosedReport.limitations.length,
    1
  );
  assert.equal(
    failClosedReport.target.deployedCommit,
    DEPLOYED_COMMIT
  );

  const authenticatedCalls = [];
  const authenticatedReport =
    await runReleaseHealthCheck(
      createTestConfig({
        OBSERVABILITY_METRICS_TOKEN:
          "test-metrics-token",
      }),
      {
        fetchImpl: createFetchMock({
          expectMetricsToken: true,
          calls: authenticatedCalls,
        }),
      }
    );

  assert.equal(
    authenticatedReport.success,
    true
  );
  assert.equal(
    authenticatedReport.status,
    "PASS"
  );
  assert.equal(
    authenticatedReport.limitations.length,
    0
  );
  assert.equal(
    JSON.stringify(authenticatedReport)
      .includes("test-metrics-token"),
    false
  );
  assert.equal(
    authenticatedCalls.some(
      ({ headers }) =>
        headers.Authorization ===
        "Bearer test-metrics-token"
    ),
    true
  );
  assert.equal(
    authenticatedCalls.some(
      ({ url }) =>
        url.includes("/api/") ||
        url.includes("/stock/") ||
        url.includes("/history/")
    ),
    false,
    "Release health must never invoke provider-backed product routes."
  );

  const staleDeploymentReport =
    await runReleaseHealthCheck(
      createTestConfig(),
      {
        fetchImpl: createFetchMock({
          deployedCommit: "older-commit",
        }),
      }
    );

  assert.equal(
    staleDeploymentReport.success,
    false
  );
  assert.equal(
    staleDeploymentReport.status,
    "FAIL"
  );
  assert.equal(
    staleDeploymentReport.checks.length,
    1
  );
  assert.equal(
    staleDeploymentReport.failures[0].check,
    "backend_liveness"
  );

  console.log(
    "Release-health automation tests passed."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
