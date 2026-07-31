"use strict";

const {
  getReleaseVersion,
} = require("../config/releaseVersion");

const crypto = require("node:crypto");
const {
  AsyncLocalStorage,
} = require("node:async_hooks");

const MAX_RECENT_DURATION_SAMPLES = 500;
const MAX_TRACKED_ROUTES = 100;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const BLOCKED_PROVIDER_CODES = new Set([
  "HALAL_TERMINAL_LIVE_OPT_IN_REQUIRED",
  "SHARIAH_CACHE_MISS",
  "SHARIAH_DATA_MODE_INVALID",
  "SHARIAH_LIVE_API_DISABLED",
  "SHARIAH_MONTHLY_TOKEN_BUDGET_EXCEEDED",
]);

function createAggregate() {
  return {
    count: 0,
    successes: 0,
    failures: 0,
    degraded: 0,
    blocked: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    recentDurationsMs: [],
  };
}

function createState() {
  return {
    startedAt: new Date().toISOString(),
    http: {
      inFlight: 0,
      aggregate: createAggregate(),
      statusCodes: new Map(),
      routes: new Map(),
    },
    providers: new Map(),
  };
}

let state = createState();
const requestContext = new AsyncLocalStorage();

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function round(value, decimals = 2) {
  const number = toFiniteNumber(value);
  const factor = 10 ** decimals;

  return Math.round(number * factor) / factor;
}

function createRequestId(candidate = null) {
  const normalizedCandidate =
    typeof candidate === "string"
      ? candidate.trim()
      : "";

  if (REQUEST_ID_PATTERN.test(normalizedCandidate)) {
    return normalizedCandidate;
  }

  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function appendDuration(aggregate, durationMs) {
  const safeDurationMs = Math.max(
    0,
    toFiniteNumber(durationMs)
  );

  aggregate.count += 1;
  aggregate.totalDurationMs += safeDurationMs;
  aggregate.maxDurationMs = Math.max(
    aggregate.maxDurationMs,
    safeDurationMs
  );
  aggregate.recentDurationsMs.push(safeDurationMs);

  if (
    aggregate.recentDurationsMs.length >
    MAX_RECENT_DURATION_SAMPLES
  ) {
    aggregate.recentDurationsMs.shift();
  }
}

function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort(
    (first, second) => first - second
  );
  const index = Math.min(
    sorted.length - 1,
    Math.max(
      0,
      Math.ceil(sorted.length * percentileValue) - 1
    )
  );

  return sorted[index];
}

function summarizeAggregate(aggregate) {
  const count = aggregate.count;

  return {
    count,
    successes: aggregate.successes,
    failures: aggregate.failures,
    degraded: aggregate.degraded,
    blocked: aggregate.blocked,
    failureRatePercent:
      count === 0
        ? 0
        : round((aggregate.failures / count) * 100),
    latencyMs: {
      average:
        count === 0
          ? 0
          : round(aggregate.totalDurationMs / count),
      p95: round(
        percentile(
          aggregate.recentDurationsMs,
          0.95
        )
      ),
      maximum: round(aggregate.maxDurationMs),
      sampleSize:
        aggregate.recentDurationsMs.length,
    },
  };
}

function writeLog(level, event, fields = {}) {
  const contextRequestId =
    requestContext.getStore()?.requestId ||
    null;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "azalens-backend",
    event,
    ...(contextRequestId
      ? {
          requestId: contextRequestId,
        }
      : {}),
    ...fields,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  return entry;
}

function resolveRouteKey(req) {
  const routePath = req?.route?.path;

  if (typeof routePath === "string") {
    const routeKey = `${req.baseUrl || ""}${routePath}`;

    return routeKey || "/";
  }

  return "UNMATCHED";
}

