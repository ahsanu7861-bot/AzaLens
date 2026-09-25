"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"../..");
const up=fs.readFileSync(path.join(root,"supabase/migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");
const down=fs.readFileSync(path.join(root,"db/down-migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");
const correction=fs.readFileSync(path.join(root,"supabase/migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");
const correctionDown=fs.readFileSync(path.join(root,"db/down-migrations/20260925120000_009_correct_broker_cost_schedule_contract.sql"),"utf8");
for(const t of ["broker_cost_schedule_versions","broker_cost_schedule_components","outcome_position_risk_state","outcome_position_increases","outcome_protective_stop_changes","outcome_exit_cost_allocations","personal_risk_evaluations"]){
 assert.equal((up.match(new RegExp(`create table public\\.${t} \\(`,"g"))||[]).length,1,t);
 assert.match(down,new RegExp(`drop table if exists public\\.${t}`));
}
for(const x of ["personal_risk_evaluations_calculation_shape","personal_risk_evaluations_rejection_threshold_shape","MISSING_PROTECTIVE_STOP","PROTECTIVE_STOP_REQUIRED","MAXIMUM_CONCURRENT_POSITIONS","num_nonnulls(modeled_sell_proceeds","canonical_provenance jsonb","ledger_request_fingerprint text","'attempted_request',v_attempt","pg_advisory_xact_lock","security definer set search_path=''","0.000020600000","0.000195000000","9.79000000","100000.00000000","10000.00000000"]) assert.ok(up.includes(x),x);
assert.ok(!up.includes("'provenance',p_provenance,'broker_effective_at'"),"raw provenance is never used in the risk fingerprint");
assert.equal((up.match(/pg_catalog\.pg_advisory_xact_lock/g)||[]).length,5,"all five owner mutation RPCs serialize");
const mutants=[
 ["missing-stop shape removed",up.replace("constraint personal_risk_evaluations_calculation_shape check(","constraint weakened_shape check("),"personal_risk_evaluations_calculation_shape"],
 ["rejection mapping removed",up.replace("constraint personal_risk_evaluations_rejection_threshold_shape check(","constraint weakened_mapping check("),"personal_risk_evaluations_rejection_threshold_shape"],
 ["owner lock removed",up.replace("perform pg_catalog.pg_advisory_xact_lock","perform pg_catalog.pg_advisory_lock"),"pg_advisory_xact_lock"],
 ["legacy opening restored",up.replace("revoke execute on function public.create_outcome_position","grant execute on function public.create_outcome_position"),"revoke execute on function public.create_outcome_position"],
];
for(const [name,mutant,required] of mutants){assert.notEqual(mutant,up,name);assert.ok(!mutant.includes(required)||((mutant.match(new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length<(up.match(new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length),name);}
assert.match(up,/revoke execute on function public\.create_outcome_position[\s\S]*from authenticated/);
assert.match(up,/revoke execute on function public\.append_outcome_position_event[\s\S]*from authenticated/);
assert.match(down,/reversal refused: immutable risk lifecycle evidence exists/);
for(const f of ["20260903120000_004_personal_outcome_ledger.sql","20260918120000_007_personal_risk_foundations.sql"]){
 const actual=crypto.createHash("sha256").update(fs.readFileSync(path.join(root,"supabase/migrations",f))).digest("hex");
 const expected={"20260903120000_004_personal_outcome_ledger.sql":"bfcf12355fa45c080fe0363d97c43d7f82b94000ce2905c4983c87564851fdd9","20260918120000_007_personal_risk_foundations.sql":"d206210ba59e89bbb09118743ab5caf18067ec20ccfc8e3525b0a1d47bccd1c6"}[f]; assert.equal(actual,expected,f);
}
assert.equal(crypto.createHash("sha256").update(up).digest("hex"),"7595ef00aaed4f77948342b1ec921756a7e7c47cd556f42878a2610ed5ff40d9","Migration 008 remains byte-identical");
for(const required of ["migration 009 refused: broker cost schedule evidence already exists","broker_legal_entity = 'Saxo Bank'","'contract',2","'broker_legal_entity','Saxo Bank'","'finra_source_effective_from',date '2026-01-01'","date '2026-01-01'","contracting-entity clause has not been verified","fixed 0.20 USD term per modeled exit and is subject to a 0.50 USD floor","not proven coverage or an upper bound for broker rounding","multi-fill execution","venue-routing treatment remain unproven","2026-10-01 through 2026-12-31","not represented as a FINRA assessment billed by Saxo"]) assert.ok(correction.includes(required),required);
for(const unsupported of ["1,006.80 USD","0.22 USD of estimated non-commission cost","That margin covers single-execution rounding"]) assert.ok(!correction.includes(unsupported),unsupported);
assert.doesNotMatch(correction,/A\/S|All Client/);
assert.ok(!correction.includes("add constraint broker_cost_component_source"),"FINRA date is pinned in creation, not a table-wide constraint");
assert.match(correctionDown,/migration 009 reversal refused: broker cost schedule evidence exists/);
assert.match(correctionDown,/broker_legal_entity = 'Saxo Financial Services \(DIFC\) Ltd \/ Saxo MENA'/);
console.log("Migrations 008/009 immutable baseline, forward correction and guarded reversal contracts passed.");
