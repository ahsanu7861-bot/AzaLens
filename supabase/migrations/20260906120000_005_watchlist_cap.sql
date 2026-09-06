-- ============================================================
-- 005 watchlist cap
--
-- Makes the 100-symbol watchlist cap a database invariant.
--
-- Why this migration exists. Migration 002 grants `authenticated`
-- a direct table INSERT on public.watchlists, so the cap that
-- backend/services/watchlistService.js applies is advisory in two
-- independent ways, both reproduced on a local stack:
--
--   1. Count-then-insert is time-of-check/time-of-use. Twelve
--      concurrent requests starting from 99 rows each observed 99,
--      each passed the check, and all twelve inserted - 111 rows.
--   2. A holder of a valid owner token can insert straight through
--      PostgREST and never reach the Node service at all (HTTP 201).
--
-- No request sequencing in Node can fix either one. The invariant
-- has to live where the rows do.
--
-- Scope. This migration adds exactly one function and one trigger.
-- It adds no table, column, type, index, policy or grant, and it
-- changes nothing in migrations 001-004. Every column, grant and
-- policy created by migration 002 is left exactly as it is.
--
-- Deliberately NOT included: public.portfolio_holdings. A symmetric
-- PORTFOLIO_RECORD_LIMIT = 100 exists today in
-- backend/services/portfolioService.js with the same weakness, but
-- extending this invariant to it is a separate decision and a
-- separate migration. Silently broadening the cap here would ship a
-- product limit nobody approved in this change.
-- ============================================================

-- ------------------------------------------------------------
-- The cap function.
--
-- SECURITY DEFINER, deliberately. A SECURITY INVOKER trigger would
-- count through the caller's own privileges and row-level security,
-- so the invariant would silently depend on the caller holding
-- SELECT. Today `authenticated` does hold SELECT and an invoker
-- function would count correctly - but a role with INSERT and no
-- SELECT would count zero and sail past the cap. An invariant that
-- holds only because of a privilege granted somewhere else is not an
-- invariant. As definer, the count is authoritative for every caller.
--
-- The escalation surface that normally comes with SECURITY DEFINER is
-- closed the same way migration 003 closes it: a fixed empty
-- search_path, every relation and function schema-qualified, and
-- EXECUTE revoked below. PostgreSQL checks EXECUTE on a trigger
-- function when the trigger is created, not each time it fires, so
-- revoking EXECUTE afterwards does not stop the trigger - exactly the
-- property migration 001 already relies on for set_updated_at().
--
-- The advisory lock is transaction-scoped (pg_advisory_xact_lock),
-- never session-scoped: it is released by commit or rollback, so a
-- pooled connection can never carry it into an unrelated request.
-- Taking it before the count is what turns count-then-insert from a
-- race into a decision. Under READ COMMITTED each statement takes a
-- fresh snapshot, so the waiter's count runs after the holder commits
-- and sees the row the holder just added.
--
-- The lock key is derived from new.user_id, so two owners contend
-- only on a hash collision. A collision costs a moment of extra
-- serialisation and nothing else: the count is still filtered by
-- `user_id = new.user_id`, so a colliding owner can never be counted
-- into, or out of, somebody else's cap.
--
-- Enforcement reads new.user_id - the row PostgreSQL is about to
-- write - not any identifier supplied by an application. A forged
-- user_id is still rejected by the migration-002 insert policy, whose
-- WITH CHECK is evaluated after this trigger has run; the ownership
-- gate below makes sure the cap never speaks first and never turns
-- into an oracle for another owner's row count.
-- ------------------------------------------------------------

create or replace function public.enforce_watchlist_record_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit   constant integer := 100;
  v_actor   uuid := auth.uid();
  v_current integer;
begin
  -- Ownership gate, before anything is counted.
  --
  -- A caller with a session may only be capped against their own
  -- rows. If they are proposing a row owned by somebody else the
  -- migration-002 insert policy is going to reject it a moment from
  -- now, so this function must not evaluate it: counting here would
  -- both report the wrong reason and turn the cap into an oracle for
  -- whether another owner happens to be full. Returning early cannot
  -- bypass the cap, because the row is refused outright.
  --
  -- A null actor means there is no JWT at all - a superuser or
  -- service_role path - and those are still capped, deliberately.
  if v_actor is not null and v_actor <> new.user_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  -- Duplicate detection outranks the cap, matching the ordering
  -- backend/services/watchlistService.js already documents: someone
  -- at the limit re-adding a symbol they already hold must get the
  -- accurate duplicate error, not a misleading "limit reached". The
  -- UNIQUE (user_id, symbol) constraint from migration 002 raises it
  -- immediately after this returns, so the reason stays correct and
  -- the two failures stay distinguishable.
  if exists (
    select 1
      from public.watchlists
     where user_id = new.user_id
       and symbol = new.symbol
  ) then
    return new;
  end if;

  select pg_catalog.count(*)
    into v_current
    from public.watchlists
   where user_id = new.user_id;

  if v_current >= v_limit then
    -- PT422 is PostgREST's documented escape hatch for choosing the
    -- HTTP status directly, verified against the PostgREST this
    -- repository runs (v14.5): it returns 422 with
    -- {"code":"PT422","details":...,"hint":...,"message":...}.
    -- A plain check_violation would surface as 400 and force the
    -- caller to re-map it. The stable machine-readable token lives in
    -- `message`, and `details` carries the two numbers a client needs,
    -- so no caller ever has to parse SQL prose. Nothing here names a
    -- table, column, policy, role or connection.
    raise exception using
      errcode = 'PT422',
      message = 'WATCHLIST_LIMIT_REACHED',
      detail  = 'limit=' || v_limit || ';current=' || v_current,
      hint    = 'Remove a symbol before adding another.';
  end if;

  return new;
end;
$$;

-- Explicit, because ALTER DEFAULT PRIVILEGES cannot subtract the
-- server's built-in EXECUTE-to-PUBLIC default - the finding recorded
-- in docs/ACCOUNTS_AND_DATABASE_DESIGN.md revision 4, item i.
-- service_role is included: nothing should ever call this by hand.
revoke all on function public.enforce_watchlist_record_cap()
  from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- The trigger. BEFORE INSERT, FOR EACH ROW: the decision has to be
-- made per candidate row and before the row lands, so that a
-- multi-row INSERT is capped row by row rather than in one lump.
-- ------------------------------------------------------------

create trigger watchlists_enforce_record_cap
  before insert on public.watchlists
  for each row
  execute function public.enforce_watchlist_record_cap();
