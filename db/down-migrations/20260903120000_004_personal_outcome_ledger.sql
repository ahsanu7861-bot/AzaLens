-- NEVER RUN AUTOMATICALLY. Verification-only destructive reversal for migration 004.
drop function if exists public.append_outcome_position_event(uuid,uuid,text,boolean,timestamptz,numeric,numeric,numeric,numeric,text,text,text,text,bigint);
drop function if exists public.create_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,uuid,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric);
drop function if exists public.create_personal_risk_limit_version(text,numeric,numeric,numeric,numeric,integer,numeric,numeric,text,text);

alter table if exists public.outcome_position_events drop constraint if exists outcome_event_text_safe;
alter table if exists public.outcome_snapshot_provenance drop constraint if exists outcome_provenance_text_safe;
alter table if exists public.outcome_decision_snapshots drop constraint if exists outcome_snapshot_text_safe;
drop function if exists public.outcome_text_array_is_storage_safe(text[]);
drop function if exists public.outcome_text_is_storage_safe(text);

drop table if exists public.outcome_position_events;
drop table if exists public.outcome_positions;
drop table if exists public.outcome_snapshot_provenance;
drop table if exists public.outcome_decision_snapshots;
drop table if exists public.personal_risk_limit_versions;
