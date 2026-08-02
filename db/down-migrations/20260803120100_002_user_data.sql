-- ============================================================
-- DOWN for 20260803120100_002_user_data.sql
--
-- NEVER RUN AUTOMATICALLY. This file lives outside supabase/ so
-- no Supabase CLI operation can execute it. It is a local and CI
-- tool for proving the migration is well-formed. Production
-- rollback is a forward corrective migration.
--
-- Reverse creation order exactly: trigger -> function -> tables.
-- Dropping user_preferences while on_auth_user_created still
-- exists would leave a trigger pointing at a missing table and
-- reintroduce broken signup from the other direction.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
drop table if exists public.user_preferences;

drop trigger if exists portfolio_holdings_set_updated_at on public.portfolio_holdings;
drop table if exists public.portfolio_holdings;

drop table if exists public.watchlists;
