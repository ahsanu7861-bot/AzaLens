-- Verification-only reversal for migration 007. Never run automatically.
-- Refuse to discard immutable policy/equity evidence. On an unused foundation
-- the objects are removable in exact reverse dependency order; once populated,
-- production correction must be roll-forward.
do $$
begin
  if exists (select 1 from public.personal_risk_policy_versions) or
     exists (select 1 from public.broker_equity_snapshots) or
     exists (select 1 from public.daily_risk_equity_bases) or
     exists (select 1 from public.weekly_risk_equity_bases) then
    raise exception using errcode = '55000',
      message = 'migration 007 reversal refused: immutable risk evidence exists';
  end if;
end;
$$;

drop function if exists public.create_broker_equity_snapshot(uuid,numeric,text,text,text,text,timestamptz);
drop function if exists public.create_personal_risk_policy_version(uuid,numeric,numeric,numeric,numeric,integer,numeric);
drop table if exists public.weekly_risk_equity_bases;
drop table if exists public.daily_risk_equity_bases;
drop table if exists public.broker_equity_snapshots;
drop table if exists public.personal_risk_policy_versions;
