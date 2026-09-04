-- Personal outcome ledger: immutable decisions and append-only lifecycle events.
-- Raw provider observations are never accepted. Ownership comes only from auth.uid().
-- No runtime ledger caller exists yet. Slice 3 is blocked until its runtime producer
-- emits this three-axis provenance contract. Risk-limit enforcement is a mandatory
-- pre-trading gate: real position recording must not be activated until atomic limits
-- and typed WARN/BLOCK semantics receive separate approval.
--
-- TEMPORAL CONTRACT. Three distinct instants are recorded per provenance row and
-- are ordered: observed_at <= original_retrieved_at <= retrieved_at. A cached
-- observation can never claim the provider observed it after AzaLens first
-- retrieved it. Relative ordering alone still admits a wholly future-dated but
-- internally coherent timeline, so every caller-supplied provenance instant -
-- observed_at, original_retrieved_at, retrieved_at and entitlement_assessed_at -
-- is additionally bounded above by recorded_at, the database-generated
-- insertion instant. recorded_at is defaulted from clock_timestamp() and is
-- reachable through neither RPC: it is absent from the provenance key
-- allowlist, from the record-set projection and from every insert column list,
-- and no role holds INSERT on the table. The bound is expressed against that
-- stored column rather than a volatile call inside the CHECK, so the row stays
-- verifiable for ever afterwards. The comparison is inclusive and carries no
-- invented skew allowance: an instant equal to recorded_at is accepted, one
-- microsecond later is not. Historical observations are unaffected, since only
-- an upper bound is imposed.
-- age_seconds is CACHE age only and is pinned to
-- retrieved_at - original_retrieved_at. REALTIME freshness is measured from the
-- OBSERVATION (retrieved_at - observed_at), never from cache age, so a cache
-- miss cannot launder a stale observation. The threshold comparison is
-- inclusive: an age exactly equal to freshness_threshold_seconds is accepted.
--
-- PRECISION CONTRACT. Ledger money and quantity columns are numeric(24,8) and
-- risk_percentage is numeric(9,6). PostgreSQL DISCARDS the typmod on function
-- parameters, so declaring a parameter numeric(24,8) would neither validate nor
-- coerce anything; the RPCs therefore validate scale and range EXPLICITLY and
-- REJECT, never round. A value carrying more than the destination's fractional
-- digits is refused rather than silently altered, so a guard can never compare a
-- different number from the one stored. Consequence, stated plainly: 1.100000000
-- is refused even though it would round losslessly, because the rule is a scale
-- limit, not a lossiness test. Validated values are canonicalised into
-- numeric(24,8)/(9,6) locals BEFORE fingerprinting, so inputs that store
-- identically also fingerprint identically.
--
-- ENTITLEMENT AUTHORITY CONTRACT. entitlement_authority = 'UNKNOWN' is admissible
-- ONLY for a wholly unresolved assessment (all four dimensions UNRESOLVED), which
-- then carries the canonical placeholder reference. Any affirmative permission or
-- definitive prohibition requires a named authority AND a scheme-qualified
-- evidence reference. Neither private application containment nor successful
-- technical access is an authority value, so neither can satisfy this rule.

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
  public_direction text check (public_direction in ('BULLISH', 'BEARISH', 'NEUTRAL', 'UNKNOWN')),
  public_evidence_state text check (public_evidence_state in ('SUPPORTIVE', 'MIXED', 'ADVERSE', 'INCOMPLETE', 'UNKNOWN')),
  public_risk_classification text check (public_risk_classification in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  shariah_state text not null check (shariah_state in ('COMPLIANT', 'NON_COMPLIANT', 'DOUBTFUL', 'UNAVAILABLE', 'UNKNOWN')),
  unique (id, user_id),
  unique (id, user_id, symbol, market)
);

