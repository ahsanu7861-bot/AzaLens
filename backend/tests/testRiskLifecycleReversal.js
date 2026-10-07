"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {readStatus,sql}=require("./helpers/localSupabase"); readStatus();
const root=path.resolve(__dirname,"../..");const up=fs.readFileSync(path.join(root,"supabase/migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");const down=fs.readFileSync(path.join(root,"db/down-migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");const correction=fs.readFileSync(path.join(root,"supabase/migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");const correctionDown=fs.readFileSync(path.join(root,"db/down-migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");
const wrappers=fs.readFileSync(path.join(root,"supabase/migrations/20260928120000_010_direction_guarded_protective_stops.sql"),"utf8");const wrappersDown=fs.readFileSync(path.join(root,"db/down-migrations/20260928120000_010_direction_guarded_protective_stops.sql"),"utf8");const closure=fs.readFileSync(path.join(root,"supabase/migrations/20261006120000_011_close_direct_exposure_rpcs.sql"),"utf8");const closureDown=fs.readFileSync(path.join(root,"db/down-migrations/20261006120000_011_close_direct_exposure_rpcs.sql"),"utf8");
const OPEN_RPC="public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text)";
const INCREASE_RPC="public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric)";
const can=(role,signature)=>sql(`select has_function_privilege('${role}','${signature}','EXECUTE')`);
const exists=()=>sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='personal_risk_evaluations'");
assert.equal(sql("select sum(n) from (select count(*) n from public.personal_risk_evaluations union all select count(*) from public.broker_cost_schedule_versions union all select count(*) from public.outcome_position_risk_state) x"),"0");
for(const rpc of [OPEN_RPC,INCREASE_RPC])assert.equal(can("authenticated",rpc),"f",`pre-state (Migration 011 applied): ${rpc} denies authenticated`);
assert.equal(can("authenticated","public.change_outcome_protective_stop(uuid,uuid,numeric,text)"),"f","pre-state (Migration 010 applied): the generic stop RPC denies authenticated");
sql(closureDown);
for(const rpc of [OPEN_RPC,INCREASE_RPC])assert.equal(can("authenticated",rpc),"f",`the Migration 011 down file restores no grant: ${rpc} still denies authenticated`);
let primary,reopened;try{
 sql(wrappersDown);
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
}catch(e){primary=e;}finally{sql(up);sql(correction);sql(wrappers);reopened=[OPEN_RPC,INCREASE_RPC].map(rpc=>can("authenticated",rpc));sql(closure);}assert.equal(exists(),"1");if(primary)throw primary;
assert.deepEqual(reopened,["t","t"],"re-applying Migration 008 re-grants both direct RPCs to authenticated before Migration 011 is re-applied");
for(const rpc of [OPEN_RPC,INCREASE_RPC])assert.equal(can("authenticated",rpc),"f",`re-applied Migration 011 revokes ${rpc} from authenticated`);
sql(closure);
for(const rpc of [OPEN_RPC,INCREASE_RPC])assert.equal(can("authenticated",rpc),"f",`a second Migration 011 application keeps ${rpc} denied to authenticated`);
for(const role of ["authenticated","anon","service_role"])for(const rpc of [OPEN_RPC,INCREASE_RPC])assert.equal(can(role,rpc),"f",`final state: ${rpc} denies ${role}`);
assert.equal(can("authenticated","public.tighten_outcome_protective_stop(uuid,uuid,numeric,text)"),"t");
assert.equal(can("authenticated","public.change_outcome_protective_stop(uuid,uuid,numeric,text)"),"f");
assert.equal(can("authenticated","public.loosen_outcome_protective_stop(uuid,uuid,numeric,text)"),"f");
assert.equal(sql("select has_function_privilege('authenticated','public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric)','EXECUTE')"),"f");
assert.equal(sql("select has_function_privilege('authenticated','public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text)','EXECUTE')"),"f");
assert.equal(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='broker_cost_schedule_versions_broker_legal_entity_check'"),"CHECK ((broker_legal_entity = 'Saxo Bank'::text))");
console.log("Migration 011 down-file no-restore, Migration 010/009 guarded reversal, Migration 008 empty reversal, unchanged Migration 004 RPC/RLS suites, exact 008/009/010 reapplication, and idempotent 011 re-closure passed.");