function getOrCreateRouteAggregate(routeKey) {
  if (state.http.routes.has(routeKey)) {
    return state.http.routes.get(routeKey);
  }

  const safeRouteKey =
    state.http.routes.size < MAX_TRACKED_ROUTES
      ? routeKey
      : "OTHER";

  if (!state.http.routes.has(safeRouteKey)) {
    state.http.routes.set(
      safeRouteKey,
      createAggregate()
    );
  }

  return state.http.routes.get(safeRouteKey);
}

function recordHttpRequest({
  route,
  statusCode,
  durationMs,
}) {
  const failed = statusCode >= 500;

  appendDuration(
    state.http.aggregate,
    durationMs
  );
  appendDuration(
    getOrCreateRouteAggregate(route),
    durationMs
  );

  if (failed) {
    state.http.aggregate.failures += 1;
    getOrCreateRouteAggregate(route).failures += 1;
  } else if (statusCode < 400) {
    state.http.aggregate.successes += 1;
    getOrCreateRouteAggregate(route).successes += 1;
  }

  state.http.statusCodes.set(
    statusCode,
    (state.http.statusCodes.get(statusCode) || 0) + 1
  );
}

function requestObservability(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const incomingRequestId =
    typeof req.get === "function"
      ? req.get("x-request-id")
      : req.headers?.["x-request-id"];
  const requestId = createRequestId(
    incomingRequestId
  );

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  state.http.inFlight += 1;

  let finalized = false;

  const finalize = (closedEarly = false) => {
    if (finalized) {
      return;
    }

    finalized = true;
    state.http.inFlight = Math.max(
      0,
      state.http.inFlight - 1
    );

    const durationMs =
      Number(process.hrtime.bigint() - startedAt) /
      1_000_000;
    const statusCode = closedEarly
      ? 499
      : res.statusCode;
    const route = resolveRouteKey(req);

    recordHttpRequest({
      route,
      statusCode,
      durationMs,
    });

    writeLog(
      statusCode >= 500
        ? "error"
        : statusCode >= 400
          ? "warn"
          : "info",
      "http_request",
      {
        requestId,
        method: req.method,
        route,
        statusCode,
        durationMs: round(durationMs),
        outcome: closedEarly
          ? "client_closed"
          : "completed",
      }
    );
  };

  res.once("finish", () => finalize(false));
  res.once("close", () => finalize(true));

  requestContext.run(
    {
      requestId,
    },
    next
  );
}

function normalizeProviderCode(result) {
  const resultError = result?.error;

  return String(
    result?.code ||
      (typeof resultError === "object"
        ? resultError?.code
        : "") ||
      ""
  )
    .trim()
    .toUpperCase() || null;
}

function normalizeCacheStatus(result) {
  const cache = result?.cache;

  if (typeof cache === "string") {
    return cache.trim().toUpperCase();
  }

  if (cache && typeof cache === "object") {
    return String(
      cache.status ||
        (cache.hit === true ? "HIT" : "MISS")
    ).toUpperCase();
  }

  if (
    result?.metadata?.fromCache === true ||
    result?.metadata?.providerMetadata?.fromCache ===
      true
  ) {
    return "HIT";
  }

  return "UNKNOWN";
}

function getProviderKey(provider, operation) {
  return `${provider}:${operation}`;
}

function getOrCreateProviderAggregate(
  provider,
  operation
) {
  const key = getProviderKey(provider, operation);

  if (!state.providers.has(key)) {
    state.providers.set(key, {
      provider,
      operation,
      aggregate: createAggregate(),
      timeouts: 0,
      rateLimits: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastOutcome: null,
      lastErrorCode: null,
      lastObservedAt: null,
    });
  }

  return state.providers.get(key);
}