create table public.outcome_snapshot_provenance (
  snapshot_id uuid not null,
  user_id uuid not null,
  capability text not null check (capability in ('QUOTE', 'HISTORY')),
  provider text not null check (char_length(provider) between 1 and 80 and provider ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'),
  source_observation text not null check (source_observation in ('REALTIME','DELAYED','EOD','MARKET_CLOSED','UNAVAILABLE')),
  venue_scope text not null check (venue_scope in ('LIMITED_VENUE','COMPOSITE_INDICATIVE','CONSOLIDATED_VERIFIED','CONSOLIDATION_UNVERIFIED','NOT_APPLICABLE','UNKNOWN')),
  interval text check (interval is null or (char_length(interval) between 1 and 24 and interval ~ '^[A-Za-z0-9]+$')),
  observed_at timestamptz,
  delivery_state text not null check (delivery_state in ('MISS','HIT','COALESCED','EXPIRED_REJECTED')),
  retrieved_at timestamptz not null,
  original_retrieved_at timestamptz not null,
  age_seconds integer not null check (age_seconds >= 0),
  freshness_threshold_seconds integer not null check (freshness_threshold_seconds between 1 and 604800),
  usable boolean not null,
  entitlement_display text not null check (entitlement_display in ('PERMITTED_PRIVATE','PERMITTED_EXTERNAL','PROHIBITED','UNRESOLVED')),
  entitlement_analysis text not null check (entitlement_analysis in ('PERMITTED_NON_RECONSTRUCTIVE','PROHIBITED','UNRESOLVED')),
  entitlement_storage text not null check (entitlement_storage in ('PERMITTED_RAW','PERMITTED_DERIVED_ONLY','PROHIBITED','UNRESOLVED')),
  entitlement_attribution text not null check (entitlement_attribution in ('REQUIRED','NOT_REQUIRED_PRIVATE','UNRESOLVED')),
  entitlement_authority text not null check (entitlement_authority in ('PUBLISHED_TERMS','PLAN_DOCUMENTATION','PROVIDER_CORRESPONDENCE','SEPARATE_AGREEMENT','UNKNOWN')),
  entitlement_assessed_at timestamptz not null,
  -- Database-generated insertion instant. Caller-uncontrolled: see the temporal
  -- contract in the header. Never fingerprinted, so replay stays stable.
  recorded_at timestamptz not null default clock_timestamp(),
  authority_reference text not null check (char_length(authority_reference) between 1 and 240 and authority_reference !~ '[[:cntrl:]]'),
  limitation_codes text[] not null default '{}'::text[] check (
    cardinality(limitation_codes) <= 12 and
    limitation_codes <@ array[
      'ATTRIBUTION_REQUIRED',
      'BROKER_VERIFICATION_REQUIRED',
      'COMPOSITE_INDICATIVE',
      'CONSOLIDATION_UNVERIFIED',
      'DISPLAY_PROHIBITED',
      'ENTITLEMENT_UNRESOLVED',
      'EXPIRED_REJECTED',
      'LIMITED_VENUE',
      'MARKET_CLOSED',
      'NON_RECONSTRUCTIVE_ANALYTICS_ONLY',
      'RAW_STORAGE_PROHIBITED',
      'SOURCE_UNAVAILABLE'
    ]::text[]
  ),
  primary key (snapshot_id, capability),
  foreign key (snapshot_id, user_id)
    references public.outcome_decision_snapshots(id, user_id) on delete cascade,
  check ((capability = 'QUOTE' and interval is null) or (capability = 'HISTORY' and interval is not null)),
  check (original_retrieved_at <= retrieved_at),
  check (age_seconds = floor(extract(epoch from (retrieved_at - original_retrieved_at)))::integer),
  check (entitlement_assessed_at <= retrieved_at),
  check (observed_at is null or observed_at <= original_retrieved_at),
  -- No caller-supplied instant may post-date the row's own insertion. Stated in
  -- full rather than leaning on the ordering chain above, so that weakening any
  -- one clause cannot silently reopen future-dating.
  constraint outcome_snapshot_provenance_not_future check (
    retrieved_at <= recorded_at and
    original_retrieved_at <= recorded_at and
    entitlement_assessed_at <= recorded_at and
    (observed_at is null or observed_at <= recorded_at)
  ),
  check ((delivery_state = 'MISS' and age_seconds = 0 and original_retrieved_at = retrieved_at) or
         (delivery_state in ('HIT','COALESCED') and usable) or
         (delivery_state = 'EXPIRED_REJECTED' and not usable and source_observation = 'UNAVAILABLE')),
  check ((source_observation = 'UNAVAILABLE' and not usable and observed_at is null and venue_scope in ('NOT_APPLICABLE','UNKNOWN')) or
         (source_observation <> 'UNAVAILABLE' and usable and observed_at is not null)),
  check (source_observation <> 'REALTIME' or not usable or
         (observed_at is not null and
          extract(epoch from (retrieved_at - observed_at)) <= freshness_threshold_seconds)),
  check (venue_scope <> 'CONSOLIDATED_VERIFIED' or
         (entitlement_authority <> 'UNKNOWN' and authority_reference <> 'unknown')),
  check ((entitlement_authority = 'UNKNOWN'
            and entitlement_display = 'UNRESOLVED' and entitlement_analysis = 'UNRESOLVED'
            and entitlement_storage = 'UNRESOLVED' and entitlement_attribution = 'UNRESOLVED'
            and authority_reference = 'unknown') or
         (entitlement_authority <> 'UNKNOWN'
            and char_length(authority_reference) between 8 and 240
            and authority_reference ~ '^[a-z][a-z0-9_-]*:[^[:space:]]')),
  check (limitation_codes = array_remove(array[
    case when entitlement_attribution = 'REQUIRED' then 'ATTRIBUTION_REQUIRED' end,
    case when capability = 'QUOTE' and source_observation <> 'UNAVAILABLE' then 'BROKER_VERIFICATION_REQUIRED' end,
    case when venue_scope = 'COMPOSITE_INDICATIVE' then 'COMPOSITE_INDICATIVE' end,
    case when venue_scope = 'CONSOLIDATION_UNVERIFIED' then 'CONSOLIDATION_UNVERIFIED' end,
    case when entitlement_display = 'PROHIBITED' then 'DISPLAY_PROHIBITED' end,
    case when 'UNRESOLVED' in (entitlement_display,entitlement_analysis,entitlement_storage,entitlement_attribution) then 'ENTITLEMENT_UNRESOLVED' end,
    case when delivery_state = 'EXPIRED_REJECTED' then 'EXPIRED_REJECTED' end,
    case when venue_scope = 'LIMITED_VENUE' then 'LIMITED_VENUE' end,
    case when source_observation = 'MARKET_CLOSED' then 'MARKET_CLOSED' end,
    case when entitlement_analysis = 'PERMITTED_NON_RECONSTRUCTIVE' then 'NON_RECONSTRUCTIVE_ANALYTICS_ONLY' end,
    case when entitlement_storage in ('PERMITTED_DERIVED_ONLY','PROHIBITED') then 'RAW_STORAGE_PROHIBITED' end,
    case when source_observation = 'UNAVAILABLE' then 'SOURCE_UNAVAILABLE' end
  ]::text[], null))
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
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
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
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
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
  result_open_quantity numeric not null,
  result_realized_pl numeric not null,
  result_realized_return_pct numeric,
  created_at timestamptz not null default clock_timestamp(),
  unique (position_id, sequence_no),
  unique (user_id, client_idempotency_key),
  unique (id, position_id, user_id),
  foreign key (position_id, user_id)
    references public.outcome_positions(id, user_id) on delete cascade,
  check (price is null or price > 0),
  check (quantity is null or quantity > 0),
  check (fees is null or fees >= 0),
  check (taxes is null or taxes >= 0),
  check ((event_type in ('ENTRY_CONFIRMED', 'PARTIAL_EXIT_CONFIRMED', 'FINAL_EXIT_CONFIRMED')) = broker_confirmed),
  check (
    (event_type in ('ENTRY_CONFIRMED', 'PARTIAL_EXIT_CONFIRMED', 'FINAL_EXIT_CONFIRMED') and
      broker_effective_at is not null and price is not null and quantity is not null and
      fees is not null and taxes is not null) or
    (event_type in ('OWNER_NOTE', 'HIDDEN_BY_OWNER') and broker_effective_at is null and
      price is null and quantity is null and fees is null and taxes is null)
  ),
  check (event_type <> 'ENTRY_CONFIRMED' or sequence_no = 1)
);

-- Correction and supersession events are deliberately unsupported in Slice 2.
-- OWNER_NOTE and HIDDEN_BY_OWNER do not alter or supersede an earlier event;
-- any future correction contract requires separate immutable arithmetic semantics.

create index outcome_decision_snapshots_user_created_idx on public.outcome_decision_snapshots(user_id, captured_at desc);
create index outcome_decision_snapshots_user_symbol_idx on public.outcome_decision_snapshots(user_id, symbol, captured_at desc);
create index outcome_snapshot_provenance_user_idx on public.outcome_snapshot_provenance(user_id, snapshot_id);
create index outcome_positions_user_created_idx on public.outcome_positions(user_id, created_at desc);
create index outcome_positions_user_symbol_idx on public.outcome_positions(user_id, symbol, created_at desc);
create index outcome_position_events_position_created_idx on public.outcome_position_events(position_id, sequence_no);
create index outcome_position_events_user_created_idx on public.outcome_position_events(user_id, created_at desc);

alter table public.outcome_decision_snapshots enable row level security;
alter table public.outcome_decision_snapshots force row level security;
alter table public.outcome_snapshot_provenance enable row level security;
alter table public.outcome_snapshot_provenance force row level security;
alter table public.outcome_positions enable row level security;
alter table public.outcome_positions force row level security;
alter table public.outcome_position_events enable row level security;
alter table public.outcome_position_events force row level security;

revoke all on public.outcome_decision_snapshots from public, anon, authenticated, service_role;
revoke all on public.outcome_snapshot_provenance from public, anon, authenticated, service_role;
revoke all on public.outcome_positions from public, anon, authenticated, service_role;
revoke all on public.outcome_position_events from public, anon, authenticated, service_role;
revoke all on sequence public.outcome_position_events_id_seq from public, anon, authenticated, service_role;

grant select on public.outcome_decision_snapshots,
  public.outcome_snapshot_provenance, public.outcome_positions, public.outcome_position_events to authenticated;

create policy outcome_decision_snapshots_select_own on public.outcome_decision_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_snapshot_provenance_select_own on public.outcome_snapshot_provenance
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_positions_select_own on public.outcome_positions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy outcome_position_events_select_own on public.outcome_position_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Owner-authored prose is deliberately bounded but not content-scanned. PostgreSQL
-- cannot prove arbitrary prose free of steganographic data. Provider-derived input is
-- therefore restricted to the typed provenance columns and limitation-code vocabulary.

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
  v_canonical_provenance jsonb; v_bad_numeric text;
  v_entry_price numeric(24,8); v_entry_quantity numeric(24,8);
  v_fees numeric(24,8); v_taxes numeric(24,8);
  v_invalidation_price numeric(24,8); v_target_price numeric(24,8);
  v_maximum_planned_loss numeric(24,8); v_risk_percentage numeric(9,6);
begin
  if v_user is null then raise exception using errcode='42501', message='authentication required'; end if;

  -- Precision contract (see header). Validate scale and range BEFORE any guard,
  -- fingerprint, comparison or insert, and reject rather than round. Function
  -- parameters carry no typmod, so this is the only place the destination
  -- precision can be enforced. Deterministic first offender by name. This block
  -- is the first statement after the caller is established, matching
  -- append_outcome_position_event exactly, so no semantic guard anywhere in
  -- either RPC can observe an unvalidated raw numeric parameter.
  select f.field into v_bad_numeric
  from (values
    ('entry_price', p_entry_price, 8, 16),
    ('entry_quantity', p_entry_quantity, 8, 16),
    ('fees', p_fees, 8, 16),
    ('intended_invalidation_price', p_intended_invalidation_price, 8, 16),
    ('intended_target_price', p_intended_target_price, 8, 16),
    ('maximum_planned_loss', p_maximum_planned_loss, 8, 16),
    ('risk_percentage', p_risk_percentage, 6, 3),
    ('taxes', p_taxes, 8, 16)
  ) as f(field, amount, max_scale, max_integer_digits)
  where f.amount is not null
    and (scale(f.amount) > f.max_scale
         or abs(f.amount) >= power(10::numeric, f.max_integer_digits))
  order by f.field
  limit 1;
  if v_bad_numeric is not null then
    raise exception using errcode='22003',
      message='numeric input exceeds ledger precision contract: '||v_bad_numeric;
  end if;

  -- Canonical values, created immediately after validation and before anything
  -- reads a number. Validation above guarantees these assignments neither round
  -- nor overflow, so guards, fingerprint and storage all see one value. Below
  -- this line the raw p_* numeric parameters are never read again.
  v_entry_price := p_entry_price; v_entry_quantity := p_entry_quantity;
  v_fees := p_fees; v_taxes := p_taxes;
  v_invalidation_price := p_intended_invalidation_price;
  v_target_price := p_intended_target_price;
  v_maximum_planned_loss := p_maximum_planned_loss;
  v_risk_percentage := p_risk_percentage;

  -- Semantic guards. Every numeric they inspect is a validated canonical local.
  if not coalesce(p_broker_confirmed, false) then raise exception using errcode='22023', message='broker confirmation required'; end if;
  if v_entry_price is null or v_entry_price <= 0 or v_entry_quantity is null or v_entry_quantity <= 0 or p_broker_effective_at is null then
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
       where k not in ('capability','provider','source_observation','venue_scope','interval','observed_at',
         'delivery_state','retrieved_at','original_retrieved_at','age_seconds','freshness_threshold_seconds','usable',
         'entitlement_display','entitlement_analysis','entitlement_storage','entitlement_attribution',
         'entitlement_authority','entitlement_assessed_at','authority_reference','limitation_codes')
    ) then raise exception using errcode='22023', message='provenance is not storable'; end if;
    if exists (select 1 from jsonb_object_keys(v_item) k where lower(k) in ('open','high','low','close','volume','values','bars','candles','datetime','price')) then
      raise exception using errcode='22023', message='provenance is not storable';
    end if;
  end loop;

  -- The table constraints reject missing, duplicate, extra, and contradictory
  -- codes. Canonical sorting makes equivalent caller sets byte-identical in both
  -- the immutable snapshot and its idempotency fingerprint.
  select jsonb_agg(
    (item - 'limitation_codes') || jsonb_build_object(
      'limitation_codes', coalesce((
        select jsonb_agg(code order by code)
        from jsonb_array_elements_text(coalesce(item->'limitation_codes', '[]'::jsonb)) code
      ), '[]'::jsonb)
    ) order by item->>'capability'
  ) into v_canonical_provenance
  from jsonb_array_elements(p_provenance) item;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1,
    'symbol', p_symbol, 'market', p_market, 'currency', p_currency,
    'analysis_contract_version', p_analysis_contract_version,
    'analysis_created_at', p_analysis_created_at,
    'thesis_text', p_thesis_text, 'invalidation_condition', p_invalidation_condition,
    'planned_horizon', p_planned_horizon,
    'intended_invalidation_price', v_invalidation_price,
    'intended_target_price', v_target_price,
    'maximum_planned_loss', v_maximum_planned_loss, 'risk_percentage', v_risk_percentage,
    'public_direction', p_public_direction, 'public_evidence_state', p_public_evidence_state,
    'public_risk_classification', p_public_risk_classification, 'shariah_state', p_shariah_state,
    'provenance', v_canonical_provenance, 'broker_confirmed', p_broker_confirmed,
    'broker_effective_at', p_broker_effective_at, 'entry_price', v_entry_price,
    'entry_quantity', v_entry_quantity, 'fees', v_fees, 'taxes', v_taxes
  )::text, 'UTF8'), 'sha256'), 'hex');

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
    public_direction, public_evidence_state, public_risk_classification, shariah_state)
  values(v_user, p_symbol, p_market, p_analysis_contract_version, p_analysis_created_at,
    p_thesis_text, p_invalidation_condition, p_planned_horizon, v_invalidation_price,
    v_target_price, v_maximum_planned_loss, v_risk_percentage,
    p_public_direction, p_public_evidence_state, p_public_risk_classification, p_shariah_state)
  returning id into v_snapshot;

  insert into public.outcome_snapshot_provenance(snapshot_id,user_id,capability,provider,
    source_observation,venue_scope,interval,observed_at,delivery_state,retrieved_at,
    original_retrieved_at,age_seconds,freshness_threshold_seconds,usable,
    entitlement_display,entitlement_analysis,entitlement_storage,entitlement_attribution,
    entitlement_authority,entitlement_assessed_at,authority_reference,limitation_codes)
  select v_snapshot,v_user,x.capability,x.provider,x.source_observation,x.venue_scope,x.interval,
    x.observed_at,x.delivery_state,x.retrieved_at,x.original_retrieved_at,x.age_seconds,
    x.freshness_threshold_seconds,x.usable,x.entitlement_display,x.entitlement_analysis,
    x.entitlement_storage,x.entitlement_attribution,x.entitlement_authority,
    x.entitlement_assessed_at,x.authority_reference,coalesce(x.limitation_codes,'{}'::text[])
  from jsonb_to_recordset(v_canonical_provenance) as x(capability text,provider text,
    source_observation text,venue_scope text,interval text,observed_at timestamptz,
    delivery_state text,retrieved_at timestamptz,original_retrieved_at timestamptz,
    age_seconds integer,freshness_threshold_seconds integer,usable boolean,
    entitlement_display text,entitlement_analysis text,entitlement_storage text,
    entitlement_attribution text,entitlement_authority text,entitlement_assessed_at timestamptz,
    authority_reference text,limitation_codes text[]);

  insert into public.outcome_positions(user_id,snapshot_id,symbol,market,currency,posture,
    client_idempotency_key,request_fingerprint)
  values(v_user,v_snapshot,p_symbol,p_market,p_currency,'LONG_CASH_EQUITY',p_idempotency_key,v_fingerprint)
  returning id into v_position;

  insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,
    client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,
    price,quantity,fees,taxes,result_open_quantity,result_realized_pl,result_realized_return_pct)
  values(v_position,v_user,1,'ENTRY_CONFIRMED',p_idempotency_key,v_fingerprint,true,
    p_broker_effective_at,v_entry_price,v_entry_quantity,coalesce(v_fees,0),coalesce(v_taxes,0),
    v_entry_quantity,0,null)
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
  p_owner_note text default null
)
returns table(event_id bigint, sequence_no integer, open_quantity numeric, realized_pl numeric, realized_return_pct numeric, replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid(); v_position public.outcome_positions%rowtype;
  v_entry public.outcome_position_events%rowtype; v_existing public.outcome_position_events%rowtype;
  v_closed numeric(24,8); v_exit_proceeds numeric; v_exit_fees numeric; v_exit_taxes numeric;
  v_seq integer; v_event bigint; v_open numeric; v_pl numeric; v_return numeric; v_fp text;
  v_bad_numeric text; v_price numeric(24,8); v_quantity numeric(24,8);
  v_fees numeric(24,8); v_taxes numeric(24,8);
begin
  if v_user is null then raise exception using errcode='42501', message='authentication required'; end if;

  -- Precision contract (see header). Runs before the row lock, the fingerprint,
  -- the quantity guards and any insert, so a rejected request can never leave
  -- partial state and a guard can never see a different value from storage.
  select f.field into v_bad_numeric
  from (values
    ('fees', p_fees, 8, 16),
    ('price', p_price, 8, 16),
    ('quantity', p_quantity, 8, 16),
    ('taxes', p_taxes, 8, 16)
  ) as f(field, amount, max_scale, max_integer_digits)
  where f.amount is not null
    and (scale(f.amount) > f.max_scale
         or abs(f.amount) >= power(10::numeric, f.max_integer_digits))
  order by f.field
  limit 1;
  if v_bad_numeric is not null then
    raise exception using errcode='22003',
      message='numeric input exceeds ledger precision contract: '||v_bad_numeric;
  end if;
  v_price := p_price; v_quantity := p_quantity; v_fees := p_fees; v_taxes := p_taxes;

  select * into v_position from public.outcome_positions where id=p_position_id and user_id=v_user for update;
  if not found then raise exception using errcode='42501', message='position unavailable'; end if;
  select e.* into strict v_entry from public.outcome_position_events e where e.position_id=v_position.id and e.sequence_no=1;
  v_fp := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1, 'position_id', p_position_id, 'event_type', p_event_type,
    'broker_confirmed', p_broker_confirmed, 'broker_effective_at', p_broker_effective_at,
    'price', v_price, 'quantity', v_quantity, 'fees', v_fees, 'taxes', v_taxes,
    'thesis_result', p_thesis_result, 'usefulness', p_usefulness,
    'exit_reason', p_exit_reason, 'owner_note', p_owner_note
  )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.outcome_position_events e where e.user_id=v_user and e.client_idempotency_key=p_idempotency_key;
  if found then
    if v_existing.position_id <> p_position_id or v_existing.request_fingerprint <> v_fp then raise exception using errcode='23505', message='idempotency conflict'; end if;
    return query select v_existing.id,v_existing.sequence_no,v_existing.result_open_quantity,
      v_existing.result_realized_pl,v_existing.result_realized_return_pct,true;
    return;
  else
    if p_event_type not in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED','OWNER_NOTE','HIDDEN_BY_OWNER') then
      raise exception using errcode='22023', message='invalid event type'; end if;
    select coalesce(sum(e.quantity),0) into v_closed from public.outcome_position_events e
      where e.position_id=v_position.id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED');
    if exists(select 1 from public.outcome_position_events e where e.position_id=v_position.id and e.event_type='FINAL_EXIT_CONFIRMED') then
      raise exception using errcode='22023', message='position already closed'; end if;
    if p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') then
      if not coalesce(p_broker_confirmed,false) or p_broker_effective_at is null or v_price is null or v_price <= 0 or v_quantity is null or v_quantity <= 0 then
        raise exception using errcode='22023', message='invalid broker exit'; end if;
      if p_broker_effective_at < v_entry.broker_effective_at or p_broker_effective_at < coalesce((
        select max(e.broker_effective_at) from public.outcome_position_events e
        where e.position_id=v_position.id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED')
      ), v_entry.broker_effective_at) then
        raise exception using errcode='22023', message='broker event is out of order'; end if;
      if v_closed + v_quantity > v_entry.quantity then raise exception using errcode='22023', message='exit quantity exceeds open quantity'; end if;
      if p_event_type='PARTIAL_EXIT_CONFIRMED' and v_closed+v_quantity >= v_entry.quantity then raise exception using errcode='22023', message='partial exit must leave open quantity'; end if;
      if p_event_type='FINAL_EXIT_CONFIRMED' and v_closed+v_quantity <> v_entry.quantity then raise exception using errcode='22023', message='final exit must close exact quantity'; end if;
    end if;
    select coalesce(max(e.sequence_no),0)+1 into v_seq from public.outcome_position_events e where e.position_id=v_position.id;
    select coalesce(sum(e.quantity),0),coalesce(sum(e.quantity*e.price),0),coalesce(sum(e.fees),0),coalesce(sum(e.taxes),0)
      into v_closed,v_exit_proceeds,v_exit_fees,v_exit_taxes from public.outcome_position_events e
      where e.position_id=v_position.id and e.event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED');
    if p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') then
      v_closed := v_closed + v_quantity;
      v_exit_proceeds := v_exit_proceeds + (v_quantity*v_price);
      v_exit_fees := v_exit_fees + coalesce(v_fees,0);
      v_exit_taxes := v_exit_taxes + coalesce(v_taxes,0);
    end if;
    v_open := v_entry.quantity-v_closed;
    v_pl := v_exit_proceeds-(v_entry.price*v_closed)-
      case when v_entry.quantity=0 then 0 else coalesce(v_entry.fees,0)*v_closed/v_entry.quantity end-
      v_exit_fees-v_exit_taxes;
    v_return := case when v_closed=0 then null else
      v_pl/((v_entry.price*v_closed)+(coalesce(v_entry.fees,0)*v_closed/v_entry.quantity))*100 end;
    insert into public.outcome_position_events(position_id,user_id,sequence_no,event_type,
      client_idempotency_key,request_fingerprint,broker_confirmed,broker_effective_at,price,
      quantity,fees,taxes,thesis_result,usefulness,exit_reason,owner_note,
      result_open_quantity,result_realized_pl,result_realized_return_pct)
    values(v_position.id,v_user,v_seq,p_event_type,p_idempotency_key,v_fp,coalesce(p_broker_confirmed,false),
      p_broker_effective_at,v_price,v_quantity,
      case when p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') then coalesce(v_fees,0) else null end,
      case when p_event_type in ('PARTIAL_EXIT_CONFIRMED','FINAL_EXIT_CONFIRMED') then coalesce(v_taxes,0) else null end,
      p_thesis_result,p_usefulness,
      p_exit_reason,p_owner_note,v_open,v_pl,v_return)
    returning id into v_event;
  end if;
  return query select v_event,v_seq,v_open,v_pl,v_return,false;
end $$;

revoke all on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) from public, anon, service_role;
revoke all on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) from public, anon, service_role;
grant execute on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) to authenticated;
