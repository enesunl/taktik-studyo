# TB2.1 — pitch height and team-specific board state

## Audit and root causes

The reference is `15ebe69:dist/styles.css` (pre-TB2). TB2's more specific
`.pitch.tactical-pitch` rule removed the original maximum height. The unchanged
680/880 aspect ratio could therefore produce a much taller pitch. The grid's
stretch alignment also allowed the longer sidebar to stretch the board card.

`selectTeam()` rebuilt `state.players` from `teamPlayers()` every time and
reset `customized`. It had no per-team working-state cache. TB2 also retained
one drawing controller/history while switching the team and intentionally
skipped clearing drawings. Thus drawings leaked and XI edits disappeared.

## Sizing

Normal Taktik Tahtası defaults again use width 100%, aspect ratio 680/880,
maximum height 642px; at >=1450px the cap is 700px, at <=950px it is 620px.
At <=620px the original minimum is 430px and there is no maximum. These are
responsive constraints, not a fixed height at every width. The sidebar no
longer stretches the board card. Expanded defaults inherit the pre-TB2 rules.

The existing 1200/650 slider defaults remain the normalization baseline. The
height slider still scales portrait geometry; a saved non-default height uses
TB2's custom sizing rather than the restored default caps. Values are never
rewritten on load. Custom expanded height is bounded by available space.
Players, lines, canvas and SVG keep the same relative coordinate system.
No sizing rule for Comparison, Weekly XI or Match Studio was changed.

## Ownership and switching

`dist/app.js` owns maps keyed by canonical catalogue `team.id`, not display
names. A display-name lookup only bridges old snapshots without IDs to the
current catalogue once. Legacy fallback snapshots may retain a provider ID;
user-created teams get an opaque generated ID. Existing explicit IDs are not
silently relabelled as another catalogue identity.

Before switching, unfinished gestures and the substitution dialog are
cancelled. The current state is deep-copied into its team entry. The target is
restored or initialized once with its own 4-3-3 XI. Selection is cleared. A
generation counter prevents delayed player-editor results from writing UI
after A → B or A → B → A. Catalogue loading already completes before board
mount; team selection itself performs no asynchronous provider request.

Each team owns formation, slot IDs/roles, player identities, exact coordinates,
substitutions, local player edits and drawings. Bench remains the established
catalogue-roster-minus-current-XI derivation; it is not a second mutable roster.
Canonical roster data is unchanged. Personal global overrides retain their
existing player-ID ownership and API.

`board-tactical-tools.js` retains a separate shared Studio drawing-history
instance per team. It swaps context in the same mounted UI and drawing engine.
Undo/redo/clear affect only the active team. Player undo is also isolated.
Pitch size/color stay workspace-global across switches and survive reload.

## Persistence contract

This page uses the existing user-scoped local draft writer, not cloud
`studio_projects` snapshots or the Çalışmalarım save API. No database migration
or cloud snapshot schema change is needed or made.

The same draft envelope/key gains an optional, versioned `workspace` field:

```text
active board fields + workspace: {
  version: 1,
  activeTeamId,
  teams: [{ teamId, state: <non-recursive board snapshot> }]
}
```

Autosave exports the latest active team plus every visited team's state.
The browser-only validator rejects duplicate IDs, nested workspaces, invalid
boards and mismatched active entries. Existing single-board drafts still load
and are upgraded through normal autosave. `getState()` remains active-board-only
for sharing; `exportDraft()` exposes a copied workspace snapshot for local
persistence/testing. Existing share and Edge contracts are unchanged.

As in Studio, undo/redo stacks are session history: they survive team switches
but reset on full reload. The resulting drawings/players/formations persist.
The existing 1 MiB draft limit/browser storage quota still applies. This is
local persistence, not cross-device cloud project storage. Bench reconstruction
continues to require the already-loaded catalogue.

## Verification

Eight new TB2.1 integration tests cover all drawing tools across A/B, isolated
undo/redo/clear, XI/bench/formation retention, fractional pointer coordinates,
stable IDs through a name change, deep-copy isolation, scoped multi-team
autosave/reopen, old snapshots, validation failures, interrupted gestures,
stale picker/editor callbacks, pitch controls and custom-size reload.
The custom-team regression test now accounts for generated stable IDs.

`npm test`: 651 passed, 0 failed; all 9 board regression groups passed.
No browser was connected, so no real browser scenario or screenshot check is
claimed. Responsive defaults were checked against the pre-TB2 CSS, and sizing
bindings and state transitions were exercised by automated tests.

No database reset, migration, production mutation, commit, push or deploy.
