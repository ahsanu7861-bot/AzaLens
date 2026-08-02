-- ============================================================
-- 002 user data
--
-- The three user-owned tables that replace the shared JSON files,
-- then - last in this file - the signup trigger.
--
-- Implements Parts 2.3, 2.4, 2.5, 3.3, 3.4, 3.5 and 4.4 of
-- docs/ACCOUNTS_AND_DATABASE_DESIGN.md.
--
-- Ordering rule: a trigger is created after every table it writes
-- to. handle_new_user() writes to profiles, user_entitlements and
-- user_preferences, so it can only exist once all three do.
-- ============================================================

-- ------------------------------------------------------------
-- watchlists - replaces backend/storage/watchlists.json
-- ------------------------------------------------------------

create table public.watchlists (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  symbol   text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  note     text check (char_length(note) <= 280),
  added_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index watchlists_user_id_idx on public.watchlists (user_id);

alter table public.watchlists enable row level security;
alter table public.watchlists force  row level security;

revoke all on public.watchlists from anon, authenticated;
grant select, insert, delete on public.watchlists to authenticated;
grant update (note)          on public.watchlists to authenticated;

create policy watchlists_select_own on public.watchlists
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- This is what stops user B writing a row stamped with user A's id.
create policy watchlists_insert_own on public.watchlists
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy watchlists_update_own on public.watchlists
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlists_delete_own on public.watchlists
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- portfolio_holdings - replaces backend/storage/portfolios.json
--
-- numeric, not floating point: money must not drift.
-- ------------------------------------------------------------

create table public.portfolio_holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  symbol        text not null check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.-]{1,12}$'),
  shares        numeric(20, 8) not null check (shares > 0),
  average_price numeric(20, 8) not null check (average_price >= 0),
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  opened_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, symbol)
);

create index portfolio_holdings_user_id_idx on public.portfolio_holdings (user_id);

create trigger portfolio_holdings_set_updated_at
  before update on public.portfolio_holdings
  for each row execute function public.set_updated_at();

alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_holdings force  row level security;

revoke all on public.portfolio_holdings from anon, authenticated;
grant select, insert, delete                   on public.portfolio_holdings to authenticated;
grant update (shares, average_price, currency) on public.portfolio_holdings to authenticated;

create policy holdings_select_own on public.portfolio_holdings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy holdings_insert_own on public.portfolio_holdings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy holdings_update_own on public.portfolio_holdings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy holdings_delete_own on public.portfolio_holdings
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- user_preferences - one row per user, created by the trigger.
--
-- No insert grant and no insert policy: the trigger owns
-- creation. Two owners of the same fact is how bugs start, and a
-- permission that is never legitimately used is only ever attack
-- surface. The consequence is that the trigger must be reliable,
-- which is why its display_name expression cannot fail.
-- ------------------------------------------------------------

create table public.user_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  theme          text not null default 'system' check (theme in ('system', 'light', 'dark')),
  default_market text not null default 'US'
                 check (default_market = upper(default_market) and char_length(default_market) <= 8),
  settings       jsonb not null default '{}'::jsonb
                 check (octet_length(settings::text) <= 8192),
  updated_at     timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;
alter table public.user_preferences force  row level security;

revoke all on public.user_preferences from anon, authenticated;
grant select                                   on public.user_preferences to authenticated;
grant update (theme, default_market, settings) on public.user_preferences to authenticated;

create policy preferences_select_own on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- Signup trigger - LAST, now that all three tables exist.
--
-- The display name cannot break signup: left(..., 60) truncates,
-- coalesce handles missing metadata, nullif(trim(...)) handles a
-- whitespace-only name, coalesce(new.email, '') handles a null
-- email, and a final literal covers everything else. The
-- expression cannot produce a value that violates the constraint.
--
-- Exceptions are deliberately not swallowed. A user who can log
-- in but has no entitlements row is worse than a failed signup:
-- the failure is loud and fixable, the half-account is silent.
--
-- set search_path = '' with fully-qualified names: this runs
-- security definer, and a manipulated search path must not be
-- able to redirect the writes.
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'AzaLens user'
    ), 60)
  )
  on conflict (id) do nothing;

  insert into public.user_entitlements (user_id, tier, granted_by)
  values (new.id, 'free', 'signup-default')
  on conflict (user_id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Explicit revoke, for the reason recorded in migration 001: the
-- default-privilege revoke cannot subtract Postgres's built-in
-- EXECUTE-to-PUBLIC default. This function is security definer, so
-- leaving it callable would let any logged-in user invoke it
-- directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
