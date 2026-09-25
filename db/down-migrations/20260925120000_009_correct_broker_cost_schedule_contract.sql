-- Verification-only empty-schedule reversal. Never run automatically.
do $$ begin
 if exists(select 1 from public.broker_cost_schedule_versions)
 or exists(select 1 from public.broker_cost_schedule_components) then
  raise exception using errcode='55000',message='migration 009 reversal refused: broker cost schedule evidence exists';
 end if;
end $$;

alter table public.broker_cost_schedule_versions
  drop constraint broker_cost_schedule_versions_broker_legal_entity_check,
  drop constraint broker_cost_schedule_versions_evidence_limitations_check;

alter table public.broker_cost_schedule_versions
  add constraint broker_cost_schedule_versions_broker_legal_entity_check
    check (broker_legal_entity = 'Saxo Financial Services (DIFC) Ltd / Saxo MENA'),
  add constraint broker_cost_schedule_versions_evidence_limitations_check
    check (evidence_limitations = E'The allowance exceeds a pure SEC + FINRA calculation by a fixed 0.20 USD per modeled exit. That margin covers single-execution rounding. It does not cover multi-fill venue routing, and may understate cost if the broker splits a large order across venues and charges per fill.\nAt small order sizes the allowance is materially higher than Saxo''s own displayed estimate. On a 1,006.80 USD order Saxo displayed 0.22 USD of estimated non-commission cost; this allowance yields 0.50 USD.\nThe allowance brackets Saxo''s behaviour. It does not reproduce it. Saxo''s rounding, minimums, execution-splitting and venue-routing treatment remain unproven.');

create or replace function public.create_broker_cost_schedule_version(
 p_idempotency_key uuid,p_effective_from date,p_evidence_reference text,p_evidence_captured_at timestamptz,
 p_broker_source_reference text,p_sec_source_reference text,p_finra_source_reference text,p_allowance_approval_reference text
) returns table(schedule_version_id uuid,version_no bigint,replayed boolean)
language plpgsql security definer set search_path=''
as $$ declare v_user uuid:=auth.uid(); v_id uuid; v_version bigint; v_fp text; v_old public.broker_cost_schedule_versions%rowtype;
begin
 if v_user is null then raise exception using errcode='42501',message='authentication required'; end if;
 if p_idempotency_key is null or p_effective_from is null or p_evidence_captured_at is null or p_evidence_captured_at>clock_timestamp()
 or p_evidence_reference is null or char_length(p_evidence_reference) not between 8 and 240
 or p_broker_source_reference is null or p_sec_source_reference is null or p_finra_source_reference is null or p_allowance_approval_reference is null
 then raise exception using errcode='22023',message='invalid cost schedule evidence'; end if;
 v_fp:=encode(extensions.digest(convert_to(jsonb_build_object('contract',1,'effective_from',p_effective_from,
  'evidence_reference',p_evidence_reference,'evidence_captured_at',p_evidence_captured_at,'broker',p_broker_source_reference,
  'sec',p_sec_source_reference,'finra',p_finra_source_reference,'allowance',p_allowance_approval_reference)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
 select * into v_old from public.broker_cost_schedule_versions where user_id=v_user and client_idempotency_key=p_idempotency_key;
 if found then
  if v_old.request_fingerprint<>v_fp then raise exception using errcode='23505',message='idempotency conflict'; end if;
  return query select v_old.id,v_old.version_no,true; return;
 end if;
 if exists(select 1 from public.outcome_positions where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_events where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_increases where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_protective_stop_changes where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.personal_risk_evaluations where user_id=v_user and client_idempotency_key=p_idempotency_key)
 then raise exception using errcode='23505',message='idempotency conflict'; end if;
 select coalesce(max(s.version_no),0)+1 into v_version from public.broker_cost_schedule_versions s where s.user_id=v_user;
 insert into public.broker_cost_schedule_versions(user_id,version_no,broker_legal_entity,pricing_tier,account_currency,instrument_scope,
  effective_from,supersedes_schedule_id,maximum_modeled_sell_proceeds,maximum_modeled_exit_quantity,evidence_reference,evidence_limitations,evidence_captured_at,
  client_idempotency_key,request_fingerprint)
 values(v_user,v_version,'Saxo Financial Services (DIFC) Ltd / Saxo MENA','Classic','USD','LONG_US_LISTED_CASH_EQUITY',
  p_effective_from,(select s.id from public.broker_cost_schedule_versions s where s.user_id=v_user order by s.version_no desc limit 1),
  100000,10000,p_evidence_reference,E'The allowance exceeds a pure SEC + FINRA calculation by a fixed 0.20 USD per modeled exit. That margin covers single-execution rounding. It does not cover multi-fill venue routing, and may understate cost if the broker splits a large order across venues and charges per fill.\nAt small order sizes the allowance is materially higher than Saxo''s own displayed estimate. On a 1,006.80 USD order Saxo displayed 0.22 USD of estimated non-commission cost; this allowance yields 0.50 USD.\nThe allowance brackets Saxo''s behaviour. It does not reproduce it. Saxo''s rounding, minimums, execution-splitting and venue-routing treatment remain unproven.',p_evidence_captured_at,p_idempotency_key,v_fp) returning id into v_id;
 insert into public.broker_cost_schedule_components(schedule_id,user_id,component_code,evidence_class,application_mode,proceeds_rate,quantity_rate,
  minimum_amount,maximum_amount,fixed_amount,source_authority,source_reference,source_effective_from,evidence_limitations) values
 (v_id,v_user,'CLOSE_COMMISSION','BROKER_PROVEN','DERIVED_CHARGE',.0008,null,1,null,null,'Saxo MENA',p_broker_source_reference,p_effective_from,'Broker-proven commission only; no regulatory pass-through or routing behavior is implied.'),
 (v_id,v_user,'SEC_REFERENCE','REGULATOR_PUBLISHED','REFERENCE_ONLY',.0000206,null,null,null,null,'SEC',p_sec_source_reference,date '2026-04-04','Reference only; no Saxo pass-through arithmetic is claimed.'),
 (v_id,v_user,'FINRA_TAF_REFERENCE','REGULATOR_PUBLISHED','REFERENCE_ONLY',null,.000195,null,9.79,null,'FINRA',p_finra_source_reference,null,'Reference only; its cap does not modify the approved allowance formula.'),
 (v_id,v_user,'REGULATORY_ALLOWANCE','FOUNDER_APPROVED_ALLOWANCE','FIXED_OR_FORMULA_ALLOWANCE',.0000206,.000195,.50,null,.20,'AzaLens founder',p_allowance_approval_reference,p_effective_from,'Approved planning buffer, not a measured Saxo charge or proven upper bound. Saxo rounding, execution splitting and venue routing remain unproven.');
 return query select v_id,v_version,false;
end $$;

revoke all on function public.create_broker_cost_schedule_version(uuid,date,text,timestamptz,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_broker_cost_schedule_version(uuid,date,text,timestamptz,text,text,text,text) to authenticated;
