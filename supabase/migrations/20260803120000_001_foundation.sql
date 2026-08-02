-- ============================================================
-- 001 foundation
--
-- Account identity tables and the privilege posture everything
-- else depends on. Implements Parts 2.1, 2.2, 3.0, 3.0.1, 3.1
-- and 3.2 of docs/ACCOUNTS_AND_DATABASE_DESIGN.md.
--
-- Deliberately NOT here: the signup trigger. handle_new_user()
-- writes to user_preferences, which migration 002 creates, so
-- creating the trigger now would block account creation for the
-- whole window between the two migrations. See design Part 6.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Default privileges: close the door before opening it.
--
-- Postgres grants EXECUTE on new functions to PUBLIC, and
-- Supabase grants schema usage to anon and authenticated, so every
-- function is callable by any logged-in user - and by anyone
-- holding the publishable key - unless something removes it.
--
-- MEASURED, NOT ASSUMED: this statement alone is NOT sufficient.
-- Verified on Supabase local (Postgres 17): after running it, a
-- newly created function still has proacl IS NULL, which means
-- Postgres applies its built-in default of EXECUTE TO PUBLIC, and
-- has_function_privilege('anon', ..., 'EXECUTE') returns true.
-- ALTER DEFAULT PRIVILEGES cannot subtract the server's built-in
-- default; it only adjusts grants layered on top of it.
--
-- So it is kept as a second line of defence, and every function we
-- define carries an explicit REVOKE immediately after its
-- definition. testRlsCoverage.js asserts no function in public is
-- executable by anon or authenticated, which is what actually
-- holds the line.
-- ------------------------------------------------------------

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ------------------------------------------------------------
-- Shared updated_at trigger, so freshness never depends on a
-- route remembering to set it.
--
-- Column-level UPDATE grants deliberately exclude updated_at
-- (design 3.0.1). Column privileges are checked against the
-- columns named in the user's SET clause; a BEFORE UPDATE
-- trigger assigning new.updated_at is not subject to the
-- invoker's column privileges, so timestamps still move while
-- users cannot choose the value.
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Explicit, because the default-privilege revoke above does not
-- reach the server's built-in EXECUTE-to-PUBLIC default.
-- A BEFORE UPDATE trigger function is invoked by the executor, not
-- called by the user, so removing EXECUTE does not stop the
-- trigger firing - testTenantIsolation.js asserts both halves:
-- the forged write is rejected AND updated_at still moves.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ------------------------------------------------------------
-- profiles - one row per person, created by the signup trigger
-- in migration 002.
-- ------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force  row level security;

revoke all on public.profiles from anon, authenticated;
grant select                on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- No insert policy: rows come from the signup trigger.
-- No delete policy: deletion cascades from auth.users, so a user
-- cannot orphan themselves halfway.

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ------------------------------------------------------------
-- user_entitlements - the tier column, in its own table.
--
-- If tier lived on profiles, a user could edit their own profile
-- row and set tier = 'pro'. Here there is no write policy and no
-- write grant at all, so the ability does not exist. Only the
-- secret key can change it.
--
-- The Shariah screening path must never reference this table.
-- ------------------------------------------------------------

create table public.user_entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  tier       text not null default 'free' check (tier in ('free', 'pro')),
  granted_by text check (char_length(granted_by) <= 64),
  updated_at timestamptz not null default now()
);

create trigger user_entitlements_set_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();

alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force  row level security;

revoke all on public.user_entitlements from anon, authenticated;
grant select on public.user_entitlements to authenticated;

create policy entitlements_select_own on public.user_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);
