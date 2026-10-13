# Tactical Board TB2

Taktik Tahtası consumes Studio's `mountTacticalDrawings`, object renderer,
history, palette, widths and pitch preference controls. The narrow
`board-tactical-tools.js` adapter supplies the classic board's lifecycle and
portrait sizing. `page-bootstrap.js` injects it only into `mountStudio`.
Comparison and the public read-only viewer keep their existing controllers.

Tools: Seç, Koşu, Pas, Çizgi, Kalem, Alan, Çember, Sil. Colors: Beyaz, Sarı,
Kırmızı, Mavi. Widths: İnce, Orta, Kalın. Shared presentation lives in
`dist/tactical-tools.css`; Match Studio imports that stylesheet and Taktik
Tahtası links it. No second drawing engine or dependency was introduced.

Non-selection tools cancel an active player gesture, clear player selection,
and give the drawing surface pointer priority. Player clicks, keyboard moves,
dragging and substitution are blocked until Seç. The open substitution dialog
also blocks drawing actions. TB1.1 bench filtering, replacement, selection
cleanup and cancel/focus behavior are retained.

Drawing undo/redo/clear has its own history. The footer's existing undo still
undoes player changes, preserving current drawings. Formation reset preserves
the tactical layer. TB2.1 isolates team selection and history by canonical team
ID (see `TACTICAL_BOARD_TB2_1.md`). Pitch size/color changes do not enter
drawing history, matching Studio. The sliders use Studio's bounds; the classic
portrait pitch adapts proportionally within available width, stays centered,
and keeps players and overlays in the same normalized coordinate system.
Defaults are 1200/650 control values and #285b3b. Reset restores these values.
These preferences belong to the user's existing scoped board draft and do not
write to Match Studio's device preference keys.

## Local drafts and sharing compatibility

Old pen/eraser strokes are retained exactly, including eraser masks, under the
SVG layer. Shared history has optional legacy-stroke support so clear/undo/redo
can cover both layers. Sil can remove a hit legacy pen stroke or a new object.

The local draft gains an optional `tactical` member containing `drawings`
(exact Studio objects), `legacy` (old strokes) and `pitch` (width/height/color).
`board-draft.js` validates this browser-only extension. Existing user keys,
account isolation, storage limits and old draft reading remain in place.
No Edge validation, database schema or public shared draft key changes.

The existing public sharing format supports only pen/eraser strokes of fixed
width. A compatibility outline projection in `state.drawings` keeps that
contract: arrows/lines/freehand and shape outlines can still be shared.
Public sharing does not reproduce zone fill, dashed line styling, custom
stroke width or pitch preferences. Local drafts retain all these details.
Existing public sharing size/point limits still apply; no limits are relaxed.

## Verification

- Full `npm test`, including board regression.
- TB2 tests cover every tool, palette/widths, erase, independent history,
  pitch controls/reset, modal interaction priority, scoped disposal, legacy
  preservation, exact local draft reload and unchanged share validation.
- Existing Match Studio drawings and TB1.1 substitution tests remain enabled.
- `npm run build` generates `dist/backend.js`; it is never edited manually.
- `git diff --check`.

No connected browser was available for screenshot verification. Manual checks:
open `/studyo`, exercise every tool, reopen a scoped draft, verify substitution
after Seç, then inspect expanded/normal layouts at desktop/tablet widths and
in both themes.

No migration, production mutation, commit, push or deployment.
