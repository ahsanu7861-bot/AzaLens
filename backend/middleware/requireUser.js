"use strict";

const { createSupabaseAccessTokenVerifier } = require("../auth/verifySupabaseAccessToken");
const { createUserSupabaseClient } = require("../services/createUserSupabaseClient");

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

function hasCallerSuppliedUserId(req) {
  const forbiddenHeaders = ["x-user-id", "x-owner-id", "x-supabase-user-id"];
  if (forbiddenHeaders.some((name) => req.headers?.[name] !== undefined)) return true;
  const containsIdentity = (value, seen = new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    if (["user_id", "userId"].some((key) => Object.prototype.hasOwnProperty.call(value, key))) return true;
    return Object.values(value).some((child) => containsIdentity(child, seen));
  };
  return [req.params, req.query, req.body].some((source) => containsIdentity(source));
}

function jsonError(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

function createRequireUser({
  env = process.env,
  verifyAccessToken = createSupabaseAccessTokenVerifier({ env }),
  createUserClient = (token) => createUserSupabaseClient(token, env),
} = {}) {
  return async function requireUser(req, res, next) {
    const token = extractBearerToken(req);
    if (token === null) return jsonError(res, 401, "AUTH_REQUIRED", "A verified owner session is required.");
    if (token === false) return jsonError(res, 401, "AUTH_TOKEN_INVALID", "The owner session is invalid.");
    if (hasCallerSuppliedUserId(req)) {
      return jsonError(res, 400, "USER_ID_NOT_ACCEPTED", "User identity is derived from the verified session.");
    }

    try {
      const identity = await verifyAccessToken(token);
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
};
