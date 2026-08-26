"use strict";

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");
const { TRIAL_MATRIX_VERSION, TRIAL_SYMBOL_MATRIX } = require("../config/twelveDataTrialMatrix");
const { ABORT_CRITERIA, CACHE_OBSERVATION_PLAN, DAY_SCHEDULE, ENDPOINT_WEIGHTS, EXIT_CRITERIA,
  PLAN_NAME, PLAN_VERSION, VENTURE_CREDITS_PER_MINUTE, WEIGHT_SOURCES } = require("../config/twelveDataTrialPlan");
const { responseFor } = require("../fixtures/twelve-data-trial/stubResponses");

const BASE_URL = "https://api.twelvedata.com";
const EVIDENCE_SCHEMA_VERSION = "b4a-evidence-v1";
const LIVE_ACK = "I_UNDERSTAND_THIS_SPENDS_TWELVE_DATA_CREDITS";
const DEFAULT_REQUEST_BUDGET = 30;
const DEFAULT_CREDIT_BUDGET = 30;
const EVIDENCE_ROOT = path.resolve(__dirname, "../storage/twelve-data-trial");
const TRIAL_INTERVALS = Object.freeze(["15min", "1h", "1day"]);

const ENDPOINTS = ENDPOINT_WEIGHTS;

const BLOCKED_ENDPOINTS = Object.freeze([
  "ipo_calendar", "income_statement", "balance_sheet", "cash_flow", "statistics",
]);

function integer(value, fallback, label) {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(resolved) || resolved < 0) throw new Error(`${label} must be a non-negative integer.`);
  return resolved;
}

function parseArgs(argv) {
  const args = { live: false, endpoint: null, symbol: null, requestBudget: DEFAULT_REQUEST_BUDGET,
    creditBudget: DEFAULT_CREDIT_BUDGET, evidencePath: null, simulate429: false,
    interval: "1day", outputsize: 100 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--live") args.live = true;
    else if (value === "--simulate-429") args.simulate429 = true;
    else if (["--endpoint", "--symbol", "--request-budget", "--credit-budget", "--evidence", "--interval", "--outputsize"].includes(value)) {
      if (argv[index + 1] === undefined) throw new Error(`${value} requires a value.`);
      const next = argv[++index];
      if (value === "--endpoint") args.endpoint = next;
      if (value === "--symbol") args.symbol = next;
      if (value === "--request-budget") args.requestBudget = integer(next, null, "request budget");
      if (value === "--credit-budget") args.creditBudget = integer(next, null, "credit budget");
      if (value === "--evidence") args.evidencePath = next;
      if (value === "--interval") args.interval = next;
      if (value === "--outputsize") {
        args.outputsize = integer(next, null, "outputsize");
        if (args.outputsize < 1 || args.outputsize > 5000) throw new Error("outputsize must be between 1 and 5000.");
      }
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function requireAllowedEndpoint(endpoint) {
  const normalized = String(endpoint || "").trim().replace(/^\//, "");
  if (BLOCKED_ENDPOINTS.includes(normalized)) throw new Error(`Endpoint is explicitly blocked: ${normalized}`);
  if (!Object.hasOwn(ENDPOINTS, normalized)) throw new Error(`Endpoint is not allowlisted: ${normalized || "<empty>"}`);
  return normalized;
}

function redact(value, env = process.env) {
  const secrets = [env.TWELVE_DATA_API_KEY, env.B4_TWELVE_DATA_LIVE_ACK]
    .filter(Boolean).map(String);
  const visit = (item, key = "") => {
    if (/api.?key|authorization|token|secret|cookie/i.test(key)) return "[REDACTED]";
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, visit(v, k)]));
    if (typeof item === "string") return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), item);
    return item;
  };
  return visit(value);
}

function resolveEvidencePath(evidencePath) {
  const resolved = path.resolve(String(evidencePath || ""));
  if (resolved !== EVIDENCE_ROOT && !resolved.startsWith(`${EVIDENCE_ROOT}${path.sep}`)) {
    throw new Error(`Evidence path must stay inside ${EVIDENCE_ROOT}.`);
  }
  return resolved;
}

function shapeOf(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, itemKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]).sort() : [] };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).sort() };
  return { type: value === null ? "null" : typeof value };
}

function validateResponseContract(endpoint, data) {
  const object = data && typeof data === "object" && !Array.isArray(data);
  if (!object) return { valid: false, missing: ["object-envelope"] };
  const required = {
    quote: ["symbol", "close"],
    profile: ["symbol", "name"],
    stocks: ["data"],
    logo: ["url"],
    symbol_search: ["data"],
    time_series: ["meta", "values"],
  }[endpoint];
  const missing = required.filter((key) => !Object.hasOwn(data, key));
  if (["stocks", "symbol_search"].includes(endpoint) && !Array.isArray(data.data)) missing.push("data[array]");
  if (endpoint === "time_series" && !Array.isArray(data.values)) missing.push("values[array]");
  return { valid: missing.length === 0, missing };
}

function createBudget({ requestBudget, creditBudget }) {
  const state = { requestBudget: integer(requestBudget, DEFAULT_REQUEST_BUDGET, "request budget"),
    creditBudget: integer(creditBudget, DEFAULT_CREDIT_BUDGET, "credit budget"), requests: 0, estimatedCredits: 0 };
  return {
    reserve(endpoint) {
      const cost = ENDPOINTS[endpoint].credits;
      if (state.requests + 1 > state.requestBudget) throw new Error("Request budget exceeded before transport invocation.");
      if (state.estimatedCredits + cost > state.creditBudget) throw new Error("Credit budget exceeded before transport invocation.");
      state.requests += 1; state.estimatedCredits += cost;
    },
    snapshot: () => ({ ...state }),
  };
}

