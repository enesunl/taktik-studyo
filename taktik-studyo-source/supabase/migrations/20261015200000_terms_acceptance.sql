-- SEC2.3 Terms acceptance record on profiles. PROPOSAL FOR REVIEW: production only with explicit approval.
-- Apply together with (after) 20261015190000_account_limits and BEFORE deploying the matching frontend:
-- the e-mail profile bootstrap and Google onboarding send terms_version when they create the profile.
--
-- terms_version: the Terms version the user accepted (client-provided, format-checked).
-- terms_accepted_at: server-owned, set by the trigger when a version is recorded; never client-writable.
-- Existing profiles are NOT backfilled: their acceptance was never recorded, so both stay NULL.
-- A profile created by a signed-in user must carry a version; that is what makes the profile requirement
-- in account_limits an acceptance gate for new accounts. Server-side (service role) inserts are unaffected.
begin;
alter table public.profiles
  add column terms_version text,
  add column terms_accepted_at timestamptz,
  add constraint profiles_terms_valid check (
    (terms_version is null and terms_accepted_at is null)
    or (terms_version collate "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and terms_accepted_at is not null)
  );

grant select (terms_version, terms_accepted_at) on public.profiles to authenticated;
grant insert (terms_version) on public.profiles to authenticated;
grant update (terms_version) on public.profiles to authenticated;

create function tactics_private.profile_terms_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.terms_version is distinct from old.terms_version then
    -- A recorded acceptance cannot be withdrawn by editing the profile; a new profile needs one.
    if new.terms_version is null and (tg_op = 'UPDATE' or auth.uid() is not null) then
      raise exception 'terms_required' using errcode = 'P0001';
    end if;
    -- Only the current Terms can be recorded (same value as TERMS_VERSION in src/lib/auth-validation.js).
    -- A Terms update replaces this function in a new migration; already recorded rows are not re-checked.
    if new.terms_version is not null and new.terms_version <> '2026-10-15' then
      raise exception 'terms_outdated' using errcode = 'P0001';
    end if;
    new.terms_accepted_at := case when new.terms_version is null then null else transaction_timestamp() end;
  else
    new.terms_accepted_at := old.terms_accepted_at;
  end if;
  return new;
end $$;
revoke all on function tactics_private.profile_terms_write() from public, anon, authenticated;
create trigger profiles_terms_write before insert or update on public.profiles
  for each row execute function tactics_private.profile_terms_write();
commit;
