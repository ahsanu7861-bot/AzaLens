-- ============================================================
-- 007 personal risk foundations
--
-- Foundation only. These immutable objects record versioned personal risk
-- policy and broker-equity evidence. No outcome-ledger object references them,
-- and this migration performs no trade admission or enforcement.
--
-- Approved semantics represented here:
--   * account equity is broker-confirmed evidence, never reconstructed market
--     value or cost basis;
--   * position/open-risk limits are policy-version facts;
--   * realised-loss limits are GROSS losing-trade sums: winners never offset;
--   * open planned-loss contribution is floored at zero;
--   * protective stops are mandatory for future opens/increases;
--   * slippage is uniform within a policy version, never a per-trade input;
--   * daily/weekly periods use America/New_York;
--   * a period basis can only stay equal or tighten to a lower accepted equity.
--
-- Rule 19 (accepted and rejected risk-increasing actions must retain the policy,
-- snapshot and period-basis identities used) is deliberately NOT implemented
-- here. It belongs to the later ledger-enforcement migration. Adding action
-- records or ledger references here would violate this migration's approved
-- reversible foundation-only boundary.
-- ============================================================

create table public.personal_risk_policy_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version_no bigint not null check (version_no > 0),
  portfolio_value_basis text not null
    check (portfolio_value_basis = 'BROKER_CONFIRMED_ACCOUNT_EQUITY'),
  thesis_and_protective_stop_separate boolean not null
    check (thesis_and_protective_stop_separate),
  protective_stop_evidence_policy text not null check (
    protective_stop_evidence_policy = 'OWNER_DECLARED_OR_BROKER_CONFIRMED_RECORDED_AS_SUCH'
  ),
  position_basis_method text not null
    check (position_basis_method = 'WEIGHTED_AVERAGE_SINGLE_AGGREGATED_POSITION'),
  planned_loss_cost_basis text not null check (
    planned_loss_cost_basis = 'REMAINING_EXIT_FEES_TAXES_AND_POLICY_SLIPPAGE'
  ),
  planned_loss_recalculation text not null check (
    planned_loss_recalculation = 'CURRENT_REMAINING_QUANTITY_WEIGHTED_ENTRY_STOP_AND_ESTIMATED_EXIT_COSTS'
  ),
  realized_pnl_cost_basis text not null
    check (realized_pnl_cost_basis = 'ACTUAL_ENTRY_AND_EXIT_FEES_AND_TAXES'),
  max_planned_loss_per_position_pct numeric(9,6) not null
    check (max_planned_loss_per_position_pct > 0 and max_planned_loss_per_position_pct <= 100),
  max_aggregate_open_planned_loss_pct numeric(9,6) not null
    check (max_aggregate_open_planned_loss_pct > 0 and max_aggregate_open_planned_loss_pct <= 100),
  daily_realized_gross_loss_limit_pct numeric(9,6) not null
    check (daily_realized_gross_loss_limit_pct > 0 and daily_realized_gross_loss_limit_pct <= 100),
  weekly_realized_gross_loss_limit_pct numeric(9,6) not null
    check (weekly_realized_gross_loss_limit_pct > 0 and weekly_realized_gross_loss_limit_pct <= 100),
  maximum_concurrent_open_positions smallint not null
    check (maximum_concurrent_open_positions between 1 and 50),
  period_timezone text not null check (period_timezone = 'America/New_York'),
  realized_loss_aggregation text not null
    check (realized_loss_aggregation = 'LOSING_TRADES_GROSS_NO_WINNER_OFFSET'),
  aggregate_open_loss_floor text not null
    check (aggregate_open_loss_floor = 'ZERO_PER_POSITION'),
  protective_stop_required_for_risk_increase boolean not null
    check (protective_stop_required_for_risk_increase),
  stop_loosening_is_risk_increasing boolean not null
    check (stop_loosening_is_risk_increasing),
  risk_reducing_exit_always_permitted boolean not null
    check (risk_reducing_exit_always_permitted),
  estimated_exit_slippage_bps numeric(9,4) not null
    check (estimated_exit_slippage_bps >= 0 and estimated_exit_slippage_bps <= 1000),
  client_idempotency_key uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (user_id, version_no),
  unique (user_id, client_idempotency_key),
  check (max_aggregate_open_planned_loss_pct >= max_planned_loss_per_position_pct),
  check (weekly_realized_gross_loss_limit_pct >= daily_realized_gross_loss_limit_pct)
);

