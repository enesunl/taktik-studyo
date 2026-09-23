# M4 — Match Studio tactical drawing tools V1

Local implementation: **2026-09-22**. M4 extends the existing M3 board only.
No commit, push, deployment, production mutation, database/Auth/Edge/Netlify
change, provider expansion or secret change was performed.

**PRODUCTION DEPLOYMENT BLOCKED PENDING PROVIDER-LICENSE RECHECK** remains active.
The M1 review referenced BSD v4.0 effective **2026-10-01**. M4 is not license or
release approval. Browser QA below is also pending.

## Architecture and reuse

The existing normal Studio was inspected before implementation: its canvas
stores normalized pen/eraser strokes, erases pixels with destination-out and
uses a board-wide undo stack shared with player edits. It has no drawing redo.
Converting that engine would broaden M4 and risk Studio/Comparison/shared drafts.

M4 instead adds two focused modules to the current Match Studio:

- `src/lib/tactical-drawings.js`: object geometry, sampled paths, bounded history,
  hit testing and safe SVG object rendering.
- `src/lib/tactical-drawing-ui.js`: compact toolbar, preview/committed SVG groups,
  pointer lifecycle, mode controls, local shortcuts and disposal.

Normal Studio's exact normalized coordinate calculation was extracted as
`pitchPoint(event, rect)` in human-edited `dist/app.js` and reused by both engines.
M4 also reuses `TAKTIK_BOARD_UTILS.listenForDrag` for pointer listener cleanup.
Normal Studio keeps its original canvas, stroke schema, pixel eraser, undo and
draft behavior. No shared drawing-state migration was introduced.

Match source data and working player slots remain separate from tactical objects.
`board.getState()` retains its M3 player-state contract; `board.getDrawings()`
returns a detached snapshot of tools, objects and history counts. No DOM nodes,
SDK objects or provider data enter drawing state. It is in-memory only.

## Object model and SVG

All geometry uses **0–1 pitch coordinates**, clamped to the pitch:

```js
{
  id: 'draw-12',
  type: 'movement-arrow',
  color: 'yellow',
  width: 'medium',
  geometry: {start: {x: .3, y: .45}, end: {x: .52, y: .28}}
}
```

Line/arrow objects use start/end. Freehand has `geometry.points`. Zone/circle
objects use a positive `{x, y, width, height}` bounding box regardless of drag
direction. IDs increase per board and are not reused after undo or clear.

SVG has viewBox `0 0 1000 625`, matching the existing pitch ratio 1.6:1. Coordinates
are mapped to that design space at rendering time; no screen pixels are stored.
Each pointer sample uses the pitch's real `getBoundingClientRect()`, including
negative left offsets when mobile panning exposes the right half. No cached
viewport-origin math or resize raster repaint is needed.

Stacking: field markings (z0), decorative SVG drawings (z1), players (z2),
transparent drawing input surface (z4). Pitch overflow clips all tactical marks.
SVG itself has no pointer events; it is not an alternative player editor.

| Tool | Representation / behavior |
| --- | --- |
| Seç | Default; player selection, drag, swap, bench and keyboard controls |
| Koşu | Solid movement arrow; width-scaled head capped for short arrows |
| Pas | Dashed shaft (`12 9`) and solid head; distinct without relying on color |
| Çizgi | Straight segment without a head |
| Kalem | One rounded polyline; 2 design-unit sampling and bounded decimation |
| Alan | Rectangle with visible stroke and 16% opacity fill |
| Çember | Unfilled ellipse in a normalized positive bounding box |
| Sil | Hit-tests and removes a whole drawing; never deletes players |

Pointer movement updates only the preview group. Pointer-up commits one object
and one history entry. Escape, pointercancel, lost capture, mode/color/width
change, formation reset and disposal discard unfinished previews and release
capture/listeners. Non-primary/unrelated pointers cannot finish another gesture.
Segments/paths shorter than 6 design units and boxes with either dimension below
4 design units are ignored. Freehand paths are capped at **256 points**; reaching
the cap decimates samples while retaining the first point and final endpoint.

Eraser hit testing walks reverse paint order. Lines, freehand segments and arrow
heads use point-to-segment distance; zones accept their filled interior; ellipses
use a 64-segment outline approximation. Tolerance scales from roughly 8 CSS pixels
plus half the stroke width. Overlapping hits select the topmost eligible object.
Erase commits on pointer-up; cancellation removes nothing.

## Colors, widths and history

Four fixed colors: white `#ffffff`, yellow `#f5df4d`, red `#ff6868`, blue `#74bcff`.
Three semantic widths: thin/medium/thick rendered as 2/4/7 SVG design units.
Settings affect future objects only. Existing objects retain their own settings.

Drawing-only history holds at most **50 actions**. Add, erase and clear can be
undone/redone; a fresh action clears redo. The board holds at most **200 objects**
and announces that limit without adding another object. History shares internal
unchanged objects; all public snapshots and added values are detached copies.
These bounds also limit retained freehand memory.

“Tüm çizimleri temizle” changes only drawing history. It does not move players,
alter substitutions/goals/score or fetch data; undo restores the cleared set.
“Gerçek Dizilişe Dön” preserves committed drawings and their history while keeping
M3 behavior: restoring source player positions **and original XI identities**.

## Toolbar, interaction and accessibility

