# SEC2 / SEC2.1 — Abuse protection review and account quota design (15 Oct 2026, local only)

Nothing here is deployed. The database part is a **proposal**; no migration file was created.

## Current protections (verified)

| Surface | Server-side protection today |
| --- | --- |
| Registration / login / reset / verification | Supabase Auth: confirmed email required, minimum password 12, Auth rate limits (local: CLI defaults; hosted: dashboard values not visible here). No Auth CAPTCHA (deliberate). Client forms block repeat submits while a request runs. |
| Share links (`lineups`) | Login required (JWT verified server-side); confirmed email; Turnstile (action and hostname checked); body ≤ `SHARE_BYTES`, streamed; strict snapshot validator (DB); DB quotas per hashed IP: 5 / 10 min; global: 100 / 10 min and 1,000 / day; advisory lock. |
| Studio projects | RLS owner-only; snapshot ≤ 4 MB, ≤ 22 players, ≤ 200 drawings; client save queue (no parallel saves). **No per-user row limit.** |
| Weekly XI | RLS owner-only; snapshot validator (11 slots, UUID players, ≤ 50 KB). **No per-user row limit.** |
| Player overrides | RLS owner-only; key, name, number and role checks. **No per-user row limit.** |
| Matches API | Gateway JWT + `getUser` + confirmed email; per-isolate caches, provider back-off, 32 concurrent resolutions. **New (SEC2):** details only for fixtures of the loaded season. |
| Account deletion | Gateway JWT + `getUser`; body ≤ 2 KB, fixed fields; typed phrase; password re-check (Auth rate limited); deletion via Auth admin. |

## Implemented in SEC2 (no migration)

- **Match-id enumeration closed.** Before SEC2, any well-formed id cost at least one BSD request, so a signed-in user could burn the shared provider quota (7,500/day on the free plan) and take Maçlar down for everyone. Now:
  - a detail is fetched only if its id is in the last successfully loaded season list; any other id → `404 MATCH_NOT_FOUND` with **no provider call**;
  - no season loaded yet → `503` (no detail call);
  - lost provider access clears the list (licence purge);
  - during a temporary outage the last list still counts, so retained details stay available.

  Tests: `tests/matches-abuse.test.mjs`; existing matches tests now declare their season.

## SEC2.2 — MVP limits (implemented locally; migration NOT applied, awaiting approval)

Migration file: `supabase/migrations/20261015190000_account_limits.sql`. It follows the SEC2.1 design below,
with the approved values:

| Per account | Limit |
| --- | --- |
| Studio projects | 10 |
| Weekly XI saves | 40 |
| Player overrides | 500 |
| New share links | 10 per UTC day |
| Writes | 400 per 10 minutes |
| Write volume | 50 MB per 10 minutes |

There is no separate storage quota. Existing rows above a cap are kept; the caps apply to new rows only.

**Verified:**
- PGlite (`tests/account-limits-database.test.mjs`):
  - each cap is exact; bulk inserts are counted per row;
  - retries with the same id, and the override insert-then-update path, still reach the unique constraint;
  - another account's counters are never touched; the service role is not limited;
  - RLS and grants are unchanged.
- Real Postgres 17 in a throwaway Supabase-image container, removed afterwards: 8 parallel inserts at each cap → exactly 1 succeeds; 8 parallel updates at 395/400 writes → exactly 5 succeed.

**Client behaviour:**
- `quota_exceeded` and `rate_limited` show Turkish messages.
- Studio autosave keeps the local recovery copy.
- Weekly XI keeps the lineup open and saves it locally if the slot is free.
- The override form keeps its values.
- Usage is shown in Çalışmalarım and Profile (projects /10) and in İlk 11’lerim (records /40).

**Auth CAPTCHA:**
- Turnstile tokens go through Supabase's `captchaToken` for login, sign-up and reset, and through `account-delete` for its password check.
- This is active only when `AUTH_TURNSTILE_SITE_KEY` is set. Hosted CAPTCHA stays off until this build is deployed; see `AUTH_FOUNDATION.md`.

## SEC2.3 — Security review (local; migrations applied to Supabase Local only)

**Google deletion reauthentication**

The server decides from `app_metadata.providers` (server-set):
- **Password path** (any account with an `email` identity, or missing/unknown provider data): the password is checked by Auth. This fails closed for an account without a password.
- **Google-only path:** needs the *same* verified token to carry an `amr` entry `oauth` from the last 10 minutes.

Confirmed on local Auth:
- `amr` timestamps are per session and survive a token refresh.
- A newer login on another device does not change them.
- A signed-out (revoked) session token gets 401.