function recordProviderResult({
  provider,
  operation,
  result,
  durationMs,
}) {
  const normalizedProvider =
    String(provider || "Unknown").trim() ||
    "Unknown";
  const normalizedOperation =
    String(operation || "request").trim() ||
    "request";
  const code = normalizeProviderCode(result);
  const cacheStatus = normalizeCacheStatus(result);
  const blocked = BLOCKED_PROVIDER_CODES.has(code);
  const success = result?.success === true;
  const limitations =
    Array.isArray(result?.limitations)
      ? result.limitations
      : [];
  const degraded =
    success && limitations.length > 0;
  let outcome = "failure";

  if (degraded) {
    outcome = "degraded";
  } else if (success) {
    outcome = "success";
  } else if (blocked) {
    outcome = "blocked";
  }

  const errorMessage =
    typeof result?.error === "string"
      ? result.error
      : result?.error?.message ||
        limitations.join(" ");
  const timedOut =
    Boolean(code?.includes("TIMEOUT")) ||
    /timed out/i.test(String(errorMessage || ""));
  const rateLimited =
    result?.httpStatus === 429 ||
    result?.error?.httpStatus === 429 ||
    Boolean(
      code?.includes("RATE_LIMIT") ||
        code?.includes("QUOTA")
    ) ||
    /rate limit|quota/i.test(
      String(errorMessage || "")
    );
  const aggregate = getOrCreateProviderAggregate(
    normalizedProvider,
    normalizedOperation
  );

  appendDuration(
    aggregate.aggregate,
    durationMs
  );

  if (outcome === "success") {
    aggregate.aggregate.successes += 1;
  } else if (outcome === "failure") {
    aggregate.aggregate.failures += 1;
  } else if (outcome === "degraded") {
    aggregate.aggregate.degraded += 1;
  } else if (outcome === "blocked") {
    aggregate.aggregate.blocked += 1;
  }

  if (timedOut) {
    aggregate.timeouts += 1;
  }

  if (rateLimited) {
    aggregate.rateLimits += 1;
  }

  if (
    cacheStatus === "HIT" ||
    cacheStatus === "COALESCED"
  ) {
    aggregate.cacheHits += 1;
  } else if (cacheStatus === "MISS") {
    aggregate.cacheMisses += 1;
  }

  aggregate.lastOutcome = outcome;
  aggregate.lastErrorCode =
    outcome === "success" ? null : code;
  aggregate.lastObservedAt =
    new Date().toISOString();

  writeLog(
    outcome === "failure" ||
      outcome === "degraded"
      ? "warn"
      : "info",
    "provider_operation",
    {
      provider: normalizedProvider,
      operation: normalizedOperation,
      outcome,
      durationMs: round(durationMs),
      cacheStatus,
      code:
        outcome === "success" ? null : code,
      timedOut,
      rateLimited,
      dataMode:
        result?.metadata?.dataMode ||
        result?.metadata?.providerMetadata
          ?.dataMode ||
        null,
    }
  );

  return outcome;
}

function getDeploymentMetadata(env = process.env) {
  return {
    version: getReleaseVersion(env),
    commit:
      env.RENDER_GIT_COMMIT ||
      env.VERCEL_GIT_COMMIT_SHA ||
      env.GIT_COMMIT_SHA ||
      null,
    environment:
      env.NODE_ENV || "development",
  };
}

