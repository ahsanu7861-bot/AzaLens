"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FRONTEND_URL =
  "https://azalens.vercel.app";
const DEFAULT_API_URL =
  "https://api.azalens.com";
const DEFAULT_SYMBOL = "AAPL";
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_DEPLOYMENT_ATTEMPTS = 1;
const DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS =
  15_000;
const MAX_RESPONSE_AGE_MS = 10 * 60 * 1000;
const SYMBOL_PATTERN = /^[A-Z0-9.^-]{1,15}$/;

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function normalizeBaseUrl(value, fallback) {
  const candidate = String(value || fallback)
    .trim()
    .replace(/\/+$/, "");
  const url = new URL(candidate);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      `Unsupported health-check URL protocol: ${url.protocol}`
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function toPositiveInteger(
  value,
  fallback,
  maximum
) {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number) || number < 1) {
    return fallback;
  }

  return Math.min(number, maximum);
}

function createConfig(env = process.env) {
  const symbol = String(
    env.HEALTH_CHECK_SYMBOL || DEFAULT_SYMBOL
  )
    .trim()
    .toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    throw new Error(
      "HEALTH_CHECK_SYMBOL contains unsupported characters."
    );
  }

  return {
    frontendUrl: normalizeBaseUrl(
      env.HEALTH_FRONTEND_URL,
      DEFAULT_FRONTEND_URL
    ),
    apiUrl: normalizeBaseUrl(
      env.HEALTH_API_URL,
      DEFAULT_API_URL
    ),
    symbol,
    expectedCommit: String(
      env.EXPECTED_COMMIT || ""
    ).trim(),
    metricsToken: String(
      env.OBSERVABILITY_METRICS_TOKEN || ""
    ).trim(),
    requestTimeoutMs: toPositiveInteger(
      env.HEALTH_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      120_000
    ),
    deploymentAttempts: toPositiveInteger(
      env.HEALTH_MAX_DEPLOYMENT_ATTEMPTS,
      DEFAULT_DEPLOYMENT_ATTEMPTS,
      60
    ),
    deploymentPollIntervalMs:
      toPositiveInteger(
        env.HEALTH_DEPLOYMENT_POLL_INTERVAL_MS,
        DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS,
        60_000
      ),
    reportPath: String(
      env.HEALTH_REPORT_PATH || ""
    ).trim(),
    githubStepSummary: String(
      env.GITHUB_STEP_SUMMARY || ""
    ).trim(),
  };
}

function createCheckRequestId(suffix) {
  return [
    "release-health",
    suffix,
    Date.now().toString(36),
    crypto.randomBytes(4).toString("hex"),
  ].join("-");
}

function createTimeoutSignal(timeoutMs) {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

async function fetchResult(
  fetchImpl,
  url,
  {
    headers = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = {}
) {
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: createTimeoutSignal(timeoutMs),
    });
    const text = await response.text();
    let body = null;

    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      response,
      body,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      response: null,
      body: null,
      durationMs: Date.now() - startedAt,
      error: {
        name: error?.name || "Error",
        code: error?.code || null,
        message:
          error?.name === "TimeoutError" ||
          error?.name === "AbortError"
            ? "Request timed out."
            : "Request failed.",
      },
    };
  }
}

function getHeader(result, name) {
  return (
    result?.response?.headers?.get?.(name) ||
    null
  );
}

function requestIdMatches(
  result,
  expectedRequestId
) {
  const bodyRequestId =
    result?.body?.requestId ||
    result?.body?.meta?.requestId ||
    null;

  return (
    getHeader(result, "x-request-id") ===
      expectedRequestId &&
    bodyRequestId === expectedRequestId
  );
}

function commitsMatch(actual, expected) {
  const normalizedActual = String(actual || "")
    .trim()
    .toLowerCase();
  const normalizedExpected = String(expected || "")
    .trim()
    .toLowerCase();

  if (!normalizedExpected) {
    return Boolean(normalizedActual);
  }

  if (!normalizedActual) {
    return false;
  }

  return (
    normalizedActual === normalizedExpected ||
    normalizedActual.startsWith(normalizedExpected) ||
    normalizedExpected.startsWith(normalizedActual)
  );
}

