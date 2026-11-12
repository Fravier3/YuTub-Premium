create table public.yutu_user_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile jsonb not null default '{"name":"Mi perfil","avatar":"puppy","custom":""}'::jsonb,
 history jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 constraint yutu_profile_object check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 360000),
 constraint yutu_history_array check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 100 and octet_length(history::text) <= 150000)
);
alter table public.yutu_user_state enable row level security;
revoke all on public.yutu_user_state from anon;
grant select, insert, update, delete on public.yutu_user_state to authenticated;
create policy yutu_read_own on public.yutu_user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy yutu_insert_own on public.yutu_user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy yutu_update_own on public.yutu_user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy yutu_delete_own on public.yutu_user_state for delete to authenticated using ((select auth.uid()) = user_id);

-- 1.0.30: suscripciones sincronizadas entre dispositivos. Cada entrada es
-- { id, name, thumbnail, at, removed }; `removed` marca una baja para que se propague.
alter table public.yutu_user_state
  add column if not exists subscriptions jsonb not null default '[]'::jsonb;
alter table public.yutu_user_state
  add constraint yutu_subscriptions_array check (
    jsonb_typeof(subscriptions) = 'array'
    and jsonb_array_length(subscriptions) <= 3000
    and octet_length(subscriptions::text) <= 900000
  );
