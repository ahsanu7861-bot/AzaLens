-- ============================================================
-- Down: 005 watchlist cap
--
-- Removes only the two objects migration 005 created, in the exact
-- reverse order: the trigger first, then the function it calls.
-- Dropping the function first would leave a trigger pointing at a
-- missing function for the length of the script.
--
-- This script touches no table, no column, no policy, no grant and
-- no row. public.watchlists and public.portfolio_holdings are left
-- exactly as migration 002 created them, with every row intact.
--
-- Never run automatically. Per db/README.md this exists so CI can
-- prove the migration is well-formed and reversible on a disposable
-- database. Reversing this on a live database re-opens the cap to
-- the concurrency and direct-PostgREST breaches that migration 005
-- exists to close, so a production rollback is a forward corrective
-- migration and a separate authorisation, not this file.
-- ============================================================

drop trigger if exists watchlists_enforce_record_cap on public.watchlists;

drop function if exists public.enforce_watchlist_record_cap();
