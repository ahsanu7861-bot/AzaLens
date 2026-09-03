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
    {capability:"QUOTE",provider:"Finnhub",source_observation:"REALTIME",venue_scope:"CONSOLIDATION_UNVERIFIED",interval:null,observed_at:"2026-09-03T00:00:00Z",delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:01Z",original_retrieved_at:"2026-09-03T00:00:01Z",age_seconds:0,freshness_threshold_seconds:20,usable:true,entitlement_display:"PERMITTED_PRIVATE",entitlement_analysis:"PERMITTED_NON_RECONSTRUCTIVE",entitlement_storage:"PERMITTED_DERIVED_ONLY",entitlement_attribution:"NOT_REQUIRED_PRIVATE",entitlement_authority:"PLAN_DOCUMENTATION",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"plan:private-owner-2026-09",limitation_codes:["BROKER_VERIFICATION_REQUIRED","CONSOLIDATION_UNVERIFIED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]},
    {capability:"HISTORY",provider:"TwelveData",source_observation:"EOD",venue_scope:"UNKNOWN",interval:"1day",observed_at:"2026-09-02T00:00:00Z",delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:01Z",original_retrieved_at:"2026-09-03T00:00:01Z",age_seconds:0,freshness_threshold_seconds:86400,usable:true,entitlement_display:"PROHIBITED",entitlement_analysis:"PERMITTED_NON_RECONSTRUCTIVE",entitlement_storage:"PERMITTED_DERIVED_ONLY",entitlement_attribution:"UNRESOLVED",entitlement_authority:"UNKNOWN",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"legal-review:twelve-data-basic",limitation_codes:["DISPLAY_PROHIBITED","ENTITLEMENT_UNRESOLVED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]}
  ];
  const createBody=(key,symbol="AAPL",extra={})=>({p_idempotency_key:key,p_symbol:symbol,p_market:"US",p_currency:extra.currency||"USD",p_analysis_contract_version:"test-v1",p_analysis_created_at:"2026-09-03T00:00:00Z",p_thesis_text:"Fixture thesis",p_invalidation_condition:"Fixture invalidation",p_planned_horizon:"swing",p_intended_invalidation_price:null,p_intended_target_price:null,p_maximum_planned_loss:null,p_risk_percentage:null,p_public_direction:"BULLISH",p_public_evidence_state:"SUPPORTIVE",p_public_risk_classification:"UNKNOWN",p_shariah_state:"COMPLIANT",p_provenance:extra.provenance||provenance,p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T01:00:00Z",p_entry_price:extra.price||"100.00000000",p_entry_quantity:extra.quantity||"10.00000000",p_fees:extra.fees??"10.00000000",p_taxes:extra.taxes??"0"});
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
    const orderKey=uuid(); const ordered=createBody(orderKey,"ORDR");
    assert.equal((await create(ordered)).status,200);
    const reordered={...ordered,p_provenance:[
      {...provenance[1],limitation_codes:[...provenance[1].limitation_codes].reverse()},
      {...provenance[0],limitation_codes:[...provenance[0].limitation_codes].reverse()},
    ]};
    const orderReplay=await create(reordered); assert.equal(orderReplay.status,200); assert.equal(orderReplay.body[0].replayed,true);
    assert.equal(sql(`select string_agg(array_to_string(limitation_codes,','),'|' order by capability) from public.outcome_snapshot_provenance where snapshot_id='${orderReplay.body[0].snapshot_id}'`),"DISPLAY_PROHIBITED,ENTITLEMENT_UNRESOLVED,NON_RECONSTRUCTIVE_ANALYTICS_ONLY,RAW_STORAGE_PROHIBITED|BROKER_VERIFICATION_REQUIRED,CONSOLIDATION_UNVERIFIED,NON_RECONSTRUCTIVE_ANALYTICS_ONLY,RAW_STORAGE_PROHIBITED");
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
      {...provenance[1],delivery_state:"MISS",age_seconds:1},
      {...provenance[1],delivery_state:"HIT",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:2},
      {...provenance[1],delivery_state:"HIT",usable:false},
      {...provenance[1],source_observation:"UNAVAILABLE",observed_at:null,usable:true},
      {...provenance[1],entitlement_assessed_at:"2026-09-03T00:00:02Z"},
      {...provenance[1],venue_scope:"CONSOLIDATED_VERIFIED",entitlement_authority:"UNKNOWN",authority_reference:"unknown"},
      {...provenance[1],limitation_codes:[...provenance[1].limitation_codes,"SOURCE_UNAVAILABLE"]},
      {...provenance[1],limitation_codes:provenance[1].limitation_codes.slice(1)},
      {...provenance[1],limitation_codes:[...provenance[1].limitation_codes,provenance[1].limitation_codes[0]]},
    ];
    for(const [index,attack] of attacks.entries()) assert.ok(!(await create(createBody(uuid(),`X${index}`,{provenance:[provenance[0],attack]}))).ok);
    const unavailable={capability:"HISTORY",provider:"UnavailableSource",source_observation:"UNAVAILABLE",venue_scope:"UNKNOWN",interval:"1day",observed_at:null,delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:01Z",original_retrieved_at:"2026-09-03T00:00:01Z",age_seconds:0,freshness_threshold_seconds:86400,usable:false,entitlement_display:"UNRESOLVED",entitlement_analysis:"UNRESOLVED",entitlement_storage:"UNRESOLVED",entitlement_attribution:"UNRESOLVED",entitlement_authority:"UNKNOWN",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"unknown",limitation_codes:["ENTITLEMENT_UNRESOLVED","SOURCE_UNAVAILABLE"]};
    assert.equal((await create(createBody(uuid(),"UNAV",{provenance:[provenance[0],unavailable]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"UTIM",{provenance:[provenance[0],{...unavailable,observed_at:"2026-09-02T00:00:00Z"}]}))).ok);
    const cachedQuote={...provenance[0],delivery_state:"HIT",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:1};
    const cachedHistory={...provenance[1],delivery_state:"COALESCED",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:1};
    assert.equal((await create(createBody(uuid(),"CACH",{provenance:[cachedQuote,cachedHistory]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"OLDQ",{provenance:[{...cachedQuote,age_seconds:21},cachedHistory]}))).ok,"aged realtime cannot remain realtime");
    const expired={...unavailable,delivery_state:"EXPIRED_REJECTED",original_retrieved_at:"2026-09-02T00:00:01Z",age_seconds:86400,limitation_codes:["ENTITLEMENT_UNRESOLVED","EXPIRED_REJECTED","SOURCE_UNAVAILABLE"]};
    assert.equal((await create(createBody(uuid(),"EXPD",{provenance:[provenance[0],expired]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"EXPU",{provenance:[provenance[0],{...expired,usable:true}]}))).ok);
    const alternate=[{...provenance[0],provider:"QuoteProviderTwo"},{...provenance[1],provider:"HistoryProviderTwo"}];
    assert.equal((await create(createBody(uuid(),"NEUT",{provenance:alternate}))).status,200,"provider names are factual, not capability allowlists");
    const consolidated={...provenance[1],provider:"ArchiveFeed",venue_scope:"CONSOLIDATED_VERIFIED",entitlement_authority:"PUBLISHED_TERMS",authority_reference:"terms:archive-feed-2026-09",limitation_codes:provenance[1].limitation_codes};
    assert.equal((await create(createBody(uuid(),"CONS",{provenance:[{...provenance[0],provider:"MarketFeed"},consolidated]}))).status,200);
    const closed={...provenance[0],source_observation:"MARKET_CLOSED",venue_scope:"UNKNOWN",delivery_state:"HIT",original_retrieved_at:"2026-09-02T23:43:22Z",age_seconds:999,limitation_codes:["BROKER_VERIFICATION_REQUIRED","MARKET_CLOSED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]};
    assert.equal((await create(createBody(uuid(),"CLSD",{provenance:[closed,provenance[1]]}))).status,200,"market closed is context, not freshness");
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

    console.log("Outcome ledger atomic RPC, idempotency, arithmetic, concurrency and storage-boundary contracts passed.");
  } finally { if(userId) await admin(`/auth/v1/admin/users/${userId}`,{method:"DELETE"}); }
}
main().catch((error)=>{console.error(error);process.exit(1);});
