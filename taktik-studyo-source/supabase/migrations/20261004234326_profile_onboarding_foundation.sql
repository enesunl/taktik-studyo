-- O1 LOCAL/TEST ONLY. Production application requires separate approval.
-- Depends on profiles_ownership and catalogue_identity_foundation.
begin;
alter table public.profiles
  add column favorite_team_slug text references public.catalogue_teams(id) on delete set null,
  add column onboarding_completed_at timestamptz,
  add column onboarding_version integer not null default 0,
  add constraint profiles_favorite_slug_format check (
    favorite_team_slug is null or favorite_team_slug ~ '^[a-z][a-z0-9-]{0,79}$'
  ),
  add constraint profiles_onboarding_state_valid check (
    (onboarding_version = 0 and onboarding_completed_at is null)
    or (onboarding_version = 1 and onboarding_completed_at is not null)
  );

-- ALTER holds an exclusive table lock until COMMIT: this is exactly the set
-- of existing profiles. New inserts after COMMIT still get NULL/0 defaults.
-- Preserve existing profile timestamps during this migration-only backfill.
alter table public.profiles disable trigger profiles_updated;
update public.profiles
  set onboarding_completed_at = transaction_timestamp(), onboarding_version = 1;
alter table public.profiles enable trigger profiles_updated;

grant select (favorite_team_slug, onboarding_completed_at, onboarding_version)
  on public.profiles to authenticated;
grant update (favorite_team_slug, onboarding_version) on public.profiles to authenticated;
-- No new INSERT grants: existing bootstrap inserts receive the defaults.
-- The completion timestamp is server-owned, not client-writable.
create function tactics_private.profile_onboarding_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.favorite_team_slug is distinct from old.favorite_team_slug
     and new.favorite_team_slug is not null then
    new.favorite_team_slug := lower(btrim(new.favorite_team_slug) collate "C");
    if not exists (select 1 from public.catalogue_teams
      where id = new.favorite_team_slug and catalogue_active) then
      raise exception 'Invalid favorite team' using errcode = '23514';
    end if;
  end if;
  if new.onboarding_version < old.onboarding_version or new.onboarding_version not in (0,1) then
    raise exception 'Invalid onboarding version' using errcode = '23514';
  end if;
  if new.onboarding_version = 1 and old.onboarding_version = 0 then
    new.onboarding_completed_at := transaction_timestamp();
  else
    new.onboarding_completed_at := old.onboarding_completed_at;
  end if;
  return new;
end $$;
revoke all on function tactics_private.profile_onboarding_write() from public, anon, authenticated;
create trigger profiles_onboarding_write before update of favorite_team_slug, onboarding_version
  on public.profiles for each row execute function tactics_private.profile_onboarding_write();
-- Existing own-row SELECT/INSERT/UPDATE RLS policies and all other grants stay intact.
commit;
