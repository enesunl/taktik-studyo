# M4.1 — Workspace, pitch preference and site theme

Local implementation completed **2026-09-23**. No commit, push, deployment,
production mutation, Auth setting, database, Edge Function, provider contract,
secret or Netlify configuration change. Existing uncommitted M4 work was retained.
M1–M4 documents remain historical records; this document supersedes M4's expanding
palette and duplicate Match Studio scoreboard presentation.

## Workspace

Match Studio now uses a viewport-height application layout. The normal navigation
stays compact above a studio topbar containing the Match Center return link,
team names, Maç Stüdyosu identity and the separate formation reset button.
The large score, status and scorer/minute block is no longer rendered here.
Match Center still renders its scoreboard, scorers, statistics and incidents.
Goal-ball indicators on individual Match Studio players remain.

The desktop editor grid has a 204px left sidebar; at 701–1100px it narrows to
176px. Sidebar and working stage scroll independently. The pitch preserves its
1.6 ratio and 800px minimum width, and its desktop size is capped against the
available viewport height. Very short screens below 560px height permit page
scrolling around a 560px workspace so controls are not clipped away.

There is **one** tactical toolbar DOM, not parallel desktop/mobile implementations.
Its permanent compact groups are Tools, Drawing Color, Width, Pitch and History.
Buttons have labels, titles, pressed state and visible focus. The active tool has
an inset edge and heavier text as well as its color treatment. There is no old
expand-left trigger. The usage text is behind an optional details disclosure.

At widths up to 700px, the same sidebar becomes a contained bottom tool strip
with internal scrolling and an active-tool label. It consumes a separate workspace
row rather than overlaying players. The pitch stage independently scrolls; only
its viewport pans horizontally. M4 mode rules remain: Select allows empty-pitch
pan and player gestures, drawing mode captures pitch drags, Escape returns to
Select. Native color input is excluded from drawing keyboard shortcuts.

M3 player selection/drag/keyboard movement, field/reserve swaps, contextual bench,
goals and reset are preserved. M4 object semantics are unchanged: six drawing
types, object eraser, undo/redo/clear, four drawing colors, three widths, 50 history
actions, 200 objects and 256 sampled freehand points. Formation reset and drawing
clear remain independent. Tactical drafts still are not persisted.

## Pitch color

`src/lib/pitch-preference.js` owns only a view preference, using
`taktik:match-studio:pitch-color:v1`. It accepts exact six-digit RGB hex values
(case-insensitive, stored lowercase). The native color picker allows arbitrary
RGB colors; it is not limited to presets. Invalid stored/input values are ignored.
Storage errors safely fall back to an in-memory preference.

Default is `#285b3b`, retaining the existing green stripe pattern with `#2b6140`.
Custom colors use a solid background. “Varsayılan” restores the original pattern
and removes the saved override. Neither formation reset nor drawing undo/clear
changes this preference. It does not enter normalized match/provider data, Auth,
profiles, player state, drawing objects or draft storage keys.

Pitch markings use deterministic WCAG relative luminance: convert sRGB channels
to linear light, weight by 0.2126/0.7152/0.0722, then compare contrast against
black and white. Whichever has higher contrast is chosen. The half-way line,
circle, penalty areas and goals inherit that marking color. This gives at least
approximately 4.58:1 against a solid RGB background; tests sample 512 colors and
check the 4.5:1 floor. There is no manually curated color-pair list.

Pitch color is independent from site theme. Theme changes never modify pitch,
jersey/team colors or existing tactical object colors. The user's choice of a
drawing color can still coincide with a custom pitch color; it is deliberately
not silently recolored. Player labels retain their existing dark text shadows.

## Shared site theme

`dist/theme.js` and `dist/theme.css` are **human-edited source**, not generated
files. The small classic script is loaded synchronously in each HTML head before
stylesheets, and applies `html[data-theme=light|dark]` before normal rendering.
The shared stylesheet is included after page styles so its root tokens take
precedence. Auth/recovery pages keep their no-referrer meta before any script.

Initialization precedence:

1. Exact saved `light` or `dark` value at `taktik:theme:v1`.
2. `prefers-color-scheme: dark` from the system/browser.
3. Light when media-query support is absent or unavailable.

The initial system choice is not written as an explicit preference. The native
header toggle writes only after user action. System changes are followed until
the user makes an explicit choice. Storage events synchronize explicit preferences
across tabs; removal/invalid values return to the system fallback. Blocked storage
does not prevent initialization or in-memory toggling.

The theme script has no Auth/backend dependency and does not read URL parameters,
credentials, profile data or SDK storage. It changes only the root theme and the
text/pressed/accessibility state of theme buttons. It runs before Auth initializes;
Auth architecture, callback parsing and route guards are unchanged. It introduces
no fetch, analytics or remote asset. As with any static asset, its initial local
JS/CSS download is separate from zero backend/provider preference requests.

