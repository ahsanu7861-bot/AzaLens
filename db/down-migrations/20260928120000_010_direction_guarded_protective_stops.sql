revoke all on function public.tighten_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.loosen_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
drop function public.tighten_outcome_protective_stop(uuid,uuid,numeric,text);
drop function public.loosen_outcome_protective_stop(uuid,uuid,numeric,text);

revoke all on function public.change_outcome_protective_stop(uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.change_outcome_protective_stop(uuid,uuid,numeric,text) to authenticated;
