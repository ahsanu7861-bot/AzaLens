-- Durable, multi-instance Twelve Data Basic credit accounting.
create table public.twelve_data_credit_ledger (
  plan_id text primary key check (plan_id = 'basic_internal'),
  minute_key timestamptz not null,
  day_key date not null,
  minute_credits integer not null check (minute_credits between 0 and 8),
  day_credits integer not null check (day_credits between 0 and 800),
  updated_at timestamptz not null default now()
);

alter table public.twelve_data_credit_ledger enable row level security;
alter table public.twelve_data_credit_ledger force row level security;
revoke all on public.twelve_data_credit_ledger from public, anon, authenticated, service_role;

create or replace function public.reserve_twelve_data_credits(
  p_plan_id text,
  p_credits integer
)
returns table (
  accepted boolean,
  reason text,
  reserved_at timestamptz,
  minute_key timestamptz,
  day_key date,
  minute_credits integer,
  day_credits integer,
  retry_after_ms integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.twelve_data_credit_ledger%rowtype;
  v_now timestamptz := clock_timestamp();
  v_minute_key timestamptz := date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';
  v_day_key date := (v_now at time zone 'UTC')::date;
  v_minute_credits integer;
  v_day_credits integer;
begin
  if p_plan_id <> 'basic_internal' or p_credits is null or p_credits < 1 or p_credits > 8 then
    raise exception using errcode = '22023', message = 'invalid credit reservation';
  end if;

  insert into public.twelve_data_credit_ledger
    (plan_id, minute_key, day_key, minute_credits, day_credits)
  values (p_plan_id, v_minute_key, v_day_key, 0, 0)
  on conflict (plan_id) do nothing;

  select * into strict v_row
    from public.twelve_data_credit_ledger
   where plan_id = p_plan_id
   for update;

  v_minute_credits := case when v_row.minute_key = v_minute_key then v_row.minute_credits else 0 end;
  v_day_credits := case when v_row.day_key = v_day_key then v_row.day_credits else 0 end;

  if v_day_credits + p_credits > 800 then
    return query select false, 'daily_limit_exhausted'::text, v_now, v_minute_key,
      v_day_key, v_minute_credits, v_day_credits, null::integer;
    return;
  end if;

  if v_minute_credits + p_credits > 8 then
    return query select false, 'minute_limit_exhausted'::text, v_now, v_minute_key,
      v_day_key, v_minute_credits, v_day_credits,
      greatest(0, floor(extract(epoch from ((v_minute_key + interval '1 minute') - v_now)) * 1000)::integer);
    return;
  end if;

  update public.twelve_data_credit_ledger
     set minute_key = v_minute_key,
         day_key = v_day_key,
         minute_credits = v_minute_credits + p_credits,
         day_credits = v_day_credits + p_credits,
         updated_at = v_now
   where plan_id = p_plan_id;

  return query select true, null::text, v_now, v_minute_key, v_day_key,
    v_minute_credits + p_credits, v_day_credits + p_credits, null::integer;
end;
$$;

revoke all on function public.reserve_twelve_data_credits(text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_twelve_data_credits(text, integer)
  to service_role;
