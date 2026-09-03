-- Personal outcome ledger: immutable decisions and append-only lifecycle events.
-- No provider observations are accepted or stored. All ownership comes from auth.uid().

create table public.personal_risk_limit_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  max_planned_loss_amount numeric(24,8) check (max_planned_loss_amount > 0),
  max_planned_loss_pct numeric(9,6) check (max_planned_loss_pct > 0 and max_planned_loss_pct <= 100),
  max_position_exposure_pct numeric(9,6) check (max_position_exposure_pct > 0 and max_position_exposure_pct <= 100),
  max_symbol_concentration_pct numeric(9,6) check (max_symbol_concentration_pct > 0 and max_symbol_concentration_pct <= 100),
  max_open_positions integer check (max_open_positions > 0),
  max_daily_realized_loss numeric(24,8) check (max_daily_realized_loss > 0),
  max_weekly_realized_loss numeric(24,8) check (max_weekly_realized_loss > 0),
  missing_invalidation_action text not null check (missing_invalidation_action in ('WARN', 'BLOCK')),
  stale_quote_action text not null check (stale_quote_action in ('WARN', 'BLOCK')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, user_id)
);

create table public.outcome_decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  market text not null check (market = upper(market) and market ~ '^[A-Z0-9._-]{1,16}$'),
  analysis_contract_version text not null check (char_length(analysis_contract_version) between 1 and 64),
  analysis_created_at timestamptz not null,
  captured_at timestamptz not null default clock_timestamp(),
  thesis_text text not null check (char_length(thesis_text) between 1 and 4000),
  invalidation_condition text not null check (char_length(invalidation_condition) between 1 and 2000),
  planned_horizon text not null check (char_length(planned_horizon) between 1 and 120),
  intended_invalidation_price numeric(24,8) check (intended_invalidation_price > 0),
  intended_target_price numeric(24,8) check (intended_target_price > 0),
  maximum_planned_loss numeric(24,8) check (maximum_planned_loss > 0),
  risk_percentage numeric(9,6) check (risk_percentage > 0 and risk_percentage <= 100),
  risk_limit_version_id uuid,
  public_direction text check (public_direction in ('BULLISH', 'BEARISH', 'NEUTRAL', 'UNKNOWN')),
  public_evidence_state text check (public_evidence_state in ('SUPPORTIVE', 'MIXED', 'ADVERSE', 'INCOMPLETE', 'UNKNOWN')),
  public_risk_classification text check (public_risk_classification in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  shariah_state text not null check (shariah_state in ('COMPLIANT', 'NON_COMPLIANT', 'DOUBTFUL', 'UNAVAILABLE', 'UNKNOWN')),
  unique (id, user_id),
  unique (id, user_id, symbol, market),
  foreign key (risk_limit_version_id, user_id)
    references public.personal_risk_limit_versions(id, user_id)
);

create table public.outcome_snapshot_provenance (
  snapshot_id uuid not null,
  user_id uuid not null,
  capability text not null check (capability in ('QUOTE', 'HISTORY')),
  provider text not null check (provider in ('Finnhub', 'TwelveData', 'Unknown')),
  state text not null check (state in ('REALTIME_CONSOLIDATION_UNVERIFIED', 'REALTIME_LIMITED_VENUE', 'EOD_CONSOLIDATED', 'CACHE', 'UNAVAILABLE')),
  underlying_state text not null check (underlying_state in ('REALTIME_CONSOLIDATION_UNVERIFIED', 'REALTIME_LIMITED_VENUE', 'EOD_CONSOLIDATED', 'UNAVAILABLE')),
  source_timestamp timestamptz,
  retrieval_timestamp timestamptz not null,
  cache_state text not null check (cache_state in ('MISS', 'HIT', 'COALESCED', 'EXPIRED', 'UNAVAILABLE')),
  cache_age_seconds integer check (cache_age_seconds >= 0),
  interval text check (interval in ('1day')),
  display_entitlement text not null check (display_entitlement in ('PRIVATE_PERSONAL_OWNER_ONLY', 'NON_DISPLAY_DERIVED_ANALYTICS_ONLY', 'NON_DISPLAY_NOT_ACTIVATED')),
  broker_verification_required boolean not null,
  limitations text[] not null default '{}'::text[] check (cardinality(limitations) <= 16),
  primary key (snapshot_id, capability),
  foreign key (snapshot_id, user_id)
    references public.outcome_decision_snapshots(id, user_id) on delete cascade,
  check (capability <> 'HISTORY' or provider <> 'TwelveData' or
    (state in ('EOD_CONSOLIDATED', 'CACHE', 'UNAVAILABLE') and interval = '1day' and display_entitlement = 'NON_DISPLAY_DERIVED_ANALYTICS_ONLY')),
  check (provider <> 'Finnhub' or capability <> 'QUOTE' or broker_verification_required),
  check ((cache_state in ('HIT', 'COALESCED')) = (cache_age_seconds is not null)),
  check (source_timestamp is null or source_timestamp <= retrieval_timestamp)
);

