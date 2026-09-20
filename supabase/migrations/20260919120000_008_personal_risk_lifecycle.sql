-- Migration 008: personal-risk lifecycle enforcement.
-- No object in migrations 001-007 is rewritten. Once any object below contains
-- evidence, correction is roll-forward only.

create table public.broker_cost_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version_no bigint not null check (version_no > 0),
  broker_legal_entity text not null check (broker_legal_entity = 'Saxo Financial Services (DIFC) Ltd / Saxo MENA'),
  pricing_tier text not null check (pricing_tier = 'Classic'),
  account_currency text not null check (account_currency = 'USD'),
  instrument_scope text not null check (instrument_scope = 'LONG_US_LISTED_CASH_EQUITY'),
  effective_from date not null,
  effective_through date check (effective_through is null or effective_through >= effective_from),
  supersedes_schedule_id uuid,
  maximum_modeled_sell_proceeds numeric(24,8) not null check (maximum_modeled_sell_proceeds = 100000.00000000),
  maximum_modeled_exit_quantity numeric(24,8) not null check (maximum_modeled_exit_quantity = 10000.00000000),
  evidence_reference text not null check (char_length(evidence_reference) between 8 and 240 and evidence_reference !~ '[[:cntrl:]]'),
  evidence_limitations text not null check (evidence_limitations = E'The allowance exceeds a pure SEC + FINRA calculation by a fixed 0.20 USD per modeled exit. That margin covers single-execution rounding. It does not cover multi-fill venue routing, and may understate cost if the broker splits a large order across venues and charges per fill.\nAt small order sizes the allowance is materially higher than Saxo''s own displayed estimate. On a 1,006.80 USD order Saxo displayed 0.22 USD of estimated non-commission cost; this allowance yields 0.50 USD.\nThe allowance brackets Saxo''s behaviour. It does not reproduce it. Saxo''s rounding, minimums, execution-splitting and venue-routing treatment remain unproven.'),
  evidence_captured_at timestamptz not null,
  client_idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint broker_cost_schedule_evidence_not_future check (evidence_captured_at <= created_at),
  unique (id,user_id), unique (user_id,version_no), unique (user_id,client_idempotency_key),
  foreign key (supersedes_schedule_id,user_id) references public.broker_cost_schedule_versions(id,user_id),
  check (supersedes_schedule_id is null or supersedes_schedule_id <> id)
);

create table public.broker_cost_schedule_components (
  id uuid primary key default gen_random_uuid(), schedule_id uuid not null, user_id uuid not null,
  component_code text not null check (component_code in ('CLOSE_COMMISSION','SEC_REFERENCE','FINRA_TAF_REFERENCE','REGULATORY_ALLOWANCE')),
  evidence_class text not null check (evidence_class in ('BROKER_PROVEN','REGULATOR_PUBLISHED','FOUNDER_APPROVED_ALLOWANCE','REALIZED_HISTORICAL_COST')),
  application_mode text not null check (application_mode in ('DERIVED_CHARGE','REFERENCE_ONLY','FIXED_OR_FORMULA_ALLOWANCE')),
  proceeds_rate numeric(16,12), quantity_rate numeric(16,12), minimum_amount numeric(24,8),
  maximum_amount numeric(24,8), fixed_amount numeric(24,8),
  source_authority text not null check (char_length(source_authority) between 1 and 120),
  source_reference text not null check (char_length(source_reference) between 8 and 240 and source_reference !~ '[[:cntrl:]]'),
  source_effective_from date,
  evidence_limitations text not null check (char_length(evidence_limitations) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique (id,user_id), unique (schedule_id,component_code),
  foreign key (schedule_id,user_id) references public.broker_cost_schedule_versions(id,user_id) on delete cascade,
  constraint broker_cost_component_shape check (
    (component_code='CLOSE_COMMISSION' and evidence_class='BROKER_PROVEN' and application_mode='DERIVED_CHARGE'
      and proceeds_rate=0.000800000000 and quantity_rate is null and minimum_amount=1.00000000 and maximum_amount is null and fixed_amount is null) or
    (component_code='SEC_REFERENCE' and evidence_class='REGULATOR_PUBLISHED' and application_mode='REFERENCE_ONLY'
      and proceeds_rate=0.000020600000 and quantity_rate is null and minimum_amount is null and maximum_amount is null and fixed_amount is null) or
    (component_code='FINRA_TAF_REFERENCE' and evidence_class='REGULATOR_PUBLISHED' and application_mode='REFERENCE_ONLY'
      and proceeds_rate is null and quantity_rate=0.000195000000 and minimum_amount is null and maximum_amount=9.79000000 and fixed_amount is null) or
    (component_code='REGULATORY_ALLOWANCE' and evidence_class='FOUNDER_APPROVED_ALLOWANCE' and application_mode='FIXED_OR_FORMULA_ALLOWANCE'
      and proceeds_rate=0.000020600000 and quantity_rate=0.000195000000 and minimum_amount=0.50000000 and maximum_amount is null and fixed_amount=0.20000000)
  )
);

create table public.outcome_position_risk_state (
  position_id uuid primary key, user_id uuid not null,
  remaining_quantity numeric(24,8) not null check (remaining_quantity >= 0),
  weighted_entry_price numeric(24,8) not null check (weighted_entry_price > 0),
  protective_stop_price numeric(24,8) not null check (protective_stop_price > 0),
  protective_stop_evidence text not null check (protective_stop_evidence in ('OWNER_DECLARED','BROKER_CONFIRMED')),
  remaining_entry_fee_pool numeric(24,8) not null check (remaining_entry_fee_pool >= 0),
  remaining_entry_tax_pool numeric(24,8) not null check (remaining_entry_tax_pool >= 0),
  current_planned_loss_contribution numeric(24,8) not null check (current_planned_loss_contribution >= 0),
  state_version bigint not null check (state_version > 0), updated_at timestamptz not null default clock_timestamp(),
  unique(position_id,user_id),
  foreign key(position_id,user_id) references public.outcome_positions(id,user_id) on delete cascade
);

create table public.outcome_position_increases (
  id bigint generated always as identity primary key, position_id uuid not null, user_id uuid not null,
  client_idempotency_key uuid not null, request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  broker_effective_at timestamptz not null, added_quantity numeric(24,8) not null check(added_quantity>0),
  added_entry_price numeric(24,8) not null check(added_entry_price>0), entry_fee numeric(24,8) not null check(entry_fee>=0),
  entry_tax numeric(24,8) not null check(entry_tax>=0), result_quantity numeric(24,8) not null check(result_quantity>0),
  result_weighted_entry numeric(24,8) not null check(result_weighted_entry>0), created_at timestamptz not null default clock_timestamp(),
  unique(id,position_id,user_id), unique(user_id,client_idempotency_key),
  foreign key(position_id,user_id) references public.outcome_positions(id,user_id),
  constraint outcome_position_increases_not_future check(broker_effective_at<=created_at)
);

create table public.outcome_protective_stop_changes (
  id bigint generated always as identity primary key, position_id uuid not null, user_id uuid not null,
  client_idempotency_key uuid not null, request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  prior_stop numeric(24,8) not null check(prior_stop>0), new_stop numeric(24,8) not null check(new_stop>0),
  evidence_class text not null check(evidence_class in ('OWNER_DECLARED','BROKER_CONFIRMED')),
  direction text not null check(direction in ('TIGHTENING','LOOSENING')), created_at timestamptz not null default clock_timestamp(),
  unique(id,position_id,user_id), unique(user_id,client_idempotency_key),
  foreign key(position_id,user_id) references public.outcome_positions(id,user_id),
  check((direction='TIGHTENING' and new_stop>prior_stop) or (direction='LOOSENING' and new_stop<prior_stop))
);

create table public.outcome_exit_cost_allocations (
  event_id bigint primary key, position_id uuid not null, user_id uuid not null,
  allocated_entry_fee numeric(24,8) not null check(allocated_entry_fee>=0),
  allocated_entry_tax numeric(24,8) not null check(allocated_entry_tax>=0),
  realized_pnl numeric(24,8) not null, gross_realized_loss numeric(24,8) not null check(gross_realized_loss>=0),
  ny_day date not null, ny_week date not null,
  foreign key(event_id,position_id,user_id) references public.outcome_position_events(id,position_id,user_id),
  foreign key(position_id,user_id) references public.outcome_positions(id,user_id)
);

create table public.personal_risk_evaluations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check(action_type in ('OPEN_POSITION','INCREASE_POSITION','LOOSEN_STOP')),
  accepted boolean not null, rejection_code text,
  threshold_kind text not null check(threshold_kind in ('PROTECTIVE_STOP_REQUIRED','PER_POSITION_PLANNED_LOSS','AGGREGATE_OPEN_PLANNED_LOSS','DAILY_GROSS_REALIZED_LOSS','WEEKLY_GROSS_REALIZED_LOSS','MAXIMUM_CONCURRENT_POSITIONS','NONE')),
  attempted_protective_stop numeric(24,8), required_stop_presence boolean not null, observed_stop_presence boolean not null,
  attempted_inputs jsonb not null check(jsonb_typeof(attempted_inputs)='object'),
  client_idempotency_key uuid not null, request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  policy_version_id uuid not null, equity_snapshot_id uuid not null, daily_basis_id uuid not null,
  weekly_basis_id uuid not null, cost_schedule_version_id uuid not null,
  resulting_position_id uuid, resulting_event_id bigint, resulting_increase_id bigint, resulting_stop_change_id bigint,
  remaining_quantity numeric(24,8) not null, weighted_entry_price numeric(24,8) not null,
  remaining_entry_fee_pool numeric(24,8) not null, remaining_entry_tax_pool numeric(24,8) not null,
  modeled_sell_proceeds numeric(24,8), close_commission numeric(24,8), allowance_floor numeric(24,8),
  allowance_value_component numeric(24,8), allowance_quantity_component numeric(24,8), allowance_fixed_saxo_buffer numeric(24,8),
  selected_regulatory_allowance numeric(24,8), slippage_rate numeric(9,6) not null, slippage_amount numeric(24,8),
  estimated_exit_cost numeric(24,8), raw_planned_loss numeric(24,8), planned_loss_contribution numeric(24,8),
  monetary_threshold numeric(24,8), monetary_observed_value numeric(24,8), evaluated_at timestamptz not null default clock_timestamp(),
  unique(id,user_id), unique(user_id,client_idempotency_key),
  foreign key(policy_version_id,user_id) references public.personal_risk_policy_versions(id,user_id),
  foreign key(equity_snapshot_id,user_id) references public.broker_equity_snapshots(id,user_id),
  foreign key(daily_basis_id,user_id) references public.daily_risk_equity_bases(id,user_id),
  foreign key(weekly_basis_id,user_id) references public.weekly_risk_equity_bases(id,user_id),
  foreign key(cost_schedule_version_id,user_id) references public.broker_cost_schedule_versions(id,user_id),
  foreign key(resulting_position_id,user_id) references public.outcome_positions(id,user_id),
  foreign key(resulting_event_id,resulting_position_id,user_id) references public.outcome_position_events(id,position_id,user_id),
  foreign key(resulting_increase_id,resulting_position_id,user_id) references public.outcome_position_increases(id,position_id,user_id),
  foreign key(resulting_stop_change_id,resulting_position_id,user_id) references public.outcome_protective_stop_changes(id,position_id,user_id),
  constraint personal_risk_evaluations_decision_shape check(
    (accepted and rejection_code is null and threshold_kind='NONE' and (
      (action_type='OPEN_POSITION' and resulting_position_id is not null and resulting_event_id is not null and resulting_increase_id is null and resulting_stop_change_id is null) or
      (action_type='INCREASE_POSITION' and resulting_position_id is not null and resulting_event_id is null and resulting_increase_id is not null and resulting_stop_change_id is null) or
      (action_type='LOOSEN_STOP' and resulting_position_id is not null and resulting_event_id is null and resulting_increase_id is null and resulting_stop_change_id is not null)))
    or (not accepted and rejection_code in ('MISSING_PROTECTIVE_STOP','PER_POSITION_PLANNED_LOSS_LIMIT','AGGREGATE_OPEN_PLANNED_LOSS_LIMIT','DAILY_GROSS_REALIZED_LOSS_LIMIT','WEEKLY_GROSS_REALIZED_LOSS_LIMIT','MAXIMUM_CONCURRENT_POSITIONS') and num_nonnulls(resulting_position_id,resulting_event_id,resulting_increase_id,resulting_stop_change_id)=0)
  ),
  constraint personal_risk_evaluations_rejection_threshold_shape check(
    (accepted and rejection_code is null and threshold_kind='NONE' and monetary_threshold is null and monetary_observed_value is null)
    or (not accepted and (
      (rejection_code='MISSING_PROTECTIVE_STOP' and threshold_kind='PROTECTIVE_STOP_REQUIRED' and monetary_threshold is null and monetary_observed_value is null) or
      (rejection_code='PER_POSITION_PLANNED_LOSS_LIMIT' and threshold_kind='PER_POSITION_PLANNED_LOSS' and monetary_threshold is not null and monetary_observed_value is not null) or
      (rejection_code='AGGREGATE_OPEN_PLANNED_LOSS_LIMIT' and threshold_kind='AGGREGATE_OPEN_PLANNED_LOSS' and monetary_threshold is not null and monetary_observed_value is not null) or
      (rejection_code='DAILY_GROSS_REALIZED_LOSS_LIMIT' and threshold_kind='DAILY_GROSS_REALIZED_LOSS' and monetary_threshold is not null and monetary_observed_value is not null) or
      (rejection_code='WEEKLY_GROSS_REALIZED_LOSS_LIMIT' and threshold_kind='WEEKLY_GROSS_REALIZED_LOSS' and monetary_threshold is not null and monetary_observed_value is not null) or
      (rejection_code='MAXIMUM_CONCURRENT_POSITIONS' and threshold_kind='MAXIMUM_CONCURRENT_POSITIONS' and monetary_threshold is not null and monetary_observed_value is not null)
    ))
  ),
  constraint personal_risk_evaluations_calculation_shape check(
    (rejection_code='MISSING_PROTECTIVE_STOP' and not accepted and threshold_kind='PROTECTIVE_STOP_REQUIRED'
      and attempted_protective_stop is null and required_stop_presence and not observed_stop_presence
      and num_nonnulls(modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value)=0)
    or
    (rejection_code is distinct from 'MISSING_PROTECTIVE_STOP' and attempted_protective_stop is not null
      and required_stop_presence and observed_stop_presence
      and num_nonnulls(modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution)=11
      and ((accepted and monetary_threshold is null and monetary_observed_value is null)
        or (not accepted and monetary_threshold is not null and monetary_observed_value is not null)))
  )
);

