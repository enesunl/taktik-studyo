# MATCHES_RELEASE_REVIEW — Maçlar data licensing and release readiness (PROD1.1)

Review date: 15 Oct 2026. Technical and documentary review, **not legal advice**. The provider pages
below were retrieved on 14–15 Oct 2026 through an automated reader. Every clause relied on here must be
re-read in full by a person (ideally the reviewing lawyer) before release, and the page versions should
be archived.

Decision recorded: **Maçlar stays in the first public MVP**, and the licensing question is to be
resolved first. `matches` must not be deployed until the conditions in section 6 are cleared.

## 1. Provider, endpoints and datasets actually used

| Item | Value (from `supabase/functions/matches/*.js`) |
| --- | --- |
| Provider | **Bzzoiro Sports Data ("BSD")**, operated by **Bzzoiro LLC** (US). The UI attribution reads "Maç verileri: BSD Sports Data". |
| Base URL | `https://sports.bzzoiro.com/api/v2/events/` (server-side only, header `Authorization: Token <BSD_API_TOKEN>`) |
| Season list | `GET /api/v2/events/?league_id=11&season_id=1539&limit=200&offset=…`: fixtures, kickoff, status, round, scores (≤ 4 pages × 200) |
| Match detail | `GET /api/v2/events/{id}/`, plus optional `lineups/`, `incidents/`, `stats/` |
| Probable XI | Up to 2 previous finished matches per side → their `detail/lineups/incidents/stats` |
| Not used | Logos, badges, player photos, odds, WebSocket, predictions |
| Data shown | Fixtures/results (Maçlar), detail with lineups/incidents/statistics (Maç detayı), lineups as the starting point of Maç Stüdyosu, latest played week (Haftanın İlk 11'i) |
| Stored | Nothing provider-sourced is persisted by the server (in-memory isolate cache only). Users may save their **own** Studio projects that started from a match lineup (owner-only, RLS). Shared links contain user-edited lineups (team name, player names, positions). |

## 2. Official terms reviewed (sources)

| Document | URL | Version / status |
| --- | --- | --- |
| BSD API Data Usage and License | https://sports.bzzoiro.com/docs/api-license/ | **v4.0, effective 1 Oct 2026** (v1.0 of 5 Sep 2026 superseded). Applies to "all plans, including free access". |
| Terms of Service | https://sports.bzzoiro.com/docs/terms/ (`/terms/` → 301) | **v1.0, effective 1 Oct 2026**. Data use is governed by the licence above. |
| Conventions & limits | https://sports.bzzoiro.com/docs/conventions/ | Quotas, burst limits, caching guidance |
| Pricing | https://sports.bzzoiro.com/pricing/ | Football free tier and paid add-ons |
| Events docs | https://sports.bzzoiro.com/docs/football/events/ | Lineup status semantics (checked 23 Sep 2026, MATCH_STUDIO_PRODUCT_UX.md) |
| Old licence URL in repo docs | https://goaldir.com/docs/api-license/ | Now only a notice that the service moved to sports.bzzoiro.com. Repo references should be updated. |

## 3. Confirmed permissions and restrictions (from the licence/terms as read)

| Question | Finding |
| --- | --- |
| Public display of fixtures and results | **Permitted.** Licence §2 lists "Display the Data within your own applications, websites, dashboards and internal tools", with no public/private qualifier. |
| Lineups, incidents, statistics | Covered by the same "Data" grant. No dataset-specific condition was found. |
| Redistribution | **Raw Data may not** be resold, sublicensed, mirrored or redistributed in substantial part "as a standalone dataset, feed, database or API", nor may a service exist whose primary purpose is supplying raw Data (§4). **Derived Outputs** (analytics, ratings, user-created content that cannot reconstruct a substantial part of the raw data) may be used and distributed (§3). |
| Commercial vs non-commercial | The licence draws **no commercial/non-commercial distinction**. The MVP is free. |
| Caching / storage | Storing and retaining Data for internal use and archiving snapshots is permitted (§2). No cache-duration limit is stated. After access ends, retained Data may be kept only for research reproducibility, historical analysis and audit (§5). |
| Attribution | **Not required** by the licence. Required instead (§7): "You must not present the Data as official data of any league, club or federation." |
| Media assets | Logos, badges and player photos are outside the licence and limited to identification; marketing use needs the rights holder's permission (§6). **The app does not use provider media.** |
| Request limits (re-verified 2026-10-15) | Free football: **7,500 requests/day per account** (UTC reset; `429 taster_exhausted`). Per-IP burst: **25 req/s (burst 110)** on cached reads (`429 rate_limited`). Fair use: usage that "materially exceeds typical individual or small-project use" may be throttled or restricted. Poll live lists no more often than every 10 s. |
| Plans | Football API Free $0 (7,500/day). **Football API Unlimited $5/month** (removes the daily limit). Sports Pack $7/month and other add-ons are not needed. |
| Account rules | One account per person/organisation; do not share tokens across unrelated users or create multiple accounts to exceed limits. |
| Warranty / liability / law | Data "AS IS", may be "wrong, late or incomplete"; liability capped (amount paid in the last 12 months, or $100); **New Mexico law, AAA arbitration**; consumer rights under local law preserved. |
| Termination | Bzzoiro may suspend or terminate on breach; a §4 breach ends the licence to retained Data. |

**Is provider approval needed?** Under the licence text, displaying the data inside our own web app does
not require separate approval. **Recommended anyway:** a short written confirmation from Bzzoiro covering
(a) a public consumer web app showing Süper Lig fixtures, results, lineups, incidents and statistics to
logged-in users, (b) users saving and sharing their own edited lineups derived from that data, and (c) the
expected volume under the fair-use clause. An API key alone is **not** treated as proof of redistribution
rights.

## 4. Unverified licensing questions (for the lawyer and/or the provider)

1. **Upstream rights.** BSD compiles data "from public sources, third-party providers and its own
   models", and is not affiliated with any league or federation. Whether Süper Lig/TFF or their data
   partners assert rights over live/structured match data in Turkey (including database protection
   under FSEK) is not verified. BSD offers no warranty, so the risk would sit with us.
2. **User shares.** Is a publicly openable user share link (an edited lineup with player names) a
   permitted Derived Output and not "redistribution"? It appears so (single, user-edited snapshot, not a
   feed), but this is not confirmed.
3. **Saved projects after termination.** Whether users may keep projects that embed match lineups if our
   BSD access ends (§5 allows research/audit retention only).
4. **Player names as personal data (KVKK)** in fixtures and lineups: public-figure/sports-reporting basis
   to be confirmed by the lawyer.
5. **Fair use for a public MVP** on the free tier. Moving to Unlimited is recommended (section 6).
6. **Legacy roster data (outside `matches`, but in the same release).** Production's legacy catalogue
   (`public.players`, 539 rows) and `dist/rosters.js` record FotMob team URLs as their source. Their
   licence/redistribution status was **not reviewed** here. It is a separate decision: review FotMob
   terms, or move the production boards to the canonical BSD catalogue (a larger, separate change).

## 5. Available licensing options

| Option | Effect |
| --- | --- |
| Free tier | Permitted use as above. 7,500/day plus fair use. Risk of daily exhaustion → Maçlar shows "unavailable". |
| **Football API Unlimited ($5/month)** | Removes the daily quota. Same licence. **Recommended for the public MVP.** |
| Written confirmation from Bzzoiro | Removes ambiguity on public consumer display, shares and volume (contact via the licence page / https://support.bzzoiro.com). |
| Different/official data provider | Not evaluated. Changing the provider needs separate approval and a technical migration. |

## 6. Release conditions for `matches` (all required)

1. Lawyer/operator sign-off on sections 3–4, with the provider pages archived.
2. Plan decision: **Unlimited** subscription (recommended), or an accepted free-tier risk. Optionally,
   written confirmation from Bzzoiro.
3. `BSD_API_TOKEN` set as a **Supabase Edge secret only** (never in `.env`, repo or browser).
4. Legal drafts mention the sports-data source (no personal data is sent to it) and keep "not official
   data" wording. The Terms already state that the data is third-party, informational and unofficial.
5. Technical items in section 7 accepted.

## 7. Technical readiness (`matches` function and clients)

| Area | Status |
| --- | --- |
| Authentication | Gateway `verify_jwt=true` plus handler `getUser(token)`; rejects anonymous/unconfirmed users. The token is checked before any cache hit. |
| Origins | Default `https://taktikstudyo.com`; optional `MATCHES_ALLOWED_ORIGINS` (HTTPS or the exact local origin). Disallowed origin → 403. |
| Secrets | `BSD_API_TOKEN` (required; a missing token yields a controlled "unavailable"); Auth uses the publishable key (`MATCHES_PUBLISHABLE_KEY` or the injected `SUPABASE_PUBLISHABLE_KEY(S)`). The token is sent only to the provider, never logged or returned. |
| Errors / fallbacks | Generic codes only. Provider 429 → `provider_limited` → 503 (unless stale data is served); 401/402/403 → the same unavailable codes, with no stale data. Maçlar shows "Maç verileri şu anda alınamıyor"; detail/studio show unavailable states; Weekly XI falls back to "no week". Lineup `unavailable/predicted/confirmed` states are respected. |
| Limits | No per-user limit. Per-isolate cache: season 5 min; details by status TTL (45 s live … 1 h finished); max 32 concurrent provider fetches, 128 cached details. A cold Studio match open costs up to ~20 provider requests (detail + 3 resources + up to 4 history matches). No polling below 10 s. |
| Scope constants | `LEAGUE_ID=11`, `SEASON_ID=1539`, `SEASON='2026-2027'` are hard-coded. **They must be updated for the 2027/28 season.** |
| Production catalogue compatibility | The hosted function keeps legacy `teamId` (`fotmob-*`) for the legacy-catalogue boards. |
| **Fix applied (PROD1.1)** | The favourite match was never promoted in production, because the favourite is a canonical slug and the hosted `teamId` is legacy. The mapper now also returns `canonicalId` (the verified registry slug per BSD id), and `promoteFavoriteMatch` matches on `teamId` or `canonicalId`, never on name/provider id. Tests: `tests/matches-canonical-favorite.test.mjs`. |
| Not changed | Data provider, endpoints, caching and the API contract (one additive field). |

## 8. Caching (PROD1.2, implemented locally, not deployed)

**Licence fit:**
- §2 permits storing and retaining Data for internal use.
- No cache-duration limit is stated.
- The provider's own guidance (edge ~5 s, live 10–30 s, poll lists no faster than 10 s) is respected: the shortest TTL is 45 s, and there is no client polling.
- If BSD access ends, §5 limits retained data to research/audit, so cached data must stop being served. The in-memory cache disappears on its own; a persistent cache would need deliberate deletion.

**Per-isolate cache** (`supabase/functions/matches/handler.js`):
- Shared, non-user data only (fixtures, match details). No sessions, tokens, user ids or projects are cached, and authentication still precedes every hit.
- API bodies and error codes are unchanged. `X-Matches-Cache: fresh|stale` is a diagnostic header only.

| Data | TTL |
| --- | --- |
| Fixtures | 5 min while a match is live or within 30 min before / 3 h after kickoff (unchanged). Otherwise up to 30 min, ending before the next active window. |
| Live detail | 45 s (unchanged) |
| Upcoming detail with lineups | 5 min (unchanged) |
| Upcoming detail without lineups | 5 min if kickoff ≤ 2 h away; 30 min if ≤ 24 h; otherwise 1 h |
| Finished, complete | 6 h (was 1 h) |
| Finished, missing resources | 60 s for 4 h after kickoff, then 1 h |
| Resource error | 60 s |
| Postponed / cancelled | 10 min |
| Unknown match id | Not re-queried for 10 min |

**Resilience (MATCHES-CACHE-1.1):**
- **Stale-if-error, temporary failures only:** network errors, 5xx and 429 serve the last good fixtures (≤ 6 h) and details (≤ 24 h), with browser `max-age=30`. `MATCH_NOT_FOUND` is never masked.
- **Access lost (401/402/403):** invalid, revoked or unentitled token. All cached provider data in the isolate is purged and nothing retained is served (licence §4/§5). Users get the existing unavailable errors. Access is re-probed at most every 5 min per isolate.
- **429 back-off:** no quota type is inferred from the body. `Retry-After` (seconds or HTTP date) is honoured as sent, capped at 24 h. Without the header: 1 s, 2 s, 4 s … up to 60 s, reset after a success. The block is provider-wide, so fixtures and details wait together.
- **Failure handling:** a 15 s per-key cool-down after other errors.
- **Partial details:** a 429 on an optional resource keeps the existing partial-detail body and triggers the back-off through a non-serialised marker. A 401/402/403 on any resource fails the whole detail.
- **Deduplication:** concurrent misses share one provider request. Up to 320 details are kept (LRU).

**Freshness signal (additive, contract-safe):** every 200 body gains `freshness: {stale, fetchedAt}`; all existing fields are unchanged. Clients strip it before validation, so it never reaches saved projects or shares, and older servers without the field still work. When `stale` is true:
- Maçlar shows "Maç verileri şu anda güncellenemiyor. Gösterilen bilgiler <tarih saat> itibarıyla alındı." in a `role="status"` line.
- Match detail and Match Studio show the same text in their status line.

**Measured** with a simulated BSD provider, 300 users on a matchday, each opening fixtures, Weekly XI, 3 details and Match Studio once:

| Scenario | Before | After |
| --- | --- | --- |
| One warm isolate | 3,284 / day | **1,334 / day (−59%)** |
| Isolate recycled every 15 min | 5,418 | 5,054 (−7%) |
| Cold isolate per request | 11,200 | 11,200 |
| 30-min outage (240 user requests) | 120 provider calls / 120 user errors | 40 / **0** |
| 429 for 30 min | 120 / 120 | 10 / **0** |
| Daily quota exhausted (PROD1.2 midnight logic; now follows `Retry-After`) | 120 / 120 | 1 / **0** |

Single cold actions are unchanged: fixtures 2, Weekly XI week detection 2, detail 4, Match Studio on an upcoming match 14.

**Limitations of per-isolate caching:**
- Supabase Edge isolates are ephemeral and may run in parallel, so the in-memory cache helps only while an isolate stays warm. Cold isolates start empty.
- Back-off, cool-downs and the access-lost state are per isolate. Parallel isolates may each send one request into a 429 or a revoked token before backing off.
- Stale data exists only where an isolate already holds it. During an outage, a fresh isolate returns the normal unavailable error.
- Users of different isolates may briefly see different fixture versions, at most one TTL apart.
- The access-lost purge is per isolate too. Other isolates purge on their first failing request, or their data expires within its TTL (≤ 6 h fixtures, ≤ 24 h details as stale-only, never served after an access error).

A shared cache needs infrastructure (approval required):

| Option | What | Effort / cost | Effect |
| --- | --- | --- | --- |
| A. Postgres cache table | `tactics_private.provider_cache(key, payload, fetched_at, expires_at)`, read/written by `matches` with a service key | Migration + secret key in `matches`; free | Requests ≈ the warm-isolate figure regardless of isolates |
| B. Scheduled refresh | pg_cron/pg_net or an external job refreshes fixtures/details into A; the function only reads | A + a scheduler; free tier possible | Fixed, predictable provider usage |
| C. Storage JSON | Supabase Storage objects as cache | No migration, but a bucket and service key | Similar to A, slower |
| D. Unlimited plan ($5/month) | No cache change | Subscription only | Removes the daily quota risk; already recommended |

**Recommendation:**
1. Deploy this per-isolate cache together with D.
2. Measure real usage with `X-Matches-Cache` and the provider dashboard.
3. Add A (+ B) only if usage approaches limits.