function isRecentTimestamp(
  value,
  now = Date.now()
) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const ageMs = now - timestamp;

  return (
    ageMs >= -60_000 &&
    ageMs <= MAX_RESPONSE_AGE_MS
  );
}

function createCheck({
  id,
  success,
  message,
  durationMs,
  details = {},
  limitation = null,
}) {
  return {
    id,
    success,
    message,
    durationMs,
    details,
    ...(limitation
      ? {
          limitation,
        }
      : {}),
  };
}

async function checkLiveness(
  config,
  fetchImpl
) {
  const requestId =
    createCheckRequestId("live");
  const result = await fetchResult(
    fetchImpl,
    `${config.apiUrl}/health/live`,
    {
      headers: {
        "X-Request-ID": requestId,
      },
      timeoutMs: config.requestTimeoutMs,
    }
  );
  const body = result.body;
  const deployedCommit =
    body?.deployment?.commit || null;
  const success =
    !result.error &&
    result.response?.status === 200 &&
    body?.status === "healthy" &&
    body?.service === "azalens-backend" &&
    isRecentTimestamp(body?.timestamp) &&
    requestIdMatches(result, requestId) &&
    getHeader(result, "cache-control") ===
      "no-store" &&
    commitsMatch(
      deployedCommit,
      config.expectedCommit
    );

  return {
    check: createCheck({
      id: "backend_liveness",
      success,
      message: success
        ? "Backend is live at the expected deployment."
        : result.error
          ? result.error.message
          : "Liveness contract or deployed commit did not match.",
      durationMs: result.durationMs,
      details: {
        httpStatus:
          result.response?.status || null,
        service: body?.service || null,
        deployedCommit,
        expectedCommit:
          config.expectedCommit || null,
        requestIdCorrelated:
          requestIdMatches(result, requestId),
      },
    }),
    deployedCommit,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForDeployment(
  config,
  fetchImpl,
  sleepImpl
) {
  let latest = null;

  for (
    let attempt = 1;
    attempt <= config.deploymentAttempts;
    attempt += 1
  ) {
    latest = await checkLiveness(
      config,
      fetchImpl
    );

    if (latest.check.success) {
      latest.check.details.attempt = attempt;
      return latest;
    }

    if (attempt < config.deploymentAttempts) {
      await sleepImpl(
        config.deploymentPollIntervalMs
      );
    }
  }

  latest.check.details.attempt =
    config.deploymentAttempts;
  return latest;
}

async function checkFrontend(
  config,
  fetchImpl
) {
  const result = await fetchResult(
    fetchImpl,
    config.frontendUrl,
    {
      timeoutMs: config.requestTimeoutMs,
    }
  );
  const contentType = getHeader(
    result,
    "content-type"
  );
  const rootFound =
    typeof result.body === "string" &&
    /<div\b[^>]*\bid=["']root["'][^>]*>/i.test(
      result.body
    );
  const success =
    !result.error &&
    result.response?.status === 200 &&
    String(contentType || "").includes(
      "text/html"
    ) &&
    rootFound;

  return createCheck({
    id: "frontend_shell",
    success,
    message: success
      ? "Frontend shell is serving the application root."
      : result.error
        ? result.error.message
        : "Frontend shell contract failed.",
    durationMs: result.durationMs,
    details: {
      httpStatus:
        result.response?.status || null,
      contentType,
      applicationRootFound: rootFound,
    },
  });
}

async function checkReadiness(
  config,
  fetchImpl,
  deployedCommit
) {
  const requestId =
    createCheckRequestId("ready");
  const result = await fetchResult(
    fetchImpl,
    `${config.apiUrl}/health/ready`,
    {
      headers: {
        "X-Request-ID": requestId,
      },
      timeoutMs: config.requestTimeoutMs,
    }
  );
  const body = result.body;
  const readinessCommit =
    body?.deployment?.commit || null;
  const success =
    !result.error &&
    result.response?.status === 200 &&
    body?.ready === true &&
    body?.status === "ready" &&
    body?.strict === true &&
    body?.checks?.runtime === "pass" &&
    body?.checks?.marketProviders ===
      "configured" &&
    isRecentTimestamp(body?.timestamp) &&
    requestIdMatches(result, requestId) &&
    commitsMatch(
      readinessCommit,
      deployedCommit
    );

  return createCheck({
    id: "backend_readiness",
    success,
    message: success
      ? "Backend is ready with core market providers configured."
      : result.error
        ? result.error.message
        : "Readiness contract failed.",
    durationMs: result.durationMs,
    details: {
      httpStatus:
        result.response?.status || null,
      ready: body?.ready ?? null,
      runtime:
        body?.checks?.runtime || null,
      marketProviders:
        body?.checks?.marketProviders || null,
      shariahDataMode:
        body?.checks?.shariahDataMode || null,
      deployedCommit: readinessCommit,
      requestIdCorrelated:
        requestIdMatches(result, requestId),
    },
  });
}

function getMissingWorkspaces(data) {
  const requirements = {
    overview: ["confluence", "agreement"],
    technical: [
      "indicators",
      "marketStructure",
      "trend",
    ],
    fundamentals: ["fundamentals"],
    risk: ["risk"],
    shariah: ["shariah"],
    aiThesis: [
      "thesisInvalidation",
      "explanation",
    ],
  };

  return Object.entries(requirements)
    .filter(([, fields]) =>
      fields.some(
        (field) => !isObject(data?.[field])
      )
    )
    .map(([workspace]) => workspace);
}

async function checkAnalysis(
  config,
  fetchImpl
) {
  const requestId =
    createCheckRequestId("analysis");
  const result = await fetchResult(
    fetchImpl,
    `${config.apiUrl}/api/analyze/${encodeURIComponent(
      config.symbol
    )}`,
    {
      headers: {
        "X-Request-ID": requestId,
      },
      timeoutMs: config.requestTimeoutMs,
    }
  );
  const body = result.body;
  const missingWorkspaces =
    getMissingWorkspaces(body?.data);
  const success =
    !result.error &&
    result.response?.status === 200 &&
    body?.success === true &&
    body?.meta?.symbol === config.symbol &&
    body?.meta?.requestId === requestId &&
    requestIdMatches(result, requestId) &&
    isRecentTimestamp(body?.meta?.generatedAt) &&
    isObject(body?.dataQuality) &&
    missingWorkspaces.length === 0;

  return createCheck({
    id: "analysis_contract",
    success,
    message: success
      ? "Representative analysis returned all six workspace contracts."
      : result.error
        ? result.error.message
        : "Representative analysis contract failed.",
    durationMs: result.durationMs,
    details: {
      httpStatus:
        result.response?.status || null,
      symbol: body?.meta?.symbol || null,
      requestIdCorrelated:
        requestIdMatches(result, requestId),
      dataQualityStatus:
        body?.dataQuality?.status || null,
      missingWorkspaces,
    },
  });
}

async function checkMetrics(
  config,
  fetchImpl
) {
  const requestId =
    createCheckRequestId("metrics");
  const authenticated = Boolean(
    config.metricsToken
  );
  const headers = {
    "X-Request-ID": requestId,
  };

  if (authenticated) {
    headers.Authorization =
      `Bearer ${config.metricsToken}`;
  }

  const result = await fetchResult(
    fetchImpl,
    `${config.apiUrl}/ops/metrics`,
    {
      headers,
      timeoutMs: config.requestTimeoutMs,
    }
  );
  const body = result.body;
  const metricsShapeValid =
    isObject(body?.data?.process) &&
    isObject(body?.data?.http) &&
    Array.isArray(body?.data?.providers);
  const success = authenticated
    ? !result.error &&
      result.response?.status === 200 &&
      body?.success === true &&
      metricsShapeValid &&
      requestIdMatches(result, requestId)
    : !result.error &&
      result.response?.status === 404 &&
      body?.success === false &&
      requestIdMatches(result, requestId);

  return createCheck({
    id: "protected_metrics",
    success,
    message: authenticated
      ? success
        ? "Protected operational metrics are authenticated and readable."
        : result.error
          ? result.error.message
          : "Authenticated metrics contract failed."
      : success
        ? "Metrics remain fail-closed; authenticated monitoring is not configured."
        : result.error
          ? result.error.message
          : "Metrics route is exposed or its fail-closed contract changed.",
    durationMs: result.durationMs,
    details: {
      httpStatus:
        result.response?.status || null,
      mode: authenticated
        ? "authenticated"
        : "fail_closed",
      requestIdCorrelated:
        requestIdMatches(result, requestId),
      metricsShapeValid: authenticated
        ? metricsShapeValid
        : null,
    },
    limitation: authenticated
      ? null
      : "OBSERVABILITY_METRICS_TOKEN is not configured for this check, so latency, error-rate, timeout, rate-limit, and cache aggregates were not inspected.",
  });
}

async function runReleaseHealthCheck(
  config,
  {
    fetchImpl = global.fetch,
    sleepImpl = sleep,
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "A Fetch API implementation is required."
    );
  }

  const startedAt = Date.now();
  const deployment = await waitForDeployment(
    config,
    fetchImpl,
    sleepImpl
  );
  const checks = [deployment.check];

  if (deployment.check.success) {
    const followUpChecks = await Promise.all([
      checkFrontend(config, fetchImpl),
      checkReadiness(
        config,
        fetchImpl,
        deployment.deployedCommit
      ),
      checkAnalysis(config, fetchImpl),
      checkMetrics(config, fetchImpl),
    ]);

    checks.push(...followUpChecks);
  }

  const failures = checks
    .filter((check) => !check.success)
    .map((check) => ({
      check: check.id,
      message: check.message,
    }));
  const limitations = checks
    .filter((check) => check.limitation)
    .map((check) => ({
      check: check.id,
      message: check.limitation,
    }));
  const success = failures.length === 0;

  return {
    success,
    status: success
      ? limitations.length > 0
        ? "PASS_WITH_LIMITATIONS"
        : "PASS"
      : "FAIL",
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    target: {
      frontendUrl: config.frontendUrl,
      apiUrl: config.apiUrl,
      symbol: config.symbol,
      expectedCommit:
        config.expectedCommit || null,
      deployedCommit:
        deployment.deployedCommit || null,
    },
    checks,
    failures,
    limitations,
  };
}

function writeJsonReport(report, reportPath) {
  if (!reportPath) {
    return;
  }

  const resolvedPath = path.resolve(reportPath);

  fs.mkdirSync(path.dirname(resolvedPath), {
    recursive: true,
  });
  fs.writeFileSync(
    resolvedPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
}

function appendGitHubSummary(
  report,
  summaryPath
) {
  if (!summaryPath) {
    return;
  }

  const lines = [
    "## AzaLens release health",
    "",
    `**Status:** ${report.status}`,
    `**Deployed commit:** ${report.target.deployedCommit || "Unavailable"}`,
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
    ...report.checks.map(
      (check) =>
        `| ${check.id} | ${check.success ? "PASS" : "FAIL"} | ${check.message} |`
    ),
  ];

  if (report.limitations.length > 0) {
    lines.push(
      "",
      "### Limitations",
      "",
      ...report.limitations.map(
        ({ message }) => `- ${message}`
      )
    );
  }

  fs.appendFileSync(
    summaryPath,
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

async function main() {
  const config = createConfig();
  const report = await runReleaseHealthCheck(
    config
  );

  writeJsonReport(report, config.reportPath);
  appendGitHubSummary(
    report,
    config.githubStepSummary
  );
  console.log(JSON.stringify(report, null, 2));

  if (!report.success) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          status: "FAIL",
          error: {
            name: error?.name || "Error",
            message:
              error?.message ||
              "Release health check failed.",
          },
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
}

module.exports = {
  checkAnalysis,
  checkFrontend,
  checkLiveness,
  checkMetrics,
  checkReadiness,
  commitsMatch,
  createConfig,
  getMissingWorkspaces,
  isRecentTimestamp,
  runReleaseHealthCheck,
};
