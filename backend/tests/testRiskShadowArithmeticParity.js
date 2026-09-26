"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const {readStatus,sql}=require("./helpers/localSupabase");
const listOnly=process.argv.length===3&&process.argv[2]==="--list";
assert.ok(process.argv.length===2||listOnly,"usage: node tests/testRiskShadowArithmeticParity.js [--list]");
const root=path.resolve(__dirname,"../..");
const fail=(name,message,cause)=>{const error=new Error(message,cause?{cause}:undefined);error.name=name;throw error;};
const readJson=(file,label)=>{try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(error){fail("RISK_SHADOW_LOCKFILE_UNREADABLE",`${label} lockfile could not be read`,error);}};
const backendLock=readJson(path.join(root,"backend/package-lock.json"),"backend");
const frontendLock=readJson(path.join(root,"frontend/package-lock.json"),"frontend");
const backendTypeScript=backendLock.packages?.["node_modules/typescript"]?.version;
const frontendTypeScript=frontendLock.packages?.["node_modules/typescript"]?.version;
if(!backendTypeScript)fail("RISK_SHADOW_TYPESCRIPT_MISSING","backend lockfile does not resolve TypeScript");
if(!frontendTypeScript)fail("RISK_SHADOW_TYPESCRIPT_MISSING","frontend lockfile does not resolve TypeScript");
if(backendTypeScript!==frontendTypeScript)fail("RISK_SHADOW_TYPESCRIPT_VERSION_MISMATCH",`backend ${backendTypeScript} != frontend ${frontendTypeScript}`);
let ts;
try{ts=require("typescript");}catch(error){fail("RISK_SHADOW_TYPESCRIPT_MISSING",`TypeScript ${backendTypeScript} is not installed for the backend harness`,error);}
if(ts.version!==backendTypeScript)fail("RISK_SHADOW_TYPESCRIPT_VERSION_MISMATCH",`installed ${ts.version} != locked ${backendTypeScript}`);
const previewSourcePath=path.join(root,"frontend/src/lib/personalRiskShadowPreview.ts");
let previewSource;
try{previewSource=fs.readFileSync(previewSourcePath);}catch(error){fail("RISK_SHADOW_SOURCE_UNREADABLE",`cannot read ${previewSourcePath}`,error);}
const previewSourceSha256=crypto.createHash("sha256").update(previewSource).digest("hex");
// transpileModule executes the exact checked-out TypeScript bytes but does not type-check them;
// the separate frontend production-build job supplies full TypeScript type-checking.
const transpiled=ts.transpileModule(previewSource.toString("utf8"),{fileName:previewSourcePath,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const diagnostics=(transpiled.diagnostics||[]).filter(item=>item.category===ts.DiagnosticCategory.Error);
if(diagnostics.length)fail("RISK_SHADOW_TRANSPILATION_DIAGNOSTICS",diagnostics.map(item=>ts.flattenDiagnosticMessageText(item.messageText," ")).join(" | "));
const previewModule={exports:{}};
try{new Function("exports","require","module","__filename","__dirname",transpiled.outputText)(previewModule.exports,require,previewModule,previewSourcePath,path.dirname(previewSourcePath));}
catch(error){fail("RISK_SHADOW_TRANSPILED_SOURCE_FAILED",`compiled source ${previewSourceSha256} could not be evaluated`,error);}
const personalRiskShadowPreview=previewModule.exports.personalRiskShadowPreview;
if(typeof personalRiskShadowPreview!=="function")fail("RISK_SHADOW_EXPORT_MISSING","personalRiskShadowPreview is not a function export");
readStatus();
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
let fieldAssertions=0;
for(const item of oracle){
 const preview=personalRiskShadowPreview(item.input);
 assert.equal(preview.kind,"SHADOW_PREVIEW",`${item.name}:kind`);
 for(const field of fields){assert.equal(preview.calculation[field],item.calculation[field],`${item.name}:${field}`);fieldAssertions+=1;}
 if(listOnly)console.log(`ASSERTED shadow parity fixture: ${item.name}`);
}
assert.equal(fieldAssertions,oracle.length*fields.length,"every canonical fixture field must be asserted exactly once");
if(listOnly){
 console.log(`COLLECTION shadow parity: ${oracle.length} fixture cases and ${fieldAssertions} canonical field comparisons executed in-process from source SHA-256 ${previewSourceSha256}.`);
}else{
 console.log(`PASS shadow parity: ${oracle.length} synthetic trade shapes match all 12 canonical database calculation fields using checked-out source SHA-256 ${previewSourceSha256}.`);
 assert.equal(counts(),before,"parity harness must not create durable lifecycle rows");
 const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260919120000_008_personal_risk_lifecycle.sql"),"utf8");
 assert.match(migration,/personal_risk_evaluations_calculation_shape[\s\S]*rejection_code='MISSING_PROTECTIVE_STOP'[\s\S]*num_nonnulls\(modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value\)=0/);
 const rpcTest=fs.readFileSync(path.join(__dirname,"testRiskLifecycleRpc.js"),"utf8");
 assert.match(rpcTest,/modeled_sell_proceeds is null and close_commission is null and slippage_amount is null and raw_planned_loss is null and planned_loss_contribution is null/);
 console.log("PASS shadow parity structural check: verified the Migration 008 constraint text and existing RPC test assertion for missing-stop nullability; this parity run did not execute the missing-stop RPC.");
 console.log("PASS shadow parity persistence check: all lifecycle table counts are unchanged.");
}
