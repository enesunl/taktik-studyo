-- Local source preparation only; production application requires explicit approval.
-- Depends on the existing football schema and Supabase's auth.users/auth.uid().
-- No auth.users trigger: profile creation is an explicit authenticated client action.
begin;

create table public.profiles (
  -- Remove the dependent profile when its Auth account is deleted; avoid orphan data.
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_valid check (
    char_length(username) between 3 and 24
    and username collate "C" ~ '^[A-Za-z0-9_]+$'
  ),
  constraint profiles_display_name_valid check (
    display_name is null or (
      char_length(btrim(display_name)) between 1 and 60
      -- Reject ASCII control characters/DEL and Unicode C1 controls.
      and display_name collate "C" !~ '[[:cntrl:]]'
      and display_name !~ U&'[\0080-\009F]'
    )
  )
);

-- C collation makes ASCII case folding deterministic across database locales.
create unique index profiles_username_lower_key
  on public.profiles (lower(username collate "C"));

alter table public.profiles enable row level security;

-- Explicitly remove possible default grants, without changing project-wide defaults.
revoke all on public.profiles from public, anon, authenticated;
-- avatar_url is reserved for a later feature and is not exposed to browser clients.
grant select (id, username, display_name, created_at, updated_at)
  on public.profiles to authenticated;
grant insert (id, username, display_name) on public.profiles to authenticated;
grant update (username, display_name) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Reuse the existing SECURITY INVOKER trigger function with search_path = ''.
-- Its PUBLIC/anon/authenticated EXECUTE remains revoked; no new function or grant.
create trigger profiles_updated before update on public.profiles
  for each row execute function tactics_private.touch_updated_at();

commit;