The fixed-width “Taktik Araçları · <tool>” trigger is in the existing header beside
formation reset. Its desktop/tablet palette is absolutely positioned and expands
left, with contained horizontal scrolling. Opening it adds no pitch layout space.
Mobile uses a bounded bottom floating strip; its sticky active-tool label remains
visible while scrolling to color/width controls. Controls are at least 44px high,
use native buttons, labels/titles, pressed/expanded states and visible focus.
The toolbar uses safe DOM text, not user-controlled HTML.

Only one tool is active. Drawing mode hides the contextual bench and gates player
click/drag/replacement/keyboard handlers as well as pointer hit delivery. Changing
mode cancels any existing player/bench gesture. Returning to Select restores M3
controls; closing the palette also returns to Select.

On mobile, Select leaves empty-pitch native horizontal pan available; player
surfaces retain M3 pointer manipulation. Drawing mode sets `touch-action:none`
only on the pitch input layer: touch drags draw instead of panning. **Return to
Select to pan to the other half, then reselect a drawing tool.** The page itself
does not receive a scroll lock. A live notice explains the mode and pan action.

Keyboard handlers are attached only to the board/toolbar roots:

- Escape cancels a preview, selects player mode and closes the palette.
- Ctrl/Cmd+Z undoes a drawing; Shift+Ctrl/Cmd+Z or Ctrl/Cmd+Y redoes.
- Input/textarea/select/contenteditable targets are excluded.
- Delete/Backspace do not erase players or drawings.

Existing M3 jersey selection glow, compact midfield spacing, pitch dimensions,
contextual reserves, pointer/keyboard swaps and incident-based goal indicators
remain unchanged. Account disposal cancels gestures, removes toolbar and board
listeners and clears owned children while preserving the supplied mount root.

## Network, persistence and deferred scope

The modules have no network/storage dependency. Existing M2 load/cache/guard
behavior remains; tactical operations do not call the API, BSD, an Edge Function
or provider media URL. No extra provider endpoint or data field was added.

Reload restores the source formation and no drawings. There is deliberately no
localStorage patch, new draft key, export, sharing, save button, text tool, ball,
object editing or animation. Future M5 planning can define a coherent Match Studio
draft containing player state and objects, then consider object editing or export
as separately approved scope. Existing public readonly shares are unchanged.

## Validation and its limits

- **25 new deterministic tests** in `tests/match-drawings.test.mjs`: all six draw
  tools; preview/tiny/cancel/capture cleanup; semantic colors/widths; eraser hits;
  50-action history/200-object/256-point caps; normalized offset/scrolled/resize
  math; mode gating; restored bench drag/keyboard swaps; clear/reset separation;
  local shortcuts; stale-account disposal; source immutability and one-load API.
- `npm test`: **355 passed, 0 failed, 0 cancelled, 0 skipped**.
- Full board regression (included in npm test): **9/9 groups passed**, including
  normal Studio drawing/eraser/cancel, Comparison, drafts, readonly shared views
  and scoped disposal. Existing M1/M2/M3/Auth/Profile tests also passed.
- `npm run build`: passed. `dist/backend.js` generated exclusively by build.
- `git diff --check`: passed. New files also checked for trailing whitespace.
- Browser-output scan: **23 text assets**, **0** secret/server-identifier findings.
  Configured secret values were compared privately, never printed or written.
- `node scripts/verify-match-studio-local.mjs`: real BSD GET data, **mocked Auth
  and DOM**, not a real browser. Match **215997**: one pitch, 22 players, 4-2-3-1 /
  4-1-4-1 formations; all six tools, erase, undo, redo, clear and reset passed.
  Reset preserved drawings, clear preserved players/goals. Existing future-match
  **216231** unavailable-XI check also passed. **8 initial BSD GETs**, **2 cache
  hits**, **0 additional provider requests from tactical/player interactions**.
- The separate mounted-UI fixture recorded exactly **one API load**, unchanged
  after all drawing/erase/history/clear/reset actions; no storage was accessed.

**Actual browser QA is pending, not passed.** Computer Use inventory returned
`apps: [], browsers: []`; opening localhost returned `No browser is available`.
Therefore 1440/1024/390 visual checks, real touch/pan, browser layout overflow,
toolbar obstruction and browser Network inspection could not be performed.
Deterministic coordinate/CSS/pointer tests and Node smoke are not replacements.
Zero interaction requests is verified at the local API/provider test boundaries;
it is not claimed as an observed browser Network result.

Before release, check all tools/colors/widths, no pitch layout shift/body overflow,
player readability and controls at 1440/1024/390. At 390, pan in Select to each
half and draw, confirm alignment and return-to-Select behavior. After the initial
`/__local/matches?id=215997` load, verify no requests during tactical/player edits,
no direct `sports.bzzoiro.com` request and no provider-media traffic.

## Changed files

Human-edited sources:

- `dist/app.js`: only normalized point helper extraction/reuse.
- `dist/match-studio.css`: Match Studio layers, modes, toolbar and mobile strip.
- `src/lib/match-board.js`: drawing composition and player-mode gate.
- `src/lib/match-studio-ui.js`: toolbar host in existing header.
- New `src/lib/tactical-drawings.js`, `src/lib/tactical-drawing-ui.js`.

Tests/docs/tooling:

- New `tests/match-drawings.test.mjs`, `MATCHES_M4.md`.
- `tests/match-studio.test.mjs`: obsolete “no M4 controls” test name corrected.
- `scripts/verify-match-studio-local.mjs`: extends existing read-only smoke.

Generated: `dist/backend.js` only. No HTML/provider/schema/Auth/draft/share source
changes were needed. Files are unstaged/uncommitted; git diff --stat lists tracked
changes only, so the four new files must be counted separately until staged.
