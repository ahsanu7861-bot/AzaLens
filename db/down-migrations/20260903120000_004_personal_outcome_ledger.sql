-- NEVER RUN AUTOMATICALLY. Verification-only destructive reversal for migration 004.
drop function if exists public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text);
drop function if exists public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric);

drop table if exists public.outcome_position_events;
drop table if exists public.outcome_positions;
drop table if exists public.outcome_snapshot_provenance;
drop table if exists public.outcome_decision_snapshots;
