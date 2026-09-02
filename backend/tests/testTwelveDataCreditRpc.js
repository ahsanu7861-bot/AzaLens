"use strict";
const assert = require("node:assert/strict");
const { readStatus, request, sql } = require("./helpers/localSupabase");

async function main() {
  const { apiUrl, publishableKey, secretKey } = readStatus();
  const url = `${apiUrl}/rest/v1/rpc/reserve_twelve_data_credits`;
  const reserve = (key, credits = 1, extra = {}) => request(url, { method: "POST", apikey: key, token: key, body: { p_plan_id: "basic_internal", p_credits: credits, ...extra } });
  const reset = () => sql("truncate public.twelve_data_credit_ledger");
  reset();
  let response = await reserve(secretKey);
  assert.equal(response.status, 200); assert.equal(response.body[0].accepted, true); assert.equal(response.body[0].minute_credits, 1);
  for (let i = 1; i < 8; i += 1) await reserve(secretKey);
  response = await reserve(secretKey);
  assert.equal(response.body[0].reason, "minute_limit_exhausted");

  sql(`update public.twelve_data_credit_ledger
          set minute_key = date_trunc('minute', clock_timestamp()) - interval '1 minute'`);
  response = await reserve(secretKey); assert.equal(response.body[0].minute_credits, 1); assert.equal(response.body[0].day_credits, 9);

  reset();
  sql(`insert into public.twelve_data_credit_ledger
         (plan_id, minute_key, day_key, minute_credits, day_credits)
       values ('basic_internal', date_trunc('minute', clock_timestamp()),
         (clock_timestamp() at time zone 'UTC')::date, 0, 799)`);
  response = await reserve(secretKey); assert.equal(response.body[0].accepted, true); assert.equal(response.body[0].day_credits, 800);
  response = await reserve(secretKey); assert.equal(response.body[0].reason, "daily_limit_exhausted");
  sql(`update public.twelve_data_credit_ledger
          set minute_key = date_trunc('minute', clock_timestamp()) - interval '1 minute',
              day_key = (clock_timestamp() at time zone 'UTC')::date - 1,
              minute_credits = 8,
              day_credits = 800`);
  response = await reserve(secretKey); assert.equal(response.body[0].accepted, true); assert.equal(response.body[0].day_credits, 1);

  reset();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => reserve(secretKey)));
  assert.equal(concurrent.filter((r) => r.body[0].accepted).length, 8);
  assert.equal(sql("select minute_credits from public.twelve_data_credit_ledger where plan_id='basic_internal'"), "8");
  sql(`update public.twelve_data_credit_ledger
          set minute_key = date_trunc('minute', clock_timestamp()) - interval '1 minute'`);
  response = await reserve(secretKey); assert.equal(response.body[0].day_credits, 9); // restart/two-client durability

  const controlledTime = await reserve(secretKey, 1, { p_now: "2099-01-01T00:00:00Z" });
  assert.ok([400, 404].includes(controlledTime.status), "no deployed overload may accept caller-controlled time");
  assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reserve_twelve_data_credits'`), "1");
  assert.equal(sql(`select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reserve_twelve_data_credits'`), "p_plan_id text, p_credits integer");

  const anon = await reserve(publishableKey); assert.ok([401, 403, 404].includes(anon.status));
  const direct = await request(`${apiUrl}/rest/v1/twelve_data_credit_ledger?select=*`, { apikey: secretKey, token: secretKey }); assert.ok([401, 403, 404].includes(direct.status));
  console.log("Twelve Data credit RPC database contract tests passed.");
}
main().catch((error) => { console.error(error); process.exit(1); });
