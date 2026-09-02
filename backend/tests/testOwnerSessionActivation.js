"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateEnvironment } = require("../scripts/validateEnvironment");

const root = path.resolve(__dirname, "../..");
const server = fs.readFileSync(path.join(root, "backend/server.js"), "utf8");
const api = fs.readFileSync(path.join(root, "frontend/src/services/api.ts"), "utf8");
const gate = fs.readFileSync(path.join(root, "frontend/src/components/auth/ClosedDemoGate.tsx"), "utf8");
const browserAuth = fs.readFileSync(path.join(root, "frontend/src/auth/supabase.ts"), "utf8");
const requireUser = fs.readFileSync(path.join(root, "backend/middleware/requireUser.js"), "utf8");

const boundary = server.match(/app\.use\(\[([\s\S]*?)\], \.\.\.ownerRouteBoundary\);/);
assert.ok(boundary, "one shared owner route boundary must exist");
for (const prefix of ["/api", "/stock", "/history", "/rsi", "/ema", "/sma", "/macd", "/bollinger", "/atr", "/adx", "/obv", "/rvol", "/volume-spike", "/candlestick"]) {
  assert.match(boundary[1], new RegExp(`"${prefix.replace("/", "\\/")}"`), `${prefix} must be protected`);
}
assert.match(server, /\[closedDemoGate, createRequireUser\(\)\]/, "demo lock must precede identity lock");
assert.ok(server.indexOf("registerClosedDemoRoutes(app)") < server.indexOf("ownerRouteBoundary"));
for (const publicPath of ["/", "/health", "/health/live", "/health/ready", "/version"]) {
  assert.match(server, new RegExp(`app\\.get\\(\\s*"${publicPath.replaceAll("/", "\\/")}"`), `${publicPath} remains public`);
}

const production = {
  APP_ENV: "production", PRIVATE_PERSONAL_PROVIDER_MODE: "true", CLOSED_DEMO_ENABLED: "true",
  CLOSED_DEMO_ACCESS_CODE: "fixture-code", CLOSED_DEMO_SIGNING_SECRET: "s".repeat(40),
  TRUSTED_FRONTEND_ORIGINS: "https://azalens.com", FINNHUB_API_KEY: "fixture", TWELVE_DATA_API_KEY: "fixture",
  OBSERVABILITY_METRICS_TOKEN: "fixture", TWELVE_DATA_CREDIT_COORDINATION_MODE: "shared_atomic",
  SUPABASE_URL: "https://jexphwidcfbgxpthgwum.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_notarealkey000000000", SUPABASE_SECRET_KEY: "sb_secret_notarealkey000000000",
};
assert.match(validateEnvironment(production).errors.join(" "), /PRIVATE_OWNER_USER_ID/);
assert.equal(validateEnvironment({ ...production, PRIVATE_OWNER_USER_ID: "not-a-uuid" }).valid, false);
assert.equal(validateEnvironment({ ...production, PRIVATE_OWNER_USER_ID: "11111111-1111-4111-8111-111111111111" }).valid, true);

assert.match(api, /getCurrentSession/);
assert.match(api, /Authorization.*Bearer/s);
assert.doesNotMatch(api, /retry/i);
assert.match(gate, /Owner sign in/);
assert.match(gate, /A verified owner session is required\./);
assert.doesNotMatch(gate + browserAuth, /signUp|resetPassword|signInWithOAuth|SUPABASE_SECRET_KEY|PRIVATE_OWNER_USER_ID/);
assert.doesNotMatch(browserAuth, /console\.|fetch\(|axios|VITE_[A-Z_]*(SECRET|OWNER|PROVIDER)/);

function mutationFailures({ serverSource = server, apiSource = api, middlewareSource = requireUser, authSource = browserAuth } = {}) {
  const failures = [];
  if (!serverSource.includes("[closedDemoGate, createRequireUser()]")) failures.push("gate-order");
  if (!serverSource.includes('"/history"')) failures.push("route-coverage");
  if (!middlewareSource.includes("identity.userId.toLowerCase() !== ownerUserId")) failures.push("owner-comparison");
  if (!middlewareSource.includes("nodes > maxNodes || depth > maxDepth")) failures.push("scan-bounds");
  if (!apiSource.includes('config.headers.set("Authorization", `Bearer ${session.access_token}`)')) failures.push("bearer");
  if (apiSource.includes("retry")) failures.push("retry");
  if (/SUPABASE_SECRET_KEY|PRIVATE_OWNER_USER_ID/.test(authSource)) failures.push("frontend-secret");
  return failures;
}

assert.deepEqual(mutationFailures(), []);
assert.ok(mutationFailures({ middlewareSource: requireUser.replace("identity.userId.toLowerCase() !== ownerUserId", "false") }).includes("owner-comparison"));
assert.ok(mutationFailures({ middlewareSource: requireUser.replace("nodes > maxNodes || depth > maxDepth", "false") }).includes("scan-bounds"));
assert.ok(mutationFailures({ serverSource: server.replace("[closedDemoGate, createRequireUser()]", "[createRequireUser(), closedDemoGate]") }).includes("gate-order"));
assert.ok(mutationFailures({ serverSource: server.replace('"/history"', '"/omitted-history"') }).includes("route-coverage"));
assert.ok(mutationFailures({ apiSource: api.replace('config.headers.set("Authorization", `Bearer ${session.access_token}`)', "") }).includes("bearer"));
assert.ok(mutationFailures({ apiSource: `${api}\nretry: true` }).includes("retry"));
assert.ok(mutationFailures({ authSource: `${browserAuth}\nPRIVATE_OWNER_USER_ID` }).includes("frontend-secret"));

console.log("Two-lock route inventory, owner boot invariant, public-route exclusions, centralized bearer path and no-signup frontend contract passed; provider calls: 0.");
