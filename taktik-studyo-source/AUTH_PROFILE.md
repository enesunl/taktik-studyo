# Phase 7: own profile UI

`/profil.html` edits only `username` and `display_name`. The optional read-only
email comes from the protected guard's successful server `validateUser()` result,
not a restored local Auth snapshot. No avatar, email/password editing, account
deletion, public profiles or profile search is included.

## Source schema and authorization

The source of truth is `supabase/migrations/20260918142348_profiles_ownership.sql`.
`supabase/schema/football.sql` describes the earlier football schema and provides
the existing timestamp trigger; it is not a consolidated profiles schema.

`public.profiles` has `id uuid` (primary key referencing `auth.users.id` with
delete cascade), required `username text`, nullable `display_name text`, reserved
nullable `avatar_url text`, and required `created_at`/`updated_at timestamptz`
defaulting to `now()`. The existing invoker trigger manages `updated_at`.

RLS grants authenticated users SELECT, INSERT and UPDATE only on their own row
(`auth.uid() = id`). Column grants are narrower than table grants:

- SELECT: `id,username,display_name,created_at,updated_at`.
- INSERT: `id,username,display_name`.
- UPDATE: `username,display_name`.
- No anon access, avatar column access or client DELETE permission/policy.

The API reuses `profileColumns` from `profile-bootstrap.js`; it never selects `*`.
RLS and column grants remain the server authorization boundary. A frontend guard
does not replace them. Local PGlite tests exercise the actual migration, including
foreign-row/anon denial and protected-column restrictions. No hosted DB is used.

Production depends on the approved Phase 1 migrations being applied separately.
This phase neither checks nor changes the hosted schema, migrations or settings.
If the table/grants are unavailable, the UI displays a controlled generic error.

## Load, create and save

The existing guard still initializes Auth, requires `signed_in`, calls server
`validateUser()`, and verifies the same identity before mounting. The minimal
mount extension supplies a frozen `{id,email}`. Profile opts out of draft scope
creation and never reads localStorage, imports legacy drafts or loads catalogue.
Studio and comparison retain the default draft behavior.

`createProfileApi({client,validatedUser,current})` stays module-private; no client,
Auth session or profile API is added to `window`. Each instance captures its
validated id. `load()` selects explicit columns with `.eq('id', id).maybeSingle()`.
Any returned foreign id is rejected. Only controlled results reach the UI.

For a missing row, load reuses `createProfileBootstrap`: server `getUser`, own
SELECT, then a validated signup metadata username as initial INSERT seed. A
successful bootstrap is followed by a fresh own SELECT. Incomplete metadata or
username conflict leaves the missing profile editable; the user can choose a new
username and explicitly save. Network/DB failures offer a load retry.

`save({username,display_name})` performs own SELECT, then UPDATE if present or
INSERT if absent. UPDATE sends only the two editable fields and fixes the id
filter to the captured validated identity; INSERT adds only that own id. Both
return explicit columns and validate the response identity. Empty write results
are failures, never false success. The UI applies canonical returned values.

There is no upsert. INSERT `23505` triggers another own SELECT; if a concurrent
bootstrap created that row, a controlled UPDATE applies the requested changes.
If it remains absent, `username_conflict` is returned. UPDATE `23505` also maps to
`username_conflict`. No username availability or foreign-profile query is made.
No raw SDK response, SQL error message, details or hint is exposed to the UI.

`public.profiles.username` is canonical. `user_metadata.username` is only the
existing initial seed and can remain stale after editing. Profile saves never
call `auth.updateUser()` and metadata is not an authorization source.

## Validation and interaction

Username is trimmed, then checked with the existing `usernameValid()`: 3–24 ASCII
letters, digits or underscore. SQL's unique `lower(username collate "C")` index
decides case-insensitive conflicts; the client does not predict availability.

Display name is trimmed; empty becomes `null`. Nonempty values have at most 60
Unicode code points, matching PostgreSQL `char_length` rather than UTF-16 code
units. ASCII controls/DEL and C1 controls are rejected in both raw inputs, in
line with the database display-name restriction. Unicode visible names work.

The form stays hidden/inert until guard validation and profile load finish. It
uses labels, help text, keyboard submission, visible focus and an aria-live
status. Pending save disables interaction and blocks duplicate submissions.
Database failures and username conflicts use fixed Turkish messages. Untrusted
profile fields and validated email are assigned only via `.value`/`textContent`.

## Account changes and pending requests

The API checks the mount generation/current identity before requests and after
responses, including bootstrap and insert-race recovery. Guard invalidation
hides the page and disposes/clears the old form immediately on logout or account
change. A's delayed load/save result cannot render into B's form. B must pass
its own server validation before its own profile loads.

No profile cache is written. Disposing does not cancel or roll back a request
already received by the server: it discards stale results and prevents subsequent
requests from the old lifecycle. Captured own-id filters plus server JWT/RLS
prevent a delayed A operation from updating B's profile.

## Verification

`tests/profile-api.test.mjs` covers normalization, own-row queries, controlled
errors, bootstrap/incomplete profiles, exact write payloads, 23505 races and
identity changes. A real installed Supabase SDK test uses an entirely mocked
fetch transport to verify the HTTP SELECT/UPDATE/INSERT contract.
`tests/profile-ui.test.mjs` covers form/lifecycle behavior and actual page-bootstrap
integration. `tests/profiles-database.test.mjs` retains the local SQL/RLS checks.

Run `npm test` (including board regression) and `npm run build`. Only the build
generates `dist/backend.js`; `dist/profil.html` and `dist/routes.css` are maintained
source. No production profile test, hosted query, deploy or commit is required.

SDK reference: [UPDATE and returning selected columns](https://supabase.com/docs/reference/javascript/update).
