# TB1 — Tactical Tools and substitutions

## Architecture and scope

Only the classic Taktik Tahtası (`/studyo` and `/studyo.html`) enables `tacticalWorkspace`. The existing `dist/app.js` is hand-maintained source, unlike generated `dist/backend.js`. Comparison, Free/Match Studio and public read-only sharing retain their existing modes.

The classic board owns eleven formation slots in `state.players`: slot `id`, `x`, `y`, tactical `role`, and athlete identity/name/number. Bench is derived from the selected team's full canonical roster minus the athletes currently occupying those slots. The full roster is not deleted when its permanent UI is hidden.

The classic board already stores normalized canvas strokes in `state.drawings` with `tool: pen | eraser`, hex `color`, numeric `width`, and normalized points. Match/Free Studio use the separate existing object drawing model in `tactical-drawings.js` / `tactical-drawing-ui.js` (arrows, zones, etc.). TB1 reuses the classic engine and exposes **move/select, pen, eraser, color, existing board undo, and clear drawings**. Clear is a normal undoable state edit. No new drawing types, redo stack, adjustable width or persistence schema were introduced.

## UI

The right column contains a compact permanent Tactical Tools panel, followed by the existing contextual player editor. Existing drawing controls and undo button move into that panel; no duplicate engine or listeners are created. Expanded Studio relocates the same tools panel instead of the bench.

Every starter has a sibling native “Değiştir” button (no nested buttons), exposed by player hover, keyboard focus, or selection. Touch selection shows the same action. The native dialog provides board-slot context, labelled search, jersey/name/team/number/position rows, empty/no-result messages, circular close and Cancel/Escape. Cancel preserves selection and restores slot focus. A successful swap clears selection and focuses the neutral pitch. The old roster dropdown in the player editor is hidden on this route to keep editing and substitution separate.

## State and persistence

The picker reuses `replaceAthlete`: incoming athlete identity changes the occupant, while the slot id, coordinates and tactical role remain. The outgoing athlete immediately becomes an eligible reserve because bench is derived from the roster. No duplicate athlete remains on the pitch or bench. Formation changes operate on the current XI. Canonical roster position facts are not mutated.

The existing stable athlete key continues resolving personal name/number overrides in both pitch and picker. The picker pins team, slot and outgoing identity and rejects stale actions after team/account change; disposal closes its dialog. Search/open/cancel are not project edits.

Substitution calls the existing render/onChange/dirty-draft scheduling path. Classic Studio persists through its existing user-scoped draft writer (or the existing unscoped compatibility writer); it does not currently use Match Studio cloud project autosave. No alternate substitution store or cloud-project path was added. Reload restores the changed XI and drawings; bench reconstructs from the existing canonical roster, as before. Existing cloud project, Match Studio and Comparison persistence code is unchanged.

## Validation

- `npm test` after TB1.1: 631 passed, 0 failed, including 17 TB1/TB1.1 tests.
- All 9 board regression groups passed.
- Targeted TB1.1 + Weekly XI tests: 38 passed.
- `npm run build` passed; generated `dist/backend.js` has no content change. `git diff --check` passed.
- Coverage includes exact slot preservation, outgoing bench identity, duplicate prevention, canonical roster immutability, search/cancel/Escape/focus, overrides, formation changes, stale picker rejection, empty custom-team bench, existing editor, normalized drawing tools, clear/undo, draft save/reopen and expanded-view isolation.
- Browser visual verification was not performed: the available browser inventory was empty. Desktop/mobile layout and native-dialog interactions should receive a manual browser check.

## Manual local checks

1. Open `/studyo`, confirm tools replace the bench while team/formation/pitch proportions remain familiar.
2. Hover or keyboard-focus a player; on touch select the player. Open Değiştir, search and substitute. Reopen: outgoing player is available and incoming player is absent.
3. Drag the new starter, change formation, refresh, and confirm XI/drawings restore. Check personal name/number overrides.
4. Draw, erase, clear, undo; then return to Taşı. Check expanded view and a narrow screen for overflow.
5. Confirm Comparison keeps its roster workflow and a public shared lineup remains read-only.

No migration, database change, production mutation, commit, push or deployment.

## TB1.1 — selection cleanup and shared picker visuals

Root cause: `replaceAthlete()` retained the target slot in `selected`; the TB1 close handler also restored focus to that player. Both `.player.selected` and `.player:focus` exposed its action. Hiding a button alone would have left the editor and selection state stale.

The private replacement helper now reports whether a swap occurred. Only after the existing state mutation/render/draft scheduling succeeds does the picker close and call `selectPlayer(null)`. The editor clears and focus goes to the pitch (`tabIndex=-1`), rather than to the new athlete. A neutral action marker suppresses residual CSS hover until a fresh player pointer movement, keyboard focus or selection. No timeout is involved. Failed eligibility checks leave the picker open with an error and preserve selection.

An owned pitch click listener clears selection on empty grass/markings/empty slot-layer space. Interactive descendants, active gestures/drawing and the open picker are excluded. Nothing is installed on document click. Escape in move mode clears selection when no substitution/custom dialog owns it. Cancel, X and native dialog Escape remain distinct from successful replacement and keep the original selection.

`dist/player-picker.css` is the single visual stylesheet extracted from Weekly XI and loaded by both pages. It owns the modal shell, circular X, labelled search, live result meta, bounded scroll list, jersey row, ellipsis, plus affordance, theme tokens, focus and responsive styling. The shared row class contract remains `weekly-result` / `weekly-result-copy` / `weekly-result-action`; jersey rendering already comes from the same board utility. This deliberately shares safe presentation only, avoiding a new controller/bundle bridge between classic script and Weekly XI's ES module.

Weekly XI JavaScript and its full-catalogue search/duplicate/selection logic are unchanged. Substitution still derives only the current team's bench and searches its effective player names. Its heading uses the board slot role; results show catalogue/player display positions without mutating them. Only the result region scrolls; count is recomputed from filtered results, with “Oyuncu bulunamadı.” on no match.

TB1.1 files: `dist/app.js`, `dist/studyo.html`, `dist/haftanin-ilk-11i.html`, `dist/styles.css`, `dist/weekly-xi.css`, new `dist/player-picker.css`, `tests/tactical-board-ux.test.mjs`, this document. Earlier uncommitted TB1 changes remain intact. No Tactical Tools expansion was made in TB1.1.
