"use strict";

const crypto = require("node:crypto");

const { parseFlag } = require("../config/environment");

const COOKIE_NAME = "azalens_owner_access";
const OWNER_SUBJECT = "owner";
const MAX_AGE_SECONDS = 12 * 60 * 60;

/*
  One canonical boolean parser, shared with the startup invariant in
  scripts/validateEnvironment.js.

  This used to be its own list-membership test, which returned false
  for anything it did not recognise. A typo - CLOSED_DEMO_ENABLED=ture
  - therefore disabled the gate silently, and /api/watchlist and
  /api/portfolio, which have no authentication and no tenant identity,
  became publicly readable and writable with no error and no log line.

  parseFlag accepts exactly the spellings the codebase already defines
  intentionally (1/true/yes/on and 0/false/no/off) and THROWS on
  anything else, so every valid deployment keeps working and a
  malformed value can no longer resolve quietly to false.

  Defence in depth, not the primary control: production and staging
  cannot boot at all with an invalid or absent value, because
  assertEnvironmentValid() runs at server.js:10 before express is
  required. This throw only matters in development and test, where it
  turns a silently-open gate into a loud failure. The canonical
  invariant lives in validateEnvironment.js.
*/
function enabled(env = process.env) {
  return parseFlag(env.CLOSED_DEMO_ENABLED);
}

function credentials(env = process.env) {
  const code = String(env.CLOSED_DEMO_ACCESS_CODE || "").trim();
  const secret = String(env.CLOSED_DEMO_SIGNING_SECRET || "").trim();
  if (enabled(env) && (code.length < 8 || secret.length < 32)) {
    throw new Error(
      "Closed demo requires CLOSED_DEMO_ACCESS_CODE (8+ chars) and CLOSED_DEMO_SIGNING_SECRET (32+ chars).",
    );
  }
  return { code, secret };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function token(secret, expiresAt) {
  const payload = `${OWNER_SUBJECT}:${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${expiresAt}.${OWNER_SUBJECT}.${signature}`;
}

function parseCookies(header = "") {
  try {
    return Object.fromEntries(
      String(header).split(";").map((part) => part.trim()).filter((part) => part.includes("=")).map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
    );
  } catch {
    return {};
  }
}

function trustedOrigins(env = process.env) {
  return String(env.TRUSTED_FRONTEND_ORIGINS || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
}

function trustedOwnerRequest(req, env = process.env) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin || origin === "null" || req.headers["sec-fetch-site"] === "cross-site") return false;
  try {
    if (new URL(origin).origin !== origin) return false;
  } catch {
    return false;
  }
  return trustedOrigins(env).includes(origin);
}

function authorized(req, env = process.env) {
  if (!enabled(env)) return true;
  const { secret } = credentials(env);
  const value = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const [expiresRaw, subject, signature] = String(value || "").split(".");
  const expiresAt = Number(expiresRaw);
  return subject === OWNER_SUBJECT && Number.isFinite(expiresAt) && expiresAt > Date.now() &&
    safeEqual(signature || "", token(secret, expiresAt).split(".")[2]);
}

function middleware(req, res, next) {
  if (enabled() && !trustedOwnerRequest(req)) {
    return res.status(403).json({ success: false, code: "OWNER_ORIGIN_REQUIRED", message: "A trusted owner origin is required." });
  }
  if (authorized(req)) return next();
  return res.status(401).json({
    success: false,
    code: "CLOSED_DEMO_ACCESS_REQUIRED",
    message: "This private-personal AzaLens workspace is accessible only to its owner.",
    requestId: req.requestId,
  });
}

function registerClosedDemoRoutes(app) {
  app.get("/auth/demo/status", (req, res) => res.json({
    success: true,
    enabled: enabled(),
    authorized: authorized(req),
  }));

  app.post("/auth/demo/unlock", (req, res) => {
    if (!enabled()) return res.json({ success: true, enabled: false, authorized: true });
    if (!trustedOwnerRequest(req)) {
      return res.status(403).json({ success: false, code: "OWNER_ORIGIN_REQUIRED", message: "A trusted owner origin is required." });
    }
    const { code, secret } = credentials();
    if (!safeEqual(req.body?.accessCode || "", code)) {
      return res.status(401).json({ success: false, message: "That access code is not valid." });
    }
    const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
    res.cookie(COOKIE_NAME, token(secret, expiresAt), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: MAX_AGE_SECONDS * 1000,
      path: "/",
    });
    return res.json({ success: true, enabled: true, authorized: true });
  });
}

module.exports = { authorized, credentials, enabled, middleware, registerClosedDemoRoutes, trustedOrigins, trustedOwnerRequest };
