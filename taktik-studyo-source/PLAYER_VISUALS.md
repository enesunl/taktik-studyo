# Player jerseys

All player visuals use `createJersey()` in the human-edited `dist/app.js`.
Its fixed, decorative inline SVG has a generic shirt body, collar and sleeve
accents. Numbers are DOM text; names/positions remain separate safe text nodes.
There are no portrait images, initials avatars, logos or remote kit assets.

The board root supplies `--team` and `--team2` from `state.team.color/color2`.
Each Comparison board owns its variables. Public shares use the existing
`lineup_data.team` colors in the snapshot, without fetching the catalogue.
`jerseyNumberColor()` uses linearized sRGB relative luminance and chooses the
higher-contrast black/white text (at least 4.5:1). Goalkeepers use the same palette.
Team changes, undo and draft restore update the variables through board render.

## Compatibility data

`photo` remains in bundled/catalogue player data and old draft/share payloads.
It is **never assigned to an image, CSS URL or network request**. Its truthiness
is part of the existing initial-XI selection ranking; removing it would change
player selection. This phase deliberately preserves that ranking and existing
validation/database/snapshot contracts. `photo_url` validation is unchanged.
The unused remote `photoSource` fields were removed from `dist/rosters.js`.
FotMob links remain only as roster-data attribution, not image sources.

All 473 tracked numeric PNG portraits under `dist/faces/` were removed from the
current production tree (6,467,695 bytes). Each was referenced by the old roster
photo metadata; no unrelated static graphics were removed. Historical Git data,
seed SQL and historical audit documents were not rewritten. Nothing was deployed:
existing production assets are only removed when this branch is later deployed.

## Verification

- `npm test`: contrast, renderer structure, absent portrait assets, roster/bench,
  draft, readonly, Auth, sharing and board interaction regressions.
- Local isolated browser checks at 1440/1024/390px on Studio, Comparison and shared
  view: colors, long names, number edits, responsive layout and zero photo requests.
- `npm run build` regenerates only `dist/backend.js`; never edit it manually.
