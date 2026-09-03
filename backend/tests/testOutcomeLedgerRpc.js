"use strict";
const assert = require("node:assert/strict");
const { readStatus, request, sql } = require("./helpers/localSupabase");

const PASSWORD="azalens-local-ledger-rpc-password"; const RUN=Date.now();
async function main(){
  const {apiUrl,publishableKey,secretKey}=readStatus();
  const admin=(path,options={})=>request(`${apiUrl}${path}`,{apikey:secretKey,token:secretKey,...options});
  const rest=(path,token,options={})=>request(`${apiUrl}/rest/v1${path}`,{apikey:publishableKey,token,...options});
  const email=`ledger-rpc-${RUN}@azalens.test`; let userId;
  const made=await admin("/auth/v1/admin/users",{method:"POST",body:{email,password:PASSWORD,email_confirm:true}});
  assert.equal(made.status,200); userId=made.body.id;
  const login=await request(`${apiUrl}/auth/v1/token?grant_type=password`,{apikey:publishableKey,method:"POST",body:{email,password:PASSWORD}});
  assert.equal(login.status,200); const token=login.body.access_token;
  let serial=10;
  const uuid=()=>`20000000-0000-4000-8000-${String(serial++).padStart(12,"0")}`;
  const provenance=[
    {capability:"QUOTE",provider:"Finnhub",state:"REALTIME_CONSOLIDATION_UNVERIFIED",underlying_state:"REALTIME_CONSOLIDATION_UNVERIFIED",source_timestamp:"2026-09-03T00:00:00Z",retrieval_timestamp:"2026-09-03T00:00:01Z",cache_state:"MISS",cache_age_seconds:null,interval:null,display_entitlement:"PRIVATE_PERSONAL_OWNER_ONLY",broker_verification_required:true,limitation_codes:["CONSOLIDATION_UNVERIFIED","BROKER_VERIFICATION_REQUIRED"]},
    {capability:"HISTORY",provider:"TwelveData",state:"EOD_CONSOLIDATED",underlying_state:"EOD_CONSOLIDATED",source_timestamp:"2026-09-02T00:00:00Z",retrieval_timestamp:"2026-09-03T00:00:01Z",cache_state:"MISS",cache_age_seconds:null,interval:"1day",display_entitlement:"NON_DISPLAY_DERIVED_ANALYTICS_ONLY",broker_verification_required:true,limitation_codes:["NON_RECONSTRUCTIVE_ANALYTICS_ONLY","BROKER_VERIFICATION_REQUIRED"]}
  ];
  const createBody=(key,symbol="AAPL",extra={})=>({p_idempotency_key:key,p_symbol:symbol,p_market:"US",p_currency:extra.currency||"USD",p_analysis_contract_version:"test-v1",p_analysis_created_at:"2026-09-03T00:00:00Z",p_thesis_text:"Fixture thesis",p_invalidation_condition:"Fixture invalidation",p_planned_horizon:"swing",p_intended_invalidation_price:null,p_intended_target_price:null,p_maximum_planned_loss:null,p_risk_percentage:null,p_risk_limit_version_id:null,p_public_direction:"BULLISH",p_public_evidence_state:"SUPPORTIVE",p_public_risk_classification:"UNKNOWN",p_shariah_state:"COMPLIANT",p_provenance:extra.provenance||provenance,p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T01:00:00Z",p_entry_price:extra.price||"100.00000000",p_entry_quantity:extra.quantity||"10.00000000",p_fees:extra.fees??"10.00000000",p_taxes:extra.taxes??"0"});
  const create=(body)=>rest("/rpc/create_outcome_position",token,{method:"POST",body});
  const append=(body)=>rest("/rpc/append_outcome_position_event",token,{method:"POST",body});
  try {
    const key=uuid(); const first=await create(createBody(key)); assert.equal(first.status,200,JSON.stringify(first.body));
    assert.equal(first.body[0].replayed,false); const positionId=first.body[0].position_id;
    const replay=await create(createBody(key)); assert.equal(replay.status,200); assert.equal(replay.body[0].replayed,true); assert.equal(replay.body[0].position_id,positionId);
    const conflict=await create(createBody(key,"MSFT")); assert.ok(!conflict.ok); assert.match(JSON.stringify(conflict.body),/idempotency conflict/i);
    const nullShiftKey=uuid(); const nullShift=createBody(nullShiftKey,"NULL"); nullShift.p_intended_invalidation_price="10";
    assert.equal((await create(nullShift)).status,200);
    const shifted={...nullShift,p_intended_invalidation_price:null,p_intended_target_price:"10"};
    assert.match(JSON.stringify((await create(shifted)).body),/idempotency conflict/i);
    const delimiterKey=uuid(); const delimiter=createBody(delimiterKey,"PIPE"); delimiter.p_thesis_text="a|b";
    assert.equal((await create(delimiter)).status,200);
    assert.match(JSON.stringify((await create({...delimiter,p_thesis_text:"a",p_invalidation_condition:"b|Fixture invalidation"})).body),/idempotency conflict/i);
    assert.equal(sql(`select count(*) from public.outcome_positions where id='${positionId}'`),"1");

    const partialKey=uuid(); const partialBody={p_position_id:positionId,p_idempotency_key:partialKey,p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-04T00:00:00Z",p_price:"120",p_quantity:"4",p_fees:"2",p_taxes:"1",p_thesis_result:"VALID",p_usefulness:"USEFUL",p_exit_reason:"Owner fixture exit"};
    const partial=await append(partialBody); assert.equal(partial.status,200,JSON.stringify(partial.body));
    assert.equal(partial.body[0].open_quantity,6); assert.equal(partial.body[0].realized_pl,73);
    assert.ok(Math.abs(Number(partial.body[0].realized_return_pct)-18.069306930693)<1e-10);
    const partialReplay=await append(partialBody); assert.equal(partialReplay.body[0].replayed,true);
    const partialConflict=await append({...partialBody,p_quantity:"3"}); assert.ok(!partialConflict.ok); assert.match(JSON.stringify(partialConflict.body),/idempotency conflict/i);

    const over=await append({...partialBody,p_idempotency_key:uuid(),p_quantity:"7"}); assert.ok(!over.ok); assert.match(JSON.stringify(over.body),/exceeds open quantity/i);
    const outOfOrder=await append({...partialBody,p_idempotency_key:uuid(),p_broker_effective_at:"2026-09-02T00:00:00Z",p_quantity:"1"}); assert.ok(!outOfOrder.ok); assert.match(JSON.stringify(outOfOrder.body),/out of order/i);
    const final=await append({...partialBody,p_idempotency_key:uuid(),p_event_type:"FINAL_EXIT_CONFIRMED",p_price:"90",p_quantity:"6",p_fees:"3",p_taxes:"2",p_thesis_result:"MIXED",p_usefulness:"PARTLY_USEFUL"});
    assert.equal(final.status,200,JSON.stringify(final.body)); assert.equal(final.body[0].open_quantity,0); assert.equal(final.body[0].realized_pl,2); assert.ok(Math.abs(Number(final.body[0].realized_return_pct)-0.198019801980198)<1e-12);
    const lateReplay=await append(partialBody); assert.equal(lateReplay.body[0].replayed,true);
    assert.deepEqual(lateReplay.body[0],partialReplay.body[0],"later state must not alter the original replay result");
    const simultaneousReplay=await Promise.all([append(partialBody),append(partialBody)]);
    assert.ok(simultaneousReplay.every(r=>r.ok&&r.body[0].replayed));
    assert.deepEqual(simultaneousReplay[0].body[0],simultaneousReplay[1].body[0]);
    const afterClose=await append({...partialBody,p_idempotency_key:uuid(),p_quantity:"1"}); assert.ok(!afterClose.ok); assert.match(JSON.stringify(afterClose.body),/already closed/i);

    const raceCreate=await create(createBody(uuid(),"RACE")); const raceId=raceCreate.body[0].position_id;
    const race=await Promise.all(["6","6"].map((quantity)=>append({p_position_id:raceId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-04T00:00:00Z",p_price:"101",p_quantity:quantity,p_fees:"0",p_taxes:"0"})));
    assert.equal(race.filter(r=>r.ok).length,1,"row lock must prevent concurrent oversell");
    assert.equal(sql(`select sum(quantity) from public.outcome_position_events where position_id='${raceId}' and event_type like '%EXIT%'`),"6.00000000");

    const finalRaceCreate=await create(createBody(uuid(),"FINL")); const finalRaceId=finalRaceCreate.body[0].position_id;
    const finalRace=await Promise.all([uuid(),uuid()].map((key)=>append({p_position_id:finalRaceId,p_idempotency_key:key,p_event_type:"FINAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-04T00:00:00Z",p_price:"101",p_quantity:"10",p_fees:"0",p_taxes:"0"})));
    assert.equal(finalRace.filter(r=>r.ok).length,1,"exactly one concurrent final close may commit");
    assert.equal(sql(`select count(*) from public.outcome_position_events where position_id='${finalRaceId}' and event_type='FINAL_EXIT_CONFIRMED'`),"1");

    const rawKey=uuid(); const raw=await create(createBody(rawKey,"RAW",{provenance:[{...provenance[1],close:"987654.12345678"}]}));
    assert.ok(!raw.ok); assert.match(JSON.stringify(raw.body),/not storable|invalid provenance/i);
    const nestedRaw=await create(createBody(uuid(),"NEST",{provenance:[provenance[0],{...provenance[1],payload:{renamed:"987654.12345678"}}]})); assert.ok(!nestedRaw.ok);
    const attacks=[
      {...provenance[1],limitation_codes:["987654.1|987655.2"]},
      {...provenance[1],limitation_codes:["PHN2Pjk4NzY1NC4xPC92Pg=="]},
      {...provenance[1],limitation_codes:["<v>987654.1</v>"]},
      {...provenance[1],provider:"Finnhub"},
      {...provenance[1],state:"REALTIME_LIMITED_VENUE"},
      {...provenance[1],underlying_state:"REALTIME_LIMITED_VENUE"},
      {...provenance[1],display_entitlement:"PRIVATE_PERSONAL_OWNER_ONLY"},
    ];
    for(const [index,attack] of attacks.entries()) assert.ok(!(await create(createBody(uuid(),`X${index}`,{provenance:[provenance[0],attack]}))).ok);
    const unavailable={capability:"HISTORY",provider:"Unknown",state:"UNAVAILABLE",underlying_state:"UNAVAILABLE",source_timestamp:null,retrieval_timestamp:"2026-09-03T00:00:01Z",cache_state:"UNAVAILABLE",cache_age_seconds:null,interval:"1day",display_entitlement:"NON_DISPLAY_NOT_ACTIVATED",broker_verification_required:true,limitation_codes:["PROVIDER_UNAVAILABLE"]};
    assert.equal((await create(createBody(uuid(),"UNAV",{provenance:[provenance[0],unavailable]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"UTIM",{provenance:[provenance[0],{...unavailable,source_timestamp:"2026-09-02T00:00:00Z"}]}))).ok);
    const cachedQuote={...provenance[0],state:"CACHE",cache_state:"HIT",cache_age_seconds:30,limitation_codes:[...provenance[0].limitation_codes,"CACHE_DERIVED"]};
    const cachedHistory={...provenance[1],state:"CACHE",cache_state:"COALESCED",cache_age_seconds:1,limitation_codes:[...provenance[1].limitation_codes,"CACHE_DERIVED"]};
    assert.equal((await create(createBody(uuid(),"CACH",{provenance:[cachedQuote,cachedHistory]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"CAGE",{provenance:[{...cachedQuote,cache_age_seconds:null},cachedHistory]}))).ok);
    assert.ok(!(await create(createBody(uuid(),"MISS",{provenance:[{...provenance[0],cache_age_seconds:1},provenance[1]]}))).ok);
    assert.ok(!(await create(createBody(uuid(),"NBBO",{provenance:[{...provenance[0],state:"REALTIME_LIMITED_VENUE"},provenance[1]]}))).ok);
    const noteNumeric=await append({p_position_id:raceId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_price:"987654.12345678",p_owner_note:"legitimate bounded owner prose"});
    assert.ok(!noteNumeric.ok,"non-execution events cannot carry numeric observations");
    const hiddenNumeric=await append({p_position_id:raceId,p_idempotency_key:uuid(),p_event_type:"HIDDEN_BY_OWNER",p_quantity:"1"}); assert.ok(!hiddenNumeric.ok);
    const zero=await create(createBody(uuid(),"ZERO",{price:"0"})); assert.ok(!zero.ok);
    const forged=await rest("/rpc/create_outcome_position",token,{method:"POST",body:{...createBody(uuid(),"FORG"),p_user_id:"00000000-0000-4000-8000-000000000999"}}); assert.ok([400,404].includes(forged.status));

    const eur=await create(createBody(uuid(),"SAP",{currency:"EUR",price:"123.45678901",quantity:"0.12345678",fees:"0"})); assert.equal(eur.status,200);
    assert.equal(sql(`select currency from public.outcome_positions where id='${eur.body[0].position_id}'`),"EUR");
    assert.equal(sql(`select price::text||'|'||quantity::text from public.outcome_position_events where position_id='${eur.body[0].position_id}' and sequence_no=1`),"123.45678901|0.12345678");

    const min=await create(createBody(uuid(),"MINI",{price:"0.00000001",quantity:"0.00000001",fees:"0"})); assert.equal(min.status,200);
    const overflow=await create(createBody(uuid(),"OVFL",{price:"10000000000000000",quantity:"1",fees:"0"})); assert.ok(!overflow.ok);
    const repeat=await create(createBody(uuid(),"REPT",{quantity:"3",fees:"1"})); const repeatId=repeat.body[0].position_id;
    const repeatOne=await append({p_position_id:repeatId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-04T00:00:00Z",p_price:"100",p_quantity:"1",p_fees:"0",p_taxes:"0"});
    assert.equal(repeatOne.status,200); assert.match(String(repeatOne.body[0].realized_pl),/^-0\.333333/);
    const repeatFinal=await append({p_position_id:repeatId,p_idempotency_key:uuid(),p_event_type:"FINAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-05T00:00:00Z",p_price:"100",p_quantity:"2",p_fees:"0",p_taxes:"0"});
    assert.equal(Number(repeatFinal.body[0].realized_pl),-1);

    const feeTaxKey=uuid(); const feeTaxBase={p_position_id:raceId,p_idempotency_key:feeTaxKey,p_event_type:"OWNER_NOTE",p_owner_note:"fee-tax fingerprint",p_fees:null,p_taxes:null};
    assert.equal((await append(feeTaxBase)).status,200);
    const feeTaxConflict=await append({...feeTaxBase,p_fees:"1",p_taxes:null}); assert.match(JSON.stringify(feeTaxConflict.body),/idempotency conflict/i);
    const concurrentKey=uuid(); const concurrentBody=createBody(concurrentKey,"CONC");
    const concurrent=await Promise.all([create(concurrentBody),create({...concurrentBody,p_fees:"1",p_taxes:null})]);
    assert.equal(concurrent.filter(r=>r.ok).length,1); assert.match(JSON.stringify(concurrent.find(r=>!r.ok).body),/idempotency conflict/i);

    const limit=await rest("/rpc/create_personal_risk_limit_version",token,{method:"POST",body:{p_base_currency:"USD",p_max_planned_loss_amount:null,p_max_planned_loss_pct:null,p_max_position_exposure_pct:null,p_max_symbol_concentration_pct:null,p_max_open_positions:null,p_max_daily_realized_loss:null,p_max_weekly_realized_loss:null,p_missing_invalidation_action:"WARN",p_stale_quote_action:"BLOCK"}});
    assert.equal(limit.status,200); assert.equal(limit.body.base_currency||limit.body[0]?.base_currency,"USD");

    console.log("Outcome ledger atomic RPC, idempotency, arithmetic, concurrency and storage-boundary contracts passed.");
  } finally { if(userId) await admin(`/auth/v1/admin/users/${userId}`,{method:"DELETE"}); }
}
main().catch((error)=>{console.error(error);process.exit(1);});
