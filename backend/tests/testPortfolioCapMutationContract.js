"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const upPath = path.join(ROOT, "supabase/migrations/20260917120000_006_portfolio_holding_cap.sql");
const downPath = path.join(ROOT, "db/down-migrations/20260917120000_006_portfolio_holding_cap.sql");
const servicePath = path.join(ROOT, "backend/services/portfolioService.js");
const suitePath = path.join(ROOT, "backend/tests/testPortfolioCapInvariant.js");

const original = {
  up: fs.readFileSync(upPath, "utf8"),
  down: fs.readFileSync(downPath, "utf8"),
  service: fs.readFileSync(servicePath, "utf8"),
  suite: fs.readFileSync(suitePath, "utf8"),
};

function positions(text) {
  const ownership = text.indexOf("v_actor <> new.user_id");
  const duplicates = [...text.matchAll(/if exists\s*\(\s*select 1\s+from public\.portfolio_holdings/g)]
    .map((match) => match.index);
  const lock = text.indexOf("pg_catalog.pg_advisory_xact_lock");
  const count = text.indexOf("select pg_catalog.count(*)");
  return { ownership, duplicates, lock, count };
}

function detect({ up, down, service, suite }) {
  const order = positions(up);
  return {
    cap50: up.includes("v_limit   constant integer := 50"),
    advisoryLock: up.includes("pg_catalog.pg_advisory_xact_lock") && !up.includes("pg_advisory_unlock"),
    ownershipFirst: order.ownership >= 0 && order.duplicates.length === 2 && order.ownership < order.duplicates[0],
    duplicateOrder: order.duplicates.length === 2 && order.duplicates[0] < order.lock && order.lock < order.duplicates[1] && order.duplicates[1] < order.count,
    securityDefiner: /security definer/i.test(up),
    emptySearchPath: /set search_path = ''/i.test(up),
    noDirectExecute: /revoke all on function public\.enforce_portfolio_holding_cap\(\)[\s\S]*from public, anon, authenticated, service_role;/i.test(up),
    capTrigger: /create trigger portfolio_holdings_enforce_record_cap[\s\S]*before insert on public\.portfolio_holdings[\s\S]*for each row/i.test(up),
    downOnlyOwnObjects: down.includes("drop trigger if exists portfolio_holdings_enforce_record_cap") &&
      down.includes("drop function if exists public.enforce_portfolio_holding_cap()") &&
      !down.includes("portfolio_holdings_set_updated_at") && !/delete|truncate/i.test(down),
    concurrencyNotVacuous: suite.includes("const CONCURRENCY = 12") && suite.includes("const ROUNDS = 3") &&
      suite.includes("const gate = new Promise") && suite.includes("release();") &&
      suite.includes("accepted === 1") && suite.includes("capped === CONCURRENCY - 1"),
    updatedTriggerProved: suite.includes("portfolio_holdings_set_updated_at") && suite.includes("beforeUpdate.body?.[0]?.updated_at < afterUpdate.body?.[0]?.updated_at"),
    app50: service.includes("const PORTFOLIO_RECORD_LIMIT = 50"),
  };
}

assert.deepEqual(Object.values(detect(original)).filter(Boolean).length, Object.keys(detect(original)).length,
  "the committed portfolio cap contract must satisfy every detector");

const mutations = [
  ["cap 50 -> 51", "up", "v_limit   constant integer := 50", "v_limit   constant integer := 51", "cap50"],
  ["advisory lock removed", "up", "pg_catalog.pg_advisory_xact_lock", "pg_catalog.pg_sleep", "advisoryLock"],
  ["ownership gate removed", "up", "v_actor <> new.user_id", "v_actor = new.user_id", "ownershipFirst"],
  ["duplicate checks removed", "up", /if exists \([\s\S]*?return new;\n  end if;/g, "-- duplicate check removed", "duplicateOrder"],
  ["SECURITY DEFINER removed", "up", "security definer", "security invoker", "securityDefiner"],
  ["search_path hardening removed", "up", "set search_path = ''", "", "emptySearchPath"],
  ["EXECUTE granted to authenticated", "up", "from public, anon, authenticated, service_role;", "from public, anon, service_role;", "noDirectExecute"],
  ["cap trigger removed", "up", /create trigger portfolio_holdings_enforce_record_cap[\s\S]*?enforce_portfolio_holding_cap\(\);/, "", "capTrigger"],
  ["updated-at coexistence proof removed", "suite", "portfolio_holdings_set_updated_at", "updated_trigger_removed", "updatedTriggerProved"],
  ["concurrency reduced to one request", "suite", "const CONCURRENCY = 12", "const CONCURRENCY = 1", "concurrencyNotVacuous"],
  ["application constant 50 -> 100", "service", "const PORTFOLIO_RECORD_LIMIT = 50", "const PORTFOLIO_RECORD_LIMIT = 100", "app50"],
];

for (const [name, file, needle, replacement, detector] of mutations) {
  const mutant = { ...original, [file]: original[file].replace(needle, replacement) };
  assert.notEqual(mutant[file], original[file], `${name}: mutation needle must remain load-bearing`);
  assert.equal(detect(mutant)[detector], false, `${name}: durable detector must fail`);
}

assert.equal(fs.readFileSync(upPath, "utf8"), original.up);
assert.equal(fs.readFileSync(downPath, "utf8"), original.down);
assert.equal(fs.readFileSync(servicePath, "utf8"), original.service);
assert.equal(fs.readFileSync(suitePath, "utf8"), original.suite);

console.log(`Portfolio cap source contract and ${mutations.length} mutation proofs passed.`);
