# DEV1.2 — Account project source and profile contract

## Finding

The canonical DB column is `studio_projects.studio_mode`, with `free` and `match` values. `snapshot.source.mode` is the snapshot field, not a standalone DB column. The existing metadata trigger derives `studio_mode`, `match_id` and `match_week` from that snapshot. No migration or compatibility column is needed.

The current project service and Profile renderer already used `studio_mode`. The actual Profile failure was transport selection: canonical mode supplied `catalogue.dataClient` to account project APIs. The local PGlite query adapter discards the second `select()` argument and returns rows without `count`. Thus `select('id', {count:'exact', head:true})` produced an undefined count, and the summary correctly rejected it instead of falsely displaying zero.

Before this fix, both Free/Match Studio account saves and Profile/My Work reads used `.local/catalogue-d4` via `POST /__local/catalogue`. They did not write to the Supabase Local `public.studio_projects` inspected in Studio. Auth/Profile and catalogue projects were different stores, explaining zero rows in Supabase Local even when PGlite held projects.

## Final routing

`page-bootstrap.js` now passes the Auth client to `createStudioProjects` in all three mounts: Profile, My Work and Match Studio (which includes Free Studio). Canonical sports data and player overrides keep their existing catalogue transport. No fallback between project databases is added.

In DEV1 local development this means:

```text
Free/Match Studio → save/autosave controller → createStudioProjects
  → Supabase Local REST /rest/v1/studio_projects
Profile / My Work → same Auth client's studio_projects service
  → same local database, JWT and ownership RLS
Sports catalogue → /__local/catalogue → local PGlite
```

The actual local API reported by CLI/health is `http://127.0.0.1:54321`. Local server safeguards still reject hosted configuration. Production runtime configuration and production resources were not changed.

The exact create payload is `{id, user_id, title, snapshot_version:1, snapshot}`. `user_id` comes from the validated guard identity; the service normalizes the snapshot/title. Trigger-derived mode/context, revision and timestamps are not client-writable insert fields. Updates use owner/id/revision filters and the existing column grants.

## Profile queries and empty state

The query contract is preserved, not replaced:

- Two HEAD/count queries: `select('id', {count:'exact', head:true})`, filtered by `user_id` and `studio_mode='free'` or `'match'`.
- One metadata query using `PROJECT_COLUMNS`, owner filter, `updated_at DESC, id DESC`, and the existing four-item preview/lookahead. It never selects `snapshot`; there is no N+1.
- Valid zero counts and no recent rows show the normal empty state.
- Query failure or a missing count remains a project error, independently of profile editing.
- Labels remain Serbest Stüdyo / Maç çalışması. Onboarding and favorite-team UI are unchanged; no O3 work was added.

## Drafts versus account projects

Classic Studio/Comparison draft saves use user-scoped browser draft keys; these are not account project rows. Free/Match Studio also keeps a browser recovery copy while editing, using `taktik:studio:recovery:<userId>:...`. Neither recovery copies nor browser drafts count toward Profile.

Free/Match Studio's explicit Save invokes the project service. With autosave enabled, eligible edits also invoke that same service after the existing 2-second debounce; opening a match alone creates no project. A project appears in Profile/My Work after the server write succeeds and those views reload. Disabling autosave leaves edits local until an explicit Save. A recovery backup is not proof of a successful server write.

No old PGlite projects, browser drafts or hosted production projects are automatically copied into Supabase Local. Existing PGlite data is retained in place; switching the account source does not delete it. Old hosted accounts/projects are intentionally separate from local Auth users. If historical local PGlite projects need importing, that is a separate explicit migration task.

## Verification

- Routing test executes the page bootstrap and proves Profile, My Work, Free Studio and Match Studio receive the Auth project client, not the canonical transport.
- Service-level real SQL/RLS tests create free/match rows with the application payload, verify owner/title/mode, profile counts, recent ordering, rename and other-owner exclusion. Metadata responses exclude snapshots.
- Profile integration tests prove three lightweight queries on the Auth client with a failed catalogue transport, zero-state rendering and continued profile editing. Existing genuine-error/retry and draft-exclusion tests remain.
- Actual Docker Supabase Local Postgres verification used the existing named local test user's identity under `SET LOCAL ROLE authenticated`: INSERT two temporary projects, SELECT/count/metadata, UPDATE revision; another identity could not SELECT/UPDATE/DELETE them, and anon SELECT was denied. The transaction was rolled back and both temporary IDs were confirmed absent. This is a real local SQL/RLS check, not a fabricated browser/JWT login test. No user/profile was modified or created.
- `npm test`: **595 passed**, including **9 board regression groups**. `npm run build` and `git diff --check` passed. `dist/backend.js` was generated only by build.

## Remaining browser check

With the local server restarted, use the existing local account. In Free Studio select teams, name a test project and press Save. Verify the network write targets `http://127.0.0.1:54321/rest/v1/studio_projects`, then reload Profile and My Work and reopen/rename the project. Repeat with a match project if local match data is available. Check `studio_mode` and match context in Supabase Local Studio. Delete only the test projects created for this manual check. This browser sequence has not been executed by the agent; no credentials or new test account are required for the automated checks above.

No production access/mutation, schema change, migration application, commit, push or deploy was performed.
