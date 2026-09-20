-- Verification-only empty-surface reversal. Never run automatically.
do $$ begin
 if exists(select 1 from public.personal_risk_evaluations)
 or exists(select 1 from public.outcome_exit_cost_allocations)
 or exists(select 1 from public.outcome_protective_stop_changes)
 or exists(select 1 from public.outcome_position_increases)
 or exists(select 1 from public.outcome_position_risk_state)
 or exists(select 1 from public.broker_cost_schedule_components)
 or exists(select 1 from public.broker_cost_schedule_versions) then
  raise exception using errcode='55000',message='migration 008 reversal refused: immutable risk lifecycle evidence exists';
 end if;
end $$;

drop function if exists public.append_risk_lifecycle_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text);
drop function if exists public.change_outcome_protective_stop(uuid,uuid,numeric,text);
drop function if exists public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric);
drop function if exists public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text);
drop function if exists public._risk008_validate_open(text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric);
drop function if exists public._risk008_calculate(numeric,numeric,numeric,numeric,numeric,numeric);
drop function if exists public.create_broker_cost_schedule_version(uuid,date,text,timestamptz,text,text,text,text);
grant execute on function public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text) to authenticated;
drop table if exists public.personal_risk_evaluations;
drop table if exists public.outcome_exit_cost_allocations;
drop table if exists public.outcome_protective_stop_changes;
drop table if exists public.outcome_position_increases;
drop table if exists public.outcome_position_risk_state;
drop table if exists public.broker_cost_schedule_components;
drop table if exists public.broker_cost_schedule_versions;
