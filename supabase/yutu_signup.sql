create schema if not exists yutu_private;
revoke all on schema yutu_private from public, anon, authenticated;
grant usage on schema yutu_private to service_role;
create table yutu_private.signup_limits (
 bucket text primary key,
 window_start timestamptz not null,
 attempts integer not null check (attempts >= 0)
);
alter table yutu_private.signup_limits enable row level security;
grant select, insert, update, delete on yutu_private.signup_limits to service_role;
create function public.yutu_reserve_signup(p_network text, p_email text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare k text; n integer; max_attempts integer; hour_start timestamptz := date_trunc('hour', now());
begin
 if p_network !~ '^[a-f0-9]{64}$' or p_email !~ '^[a-f0-9]{64}$' or p_network is null or p_email is null then return false; end if;
 foreach k in array array['e:' || p_email, 'i:' || p_network] loop
  max_attempts := case when left(k,2) = 'e:' then 3 else 10 end;
  insert into yutu_private.signup_limits as limits(bucket,window_start,attempts)
   values (k,hour_start,1)
   on conflict (bucket) do update
   set window_start=excluded.window_start,
       attempts=case when limits.window_start=hour_start then limits.attempts+1 else 1 end
   where limits.window_start<>hour_start or limits.attempts<max_attempts
   returning attempts into n;
  if not found then return false; end if;
 end loop;
 delete from yutu_private.signup_limits where window_start < now() - interval '2 days';
 return true;
end; $$;
revoke all on function public.yutu_reserve_signup(text,text) from public, anon, authenticated;
grant execute on function public.yutu_reserve_signup(text,text) to service_role;