create table public.broker_equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_equity numeric(24,8) not null check (account_equity > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  broker_identifier text not null
    check (char_length(broker_identifier) between 1 and 80 and
           broker_identifier ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'),
  confirmation_method text not null check (confirmation_method in (
    'OWNER_CONFIRMED_BROKER_VALUE',
    'BROKER_INTEGRATION_CONFIRMED'
  )),
  confirmation_reference text not null
    check (char_length(confirmation_reference) between 1 and 240 and
           confirmation_reference !~ '[[:cntrl:]]'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  client_idempotency_key uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint broker_equity_snapshots_not_future check (observed_at <= recorded_at),
  unique (id, user_id),
  unique (user_id, client_idempotency_key)
);

-- These are append-only basis histories, not mutable singleton rows. Every
-- accepted snapshot creates one row for each period. effective_equity is the
-- minimum of the new snapshot and the prior row for that period.
create table public.daily_risk_equity_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_timezone text not null check (period_timezone = 'America/New_York'),
  source_snapshot_id uuid not null,
  previous_basis_id uuid,
  effective_equity numeric(24,8) not null check (effective_equity > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (user_id, source_snapshot_id),
  foreign key (source_snapshot_id, user_id)
    references public.broker_equity_snapshots(id, user_id) on delete cascade,
  foreign key (previous_basis_id, user_id)
    references public.daily_risk_equity_bases(id, user_id),
  check (previous_basis_id is null or previous_basis_id <> id)
);

create table public.weekly_risk_equity_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_timezone text not null check (period_timezone = 'America/New_York'),
  source_snapshot_id uuid not null,
  previous_basis_id uuid,
  effective_equity numeric(24,8) not null check (effective_equity > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  unique (user_id, source_snapshot_id),
  foreign key (source_snapshot_id, user_id)
    references public.broker_equity_snapshots(id, user_id) on delete cascade,
  foreign key (previous_basis_id, user_id)
    references public.weekly_risk_equity_bases(id, user_id),
  check (previous_basis_id is null or previous_basis_id <> id)
);

create index daily_risk_equity_bases_owner_period_idx
  on public.daily_risk_equity_bases(user_id, period_start, recorded_at desc, id desc);
create index weekly_risk_equity_bases_owner_period_idx
  on public.weekly_risk_equity_bases(user_id, period_start, recorded_at desc, id desc);
create index broker_equity_snapshots_owner_observed_idx
  on public.broker_equity_snapshots(user_id, observed_at desc, id desc);

alter table public.personal_risk_policy_versions enable row level security;
alter table public.personal_risk_policy_versions force row level security;
alter table public.broker_equity_snapshots enable row level security;
alter table public.broker_equity_snapshots force row level security;
alter table public.daily_risk_equity_bases enable row level security;
alter table public.daily_risk_equity_bases force row level security;
alter table public.weekly_risk_equity_bases enable row level security;
alter table public.weekly_risk_equity_bases force row level security;

create policy personal_risk_policy_versions_select_own
  on public.personal_risk_policy_versions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy broker_equity_snapshots_select_own
  on public.broker_equity_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy daily_risk_equity_bases_select_own
  on public.daily_risk_equity_bases for select to authenticated
  using ((select auth.uid()) = user_id);
create policy weekly_risk_equity_bases_select_own
  on public.weekly_risk_equity_bases for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.personal_risk_policy_versions,
  public.broker_equity_snapshots,
  public.daily_risk_equity_bases,
  public.weekly_risk_equity_bases
  from public, anon, authenticated, service_role;

grant select on public.personal_risk_policy_versions,
  public.broker_equity_snapshots,
  public.daily_risk_equity_bases,
  public.weekly_risk_equity_bases
  to authenticated;

create function public.create_personal_risk_policy_version(
  p_client_idempotency_key uuid,
  p_max_planned_loss_per_position_pct numeric,
  p_max_aggregate_open_planned_loss_pct numeric,
  p_daily_realized_gross_loss_limit_pct numeric,
  p_weekly_realized_gross_loss_limit_pct numeric,
  p_maximum_concurrent_open_positions integer,
  p_estimated_exit_slippage_bps numeric
)
returns table(policy_version_id uuid, version_no bigint, replayed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_bad_numeric text;
  v_position_pct numeric(9,6);
  v_aggregate_pct numeric(9,6);
  v_daily_pct numeric(9,6);
  v_weekly_pct numeric(9,6);
  v_slippage_bps numeric(9,4);
  v_version bigint;
  v_id uuid;
  v_fingerprint text;
  v_existing public.personal_risk_policy_versions%rowtype;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key required';
  end if;

  select f.field into v_bad_numeric
    from (values
      ('daily_realized_gross_loss_limit_pct', p_daily_realized_gross_loss_limit_pct, 6, 3),
      ('estimated_exit_slippage_bps', p_estimated_exit_slippage_bps, 4, 5),
      ('max_aggregate_open_planned_loss_pct', p_max_aggregate_open_planned_loss_pct, 6, 3),
      ('max_planned_loss_per_position_pct', p_max_planned_loss_per_position_pct, 6, 3),
      ('weekly_realized_gross_loss_limit_pct', p_weekly_realized_gross_loss_limit_pct, 6, 3)
    ) as f(field, amount, max_scale, max_integer_digits)
   where f.amount is null or scale(f.amount) > f.max_scale
      or abs(f.amount) >= power(10::numeric, f.max_integer_digits)
   order by f.field limit 1;
  if v_bad_numeric is not null then
    raise exception using errcode = '22003',
      message = 'numeric input exceeds risk-policy precision contract: ' || v_bad_numeric;
  end if;

  v_position_pct := p_max_planned_loss_per_position_pct;
  v_aggregate_pct := p_max_aggregate_open_planned_loss_pct;
  v_daily_pct := p_daily_realized_gross_loss_limit_pct;
  v_weekly_pct := p_weekly_realized_gross_loss_limit_pct;
  v_slippage_bps := p_estimated_exit_slippage_bps;

  if v_position_pct <= 0 or v_position_pct > 100 or
     v_aggregate_pct <= 0 or v_aggregate_pct > 100 or
     v_daily_pct <= 0 or v_daily_pct > 100 or
     v_weekly_pct <= 0 or v_weekly_pct > 100 or
     v_slippage_bps < 0 or v_slippage_bps > 1000 or
     p_maximum_concurrent_open_positions is null or
     p_maximum_concurrent_open_positions not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid risk policy';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1,
    'portfolio_value_basis', 'BROKER_CONFIRMED_ACCOUNT_EQUITY',
    'thesis_and_protective_stop_separate', true,
    'protective_stop_evidence_policy', 'OWNER_DECLARED_OR_BROKER_CONFIRMED_RECORDED_AS_SUCH',
    'position_basis_method', 'WEIGHTED_AVERAGE_SINGLE_AGGREGATED_POSITION',
    'planned_loss_cost_basis', 'REMAINING_EXIT_FEES_TAXES_AND_POLICY_SLIPPAGE',
    'planned_loss_recalculation', 'CURRENT_REMAINING_QUANTITY_WEIGHTED_ENTRY_STOP_AND_ESTIMATED_EXIT_COSTS',
    'realized_pnl_cost_basis', 'ACTUAL_ENTRY_AND_EXIT_FEES_AND_TAXES',
    'max_planned_loss_per_position_pct', v_position_pct,
    'max_aggregate_open_planned_loss_pct', v_aggregate_pct,
    'daily_realized_gross_loss_limit_pct', v_daily_pct,
    'weekly_realized_gross_loss_limit_pct', v_weekly_pct,
    'maximum_concurrent_open_positions', p_maximum_concurrent_open_positions,
    'period_timezone', 'America/New_York',
    'realized_loss_aggregation', 'LOSING_TRADES_GROSS_NO_WINNER_OFFSET',
    'aggregate_open_loss_floor', 'ZERO_PER_POSITION',
    'protective_stop_required_for_risk_increase', true,
    'stop_loosening_is_risk_increasing', true,
    'risk_reducing_exit_always_permitted', true,
    'estimated_exit_slippage_bps', v_slippage_bps
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  select * into v_existing
    from public.personal_risk_policy_versions
   where user_id = v_user and client_idempotency_key = p_client_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency conflict';
    end if;
    return query select v_existing.id, v_existing.version_no, true;
    return;
  end if;

  select coalesce(pg_catalog.max(p.version_no), 0) + 1 into v_version
    from public.personal_risk_policy_versions p where p.user_id = v_user;

  insert into public.personal_risk_policy_versions(
    user_id, version_no, portfolio_value_basis,
    thesis_and_protective_stop_separate, protective_stop_evidence_policy,
    position_basis_method, planned_loss_cost_basis, planned_loss_recalculation,
    realized_pnl_cost_basis,
    max_planned_loss_per_position_pct, max_aggregate_open_planned_loss_pct,
    daily_realized_gross_loss_limit_pct, weekly_realized_gross_loss_limit_pct,
    maximum_concurrent_open_positions, period_timezone,
    realized_loss_aggregation, aggregate_open_loss_floor,
    protective_stop_required_for_risk_increase, stop_loosening_is_risk_increasing,
    risk_reducing_exit_always_permitted,
    estimated_exit_slippage_bps, client_idempotency_key, request_fingerprint
  ) values (
    v_user, v_version, 'BROKER_CONFIRMED_ACCOUNT_EQUITY',
    true, 'OWNER_DECLARED_OR_BROKER_CONFIRMED_RECORDED_AS_SUCH',
    'WEIGHTED_AVERAGE_SINGLE_AGGREGATED_POSITION',
    'REMAINING_EXIT_FEES_TAXES_AND_POLICY_SLIPPAGE',
    'CURRENT_REMAINING_QUANTITY_WEIGHTED_ENTRY_STOP_AND_ESTIMATED_EXIT_COSTS',
    'ACTUAL_ENTRY_AND_EXIT_FEES_AND_TAXES',
    v_position_pct, v_aggregate_pct, v_daily_pct, v_weekly_pct,
    p_maximum_concurrent_open_positions, 'America/New_York',
    'LOSING_TRADES_GROSS_NO_WINNER_OFFSET', 'ZERO_PER_POSITION', true, true, true,
    v_slippage_bps, p_client_idempotency_key, v_fingerprint
  ) returning id into v_id;

  return query select v_id, v_version, false;
end;
$$;

create function public.create_broker_equity_snapshot(
  p_client_idempotency_key uuid,
  p_account_equity numeric,
  p_currency text,
  p_broker_identifier text,
  p_confirmation_method text,
  p_confirmation_reference text,
  p_observed_at timestamptz
)
returns table(
  equity_snapshot_id uuid,
  daily_basis_id uuid,
  weekly_basis_id uuid,
  daily_effective_equity numeric,
  weekly_effective_equity numeric,
  replayed boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_equity numeric(24,8);
  v_fingerprint text;
  v_existing public.broker_equity_snapshots%rowtype;
  v_snapshot_id uuid;
  v_daily_id uuid;
  v_weekly_id uuid;
  v_daily_previous public.daily_risk_equity_bases%rowtype;
  v_weekly_previous public.weekly_risk_equity_bases%rowtype;
  v_daily_equity numeric(24,8);
  v_weekly_equity numeric(24,8);
  v_day date;
  v_week date;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key required';
  end if;
  if p_account_equity is null or scale(p_account_equity) > 8 or
     abs(p_account_equity) >= power(10::numeric, 16) then
    raise exception using errcode = '22003',
      message = 'numeric input exceeds equity precision contract: account_equity';
  end if;
  v_equity := p_account_equity;
  if v_equity <= 0 or p_currency is null or
     p_currency <> upper(p_currency) or p_currency !~ '^[A-Z]{3}$' or
     p_broker_identifier is null or char_length(p_broker_identifier) not between 1 and 80 or
     p_broker_identifier !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$' or
     p_confirmation_method not in ('OWNER_CONFIRMED_BROKER_VALUE','BROKER_INTEGRATION_CONFIRMED') or
     p_confirmation_reference is null or char_length(p_confirmation_reference) not between 1 and 240 or
     p_confirmation_reference ~ '[[:cntrl:]]' or p_observed_at is null or
     p_observed_at > clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid broker equity snapshot';
  end if;

  v_day := (p_observed_at at time zone 'America/New_York')::date;
  v_week := date_trunc('week', p_observed_at at time zone 'America/New_York')::date;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'version', 1, 'account_equity', v_equity, 'currency', p_currency,
    'broker_identifier', p_broker_identifier,
    'confirmation_method', p_confirmation_method,
    'confirmation_reference', p_confirmation_reference,
    'observed_at', p_observed_at
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  select * into v_existing from public.broker_equity_snapshots
   where user_id = v_user and client_idempotency_key = p_client_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'idempotency conflict';
    end if;
    select id, effective_equity into v_daily_id, v_daily_equity
      from public.daily_risk_equity_bases
     where user_id = v_user and source_snapshot_id = v_existing.id;
    select id, effective_equity into v_weekly_id, v_weekly_equity
      from public.weekly_risk_equity_bases
     where user_id = v_user and source_snapshot_id = v_existing.id;
    return query select v_existing.id, v_daily_id, v_weekly_id,
      v_daily_equity, v_weekly_equity, true;
    return;
  end if;

  select * into v_daily_previous
    from public.daily_risk_equity_bases
   where user_id = v_user and period_start = v_day and currency = p_currency
   order by recorded_at desc, id desc limit 1;
  select * into v_weekly_previous
    from public.weekly_risk_equity_bases
   where user_id = v_user and period_start = v_week and currency = p_currency
   order by recorded_at desc, id desc limit 1;

  v_daily_equity := least(v_equity, coalesce(v_daily_previous.effective_equity, v_equity));
  v_weekly_equity := least(v_equity, coalesce(v_weekly_previous.effective_equity, v_equity));

  insert into public.broker_equity_snapshots(
    user_id, account_equity, currency, broker_identifier, confirmation_method,
    confirmation_reference, observed_at, client_idempotency_key, request_fingerprint
  ) values (
    v_user, v_equity, p_currency, p_broker_identifier, p_confirmation_method,
    p_confirmation_reference, p_observed_at, p_client_idempotency_key, v_fingerprint
  ) returning id into v_snapshot_id;

  insert into public.daily_risk_equity_bases(
    user_id, period_start, period_timezone, source_snapshot_id, previous_basis_id,
    effective_equity, currency
  ) values (
    v_user, v_day, 'America/New_York', v_snapshot_id, v_daily_previous.id,
    v_daily_equity, p_currency
  ) returning id into v_daily_id;

  insert into public.weekly_risk_equity_bases(
    user_id, period_start, period_timezone, source_snapshot_id, previous_basis_id,
    effective_equity, currency
  ) values (
    v_user, v_week, 'America/New_York', v_snapshot_id, v_weekly_previous.id,
    v_weekly_equity, p_currency
  ) returning id into v_weekly_id;

  return query select v_snapshot_id, v_daily_id, v_weekly_id,
    v_daily_equity, v_weekly_equity, false;
end;
$$;

revoke all on function public.create_personal_risk_policy_version(uuid,numeric,numeric,numeric,numeric,integer,numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.create_broker_equity_snapshot(uuid,numeric,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.create_personal_risk_policy_version(uuid,numeric,numeric,numeric,numeric,integer,numeric)
  to authenticated;
grant execute on function public.create_broker_equity_snapshot(uuid,numeric,text,text,text,text,timestamptz)
  to authenticated;
