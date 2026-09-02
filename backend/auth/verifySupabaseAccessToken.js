"use strict";

const { createClient } = require("@supabase/supabase-js");
const { deriveJwtIssuer } = require("../config/supabaseEnvironment");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASYMMETRIC_ALGORITHM = "ES256";
const AUTHENTICATED_AUDIENCE = "authenticated";
const AUTHENTICATED_ROLE = "authenticated";
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

class AccessTokenVerificationError extends Error {
  constructor(code = "AUTH_TOKEN_INVALID") {
    super("The access token could not be verified.");
    this.name = "AccessTokenVerificationError";
    this.code = code;
  }
}

function fail(code) {
  throw new AccessTokenVerificationError(code);
}

function decodeSegment(segment) {
  if (typeof segment !== "string" || segment.length === 0 || segment.length > 16_384) {
    fail();
  }

  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    fail();
  }
}

function inspectToken(token, env) {
  if (typeof token !== "string" || token.length < 16 || token.length > 16_384) fail();
  if (token.startsWith("sb_publishable_") || token.startsWith("sb_secret_")) fail();
  if ([env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_SECRET_KEY].some((key) => key && token === key)) fail();

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) fail();

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  if (!header || typeof header !== "object" || Array.isArray(header)) fail();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail();

  return { header, payload };
}

function validAudience(audience) {
  return audience === AUTHENTICATED_AUDIENCE;
}

function validateClaims(claims, { expectedIssuer, nowSeconds }) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) fail();
  if (claims.iss !== expectedIssuer) fail();
  if (!validAudience(claims.aud)) fail();
  if (claims.role !== AUTHENTICATED_ROLE) fail();
  if (typeof claims.sub !== "string" || !UUID_PATTERN.test(claims.sub)) fail();
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) fail("AUTH_TOKEN_EXPIRED");
  if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > nowSeconds)) {
    fail("AUTH_TOKEN_NOT_YET_VALID");
  }
  return claims.sub.toLowerCase();
}

function defaultVerificationClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createSupabaseAccessTokenVerifier({
  env = process.env,
  authClient = defaultVerificationClient(env),
  now = () => Date.now(),
} = {}) {
  const expectedIssuer = deriveJwtIssuer(env.SUPABASE_URL);

  return async function verifySupabaseAccessToken(token) {
    const inspected = inspectToken(token, env);
    const algorithm = inspected.header.alg;
    const nowSeconds = Math.floor(now() / 1000);

    if (algorithm === ASYMMETRIC_ALGORITHM) {
      if (typeof inspected.header.kid !== "string" || !inspected.header.kid.trim()) fail();

      let result;
      try {
        result = await authClient.auth.getClaims(token);
      } catch {
        fail("AUTH_VERIFIER_UNAVAILABLE");
      }
      if (result?.error || !result?.data?.claims) fail();
      if (result.data.header?.alg && result.data.header.alg !== ASYMMETRIC_ALGORITHM) fail();
      if (result.data.header?.kid && result.data.header.kid !== inspected.header.kid) fail();

      return Object.freeze({
        userId: validateClaims(result.data.claims, { expectedIssuer, nowSeconds }),
        verificationMode: "asymmetric_jwks",
      });
    }

    if (algorithm === "HS256") {
      let result;
      try {
        result = await authClient.auth.getUser(token);
      } catch {
        fail("AUTH_VERIFIER_UNAVAILABLE");
      }
      if (result?.error || !result?.data?.user) fail();

      const userId = validateClaims(inspected.payload, { expectedIssuer, nowSeconds });
      if (String(result.data.user.id || "").toLowerCase() !== userId) fail();
      return Object.freeze({ userId, verificationMode: "authoritative_auth_server" });
    }

    fail("AUTH_SIGNING_MODE_UNSUPPORTED");
  };
}

module.exports = {
  ASYMMETRIC_ALGORITHM,
  AUTHENTICATED_AUDIENCE,
  AUTHENTICATED_ROLE,
  AccessTokenVerificationError,
  JWKS_CACHE_TTL_MS,
  createSupabaseAccessTokenVerifier,
  inspectToken,
  validateClaims,
};