Tokens shared across all pages:

- `--bg-page`, `--bg-surface`, `--bg-elevated`.
- `--text-primary`, `--text-secondary`, `--border`.
- `--control-bg`, `--control-hover`, `--selected-bg`, `--selected-text`.
- `--action-bg`, `--action-text`, `--focus`, `--error`, `--notice`, `--shadow`.
- Compatibility aliases `--ink`, `--muted`, `--line`, `--paper` consume those tokens.

Existing light UI surfaces, secondary labels, inputs and borders were migrated to
tokens without changing their layout/typography. Auth forms now consume the same
theme. Browser-native controls use color-scheme. Existing dark pitch chrome,
jerseys, decorative pitch artwork and drawing swatches retain their own palettes;
the site is not inverted with a CSS filter. There are no per-page dark-mode forks.

Coverage is audited across all 12 HTML entry points:
index (landing **and public readonly share shell**), giris, kayit, auth-callback,
sifremi-unuttum, sifre-yenile, studyo, karsilastirma, profil, maclar, mac and
mac-studyosu. Extensionless routes serve the same HTML. Auth cards have a compact
theme control; application pages use their navigation/header. The public share
header's only added button changes the interface theme, not lineup content; no
editor, bench, formation, draft or account controls were added to that viewer.

## Validation

- `npm test`: **371 passed, 0 failed, 0 cancelled, 0 skipped**.
- Board regression, included in npm test: **9/9 groups passed**. Normal Studio,
  Comparison, readonly share, Auth/recovery, profiles, M1–M4, jerseys and drafts
  remain covered.
- **16 new tests** in `tests/theme-workspace.test.mjs`: preference precedence,
  toggle/reload/system/cross-tab behavior, unavailable storage/media, all-entry
  HTML audit, theme contrast, pitch validation/persistence/reset/contrast,
  workspace structure and source/drawing immutability.
- Updated existing M4 palette expectations, Match Studio scorer expectations,
  topbar back-link location, profile script allowlist and public-share markup
  test. The latter permits exactly one theme button while still rejecting editor
  and account controls. M4 drawing/history/pointer tests remain green.
- Theme VM tests make **0 network calls**. The mounted workspace test makes
  **one initial match API load**, with no increase for drawing or pitch-color
  changes/reset. Only the pitch preference key is read/written in that test.
- `npm run build`: passed. `dist/backend.js` was generated only by this command.
- CSS syntax validation through esbuild: **8 stylesheets, 0 warnings**.
- Browser-output scan: **25 text assets, 0 secret/server-identifier findings**;
  secret values were never printed or written.
- Local HTTP: theme.js, theme.css, /mac-studyosu and /giris.html return **200**
  with appropriate content types. No production endpoint was used for this check.
- `git diff --check`: passed; new files checked separately for whitespace.

**Real browser QA remains unavailable.** Computer Use returned empty app/browser
inventory and opening localhost returned `No browser is available`. Consequently,
1440/1024/390 visual screenshots, real color-picker UX, touch/pan and browser
Network inspection are **not claimed as passed**. CSS/DOM/VM tests are not a visual
substitute. Before release, check workspace sizing/scrolling and both themes on
all major pages, reload persistence, custom light/dark pitches, player interaction
and readonly shares. Observe zero backend/provider calls during preference changes.

The existing **BSD production-license recheck blocker remains unchanged**.
These local changes do not authorize release or deployment.

## Files and baseline

New in M4.1: `dist/theme.js`, `dist/theme.css`, `src/lib/pitch-preference.js`,
`tests/theme-workspace.test.mjs`, `MATCH_STUDIO_WORKSPACE.md`.

Updated: all 12 dist HTML entry points; `dist/auth.css`, `dist/styles.css`,
`dist/routes.css`, `dist/comparison.css`, `dist/matches.css`,
`dist/match-detail.css`, `dist/match-studio.css`; `src/lib/match-board.js`,
`src/lib/match-studio-ui.js`, `src/lib/tactical-drawing-ui.js`;
`tests/match-drawings.test.mjs`, `tests/match-studio.test.mjs`,
`tests/match-studio-ux.test.mjs`, `tests/profile-ui.test.mjs`,
`tests/share-route.test.mjs`; generated `dist/backend.js`.

The starting tree already contained uncommitted M4 source/tests/docs and generated
output. They were preserved. Thus git diff --stat is the **combined working-tree
diff**, not a clean M4.1-only diff; untracked new files are excluded by Git's stat
until staged. Nothing was staged or committed during this phase.
