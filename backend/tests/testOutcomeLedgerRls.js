"use strict";
const assert = require("node:assert/strict");
const { readStatus, request, sql } = require("./helpers/localSupabase");

const PASSWORD = "azalens-local-ledger-rls-password";
const RUN = Date.now();

async function main() {
  const { apiUrl, publishableKey, secretKey } = readStatus();
  const admin = (path, options = {}) => request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });
  const rest = (path, token, options = {}) => request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey, token, ...options });
  const users = [];
  async function user(label) {
    const email = `ledger-rls-${label}-${RUN}@azalens.test`;
    const made = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password: PASSWORD, email_confirm: true } });
    assert.equal(made.status, 200); users.push(made.body.id);
    const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, { apikey: publishableKey, method: "POST", body: { email, password: PASSWORD } });
    assert.equal(login.status, 200); return { id: made.body.id, token: login.body.access_token };
  }
  try {
    const A = await user("a"); const B = await user("b");
    const key = "10000000-0000-4000-8000-000000000001";
    const created = await rest("/rpc/create_outcome_position", A.token, { method: "POST", body: {
      p_idempotency_key:key,p_symbol:"AAPL",p_market:"US",p_currency:"USD",
      p_analysis_contract_version:"test-v1",p_analysis_created_at:"2026-09-03T00:00:00Z",
      p_thesis_text:"Fixture thesis",p_invalidation_condition:"Fixture invalidation",p_planned_horizon:"swing",
      p_intended_invalidation_price:null,p_intended_target_price:null,p_maximum_planned_loss:null,p_risk_percentage:null,
      p_public_direction:"BULLISH",p_public_evidence_state:"SUPPORTIVE",
      p_public_risk_classification:"UNKNOWN",p_shariah_state:"COMPLIANT",p_provenance:[
        {capability:"QUOTE",provider:"UnavailableSource",source_observation:"UNAVAILABLE",venue_scope:"UNKNOWN",interval:null,observed_at:null,delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:0,freshness_threshold_seconds:20,usable:false,entitlement_display:"UNRESOLVED",entitlement_analysis:"UNRESOLVED",entitlement_storage:"UNRESOLVED",entitlement_attribution:"UNRESOLVED",entitlement_authority:"UNKNOWN",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"unknown",limitation_codes:["ENTITLEMENT_UNRESOLVED","SOURCE_UNAVAILABLE"]},
        {capability:"HISTORY",provider:"UnavailableSource",source_observation:"UNAVAILABLE",venue_scope:"UNKNOWN",interval:"1day",observed_at:null,delivery_state:"MISS",retrieved_at:"2026-09-03T00:00:00Z",original_retrieved_at:"2026-09-03T00:00:00Z",age_seconds:0,freshness_threshold_seconds:86400,usable:false,entitlement_display:"UNRESOLVED",entitlement_analysis:"UNRESOLVED",entitlement_storage:"UNRESOLVED",entitlement_attribution:"UNRESOLVED",entitlement_authority:"UNKNOWN",entitlement_assessed_at:"2026-09-03T00:00:00Z",authority_reference:"unknown",limitation_codes:["ENTITLEMENT_UNRESOLVED","SOURCE_UNAVAILABLE"]}
      ],
      p_broker_confirmed:true,p_broker_effective_at:"2026-09-03T01:00:00Z",p_entry_price:"100.00000000",
      p_entry_quantity:"10.00000000",p_fees:"1.00000000",p_taxes:"0"
    }});
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const positionId = created.body[0].position_id;

    const directInsert = await rest("/outcome_decision_snapshots", A.token, { method:"POST", body:{
      user_id:A.id,symbol:"MSFT",market:"US",analysis_contract_version:"forged",
      analysis_created_at:"2026-09-03T00:00:00Z",thesis_text:"rewrite",
      invalidation_condition:"rewrite",planned_horizon:"swing",shariah_state:"UNKNOWN"
    }});
    assert.ok(!directInsert.ok,"authenticated direct snapshot insert must be denied");

    for (const table of ["outcome_decision_snapshots","outcome_snapshot_provenance","outcome_positions","outcome_position_events"]) {
      const a = await rest(`/${table}?select=*`, A.token);
      const b = await rest(`/${table}?select=*`, B.token);
      const anon = await rest(`/${table}?select=*`, undefined);
      assert.equal(a.status, 200); assert.equal(b.status, 200);
      if (table !== "outcome_snapshot_provenance") assert.ok(a.body.length >= 1);
      assert.equal(b.body.length, 0, `${table}: user B must see no user A rows`);
      assert.ok(!anon.ok || anon.body.length === 0, `${table}: anonymous read denied`);

      const patch = await rest(`/${table}?user_id=eq.${A.id}`, A.token, { method:"PATCH", body:{user_id:B.id}, prefer:"return=representation" });
      assert.ok(!patch.ok || patch.body.length === 0, `${table}: immutable update denied`);
      const del = await rest(`/${table}?user_id=eq.${A.id}`, A.token, { method:"DELETE", prefer:"return=representation" });
      assert.ok(!del.ok || del.body.length === 0, `${table}: direct delete denied`);
      const service = await request(`${apiUrl}/rest/v1/${table}?select=*`, { apikey:secretKey,token:secretKey });
      assert.ok([401,403,404].includes(service.status), `${table}: service-role direct access denied (${service.status})`);
    }
    const bAppend = await rest("/rpc/append_outcome_position_event", B.token, { method:"POST", body:{
      p_position_id:positionId,p_idempotency_key:"10000000-0000-4000-8000-000000000002",p_event_type:"OWNER_NOTE",p_owner_note:"foreign"
    }});
    assert.ok([400,401,403,404].includes(bAppend.status), "wrong user cannot mutate position");
    const anonRpc = await rest("/rpc/append_outcome_position_event", undefined, { method:"POST", body:{
      p_position_id:positionId,p_idempotency_key:"10000000-0000-4000-8000-000000000003",p_event_type:"OWNER_NOTE"
    }});
    assert.ok([401,403,404].includes(anonRpc.status));
    const serviceRpc = await request(`${apiUrl}/rest/v1/rpc/append_outcome_position_event`, { apikey:secretKey,token:secretKey,method:"POST",body:{
      p_position_id:positionId,p_idempotency_key:"10000000-0000-4000-8000-000000000004",p_event_type:"OWNER_NOTE"
    }});
    assert.ok([401,403,404].includes(serviceRpc.status));

    assert.equal(sql(`select count(*) from public.outcome_positions where id='${positionId}'`), "1");
    console.log("Outcome ledger two-user RLS and direct-access contracts passed.");
  } finally {
    for (const id of users) await admin(`/auth/v1/admin/users/${id}`, { method:"DELETE" });
  }
}
main().catch((error)=>{ console.error(error.message); process.exit(1); });