function assertLiveAuthority(options, env = process.env) {
  if (!options.live) return;
  if (env.B4_TWELVE_DATA_LIVE_ACK !== LIVE_ACK) throw new Error("Live mode refused: explicit B4 acknowledgement is absent.");
  if (!String(env.TWELVE_DATA_API_KEY || "").trim()) throw new Error("Live mode refused: Twelve Data API key is absent.");
  if (!options.evidencePath) throw new Error("Live mode refused: an evidence path is required.");
  resolveEvidencePath(options.evidencePath);
  if (options.endpoint && ENDPOINTS[options.endpoint]?.status !== "confirmed_public_docs") {
    throw new Error(`Live mode refused: ${options.endpoint} credit weight is not confirmed.`);
  }
}

function createTransport(options, env = process.env) {
  assertLiveAuthority(options, env);
  if (!options.live) return async ({ endpoint, symbol }) => ({ status: 200, data: responseFor(endpoint, symbol) });
  return async ({ endpoint, symbol, interval, outputsize }) => {
    const params = { symbol };
    if (endpoint === "time_series") Object.assign(params, { interval, outputsize, order: "asc", format: "JSON" });
    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      params, headers: { Authorization: `apikey ${env.TWELVE_DATA_API_KEY}` }, timeout: 15000,
      validateStatus: () => true,
    });
    return { status: response.status, data: response.data };
  };
}

async function runHarness(options, dependencies = {}) {
  assertLiveAuthority(options, dependencies.env || process.env);
  const endpoint = requireAllowedEndpoint(options.endpoint);
  const symbol = String(options.symbol || "").trim().toUpperCase();
  if (!symbol) throw new Error("A symbol is required.");
  if (endpoint === "time_series" && !TRIAL_INTERVALS.includes(options.interval)) {
    throw new Error(`Trial interval is not approved: ${options.interval}.`);
  }
  const budget = createBudget(options);
  const transport = dependencies.transport || createTransport(options, dependencies.env || process.env);
  budget.reserve(endpoint);
  const started = Date.now();
  let response;
  try {
    response = options.simulate429
      ? { status: 429, data: { status: "error", code: 429, message: "Synthetic rate limit" } }
      : await transport({ endpoint, symbol, interval: options.interval, outputsize: options.outputsize });
  } catch (error) {
    response = { status: error?.response?.status || null, data: error?.response?.data || null, transportError: error?.code || "TRANSPORT_ERROR" };
  }
  const providerError = response.data?.status === "error" || Boolean(response.data?.code);
  const evidence = redact({ schemaVersion: EVIDENCE_SCHEMA_VERSION, matrixVersion: TRIAL_MATRIX_VERSION,
    mode: options.live ? "live" : "stub", endpoint, symbol, observedAt: new Date().toISOString(),
    latencyMs: Date.now() - started, httpStatus: response.status, providerCode: response.data?.code || null,
    outcome: response.status === 429 || response.data?.code === 429 ? "rate_limited" :
      providerError ? "provider_error" : response.status >= 200 && response.status < 300 ? "success" : "error",
    responseShape: shapeOf(response.data), responseContract: validateResponseContract(endpoint, response.data),
    transportError: response.transportError || null, budget: budget.snapshot(),
    provenance: { provider: "TwelveData", endpoint }, requestParameters: endpoint === "time_series" ?
      { interval: options.interval, outputsize: options.outputsize, order: "asc", format: "JSON" } : {},
    creditWeight: ENDPOINTS[endpoint], rawPayloadStored: false }, dependencies.env || process.env);
  return evidence;
}

function writeEvidence(evidencePath, evidence) {
  const resolved = resolveEvidencePath(evidencePath);
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true, mode: 0o700 });
  const parent = path.dirname(resolved);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const realRoot = fs.realpathSync(EVIDENCE_ROOT);
  const realParent = fs.realpathSync(parent);
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("Evidence path resolves outside the private evidence directory.");
  }
  fs.writeFileSync(resolved, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return resolved;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.endpoint) {
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", liveTraffic: false, matrixVersion: TRIAL_MATRIX_VERSION,
      plan: { name: PLAN_NAME, version: PLAN_VERSION, ventureCreditsPerMinute: VENTURE_CREDITS_PER_MINUTE },
      symbols: TRIAL_SYMBOL_MATRIX, endpointWeights: ENDPOINTS, weightSources: WEIGHT_SOURCES,
      allowlistedEndpoints: Object.keys(ENDPOINTS), blockedEndpoints: BLOCKED_ENDPOINTS,
      cacheObservationPlan: CACHE_OBSERVATION_PLAN, daySchedule: DAY_SCHEDULE,
      abortCriteria: ABORT_CRITERIA, exitCriteria: EXIT_CRITERIA,
      defaultBudgets: { requests: DEFAULT_REQUEST_BUDGET, estimatedCredits: DEFAULT_CREDIT_BUDGET } }, null, 2)}\n`);
    return;
  }
  const evidence = await runHarness(options);
  if (options.evidencePath) writeEvidence(options.evidencePath, evidence);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { BLOCKED_ENDPOINTS, DEFAULT_CREDIT_BUDGET, DEFAULT_REQUEST_BUDGET, ENDPOINTS,
  EVIDENCE_ROOT, EVIDENCE_SCHEMA_VERSION, LIVE_ACK, assertLiveAuthority, createBudget, parseArgs, redact,
  requireAllowedEndpoint, resolveEvidencePath, runHarness, shapeOf, TRIAL_INTERVALS,
  validateResponseContract, writeEvidence };
