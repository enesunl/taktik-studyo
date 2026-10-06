# First-login onboarding — O2

`/hos-geldin` and `/hos-geldin.html` now mount the same five-step welcome experience after the existing protected-page guard validates the user. O1 remains the persistence and authorization foundation. No new migration, Auth configuration or production operation is required by this code change.

## Presentation and copy

The desktop workspace has two columns: editorial text and lightweight HTML/CSS product artwork. A thin divider separates navigation. The quiet shared header retains theme and logout controls. The illustrations are explicitly labelled **ÜRÜN GÖRÜNÜMÜ · TEMSİLİ**, are not interactive and contain no external media, live scores or fetched personal projects.

| Step | Heading (slashes indicate line breaks) | Body |
| --- | --- | --- |
| 1 | TAKTİK STÜDYO'YA / HOŞ GELDİN. | Kadrolar oluştur, taktiklerini çiz, Süper Lig maçlarını incele ve çalışmalarını tek yerde sakla. |
| 2 | TAKTİĞİNİ / SAHADA GÖSTER. | Oyuncuları sahaya yerleştir, formasyonunu değiştir ve taktik çizimlerini oluştur. |
| 3 | MAÇI SADECE / İZLEME. / ANALİZ ET. | Süper Lig maçlarını incele, kadroları gör ve maçtan kendi analiz çalışmanı oluştur. |
| 4 | ÇALIŞMANI / KAYDET. / GERİ DÖN. | Taktik çalışmalarını kaydet, daha sonra kaldığın yerden devam et ve kendi Haftanın İlk 11'ini oluştur. |
| 5 | SON BİR ŞEY. — HANGİ TAKIMI / DESTEKLİYORSUN? | Favori takımını seç. Bunu daha sonra profilinden değiştirebilirsin. |

The last sentence follows the requested copy; adding a favorite-team editor to Profile is outside O2. Existing Profile P1 fields and layout are unchanged.

`Başla →` opens step 2; `Devam →` advances; `← Geri` is available on steps 2–5. Textual `n / 5` progress and cumulative dots track the step. Step changes do not write browser history. The final button is `Taktik Stüdyo'ya Başla →`.

## Team data and persistence

- Step 5 lazily calls `teamCatalogue.loadTeams()`. It reads only active `catalogue_teams`, never `catalogue_players`, the legacy catalogue, provider mappings or media. Display fields are the canonical ID/slug, name and validated product colors. Team normalization is shared with the existing full catalogue loader.
- After O1.1, the picker and preference validation share a canonical service built from the existing runtime catalogue transport (the canonical `dataClient` when enabled, otherwise the existing client). Profile persistence always stays on the Auth/Profile client. The profile database no longer needs `catalogue_teams` or any catalogue FK/trigger query. A missing catalogue still blocks non-null preferences; it never falls back to legacy/provider IDs.
- Native radio labels include a color stripe, name, selection border and visible `✓ Seçildi`. Arrow keys/Space work using standard radio behavior. An explicit `Favori takımım yok` option maps to `null`; it remains available during catalogue loading or failure.
- Final completion calls only `completeOnboarding({favoriteTeamSlug})`. O1 atomically writes the favorite slug and `CURRENT_ONBOARDING_VERSION`; its database trigger owns the completion timestamp. No separate preference write or client timestamp is added.
- `Atla` on steps 1–4 calls the same method with `null`. It persists completion before navigating, rather than hiding the welcome screen locally.
- All partial step/selection state lives in the mounted UI closure. Back/forward preserves it; refresh can restart. No localStorage, sessionStorage, cookies or partial database writes are used by this UI.

## Failure and lifecycle behavior

- Initial preference reads use O1 `needsOnboarding`. A completed user immediately goes to `onboardingDestination(search)`; a self/external/invalid destination falls back to `/studyo.html`. There is no onboarding redirect loop.
- Initial read/schema failure displays a generic retry state; it does not fake completion or relax Auth. Completion failure preserves the step/selection, announces `Tercihin kaydedilemedi. Tekrar dene.`, re-enables the same action and does not navigate. Raw SDK messages are not rendered.
- Team errors expose an independent retry. Null completion does not depend on the team query succeeding.
- Completion is single-flight; navigation/back/selection are disabled during the write. The existing guard's generation/identity `current()` check runs before operations and after every asynchronous result. O1 also checks current ownership at its API boundaries. Stale UI handlers cannot issue a new write; a response to an already-issued request cannot update a new account's UI or navigate it. An already-dispatched database request cannot be recalled, but it remains pinned to its original owner under O1/RLS.
- Guard disposal clears selection, catalogue references, DOM and listeners. A new account gets a fresh mount and preference read. Logout behavior is unchanged.

## Responsive and accessibility

The shared theme variables own light/dark presentation; no independent preference exists. The workspace stacks below 640px, the team picker adapts to one/two columns, text can wrap, and actions have at least 44px height. Each step has one H1 and receives heading focus when entered. Progress/loading use polite live regions; completion errors use an alert. Native buttons/radios retain visible keyboard focus. The brief entrance effect runs only when reduced motion is not requested.

## Local verification

```sh
npm test
npm run build
git diff --check
node scripts/serve-local.cjs 4173
```

The existing server serves `/hos-geldin` and `/hos-geldin.html`. DEV1 now supplies an isolated Supabase Local Auth/Profile environment and a local in-memory browser bundle; see [LOCAL_SUPABASE_DEV1.md](LOCAL_SUPABASE_DEV1.md) for startup, migration verification and the new-account/Skip checklist. Start Supabase Local before the frontend. The normal production build remains hosted; the local server rejects hosted configuration. The canonical catalogue remains a separate local source. Create a new local test user after O1 is installed, whose profile starts with `onboarding_version=0` and `onboarding_completed_at=NULL`.

There is no production Auth bypass, forced-onboarding URL parameter or environment switch. The existing service/UI test doubles simulate incomplete/completed users without network calls; the O1 database tests exercise real SQL in disposable in-memory PGlite. A completed real account intentionally cannot replay onboarding by opening the URL.

Manual checklist: visit both aliases; progress through all five steps using keyboard; select a team then go back/forward; test null selection and Skip; verify completion destination; repeat light/dark at desktop and narrow widths; verify completed-user bypass and logout. Connected-browser visual checking was unavailable in this execution environment, so viewport appearance needs this manual review.

Automated coverage includes 12 new O2 UI/catalogue/lifecycle tests and updated route expectations. The full suite passed **578 tests**, with **9 board-regression groups**. Profile P1, profile edits/statistics, Auth/callback/recovery, theme, protected routes, Matches, Studio and Weekly XI regressions remain in the full suite.

`npm run build` passed and generated `dist/backend.js`; it was not hand-edited. `git diff --check` passed (Git emitted only its existing generated-bundle LF/CRLF conversion notice).

O3 ordering, accent colors, Studio/homepage/Weekly XI personalization are not implemented. Production DB, schema, Auth and provider settings were untouched. No commit, push or deploy was performed.