create table public.outcome_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_id uuid not null,
  symbol text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  market text not null check (market = upper(market) and market ~ '^[A-Z0-9._-]{1,16}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  posture text not null check (posture = 'LONG_CASH_EQUITY'),
  client_idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (snapshot_id),
  unique (user_id, client_idempotency_key),
  foreign key (snapshot_id, user_id, symbol, market)
    references public.outcome_decision_snapshots(id, user_id, symbol, market)
);

create table public.outcome_position_events (
  id bigint generated always as identity primary key,
  position_id uuid not null,
  user_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  event_type text not null check (event_type in ('ENTRY_CONFIRMED', 'PARTIAL_EXIT_CONFIRMED', 'FINAL_EXIT_CONFIRMED', 'OWNER_NOTE', 'HIDDEN_BY_OWNER')),
  client_idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  broker_confirmed boolean not null,
  broker_effective_at timestamptz,
  price numeric(24,8),
  quantity numeric(24,8),
  fees numeric(24,8),
  taxes numeric(24,8),
  thesis_result text check (thesis_result in ('VALID', 'INVALID', 'MIXED', 'UNKNOWN')),
  usefulness text check (usefulness in ('USEFUL', 'PARTLY_USEFUL', 'NOT_USEFUL', 'UNKNOWN')),
  exit_reason text check (char_length(exit_reason) <= 1000),
  owner_note text check (char_length(owner_note) <= 4000),
  supersedes_event_id bigint references public.outcome_position_events(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (position_id, sequence_no),
  unique (user_id, client_idempotency_key),
  unique (id, position_id, user_id),
  foreign key (position_id, user_id)
    references public.outcome_positions(id, user_id) on delete cascade,
  foreign key (supersedes_event_id, position_id, user_id)
    references public.outcome_position_events(id, position_id, user_id),
  check (price is null or price > 0),
  check (quantity is null or quantity > 0),
  check (fees is null or fees >= 0),
  check (taxes is null or taxes >= 0),
  check ((event_type in ('ENTRY_CONFIRMED', 'PARTIAL_EXIT_CONFIRMED', 'FINAL_EXIT_CONFIRMED')) = broker_confirmed),
  check ((event_type in ('ENTRY_CONFIRMED', 'PARTIAL_EXIT_CONFIRMED', 'FINAL_EXIT_CONFIRMED')) =
    (broker_effective_at is not null and price is not null and quantity is not null)),
  check (event_type <> 'ENTRY_CONFIRMED' or sequence_no = 1)
);

create index personal_risk_limit_versions_user_created_idx on public.personal_risk_limit_versions(user_id, created_at desc);
create index outcome_decision_snapshots_user_created_idx on public.outcome_decision_snapshots(user_id, captured_at desc);
create index outcome_decision_snapshots_user_symbol_idx on public.outcome_decision_snapshots(user_id, symbol, captured_at desc);
create index outcome_snapshot_provenance_user_idx on public.outcome_snapshot_provenance(user_id, snapshot_id);
create index outcome_positions_user_created_idx on public.outcome_positions(user_id, created_at desc);
create index outcome_positions_user_symbol_idx on public.outcome_positions(user_id, symbol, created_at desc);
create index outcome_position_events_position_created_idx on public.outcome_position_events(position_id, sequence_no);
create index outcome_position_events_user_created_idx on public.outcome_position_events(user_id, created_at desc);

alter table public.personal_risk_limit_versions enable row level security;
alter table public.personal_risk_limit_versions force row level security;
alter table public.outcome_decision_snapshots enable row level security;
alter table public.outcome_decision_snapshots force row level security;
alter table public.outcome_snapshot_provenance enable row level security;
alter table public.outcome_snapshot_provenance force row level security;
alter table public.outcome_positions enable row level security;
alter table public.outcome_positions force row level security;
alter table public.outcome_position_events enable row level security;
alter table public.outcome_position_events force row level security;

revoke all on public.personal_risk_limit_versions from public, anon, authenticated, service_role;
revoke all on public.outcome_decision_snapshots from public, anon, authenticated, service_role;
revoke all on public.outcome_snapshot_provenance from public, anon, authenticated, service_role;
revoke all on public.outcome_positions from public, anon, authenticated, service_role;
revoke all on public.outcome_position_events from public, anon, authenticated, service_role;
revoke all on sequence public.outcome_position_events_id_seq from public, anon, authenticated, service_role;

grant select on public.personal_risk_limit_versions, public.outcome_decision_snapshots,
  public.outcome_snapshot_provenance, public.outcome_positions, public.outcome_position_events to authenticated;

create policy personal_risk_limit_versions_select_own on public.personal_risk_limit_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_decision_snapshots_select_own on public.outcome_decision_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_snapshot_provenance_select_own on public.outcome_snapshot_provenance
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_positions_select_own on public.outcome_positions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_position_events_select_own on public.outcome_position_events
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.outcome_text_is_storage_safe(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null or (
    p_value !~ '[\{\}\[\]]' and
    lower(p_value) !~ '(time[_ ]?series|ohlcv|candles?|market[_ ]?series|raw[_ ]?history)'
  )
$$;
revoke all on function public.outcome_text_is_storage_safe(text) from public, anon, authenticated, service_role;

create function public.outcome_text_array_is_storage_safe(p_values text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(public.outcome_text_is_storage_safe(item)), true)
  from unnest(p_values) item
$$;
revoke all on function public.outcome_text_array_is_storage_safe(text[]) from public, anon, authenticated, service_role;

alter table public.outcome_decision_snapshots add constraint outcome_snapshot_text_safe
  check (public.outcome_text_is_storage_safe(thesis_text) and
         public.outcome_text_is_storage_safe(invalidation_condition) and
         public.outcome_text_is_storage_safe(planned_horizon));
alter table public.outcome_snapshot_provenance add constraint outcome_provenance_text_safe
  check (public.outcome_text_array_is_storage_safe(limitations));
alter table public.outcome_position_events add constraint outcome_event_text_safe
  check (public.outcome_text_is_storage_safe(exit_reason) and public.outcome_text_is_storage_safe(owner_note));

create function public.create_personal_risk_limit_version(
  p_base_currency text,
  p_max_planned_loss_amount numeric,
  p_max_planned_loss_pct numeric,
  p_max_position_exposure_pct numeric,
  p_max_symbol_concentration_pct numeric,
  p_max_open_positions integer,
  p_max_daily_realized_loss numeric,
  p_max_weekly_realized_loss numeric,
  p_missing_invalidation_action text,
  p_stale_quote_action text
)
returns public.personal_risk_limit_versions
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_result public.personal_risk_limit_versions;
begin
  if v_user is null then raise exception using errcode='42501', message='authentication required'; end if;
  insert into public.personal_risk_limit_versions(user_id, base_currency,
    max_planned_loss_amount, max_planned_loss_pct, max_position_exposure_pct,
    max_symbol_concentration_pct, max_open_positions, max_daily_realized_loss,
    max_weekly_realized_loss, missing_invalidation_action, stale_quote_action)
  values (v_user, p_base_currency, p_max_planned_loss_amount, p_max_planned_loss_pct,
    p_max_position_exposure_pct, p_max_symbol_concentration_pct, p_max_open_positions,
    p_max_daily_realized_loss, p_max_weekly_realized_loss,
    p_missing_invalidation_action, p_stale_quote_action)
  returning * into v_result;
  return v_result;
end $$;

create function public.create_outcome_position(
  p_idempotency_key uuid,
  p_symbol text,
  p_market text,
  p_currency text,
  p_analysis_contract_version text,
  p_analysis_created_at timestamptz,
  p_thesis_text text,
  p_invalidation_condition text,
  p_planned_horizon text,
  p_intended_invalidation_price numeric,
  p_intended_target_price numeric,
  p_maximum_planned_loss numeric,
  p_risk_percentage numeric,
  p_risk_limit_version_id uuid,
  p_public_direction text,
  p_public_evidence_state text,
  p_public_risk_classification text,
  p_shariah_state text,
  p_provenance jsonb,
  p_broker_confirmed boolean,
  p_broker_effective_at timestamptz,
  p_entry_price numeric,
  p_entry_quantity numeric,
  p_fees numeric,
  p_taxes numeric
)
returns table(snapshot_id uuid, position_id uuid, entry_event_id bigint, replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid(); v_snapshot uuid; v_position uuid; v_event bigint;
  v_existing public.outcome_positions%rowtype; v_fingerprint text; v_item jsonb;
begin
  if v_user is null then raise exception using errcode='42501', message='authentication required'; end if;
  if not coalesce(p_broker_confirmed, false) then raise exception using errcode='22023', message='broker confirmation required'; end if;
  if p_entry_price is null or p_entry_price <= 0 or p_entry_quantity is null or p_entry_quantity <= 0 or p_broker_effective_at is null then
    raise exception using errcode='22023', message='invalid broker execution';
  end if;
  if p_broker_effective_at < p_analysis_created_at then
    raise exception using errcode='22023', message='broker execution predates decision';
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance) <> 'array' or jsonb_array_length(p_provenance) <> 2 then
    raise exception using errcode='22023', message='invalid provenance';
  end if;
  for v_item in select value from jsonb_array_elements(p_provenance) loop
    if jsonb_typeof(v_item) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_item) k
       where k not in ('capability','provider','state','underlying_state','source_timestamp','retrieval_timestamp','cache_state','cache_age_seconds','interval','display_entitlement','broker_verification_required','limitations')
    ) then raise exception using errcode='22023', message='provenance is not storable'; end if;
    if exists (select 1 from jsonb_object_keys(v_item) k where lower(k) in ('open','high','low','close','volume','values','bars','candles','datetime','price')) then
      raise exception using errcode='22023', message='provenance is not storable';
    end if;
  end loop;

  v_fingerprint := md5(concat_ws('|', p_symbol, p_market, p_currency,
    p_analysis_contract_version, p_analysis_created_at::text, p_thesis_text,
    p_invalidation_condition, p_planned_horizon, p_intended_invalidation_price::text,
    p_intended_target_price::text, p_maximum_planned_loss::text, p_risk_percentage::text,
    p_risk_limit_version_id::text, p_public_direction, p_public_evidence_state,
    p_public_risk_classification, p_shariah_state, p_provenance::text,
    p_broker_effective_at::text, p_entry_price::text, p_entry_quantity::text,
    p_fees::text, p_taxes::text));

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.outcome_positions
    where user_id=v_user and client_idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception using errcode='23505', message='idempotency conflict'; end if;
    select e.id into v_event from public.outcome_position_events e where e.position_id=v_existing.id and e.sequence_no=1;
    return query select v_existing.snapshot_id, v_existing.id, v_event, true; return;
  end if;

  insert into public.outcome_decision_snapshots(user_id, symbol, market, analysis_contract_version,
    analysis_created_at, thesis_text, invalidation_condition, planned_horizon,
    intended_invalidation_price, intended_target_price, maximum_planned_loss, risk_percentage,
    risk_limit_version_id, public_direction, public_evidence_state, public_risk_classification, shariah_state)
  values(v_user, p_symbol, p_market, p_analysis_contract_version, p_analysis_created_at,
    p_thesis_text, p_invalidation_condition, p_planned_horizon, p_intended_invalidation_price,
    p_intended_target_price, p_maximum_planned_loss, p_risk_percentage, p_risk_limit_version_id,
    p_public_direction, p_public_evidence_state, p_public_risk_classification, p_shariah_state)
  returning id into v_snapshot;

  insert into public.outcome_snapshot_provenance(snapshot_id,user_id,capability,provider,state,
    underlying_state,source_timestamp,retrieval_timestamp,cache_state,cache_age_seconds,
    interval,display_entitlement,broker_verification_required,limitations)
  select v_snapshot,v_user,x.capability,x.provider,x.state,x.underlying_state,x.source_timestamp,
    x.retrieval_timestamp,x.cache_state,x.cache_age_seconds,x.interval,x.display_entitlement,
    x.broker_verification_required,coalesce(x.limitations,'{}'::text[])
  from jsonb_to_recordset(p_provenance) as x(capability text,provider text,state text,
    underlying_state text,source_timestamp timestamptz,retrieval_timestamp timestamptz,
    cache_state text,cache_age_seconds integer,interval text,display_entitlement text,
    broker_verification_required boolean,limitations text[]);

  insert into public.outcome_positions(user_id,snapshot_id,symbol,market,currency,posture,
    client_idempotency_key,request_fingerprint)
  values(v_user,v_snapshot,p_symbol,p_market,p_currency,'LONG_CASH_EQUITY',p_idempotency_key,v_fingerprint)
  returning id into v_position;

  insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,
    client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,
    price,quantity,fees,taxes)
  values(v_position,v_user,1,'ENTRY_CONFIRMED',p_idempotency_key,v_fingerprint,true,
    p_broker_effective_at,p_entry_price,p_entry_quantity,coalesce(p_fees,0),coalesce(p_taxes,0))
  returning id into v_event;
  return query select v_snapshot,v_position,v_event,false;
