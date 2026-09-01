"use strict";

const RAW_KEYS = new Set([
  "bars", "lastCandle", "latestHistoricalClose", "todayVolume",
  "averageVolume30", "open", "high", "low", "close", "volume",
  "asOf", "observedValue",
]);
const COLUMN_KEYS = new Set(["t", "o", "h", "l", "c", "v"]);

function privatePersonalMode(env = process.env) {
  return ["1", "true", "yes", "on"].includes(
    String(env.PRIVATE_PERSONAL_PROVIDER_MODE || "").trim().toLowerCase(),
  );
}

function sanitizeNode(value, key = "", parentKey = "") {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeNode(entry, "", key));

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (RAW_KEYS.has(childKey)) continue;
    if (childKey === "price" && !(key === "data" && parentKey === "market")) continue;
    if (["date", "normalizedDate", "index"].includes(childKey) && key !== "provenance") continue;
    if (key === "data" && COLUMN_KEYS.has(childKey) && Array.isArray(childValue)) continue;
    if (key === "metrics" && ["sma20", "prior20High", "prior20Low"].includes(childKey)) continue;
    if (key === "priceContext" && ["historicalCloseAvailable", "pricesMatch"].includes(childKey)) continue;
    if (key === "result" && childKey === "asOf") continue;
    output[childKey] = sanitizeNode(childValue, childKey, key);
  }
  return output;
}

function sanitizePrivatePersonalPayload(payload, env = process.env) {
  return privatePersonalMode(env) ? sanitizeNode(payload) : payload;
}

function installPrivatePersonalResponseBoundary(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizePrivatePersonalPayload(payload));
  next();
}

function safeProviderErrorSummary(error) {
  const body = error?.response?.data;
  const clean = (value, fallback = null) => {
    if (typeof value !== "string" && typeof value !== "number") return fallback;
    let sanitized = String(value).replace(/[\r\n\t\x00-\x1f\x7f]/g, " ");
    for (const secret of [process.env.TWELVE_DATA_API_KEY, process.env.FINNHUB_API_KEY].filter(Boolean)) {
      sanitized = sanitized.split(String(secret)).join("[redacted]");
    }
    return sanitized
      .replace(/\b(?:apikey|authorization|bearer)\s*[:=]?\s*\S+/gi, "[redacted]")
      .replace(/-?\d{4,}(?:\.\d+)?/g, "[number]")
      .slice(0, 240);
  };
  return {
    status: Number.isInteger(error?.response?.status) ? error.response.status : null,
    code: clean(body?.code ?? error?.code),
    message: clean(body?.message ?? body?.error ?? error?.message, "Provider request failed."),
  };
}

module.exports = {
  installPrivatePersonalResponseBoundary,
  privatePersonalMode,
  safeProviderErrorSummary,
  sanitizePrivatePersonalPayload,
};
