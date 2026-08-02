-- ============================================================
-- DOWN for 20260803120000_001_foundation.sql
--
-- NEVER RUN AUTOMATICALLY. See the sibling 002 down-script.
--
-- Runs only after 002's down-script, because nothing here may be
-- removed while the objects that depend on it still exist.
--
-- pgcrypto is deliberately NOT dropped: it is a shared extension
-- that other things may rely on, and removing it would reach
-- outside what this migration created.
-- ============================================================

drop trigger if exists user_entitlements_set_updated_at on public.user_entitlements;
drop table if exists public.user_entitlements;

drop trigger if exists profiles_set_updated_at on public.profiles;
drop table if exists public.profiles;

drop function if exists public.set_updated_at();

-- Restore the default privilege posture this migration changed.
alter default privileges in schema public
  grant execute on functions to public;
