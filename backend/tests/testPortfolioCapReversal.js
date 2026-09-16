"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readStatus, sql } = require("./helpers/localSupabase");

readStatus(); // Refuse to run unless the repository-local disposable stack exists.

const ROOT = path.resolve(__dirname, "../..");
const up = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20260917120000_006_portfolio_holding_cap.sql"),
  "utf8"
);
const down = fs.readFileSync(
  path.join(ROOT, "db/down-migrations/20260917120000_006_portfolio_holding_cap.sql"),
  "utf8"
);

const functionDefinition = () => sql(`
  select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='enforce_portfolio_holding_cap'
`);
const portfolioTriggers = () => sql(`
  select string_agg(t.tgname, ',' order by t.tgname)
    from pg_trigger t
   where t.tgrelid='public.portfolio_holdings'::regclass and not t.tgisinternal
`);
const watchlistContract = () => sql(`
  select count(*)::text || '|' ||
         (select count(*) from pg_trigger t where t.tgrelid='public.watchlists'::regclass
           and not t.tgisinternal and t.tgname='watchlists_enforce_record_cap')::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='enforce_watchlist_record_cap'
`);

const beforeFunction = functionDefinition();
const beforeTriggers = portfolioTriggers();
const beforeWatchlist = watchlistContract();
assert.ok(beforeFunction.includes("v_limit   constant integer := 50"));
assert.equal(beforeTriggers, "portfolio_holdings_enforce_record_cap,portfolio_holdings_set_updated_at");

let primaryError;
try {
  sql(down);
  assert.equal(functionDefinition(), "", "down migration removes only the cap function");
  assert.equal(portfolioTriggers(), "portfolio_holdings_set_updated_at",
    "down migration preserves the updated_at trigger");
  assert.equal(watchlistContract(), beforeWatchlist, "down migration preserves migration 005");
} catch (error) {
  primaryError = error;
} finally {
  sql(up);
}

assert.equal(functionDefinition(), beforeFunction, "reapply restores the exact function definition");
assert.equal(portfolioTriggers(), beforeTriggers, "reapply restores exact trigger coexistence");
assert.equal(watchlistContract(), beforeWatchlist, "reapply leaves migration 005 unchanged");
if (primaryError) throw primaryError;

console.log("Portfolio cap down/reapply reversal contract passed with updated_at and watchlist preservation.");
