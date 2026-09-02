"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const {
  JWKS_CACHE_TTL_MS,
  createSupabaseAccessTokenVerifier,
} = require("../auth/verifySupabaseAccessToken");

const ISSUER = "https://xhxlgalaytuqdnmmwypv.supabase.co/auth/v1";
const USER_A = "11111111-1111-4111-8111-111111111111";
const NOW = 1_800_000_000;
const env = {
  SUPABASE_URL: "https://xhxlgalaytuqdnmmwypv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_not_a_credential",
  SUPABASE_SECRET_KEY: "sb_secret_fixture_not_a_credential",
};

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(header = {}, claims = {}) {
  return `${encoded({ alg: "ES256", kid: "fixture-key", typ: "JWT", ...header })}.${encoded({
    iss: ISSUER, aud: "authenticated", role: "authenticated", sub: USER_A,
    exp: NOW + 300, iat: NOW - 10, ...claims,
  })}.fixture_signature`;
}

function signingKey(kid) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { kid, privateKey, publicJwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" } };
}

function signedToken(key, issuer, claims = {}) {
  const header = encoded({ alg: "ES256", kid: key.kid, typ: "JWT" });
  const payload = encoded({
    iss: issuer, aud: "authenticated", role: "authenticated", sub: USER_A,
    exp: NOW + 300, iat: NOW - 10, ...claims,
  });
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: key.privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

async function rejectsCode(operation, code) {
  await assert.rejects(operation, (error) => error?.code === code);
}

(async () => {
  let getClaimsCalls = 0;
  let getUserCalls = 0;
  const authClient = { auth: {
    getClaims: async (jwt) => {
      getClaimsCalls += 1;
      const [header, payload] = jwt.split(".");
      return { data: { header: JSON.parse(Buffer.from(header, "base64url")), claims: JSON.parse(Buffer.from(payload, "base64url")) }, error: null };
    },
    getUser: async (jwt) => {
      getUserCalls += 1;
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url"));
      return { data: { user: { id: payload.sub } }, error: null };
    },
  } };
  const verify = createSupabaseAccessTokenVerifier({ env, authClient, now: () => NOW * 1000 });

  assert.deepEqual(await verify(token()), { userId: USER_A, verificationMode: "asymmetric_jwks" });
  assert.equal(getClaimsCalls, 1);
  assert.equal(getUserCalls, 0);

  const legacy = token({ alg: "HS256", kid: undefined });
  assert.deepEqual(await verify(legacy), { userId: USER_A, verificationMode: "authoritative_auth_server" });
  assert.equal(getUserCalls, 1, "legacy/symmetric tokens require authoritative Auth validation");

  for (const [label, badToken] of [
    ["wrong issuer", token({}, { iss: "https://wrong.supabase.co/auth/v1" })],
    ["wrong audience", token({}, { aud: "anon" })],
    ["wrong role", token({}, { role: "service_role" })],
    ["malformed subject", token({}, { sub: "owner" })],
  ]) {
    await assert.rejects(() => verify(badToken), /could not be verified/i, label);
  }
  await rejectsCode(() => verify(token({}, { exp: NOW })), "AUTH_TOKEN_EXPIRED");
  await rejectsCode(() => verify(token({}, { nbf: NOW + 1 })), "AUTH_TOKEN_NOT_YET_VALID");
  await rejectsCode(() => verify(token({ alg: "RS256" })), "AUTH_SIGNING_MODE_UNSUPPORTED");
  await rejectsCode(() => verify(token({ kid: "" })), "AUTH_TOKEN_INVALID");
  await rejectsCode(() => verify("not-a-jwt"), "AUTH_TOKEN_INVALID");
  await rejectsCode(() => verify(env.SUPABASE_PUBLISHABLE_KEY), "AUTH_TOKEN_INVALID");
  await rejectsCode(() => verify(env.SUPABASE_SECRET_KEY), "AUTH_TOKEN_INVALID");

  const invalidSignatureVerifier = createSupabaseAccessTokenVerifier({
    env,
    authClient: { auth: { getClaims: async () => ({ data: null, error: new Error("signature rejected") }) } },
    now: () => NOW * 1000,
  });
  await rejectsCode(() => invalidSignatureVerifier(token()), "AUTH_TOKEN_INVALID");

  const unavailableVerifier = createSupabaseAccessTokenVerifier({
    env,
    authClient: { auth: {
      getClaims: async () => { throw new Error(`network down ${token()}`); },
      getUser: async () => { throw new Error(`network down ${legacy}`); },
    } },
    now: () => NOW * 1000,
  });
  await rejectsCode(() => unavailableVerifier(token()), "AUTH_VERIFIER_UNAVAILABLE");
  await rejectsCode(() => unavailableVerifier(legacy), "AUTH_VERIFIER_UNAVAILABLE");

  const rotatedA = token({ kid: "standby-a" });
  const rotatedB = token({ kid: "current-b" });
  assert.equal((await verify(rotatedA)).userId, USER_A);
  assert.equal((await verify(rotatedB)).userId, USER_A);
  assert.equal(getClaimsCalls, 9, "every asymmetric token is signature-verified by getClaims");
  assert.equal(JWKS_CACHE_TTL_MS, 600_000);

  const constantsSource = fs.readFileSync(
    path.join(__dirname, "../node_modules/@supabase/auth-js/src/lib/constants.ts"), "utf8"
  );
  assert.match(constantsSource, /JWKS_TTL\s*=\s*10\s*\*\s*60\s*\*\s*1000/);

  // Exercise the real SDK verifier with an in-memory JWKS transport. This is
  // the mutation control against replacing verified getClaims with decode-only.
  const localProject = "aaaaaaaaaaaaaaaaaaaa";
  const localUrl = `https://${localProject}.supabase.co`;
  const localIssuer = `${localUrl}/auth/v1`;
  const keyA = signingKey("standby-a");
  const keyB = signingKey("current-b");
  const attacker = signingKey("attacker");
  let publishedKeys = [keyA.publicJwk];
  let jwksFetches = 0;
  const localClient = createClient(localUrl, "sb_publishable_fixture_not_a_credential", {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (url) => {
      assert.match(String(url), /\.well-known\/jwks\.json$/);
      jwksFetches += 1;
      return new Response(JSON.stringify({ keys: publishedKeys }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const realVerify = createSupabaseAccessTokenVerifier({
    env: { ...env, SUPABASE_URL: localUrl }, authClient: localClient, now: () => NOW * 1000,
  });
  assert.equal((await realVerify(signedToken(keyA, localIssuer))).userId, USER_A);
  assert.equal(jwksFetches, 1);
  publishedKeys = [keyA.publicJwk, keyB.publicJwk];
  assert.equal((await realVerify(signedToken(keyB, localIssuer))).userId, USER_A);
  assert.equal(jwksFetches, 2, "an unknown rotating kid causes one JWKS refresh");
  assert.equal((await realVerify(signedToken(keyB, localIssuer))).userId, USER_A);
  assert.equal(jwksFetches, 2, "the refreshed key remains inside the bounded SDK cache");
  const forged = signedToken({ ...attacker, kid: keyA.kid }, localIssuer);
  await rejectsCode(() => realVerify(forged), "AUTH_TOKEN_INVALID");

  console.log("Supabase access-token signature, claim, signing-mode, rotation and fail-closed tests passed; network/provider calls: 0.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
