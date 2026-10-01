begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = btrim(code) and length(code) between 1 and 30),
  name text not null check (name = btrim(name) and length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '' check (length(name) <= 100),
  role text not null default 'staff' check (role in ('admin', 'staff')),
  store_id uuid references public.stores(id) on delete restrict,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_staff_has_store check (not is_active or role = 'admin' or store_id is not null)
);
create index profiles_store_id_idx on public.profiles(store_id);

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

create trigger stores_updated_at before update on public.stores
for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

-- Authのメタデータは権限の根拠にしない。無効staffとして作成する。
create function private.sync_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles(id, email) values (new.id, coalesce(new.email, ''));
  else
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_auth_profile() from public;
create trigger portal_auth_user_created after insert on auth.users
for each row execute function private.sync_auth_profile();
create trigger portal_auth_email_updated after update of email on auth.users
for each row execute function private.sync_auth_profile();

-- 既存Authユーザーがいる場合も、権限を推測せず無効状態で登録する。
insert into public.profiles(id, email)
select id, coalesce(email, '') from auth.users;

-- 所有者の権限でprofilesを参照してRLSの自己再帰を避ける。
-- 非公開スキーマ、固定search_path、読み取りのみ、auth.uid()で呼出者を特定。
create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active
  );
$$;

create function private.can_access_store(target_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid()) and p.role = 'staff'
      and p.is_active and s.is_active and p.store_id = target_store_id
  );
$$;
revoke all on function private.is_admin() from public;
revoke all on function private.can_access_store(uuid) from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_access_store(uuid) to authenticated;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;

revoke all on public.stores, public.profiles from anon, authenticated;
grant select on public.stores, public.profiles to authenticated;
grant insert (code, name, is_active) on public.stores to authenticated;
grant update (code, name, is_active) on public.stores to authenticated;
grant update (name, role, store_id, is_active) on public.profiles to authenticated;

create policy stores_read on public.stores for select to authenticated
using (private.can_access_store(id));
create policy stores_admin_insert on public.stores for insert to authenticated
with check ((select private.is_admin()));
create policy stores_admin_update on public.stores for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

-- 無効ユーザーでも自分の状態だけ読める。業務表へのアクセス権は付与しない。
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;