No flaw was found; tests were added for malformed or missing `amr`, other sign-in methods and missing metadata.

**Profile gate** (fix): any write to projects, Weekly XI or overrides, and any new share link, requires the account's profile (`profile_required`).
- New profiles always carry a recorded Terms acceptance.
- So an account that never finished registration or onboarding (e.g. a first Google sign-in) cannot store data via the API.
- Existing profiles keep working.

**Terms acceptance** (`20261015200000_terms_acceptance.sql`):
- `profiles.terms_version` is client-provided and format-checked.
- `profiles.terms_accepted_at` is set by a trigger with `transaction_timestamp()` and has no client grant.
- Every user-created profile must carry a version; it cannot be withdrawn; existing profiles are not backfilled.
- E-mail registration sends the version in signup metadata after the required checkbox; the profile bootstrap records it.
- Google and older registrations accept in onboarding.

**CAPTCHA paths** (Supabase Auth source):
- Hosted CAPTCHA protects sign-up, the password grant and recovery.
- The OAuth code exchange (`pkce`), refresh and `id_token` grants are exempt, so Google sign-in is protected by Google plus the Auth rate limits, and then by the profile/Terms gate and account limits.

**Local results:** 28/28 real-stack API checks and 9/9 browser end-to-end checks.

## SEC2.1 — Account quota design (superseded by the SEC2.2 values above)

### Proposed limits

| Limit (per account) | Proposed | Normal use found | Why this value |
| --- | --- | --- | --- |
| Studio projects | **100** | Local max 6 per user; production 2 in total | Each can hold up to 4 MB, so 100 is a storage bound of about 400 MB. |
| Weekly XI saves | **200** | Local max 2 per user | About 6 seasons of 34 weeks. |
| Player overrides | **500** | Local max 1 per user; production 2 | Must not exceed 500, because the client reads at most 500 (`player-overrides.js`, `.limit(500)`). The BSD league has about 800 players. |
| New share links | **30 per day** | Local 0 | Added to the existing limits: 5 per 10 min per IP; 100 per 10 min and 1,000 per day globally. One account can then use at most 3% of the global daily budget. |
| Writes (insert + update) | **300 and 50 MB per 10 min**, across the three tables | Autosave waits 2 s after the last edit and runs one save at a time. That is at most about 250 per 10 min even with nonstop editing. Snapshots measured ≤ 15 KB. | Stops excessive repeated updates. Without it, one account can rewrite a 4 MB snapshot in a loop with no limit. |

Optional, separate decision: lower the Studio snapshot limit from 4 MB to 1 MB. The largest measured snapshot is 15 KB; one with 200 drawings is estimated at about 150 KB.

### SQL approach (draft)

```sql
-- PROPOSAL (SEC2.1) — not a migration file. Apply locally first; hosted only with approval.
begin;
create table tactics_private.write_budget (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  writes integer not null default 0,
  bytes bigint not null default 0,
  primary key (user_id, window_start)
);
revoke all on tactics_private.write_budget from public, anon, authenticated;

create function tactics_private.enforce_account_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cap integer := tg_argv[0]::integer;
  win timestamptz := date_bin('10 minutes', clock_timestamp(), '2026-01-01'::timestamptz);
  size bigint := 0; used_writes integer; used_bytes bigint; owned integer;
begin
  -- Server code (service role) has no auth.uid(). A row for another user is rejected by RLS
  -- right after BEFORE triggers, so it must not touch (or reveal) that user's counters.
  if me is null or new.user_id is distinct from me then return new; end if;
  if tg_table_name <> 'player_overrides' then size := pg_column_size(new.snapshot); end if;

  insert into tactics_private.write_budget as b (user_id, window_start, writes, bytes)
  values (me, win, 1, size)
  on conflict (user_id, window_start) do update set writes = b.writes + 1, bytes = b.bytes + excluded.bytes
  returning writes, bytes into used_writes, used_bytes;
  if used_writes = 1 then delete from tactics_private.write_budget where user_id = me and window_start < win - interval '1 day'; end if;
  if used_writes > 300 or used_bytes > 52428800 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('quota:' || tg_table_name || ':' || me::text, 0));
    -- An existing key/id is left to the unique constraint: player overrides are saved
    -- insert-then-update (23505), and project/Weekly XI inserts are retried with the same id.
    if tg_table_name = 'player_overrides' then
      if exists (select 1 from public.player_overrides where user_id = me and player_key = new.player_key) then return new; end if;
      select count(*) into owned from public.player_overrides where user_id = me;
    elsif tg_table_name = 'studio_projects' then
      if exists (select 1 from public.studio_projects where id = new.id) then return new; end if;
      select count(*) into owned from public.studio_projects where user_id = me;
    else
      if exists (select 1 from public.weekly_lineups where id = new.id) then return new; end if;
      select count(*) into owned from public.weekly_lineups where user_id = me;
    end if;
    if owned >= cap then raise exception 'quota_exceeded' using errcode = 'P0001', hint = tg_table_name; end if;
  end if;
  return new;
end $$;
revoke all on function tactics_private.enforce_account_limits() from public, anon, authenticated;

create trigger studio_projects_limits before insert or update on public.studio_projects
  for each row execute function tactics_private.enforce_account_limits('100');
create trigger weekly_lineups_limits before insert or update on public.weekly_lineups
  for each row execute function tactics_private.enforce_account_limits('200');
create trigger player_overrides_limits before insert or update on public.player_overrides
  for each row execute function tactics_private.enforce_account_limits('500');

-- create_shared_lineup (create or replace, same signature, still service_role only): add an owner
-- bucket to both loops. It is hashed like the IP bucket, so no account id is kept in share_limits:
--   ('owner:' || encode(sha256(convert_to(owner::text,'UTF8')),'hex'), day_window, 30)
commit;
```

