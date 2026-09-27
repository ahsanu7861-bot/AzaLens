\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

begin;
select 'DECISION_PARITY_TEST_PID=' || pg_backend_pid();

do $test$
declare
  u uuid := 'd0080000-0000-4000-8000-000000000001';
  nowish timestamptz := clock_timestamp() - interval '1 minute';
  day_start date := (clock_timestamp() at time zone 'America/New_York')::date;
  week_start date := date_trunc('week',clock_timestamp() at time zone 'America/New_York')::date;
  provenance jsonb;
  result jsonb;
  target uuid;
  loss_position uuid;
  evaluation uuid;
  v_event_id bigint;
  n integer := 10;
  expected_code text;
  expected_kind text;
  observed record;
  call_key uuid;
  completed integer := 0;
  before_counts jsonb;
  after_counts jsonb;
  before_state jsonb;
  after_state jsonb;
  actual_state text;
  action_name text;
  missing_no integer;
  fixture_user uuid;
  fixture_position uuid;
  returned_state text;
  expected_state text;
  expected_threshold numeric;
  expected_observed numeric;
  calc_values record;
  candidate_quantity numeric;
  candidate_stop numeric;
begin
  insert into auth.users(id,email) values(u,'risk-decision-parity-owner@local.invalid');
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform * from public.create_personal_risk_policy_version('d0080000-0000-4000-8000-000000000002',0.5,2,1,2.5,5,25);
  perform * from public.create_broker_equity_snapshot('d0080000-0000-4000-8000-000000000003',100000,'USD','Fixture Broker','OWNER_CONFIRMED_BROKER_VALUE','fixture:decision-parity-equity',nowish);
  perform * from public.create_broker_cost_schedule_version('d0080000-0000-4000-8000-000000000004',day_start,'fixture:decision-parity-schedule',nowish,'broker:decision-parity','sec:decision-parity','finra:decision-parity','founder:decision-parity');

  provenance := jsonb_build_array(
    jsonb_build_object('capability','QUOTE','provider','Fixture','source_observation','REALTIME','venue_scope','CONSOLIDATION_UNVERIFIED','interval',null,'observed_at',nowish - interval '1 second','delivery_state','MISS','retrieved_at',nowish,'original_retrieved_at',nowish,'age_seconds',0,'freshness_threshold_seconds',20,'usable',true,'entitlement_display','PERMITTED_PRIVATE','entitlement_analysis','PERMITTED_NON_RECONSTRUCTIVE','entitlement_storage','PERMITTED_DERIVED_ONLY','entitlement_attribution','NOT_REQUIRED_PRIVATE','entitlement_authority','PLAN_DOCUMENTATION','entitlement_assessed_at',nowish - interval '1 second','authority_reference','plan:decision-parity','limitation_codes',jsonb_build_array('BROKER_VERIFICATION_REQUIRED','CONSOLIDATION_UNVERIFIED','NON_RECONSTRUCTIVE_ANALYTICS_ONLY','RAW_STORAGE_PROHIBITED')),
    jsonb_build_object('capability','HISTORY','provider','Fixture','source_observation','EOD','venue_scope','UNKNOWN','interval','1day','observed_at',nowish - interval '1 day','delivery_state','MISS','retrieved_at',nowish,'original_retrieved_at',nowish,'age_seconds',0,'freshness_threshold_seconds',86400,'usable',true,'entitlement_display','PROHIBITED','entitlement_analysis','PERMITTED_NON_RECONSTRUCTIVE','entitlement_storage','PERMITTED_DERIVED_ONLY','entitlement_attribution','UNRESOLVED','entitlement_authority','PUBLISHED_TERMS','entitlement_assessed_at',nowish - interval '1 second','authority_reference','terms:decision-parity','limitation_codes',jsonb_build_array('DISPLAY_PROHIBITED','ENTITLEMENT_UNRESOLVED','NON_RECONSTRUCTIVE_ANALYTICS_ONLY','RAW_STORAGE_PROHIBITED'))
  );

  -- Five accepted positions establish the capacity fixture. TARGET is large enough
  -- to cross the per-position limit only when its stop is loosened materially.
  for i in 1..5 loop
    result := public.create_risk_enforced_outcome_position(
      ('d0080000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,
      case when i=1 then 'TARGET' else 'BASE'||i end,'US','USD','decision-parity',nowish - interval '2 minutes',
      'fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish - interval '1 minute',
      100,case when i=1 then 100 else 1 end,0,0,99,'OWNER_DECLARED');
    if coalesce((result->>'accepted')::boolean,false) is not true then raise exception 'baseline open % failed: %',i,result; end if;
    if i=1 then target := (result->>'position_id')::uuid; end if;
    if i=2 then loss_position := (result->>'position_id')::uuid; end if;
  end loop;
  result := public.append_risk_lifecycle_event(loss_position,'d0080000-0000-4000-8000-000000000120','FINAL_EXIT_CONFIRMED',true,nowish,90,1,0,0);
  v_event_id := (result->>'event_id')::bigint;
  result := public.create_risk_enforced_outcome_position('d0080000-0000-4000-8000-000000000121','BASE6','US','USD','decision-parity',nowish - interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish - interval '1 minute',100,1,0,0,99,'OWNER_DECLARED');
  if coalesce((result->>'accepted')::boolean,false) is not true then raise exception 'replacement capacity open failed: %',result; end if;

  -- Opening precedence. Each row enables its named condition and every lower-priority condition.
  for expected_code,expected_kind,n in values
    ('MISSING_PROTECTIVE_STOP','PROTECTIVE_STOP_REQUIRED',201),
    ('PER_POSITION_PLANNED_LOSS_LIMIT','PER_POSITION_PLANNED_LOSS',202),
    ('AGGREGATE_OPEN_PLANNED_LOSS_LIMIT','AGGREGATE_OPEN_PLANNED_LOSS',203),
    ('DAILY_GROSS_REALIZED_LOSS_LIMIT','DAILY_GROSS_REALIZED_LOSS',204),
    ('WEEKLY_GROSS_REALIZED_LOSS_LIMIT','WEEKLY_GROSS_REALIZED_LOSS',205),
    ('MAXIMUM_CONCURRENT_POSITIONS','MAXIMUM_CONCURRENT_POSITIONS',206)
  loop
    update public.outcome_position_risk_state set current_planned_loss_contribution=case when n<=203 then 500 else 0 end where user_id=u;
    update public.outcome_exit_cost_allocations set gross_realized_loss=case when n<=204 then 3000 when n=205 then 2500 else 0 end,ny_day=case when n<=204 then day_start else day_start-1 end,ny_week=week_start where event_id=v_event_id;
    if (select count(*) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0)<>5 then raise exception 'opening capacity overlap fixture mismatch %',n; end if;
    if n<=203 and (select sum(current_planned_loss_contribution) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0)<=2000 then raise exception 'opening aggregate overlap fixture mismatch %',n; end if;
    if n>203 and (select sum(current_planned_loss_contribution) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0)>2000 then raise exception 'opening aggregate healthy fixture mismatch %',n; end if;
    if n<=204 and (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_day=day_start)<1000 then raise exception 'opening daily overlap fixture mismatch %',n; end if;
    if n<=205 and (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_week=week_start)<2500 then raise exception 'opening weekly overlap fixture mismatch %',n; end if;
    call_key := ('d0080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    select jsonb_agg(to_jsonb(s) order by position_id) into before_state from public.outcome_position_risk_state s where user_id=u;
    select * into calc_values from public._risk008_calculate(case when n=202 then 100 else 1 end,100,case when n=202 then 90 else 99 end,0,0,25);
    if n=202 and calc_values.contribution<=500 then raise exception 'opening per-position overlap fixture mismatch'; end if;
    expected_observed:=case n when 202 then calc_values.contribution when 203 then (select sum(current_planned_loss_contribution) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0)+calc_values.contribution when 204 then 3000 when 205 then 2500 when 206 then 6 else null end;
    result := public.create_risk_enforced_outcome_position(call_key,'OPEN'||n,'US','USD','decision-parity',nowish - interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish - interval '1 minute',100,case when n=202 then 100 else 1 end,0,0,case when n=201 then null when n=202 then 90 else 99 end,'OWNER_DECLARED');
    if (result->>'accepted')::boolean or result->>'rejection_code' is distinct from expected_code then raise exception 'opening precedence % expected %, got %',n,expected_code,result; end if;
    evaluation := (result->>'evaluation_id')::uuid;
    select * into observed from public.personal_risk_evaluations where id=evaluation;
    if observed.action_type<>'OPEN_POSITION' or observed.accepted or observed.rejection_code<>expected_code or observed.threshold_kind<>expected_kind
      or num_nonnulls(observed.resulting_position_id,observed.resulting_event_id,observed.resulting_increase_id,observed.resulting_stop_change_id)<>0
      or (expected_code='MISSING_PROTECTIVE_STOP' and (observed.attempted_protective_stop is not null or observed.observed_stop_presence))
      or (expected_code<>'MISSING_PROTECTIVE_STOP' and (observed.attempted_protective_stop is null or not observed.observed_stop_presence or observed.monetary_threshold is null or observed.monetary_observed_value is null))
    then raise exception 'opening rejection tuple mismatch %: %',n,row_to_json(observed); end if;
    if evaluation is null or (select count(*) from public.personal_risk_evaluations where id=evaluation and user_id=u and client_idempotency_key=call_key)<>1 then raise exception 'opening evaluation cardinality mismatch %',n; end if;
    expected_threshold:=case expected_code when 'PER_POSITION_PLANNED_LOSS_LIMIT' then 500 when 'AGGREGATE_OPEN_PLANNED_LOSS_LIMIT' then 2000 when 'DAILY_GROSS_REALIZED_LOSS_LIMIT' then 1000 when 'WEEKLY_GROSS_REALIZED_LOSS_LIMIT' then 2500 when 'MAXIMUM_CONCURRENT_POSITIONS' then 5 else null end;
    if observed.monetary_threshold is distinct from expected_threshold then raise exception 'opening threshold mismatch %: %',n,observed.monetary_threshold; end if;
    if observed.monetary_observed_value is distinct from expected_observed then raise exception 'opening observed mismatch %: expected %, got %',n,expected_observed,observed.monetary_observed_value; end if;
    select jsonb_agg(to_jsonb(s) order by position_id) into after_state from public.outcome_position_risk_state s where user_id=u;
    if after_state is distinct from before_state then raise exception 'opening rejection changed risk state %',n; end if;
    completed:=completed+1;
  end loop;

  -- Increase and loosening share the four monetary precedence levels.
  for expected_code,expected_kind,n in values
    ('PER_POSITION_PLANNED_LOSS_LIMIT','PER_POSITION_PLANNED_LOSS',301),
    ('AGGREGATE_OPEN_PLANNED_LOSS_LIMIT','AGGREGATE_OPEN_PLANNED_LOSS',302),
    ('DAILY_GROSS_REALIZED_LOSS_LIMIT','DAILY_GROSS_REALIZED_LOSS',303),
    ('WEEKLY_GROSS_REALIZED_LOSS_LIMIT','WEEKLY_GROSS_REALIZED_LOSS',304)
  loop
    update public.outcome_position_risk_state set current_planned_loss_contribution=case when n<=302 then 500 else 0 end where user_id=u and position_id<>target;
    update public.outcome_exit_cost_allocations set gross_realized_loss=case when n<=303 then 3000 else 2500 end,ny_day=case when n<=303 then day_start else day_start-1 end,ny_week=week_start where event_id=v_event_id;
    call_key := ('d0080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    select to_jsonb(s) into before_state from public.outcome_position_risk_state s where position_id=target;
    select * into calc_values from public._risk008_calculate((before_state->>'remaining_quantity')::numeric + case when n=301 then 500 else 1 end,100,(before_state->>'protective_stop_price')::numeric,(before_state->>'remaining_entry_fee_pool')::numeric,(before_state->>'remaining_entry_tax_pool')::numeric,25);
    expected_observed:=case n when 301 then calc_values.contribution when 302 then (select coalesce(sum(current_planned_loss_contribution),0) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0 and position_id<>target)+calc_values.contribution when 303 then 3000 else 2500 end;
    if n=301 and calc_values.contribution<=500 then raise exception 'increase per-position overlap fixture mismatch'; end if;
    if n=302 and (calc_values.contribution>500 or expected_observed<=2000) then raise exception 'increase aggregate overlap fixture mismatch'; end if;
    if n=303 and ((select coalesce(sum(current_planned_loss_contribution),0) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0 and position_id<>target)+calc_values.contribution>2000 or (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_day=day_start)<1000) then raise exception 'increase daily fixture mismatch'; end if;
    if n=304 and ((select coalesce(sum(gross_realized_loss),0) from public.outcome_exit_cost_allocations where user_id=u and ny_day=day_start)>=1000 or (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_week=week_start)<2500) then raise exception 'increase weekly fixture mismatch'; end if;
    result := public.increase_risk_enforced_position(target,call_key,nowish,case when n=301 then 500 else 1 end,100,0,0);
    if (result->>'accepted')::boolean or result->>'rejection_code' is distinct from expected_code then raise exception 'increase precedence % expected %, got %',n,expected_code,result; end if;
    select * into observed from public.personal_risk_evaluations where id=(result->>'evaluation_id')::uuid;
    if observed.action_type<>'INCREASE_POSITION' or observed.accepted or observed.rejection_code<>expected_code or observed.threshold_kind<>expected_kind or observed.resulting_increase_id is not null or observed.resulting_position_id is not null or observed.monetary_threshold is null or observed.monetary_observed_value is null then raise exception 'increase rejection tuple mismatch %',n; end if;
    if result->>'evaluation_id' is null or (select count(*) from public.personal_risk_evaluations where id=(result->>'evaluation_id')::uuid and user_id=u and client_idempotency_key=call_key)<>1 then raise exception 'increase evaluation cardinality mismatch %',n; end if;
    select to_jsonb(s) into after_state from public.outcome_position_risk_state s where position_id=target;
    if after_state is distinct from before_state then raise exception 'increase rejection changed risk state %',n; end if;
    expected_threshold:=case expected_code when 'PER_POSITION_PLANNED_LOSS_LIMIT' then 500 when 'AGGREGATE_OPEN_PLANNED_LOSS_LIMIT' then 2000 when 'DAILY_GROSS_REALIZED_LOSS_LIMIT' then 1000 else 2500 end;
    if observed.monetary_threshold<>expected_threshold then raise exception 'increase threshold mismatch %',n; end if;
    if observed.monetary_observed_value<>expected_observed then raise exception 'increase observed mismatch %: expected %, got %',n,expected_observed,observed.monetary_observed_value; end if;
    completed:=completed+1;

    call_key := ('d0080000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid;
    select to_jsonb(s) into before_state from public.outcome_position_risk_state s where position_id=target;
    select * into calc_values from public._risk008_calculate((before_state->>'remaining_quantity')::numeric,(before_state->>'weighted_entry_price')::numeric,case when n=301 then 90 else 98 end,(before_state->>'remaining_entry_fee_pool')::numeric,(before_state->>'remaining_entry_tax_pool')::numeric,25);
    expected_observed:=case n when 301 then calc_values.contribution when 302 then (select coalesce(sum(current_planned_loss_contribution),0) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0 and position_id<>target)+calc_values.contribution when 303 then 3000 else 2500 end;
    if n=301 and calc_values.contribution<=500 then raise exception 'loosening per-position overlap fixture mismatch'; end if;
    if n=302 and (calc_values.contribution>500 or expected_observed<=2000) then raise exception 'loosening aggregate overlap fixture mismatch'; end if;
    if n=303 and ((select coalesce(sum(current_planned_loss_contribution),0) from public.outcome_position_risk_state where user_id=u and remaining_quantity>0 and position_id<>target)+calc_values.contribution>2000 or (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_day=day_start)<1000) then raise exception 'loosening daily fixture mismatch'; end if;
    if n=304 and ((select coalesce(sum(gross_realized_loss),0) from public.outcome_exit_cost_allocations where user_id=u and ny_day=day_start)>=1000 or (select sum(gross_realized_loss) from public.outcome_exit_cost_allocations where user_id=u and ny_week=week_start)<2500) then raise exception 'loosening weekly fixture mismatch'; end if;
    result := public.change_outcome_protective_stop(target,call_key,case when n=301 then 90 else 98 end,'OWNER_DECLARED');
    if (result->>'accepted')::boolean or result->>'rejection_code' is distinct from expected_code then raise exception 'loosening precedence % expected %, got %',n,expected_code,result; end if;
    select * into observed from public.personal_risk_evaluations where id=(result->>'evaluation_id')::uuid;
    if observed.action_type<>'LOOSEN_STOP' or observed.accepted or observed.rejection_code<>expected_code or observed.threshold_kind<>expected_kind or observed.resulting_stop_change_id is not null or observed.resulting_position_id is not null or observed.monetary_threshold is null or observed.monetary_observed_value is null then raise exception 'loosening rejection tuple mismatch %',n; end if;
    if result->>'evaluation_id' is null or (select count(*) from public.personal_risk_evaluations where id=(result->>'evaluation_id')::uuid and user_id=u and client_idempotency_key=call_key)<>1 then raise exception 'loosening evaluation cardinality mismatch %',n; end if;
    select to_jsonb(s) into after_state from public.outcome_position_risk_state s where position_id=target;
    if after_state is distinct from before_state then raise exception 'loosening rejection changed risk state %',n; end if;
    if observed.monetary_threshold<>expected_threshold then raise exception 'loosening threshold mismatch %',n; end if;
    if observed.monetary_observed_value<>expected_observed then raise exception 'loosening observed mismatch %: expected %, got %',n,expected_observed,observed.monetary_observed_value; end if;
    completed:=completed+1;
  end loop;

  -- A rejected new-risk attempt does not poison the healthy reducing paths.
  result := public.change_outcome_protective_stop(target,'d0080000-0000-4000-8000-000000000501',100,'OWNER_DECLARED');
  if not (result->>'accepted')::boolean or result->>'direction'<>'TIGHTENING' then raise exception 'tightening after rejection failed: %',result; end if;
  result := public.append_risk_lifecycle_event(target,'d0080000-0000-4000-8000-000000000502','FINAL_EXIT_CONFIRMED',true,nowish,100,100,0,0);
  if (result->>'open_quantity')::numeric<>0 then raise exception 'exit after rejection failed: %',result; end if;
  completed:=completed+1;

  -- Remove new-risk references after removing their evaluation references. The
  -- existing position/risk state remains healthy, so tightening and exit recording
  -- must not consult the now-unavailable policy path.
  update public.outcome_exit_cost_allocations set gross_realized_loss=0 where event_id=v_event_id;
  result := public.create_risk_enforced_outcome_position('d0080000-0000-4000-8000-000000000510','INDEP','US','USD','decision-parity',nowish - interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish - interval '1 minute',100,1,0,0,99,'OWNER_DECLARED');
  if coalesce((result->>'accepted')::boolean,false) is not true then raise exception 'independence baseline open failed: %',result; end if;
  target := (result->>'position_id')::uuid;
  delete from public.personal_risk_evaluations where user_id=u;
  delete from public.personal_risk_policy_versions where user_id=u;
  begin
    perform public.increase_risk_enforced_position(target,'d0080000-0000-4000-8000-000000000511',nowish,1,100,0,0);
    raise exception 'unavailable-policy increase unexpectedly succeeded';
  exception when sqlstate 'P8001' then null; end;
  result := public.change_outcome_protective_stop(target,'d0080000-0000-4000-8000-000000000512',100,'BROKER_CONFIRMED');
  if not (result->>'accepted')::boolean or result->>'direction'<>'TIGHTENING' then raise exception 'tightening without policy failed: %',result; end if;
  result := public.append_risk_lifecycle_event(target,'d0080000-0000-4000-8000-000000000513','FINAL_EXIT_CONFIRMED',true,nowish,100,1,0,0);
  if (result->>'open_quantity')::numeric<>0 then raise exception 'exit without policy failed: %',result; end if;
  completed:=completed+1;

  -- Reference-precondition matrix. Each fixture asserts the intended missing
  -- rows before invoking the actual RPC. Earlier missing references overlap
  -- later ones so the returned SQLSTATE proves lookup precedence.
  for action_name in select unnest(array['OPEN_POSITION','INCREASE_POSITION','LOOSEN_STOP']) loop
    for missing_no in 1..5 loop
      fixture_user:=gen_random_uuid();
      insert into auth.users(id,email) values(fixture_user,'risk-decision-parity-'||fixture_user||'@local.invalid');
      perform set_config('request.jwt.claim.sub',fixture_user::text,true);
      perform * from public.create_personal_risk_policy_version(gen_random_uuid(),0.5,2,1,2.5,5,25);
      perform * from public.create_broker_equity_snapshot(gen_random_uuid(),100000,'USD','Fixture Broker','OWNER_CONFIRMED_BROKER_VALUE','fixture:reference-matrix',nowish);
      perform * from public.create_broker_cost_schedule_version(gen_random_uuid(),day_start,'fixture:reference-matrix',nowish,'broker:reference-matrix','sec:reference-matrix','finra:reference-matrix','founder:reference-matrix');
      fixture_position:=null;
      if action_name<>'OPEN_POSITION' then
        result:=public.create_risk_enforced_outcome_position(gen_random_uuid(),'REF'||missing_no,'US','USD','decision-parity',nowish-interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish-interval '1 minute',100,1,0,0,99,'OWNER_DECLARED');
        if coalesce((result->>'accepted')::boolean,false) is not true then raise exception 'reference baseline open failed %/%: %',action_name,missing_no,result; end if;
        fixture_position:=(result->>'position_id')::uuid;
        delete from public.personal_risk_evaluations where user_id=fixture_user;
      end if;
      if missing_no<=1 then delete from public.personal_risk_policy_versions where user_id=fixture_user; end if;
      if missing_no<=2 then
        delete from public.daily_risk_equity_bases where user_id=fixture_user;
        delete from public.weekly_risk_equity_bases where user_id=fixture_user;
        delete from public.broker_equity_snapshots where user_id=fixture_user;
      elsif missing_no=3 then delete from public.daily_risk_equity_bases where user_id=fixture_user;
      elsif missing_no=4 then delete from public.weekly_risk_equity_bases where user_id=fixture_user;
      end if;
      if missing_no<=5 then
        delete from public.broker_cost_schedule_components where user_id=fixture_user;
        delete from public.broker_cost_schedule_versions where user_id=fixture_user;
      end if;
      if missing_no=1 and (exists(select 1 from public.personal_risk_policy_versions where user_id=fixture_user) or exists(select 1 from public.broker_equity_snapshots where user_id=fixture_user) or exists(select 1 from public.broker_cost_schedule_versions where user_id=fixture_user)) then raise exception 'P8001 overlap fixture incomplete'; end if;
      if missing_no=2 and (exists(select 1 from public.broker_equity_snapshots where user_id=fixture_user) or exists(select 1 from public.broker_cost_schedule_versions where user_id=fixture_user)) then raise exception 'P8002 overlap fixture incomplete'; end if;
      if missing_no=3 and (exists(select 1 from public.daily_risk_equity_bases where user_id=fixture_user) or exists(select 1 from public.broker_cost_schedule_versions where user_id=fixture_user)) then raise exception 'P8003 overlap fixture incomplete'; end if;
      if missing_no=4 and (exists(select 1 from public.weekly_risk_equity_bases where user_id=fixture_user) or exists(select 1 from public.broker_cost_schedule_versions where user_id=fixture_user)) then raise exception 'P8004 overlap fixture incomplete'; end if;
      if missing_no=5 and exists(select 1 from public.broker_cost_schedule_versions where user_id=fixture_user) then raise exception 'P8005 fixture incomplete'; end if;
      select jsonb_build_array(
        (select count(*) from public.personal_risk_evaluations where user_id=fixture_user),(select count(*) from public.outcome_positions where user_id=fixture_user),
        (select count(*) from public.outcome_position_events where user_id=fixture_user),(select count(*) from public.outcome_position_risk_state where user_id=fixture_user),
        (select count(*) from public.outcome_position_increases where user_id=fixture_user),(select count(*) from public.outcome_protective_stop_changes where user_id=fixture_user),
        (select count(*) from public.outcome_exit_cost_allocations where user_id=fixture_user)) into before_counts;
      returned_state:=null;
      begin
        if action_name='OPEN_POSITION' then
          perform public.create_risk_enforced_outcome_position(gen_random_uuid(),'MISS'||missing_no,'US','USD','decision-parity',nowish-interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish-interval '1 minute',100,1,0,0,99,'OWNER_DECLARED');
        elsif action_name='INCREASE_POSITION' then
          perform public.increase_risk_enforced_position(fixture_position,gen_random_uuid(),nowish,1,100,0,0);
        else
          perform public.change_outcome_protective_stop(fixture_position,gen_random_uuid(),98,'OWNER_DECLARED');
        end if;
        raise exception 'reference case unexpectedly succeeded %/%',action_name,missing_no;
      exception when others then get stacked diagnostics returned_state=returned_sqlstate; end;
      expected_state:='P800'||missing_no;
      if returned_state<>expected_state then raise exception 'reference precedence %/% expected %, got %',action_name,missing_no,expected_state,returned_state; end if;
      select jsonb_build_array(
        (select count(*) from public.personal_risk_evaluations where user_id=fixture_user),(select count(*) from public.outcome_positions where user_id=fixture_user),
        (select count(*) from public.outcome_position_events where user_id=fixture_user),(select count(*) from public.outcome_position_risk_state where user_id=fixture_user),
        (select count(*) from public.outcome_position_increases where user_id=fixture_user),(select count(*) from public.outcome_protective_stop_changes where user_id=fixture_user),
        (select count(*) from public.outcome_exit_cost_allocations where user_id=fixture_user)) into after_counts;
      if after_counts is distinct from before_counts then raise exception 'raised reference error wrote lifecycle evidence %/%: % -> %',action_name,missing_no,before_counts,after_counts; end if;
      completed:=completed+1;
    end loop;
  end loop;

  -- Schedule-bound matrix. Opening and increase use lifecycle-produced state.
  -- Loosening uses a directly adjusted risk-state row because accepted opening
  -- and increase already enforce both bounds, and lowering a stop cannot make
  -- modeled proceeds cross upward through the schedule ceiling.
  for action_name in select unnest(array['OPEN_POSITION','INCREASE_POSITION','LOOSEN_STOP']) loop
    for missing_no in 10..11 loop
      fixture_user:=gen_random_uuid();
      insert into auth.users(id,email) values(fixture_user,'risk-decision-parity-'||fixture_user||'@local.invalid');
      perform set_config('request.jwt.claim.sub',fixture_user::text,true);
      perform * from public.create_personal_risk_policy_version(gen_random_uuid(),0.5,2,1,2.5,5,25);
      perform * from public.create_broker_equity_snapshot(gen_random_uuid(),100000000,'USD','Fixture Broker','OWNER_CONFIRMED_BROKER_VALUE','fixture:bound-matrix',nowish);
      perform * from public.create_broker_cost_schedule_version(gen_random_uuid(),day_start,'fixture:bound-matrix',nowish,'broker:bound-matrix','sec:bound-matrix','finra:bound-matrix','founder:bound-matrix');
      fixture_position:=null;
      if action_name<>'OPEN_POSITION' then
        result:=public.create_risk_enforced_outcome_position(gen_random_uuid(),'BOUND','US','USD','decision-parity',nowish-interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish-interval '1 minute',100,1,0,0,case when missing_no=10 then 99 else 1 end,'OWNER_DECLARED');
        if coalesce((result->>'accepted')::boolean,false) is not true then raise exception 'bound baseline open failed %/%: %',action_name,missing_no,result; end if;
        fixture_position:=(result->>'position_id')::uuid;
        if action_name='LOOSEN_STOP' then update public.outcome_position_risk_state set remaining_quantity=case when missing_no=10 then 2 else 10000.00000001 end,protective_stop_price=case when missing_no=10 then 99999 else 1 end where position_id=fixture_position; end if;
      end if;
      candidate_quantity:=case when action_name='OPEN_POSITION' then 10000.00000001 when action_name='INCREASE_POSITION' then case when missing_no=10 then 2001 else 10001 end else case when missing_no=10 then 2 else 10000.00000001 end end;
      candidate_stop:=case when action_name='OPEN_POSITION' then case when missing_no=10 then 20 else 1 end when action_name='INCREASE_POSITION' then case when missing_no=10 then 99 else 1 end else case when missing_no=10 then 90000 else 0.5 end end;
      select * into calc_values from public._risk008_calculate(candidate_quantity,100,candidate_stop,0,0,25);
      if missing_no=10 and calc_values.modeled_proceeds<=100000 then raise exception 'P8010 fixture does not exceed proceeds bound %/%',action_name,calc_values.modeled_proceeds; end if;
      if missing_no=10 and action_name='OPEN_POSITION' and candidate_quantity<=10000 then raise exception 'opening P8010 fixture does not overlap quantity bound'; end if;
      if missing_no=11 and (calc_values.modeled_proceeds>100000 or candidate_quantity<=10000) then raise exception 'P8011 fixture shape mismatch %: proceeds %, quantity %',action_name,calc_values.modeled_proceeds,candidate_quantity; end if;
      select jsonb_build_array(
        (select count(*) from public.personal_risk_evaluations where user_id=fixture_user),(select count(*) from public.outcome_positions where user_id=fixture_user),
        (select count(*) from public.outcome_position_events where user_id=fixture_user),(select count(*) from public.outcome_position_risk_state where user_id=fixture_user),
        (select count(*) from public.outcome_position_increases where user_id=fixture_user),(select count(*) from public.outcome_protective_stop_changes where user_id=fixture_user)) into before_counts;
      returned_state:=null;
      begin
        if action_name='OPEN_POSITION' then
          perform public.create_risk_enforced_outcome_position(gen_random_uuid(),'LIMIT','US','USD','decision-parity',nowish-interval '2 minutes','fixture thesis','fixture invalidation','swing',null,null,null,null,'BULLISH','SUPPORTIVE','UNKNOWN','COMPLIANT',provenance,true,nowish-interval '1 minute',100,10000.00000001,0,0,case when missing_no=10 then 20 else 1 end,'OWNER_DECLARED');
        elsif action_name='INCREASE_POSITION' then
          perform public.increase_risk_enforced_position(fixture_position,gen_random_uuid(),nowish,case when missing_no=10 then 2000 else 10000 end,100,0,0);
        else
          perform public.change_outcome_protective_stop(fixture_position,gen_random_uuid(),case when missing_no=10 then 90000 else 0.5 end,'OWNER_DECLARED');
        end if;
        raise exception 'bound case unexpectedly succeeded %/%',action_name,missing_no;
      exception when others then get stacked diagnostics returned_state=returned_sqlstate; end;
      expected_state:='P80'||missing_no;
      if returned_state<>expected_state then raise exception 'bound precedence %/% expected %, got %',action_name,missing_no,expected_state,returned_state; end if;
      select jsonb_build_array(
        (select count(*) from public.personal_risk_evaluations where user_id=fixture_user),(select count(*) from public.outcome_positions where user_id=fixture_user),
        (select count(*) from public.outcome_position_events where user_id=fixture_user),(select count(*) from public.outcome_position_risk_state where user_id=fixture_user),
        (select count(*) from public.outcome_position_increases where user_id=fixture_user),(select count(*) from public.outcome_protective_stop_changes where user_id=fixture_user)) into after_counts;
      if after_counts is distinct from before_counts then raise exception 'raised bound error wrote lifecycle evidence %/%: % -> %',action_name,missing_no,before_counts,after_counts; end if;
      completed:=completed+1;
    end loop;
  end loop;

  if completed<>37 then raise exception 'completed case count %, expected 37',completed; end if;

end
$test$;

select 'DECISION_PARITY_ASSERTIONS_OK';
select 'DECISION_PARITY_CASES_COMPLETED=37';
rollback;
select 'DECISION_PARITY_ROLLBACK_OK';
