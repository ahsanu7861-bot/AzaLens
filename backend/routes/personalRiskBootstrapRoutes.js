"use strict";

const express = require("express");
const service = require("../services/personalRiskBootstrapService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
const OPERATIONS = new Set(["POLICY_VERSION", "COST_SCHEDULE", "EQUITY_SNAPSHOT"]);

class RequestError extends Error {
  constructor(message = null) {
    super(message || "PERSONAL_RISK_INPUT_INVALID");
    this.publicMessage = message;
  }
}

function exactFields(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function containsKey(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  if (depth > 12) return true;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/idempotency/i.test(key)) return true;
    if (containsKey(child, seen, depth + 1)) return true;
  }
  return false;
}

function headerValues(req, name) {
  const values = [];
  const raw = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  for (let index = 0; index < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === name) values.push(String(raw[index + 1] || ""));
  }
  if (!values.length && typeof req.headers?.[name] === "string") values.push(req.headers[name]);
  return values;
}

function idempotencyKey(req, required) {
  if (containsKey(req.body) || containsKey(req.query) ||
      Object.keys(req.headers || {}).some((name) => name.toLowerCase() !== "idempotency-key" &&
        name.toLowerCase().replace(/[^a-z]/g, "").includes("idempotency"))) {
    throw new RequestError();
  }
  const values = headerValues(req, "idempotency-key");
  if (!required && !values.length) return null;
  if (values.length !== 1 || values[0].includes(",") || !UUID.test(values[0])) throw new RequestError();
  return values[0];
}

function normalizeTimestamp(value, now = Date.now()) {
  if (typeof value !== "string") throw new RequestError();
  const match = TIMESTAMP.exec(value);
  if (!match) throw new RequestError();
  const [, year, month, day, hour, minute, second, offset] = match;
  if (+hour > 23 || +minute > 59 || +second > 59) throw new RequestError();
  if (offset !== "Z") {
    const [oh, om] = offset.slice(1).split(":").map(Number);
    if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) throw new RequestError();
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new RequestError();
  if (parsed.getTime() > now) throw new RequestError("observedAt must not be later than current server time.");
  const local = new Date(parsed.getTime() + (offset === "Z" ? 0 : (offset[0] === "+" ? 1 : -1) *
    ((+offset.slice(1, 3) * 60 + +offset.slice(4, 6)) * 60_000)));
  if (local.getUTCFullYear() !== +year || local.getUTCMonth() + 1 !== +month || local.getUTCDate() !== +day ||
      local.getUTCHours() !== +hour || local.getUTCMinutes() !== +minute || local.getUTCSeconds() !== +second) throw new RequestError();
  return parsed.toISOString().replace(".000Z", "Z");
}

function normalizeEquity(value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new RequestError();
  const [whole, fraction = ""] = value.split(".");
  if (BigInt(whole + fraction.padEnd(8, "0")) <= 0n || BigInt(whole) >= 10n ** 16n) throw new RequestError();
  return value;
}

function sendError(res, error) {
  const contracts = {
    IDEMPOTENCY_CONFLICT: [409, "IDEMPOTENCY_CONFLICT"],
    NUMERIC_PRECISION_INVALID: [400, "NUMERIC_PRECISION_INVALID"],
    PERSONAL_RISK_INPUT_INVALID: [400, "PERSONAL_RISK_INPUT_INVALID"],
    PERSONAL_RISK_FORBIDDEN: [403, "PERSONAL_RISK_FORBIDDEN"],
    PERSONAL_RISK_UNAVAILABLE: [503, "PERSONAL_RISK_UNAVAILABLE"],
    PERSONAL_RISK_RESPONSE_INVALID: [502, "PERSONAL_RISK_RESPONSE_INVALID"],
  };
  const [status, code] = error instanceof RequestError ? [400, "PERSONAL_RISK_INPUT_INVALID"] :
    (contracts[error?.code] || [503, "PERSONAL_RISK_UNAVAILABLE"]);
  const body = { success: false, code };
  if (error instanceof RequestError && error.publicMessage) body.message = error.publicMessage;
  return res.status(status).json(body);
}

function createPersonalRiskBootstrapRouter({ bootstrapService = service, now = () => Date.now() } = {}) {
  const router = express.Router();
  const context = (req) => ({ db: req.db, userId: req.user?.id });

  router.get("/bootstrap-status", async (req, res) => {
    try {
      if (!exactFields(req.query, Object.prototype.hasOwnProperty.call(req.query, "operation") ? ["operation", ...(req.query.observedAt === undefined ? [] : ["observedAt"])] : (req.query.observedAt === undefined ? [] : ["observedAt"]))) throw new RequestError();
      const operation = req.query.operation || null;
      if (operation && !OPERATIONS.has(operation)) throw new RequestError();
      const key = idempotencyKey(req, Boolean(operation));
      if (!operation && key) throw new RequestError();
      const observedAt = normalizeTimestamp(req.query.observedAt || new Date(now()).toISOString().replace(/\.\d{3}Z$/, "Z"), now());
      const data = await bootstrapService.getStatus({ ...context(req), observedAt, operation, idempotencyKey: key });
      return res.json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/policy-versions", async (req, res) => {
    try {
      if (!exactFields(req.body, ["confirmed"]) || req.body.confirmed !== true || Object.keys(req.query).length) throw new RequestError();
      const data = await bootstrapService.createPolicy({ ...context(req), idempotencyKey: idempotencyKey(req, true) });
      return res.status(data.replayed ? 200 : 201).json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/cost-schedules", async (req, res) => {
    try {
      if (!exactFields(req.body, ["confirmed"]) || req.body.confirmed !== true || Object.keys(req.query).length) throw new RequestError();
      const data = await bootstrapService.createSchedule({ ...context(req), idempotencyKey: idempotencyKey(req, true) });
      return res.status(data.replayed ? 200 : 201).json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.post("/equity-snapshots", async (req, res) => {
    try {
      const fields = ["accountEquity", "observedAt", "accountValueConfirmed", "basisTighteningConfirmed"];
      if (!exactFields(req.body, fields) || Object.keys(req.query).length || req.body.accountValueConfirmed !== true ||
          typeof req.body.basisTighteningConfirmed !== "boolean") throw new RequestError();
      const data = await bootstrapService.createEquity({ ...context(req), idempotencyKey: idempotencyKey(req, true),
        accountEquity: normalizeEquity(req.body.accountEquity), observedAt: normalizeTimestamp(req.body.observedAt, now()),
        basisTighteningConfirmed: req.body.basisTighteningConfirmed });
      return res.status(data.replayed ? 200 : 201).json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  return router;
}

module.exports = { createPersonalRiskBootstrapRouter, normalizeEquity, normalizeTimestamp };
