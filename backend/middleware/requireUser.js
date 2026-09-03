"use strict";

const { createSupabaseAccessTokenVerifier } = require("../auth/verifySupabaseAccessToken");
const { createUserSupabaseClient } = require("../services/createUserSupabaseClient");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDENTITY_SCAN_DEPTH = 12;
const MAX_IDENTITY_SCAN_NODES = 2_000;

function authorizationValues(req) {
  const values = [];
  const raw = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  for (let index = 0; index < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === "authorization") values.push(String(raw[index + 1] || ""));
  }
  if (values.length === 0 && typeof req.headers?.authorization === "string") {
    values.push(req.headers.authorization);
  }
  return values;
}

function extractBearerToken(req) {
  const values = authorizationValues(req);
  if (values.length === 0) return null;
  if (values.length !== 1 || values[0].includes(",")) return false;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(values[0]);
  return match ? match[1] : false;
}

function inspectCallerSuppliedUserId(req, {
  maxDepth = MAX_IDENTITY_SCAN_DEPTH,
  maxNodes = MAX_IDENTITY_SCAN_NODES,
} = {}) {
  const forbiddenHeaders = ["x-user-id", "x-owner-id", "x-supabase-user-id"];
  if (forbiddenHeaders.some((name) => req.headers?.[name] !== undefined)) {
    return { supplied: true, exhausted: false };
  }

  const seen = new Set();
  const stack = [req.params, req.query, req.body].map((value) => ({ value, depth: 0 }));
  let nodes = 0;

  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    nodes += 1;
    if (nodes > maxNodes || depth > maxDepth) return { supplied: false, exhausted: true };

    const keys = Object.keys(value);
    if (keys.includes("user_id") || keys.includes("userId")) {
      return { supplied: true, exhausted: false };
    }
    if (nodes + stack.length + keys.length > maxNodes) {
      return { supplied: false, exhausted: true };
    }
    for (const key of keys) stack.push({ value: value[key], depth: depth + 1 });
  }

  return { supplied: false, exhausted: false };
}

function hasCallerSuppliedUserId(req, limits) {
  const result = inspectCallerSuppliedUserId(req, limits);
  return result.supplied || result.exhausted;
}

function jsonError(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

function createRequireUser({
  env = process.env,
  verifyAccessToken = createSupabaseAccessTokenVerifier({ env }),
  createUserClient = (token) => createUserSupabaseClient(token, env),
} = {}) {
  const ownerUserId = String(env.PRIVATE_OWNER_USER_ID || "").trim().toLowerCase();

  return async function requireUser(req, res, next) {
    const token = extractBearerToken(req);
    if (token === null) return jsonError(res, 401, "AUTH_REQUIRED", "A verified owner session is required.");
    if (token === false) return jsonError(res, 401, "AUTH_TOKEN_INVALID", "The owner session is invalid.");
    const identityInput = inspectCallerSuppliedUserId(req);
    if (identityInput.exhausted) {
      return jsonError(res, 400, "IDENTITY_INPUT_LIMIT_EXCEEDED", "The request could not be safely inspected for identity fields.");
    }
    if (identityInput.supplied) {
      return jsonError(res, 400, "USER_ID_NOT_ACCEPTED", "User identity is derived from the verified session.");
    }

    try {
      const identity = await verifyAccessToken(token);
      if (!UUID_PATTERN.test(ownerUserId) || identity.userId.toLowerCase() !== ownerUserId) {
        return jsonError(res, 403, "OWNER_IDENTITY_REQUIRED", "A verified owner session is required.");
      }
      const db = createUserClient(token);
      req.user = Object.freeze({ id: identity.userId });
      req.db = db;
      return next();
    } catch (error) {
      const code = ["AUTH_TOKEN_EXPIRED", "AUTH_TOKEN_NOT_YET_VALID", "AUTH_VERIFIER_UNAVAILABLE", "AUTH_SIGNING_MODE_UNSUPPORTED"]
        .includes(error?.code) ? error.code : "AUTH_TOKEN_INVALID";
      return jsonError(res, 401, code, "The owner session could not be verified.");
    }
  };
}

module.exports = {
  authorizationValues,
  createRequireUser,
  extractBearerToken,
  hasCallerSuppliedUserId,
  inspectCallerSuppliedUserId,
  MAX_IDENTITY_SCAN_DEPTH,
  MAX_IDENTITY_SCAN_NODES,
};
