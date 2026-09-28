"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { sql } = require("./helpers/localSupabase");

const root = path.resolve(__dirname, "../..");
const up = fs.readFileSync(path.join(root, "supabase/migrations/20260928120000_010_direction_guarded_protective_stops.sql"), "utf8");
const down = fs.readFileSync(path.join(root, "db/down-migrations/20260928120000_010_direction_guarded_protective_stops.sql"), "utf8");
const signature = "public.change_outcome_protective_stop(uuid,uuid,numeric,text)";

function privilege(name, role) {
  return sql(`select has_function_privilege('${role}','public.${name}(uuid,uuid,numeric,text)','EXECUTE')`);
}

function publicExecute(name) {
  return sql(`select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.${name}(uuid,uuid,numeric,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')`);
}

sql(down);
assert.equal(sql(`select to_regprocedure('${signature}') is not null`), "t");
assert.equal(sql("select to_regprocedure('public.tighten_outcome_protective_stop(uuid,uuid,numeric,text)') is null"), "t");
assert.equal(sql("select to_regprocedure('public.loosen_outcome_protective_stop(uuid,uuid,numeric,text)') is null"), "t");
assert.equal(publicExecute("change_outcome_protective_stop"), "f");
assert.equal(privilege("change_outcome_protective_stop", "anon"), "f");
assert.equal(privilege("change_outcome_protective_stop", "authenticated"), "t");
assert.equal(privilege("change_outcome_protective_stop", "service_role"), "f");
assert.equal(privilege("change_outcome_protective_stop", "postgres"), "t");

sql(up);
for (const name of ["change_outcome_protective_stop", "tighten_outcome_protective_stop", "loosen_outcome_protective_stop"]) {
  assert.equal(sql(`select pg_get_userbyid(proowner)||'|'||prosecdef||'|'||proconfig::text from pg_proc where oid='public.${name}(uuid,uuid,numeric,text)'::regprocedure`), 'postgres|true|{"search_path=\\"\\""}');
  assert.equal(publicExecute(name), "f");
  assert.equal(privilege(name, "anon"), "f");
  assert.equal(privilege(name, "service_role"), "f");
  assert.equal(privilege(name, "postgres"), "t");
}
assert.equal(privilege("change_outcome_protective_stop", "authenticated"), "f");
assert.equal(privilege("loosen_outcome_protective_stop", "authenticated"), "f");
assert.equal(privilege("tighten_outcome_protective_stop", "authenticated"), "t");

console.log("PASS Migration 010 exact down grant restoration and clean up reapplication.");