create index broker_cost_schedule_owner_effective_idx on public.broker_cost_schedule_versions(user_id,effective_from desc,version_no desc);
create index outcome_risk_state_owner_open_idx on public.outcome_position_risk_state(user_id,remaining_quantity);
create index outcome_increases_position_idx on public.outcome_position_increases(position_id,created_at);
create index outcome_stop_changes_position_idx on public.outcome_protective_stop_changes(position_id,created_at);
create index risk_evaluations_owner_time_idx on public.personal_risk_evaluations(user_id,evaluated_at desc);
create index exit_allocations_owner_day_idx on public.outcome_exit_cost_allocations(user_id,ny_day);
create index exit_allocations_owner_week_idx on public.outcome_exit_cost_allocations(user_id,ny_week);

do $$ declare v_table text; begin
 foreach v_table in array array[
  'broker_cost_schedule_versions','broker_cost_schedule_components','outcome_position_risk_state',
  'outcome_position_increases','outcome_protective_stop_changes','outcome_exit_cost_allocations','personal_risk_evaluations'
 ] loop
  execute format('alter table public.%I enable row level security',v_table);
  execute format('alter table public.%I force row level security',v_table);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',v_table);
  execute format('grant select on public.%I to authenticated',v_table);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=user_id)',v_table||'_select_own',v_table);
 end loop;
end $$;

