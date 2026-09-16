-- ============================================================
-- 006 current portfolio holding cap
--
-- Enforces the founder-approved maximum of 50 concurrent current
-- holdings per owner at the database boundary. Closed positions do
-- not belong in this table; their history belongs in the outcome
-- ledger.
--
-- Migration 002 gives authenticated users direct INSERT access to
-- public.portfolio_holdings, so a Node count cannot protect direct
-- PostgREST calls or concurrent inserts. This migration adds only a
-- dedicated trigger function and trigger. It does not change the
-- table, its rows, existing updated-at trigger, policies or grants.
-- ============================================================

create or replace function public.enforce_portfolio_holding_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit   constant integer := 50;
  v_actor   uuid := auth.uid();
  v_current integer;
begin
  -- Do not count, check duplicates or disclose cap state for a forged
  -- owner. Migration 002's INSERT policy will reject the row.
  -- A null actor is a privileged non-JWT path and remains capped.
  if v_actor is not null and v_actor <> new.user_id then
    return new;
  end if;

  -- Preserve the existing duplicate contract before cap disclosure.
  if exists (
    select 1
      from public.portfolio_holdings
     where user_id = new.user_id
       and symbol = new.symbol
  ) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  -- A concurrent transaction may have inserted this symbol while this
  -- transaction waited for the owner lock. Recheck so the unique
  -- constraint, never the cap, remains authoritative for duplicates.
  if exists (
    select 1
      from public.portfolio_holdings
     where user_id = new.user_id
       and symbol = new.symbol
  ) then
    return new;
  end if;

  select pg_catalog.count(*)
    into v_current
    from public.portfolio_holdings
   where user_id = new.user_id;

  if v_current >= v_limit then
    raise exception using
      errcode = 'PT422',
      message = 'PORTFOLIO_LIMIT_REACHED',
      detail  = 'limit=' || v_limit || ';current=' || v_current,
      hint    = 'Remove a holding before adding another.';
  end if;

  return new;
end;
$$;

-- Trigger functions are not RPCs. Remove PostgreSQL's default PUBLIC
-- EXECUTE and every application-role path to direct invocation.
revoke all on function public.enforce_portfolio_holding_cap()
  from public, anon, authenticated, service_role;

create trigger portfolio_holdings_enforce_record_cap
  before insert on public.portfolio_holdings
  for each row
  execute function public.enforce_portfolio_holding_cap();
