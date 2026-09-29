"use strict";

const express = require("express");
const service = require("../services/personalRiskLifecycleService");
const { writeLog } = require("../utils/observability");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const OPERATIONS = new Set(["PARTIAL_EXIT", "FINAL_EXIT", "TIGHTEN_STOP"]);

class RequestError extends Error {}
const exact = (value, fields) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const validDecimal = (value, allowZero = false) => typeof value === "string" && DECIMAL.test(value) &&
  (allowZero || !/^0(?:\.0+)?$/.test(value));

function idempotencyKey(req) {
  const raw = [];
  for (let i = 0; i < (req.rawHeaders || []).length; i += 2) {
    if (String(req.rawHeaders[i]).toLowerCase() === "idempotency-key") raw.push(String(req.rawHeaders[i + 1]));
  }
  const suspicious = Object.keys(req.headers || {}).some((name) => name.toLowerCase() !== "idempotency-key" &&
    name.toLowerCase().replace(/[^a-z]/g, "").includes("idempotency"));
  if (suspicious || raw.length !== 1 || raw[0].includes(",") || !UUID.test(raw[0])) throw new RequestError();
  return raw[0];
}

function input(req, operation) {
  if (Object.keys(req.query || {}).length) throw new RequestError();
  const positionId = req.body?.positionId;
  if (!UUID.test(positionId || "")) throw new RequestError();
  if (operation === "TIGHTEN_STOP") {
    if (!exact(req.body, ["positionId", "newStop", "evidenceClass"]) ||
        !new Set(["OWNER_DECLARED", "BROKER_CONFIRMED"]).has(req.body.evidenceClass) ||
        !validDecimal(req.body.newStop)) throw new RequestError();
    return { positionId, values: { newStop: req.body.newStop, evidenceClass: req.body.evidenceClass } };
  }
  const fields = ["positionId", "brokerConfirmed", "brokerEffectiveAt", "price", "quantity", "fees", "taxes", "exitReason"];
  if (!exact(req.body, fields) || req.body.brokerConfirmed !== true ||
      typeof req.body.brokerEffectiveAt !== "string" || !Number.isFinite(Date.parse(req.body.brokerEffectiveAt)) ||
      !validDecimal(req.body.price) || !validDecimal(req.body.quantity) || !validDecimal(req.body.fees, true) ||
      !validDecimal(req.body.taxes, true) || !(req.body.exitReason === null ||
        (typeof req.body.exitReason === "string" && req.body.exitReason.length >= 1 && req.body.exitReason.length <= 500))) {
    throw new RequestError();
  }
  return { positionId, values: { brokerEffectiveAt: req.body.brokerEffectiveAt, price: req.body.price,
    quantity: req.body.quantity, fees: req.body.fees, taxes: req.body.taxes, exitReason: req.body.exitReason } };
}

function createPersonalRiskLifecycleRouter({ lifecycleService = service, logger = writeLog } = {}) {
  const router = express.Router();
  const handle = (operation) => async (req, res) => {
    try {
      const parsed = input(req, operation);
      const data = await lifecycleService.record({ db: req.db, userId: req.user?.id, operation,
        positionId: parsed.positionId, idempotencyKey: idempotencyKey(req), values: parsed.values });
      // HTTP contract: fresh durable recording is 201; exact replay is 200.
      return res.status(data.replayed ? 200 : 201).json({ success: true, data });
    } catch (error) { return sendError(req, res, error, operation, logger); }
  };
  router.post("/lifecycle/partial-exits", handle("PARTIAL_EXIT"));
  router.post("/lifecycle/final-exits", handle("FINAL_EXIT"));
  router.post("/lifecycle/protective-stop-tightenings", handle("TIGHTEN_STOP"));
  router.get("/lifecycle/recovery", async (req, res) => {
    const operation = req.query?.operation;
    try {
      if (!exact(req.query, ["operation", "positionId"]) || !OPERATIONS.has(operation) || !UUID.test(req.query.positionId)) throw new RequestError();
      const data = await lifecycleService.recover({ db: req.db, userId: req.user?.id, operation,
        positionId: req.query.positionId, idempotencyKey: idempotencyKey(req) });
      return res.json({ success: true, data });
    } catch (error) { return sendError(req, res, error, operation, logger); }
  });
  return router;
}

function sendError(req, res, error, operation, logger) {
  const status = error instanceof RequestError ? 400 : Number.isInteger(error?.status) ? error.status : 503;
  const code = error instanceof RequestError ? "LIFECYCLE_INPUT_INVALID" : error?.code || "LIFECYCLE_UNAVAILABLE";
  const internalCode = error instanceof RequestError ? "LIFECYCLE_REQUEST_INVALID" :
    error?.internalCode || "LIFECYCLE_CONTEXT_UNAVAILABLE";
  logger(status >= 500 ? "error" : "warn", "personal_risk_lifecycle_failure", {
    operation: OPERATIONS.has(operation) ? operation : "UNKNOWN", route: req.route?.path || "UNMATCHED",
    method: req.method, failurePhase: error?.phase || "request", category: internalCode,
    ...(error?.mutationId ? { mutationId: error.mutationId } : {}),
  });
  return res.status(status).json({ success: false, code,
    ...(error?.recoveryRequired ? { recoveryRequired: true, commitState: error.commitState } : {}) });
}

module.exports = { createPersonalRiskLifecycleRouter };