### Review

- **Server-side only.** The limits are enforced by database triggers and the existing share function; the client cannot bypass them. They do not depend on Edge Function memory.
- **Concurrency:**
  - *Row caps:* a per-user, per-table transaction lock serializes one account's inserts. A second parallel insert waits, then counts the committed row, so the cap is exact.
  - *Visibility:* each counting query sees the latest committed data (PostgREST default isolation, READ COMMITTED), and rows inserted earlier in the same statement (bulk insert).
  - *Write budget:* a single atomic upsert per write.
  - *Shares:* they already run under one global lock.
- **RLS and grants unchanged.**
  - No new grants or RPC.
  - The definer function only touches the caller's own rows and a private table that only the database owner (postgres) can use.
  - It returns early for rows RLS will reject.
  - Account deletion removes budget rows through the foreign key.
- **Performance:**
  - Per write: one primary-key upsert.
  - Per insert, additionally: one indexed count over at most 100/200/500 rows, using the existing `(user_id, …)` indexes and primary key.
  - Updates do not count rows.
  - Locks are per user only.
- **Rejected writes are not counted.** The error rolls back the increment, so a blocked client cannot extend its own block.
- **Client after approval:**
  - Map `P0001` + `quota_exceeded` to: "Kayıt sınırına ulaştın. Eski kayıtlarından bazılarını silip tekrar dene."
  - Map `rate_limited` to: "Çok sık kaydediyorsun. Birkaç dakika sonra tekrar dene."
  - Autosave already stops on an error instead of retrying in a loop.
  - Share limits already return 429 "Paylaşım sınırına ulaşıldı.". Its `Retry-After: 600` is imprecise for the daily limit; that is optional to refine.
- **Tests with the implementation:**
  - PGlite: caps, existing-key passthrough, another user's id, service role, budget rollover, share owner bucket.
  - Supabase Local: two parallel connections inserting at the cap.
  - The existing save and share suites must stay green.

## Hosted settings to set (dashboard, operator)

| Setting | Recommendation |
| --- | --- |
| Auth › Rate limits | Keep the defaults or tighten: sign-in/sign-up 30 per 5 min per IP; token verifications 30 per 5 min; email sending ≤ 30/h (Resend); token refresh 150 per 5 min. |
| Auth › Attack protection | Enable leaked-password protection if the plan allows (advisor WARN). Auth CAPTCHA stays **off** unless sign-up abuse is observed. |
| BSD plan | Unlimited ($5/month) removes the daily quota. Even with the id gate, a cold isolate can spend up to about 4 requests per scheduled match. |

## Remaining gaps

1. **Account limits** are enforced only after the SEC2.2 migration is approved and applied.
2. **Matches load across isolates.** Without a shared cache (`PROD1_RELEASE_PLAN.md` option A), a user opening every fixture on many cold isolates still costs provider requests. Bounded by the id gate; fully addressed by the Unlimited plan or a DB cache.
3. **Account-deletion password checks** go through Auth from the function's egress IP. Many wrong-password attempts by one signed-in user could hit the Auth rate limit for everyone deleting at that moment; low impact, and Auth limits apply.
4. In-memory limits are per isolate and are **not** used as guarantees anywhere.
