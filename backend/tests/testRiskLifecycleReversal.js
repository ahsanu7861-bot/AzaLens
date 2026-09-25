"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {readStatus,sql}=require("./helpers/localSupabase"); readStatus();
const root=path.resolve(__dirname,"../..");const up=fs.readFileSync(path.join(root,"supabase/migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");const down=fs.readFileSync(path.join(root,"db/down-migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");const correction=fs.readFileSync(path.join(root,"supabase/migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");const correctionDown=fs.readFileSync(path.join(root,"db/down-migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");
const exists=()=>sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='personal_risk_evaluations'");
assert.equal(sql("select sum(n) from (select count(*) n from public.personal_risk_evaluations union all select count(*) from public.broker_cost_schedule_versions union all select count(*) from public.outcome_position_risk_state) x"),"0");
let primary;try{
 sql(correctionDown);assert.equal(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='broker_cost_schedule_versions_broker_legal_entity_check'"),"CHECK ((broker_legal_entity = 'Saxo Financial Services (DIFC) Ltd / Saxo MENA'::text))");
 sql(down);assert.equal(exists(),"0");
 for(const signature of [
  "public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric)",
  "public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text)"
 ]) assert.equal(sql(`select has_function_privilege('authenticated','${signature}','EXECUTE')`),"t");
 for(const test of ["tests/testOutcomeLedgerRpc.js","tests/testOutcomeLedgerRls.js"]){
  const child=spawnSync(process.execPath,[test],{cwd:path.join(root,"backend"),encoding:"utf8",env:process.env});
  if(child.status!==0)throw new Error(`${test} failed on exact 001-007:\n${child.stdout}\n${child.stderr}`);
 }
}catch(e){primary=e;}finally{sql(up);sql(correction);}assert.equal(exists(),"1");if(primary)throw primary;
assert.equal(sql("select has_function_privilege('authenticated','public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric)','EXECUTE')"),"f");
assert.equal(sql("select has_function_privilege('authenticated','public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text)','EXECUTE')"),"f");
assert.equal(sql("select has_function_privilege('authenticated','public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text)','EXECUTE')"),"t");
assert.equal(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='broker_cost_schedule_versions_broker_legal_entity_check'"),"CHECK ((broker_legal_entity = 'Saxo Bank'::text))");
console.log("Migration 009 guarded reversal, Migration 008 empty reversal, unchanged Migration 004 RPC/RLS suites, and exact 008/009 reapplication passed.");
