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
    {capability:"HISTORY",provider:"TwelveData",source_observation:"EOD",venue_scope:"UNKNOWN",interval:"1day",observed_at:"2026-09-02T00:00:00Z",delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:01Z",original_retrieved_at:"2026-09-03T00:00:01Z",age_seconds:0,freshness_threshold_seconds:86400,usable:true,entitlement_display:"PROHIBITED",entitlement_analysis:"PERMITTED_NON_RECONSTRUCTIVE",entitlement_storage:"PERMITTED_DERIVED_ONLY",entitlement_attribution:"UNRESOLVED",entitlement_authority:"PUBLISHED_TERMS",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"terms:history-basic-2026-09",limitation_codes:["DISPLAY_PROHIBITED","ENTITLEMENT_UNRESOLVED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]}
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

    const partialKey=uuid(); const partialBody={p_position_id:positionId,p_idempotency_key:partialKey,p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"120",p_quantity:"4",p_fees:"2",p_taxes:"1",p_thesis_result:"VALID",p_usefulness:"USEFUL",p_exit_reason:"Owner fixture exit"};
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
    const race=await Promise.all(["6","6"].map((quantity)=>append({p_position_id:raceId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"101",p_quantity:quantity,p_fees:"0",p_taxes:"0"})));
    assert.equal(race.filter(r=>r.ok).length,1,"row lock must prevent concurrent oversell");
    assert.equal(sql(`select sum(quantity) from public.outcome_position_events where position_id='${raceId}' and event_type like '%EXIT%'`),"6.00000000");

    const finalRaceCreate=await create(createBody(uuid(),"FINL")); const finalRaceId=finalRaceCreate.body[0].position_id;
    const finalRace=await Promise.all([uuid(),uuid()].map((key)=>append({p_position_id:finalRaceId,p_idempotency_key:key,p_event_type:"FINAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"101",p_quantity:"10",p_fees:"0",p_taxes:"0"})));
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
    assert.ok(!(await create(createBody(uuid(),"OLDQ",{provenance:[{...cachedQuote,observed_at:"2026-09-02T17:30:00Z",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:1},cachedHistory]}))).ok,"aged realtime observation cannot remain realtime");
    const expired={...unavailable,delivery_state:"EXPIRED_REJECTED",original_retrieved_at:"2026-09-02T00:00:01Z",age_seconds:86400,limitation_codes:["ENTITLEMENT_UNRESOLVED","EXPIRED_REJECTED","SOURCE_UNAVAILABLE"]};
    assert.equal((await create(createBody(uuid(),"EXPD",{provenance:[provenance[0],expired]}))).status,200);
    assert.ok(!(await create(createBody(uuid(),"EXPU",{provenance:[provenance[0],{...expired,usable:true}]}))).ok);
    const alternate=[{...provenance[0],provider:"QuoteProviderTwo"},{...provenance[1],provider:"HistoryProviderTwo"}];
    assert.equal((await create(createBody(uuid(),"NEUT",{provenance:alternate}))).status,200,"provider names are factual, not capability allowlists");
    const consolidated={...provenance[1],provider:"ArchiveFeed",venue_scope:"CONSOLIDATED_VERIFIED",entitlement_authority:"PUBLISHED_TERMS",authority_reference:"terms:archive-feed-2026-09",limitation_codes:provenance[1].limitation_codes};
    assert.equal((await create(createBody(uuid(),"CONS",{provenance:[{...provenance[0],provider:"MarketFeed"},consolidated]}))).status,200);
    const closedCodes=["BROKER_VERIFICATION_REQUIRED","MARKET_CLOSED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"];
    const closedIncoherent={...provenance[0],source_observation:"MARKET_CLOSED",venue_scope:"UNKNOWN",delivery_state:"HIT",original_retrieved_at:"2026-09-02T23:43:22Z",age_seconds:999,limitation_codes:closedCodes};
    assert.ok(!(await create(createBody(uuid(),"CLSI",{provenance:[closedIncoherent,provenance[1]]}))).ok,"observation may not post-date the original retrieval");
    const closed={...closedIncoherent,observed_at:"2026-09-02T22:00:00Z"};
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
    const repeatOne=await append({p_position_id:repeatId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"100",p_quantity:"1",p_fees:"0",p_taxes:"0"});
    assert.equal(repeatOne.status,200); assert.match(String(repeatOne.body[0].realized_pl),/^-0\.333333/);
    const repeatFinal=await append({p_position_id:repeatId,p_idempotency_key:uuid(),p_event_type:"FINAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T03:00:00Z",p_price:"100",p_quantity:"2",p_fees:"0",p_taxes:"0"});
    assert.equal(Number(repeatFinal.body[0].realized_pl),-1);

    const feeTaxKey=uuid(); const feeTaxBase={p_position_id:raceId,p_idempotency_key:feeTaxKey,p_event_type:"OWNER_NOTE",p_owner_note:"fee-tax fingerprint",p_fees:null,p_taxes:null};
    assert.equal((await append(feeTaxBase)).status,200);
    // Re-sending the same note key with a fee attached no longer reaches the
    // fingerprint at all: G-3 refuses the execution field first. The fee/tax
    // fingerprint sensitivity this line used to prove is proved below on an
    // execution event, where fees and taxes are legitimate inputs.
    const feeTaxConflict=await append({...feeTaxBase,p_fees:"1",p_taxes:null});
    assert.ok(!feeTaxConflict.ok); assert.match(JSON.stringify(feeTaxConflict.body),/execution field not permitted on non-execution event: fees/i);
    const execFeeKey=uuid(); const execFeeBase={p_position_id:raceId,p_idempotency_key:execFeeKey,p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T03:00:00Z",p_price:"101",p_quantity:"1",p_fees:"0",p_taxes:"0"};
    assert.equal((await append(execFeeBase)).status,200);
    assert.equal((await append(execFeeBase)).body[0].replayed,true);
    assert.match(JSON.stringify((await append({...execFeeBase,p_fees:"1"})).body),/idempotency conflict/i,"fees are fingerprinted");
    assert.match(JSON.stringify((await append({...execFeeBase,p_taxes:"1"})).body),/idempotency conflict/i,"taxes are fingerprinted");
    const concurrentKey=uuid(); const concurrentBody=createBody(concurrentKey,"CONC");
    const concurrent=await Promise.all([create(concurrentBody),create({...concurrentBody,p_fees:"1",p_taxes:null})]);
    assert.equal(concurrent.filter(r=>r.ok).length,1); assert.match(JSON.stringify(concurrent.find(r=>!r.ok).body),/idempotency conflict/i);


    // ==========================================================================
    // H-1  Temporal ordering: observed_at <= original_retrieved_at <= retrieved_at
    // ==========================================================================
    const q=(over)=>({...provenance[0],...over});
    const pairQ=(over)=>[q(over),provenance[1]];
    const acceptQ=async(label,over)=>assert.equal((await create(createBody(uuid(),label,{provenance:pairQ(over)}))).status,200,`${label} must be accepted`);
    const rejectQ=async(label,over)=>assert.ok(!(await create(createBody(uuid(),label,{provenance:pairQ(over)}))).ok,`${label} must be rejected`);

    // observed_at strictly before the original retrieval
    await acceptQ("T1",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:01Z",retrieved_at:"2026-09-03T00:00:01Z",delivery_state:"MISS",age_seconds:0});
    // observed_at exactly equal to the original retrieval
    await acceptQ("T2",{observed_at:"2026-09-03T00:00:01Z",original_retrieved_at:"2026-09-03T00:00:01Z",retrieved_at:"2026-09-03T00:00:01Z",delivery_state:"MISS",age_seconds:0});
    // observed_at one microsecond after the original retrieval
    await rejectQ("T3",{observed_at:"2026-09-03T00:00:01.000001Z",original_retrieved_at:"2026-09-03T00:00:01Z",retrieved_at:"2026-09-03T00:00:11Z",delivery_state:"HIT",age_seconds:10});
    // original retrieval after the current retrieval
    await rejectQ("T4",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:20Z",retrieved_at:"2026-09-03T00:00:10Z",delivery_state:"HIT",age_seconds:-10});
    // assessed_at after retrieval
    await rejectQ("T5",{entitlement_assessed_at:"2026-09-03T00:00:02Z"});
    // equivalent valid MISS / HIT / COALESCED timelines
    await acceptQ("T6",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:05Z",delivery_state:"MISS",age_seconds:0});
    await acceptQ("T7",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:15Z",delivery_state:"HIT",age_seconds:10});
    await acceptQ("T8",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:15Z",delivery_state:"COALESCED",age_seconds:10});

    // ==========================================================================
    // H-2  REALTIME freshness is measured from the observation, not the cache
    // ==========================================================================
    // fresh realtime MISS
    await acceptQ("F1",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:10Z",retrieved_at:"2026-09-03T00:00:10Z",delivery_state:"MISS",age_seconds:0,freshness_threshold_seconds:20});
    // 6.5-hour-old realtime MISS against a 20-second threshold: cache age 0 must not save it
    await rejectQ("F2",{observed_at:"2026-09-03T09:30:00Z",original_retrieved_at:"2026-09-03T16:00:00Z",retrieved_at:"2026-09-03T16:00:00Z",delivery_state:"MISS",age_seconds:0,freshness_threshold_seconds:20});
    // realtime HIT inside the threshold
    await acceptQ("F3",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:15Z",delivery_state:"HIT",age_seconds:10,freshness_threshold_seconds:20});
    // realtime HIT outside the threshold
    await rejectQ("F4",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:25Z",delivery_state:"HIT",age_seconds:20,freshness_threshold_seconds:20});
    // exact threshold boundary is inclusive, one second past is not
    await acceptQ("F5",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:10Z",retrieved_at:"2026-09-03T00:00:20Z",delivery_state:"HIT",age_seconds:10,freshness_threshold_seconds:20});
    await rejectQ("F6",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:10Z",retrieved_at:"2026-09-03T00:00:21Z",delivery_state:"HIT",age_seconds:11,freshness_threshold_seconds:20});
    // COALESCED is governed by the same observation-age rule
    await rejectQ("F7",{observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:05Z",retrieved_at:"2026-09-03T00:00:30Z",delivery_state:"COALESCED",age_seconds:25,freshness_threshold_seconds:20});
    // the threshold itself must be present, positive and bounded
    await rejectQ("F8",{freshness_threshold_seconds:0});
    await rejectQ("F9",{freshness_threshold_seconds:604801});
    // a stale realtime observation may only be recorded through the unavailable contract
    await rejectQ("FA",{source_observation:"REALTIME",usable:false});

    // ==========================================================================
    // M-1  Entitlement authority coherence
    // ==========================================================================
    const wholly={entitlement_display:"UNRESOLVED",entitlement_analysis:"UNRESOLVED",entitlement_storage:"UNRESOLVED",entitlement_attribution:"UNRESOLVED",entitlement_authority:"UNKNOWN",authority_reference:"unknown",limitation_codes:["BROKER_VERIFICATION_REQUIRED","CONSOLIDATION_UNVERIFIED","ENTITLEMENT_UNRESOLVED"]};
    await acceptQ("A0",wholly);
    // every affirmative or definitive value must be refused while authority is UNKNOWN
    await rejectQ("A1",{...wholly,entitlement_display:"PERMITTED_PRIVATE"});
    await rejectQ("A2",{...wholly,entitlement_display:"PERMITTED_EXTERNAL"});
    await rejectQ("A3",{...wholly,entitlement_display:"PROHIBITED"});
    await rejectQ("A4",{...wholly,entitlement_analysis:"PERMITTED_NON_RECONSTRUCTIVE"});
    await rejectQ("A5",{...wholly,entitlement_analysis:"PROHIBITED"});
    await rejectQ("A6",{...wholly,entitlement_storage:"PERMITTED_RAW"});
    await rejectQ("A7",{...wholly,entitlement_storage:"PERMITTED_DERIVED_ONLY"});
    await rejectQ("A8",{...wholly,entitlement_storage:"PROHIBITED"});
    await rejectQ("A9",{...wholly,entitlement_attribution:"REQUIRED"});
    await rejectQ("AA",{...wholly,entitlement_attribution:"NOT_REQUIRED_PRIVATE"});
    // each named authority is usable with a scheme-qualified evidence reference
    for (const [label,authority,reference] of [
      ["AB","PUBLISHED_TERMS","terms:venue-2026-09"],
      ["AC","PLAN_DOCUMENTATION","plan:owner-2026-09"],
      ["AD","PROVIDER_CORRESPONDENCE","correspondence:case-4471"],
      ["AE","SEPARATE_AGREEMENT","agreement:msa-2026-01"],
    ]) await acceptQ(label,{entitlement_authority:authority,authority_reference:reference});
    // a named authority may not hide behind a placeholder or an unscheme'd note
    for (const [label,reference] of [["AF","unknown"],["AG","n/a"],["AH","-"],["AI","the terms document"]])
      await rejectQ(label,{entitlement_authority:"PUBLISHED_TERMS",authority_reference:reference});
    // technical access and private containment are not authority values
    await rejectQ("AJ",{...wholly,entitlement_authority:"UNKNOWN",entitlement_display:"PERMITTED_PRIVATE",authority_reference:"api-access-succeeded"});

    // ==========================================================================
    // M-2  Behavioural coverage for the three previously unexercised codes
    // ==========================================================================
    for (const [label,axis,code,expected] of [
      ["C1",{entitlement_attribution:"REQUIRED"},"ATTRIBUTION_REQUIRED",
        ["ATTRIBUTION_REQUIRED","BROKER_VERIFICATION_REQUIRED","CONSOLIDATION_UNVERIFIED","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]],
      ["C2",{venue_scope:"COMPOSITE_INDICATIVE"},"COMPOSITE_INDICATIVE",
        ["BROKER_VERIFICATION_REQUIRED","COMPOSITE_INDICATIVE","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]],
      ["C3",{venue_scope:"LIMITED_VENUE"},"LIMITED_VENUE",
        ["BROKER_VERIFICATION_REQUIRED","LIMITED_VENUE","NON_RECONSTRUCTIVE_ANALYTICS_ONLY","RAW_STORAGE_PROHIBITED"]],
    ]) {
      // the valid axis combination succeeds and stores the exact canonical set
      const okKey=uuid(); const okBody=createBody(okKey,label,{provenance:pairQ({...axis,limitation_codes:expected})});
      const made=await create(okBody); assert.equal(made.status,200,`${label} valid combination must succeed`);
      assert.equal(sql(`select array_to_string(limitation_codes,',') from public.outcome_snapshot_provenance where snapshot_id='${made.body[0].snapshot_id}' and capability='QUOTE'`),expected.join(","),`${label} stores the canonical code set`);
      // reordered equivalent input replays identically and does not create a second record
      const shuffled=await create({...okBody,p_provenance:pairQ({...axis,limitation_codes:[...expected].reverse()})});
      assert.equal(shuffled.status,200); assert.equal(shuffled.body[0].replayed,true,`${label} reordered input must replay`);
      assert.equal(shuffled.body[0].snapshot_id,made.body[0].snapshot_id);
      // omitting the required code is rejected
      await rejectQ(`${label}O`,{...axis,limitation_codes:expected.filter((c)=>c!==code)});
      // duplicating it is rejected
      await rejectQ(`${label}D`,{...axis,limitation_codes:[...expected,code]});
      // asserting it against an incompatible axis combination is rejected
      await rejectQ(`${label}X`,{limitation_codes:[...new Set([...provenance[0].limitation_codes,code])].sort()});
    }


    // ==========================================================================
    // H-3  Precision is validated BEFORE any guard, fingerprint or insert.
    //      Policy: reject values that exceed the destination scale; never round.
    // ==========================================================================
    // Every numeric input of create_outcome_position, at exactly the destination
    // scale (accepted) and one digit beyond it (rejected).
    for (const [label,field,ok,bad] of [
      ["N1","p_entry_price","123.45678901","123.456789012"],
      ["N2","p_entry_quantity","12.34567890","12.345678901"],
      ["N3","p_fees","1.23456789","1.234567891"],
      ["N4","p_taxes","0.00000001","0.000000001"],
      ["N5","p_intended_invalidation_price","90.12345678","90.123456781"],
      ["N6","p_intended_target_price","150.87654321","150.876543211"],
      ["N7","p_maximum_planned_loss","250.00000001","250.000000011"],
      ["N8","p_risk_percentage","1.500000","1.5000001"],
    ]) {
      assert.equal((await create({...createBody(uuid(),label),[field]:ok})).status,200,`${label} ${field} at destination scale must be accepted`);
      const refused=await create({...createBody(uuid(),`${label}B`),[field]:bad});
      assert.ok(!refused.ok,`${label} ${field} beyond destination scale must be rejected`);
      assert.match(JSON.stringify(refused.body),/precision contract/i,`${label} must name the precision contract`);
    }
    // numeric(24,8) range: immediately inside is accepted, the boundary is not.
    assert.equal((await create({...createBody(uuid(),"R1"),p_entry_price:"9999999999999999.99999999"})).status,200,"largest representable price must be accepted");
    assert.ok(!(await create({...createBody(uuid(),"R2"),p_entry_price:"10000000000000000"})).ok,"10^16 must be rejected before insert");
    // minimum positive representable value, and the sign rules of each field.
    assert.equal((await create({...createBody(uuid(),"R3"),p_entry_price:"0.00000001",p_entry_quantity:"0.00000001",p_fees:"0"})).status,200);
    assert.ok(!(await create({...createBody(uuid(),"R4"),p_entry_quantity:"0"})).ok,"zero quantity is not an execution");
    assert.ok(!(await create({...createBody(uuid(),"R5"),p_entry_price:"-1"})).ok,"negative price is rejected");
    assert.ok(!(await create({...createBody(uuid(),"R6"),p_fees:"-1"})).ok,"negative fees are rejected");
    assert.equal((await create({...createBody(uuid(),"R7"),p_fees:"0",p_taxes:"0"})).status,200,"zero fees and taxes are legitimate");

    // Canonicalisation: inputs that STORE identically must FINGERPRINT identically.
    const canonKey=uuid(); const canonBody={...createBody(canonKey,"CANON"),p_entry_price:"100.00000000",p_entry_quantity:"10.00000000",p_fees:"10.00000000",p_taxes:"0"};
    const canonFirst=await create(canonBody); assert.equal(canonFirst.status,200);
    const canonReplay=await create({...canonBody,p_entry_price:"100",p_entry_quantity:"10",p_fees:"10.0",p_taxes:"0.000"});
    assert.equal(canonReplay.status,200,JSON.stringify(canonReplay.body));
    assert.equal(canonReplay.body[0].replayed,true,"trailing-zero variants must canonicalise to one fingerprint");
    assert.equal(canonReplay.body[0].position_id,canonFirst.body[0].position_id);

    // The exact stranding scenario from the review: a 9-decimal partial exit that
    // would round up to the whole remaining quantity. It must be refused outright,
    // and must leave the ledger byte-identical.
    const precisePos=await create(createBody(uuid(),"PREC",{quantity:"10.00000000",fees:"0"}));
    assert.equal(precisePos.status,200); const preciseId=precisePos.body[0].position_id;
    const ledgerState=()=>sql(`select coalesce(sum(quantity),0)::text||'|'||count(*)::text||'|'||coalesce(max(sequence_no),0)::text from public.outcome_position_events where position_id='${preciseId}'`);
    const beforeState=ledgerState();
    for (const [label,body] of [
      ["rounds-up-to-full",{p_quantity:"9.999999999",p_price:"120"}],
      ["nine-decimal-price",{p_quantity:"4",p_price:"120.123456789"}],
      ["nine-decimal-fees",{p_quantity:"4",p_price:"120",p_fees:"0.000000001"}],
      ["nine-decimal-taxes",{p_quantity:"4",p_price:"120",p_taxes:"0.000000001"}],
      ["quantity-out-of-range",{p_quantity:"10000000000000000",p_price:"120"}],
    ]) {
      const refused=await append({p_position_id:preciseId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_fees:"0",p_taxes:"0",...body});
      assert.ok(!refused.ok,`${label} must be refused`);
      assert.equal(ledgerState(),beforeState,`${label} must leave no partial state`);
    }
    assert.equal(beforeState,"10.00000000|1|1","only the entry event exists after every rejection");

    // An exactly-eight-decimal partial exit is accepted, leaves open quantity,
    // and the position remains closable - no stranded zero-open position.
    const preciseExit=await append({p_position_id:preciseId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"120.00000000",p_quantity:"9.99999999",p_fees:"0",p_taxes:"0"});
    assert.equal(preciseExit.status,200,JSON.stringify(preciseExit.body));
    assert.equal(Number(preciseExit.body[0].open_quantity),1e-8,"a partial exit must leave open quantity");
    const preciseClose=await append({p_position_id:preciseId,p_idempotency_key:uuid(),p_event_type:"FINAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T03:00:00Z",p_price:"120.00000000",p_quantity:"0.00000001",p_fees:"0",p_taxes:"0"});
    assert.equal(preciseClose.status,200,JSON.stringify(preciseClose.body));
    assert.equal(Number(preciseClose.body[0].open_quantity),0);
    assert.equal(sql(`select count(*) from public.outcome_position_events where position_id='${preciseId}' and event_type='FINAL_EXIT_CONFIRMED'`),"1","the position closed cleanly rather than stranding");

    // A late idempotent replay after closure still returns the canonical stored result.
    const lateExitReplay=await append({p_position_id:preciseId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"post-close note"});
    assert.ok(!lateExitReplay.ok,"a closed position accepts no further events");

    // ==========================================================================
    // G-1  A coherent but future-dated timeline is refused against recorded_at,
    //      the database-generated insertion instant the caller cannot reach.
    // ==========================================================================
    const pairH=(over)=>[provenance[0],{...provenance[1],...over}];
    const residue=()=>sql(`select (select count(*) from public.outcome_decision_snapshots where user_id='${userId}')||'|'||(select count(*) from public.outcome_snapshot_provenance where user_id='${userId}')||'|'||(select count(*) from public.outcome_positions where user_id='${userId}')||'|'||(select count(*) from public.outcome_position_events where user_id='${userId}')`);

    // A wholly future REALTIME record. Every relative rule is satisfied - the
    // observation is five seconds old at its own retrieval - so only the
    // insertion-instant bound can refuse it.
    await rejectQ("G1a",{observed_at:"2030-01-01T00:00:00Z",original_retrieved_at:"2030-01-01T00:00:05Z",retrieved_at:"2030-01-01T00:00:05Z",delivery_state:"MISS",age_seconds:0,freshness_threshold_seconds:20,entitlement_assessed_at:"2030-01-01T00:00:00Z"});
    // A wholly future EOD record: freshness never applies, so the bound is the
    // only thing standing between the ledger and a fabricated 2030 history bar.
    const futureHistory={observed_at:"2030-01-01T00:00:00Z",original_retrieved_at:"2030-01-01T00:00:01Z",retrieved_at:"2030-01-01T00:00:01Z",delivery_state:"MISS",age_seconds:0,entitlement_assessed_at:"2030-01-01T00:00:00Z"};
    assert.ok(!(await create(createBody(uuid(),"G1B",{provenance:pairH(futureHistory)}))).ok,"a coherent year-2030 EOD record must be rejected");
    // Exactly one future instant among otherwise valid fields.
    const futureGap=Math.floor((Date.parse("2030-01-01T00:00:00Z")-Date.parse("2026-09-03T00:00:00Z"))/1000);
    assert.ok(!(await create(createBody(uuid(),"G1C",{provenance:pairH({observed_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:00Z",retrieved_at:"2030-01-01T00:00:00Z",delivery_state:"HIT",age_seconds:futureGap})}))).ok,"a single future retrieved_at must be rejected");
    // Current and historical records remain valid: only an upper bound exists.
    const observedNow=new Date(Date.now()-70000).toISOString(); const retrievedNow=new Date(Date.now()-60000).toISOString();
    await acceptQ("G1D",{observed_at:observedNow,original_retrieved_at:retrievedNow,retrieved_at:retrievedNow,delivery_state:"MISS",age_seconds:0,freshness_threshold_seconds:120,entitlement_assessed_at:observedNow});
    await acceptQ("G1E",{observed_at:"2020-01-01T00:00:00Z",original_retrieved_at:"2020-01-01T00:00:05Z",retrieved_at:"2020-01-01T00:00:05Z",delivery_state:"MISS",age_seconds:0,freshness_threshold_seconds:20,entitlement_assessed_at:"2020-01-01T00:00:00Z"});
    // The insertion instant is not a caller-supplied field.
    const supplied=await create(createBody(uuid(),"G1F",{provenance:pairH({recorded_at:"2026-09-03T00:00:00Z"})}));
    assert.ok(!supplied.ok); assert.match(JSON.stringify(supplied.body),/not storable/i,"recorded_at must not be reachable through the RPC");
    // A refused future request leaves nothing behind and burns no idempotency key.
    const g1Before=residue(); const g1Key=uuid();
    assert.ok(!(await create(createBody(g1Key,"G1G",{provenance:pairH(futureHistory)}))).ok);
    assert.equal(residue(),g1Before,"a rejected future request must leave no snapshot, provenance, position or event");
    const g1Reused=await create(createBody(g1Key,"G1G"));
    assert.equal(g1Reused.status,200,"a rejected request must not consume the idempotency key");
    assert.equal(g1Reused.body[0].replayed,false);

    // Determinism at the boundary itself. The RPC cannot name recorded_at, so
    // the CHECK is probed directly: equal is accepted, one microsecond past is
    // not. `probe` reports the outcome instead of aborting the session.
    const boundary=await create(createBody(uuid(),"BNDY")); const bndSnapshot=boundary.body[0].snapshot_id;
    const clearHistory=()=>sql(`delete from public.outcome_snapshot_provenance where snapshot_id='${bndSnapshot}' and capability='HISTORY'`);
    const probe=(recordedAt,suppliedAt)=>sql(`create temp table probe(result text); do $probe$ begin insert into public.outcome_snapshot_provenance(snapshot_id,user_id,capability,provider,source_observation,venue_scope,interval,observed_at,delivery_state,retrieved_at,original_retrieved_at,age_seconds,freshness_threshold_seconds,usable,entitlement_display,entitlement_analysis,entitlement_storage,entitlement_attribution,entitlement_authority,entitlement_assessed_at,recorded_at,authority_reference,limitation_codes) values('${bndSnapshot}','${userId}','HISTORY','BoundaryFeed','EOD','UNKNOWN','1day','${suppliedAt}','MISS','${suppliedAt}','${suppliedAt}',0,86400,true,'PROHIBITED','PERMITTED_NON_RECONSTRUCTIVE','PERMITTED_DERIVED_ONLY','UNRESOLVED','PUBLISHED_TERMS','${suppliedAt}','${recordedAt}','terms:boundary-2026-09',array['DISPLAY_PROHIBITED','ENTITLEMENT_UNRESOLVED','NON_RECONSTRUCTIVE_ANALYTICS_ONLY','RAW_STORAGE_PROHIBITED']); insert into probe values('accepted'); exception when others then insert into probe values('rejected:'||sqlstate); end $probe$; select result from probe`);
    clearHistory();
    assert.equal(probe("2026-09-03T00:00:00Z","2026-09-03T00:00:00Z"),"accepted","an instant exactly equal to recorded_at is accepted");
    clearHistory();
    assert.equal(probe("2026-09-03T00:00:00Z","2026-09-03T00:00:00.000001Z"),"rejected:23514","one microsecond past recorded_at is refused by the check constraint");
    clearHistory();

    // Load-bearing: with the bound removed the identical fixture succeeds, so
    // the bound - not some incidental rule - is what refuses the future.
    const boundName="outcome_snapshot_provenance_not_future";
    const boundDef=sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${boundName}'`);
    assert.match(boundDef,/recorded_at/,"the future bound must exist before it can be proved load-bearing");
    sql(`alter table public.outcome_snapshot_provenance drop constraint ${boundName}`);
    const bypassed=await create(createBody(uuid(),"LBRB",{provenance:pairH(futureHistory)}));
    assert.equal(bypassed.status,200,"with the bound dropped the identical future record must succeed");
    sql(`delete from public.outcome_positions where id='${bypassed.body[0].position_id}'`);
    sql(`delete from public.outcome_decision_snapshots where id='${bypassed.body[0].snapshot_id}'`);
    sql(`alter table public.outcome_snapshot_provenance add constraint ${boundName} ${boundDef}`);
    assert.equal(sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${boundName}'`),boundDef,"the bound must be restored identically");
    assert.ok(!(await create(createBody(uuid(),"LBRR",{provenance:pairH(futureHistory)}))).ok,"the restored bound must refuse the future record again");

    // ==========================================================================
    // G-2  Numeric validation and canonicalisation precede every semantic guard,
    //      fingerprint, lock and insert in BOTH RPCs.
    // ==========================================================================
    const g2Before=residue();
    // Each request breaks a semantic rule AND the precision or range contract.
    // The precision error must win, proving validation ran first.
    for (const [label,over] of [
      ["negative and nine-decimal price",{p_entry_price:"-1.000000001"}],
      ["unconfirmed broker and nine-decimal fees",{p_broker_confirmed:false,p_fees:"0.000000001"}],
      ["unconfirmed broker and out-of-range quantity",{p_broker_confirmed:false,p_entry_quantity:"10000000000000000"}],
      ["execution predating the decision with a nine-decimal tax",{p_broker_effective_at:"2026-09-02T00:00:00Z",p_taxes:"0.000000001"}],
      ["null price and seven-decimal risk",{p_entry_price:null,p_risk_percentage:"1.5000001"}],
      ["null price and out-of-range planned loss",{p_entry_price:null,p_maximum_planned_loss:"10000000000000000"}],
    ]) {
      const refused=await create({...createBody(uuid(),"V"),...over});
      assert.ok(!refused.ok,`${label} must be refused`);
      assert.match(JSON.stringify(refused.body),/precision contract/i,`${label} must fail precision before the semantic guard`);
    }
    // Valid canonical values still reach - and still raise - the semantic guards.
    for (const [label,over,expected] of [
      ["unconfirmed broker",{p_broker_confirmed:false},/broker confirmation required/i],
      ["zero price at full scale",{p_entry_price:"0.00000000"},/invalid broker execution/i],
      ["null quantity",{p_entry_quantity:null},/invalid broker execution/i],
      ["execution predating the decision",{p_broker_effective_at:"2026-09-02T00:00:00Z"},/predates decision/i],
    ]) {
      const refused=await create({...createBody(uuid(),"W"),...over});
      assert.ok(!refused.ok,`${label} must still be refused`);
      assert.match(JSON.stringify(refused.body),expected,`${label} must still raise its own semantic error`);
    }
    // The append RPC already validated first; prove the two now behave alike.
    // positionId is closed, so "already closed" is the competing semantic error.
    for (const [label,over] of [
      ["unknown event type with a nine-decimal price",{p_event_type:"CORRECTION",p_price:"1.000000001"}],
      ["closed position with a nine-decimal quantity",{p_event_type:"PARTIAL_EXIT_CONFIRMED",p_quantity:"1.000000001",p_price:"120"}],
      ["note carrying an out-of-range fee",{p_event_type:"OWNER_NOTE",p_fees:"10000000000000000"}],
    ]) {
      const refused=await append({p_position_id:positionId,p_idempotency_key:uuid(),p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T04:00:00Z",...over});
      assert.ok(!refused.ok,`append: ${label} must be refused`);
      assert.match(JSON.stringify(refused.body),/precision contract/i,`append: ${label} must fail precision before the semantic guard`);
    }
    assert.equal(residue(),g2Before,"no rejected G-2 request may leave a snapshot, provenance, position or event");
    const g2Key=uuid();
    assert.ok(!(await create({...createBody(g2Key,"IDEM"),p_entry_price:"1.000000001"})).ok);
    const g2Reused=await create(createBody(g2Key,"IDEM"));
    assert.equal(g2Reused.status,200,"a precision-rejected request must not consume the idempotency key");
    assert.equal(g2Reused.body[0].replayed,false);
    // Canonical equivalence survives the reorder: 10 and 10.00000000 still replay.
    assert.equal((await create({...createBody(g2Key,"IDEM"),p_entry_price:"100",p_entry_quantity:"10",p_fees:"10.0",p_taxes:"0.000"})).body[0].replayed,true);

    // ==========================================================================
    // G-1b Absolute time bounds on the two remaining caller-supplied instants.
    //      analysis_created_at <= captured_at, broker_effective_at <= created_at.
    //      Both right-hand sides are database-generated and caller-unreachable,
    //      so a wholly future but internally coherent record has nothing else
    //      standing in its way.
    // ==========================================================================
    const FUTURE="2030-01-01T00:00:00Z";
    // Every rejection below is proved atomic: no snapshot, provenance, position
    // or event survives it, and the idempotency key it carried stays unburnt.
    const rejects=async(label,body,call)=>{
      const before=residue();
      const refused=await (call||append)(body);
      assert.ok(!refused.ok,`${label} must be rejected`);
      assert.equal(residue(),before,`${label} must leave no snapshot, provenance, position or event`);
      return refused;
    };

    // A coherent future-dated decision: the execution follows the analysis, so
    // every relative rule holds and only the absolute bound can refuse it.
    await rejects("a coherent future-dated analysis snapshot",{...createBody(uuid(),"B1"),p_analysis_created_at:FUTURE,p_broker_effective_at:"2030-01-01T01:00:00Z"},create);
    // A historical decision with a future ENTRY execution.
    await rejects("a future broker-effective ENTRY",{...createBody(uuid(),"B2"),p_broker_effective_at:FUTURE},create);
    // A rejected future request burns no idempotency key.
    const b2Key=uuid();
    await rejects("a repeated future ENTRY",{...createBody(b2Key,"B2R"),p_broker_effective_at:FUTURE},create);
    const b2Reused=await create(createBody(b2Key,"B2R"));
    assert.equal(b2Reused.status,200,"a time-rejected request must not consume the idempotency key");
    assert.equal(b2Reused.body[0].replayed,false);

    // Only an upper bound exists: historical and current records stay valid.
    assert.equal((await create({...createBody(uuid(),"B3"),p_analysis_created_at:"2020-01-01T00:00:00Z",p_broker_effective_at:"2020-01-01T01:00:00Z"})).status,200,"a historical decision and execution must be accepted");
    const nowAnalysis=new Date(Date.now()-120000).toISOString(); const nowExecution=new Date(Date.now()-60000).toISOString();
    assert.equal((await create({...createBody(uuid(),"B4"),p_analysis_created_at:nowAnalysis,p_broker_effective_at:nowExecution})).status,200,"a current decision and execution must be accepted");

    // Future exits, for both exit kinds, on an otherwise valid open position.
    const boundPos=await create(createBody(uuid(),"B5")); const boundId=boundPos.body[0].position_id;
    const exitBody=(over)=>({p_position_id:boundId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"120",p_quantity:"4",p_fees:"0",p_taxes:"0",...over});
    await rejects("a future broker-effective PARTIAL_EXIT",exitBody({p_broker_effective_at:FUTURE}));
    await rejects("a future broker-effective FINAL_EXIT",exitBody({p_broker_effective_at:FUTURE,p_event_type:"FINAL_EXIT_CONFIRMED",p_quantity:"10"}));
    const b5Key=uuid();
    await rejects("a repeated future PARTIAL_EXIT",exitBody({p_idempotency_key:b5Key,p_broker_effective_at:FUTURE}));
    const b5Reused=await append(exitBody({p_idempotency_key:b5Key}));
    assert.equal(b5Reused.status,200,"a time-rejected exit must not consume the idempotency key");
    assert.equal(b5Reused.body[0].replayed,false);
    // Historical and current executions are accepted, and the relative ordering
    // rules still hold on top of the new absolute bound.
    assert.equal((await append(exitBody({p_event_type:"FINAL_EXIT_CONFIRMED",p_quantity:"6",p_broker_effective_at:new Date(Date.now()-30000).toISOString()}))).status,200,"a current final execution must be accepted");

    // Determinism at each boundary. Neither RPC can name captured_at or
    // created_at, so both CHECKs are probed directly: equal is accepted, one
    // microsecond past is not. `probe` reports rather than aborting the session.
    const probePos=await create(createBody(uuid(),"BPRB")); const probeId=probePos.body[0].position_id;
    const snapProbe=(capturedAt,analysisAt)=>sql(`create temp table probe(result text); do $probe$ begin insert into public.outcome_decision_snapshots(user_id,symbol,market,analysis_contract_version,analysis_created_at,captured_at,thesis_text,invalidation_condition,planned_horizon,shariah_state) values('${userId}','BNDS','US','probe-v1','${analysisAt}','${capturedAt}','probe thesis','probe invalidation','swing','UNKNOWN'); insert into probe values('accepted'); exception when others then insert into probe values('rejected:'||sqlstate); end $probe$; select result from probe`);
    const clearSnapProbe=()=>sql(`delete from public.outcome_decision_snapshots where analysis_contract_version='probe-v1'`);
    const eventProbe=(createdAt,effectiveAt)=>sql(`create temp table probe(result text); do $probe$ begin insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,price,quantity,fees,taxes,result_open_quantity,result_realized_pl,created_at) values('${probeId}','${userId}',900,'PARTIAL_EXIT_CONFIRMED',gen_random_uuid(),repeat('a',64),true,'${effectiveAt}',1,1,0,0,0,0,'${createdAt}'); insert into probe values('accepted'); exception when others then insert into probe values('rejected:'||sqlstate); end $probe$; select result from probe`);
    const clearEventProbe=()=>sql(`delete from public.outcome_position_events where position_id='${probeId}' and sequence_no=900`);
    clearSnapProbe();
    assert.equal(snapProbe("2026-09-03T00:00:00Z","2026-09-03T00:00:00Z"),"accepted","an analysis instant exactly equal to captured_at is accepted");
    clearSnapProbe();
    assert.equal(snapProbe("2026-09-03T00:00:00Z","2026-09-03T00:00:00.000001Z"),"rejected:23514","one microsecond past captured_at is refused by the check constraint");
    clearSnapProbe();
    clearEventProbe();
    assert.equal(eventProbe("2026-09-03T00:00:00Z","2026-09-03T00:00:00Z"),"accepted","an execution instant exactly equal to created_at is accepted");
    clearEventProbe();
    assert.equal(eventProbe("2026-09-03T00:00:00Z","2026-09-03T00:00:00.000001Z"),"rejected:23514","one microsecond past created_at is refused by the check constraint");
    clearEventProbe();

    // Load-bearing, per bound: capture the exact definition, remove only that
    // one constraint, prove the identical fixture then succeeds, clean up,
    // restore from the captured text, prove restoration is byte-identical, and
    // prove the fixture is refused again.
    const snapBound="outcome_decision_snapshots_not_future";
    const snapDef=sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${snapBound}'`);
    assert.match(snapDef,/captured_at/,"the decision bound must exist before it can be proved load-bearing");
    assert.equal(snapProbe("2026-09-03T00:00:00Z",FUTURE),"rejected:23514","the decision bound refuses the future fixture");
    clearSnapProbe();
    sql(`alter table public.outcome_decision_snapshots drop constraint ${snapBound}`);
    assert.equal(snapProbe("2026-09-03T00:00:00Z",FUTURE),"accepted","with the decision bound dropped the identical future fixture must succeed");
    clearSnapProbe();
    sql(`alter table public.outcome_decision_snapshots add constraint ${snapBound} ${snapDef}`);
    assert.equal(sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${snapBound}'`),snapDef,"the decision bound must be restored identically");
    assert.equal(snapProbe("2026-09-03T00:00:00Z",FUTURE),"rejected:23514","the restored decision bound must refuse the future fixture again");
    clearSnapProbe();

    const eventBound="outcome_position_events_not_future";
    const eventDef=sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${eventBound}'`);
    assert.match(eventDef,/created_at/,"the execution bound must exist before it can be proved load-bearing");
    const mutPos=await create(createBody(uuid(),"BMUT")); const mutId=mutPos.body[0].position_id;
    const futureExit=()=>append({p_position_id:mutId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:FUTURE,p_price:"120",p_quantity:"4",p_fees:"0",p_taxes:"0"});
    assert.ok(!(await futureExit()).ok,"the execution bound refuses the future fixture");
    sql(`alter table public.outcome_position_events drop constraint ${eventBound}`);
    const bypassedExit=await futureExit();
    assert.equal(bypassedExit.status,200,"with the execution bound dropped the identical future fixture must succeed");
    sql(`delete from public.outcome_position_events where id=${bypassedExit.body[0].event_id}`);
    sql(`alter table public.outcome_position_events add constraint ${eventBound} ${eventDef}`);
    assert.equal(sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='${eventBound}'`),eventDef,"the execution bound must be restored identically");
    assert.ok(!(await futureExit()).ok,"the restored execution bound must refuse the future fixture again");

    // ==========================================================================
    // G-3  OWNER_NOTE and HIDDEN_BY_OWNER reject every execution field by name.
    //      Nothing is silently discarded, and rejection precedes fingerprinting,
    //      sequence allocation and insertion.
    // ==========================================================================
    const notePos=await create(createBody(uuid(),"G3P")); const noteId=notePos.body[0].position_id;
    const noteState=()=>sql(`select count(*)::text||'|'||coalesce(max(e.sequence_no),0)::text from public.outcome_position_events e where e.position_id='${noteId}'`);
    // Valid non-execution events, every execution field null, still succeed.
    assert.equal((await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"a legitimate owner note"})).status,200,"a note with no execution fields must succeed");
    assert.equal((await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"HIDDEN_BY_OWNER"})).status,200,"a hidden event with no execution fields must succeed");

    const prohibited={p_broker_effective_at:"2026-09-03T02:00:00Z",p_fees:"2",p_price:"120",p_quantity:"1",p_taxes:"3"};
    const columnOf={p_broker_effective_at:"broker_effective_at",p_fees:"fees",p_price:"price",p_quantity:"quantity",p_taxes:"taxes"};
    // Every prohibited field independently, on both non-execution event types.
    for (const eventType of ["OWNER_NOTE","HIDDEN_BY_OWNER"]) {
      for (const field of Object.keys(prohibited)) {
        const column=columnOf[field]; const label=`${eventType} carrying ${column}`;
        const idempotencyKey=uuid(); const stateBefore=noteState(); const before=residue();
        const body={p_position_id:noteId,p_idempotency_key:idempotencyKey,p_event_type:eventType,[field]:prohibited[field]};
        const refused=await append(body);
        assert.ok(!refused.ok,`${label} must be rejected`);
        assert.match(JSON.stringify(refused.body),new RegExp(`execution field not permitted on non-execution event: ${column}`,"i"),`${label} must name ${column}`);
        assert.equal(residue(),before,`${label} must leave no snapshot, provenance, position or event`);
        assert.equal(noteState(),stateBefore,`${label} must allocate no sequence number`);
        // Repeating a rejected request stays residue-free.
        assert.ok(!(await append(body)).ok,`${label} must stay rejected on repeat`);
        assert.equal(residue(),before,`${label} must leave no residue when repeated`);
        assert.equal(noteState(),stateBefore,`${label} must allocate no sequence number when repeated`);
        // And the key it carried was never consumed.
        const reused=await append({p_position_id:noteId,p_idempotency_key:idempotencyKey,p_event_type:eventType,p_owner_note:`${label} key survived`});
        assert.equal(reused.status,200,`${label} must not consume the idempotency key`);
        assert.equal(reused.body[0].replayed,false);
      }
    }
    // Combinations. The first offender is deterministic and alphabetical, and
    // fees-only and taxes-only are the two cases the pre-fix body never caught.
    for (const [label,over,expected] of [
      ["fees only",{p_fees:"2"},"fees"],
      ["taxes only",{p_taxes:"3"},"taxes"],
      ["fees and taxes",{p_fees:"2",p_taxes:"3"},"fees"],
      ["price and quantity",{p_price:"120",p_quantity:"1"},"price"],
      ["quantity and taxes",{p_quantity:"1",p_taxes:"3"},"quantity"],
      ["broker time and taxes",{p_broker_effective_at:"2026-09-03T02:00:00Z",p_taxes:"3"},"broker_effective_at"],
      ["every execution field",{...prohibited},"broker_effective_at"],
    ]) {
      const stateBefore=noteState(); const before=residue();
      const refused=await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:label,...over});
      assert.ok(!refused.ok,`a note with ${label} must be rejected`);
      assert.match(JSON.stringify(refused.body),new RegExp(`execution field not permitted on non-execution event: ${expected}`,"i"),`${label} must name ${expected} first`);
      assert.equal(residue(),before,`${label} must leave no residue`);
      assert.equal(noteState(),stateBefore,`${label} must allocate no sequence number`);
    }
    // Execution events are unaffected: fees and taxes remain required there.
    assert.equal((await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"PARTIAL_EXIT_CONFIRMED",p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T02:00:00Z",p_price:"120",p_quantity:"1",p_fees:"2",p_taxes:"3"})).status,200,"an execution event still carries its execution fields");

    // Load-bearing old-body proof. The G-3 assertion is delimited in the stored
    // body, so the pre-fix implementation can be reconstructed exactly: it
    // ACCEPTS the identical fees-only and taxes-only notes and stores NULL,
    // which is precisely the silent discard this correction removes.
    const APPEND_SIGNATURE="public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text)";
    const readAppendDef=()=>sql(`select pg_get_functiondef('${APPEND_SIGNATURE}'::regprocedure)`);
    const appendDef=readAppendDef();
    const OPEN="-- >>> G-3 non-execution execution-field rejection";
    const CLOSE="-- <<< G-3 non-execution execution-field rejection";
    const from=appendDef.indexOf(OPEN); const to=appendDef.indexOf(CLOSE);
    assert.ok(from>0&&to>from,"the G-3 assertion must be delimited in the stored function body");
    const preFixDef=appendDef.slice(0,from)+appendDef.slice(to+CLOSE.length);
    assert.doesNotMatch(preFixDef,/execution field not permitted/,"the reconstructed pre-fix body must not contain the assertion");
    sql(preFixDef);
    const silentFees=await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"pre-fix fees",p_fees:"2"});
    assert.equal(silentFees.status,200,"the pre-fix body accepted a fees-only note");
    assert.equal(sql(`select coalesce(e.fees::text,'DISCARDED') from public.outcome_position_events e where e.id=${silentFees.body[0].event_id}`),"DISCARDED","the pre-fix body discarded the fee it accepted");
    const silentTaxes=await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"pre-fix taxes",p_taxes:"3"});
    assert.equal(silentTaxes.status,200,"the pre-fix body accepted a taxes-only note");
    assert.equal(sql(`select coalesce(e.taxes::text,'DISCARDED') from public.outcome_position_events e where e.id=${silentTaxes.body[0].event_id}`),"DISCARDED","the pre-fix body discarded the tax it accepted");
    sql(`delete from public.outcome_position_events where id in (${silentFees.body[0].event_id},${silentTaxes.body[0].event_id})`);
    sql(appendDef);
    assert.equal(readAppendDef(),appendDef,"the corrected function must be restored identically");
    const refusedAgainFees=await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"pre-fix fees",p_fees:"2"});
    assert.ok(!refusedAgainFees.ok,"the restored assertion must refuse the fees-only note again");
    assert.match(JSON.stringify(refusedAgainFees.body),/execution field not permitted on non-execution event: fees/i);
    const refusedAgainTaxes=await append({p_position_id:noteId,p_idempotency_key:uuid(),p_event_type:"OWNER_NOTE",p_owner_note:"pre-fix taxes",p_taxes:"3"});
    assert.ok(!refusedAgainTaxes.ok,"the restored assertion must refuse the taxes-only note again");
    assert.match(JSON.stringify(refusedAgainTaxes.body),/execution field not permitted on non-execution event: taxes/i);

    console.log("Outcome ledger atomic RPC, idempotency, arithmetic, concurrency and storage-boundary contracts passed.");
  } finally { if(userId) await admin(`/auth/v1/admin/users/${userId}`,{method:"DELETE"}); }
}
main().catch((error)=>{console.error(error);process.exit(1);});