function buildLivenessSnapshot(env = process.env) {
  return {
    status: "healthy",
    service: "azalens-backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: round(process.uptime(), 3),
    deployment: getDeploymentMetadata(env),
  };
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function buildReadinessSnapshot({
  env = process.env,
  strict = null,
} = {}) {
  const strictReadiness =
    typeof strict === "boolean"
      ? strict
      : env.NODE_ENV === "production" ||
        parseBoolean(
          env.OBSERVABILITY_STRICT_READINESS
        );
  const marketProvidersConfigured = Boolean(
    String(env.FINNHUB_API_KEY || "").trim() &&
      String(env.TWELVE_DATA_API_KEY || "").trim()
  );
  const ready =
    !strictReadiness ||
    marketProvidersConfigured;

  return {
    status: ready ? "ready" : "not_ready",
    ready,
    timestamp: new Date().toISOString(),
    strict: strictReadiness,
    checks: {
      runtime: "pass",
      marketProviders:
        marketProvidersConfigured
          ? "configured"
          : "incomplete",
      shariahDataMode:
        String(
          env.SHARIAH_DATA_MODE || "offline"
        )
          .trim()
          .toLowerCase() || "offline",
    },
    deployment: getDeploymentMetadata(env),
  };
}

function getMetricsSnapshot() {
  const aggregate =
    summarizeAggregate(state.http.aggregate);

  return {
    generatedAt: new Date().toISOString(),
    process: {
      startedAt: state.startedAt,
      uptimeSeconds: round(process.uptime(), 3),
      memoryRssMb: round(
        process.memoryUsage().rss / 1024 / 1024
      ),
    },
    http: {
      inFlight: state.http.inFlight,
      ...aggregate,
      statusCodes: Object.fromEntries(
        [...state.http.statusCodes.entries()].sort(
          ([first], [second]) =>
            Number(first) - Number(second)
        )
      ),
      routes: [...state.http.routes.entries()]
        .map(([route, routeAggregate]) => ({
          route,
          ...summarizeAggregate(routeAggregate),
        }))
        .sort((first, second) =>
          first.route.localeCompare(second.route)
        ),
    },
    providers: [...state.providers.values()]
      .map((providerState) => ({
        provider: providerState.provider,
        operation: providerState.operation,
        ...summarizeAggregate(
          providerState.aggregate
        ),
        timeouts: providerState.timeouts,
        rateLimits: providerState.rateLimits,
        cacheHits: providerState.cacheHits,
        cacheMisses: providerState.cacheMisses,
        lastOutcome: providerState.lastOutcome,
        lastErrorCode:
          providerState.lastErrorCode,
        lastObservedAt:
          providerState.lastObservedAt,
      }))
      .sort((first, second) =>
        getProviderKey(
          first.provider,
          first.operation
        ).localeCompare(
          getProviderKey(
            second.provider,
            second.operation
          )
        )
      ),
  };
}

function getRequestHeader(req, name) {
  if (typeof req?.get === "function") {
    return req.get(name);
  }

  return req?.headers?.[name.toLowerCase()];
}

function safeTokenEquals(first, second) {
  const firstBuffer = Buffer.from(
    String(first || "")
  );
  const secondBuffer = Buffer.from(
    String(second || "")
  );

  return (
    firstBuffer.length === secondBuffer.length &&
    firstBuffer.length > 0 &&
    crypto.timingSafeEqual(
      firstBuffer,
      secondBuffer
    )
  );
}

function isMetricsAuthorized(
  req,
  env = process.env
) {
  if (env.NODE_ENV !== "production") {
    return true;
  }

  const configuredToken = String(
    env.OBSERVABILITY_METRICS_TOKEN || ""
  ).trim();

  if (!configuredToken) {
    return false;
  }

  const authorization = String(
    getRequestHeader(req, "authorization") || ""
  );
  const bearerToken = authorization
    .replace(/^Bearer\s+/i, "")
    .trim();
  const headerToken = String(
    getRequestHeader(
      req,
      "x-observability-token"
    ) || ""
  ).trim();

  return (
    safeTokenEquals(
      bearerToken,
      configuredToken
    ) ||
    safeTokenEquals(
      headerToken,
      configuredToken
    )
  );
}

function resetObservabilityForTests() {
  state = createState();
}

function getCurrentRequestId() {
  return (
    requestContext.getStore()?.requestId ||
    null
  );
}

module.exports = {
  buildLivenessSnapshot,
  buildReadinessSnapshot,
  createRequestId,
  getCurrentRequestId,
  getMetricsSnapshot,
  isMetricsAuthorized,
  recordProviderResult,
  requestObservability,
  resetObservabilityForTests,
  writeLog,
};
