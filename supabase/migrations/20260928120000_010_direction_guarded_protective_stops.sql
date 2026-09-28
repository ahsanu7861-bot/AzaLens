-- Migration 010: expose direction-specific protective-stop entry points.
-- Migration 008 remains the sole stop-change mutation and decision authority.

do $$
declare
  v_function oid;
  v_owner name;
  v_public_execute boolean;
begin
  select p.oid,pg_catalog.pg_get_userbyid(p.proowner)
    into v_function,v_owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.oid=pg_catalog.to_regprocedure('public.change_outcome_protective_stop(uuid,uuid,numeric,text)');

  if v_function is null then
    raise exception using errcode='55000',message='migration 010 refused: generic stop RPC signature is missing';
  end if;
  if v_owner<>'postgres' then
    raise exception using errcode='55000',message='migration 010 refused: generic stop RPC owner differs';
  end if;
  if not (select p.prosecdef and p.proconfig=array['search_path=""']::text[] from pg_catalog.pg_proc p where p.oid=v_function) then
    raise exception using errcode='55000',message='migration 010 refused: generic stop RPC security contract differs';
  end if;
  select exists(
    select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
     where a.grantee=0 and a.privilege_type='EXECUTE'
  ) into v_public_execute from pg_catalog.pg_proc p where p.oid=v_function;
  if v_public_execute
    or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE')
    or not pg_catalog.has_function_privilege(v_owner,v_function,'EXECUTE')
  then
    raise exception using errcode='55000',message='migration 010 refused: generic stop RPC grant contract differs';
  end if;
end $$;

create function public.tighten_outcome_protective_stop(
  p_position_id uuid,p_idempotency_key uuid,p_new_stop numeric,p_evidence_class text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_state public.outcome_position_risk_state%rowtype;
  v_result jsonb;
  v_stop public.outcome_protective_stop_changes%rowtype;
  v_key_exists boolean;
begin
  if v_user is null then raise exception using errcode='42501',message='authentication required'; end if;
  if p_position_id is null or p_idempotency_key is null or p_new_stop is null then
    raise exception using errcode='22023',message='invalid protective stop tightening';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  select exists(select 1 from public.personal_risk_evaluations where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_protective_stop_changes where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_position_events where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_position_increases where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_positions where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.broker_cost_schedule_versions where user_id=v_user and client_idempotency_key=p_idempotency_key)
    into v_key_exists;

  if not v_key_exists then
    select * into v_state from public.outcome_position_risk_state
     where position_id=p_position_id and user_id=v_user for update;
    if not found then raise exception using errcode='42501',message='position unavailable'; end if;
    if v_state.remaining_quantity<=0 then raise exception using errcode='22023',message='position already closed'; end if;
    if p_new_stop<=v_state.protective_stop_price then
      raise exception using errcode='22023',message='requested stop is not tightening';
    end if;
  end if;

  v_result:=public.change_outcome_protective_stop(p_position_id,p_idempotency_key,p_new_stop,p_evidence_class);
  select * into v_stop from public.outcome_protective_stop_changes
   where id=(v_result->>'stop_change_id')::bigint and position_id=p_position_id and user_id=v_user;
  if not found or v_stop.direction<>'TIGHTENING' then
    raise exception using errcode='23505',message='idempotency key belongs to a non-tightening stop request';
  end if;
  return v_result;
end $$;

create function public.loosen_outcome_protective_stop(
  p_position_id uuid,p_idempotency_key uuid,p_new_stop numeric,p_evidence_class text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_state public.outcome_position_risk_state%rowtype;
  v_result jsonb;
  v_stop public.outcome_protective_stop_changes%rowtype;
  v_evaluation public.personal_risk_evaluations%rowtype;
  v_key_exists boolean;
begin
  if v_user is null then raise exception using errcode='42501',message='authentication required'; end if;
  if p_position_id is null or p_idempotency_key is null or p_new_stop is null then
    raise exception using errcode='22023',message='invalid protective stop loosening';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  select exists(select 1 from public.personal_risk_evaluations where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_protective_stop_changes where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_position_events where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_position_increases where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.outcome_positions where user_id=v_user and client_idempotency_key=p_idempotency_key)
      or exists(select 1 from public.broker_cost_schedule_versions where user_id=v_user and client_idempotency_key=p_idempotency_key)
    into v_key_exists;

  if not v_key_exists then
    select * into v_state from public.outcome_position_risk_state
     where position_id=p_position_id and user_id=v_user for update;
    if not found then raise exception using errcode='42501',message='position unavailable'; end if;
    if v_state.remaining_quantity<=0 then raise exception using errcode='22023',message='position already closed'; end if;
    if p_new_stop>=v_state.protective_stop_price then
      raise exception using errcode='22023',message='requested stop is not loosening';
    end if;
  end if;

  v_result:=public.change_outcome_protective_stop(p_position_id,p_idempotency_key,p_new_stop,p_evidence_class);
  if coalesce((v_result->>'accepted')::boolean,false) then
    select * into v_stop from public.outcome_protective_stop_changes
     where id=(v_result->>'stop_change_id')::bigint and position_id=p_position_id and user_id=v_user;
    if not found or v_stop.direction<>'LOOSENING' then
      raise exception using errcode='23505',message='idempotency key belongs to a non-loosening stop request';
    end if;
  else
    select * into v_evaluation from public.personal_risk_evaluations
     where id=(v_result->>'evaluation_id')::uuid and user_id=v_user;
    if not found or v_evaluation.action_type<>'LOOSEN_STOP' then
      raise exception using errcode='23505',message='idempotency key belongs to a non-loosening stop request';
    end if;
  end if;
  return v_result;
end $$;

revoke all on function public.tighten_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.loosen_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.change_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.tighten_outcome_protective_stop(uuid,uuid,numeric,text) to authenticated;