end $$;

create function public.append_outcome_position_event(
  p_position_id uuid,
  p_idempotency_key uuid,
  p_event_type text,
  p_broker_confirmed boolean default false,
  p_broker_effective_at timestamptz default null,
  p_price numeric default null,
  p_quantity numeric default null,
  p_fees numeric default null,
  p_taxes numeric default null,
  p_thesis_result text default null,
  p_usefulness text default null,
  p_exit_reason text default null,
  p_owner_note text default null,
  p_supersedes_event_id bigint default null
)
returns table(event_id bigint, sequence_no integer, open_quantity numeric, realized_pl numeric, realized_return_pct numeric, replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid(); v_position public.outcome_positions%rowtype;
  v_entry public.outcome_position_events%rowtype; v_existing public.outcome_position_events%rowtype;
  v_closed numeric(24,8); v_exit_proceeds numeric; v_exit_fees numeric; v_exit_taxes numeric;
  v_seq integer; v_event bigint; v_open numeric; v_pl numeric; v_return numeric; v_fp text;
begin
  if v_user is null then raise exception using errcode='42501', message='authentication required'; end if;
  select * into v_position from public.outcome_positions where id=p_position_id and user_id=v_user for update;
  if not found then raise exception using errcode='42501', message='position unavailable'; end if;
  select e.* into strict v_entry from public.outcome_position_events e where e.position_id=p_position_id and e.sequence_no=1;
  v_fp := md5(concat_ws('|',p_position_id::text,p_event_type,p_broker_confirmed::text,
    p_broker_effective_at::text,p_price::text,p_quantity::text,p_fees::text,p_taxes::text,
    p_thesis_result,p_usefulness,p_exit_reason,p_owner_note,p_supersedes_event_id::text));
  select * into v_existing from public.outcome_position_events e where e.user_id=v_user and e.client_idempotency_key=p_idempotency_key;
  if found then
    if v_existing.position_id <> p_position_id or v_existing.request_fingerprint <> v_fp then raise exception using errcode='23505', message='idempotency conflict'; end if;
    v_event := v_existing.id; v_seq := v_existing.sequence_no;
  else
    if p_event_type not in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED','OWNER_NOTE','HIDDEN_BY_OWNER') then
      raise exception using errcode='22023', message='invalid event type'; end if;
    select coalesce(sum(e.quantity),0) into v_closed from public.outcome_position_events e
      where e.position_id=p_position_id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED');
    if exists(select 1 from public.outcome_position_events e where e.position_id=p_position_id and e.event_type='FINAL_EXIT_CONFIRMED') then
      raise exception using errcode='22023', message='position already closed'; end if;
    if p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') then
      if not coalesce(p_broker_confirmed,false) or p_broker_effective_at is null or p_price is null or p_price <= 0 or p_quantity is null or p_quantity <= 0 then
        raise exception using errcode='22023', message='invalid broker exit'; end if;
      if p_broker_effective_at < v_entry.broker_effective_at or p_broker_effective_at < coalesce((
        select max(e.broker_effective_at) from public.outcome_position_events e
        where e.position_id=p_position_id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED')
      ), v_entry.broker_effective_at) then
        raise exception using errcode='22023', message='broker event is out of order'; end if;
      if v_closed + p_quantity > v_entry.quantity then raise exception using errcode='22023', message='exit quantity exceeds open quantity'; end if;
      if p_event_type='PARTIAL_EXIT_CONFIRMED' and v_closed+p_quantity >= v_entry.quantity then raise exception using errcode='22023', message='partial exit must leave open quantity'; end if;
      if p_event_type='FINAL_EXIT_CONFIRMED' and v_closed+p_quantity <> v_entry.quantity then raise exception using errcode='22023', message='final exit must close exact quantity'; end if;
    end if;
    select coalesce(max(e.sequence_no),0)+1 into v_seq from public.outcome_position_events e where e.position_id=p_position_id;
    insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,
      client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,price,
      quantity,fees,taxes,thesis_result,usefulness,exit_reason,owner_note,supersedes_event_id)
    values(p_position_id,v_user,v_seq,p_event_type,p_idempotency_key,v_fp,coalesce(p_broker_confirmed,false),
      p_broker_effective_at,p_price,p_quantity,p_fees,p_taxes,p_thesis_result,p_usefulness,
      p_exit_reason,p_owner_note,p_supersedes_event_id)
    returning id into v_event;
  end if;
  select coalesce(sum(e.quantity),0),coalesce(sum(e.quantity*e.price),0),coalesce(sum(e.fees),0),coalesce(sum(e.taxes),0)
    into v_closed,v_exit_proceeds,v_exit_fees,v_exit_taxes from public.outcome_position_events e
    where e.position_id=p_position_id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED');
  v_open := v_entry.quantity-v_closed;
  v_pl := v_exit_proceeds-(v_entry.price*v_closed)-
    case when v_entry.quantity=0 then 0 else coalesce(v_entry.fees,0)*v_closed/v_entry.quantity end-
    v_exit_fees-v_exit_taxes;
  v_return := case when v_closed=0 then null else
    v_pl/((v_entry.price*v_closed)+(coalesce(v_entry.fees,0)*v_closed/v_entry.quantity))*100 end;
  return query select v_event,v_seq,v_open,v_pl,v_return,(v_existing.id is not null);
end $$;

revoke all on function public.create_personal_risk_limit_version(text,numeric,numeric,numeric,numeric,integer,numeric,numeric,text,text) from public, anon, service_role;
revoke all on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,uuid,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) from public, anon, service_role;
revoke all on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text,bigint) from public, anon, service_role;
grant execute on function public.create_personal_risk_limit_version(text,numeric,numeric,numeric,numeric,integer,numeric,numeric,text,text) to authenticated;
grant execute on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,uuid,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text,bigint) to authenticated;
