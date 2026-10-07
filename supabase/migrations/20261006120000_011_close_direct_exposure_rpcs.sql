-- Migration 011: close direct authenticated execution of the risk-enforced OPEN and INCREASE RPCs.
-- Only EXECUTE for authenticated is revoked on the two exact signatures below; no function body,
-- table, policy or other grant changes.
-- This migration is NOT permission-reversible: its down file deliberately restores nothing.
-- Restoring authenticated EXECUTE requires a separately reviewed forward migration.
-- Warning: re-running Migration 008 re-grants both functions to authenticated and reopens this exposure.

do $$
declare
  v_signature text;
  v_function oid;
  v_owner name;
  v_public_execute boolean;
begin
  foreach v_signature in array array[
    'public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text)',
    'public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric)'
  ] loop
    v_function:=null;
    v_owner:=null;
    select p.oid,pg_catalog.pg_get_userbyid(p.proowner)
      into v_function,v_owner
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.oid=pg_catalog.to_regprocedure(v_signature);

    if v_function is null then
      raise exception using errcode='55000',message=format('migration 011 refused: %s is missing',v_signature);
    end if;
    if v_owner<>'postgres' then
      raise exception using errcode='55000',message=format('migration 011 refused: %s owner differs',v_signature);
    end if;
    if not (select p.prosecdef and p.proconfig=array['search_path=""']::text[] from pg_catalog.pg_proc p where p.oid=v_function) then
      raise exception using errcode='55000',message=format('migration 011 refused: %s security contract differs',v_signature);
    end if;
    select exists(
      select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
       where a.grantee=0 and a.privilege_type='EXECUTE'
    ) into v_public_execute from pg_catalog.pg_proc p where p.oid=v_function;
    if v_public_execute
      or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE')
    then
      raise exception using errcode='55000',message=format('migration 011 refused: %s grant contract differs',v_signature);
    end if;
  end loop;
end $$;

revoke execute on function public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text) from authenticated;
revoke execute on function public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric) from authenticated;

do $$
declare
  v_signature text;
  v_function oid;
  v_owner oid;
begin
  foreach v_signature in array array[
    'public.create_risk_enforced_outcome_position(uuid,text,text,text,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,text,jsonb,boolean,timestamptz,numeric,numeric,numeric,numeric,numeric,text)',
    'public.increase_risk_enforced_position(uuid,uuid,timestamptz,numeric,numeric,numeric,numeric)'
  ] loop
    v_function:=pg_catalog.to_regprocedure(v_signature);
    select p.proowner into v_owner from pg_catalog.pg_proc p where p.oid=v_function;
    if v_function is null
      or exists(
        select 1 from pg_catalog.pg_proc p,pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
         where p.oid=v_function and a.privilege_type='EXECUTE' and a.grantee<>v_owner
      )
      or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE')
      or not pg_catalog.has_function_privilege('postgres',v_function,'EXECUTE')
    then
      raise exception using errcode='55000',message=format('migration 011 postcondition failed: %s is still directly executable or owner access differs',v_signature);
    end if;
  end loop;
end $$;
