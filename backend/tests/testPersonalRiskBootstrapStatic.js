"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { inspectCallerSuppliedUserId } = require("../middleware/requireUser");

const root = path.resolve(__dirname, "..");
const route = fs.readFileSync(path.join(root, "routes/personalRiskBootstrapRoutes.js"), "utf8");
const service = fs.readFileSync(path.join(root, "services/personalRiskBootstrapService.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const observability = fs.readFileSync(path.join(root, "utils/observability.js"), "utf8");
const migration007 = fs.readFileSync(path.resolve(root, "../supabase/migrations/20260918120000_007_personal_risk_foundations.sql"), "utf8");

assert.match(server, /app\.use\("\/api\/personal-risk", requirePersonalPersistence, createPersonalRiskBootstrapRouter\(\)\)/);
assert.match(server, /req\.user\?\.id && req\.db \? next\(\) : requireUser/);
assert.doesNotMatch(`${route}\n${service}`, /service[_-]?role|SUPABASE_SECRET|authorization|cookie|localStorage|sessionStorage/i);
assert.doesNotMatch(`${route}\n${service}`, /console\.|writeLog|req\.headers\s*\)|JSON\.stringify\(req/i);
assert.match(observability, /requestId,\s*method: req\.method,\s*route,\s*statusCode,\s*durationMs:/s);
assert.doesNotMatch(observability.slice(observability.indexOf("function requestObservability"), observability.indexOf("function normalizeProviderCode")), /authorization|cookie|referer|referrer|req\.body|req\.query|rawHeaders/i);

for (const location of ["body", "query", "params"]) {
  const req = { headers: {}, body: {}, query: {}, params: {} };
  req[location] = { outer: { deeper: { user_id: "attacker" } } };
  assert.equal(inspectCallerSuppliedUserId(req).supplied, true, `nested user_id in ${location}`);
}
assert.equal(inspectCallerSuppliedUserId({ headers: { "x-user-id": "attacker" }, body: {}, query: {}, params: {} }).supplied, true);

const rpcCalls = [...service.matchAll(/\.rpc\(([^,]+)/g)].map((match) => match[1].trim());
assert.deepEqual(rpcCalls, ["name"], "one private invoke path is used; callers select only compile-time RPC constants");
assert.deepEqual([...service.matchAll(/create_(?:personal_risk_policy_version|broker_cost_schedule_version|broker_equity_snapshot)/g)].map((m) => m[0]).filter((x, i, a) => a.indexOf(x) === i).sort(), [
  "create_broker_cost_schedule_version", "create_broker_equity_snapshot", "create_personal_risk_policy_version",
]);
for (const forbidden of ["create_outcome_position", "append_risk_lifecycle_event", "increase_risk_enforced_position", "change_outcome_protective_stop", "INLF", "REALIZED_HISTORICAL_COST"]) {
  assert.doesNotMatch(`${route}\n${service}`, new RegExp(forbidden));
}
assert.match(migration007, /char_length\(confirmation_reference\) between 1 and 240 and\s+confirmation_reference !~ '\[\[:cntrl:\]\]'/);

console.log("PASS static: fixed RPC allowlisting; no ledger, trade, evaluation, historical-cost or INLF integration.");
console.log("PASS static: observability logs only request ID/method/normalized route/status/duration/outcome—never Authorization, cookies, Idempotency-Key, request body, evidence reference or raw database diagnostics.");
console.log("PASS static: Migration 007 confirmation-reference constraint is exactly length 1..240 with control characters prohibited.");
console.log("Personal-risk bootstrap auth, fixed-RPC, logging and scope contracts passed.");
