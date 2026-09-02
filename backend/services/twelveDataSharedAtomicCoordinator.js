"use strict";

const RPC_NAME = "reserve_twelve_data_credits";
const DEFAULT_TIMEOUT_MS = 3_000;

function coordinatorError(reason) {
  const error = new Error("Twelve Data credit coordination failed closed.");
  error.reason = reason;
  return error;
}

function createSharedAtomicCoordinator(options = {}) {
  const baseUrl = String(options.url || "").trim().replace(/\/$/, "");
  const secretKey = String(options.secretKey || "").trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const configuredTimeout = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 100 && configuredTimeout <= 10_000
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;

  async function reserve({ planId, credits }) {
    if (!baseUrl || !secretKey || typeof fetchImpl !== "function") {
      throw coordinatorError("coordination_disabled");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${RPC_NAME}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_plan_id: planId,
          p_credits: credits,
        }),
      });
    } catch {
      throw coordinatorError("coordinator_unavailable");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw coordinatorError("coordinator_unavailable");
    let payload;
    try { payload = await response.json(); } catch { throw coordinatorError("coordinator_unavailable"); }
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row.accepted !== "boolean" ||
        !Number.isInteger(row.minute_credits) || !Number.isInteger(row.day_credits)) {
      throw coordinatorError("coordinator_unavailable");
    }
    if (!row.accepted && !["minute_limit_exhausted", "daily_limit_exhausted"].includes(row.reason)) {
      throw coordinatorError("coordinator_unavailable");
    }
    return row;
  }
  return Object.freeze({ reserve });
}

module.exports = { DEFAULT_TIMEOUT_MS, RPC_NAME, createSharedAtomicCoordinator };
