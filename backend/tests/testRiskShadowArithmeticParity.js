"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
const {readStatus,sql}=require("./helpers/localSupabase");
const listOnly=process.argv.length===3&&process.argv[2]==="--list";
assert.ok(process.argv.length===2||listOnly,"usage: node tests/testRiskShadowArithmeticParity.js [--list]");
readStatus();
const root=path.resolve(__dirname,"../..");
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures/personalRiskShadowArithmetic.json"),"utf8"));
const fields=["modeled_proceeds","close_commission","allowance_floor","allowance_value","allowance_quantity","allowance_buffer","allowance_selected","slippage_rate","slippage_amount","exit_cost","raw_loss","contribution"];
const lifecycleTables=["outcome_positions","outcome_position_events","outcome_position_risk_state","outcome_position_increases","outcome_protective_stop_changes","outcome_exit_cost_allocations","personal_risk_evaluations"];
const counts=()=>sql(`select jsonb_object_agg(table_name,row_count)::text from (${lifecycleTables.map(table=>`select '${table}' table_name,count(*) row_count from public.${table}`).join(" union all ")}) x`);
const before=counts();
assert.equal(Object.values(JSON.parse(before)).reduce((sum,value)=>sum+Number(value),0),0,"parity database must begin with zero lifecycle rows");
const quote=value=>`'${String(value).replaceAll("'","''")}'::numeric`;
const oracle=fixtures.filter(item=>item.protectiveStop!==null).map(input=>{
 const query=`select row_to_json(x)::text from (select ${fields.map(field=>`round(${field},8)::numeric(24,8)::text ${field}`).join(",")} from public._risk008_calculate(${[input.quantity,input.entryPrice,input.protectiveStop,input.entryFee,input.entryTax,input.slippageBps].map(quote).join(",")})) x`;
 return{name:input.name,input,calculation:JSON.parse(sql(query))};
});
const negativeHalfUnit=oracle.find(item=>item.name==="negative-half-unit-rounding");
assert.equal(negativeHalfUnit.calculation.raw_loss,"-0.00000001");
assert.equal(negativeHalfUnit.calculation.contribution,"0.00000000");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"azalens-risk-shadow-"));
const oraclePath=path.join(directory,"oracle.json");
fs.writeFileSync(oraclePath,JSON.stringify(oracle));
try{
 const child=spawnSync(path.join(root,"frontend/node_modules/.bin/vitest"),[listOnly?"list":"run","shadow-tests/personalRiskShadowParity.test.ts",...(listOnly?[]:["--reporter=verbose"])],{cwd:path.join(root,"frontend"),encoding:"utf8",env:{...process.env,AZALENS_RISK_SHADOW_ORACLE:oraclePath}});
 process.stdout.write(child.stdout);process.stderr.write(child.stderr);
 assert.equal(child.status,0,listOnly?"frontend/database arithmetic parity collection failed":"frontend/database arithmetic parity failed");
 if(listOnly){
  for(const item of oracle)assert.match(child.stdout,new RegExp(`${item.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`,"m"));
  console.log(`COLLECTION shadow parity: ${oracle.length} fixture tests plus one assertion-backed summary test selected exactly once.`);
 }else{
  console.log(`PASS shadow parity: ${oracle.length} synthetic trade shapes match all 12 canonical database calculation fields.`);
  assert.equal(counts(),before,"parity harness must not create durable lifecycle rows");
  const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");
  assert.match(migration,/personal_risk_evaluations_calculation_shape[\s\S]*rejection_code='MISSING_PROTECTIVE_STOP'[\s\S]*num_nonnulls\(modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value\)=0/);
  const rpcTest=fs.readFileSync(path.join(__dirname,"testRiskLifecycleRpc.js"),"utf8");
  assert.match(rpcTest,/modeled_sell_proceeds is null and close_commission is null and slippage_amount is null and raw_planned_loss is null and planned_loss_contribution is null/);
  console.log("PASS shadow parity structural check: verified the Migration 008 constraint text and existing RPC test assertion for missing-stop nullability; this parity run did not execute the missing-stop RPC.");
  console.log("PASS shadow parity persistence check: all lifecycle table counts are unchanged.");
 }
}finally{fs.rmSync(directory,{recursive:true,force:true});}
