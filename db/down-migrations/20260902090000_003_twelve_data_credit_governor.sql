-- NEVER RUN AUTOMATICALLY. Production rollback is a forward migration.
drop function if exists public.reserve_twelve_data_credits(text, integer);
drop table if exists public.twelve_data_credit_ledger;
