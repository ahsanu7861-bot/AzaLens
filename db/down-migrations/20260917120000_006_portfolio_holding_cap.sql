-- ============================================================
-- Down: 006 current portfolio holding cap
--
-- Verification-only reversal. Removes only migration 006's trigger
-- and function. It preserves every portfolio row, the migration-002
-- updated-at trigger, all policies/grants, and migrations 001-005.
-- Never run automatically against production.
-- ============================================================

drop trigger if exists portfolio_holdings_enforce_record_cap
  on public.portfolio_holdings;

drop function if exists public.enforce_portfolio_holding_cap();
