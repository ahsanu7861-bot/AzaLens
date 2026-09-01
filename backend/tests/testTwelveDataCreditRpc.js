"use strict";
const assert = require("node:assert/strict");
const { readStatus, request, sql } = require("./helpers/localSupabase");

async function main() {
  const { apiUrl, publishableKey, secretKey } = readStatus();
  const url = `${apiUrl}/rest/v1/rpc/reserve_twelve_data_credits`;
  const reserve = (key, at, credits = 1) => request(url, { method: "POST", apikey: key, token: key, body: { p_plan_id: "basic_internal", p_credits: credits, p_now: at } });
  const reset = () => sql("truncate public.twelve_data_credit_ledger");
  reset();
  let response = await reserve(secretKey, "2026-09-02T10:00:00Z");
  assert.equal(response.status, 200); assert.equal(response.body[0].accepted, true); assert.equal(response.body[0].minute_credits, 1);
  for (let i = 1; i < 8; i += 1) await reserve(secretKey, "2026-09-02T10:00:00Z");
  response = await reserve(secretKey, "2026-09-02T10:00:00Z");
  assert.equal(response.body[0].reason, "minute_limit_exhausted");
  response = await reserve(secretKey, "2026-09-02T10:01:00Z"); assert.equal(response.body[0].minute_credits, 1); assert.equal(response.body[0].day_credits, 9);

  reset();
  for (let minute = 0; minute < 100; minute += 1) {
    const at = new Date(Date.parse("2026-09-02T00:00:00Z") + minute * 60_000).toISOString();
    response = await reserve(secretKey, at, 8); assert.equal(response.body[0].accepted, true);
  }
  response = await reserve(secretKey, "2026-09-02T02:00:00Z"); assert.equal(response.body[0].reason, "daily_limit_exhausted");
  response = await reserve(secretKey, "2026-09-03T00:00:00Z"); assert.equal(response.body[0].accepted, true); assert.equal(response.body[0].day_credits, 1);

  reset();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => reserve(secretKey, "2026-09-04T12:00:00Z")));
  assert.equal(concurrent.filter((r) => r.body[0].accepted).length, 8);
  assert.equal(sql("select minute_credits from public.twelve_data_credit_ledger where plan_id='basic_internal'"), "8");
  response = await reserve(secretKey, "2026-09-04T12:01:00Z"); assert.equal(response.body[0].day_credits, 9); // restart/two-client durability

  const anon = await reserve(publishableKey, "2026-09-05T00:00:00Z"); assert.ok([401, 403, 404].includes(anon.status));
  const direct = await request(`${apiUrl}/rest/v1/twelve_data_credit_ledger?select=*`, { apikey: secretKey, token: secretKey }); assert.ok([401, 403, 404].includes(direct.status));
  console.log("Twelve Data credit RPC database contract tests passed.");
}
main().catch((error) => { console.error(error); process.exit(1); });