create function public.append_risk_lifecycle_event(p_position_id uuid,p_idempotency_key uuid,p_event_type text,
 p_broker_confirmed boolean default false,p_broker_effective_at timestamptz default null,p_price numeric default null,p_quantity numeric default null,
 p_fees numeric default null,p_taxes numeric default null,p_thesis_result text default null,p_usefulness text default null,p_exit_reason text default null,p_owner_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare
 u uuid:=auth.uid(); st public.outcome_position_risk_state%rowtype; old public.outcome_position_events%rowtype; prior_eval public.personal_risk_evaluations%rowtype; c record;
 fp text; seq integer; eid bigint; alloc_fee numeric; alloc_tax numeric; pnl numeric; gross numeric; nq numeric; cumulative numeric; ret numeric; new_contribution numeric:=0;
begin
 if u is null then raise exception using errcode='42501',message='authentication required'; end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='idempotency key required'; end if;
 if (p_price is not null and (scale(p_price)>8 or p_price<=0)) or (p_quantity is not null and (scale(p_quantity)>8 or p_quantity<=0))
  or (p_fees is not null and (scale(p_fees)>8 or p_fees<0)) or (p_taxes is not null and (scale(p_taxes)>8 or p_taxes<0))
 then raise exception using errcode='22003',message='numeric input exceeds risk lifecycle precision contract'; end if;
 if p_event_type not in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED','OWNER_NOTE','HIDDEN_BY_OWNER') then raise exception using errcode='22023',message='invalid event type'; end if;
 if p_event_type in ('OWNER_NOTE','HIDDEN_BY_OWNER') and num_nonnulls(p_broker_effective_at,p_price,p_quantity,p_fees,p_taxes)>0 then raise exception using errcode='22023',message='execution field not permitted on non-execution event'; end if;
 if p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') and (not coalesce(p_broker_confirmed,false) or p_broker_effective_at is null or p_price is null or p_quantity is null or p_fees is null or p_taxes is null) then raise exception using errcode='22023',message='invalid broker exit'; end if;
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('contract',1,'position_id',p_position_id,'event_type',p_event_type,'broker_confirmed',p_broker_confirmed,'broker_effective_at',p_broker_effective_at,'price',p_price,'quantity',p_quantity,'fees',p_fees,'taxes',p_taxes,'thesis_result',p_thesis_result,'usefulness',p_usefulness,'exit_reason',p_exit_reason,'owner_note',p_owner_note)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 select * into old from public.outcome_position_events where user_id=u and client_idempotency_key=p_idempotency_key;
 if found then if old.position_id<>p_position_id or old.request_fingerprint<>fp then raise exception using errcode='23505',message='idempotency conflict'; end if; return jsonb_build_object('event_id',old.id,'open_quantity',old.result_open_quantity,'realized_pnl',old.result_realized_pl,'replayed',true); end if;
 if exists(select 1 from public.personal_risk_evaluations where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_increases where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_protective_stop_changes where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_positions where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.broker_cost_schedule_versions where user_id=u and client_idempotency_key=p_idempotency_key)
 then raise exception using errcode='23505',message='idempotency conflict'; end if;
 perform 1 from public.outcome_positions where id=p_position_id and user_id=u; if not found then raise exception using errcode='42501',message='position unavailable'; end if;
 select * into st from public.outcome_position_risk_state where position_id=p_position_id and user_id=u for update; if not found then raise exception using errcode='22023',message='position lacks Migration 008 risk state'; end if;
 select coalesce(max(sequence_no),0)+1 into seq from public.outcome_position_events where position_id=p_position_id;
 if p_event_type in ('OWNER_NOTE','HIDDEN_BY_OWNER') then
  insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,price,quantity,fees,taxes,thesis_result,usefulness,exit_reason,owner_note,result_open_quantity,result_realized_pl,result_realized_return_pct)
  values(p_position_id,u,seq,p_event_type,p_idempotency_key,fp,false,null,null,null,null,null,p_thesis_result,p_usefulness,p_exit_reason,p_owner_note,st.remaining_quantity,coalesce((select sum(realized_pnl) from public.outcome_exit_cost_allocations where position_id=p_position_id),0),null) returning id into eid;
  return jsonb_build_object('event_id',eid,'open_quantity',st.remaining_quantity,'replayed',false);
 end if;
 if p_broker_effective_at<(select broker_effective_at from public.outcome_position_events where position_id=p_position_id and sequence_no=1)
  or p_broker_effective_at<coalesce((select max(broker_effective_at) from public.outcome_position_events where position_id=p_position_id and event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED')),p_broker_effective_at)
  or p_broker_effective_at<coalesce((select max(broker_effective_at) from public.outcome_position_increases where position_id=p_position_id),p_broker_effective_at)
 then raise exception using errcode='22023',message='broker event is out of order'; end if;
 if p_quantity>st.remaining_quantity then raise exception using errcode='22023',message='exit quantity exceeds open quantity'; end if;
 if p_event_type='PARTIAL_EXIT_CONFIRMED' and p_quantity>=st.remaining_quantity then raise exception using errcode='22023',message='partial exit must leave open quantity'; end if;
 if p_event_type='FINAL_EXIT_CONFIRMED' and p_quantity<>st.remaining_quantity then raise exception using errcode='22023',message='final exit must close exact quantity'; end if;
 if p_event_type='FINAL_EXIT_CONFIRMED' then alloc_fee:=st.remaining_entry_fee_pool;alloc_tax:=st.remaining_entry_tax_pool;
 else alloc_fee:=round(st.remaining_entry_fee_pool*p_quantity/st.remaining_quantity,8);alloc_tax:=round(st.remaining_entry_tax_pool*p_quantity/st.remaining_quantity,8); end if;
 pnl:=round(p_quantity*(p_price-st.weighted_entry_price)-alloc_fee-alloc_tax-p_fees-p_taxes,8);gross:=greatest(0,-pnl);nq:=st.remaining_quantity-p_quantity;
 if nq>0 then
  select * into prior_eval from public.personal_risk_evaluations where user_id=u and resulting_position_id=p_position_id and accepted order by evaluated_at desc limit 1;
  if found then select * into c from public._risk008_calculate(nq,st.weighted_entry_price,st.protective_stop_price,st.remaining_entry_fee_pool-alloc_fee,st.remaining_entry_tax_pool-alloc_tax,prior_eval.slippage_rate*10000);new_contribution:=c.contribution;
  else new_contribution:=st.current_planned_loss_contribution; end if;
 end if;
 cumulative:=coalesce((select sum(realized_pnl) from public.outcome_exit_cost_allocations where position_id=p_position_id),0)+pnl;
 ret:=case when p_quantity=0 then null else round(pnl/(st.weighted_entry_price*p_quantity+alloc_fee+alloc_tax)*100,8) end;
 insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,price,quantity,fees,taxes,thesis_result,usefulness,exit_reason,owner_note,result_open_quantity,result_realized_pl,result_realized_return_pct)
 values(p_position_id,u,seq,p_event_type,p_idempotency_key,fp,true,p_broker_effective_at,p_price,p_quantity,p_fees,p_taxes,p_thesis_result,p_usefulness,p_exit_reason,p_owner_note,nq,cumulative,ret) returning id into eid;
 insert into public.outcome_exit_cost_allocations values(eid,p_position_id,u,alloc_fee,alloc_tax,pnl,gross,(p_broker_effective_at at time zone 'America/New_York')::date,date_trunc('week',p_broker_effective_at at time zone 'America/New_York')::date);
 update public.outcome_position_risk_state set remaining_quantity=nq,remaining_entry_fee_pool=case when nq=0 then 0 else remaining_entry_fee_pool-alloc_fee end,
  remaining_entry_tax_pool=case when nq=0 then 0 else remaining_entry_tax_pool-alloc_tax end,current_planned_loss_contribution=new_contribution,
  state_version=state_version+1,updated_at=clock_timestamp() where position_id=p_position_id;
 return jsonb_build_object('event_id',eid,'open_quantity',nq,'realized_pnl',pnl,'gross_realized_loss',gross,'allocated_entry_fee',alloc_fee,'allocated_entry_tax',alloc_tax,'replayed',false);
end $$;

create function public.change_outcome_protective_stop(p_position_id uuid,p_idempotency_key uuid,p_new_stop numeric,p_evidence_class text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare
 u uuid:=auth.uid(); st public.outcome_position_risk_state%rowtype; prior public.outcome_protective_stop_changes%rowtype; old public.personal_risk_evaluations%rowtype;
 pol public.personal_risk_policy_versions%rowtype; eq public.broker_equity_snapshots%rowtype; db public.daily_risk_equity_bases%rowtype; wb public.weekly_risk_equity_bases%rowtype; cs public.broker_cost_schedule_versions%rowtype;
 fp text; direction text; c record; prior_eval public.personal_risk_evaluations%rowtype; new_contribution numeric; agg numeric; dl numeric; wl numeric; reason text; kind text:='NONE'; threshold numeric; observed numeric; sid bigint; eid uuid; attempt jsonb;
begin
 if u is null then raise exception using errcode='42501',message='authentication required'; end if;
 if p_idempotency_key is null or p_new_stop is null or scale(p_new_stop)>8 or p_new_stop<=0 or p_evidence_class not in ('OWNER_DECLARED','BROKER_CONFIRMED') then raise exception using errcode='22023',message='invalid protective stop change'; end if;
 attempt:=jsonb_build_object('action','CHANGE_STOP','idempotency_key',p_idempotency_key,'position_id',p_position_id,'new_stop',p_new_stop,'evidence_class',p_evidence_class);
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('contract',1,'attempted_request',attempt)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 select * into old from public.personal_risk_evaluations where user_id=u and client_idempotency_key=p_idempotency_key;
 if found then if old.request_fingerprint<>fp then raise exception using errcode='23505',message='idempotency conflict'; end if; return jsonb_build_object('accepted',old.accepted,'evaluation_id',old.id,'rejection_code',old.rejection_code,'stop_change_id',old.resulting_stop_change_id,'replayed',true); end if;
 select * into prior from public.outcome_protective_stop_changes where user_id=u and client_idempotency_key=p_idempotency_key;
 if found then if prior.request_fingerprint<>fp then raise exception using errcode='23505',message='idempotency conflict'; end if; return jsonb_build_object('accepted',true,'stop_change_id',prior.id,'direction',prior.direction,'replayed',true); end if;
 if exists(select 1 from public.outcome_position_events where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_increases where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_positions where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.broker_cost_schedule_versions where user_id=u and client_idempotency_key=p_idempotency_key)
 then raise exception using errcode='23505',message='idempotency conflict'; end if;
 select * into st from public.outcome_position_risk_state where position_id=p_position_id and user_id=u for update;
 if not found then raise exception using errcode='42501',message='position unavailable'; end if;
 if st.remaining_quantity<=0 then raise exception using errcode='22023',message='position already closed'; end if;
 if p_new_stop=st.protective_stop_price then raise exception using errcode='22023',message='unchanged protective stop'; end if;
 direction:=case when p_new_stop>st.protective_stop_price then 'TIGHTENING' else 'LOOSENING' end;
 if direction='TIGHTENING' then
  new_contribution:=st.current_planned_loss_contribution;
  select * into prior_eval from public.personal_risk_evaluations where user_id=u and resulting_position_id=p_position_id and accepted order by evaluated_at desc limit 1;
  if found then select * into c from public._risk008_calculate(st.remaining_quantity,st.weighted_entry_price,p_new_stop,st.remaining_entry_fee_pool,st.remaining_entry_tax_pool,prior_eval.slippage_rate*10000);new_contribution:=c.contribution; end if;
  insert into public.outcome_protective_stop_changes(position_id,user_id,client_idempotency_key,request_fingerprint,prior_stop,new_stop,evidence_class,direction)
   values(p_position_id,u,p_idempotency_key,fp,st.protective_stop_price,p_new_stop,p_evidence_class,direction) returning id into sid;
  update public.outcome_position_risk_state set protective_stop_price=p_new_stop,protective_stop_evidence=p_evidence_class,
   current_planned_loss_contribution=new_contribution,state_version=state_version+1,updated_at=clock_timestamp() where position_id=p_position_id;
  return jsonb_build_object('accepted',true,'stop_change_id',sid,'direction',direction,'replayed',false);
 end if;
 select * into pol from public.personal_risk_policy_versions where user_id=u order by version_no desc limit 1; if not found then raise exception using errcode='P8001',message='risk precondition failed: no applicable policy'; end if;
 select * into eq from public.broker_equity_snapshots where user_id=u and currency='USD' order by recorded_at desc,id desc limit 1; if not found then raise exception using errcode='P8002',message='risk precondition failed: no authoritative USD equity snapshot'; end if;
 select * into db from public.daily_risk_equity_bases where user_id=u and source_snapshot_id=eq.id and period_start=(clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1; if not found then raise exception using errcode='P8003',message='risk precondition failed: no authoritative current daily basis'; end if;
 select * into wb from public.weekly_risk_equity_bases where user_id=u and source_snapshot_id=eq.id and period_start=date_trunc('week',clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1; if not found then raise exception using errcode='P8004',message='risk precondition failed: no authoritative current weekly basis'; end if;
 select * into cs from public.broker_cost_schedule_versions where user_id=u and effective_from<=(clock_timestamp() at time zone 'America/New_York')::date and (effective_through is null or effective_through>=(clock_timestamp() at time zone 'America/New_York')::date) order by version_no desc limit 1; if not found then raise exception using errcode='P8005',message='risk precondition failed: no applicable broker cost schedule'; end if;
 select * into c from public._risk008_calculate(st.remaining_quantity,st.weighted_entry_price,p_new_stop,st.remaining_entry_fee_pool,st.remaining_entry_tax_pool,pol.estimated_exit_slippage_bps);
 if c.modeled_proceeds>cs.maximum_modeled_sell_proceeds then raise exception using errcode='P8010',message='risk precondition failed: modeled sell proceeds exceeds 100000.00 USD'; end if;
 if st.remaining_quantity>cs.maximum_modeled_exit_quantity then raise exception using errcode='P8011',message='risk precondition failed: remaining quantity exceeds 10000 shares'; end if;
 select coalesce(sum(current_planned_loss_contribution),0)-st.current_planned_loss_contribution into agg from public.outcome_position_risk_state where user_id=u and remaining_quantity>0;
 select coalesce(sum(gross_realized_loss),0) into dl from public.outcome_exit_cost_allocations where user_id=u and ny_day=db.period_start;
 select coalesce(sum(gross_realized_loss),0) into wl from public.outcome_exit_cost_allocations where user_id=u and ny_week=wb.period_start;
 if c.contribution>eq.account_equity*pol.max_planned_loss_per_position_pct/100 then reason:='PER_POSITION_PLANNED_LOSS_LIMIT';kind:='PER_POSITION_PLANNED_LOSS';threshold:=eq.account_equity*pol.max_planned_loss_per_position_pct/100;observed:=c.contribution;
 elsif agg+c.contribution>eq.account_equity*pol.max_aggregate_open_planned_loss_pct/100 then reason:='AGGREGATE_OPEN_PLANNED_LOSS_LIMIT';kind:='AGGREGATE_OPEN_PLANNED_LOSS';threshold:=eq.account_equity*pol.max_aggregate_open_planned_loss_pct/100;observed:=agg+c.contribution;
 elsif dl>=db.effective_equity*pol.daily_realized_gross_loss_limit_pct/100 then reason:='DAILY_GROSS_REALIZED_LOSS_LIMIT';kind:='DAILY_GROSS_REALIZED_LOSS';threshold:=db.effective_equity*pol.daily_realized_gross_loss_limit_pct/100;observed:=dl;
 elsif wl>=wb.effective_equity*pol.weekly_realized_gross_loss_limit_pct/100 then reason:='WEEKLY_GROSS_REALIZED_LOSS_LIMIT';kind:='WEEKLY_GROSS_REALIZED_LOSS';threshold:=wb.effective_equity*pol.weekly_realized_gross_loss_limit_pct/100;observed:=wl; end if;
 if reason is null then insert into public.outcome_protective_stop_changes(position_id,user_id,client_idempotency_key,request_fingerprint,prior_stop,new_stop,evidence_class,direction) values(p_position_id,u,p_idempotency_key,fp,st.protective_stop_price,p_new_stop,p_evidence_class,direction) returning id into sid;
  update public.outcome_position_risk_state set protective_stop_price=p_new_stop,protective_stop_evidence=p_evidence_class,current_planned_loss_contribution=c.contribution,state_version=state_version+1,updated_at=clock_timestamp() where position_id=p_position_id; end if;
 insert into public.personal_risk_evaluations(user_id,action_type,accepted,rejection_code,threshold_kind,attempted_protective_stop,required_stop_presence,observed_stop_presence,attempted_inputs,client_idempotency_key,request_fingerprint,policy_version_id,equity_snapshot_id,daily_basis_id,weekly_basis_id,cost_schedule_version_id,resulting_position_id,resulting_stop_change_id,remaining_quantity,weighted_entry_price,remaining_entry_fee_pool,remaining_entry_tax_pool,modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_rate,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value)
 values(u,'LOOSEN_STOP',reason is null,reason,kind,p_new_stop,true,true,attempt,p_idempotency_key,fp,pol.id,eq.id,db.id,wb.id,cs.id,case when reason is null then p_position_id end,sid,st.remaining_quantity,st.weighted_entry_price,st.remaining_entry_fee_pool,st.remaining_entry_tax_pool,c.modeled_proceeds,c.close_commission,c.allowance_floor,c.allowance_value,c.allowance_quantity,c.allowance_buffer,c.allowance_selected,c.slippage_rate,c.slippage_amount,c.exit_cost,c.raw_loss,c.contribution,threshold,observed) returning id into eid;
 return jsonb_build_object('accepted',reason is null,'evaluation_id',eid,'rejection_code',reason,'stop_change_id',sid,'policy_version_id',pol.id,'equity_snapshot_id',eq.id,'daily_basis_id',db.id,'weekly_basis_id',wb.id,'cost_schedule_version_id',cs.id,'planned_loss_contribution',c.contribution,'replayed',false);
end $$;

create function public.increase_risk_enforced_position(p_position_id uuid,p_idempotency_key uuid,p_broker_effective_at timestamptz,
 p_added_quantity numeric,p_added_entry_price numeric,p_entry_fee numeric,p_entry_tax numeric)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare
 u uuid:=auth.uid(); st public.outcome_position_risk_state%rowtype; pol public.personal_risk_policy_versions%rowtype;
 eq public.broker_equity_snapshots%rowtype; db public.daily_risk_equity_bases%rowtype; wb public.weekly_risk_equity_bases%rowtype;
 cs public.broker_cost_schedule_versions%rowtype; old public.personal_risk_evaluations%rowtype; c record;
 fp text; nq numeric; ne numeric; nf numeric; nt numeric; agg numeric; dl numeric; wl numeric; reason text; kind text:='NONE'; threshold numeric; observed numeric; inc bigint; ev uuid; attempt jsonb;
begin
 if u is null then raise exception using errcode='42501',message='authentication required'; end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='idempotency key required'; end if;
 if p_added_quantity is null or scale(p_added_quantity)>8 or p_added_quantity<=0 or p_added_entry_price is null or scale(p_added_entry_price)>8 or p_added_entry_price<=0
  or p_entry_fee is null or scale(p_entry_fee)>8 or p_entry_fee<0 or p_entry_tax is null or scale(p_entry_tax)>8 or p_entry_tax<0 or p_broker_effective_at is null or p_broker_effective_at>clock_timestamp()
 then raise exception using errcode='22023',message='invalid position increase'; end if;
 attempt:=jsonb_build_object('action','INCREASE_POSITION','idempotency_key',p_idempotency_key,'position_id',p_position_id,'broker_effective_at',p_broker_effective_at,'added_quantity',p_added_quantity,'added_entry_price',p_added_entry_price,'entry_fee',p_entry_fee,'entry_tax',p_entry_tax);
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('contract',1,'attempted_request',attempt)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
 select * into old from public.personal_risk_evaluations where user_id=u and client_idempotency_key=p_idempotency_key;
 if found then if old.request_fingerprint<>fp then raise exception using errcode='23505',message='idempotency conflict'; end if;
  return jsonb_build_object('accepted',old.accepted,'evaluation_id',old.id,'rejection_code',old.rejection_code,'increase_id',old.resulting_increase_id,'policy_version_id',old.policy_version_id,'equity_snapshot_id',old.equity_snapshot_id,'daily_basis_id',old.daily_basis_id,'weekly_basis_id',old.weekly_basis_id,'cost_schedule_version_id',old.cost_schedule_version_id,'replayed',true); end if;
 if exists(select 1 from public.outcome_position_events where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_protective_stop_changes where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_positions where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.broker_cost_schedule_versions where user_id=u and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_increases where user_id=u and client_idempotency_key=p_idempotency_key)
 then raise exception using errcode='23505',message='idempotency conflict'; end if;
 select * into st from public.outcome_position_risk_state where position_id=p_position_id and user_id=u for update;
 if not found then raise exception using errcode='42501',message='position unavailable'; end if;
 if st.remaining_quantity<=0 then raise exception using errcode='22023',message='position already closed'; end if;
 if p_broker_effective_at<greatest(
   (select broker_effective_at from public.outcome_position_events where position_id=p_position_id and sequence_no=1),
   coalesce((select max(broker_effective_at) from public.outcome_position_events where position_id=p_position_id and event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED')),'-infinity'::timestamptz),
   coalesce((select max(broker_effective_at) from public.outcome_position_increases where position_id=p_position_id),'-infinity'::timestamptz))
 then raise exception using errcode='22023',message='broker event is out of order'; end if;
 select * into pol from public.personal_risk_policy_versions where user_id=u order by version_no desc limit 1;
 if not found then raise exception using errcode='P8001',message='risk precondition failed: no applicable policy'; end if;
 select * into eq from public.broker_equity_snapshots where user_id=u and currency='USD' order by recorded_at desc,id desc limit 1;
 if not found then raise exception using errcode='P8002',message='risk precondition failed: no authoritative USD equity snapshot'; end if;
 select * into db from public.daily_risk_equity_bases where user_id=u and source_snapshot_id=eq.id and period_start=(clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1;
 if not found then raise exception using errcode='P8003',message='risk precondition failed: no authoritative current daily basis'; end if;
 select * into wb from public.weekly_risk_equity_bases where user_id=u and source_snapshot_id=eq.id and period_start=date_trunc('week',clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1;
 if not found then raise exception using errcode='P8004',message='risk precondition failed: no authoritative current weekly basis'; end if;
 select * into cs from public.broker_cost_schedule_versions where user_id=u and effective_from<=(clock_timestamp() at time zone 'America/New_York')::date and (effective_through is null or effective_through>=(clock_timestamp() at time zone 'America/New_York')::date) order by version_no desc limit 1;
 if not found then raise exception using errcode='P8005',message='risk precondition failed: no applicable broker cost schedule'; end if;
 nq:=st.remaining_quantity+p_added_quantity; ne:=(st.remaining_quantity*st.weighted_entry_price+p_added_quantity*p_added_entry_price)/nq; nf:=st.remaining_entry_fee_pool+p_entry_fee; nt:=st.remaining_entry_tax_pool+p_entry_tax;
 select * into c from public._risk008_calculate(nq,ne,st.protective_stop_price,nf,nt,pol.estimated_exit_slippage_bps);
 if c.modeled_proceeds>cs.maximum_modeled_sell_proceeds then raise exception using errcode='P8010',message='risk precondition failed: modeled sell proceeds exceeds 100000.00 USD'; end if;
 if nq>cs.maximum_modeled_exit_quantity then raise exception using errcode='P8011',message='risk precondition failed: remaining quantity exceeds 10000 shares'; end if;
 select coalesce(sum(current_planned_loss_contribution),0)-st.current_planned_loss_contribution into agg from public.outcome_position_risk_state where user_id=u and remaining_quantity>0;
 select coalesce(sum(gross_realized_loss),0) into dl from public.outcome_exit_cost_allocations where user_id=u and ny_day=db.period_start;
 select coalesce(sum(gross_realized_loss),0) into wl from public.outcome_exit_cost_allocations where user_id=u and ny_week=wb.period_start;
 if c.contribution>eq.account_equity*pol.max_planned_loss_per_position_pct/100 then reason:='PER_POSITION_PLANNED_LOSS_LIMIT';kind:='PER_POSITION_PLANNED_LOSS';threshold:=eq.account_equity*pol.max_planned_loss_per_position_pct/100;observed:=c.contribution;
 elsif agg+c.contribution>eq.account_equity*pol.max_aggregate_open_planned_loss_pct/100 then reason:='AGGREGATE_OPEN_PLANNED_LOSS_LIMIT';kind:='AGGREGATE_OPEN_PLANNED_LOSS';threshold:=eq.account_equity*pol.max_aggregate_open_planned_loss_pct/100;observed:=agg+c.contribution;
 elsif dl>=db.effective_equity*pol.daily_realized_gross_loss_limit_pct/100 then reason:='DAILY_GROSS_REALIZED_LOSS_LIMIT';kind:='DAILY_GROSS_REALIZED_LOSS';threshold:=db.effective_equity*pol.daily_realized_gross_loss_limit_pct/100;observed:=dl;
 elsif wl>=wb.effective_equity*pol.weekly_realized_gross_loss_limit_pct/100 then reason:='WEEKLY_GROSS_REALIZED_LOSS_LIMIT';kind:='WEEKLY_GROSS_REALIZED_LOSS';threshold:=wb.effective_equity*pol.weekly_realized_gross_loss_limit_pct/100;observed:=wl; end if;
 if reason is null then
  insert into public.outcome_position_increases(position_id,user_id,client_idempotency_key,request_fingerprint,broker_effective_at,added_quantity,added_entry_price,entry_fee,entry_tax,result_quantity,result_weighted_entry)
  values(p_position_id,u,p_idempotency_key,fp,p_broker_effective_at,p_added_quantity,p_added_entry_price,p_entry_fee,p_entry_tax,round(nq,8),round(ne,8)) returning id into inc;
  update public.outcome_position_risk_state set remaining_quantity=round(nq,8),weighted_entry_price=round(ne,8),remaining_entry_fee_pool=round(nf,8),remaining_entry_tax_pool=round(nt,8),current_planned_loss_contribution=c.contribution,state_version=state_version+1,updated_at=clock_timestamp() where position_id=p_position_id;
 end if;
 insert into public.personal_risk_evaluations(user_id,action_type,accepted,rejection_code,threshold_kind,attempted_protective_stop,required_stop_presence,observed_stop_presence,attempted_inputs,client_idempotency_key,request_fingerprint,policy_version_id,equity_snapshot_id,daily_basis_id,weekly_basis_id,cost_schedule_version_id,resulting_position_id,resulting_increase_id,remaining_quantity,weighted_entry_price,remaining_entry_fee_pool,remaining_entry_tax_pool,modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_rate,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value)
 values(u,'INCREASE_POSITION',reason is null,reason,kind,st.protective_stop_price,true,true,attempt,p_idempotency_key,fp,pol.id,eq.id,db.id,wb.id,cs.id,case when reason is null then p_position_id end,inc,nq,ne,nf,nt,c.modeled_proceeds,c.close_commission,c.allowance_floor,c.allowance_value,c.allowance_quantity,c.allowance_buffer,c.allowance_selected,c.slippage_rate,c.slippage_amount,c.exit_cost,c.raw_loss,c.contribution,threshold,observed) returning id into ev;
 return jsonb_build_object('accepted',reason is null,'evaluation_id',ev,'rejection_code',reason,'increase_id',inc,'policy_version_id',pol.id,'equity_snapshot_id',eq.id,'daily_basis_id',db.id,'weekly_basis_id',wb.id,'cost_schedule_version_id',cs.id,'planned_loss_contribution',c.contribution,'replayed',false);
end $$;
revoke all on sequence public.outcome_position_increases_id_seq,public.outcome_protective_stop_changes_id_seq from public,anon,authenticated,service_role;

create function public.create_broker_cost_schedule_version(
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

create function public._risk008_calculate(p_q numeric,p_entry numeric,p_stop numeric,p_entry_fee numeric,p_entry_tax numeric,p_slippage_bps numeric)
returns table(modeled_proceeds numeric,close_commission numeric,allowance_floor numeric,allowance_value numeric,allowance_quantity numeric,
 allowance_buffer numeric,allowance_selected numeric,slippage_rate numeric,slippage_amount numeric,exit_cost numeric,raw_loss numeric,contribution numeric)
language sql immutable set search_path='' as $$
 with x as (select p_q*p_stop proceeds,p_slippage_bps/10000 rate), y as (
  select proceeds,rate,greatest(1::numeric,.0008*proceeds) commission,
   .0000206*proceeds av,.000195*p_q aq,greatest(.5::numeric,.0000206*proceeds+.000195*p_q+.2) allowance from x)
 select round(proceeds,8),round(commission,8),.5::numeric(24,8),round(av,8),round(aq,8),.2::numeric(24,8),round(allowance,8),rate,
  round(proceeds*rate,8),round(commission+allowance,8),
  round(p_q*(p_entry-p_stop)+p_entry_fee+p_entry_tax+proceeds*rate+commission+allowance,8),
  round(greatest(0::numeric,p_q*(p_entry-p_stop)+p_entry_fee+p_entry_tax+proceeds*rate+commission+allowance),8) from y
$$;

revoke all on function public.create_broker_cost_schedule_version(uuid,date,text,timestamptz,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_broker_cost_schedule_version(uuid,date,text,timestamptz,text,text,text,text) to authenticated;
revoke all on function public._risk008_calculate(numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated,service_role;

-- Migration 004's creation RPC has no protective-stop input and therefore can
-- no longer be an authenticated opening path once enforcement exists.
revoke execute on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) from authenticated;

-- Read-only mirror of Migration 004's opening guards. Durable policy rejections
-- must be validated without invoking its inserting RPC: nextval() is not rolled
-- back by a PL/pgSQL exception block, so an insert-and-rollback probe is not
-- side-effect free. Accepted requests still pass through Migration 004 itself.
create function public._risk008_validate_open(
 p_symbol text,p_market text,p_analysis_contract_version text,p_analysis_created_at timestamptz,p_thesis_text text,
 p_invalidation_condition text,p_planned_horizon text,p_intended_invalidation_price numeric,p_intended_target_price numeric,
 p_maximum_planned_loss numeric,p_risk_percentage numeric,p_public_direction text,p_public_evidence_state text,
 p_public_risk_classification text,p_shariah_state text,p_provenance jsonb,p_broker_confirmed boolean,
 p_broker_effective_at timestamptz,p_entry_price numeric,p_entry_quantity numeric,p_fees numeric,p_taxes numeric
) returns table(canonical_provenance jsonb,ledger_request_fingerprint text) language plpgsql security definer set search_path=''
as $$ declare
 v_item jsonb; v_codes text[]; v_expected text[]; v_canonical jsonb; v_ledger_fp text;
 v_entry_price numeric(24,8); v_entry_quantity numeric(24,8); v_fees numeric(24,8); v_taxes numeric(24,8);
 v_invalidation numeric(24,8); v_target numeric(24,8); v_max_loss numeric(24,8); v_risk_pct numeric(9,6);
begin
 if p_symbol is null or p_symbol<>upper(p_symbol) or p_symbol!~'^[A-Z0-9.-]{1,12}$'
  or p_market is null or p_market<>upper(p_market) or p_market!~'^[A-Z0-9._-]{1,16}$'
  or p_analysis_contract_version is null or char_length(p_analysis_contract_version) not between 1 and 64
  or p_analysis_created_at is null or p_analysis_created_at>clock_timestamp()
  or p_thesis_text is null or char_length(p_thesis_text) not between 1 and 4000
  or p_invalidation_condition is null or char_length(p_invalidation_condition) not between 1 and 2000
  or p_planned_horizon is null or char_length(p_planned_horizon) not between 1 and 120
  or (p_intended_invalidation_price is not null and p_intended_invalidation_price<=0)
  or (p_intended_target_price is not null and p_intended_target_price<=0)
  or (p_maximum_planned_loss is not null and p_maximum_planned_loss<=0)
  or (p_risk_percentage is not null and (p_risk_percentage<=0 or p_risk_percentage>100))
  or (p_public_direction is not null and p_public_direction not in ('BULLISH','BEARISH','NEUTRAL','UNKNOWN'))
  or (p_public_evidence_state is not null and p_public_evidence_state not in ('SUPPORTIVE','MIXED','ADVERSE','INCOMPLETE','UNKNOWN'))
  or (p_public_risk_classification is not null and p_public_risk_classification not in ('LOW','MEDIUM','HIGH','UNKNOWN'))
  or p_shariah_state is null or p_shariah_state not in ('COMPLIANT','NON_COMPLIANT','DOUBTFUL','UNAVAILABLE','UNKNOWN')
 then raise exception using errcode='22023',message='invalid decision snapshot'; end if;
 if not coalesce(p_broker_confirmed,false) then raise exception using errcode='22023',message='broker confirmation required'; end if;
 if p_entry_price is null or p_entry_price<=0 or p_entry_quantity is null or p_entry_quantity<=0 or p_broker_effective_at is null
  or (p_fees is not null and p_fees<0) or (p_taxes is not null and p_taxes<0)
 then raise exception using errcode='22023',message='invalid broker execution'; end if;
 if p_broker_effective_at<p_analysis_created_at then raise exception using errcode='22023',message='broker execution predates decision'; end if;
 if p_provenance is null or jsonb_typeof(p_provenance)<>'array' or jsonb_array_length(p_provenance)<>2
 then raise exception using errcode='22023',message='invalid provenance'; end if;
 for v_item in select value from jsonb_array_elements(p_provenance) loop
  if jsonb_typeof(v_item)<>'object' or exists(select 1 from jsonb_object_keys(v_item) k where k not in
   ('capability','provider','source_observation','venue_scope','interval','observed_at','delivery_state','retrieved_at','original_retrieved_at','age_seconds','freshness_threshold_seconds','usable','entitlement_display','entitlement_analysis','entitlement_storage','entitlement_attribution','entitlement_authority','entitlement_assessed_at','authority_reference','limitation_codes'))
   or not (v_item ?& array['capability','provider','source_observation','venue_scope','interval','observed_at','delivery_state','retrieved_at','original_retrieved_at','age_seconds','freshness_threshold_seconds','usable','entitlement_display','entitlement_analysis','entitlement_storage','entitlement_attribution','entitlement_authority','entitlement_assessed_at','authority_reference','limitation_codes'])
  then raise exception using errcode='22023',message='provenance is not storable'; end if;
  begin
   if num_nulls(v_item->>'capability',v_item->>'provider',v_item->>'source_observation',v_item->>'venue_scope',v_item->>'delivery_state',v_item->>'retrieved_at',v_item->>'original_retrieved_at',v_item->>'age_seconds',v_item->>'freshness_threshold_seconds',v_item->>'usable',v_item->>'entitlement_display',v_item->>'entitlement_analysis',v_item->>'entitlement_storage',v_item->>'entitlement_attribution',v_item->>'entitlement_authority',v_item->>'entitlement_assessed_at',v_item->>'authority_reference')>0
    or (v_item->>'capability') not in ('QUOTE','HISTORY')
    or nullif(v_item->>'provider','') is null or char_length(v_item->>'provider')>80 or (v_item->>'provider')!~'^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
    or (v_item->>'source_observation') not in ('REALTIME','DELAYED','EOD','MARKET_CLOSED','UNAVAILABLE')
    or (v_item->>'venue_scope') not in ('LIMITED_VENUE','COMPOSITE_INDICATIVE','CONSOLIDATED_VERIFIED','CONSOLIDATION_UNVERIFIED','NOT_APPLICABLE','UNKNOWN')
    or (v_item->>'delivery_state') not in ('MISS','HIT','COALESCED','EXPIRED_REJECTED')
    or (v_item->>'entitlement_display') not in ('PERMITTED_PRIVATE','PERMITTED_EXTERNAL','PROHIBITED','UNRESOLVED')
    or (v_item->>'entitlement_analysis') not in ('PERMITTED_NON_RECONSTRUCTIVE','PROHIBITED','UNRESOLVED')
    or (v_item->>'entitlement_storage') not in ('PERMITTED_RAW','PERMITTED_DERIVED_ONLY','PROHIBITED','UNRESOLVED')
    or (v_item->>'entitlement_attribution') not in ('REQUIRED','NOT_REQUIRED_PRIVATE','UNRESOLVED')
    or (v_item->>'entitlement_authority') not in ('PUBLISHED_TERMS','PLAN_DOCUMENTATION','PROVIDER_CORRESPONDENCE','SEPARATE_AGREEMENT','UNKNOWN')
   then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if ((v_item->>'capability')='QUOTE')<>(v_item->'interval'='null'::jsonb)
    or ((v_item->>'interval') is not null and (char_length(v_item->>'interval') not between 1 and 24 or (v_item->>'interval')!~'^[A-Za-z0-9]+$'))
    or (v_item->>'retrieved_at')::timestamptz>clock_timestamp()
    or (v_item->>'original_retrieved_at')::timestamptz>clock_timestamp()
    or (v_item->>'entitlement_assessed_at')::timestamptz>clock_timestamp()
    or ((v_item->>'observed_at') is not null and (v_item->>'observed_at')::timestamptz>clock_timestamp())
    or (v_item->>'original_retrieved_at')::timestamptz>(v_item->>'retrieved_at')::timestamptz
    or (v_item->>'entitlement_assessed_at')::timestamptz>(v_item->>'retrieved_at')::timestamptz
    or ((v_item->>'observed_at') is not null and (v_item->>'observed_at')::timestamptz>(v_item->>'original_retrieved_at')::timestamptz)
    or (v_item->>'freshness_threshold_seconds')::integer not between 1 and 604800
   then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if (v_item->>'age_seconds')::integer <> floor(extract(epoch from ((v_item->>'retrieved_at')::timestamptz - (v_item->>'original_retrieved_at')::timestamptz)))::integer
   then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if not (
    ((v_item->>'delivery_state')='MISS' and (v_item->>'age_seconds')::integer=0 and (v_item->>'original_retrieved_at')::timestamptz=(v_item->>'retrieved_at')::timestamptz) or
    ((v_item->>'delivery_state') in ('HIT','COALESCED') and (v_item->>'usable')::boolean) or
    ((v_item->>'delivery_state')='EXPIRED_REJECTED' and not (v_item->>'usable')::boolean and (v_item->>'source_observation')='UNAVAILABLE')
   ) then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if not (
    ((v_item->>'source_observation')='UNAVAILABLE' and not (v_item->>'usable')::boolean and (v_item->>'observed_at') is null and (v_item->>'venue_scope') in ('NOT_APPLICABLE','UNKNOWN')) or
    ((v_item->>'source_observation')<>'UNAVAILABLE' and (v_item->>'usable')::boolean and (v_item->>'observed_at') is not null)
   ) then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if (v_item->>'source_observation')='REALTIME' and (v_item->>'usable')::boolean
    and extract(epoch from ((v_item->>'retrieved_at')::timestamptz-(v_item->>'observed_at')::timestamptz))>(v_item->>'freshness_threshold_seconds')::integer
   then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if (v_item->>'venue_scope')='CONSOLIDATED_VERIFIED' and ((v_item->>'entitlement_authority')='UNKNOWN' or (v_item->>'authority_reference')='unknown')
   then raise exception using errcode='22023',message='provenance is not storable'; end if;
   if not (
    ((v_item->>'entitlement_authority')='UNKNOWN' and (v_item->>'entitlement_display')='UNRESOLVED' and (v_item->>'entitlement_analysis')='UNRESOLVED' and (v_item->>'entitlement_storage')='UNRESOLVED' and (v_item->>'entitlement_attribution')='UNRESOLVED' and (v_item->>'authority_reference')='unknown') or
    ((v_item->>'entitlement_authority')<>'UNKNOWN' and char_length(v_item->>'authority_reference') between 8 and 240 and (v_item->>'authority_reference')~'^[a-z][a-z0-9_-]*:[^[:space:]]')
   ) then raise exception using errcode='22023',message='provenance is not storable'; end if;
   select coalesce(array_agg(x order by x),'{}') into v_codes from jsonb_array_elements_text(coalesce(v_item->'limitation_codes','[]'::jsonb)) x;
   select array_remove(array[
    case when v_item->>'entitlement_attribution'='REQUIRED' then 'ATTRIBUTION_REQUIRED' end,
    case when v_item->>'capability'='QUOTE' and v_item->>'source_observation'<>'UNAVAILABLE' then 'BROKER_VERIFICATION_REQUIRED' end,
    case when v_item->>'venue_scope'='COMPOSITE_INDICATIVE' then 'COMPOSITE_INDICATIVE' end,
    case when v_item->>'venue_scope'='CONSOLIDATION_UNVERIFIED' then 'CONSOLIDATION_UNVERIFIED' end,
    case when v_item->>'entitlement_display'='PROHIBITED' then 'DISPLAY_PROHIBITED' end,
    case when 'UNRESOLVED' in (v_item->>'entitlement_display',v_item->>'entitlement_analysis',v_item->>'entitlement_storage',v_item->>'entitlement_attribution') then 'ENTITLEMENT_UNRESOLVED' end,
    case when v_item->>'delivery_state'='EXPIRED_REJECTED' then 'EXPIRED_REJECTED' end,
    case when v_item->>'venue_scope'='LIMITED_VENUE' then 'LIMITED_VENUE' end,
    case when v_item->>'source_observation'='MARKET_CLOSED' then 'MARKET_CLOSED' end,
    case when v_item->>'entitlement_analysis'='PERMITTED_NON_RECONSTRUCTIVE' then 'NON_RECONSTRUCTIVE_ANALYTICS_ONLY' end,
    case when v_item->>'entitlement_storage' in ('PERMITTED_DERIVED_ONLY','PROHIBITED') then 'RAW_STORAGE_PROHIBITED' end,
    case when v_item->>'source_observation'='UNAVAILABLE' then 'SOURCE_UNAVAILABLE' end],null) into v_expected;
   if v_codes<>v_expected then raise exception using errcode='22023',message='provenance is not storable'; end if;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or null_value_not_allowed then
   raise exception using errcode='22023',message='provenance is not storable';
  end;
 end loop;
 if (select count(distinct value->>'capability') from jsonb_array_elements(p_provenance))<>2
 then raise exception using errcode='22023',message='provenance is not storable'; end if;
 v_entry_price:=p_entry_price;v_entry_quantity:=p_entry_quantity;v_fees:=p_fees;v_taxes:=p_taxes;
 v_invalidation:=p_intended_invalidation_price;v_target:=p_intended_target_price;v_max_loss:=p_maximum_planned_loss;v_risk_pct:=p_risk_percentage;
 select jsonb_agg((item-'limitation_codes')||jsonb_build_object('limitation_codes',coalesce((
   select jsonb_agg(code order by code) from jsonb_array_elements_text(coalesce(item->'limitation_codes','[]'::jsonb)) code
  ),'[]'::jsonb)) order by item->>'capability') into v_canonical
 from jsonb_array_elements(p_provenance) item;
 v_ledger_fp:=encode(extensions.digest(convert_to(jsonb_build_object(
  'version',1,'symbol',p_symbol,'market',p_market,'currency','USD','analysis_contract_version',p_analysis_contract_version,
  'analysis_created_at',p_analysis_created_at,'thesis_text',p_thesis_text,'invalidation_condition',p_invalidation_condition,
  'planned_horizon',p_planned_horizon,'intended_invalidation_price',v_invalidation,'intended_target_price',v_target,
  'maximum_planned_loss',v_max_loss,'risk_percentage',v_risk_pct,'public_direction',p_public_direction,
  'public_evidence_state',p_public_evidence_state,'public_risk_classification',p_public_risk_classification,
  'shariah_state',p_shariah_state,'provenance',v_canonical,'broker_confirmed',p_broker_confirmed,
  'broker_effective_at',p_broker_effective_at,'entry_price',v_entry_price,'entry_quantity',v_entry_quantity,'fees',v_fees,'taxes',v_taxes
 )::text,'UTF8'),'sha256'),'hex');
 return query select v_canonical,v_ledger_fp;
end $$;
revoke all on function public._risk008_validate_open(text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) from public,anon,authenticated,service_role;

create function public.create_risk_enforced_outcome_position(
 p_idempotency_key uuid,p_symbol text,p_market text,p_currency text,p_analysis_contract_version text,p_analysis_created_at timestamptz,
 p_thesis_text text,p_invalidation_condition text,p_planned_horizon text,p_intended_invalidation_price numeric,p_intended_target_price numeric,
 p_maximum_planned_loss numeric,p_risk_percentage numeric,p_public_direction text,p_public_evidence_state text,p_public_risk_classification text,
 p_shariah_state text,p_provenance jsonb,p_broker_confirmed boolean,p_broker_effective_at timestamptz,p_entry_price numeric,p_entry_quantity numeric,
 p_fees numeric,p_taxes numeric,p_protective_stop numeric,p_stop_evidence text
) returns jsonb language plpgsql security definer set search_path=''
as $$ declare
 v_user uuid:=auth.uid(); v_fp text; v_old public.personal_risk_evaluations%rowtype;
 v_policy public.personal_risk_policy_versions%rowtype; v_equity public.broker_equity_snapshots%rowtype;
 v_daily public.daily_risk_equity_bases%rowtype; v_weekly public.weekly_risk_equity_bases%rowtype; v_cost public.broker_cost_schedule_versions%rowtype;
 v_calc record; v_eval uuid; v_position uuid; v_event bigint; v_canonical_provenance jsonb; v_ledger_fp text; v_attempt jsonb;
 v_reason text; v_kind text:='NONE'; v_threshold numeric; v_observed numeric; v_aggregate numeric; v_daily_loss numeric; v_weekly_loss numeric; v_count integer;
 v_bad text;
begin
 if v_user is null then raise exception using errcode='42501',message='authentication required'; end if;
 if p_idempotency_key is null then raise exception using errcode='22023',message='idempotency key required'; end if;
 select f.name into v_bad from (values ('entry_price',p_entry_price,8,16),('entry_quantity',p_entry_quantity,8,16),('fees',p_fees,8,16),
  ('intended_invalidation_price',p_intended_invalidation_price,8,16),('intended_target_price',p_intended_target_price,8,16),
  ('maximum_planned_loss',p_maximum_planned_loss,8,16),('protective_stop',p_protective_stop,8,16),
  ('risk_percentage',p_risk_percentage,6,3),('taxes',p_taxes,8,16)) f(name,value,max_scale,max_digits)
  where value is not null and (scale(value)>max_scale or abs(value)>=power(10::numeric,max_digits)) order by name limit 1;
 if v_bad is not null then raise exception using errcode='22003',message='numeric input exceeds risk precision contract: '||v_bad; end if;
 if p_symbol is null or p_symbol<>upper(p_symbol) or p_symbol!~'^[A-Z0-9.-]{1,12}$' or p_market is distinct from 'US'
  or p_currency is distinct from 'USD' or not coalesce(p_broker_confirmed,false) or p_broker_effective_at is null
  or p_entry_price is null or p_entry_price<=0 or p_entry_quantity is null or p_entry_quantity<=0 or p_fees is null or p_fees<0 or p_taxes is null or p_taxes<0
  or p_stop_evidence is null or p_stop_evidence not in ('OWNER_DECLARED','BROKER_CONFIRMED')
 then raise exception using errcode='22023',message='invalid or unsupported opening input'; end if;
 select x.canonical_provenance,x.ledger_request_fingerprint into v_canonical_provenance,v_ledger_fp from public._risk008_validate_open(p_symbol,p_market,p_analysis_contract_version,p_analysis_created_at,p_thesis_text,
  p_invalidation_condition,p_planned_horizon,p_intended_invalidation_price,p_intended_target_price,p_maximum_planned_loss,
  p_risk_percentage,p_public_direction,p_public_evidence_state,p_public_risk_classification,p_shariah_state,p_provenance,
  p_broker_confirmed,p_broker_effective_at,p_entry_price,p_entry_quantity,p_fees,p_taxes) x;
 v_attempt:=jsonb_build_object('action','OPEN_POSITION','idempotency_key',p_idempotency_key,'posture','LONG_CASH_EQUITY','symbol',p_symbol,'market',p_market,'currency',p_currency,
  'analysis_contract_version',p_analysis_contract_version,'analysis_created_at',p_analysis_created_at,'thesis_text',p_thesis_text,'invalidation_condition',p_invalidation_condition,
  'planned_horizon',p_planned_horizon,'intended_invalidation_price',p_intended_invalidation_price,'intended_target_price',p_intended_target_price,
  'maximum_planned_loss',p_maximum_planned_loss,'risk_percentage',p_risk_percentage,'public_direction',p_public_direction,'public_evidence_state',p_public_evidence_state,
  'public_risk_classification',p_public_risk_classification,'shariah_state',p_shariah_state,'provenance',v_canonical_provenance,'broker_confirmed',p_broker_confirmed,
  'broker_effective_at',p_broker_effective_at,'entry_price',p_entry_price,'entry_quantity',p_entry_quantity,'fees',p_fees,'taxes',p_taxes,
  'protective_stop',p_protective_stop,'protective_stop_evidence',p_stop_evidence,'ledger_request_fingerprint',v_ledger_fp);
 v_fp:=encode(extensions.digest(convert_to(jsonb_build_object('contract',1,'attempted_request',v_attempt)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
 select * into v_old from public.personal_risk_evaluations where user_id=v_user and client_idempotency_key=p_idempotency_key;
 if found then
  if v_old.request_fingerprint<>v_fp then raise exception using errcode='23505',message='idempotency conflict'; end if;
  return jsonb_build_object('accepted',v_old.accepted,'evaluation_id',v_old.id,'rejection_code',v_old.rejection_code,'position_id',v_old.resulting_position_id,
   'event_id',v_old.resulting_event_id,'policy_version_id',v_old.policy_version_id,'equity_snapshot_id',v_old.equity_snapshot_id,'daily_basis_id',v_old.daily_basis_id,
   'weekly_basis_id',v_old.weekly_basis_id,'cost_schedule_version_id',v_old.cost_schedule_version_id,'planned_loss_contribution',v_old.planned_loss_contribution,'replayed',true);
 end if;
 if exists(select 1 from public.outcome_positions where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_events where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_position_increases where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.outcome_protective_stop_changes where user_id=v_user and client_idempotency_key=p_idempotency_key)
 or exists(select 1 from public.broker_cost_schedule_versions where user_id=v_user and client_idempotency_key=p_idempotency_key)
 then raise exception using errcode='23505',message='idempotency conflict'; end if;
 select * into v_policy from public.personal_risk_policy_versions where user_id=v_user order by version_no desc limit 1;
 if not found then raise exception using errcode='P8001',message='risk precondition failed: no applicable policy'; end if;
 select * into v_equity from public.broker_equity_snapshots where user_id=v_user and currency='USD' order by recorded_at desc,id desc limit 1;
 if not found then raise exception using errcode='P8002',message='risk precondition failed: no authoritative USD equity snapshot'; end if;
 select * into v_daily from public.daily_risk_equity_bases where user_id=v_user and source_snapshot_id=v_equity.id and currency='USD'
  and period_start=(clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1;
 if not found then raise exception using errcode='P8003',message='risk precondition failed: no authoritative current daily basis'; end if;
 select * into v_weekly from public.weekly_risk_equity_bases where user_id=v_user and source_snapshot_id=v_equity.id and currency='USD'
  and period_start=date_trunc('week',clock_timestamp() at time zone 'America/New_York')::date order by basis_sequence desc limit 1;
 if not found then raise exception using errcode='P8004',message='risk precondition failed: no authoritative current weekly basis'; end if;
 select * into v_cost from public.broker_cost_schedule_versions where user_id=v_user and account_currency='USD' and instrument_scope='LONG_US_LISTED_CASH_EQUITY'
  and effective_from<=(clock_timestamp() at time zone 'America/New_York')::date and (effective_through is null or effective_through>=(clock_timestamp() at time zone 'America/New_York')::date)
  order by version_no desc limit 1;
 if not found then raise exception using errcode='P8005',message='risk precondition failed: no applicable broker cost schedule'; end if;
 if p_protective_stop is null then
  insert into public.personal_risk_evaluations(user_id,action_type,accepted,rejection_code,threshold_kind,attempted_protective_stop,required_stop_presence,observed_stop_presence,
   attempted_inputs,client_idempotency_key,request_fingerprint,policy_version_id,equity_snapshot_id,daily_basis_id,weekly_basis_id,cost_schedule_version_id,
   remaining_quantity,weighted_entry_price,remaining_entry_fee_pool,remaining_entry_tax_pool,slippage_rate)
  values(v_user,'OPEN_POSITION',false,'MISSING_PROTECTIVE_STOP','PROTECTIVE_STOP_REQUIRED',null,true,false,
   v_attempt,p_idempotency_key,v_fp,
   v_policy.id,v_equity.id,v_daily.id,v_weekly.id,v_cost.id,p_entry_quantity,p_entry_price,p_fees,p_taxes,v_policy.estimated_exit_slippage_bps/10000)
  returning id into v_eval;
  return jsonb_build_object('accepted',false,'evaluation_id',v_eval,'rejection_code','MISSING_PROTECTIVE_STOP','threshold_kind','PROTECTIVE_STOP_REQUIRED',
   'policy_version_id',v_policy.id,'equity_snapshot_id',v_equity.id,'daily_basis_id',v_daily.id,'weekly_basis_id',v_weekly.id,'cost_schedule_version_id',v_cost.id,'replayed',false);
 end if;
 if p_protective_stop<=0 then raise exception using errcode='22023',message='protective stop must be positive'; end if;
 select * into v_calc from public._risk008_calculate(p_entry_quantity,p_entry_price,p_protective_stop,p_fees,p_taxes,v_policy.estimated_exit_slippage_bps);
 if v_calc.modeled_proceeds>v_cost.maximum_modeled_sell_proceeds then raise exception using errcode='P8010',message='risk precondition failed: modeled sell proceeds exceeds 100000.00 USD'; end if;
 if p_entry_quantity>v_cost.maximum_modeled_exit_quantity then raise exception using errcode='P8011',message='risk precondition failed: remaining quantity exceeds 10000 shares'; end if;
 select coalesce(sum(current_planned_loss_contribution),0),count(*) into v_aggregate,v_count from public.outcome_position_risk_state where user_id=v_user and remaining_quantity>0;
 select coalesce(sum(gross_realized_loss),0) into v_daily_loss from public.outcome_exit_cost_allocations where user_id=v_user and ny_day=v_daily.period_start;
 select coalesce(sum(gross_realized_loss),0) into v_weekly_loss from public.outcome_exit_cost_allocations where user_id=v_user and ny_week=v_weekly.period_start;
 if v_calc.contribution>v_equity.account_equity*v_policy.max_planned_loss_per_position_pct/100 then v_reason:='PER_POSITION_PLANNED_LOSS_LIMIT';v_kind:='PER_POSITION_PLANNED_LOSS';v_threshold:=v_equity.account_equity*v_policy.max_planned_loss_per_position_pct/100;v_observed:=v_calc.contribution;
 elsif v_aggregate+v_calc.contribution>v_equity.account_equity*v_policy.max_aggregate_open_planned_loss_pct/100 then v_reason:='AGGREGATE_OPEN_PLANNED_LOSS_LIMIT';v_kind:='AGGREGATE_OPEN_PLANNED_LOSS';v_threshold:=v_equity.account_equity*v_policy.max_aggregate_open_planned_loss_pct/100;v_observed:=v_aggregate+v_calc.contribution;
 elsif v_daily_loss>=v_daily.effective_equity*v_policy.daily_realized_gross_loss_limit_pct/100 then v_reason:='DAILY_GROSS_REALIZED_LOSS_LIMIT';v_kind:='DAILY_GROSS_REALIZED_LOSS';v_threshold:=v_daily.effective_equity*v_policy.daily_realized_gross_loss_limit_pct/100;v_observed:=v_daily_loss;
 elsif v_weekly_loss>=v_weekly.effective_equity*v_policy.weekly_realized_gross_loss_limit_pct/100 then v_reason:='WEEKLY_GROSS_REALIZED_LOSS_LIMIT';v_kind:='WEEKLY_GROSS_REALIZED_LOSS';v_threshold:=v_weekly.effective_equity*v_policy.weekly_realized_gross_loss_limit_pct/100;v_observed:=v_weekly_loss;
 elsif v_count>=v_policy.maximum_concurrent_open_positions then v_reason:='MAXIMUM_CONCURRENT_POSITIONS';v_kind:='MAXIMUM_CONCURRENT_POSITIONS';v_threshold:=v_policy.maximum_concurrent_open_positions;v_observed:=v_count+1; end if;
 if v_reason is null then
  select position_id,entry_event_id into v_position,v_event from public.create_outcome_position(p_idempotency_key,p_symbol,p_market,p_currency,p_analysis_contract_version,p_analysis_created_at,p_thesis_text,p_invalidation_condition,p_planned_horizon,p_intended_invalidation_price,p_intended_target_price,p_maximum_planned_loss,p_risk_percentage,p_public_direction,p_public_evidence_state,p_public_risk_classification,p_shariah_state,p_provenance,p_broker_confirmed,p_broker_effective_at,p_entry_price,p_entry_quantity,p_fees,p_taxes);
  insert into public.outcome_position_risk_state values(v_position,v_user,p_entry_quantity,p_entry_price,p_protective_stop,p_stop_evidence,p_fees,p_taxes,v_calc.contribution,1,clock_timestamp());
 end if;
 insert into public.personal_risk_evaluations(user_id,action_type,accepted,rejection_code,threshold_kind,attempted_protective_stop,required_stop_presence,observed_stop_presence,attempted_inputs,
  client_idempotency_key,request_fingerprint,policy_version_id,equity_snapshot_id,daily_basis_id,weekly_basis_id,cost_schedule_version_id,resulting_position_id,resulting_event_id,
  remaining_quantity,weighted_entry_price,remaining_entry_fee_pool,remaining_entry_tax_pool,modeled_sell_proceeds,close_commission,allowance_floor,allowance_value_component,
  allowance_quantity_component,allowance_fixed_saxo_buffer,selected_regulatory_allowance,slippage_rate,slippage_amount,estimated_exit_cost,raw_planned_loss,planned_loss_contribution,monetary_threshold,monetary_observed_value)
 values(v_user,'OPEN_POSITION',v_reason is null,v_reason,v_kind,p_protective_stop,true,true,v_attempt,
  p_idempotency_key,v_fp,v_policy.id,v_equity.id,v_daily.id,v_weekly.id,v_cost.id,v_position,v_event,p_entry_quantity,p_entry_price,p_fees,p_taxes,v_calc.modeled_proceeds,v_calc.close_commission,
  v_calc.allowance_floor,v_calc.allowance_value,v_calc.allowance_quantity,v_calc.allowance_buffer,v_calc.allowance_selected,v_calc.slippage_rate,v_calc.slippage_amount,v_calc.exit_cost,v_calc.raw_loss,v_calc.contribution,v_threshold,v_observed) returning id into v_eval;
 return jsonb_build_object('accepted',v_reason is null,'evaluation_id',v_eval,'rejection_code',v_reason,'position_id',v_position,'event_id',v_event,
 'policy_version_id',v_policy.id,'equity_snapshot_id',v_equity.id,'daily_basis_id',v_daily.id,'weekly_basis_id',v_weekly.id,'cost_schedule_version_id',v_cost.id,'planned_loss_contribution',v_calc.contribution,'replayed',false);
end $$;

revoke execute on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) from authenticated;
revoke all on function public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric) from public,anon,authenticated,service_role;
revoke all on function public.change_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.append_risk_lifecycle_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.change_outcome_protective_stop(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.append_risk_lifecycle_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) to authenticated;
