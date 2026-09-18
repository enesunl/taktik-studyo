# Phase 3: scoped draft primitives and lifecycle

Current public main/comparison page wiring is intentionally unchanged. Those
pages do not have protected routes or a deterministic authenticated bootstrap
yet. No Auth guard, login requirement or authenticated-to-legacy fallback was
added. The hooks below are opt-in for the later protected-page/guard phase.
Consequently this phase does not claim the current public editors already provide
per-account isolation. Do not enable login on those editors before wiring the hooks.

## Keys and payload

`userDraftKey(userId, slot)` in `src/lib/draft-scope.js` returns:

| Slot | Key |
| --- | --- |
| `main` | `taktik:draft:<USER_ID>:main:v2` |
| `left` | `taktik:draft:<USER_ID>:comparison:left:v2` |
| `right` | `taktik:draft:<USER_ID>:comparison:right:v2` |

Only canonical lowercase RFC UUIDs with a version and valid variant are accepted.
Invalid IDs/slots return null; there is no anonymous or legacy fallback.
Production callers must obtain the ID from Auth user.id, not DOM, URL or metadata.
Payload remains `{version:1,savedAt,state}` with existing validation and size limits.

`legacyDraftKeys` contains only the three existing main/comparison v1 keys.
`taktik:draft:shared:<UUID>:v1` stays on its existing code path for both signed-in
and signed-out visitors. It is neither imported nor enumerated by these helpers.

## Scope and explicit legacy import

`createUserDraftScope({userId,storage,isCurrent?})` returns null for invalid IDs.
Otherwise it returns an immutable scope with these methods:

- `context(slot)`: immutable per-slot context, or null when invalid/inactive.
- `inspectLegacy()`: only checks the three known legacy keys and this user's three
  destination keys; returns existence, validity and target-existence flags.
- `importLegacy(slot,{confirmed:true})`: explicit copy using existing validation.
  The flag must follow a future ownership confirmation in UI; never call on login.
- `isActive()` / `dispose()`: validate identity and permanently cancel this scope.

Import returns `imported` or `skipped_existing`. It never removes the source and
skips destinations found at either existence check, including malformed JSON.
The second check runs immediately before writing, after source validation and the
final identity check. This narrows the race window but is not atomic CAS: another
tab can still create a destination between the last check and the write.
Failures have controlled codes (`confirmation_required`, `invalid_slot`,
`invalid_source`, `storage_unavailable`, `write_failed`, `inactive_scope`). No UI or
automatic import is included. No other user's key is scanned.

## Writer and board lifecycle

`context.createWriter({getState,canSave,eventTarget})` captures one immutable key.
It provides `schedule()` (250 ms debounce), `flush()` (boolean), `cancel()` and
`dispose()`. It attaches one removable pagehide listener. Disposal cancels pending
work without flushing or deleting data. A generation check also rejects a callback
that was already queued when cancellation happened. Active gestures are skipped.

The hand-authored `dist/app.js` board factory accepts `{draftContext}` as an
alternative to `storageKey`. Scoped boards require a dedicated disposable element
root; the document root and combining both options are rejected. Invalid scoped
contexts never fall back to the legacy default. Use a fresh root for each account.

Scoped board `dispose()` cancels saving and active gestures, closes/restores an
expanded board, clears its toast timer, removes pagehide/root/resize listeners,
disconnects ResizeObserver and clears child DOM while retaining the mount root.
Removing a root created by mount is the mount cleanup's responsibility. Disposal
is marked before gesture cancellation, suppressing new renders/change notifications
and draft scheduling. Scope disposal triggers it
automatically. A disposed board's state/mutation API is unavailable. Existing
unscoped main/shared/comparison persistence remains unchanged.

## Future protected-page bootstrap

`bindAuthenticatedDrafts({auth,storage,mount})` in `src/lib/auth-drafts.js` is not
called by current pages. The future protected entry imports the existing `auth`
singleton and passes it here, then calls `start()`. No token/session is passed to
the scope: the binding only uses Auth's current UI identity snapshot.

`mount(scope)` must synchronously create fresh board roots using
`scope.context('main')` or separate `left`/`right` contexts and return a cleanup
function. That function removes any surrounding page controls/listeners/overlays
the page owns (including external comparison selectors). Do not reuse old roots.
Route authorization and page-owned sharing dialog cleanup belong to that future
entry, not to the draft writer. No sharing UI code is changed in this phase.

On account change/logout the binding disposes the old scope before unmounting and
mounting the new account. Notifications resample current Auth state rather than
using queued stale snapshots. Each read/save independently checks current identity,
so even before the deferred Auth subscriber runs, an old writer cannot persist.
Only `signed_in` with a valid ID mounts a scope; recovery/idle/signed-out do not.
Binding `dispose()` unsubscribes from Auth and tears down its scope and mount.

Logout keeps user, legacy and public shared drafts. This is UI/storage namespace
isolation, not encryption or database authorization; same-origin scripts and browser
developer tools can still read localStorage. Auth/RLS remain the security boundary.

## Verification

`npm test` covers keys, explicit imports, storage failures, debounce/pagehide races,
Auth binding and logout, plus real board lifecycle and public shared v1 regression.
No migration, production request or persistent test database is needed. Browser
build verification uses `npm run build`; backend.js is never edited by hand.
