# FAZ 8 — Integrated Verification & Production Readiness Audit

Denetim tarihi: 20 Eylül 2026. Hedef: `taktikstudyo.com`, Supabase projesi `zwhoailuklwtxaaawfaq`.

## Executive Summary

**NOT READY — BLOCKERS FOUND**

Yerel uygulama temiz kurulumdan build ediliyor; 206 otomatik test ve 8 board regression grubu geçiyor. İncelenen production tablo, RLS, grant ve RPC sınırları kaynak migration'larla uyumlu. Gerçek secret sızıntısı tespit edilmedi. Bununla birlikte genel kullanıma açılacak release için üç engel var:

1. Canlı `lineups` v4 eski domain filtresini kullanıyor. Yeni domain için OPTIONS 403; paylaşımın production sınırı hazır değil.
2. Oturumsuz dış HTTP erişiminde site ve Auth sayfaları 401 / `Sign in required` döndürüyor. Public landing, başka cihazda email callback ve public share erişimi doğrulanamıyor.
3. Repository → production yayınlama ve sürüm doğrulama yolu kanıtlanamıyor: **DEPLOYMENT PATH NOT VERIFIED**.

Ayrıca login sonrası profil hazırlığı beklerken hesap değişiminde eski işlemin yönlendirme yapabildiği yerel mock ile yeniden üretildi. Bu bulgu mevcut suite'in kapsam boşluğu; yetki aşımı veya başka kullanıcının verisini görüntüleme gözlenmedi.

Tekil bulgu sayıları: **BLOCKER 3 · HIGH 0 · MEDIUM 3 · LOW 3 · INFO 3**. Aynı bulgu farklı bölümlerde tekrar anlatılsa da bir kez sayıldı. Manuel doğrulama maddeleri, başarısız oldukları kanıtlanmadıkça ayrıca vulnerability olarak sayılmadı.

Bu çalışma production mutation, Auth login/signup/reset, gerçek email gönderimi, migration apply, db push, Edge deploy, site publish, ayar/secret/DNS değişikliği veya commit içermedi. Yalnızca bu rapor eklendi; uygulama ve test kodları değiştirilmedi.

## Repository State

| Kontrol | Sonuç |
| --- | --- |
| Branch | `chore/phase8-release-readiness` |
| HEAD | `108cd4f3281b4934c30af0244f11326ef37f4df5` |
| Başlangıç working tree | Clean; denetim başlamadan doğrulandı |
| İzlenen dosya | 574 |
| History | Son 10 commit incelendi; reset/rebase/amend yapılmadı |
| Audit değişikliği | Yeni, commit edilmemiş `FAZ8_RELEASE_READINESS.md` |

Son 10 commit: `108cd4f`, `50e2abc`, `b394888`, `3a5b588`, `be926d6`, `23e8e7c`, `f273e2c`, `63dc05f`, `41b79e0`, `49489a4`.

### Dosya envanteri ve mimari

Framework eklenmemiş plain static HTML/CSS/JavaScript uygulaması. `src/backend-entry.js`, Supabase/Auth/catalogue/sharing modüllerini birleştirir. HTML sayfaları classic `defer` script'leri yükler; `page-bootstrap.js` route seçer, `protected-page.js` korumalı mount yaşam döngüsünü yönetir. Board motoru ayrı elle düzenlenen `dist/app.js` içindedir.

| Alan / dosya | Sınıf ve düzenleme sözleşmesi |
| --- | --- |
| `src/backend-entry.js`, `src/lib/*.js` | İnsan tarafından düzenlenen ES module kaynakları |
| `dist/app.js`, `dist/comparison.js` | İnsan tarafından düzenlenen board/comparison kaynakları; disposable output değil |
| `dist/*.html`, `dist/*.css`, `dist/_redirects` | İnsan tarafından düzenlenen UI, route ve stil kaynakları |
| `dist/backend.js` | **Generated** esbuild bundle; yalnızca `npm run build` üretir |
| `dist/rosters.js`, `dist/faces/*.png` | Repository'de tutulan roster snapshot / statik varlıklar; mevcut build bunları üretmez. Roster snapshot'ın yeniden toplama pipeline'ı yok; silinip build ile geri geleceği varsayılamaz |
| `supabase/migrations/*.sql` | İnsan tarafından düzenlenen, sıralı schema/grant/RLS migration kaynakları |
| `supabase/schema/football.sql` | İlk football schema kopyası; Auth/profiles dahil bütün güncel migration'ların birleşimi değil |
| `supabase/seed.sql` | `scripts/prepare-seed.mjs` ile mevcut roster snapshot'ından üretilebilen, izlenen seed artefact; bu denetimde üretilmedi/uygulanmadı |
| `supabase/functions/lineups/*` | Edge Function kaynakları; `src/lib/validation.js` browser ile ortak kullanılır |
| `tests/*.test.mjs`, `tests/board-regression.cjs`, `tests/helpers/*` | İnsan tarafından düzenlenen test/fake/fixture kaynakları |
| `scripts/*` | Build, local serve, seed hazırlama ve eski live test araçları |
| `package.json`, `package-lock.json` | Script/dependency tanımı ve npm tarafından yönetilen kilitli çözümleme |
| `.openai/hosting.json`, `supabase/project.json`, `supabase/config.toml` | Hosting/proje/local CLI yapılandırma kaynakları; canlı ayarların tamamını kanıtlamaz |
| `AUTH_*.md`, `DRAFT_ISOLATION.md`, `BACKEND.md`, `TURNSTILE_SETUP.md`, `README_LOCAL.md`, `docs/*` | Dokümantasyon; `docs/ORIGINAL_SHA256.json` tarihsel snapshot manifesti |
| `node_modules/`, Supabase geçici dizinleri | Yeniden oluşturulabilir/ignore edilen bağımlılık ve cache |
| `.env` | Gitignore edilen yerel build yapılandırması; değerleri rapora alınmadı |

`dist/` bütünüyle generated değildir. `scripts/verify-live-backend.mjs`, reddedilmesini beklese de POST/PATCH/DELETE istekleri gönderir; production mutation yasağı nedeniyle **çalıştırılmadı**. Normal `npm test` içine dahil değil.

## Automated Tests

`npm test` exit code **0**:

| Ölçüm | Sonuç |
| --- | --- |
| Node test toplamı | 206 (177 üst seviye test, nested testler dahil toplam 206) |
| Passed / failed | 206 / 0 |
| Skipped / cancelled / todo | 0 / 0 / 0 |
| Board regression | 8 PASS grubu, hata yok |

Komut: `node --test tests/*.test.mjs && node tests/board-regression.cjs`.

Kapsam: Auth lifecycle ve gerçek kurulu SDK ile mock HTTP/storage, registration/login, email gate/callback, recovery isolation/dispatch, profile bootstrap/API/UI, protected routes, draft scope/import, catalogue, sharing/Turnstile/origins, PGlite database/RLS/constraint/grant testleri. Board regression gerçek board kaynaklarını fake DOM/canvas üzerinde çalıştırır: iki board bağımsızlığı, takım/formasyon, oyuncu değişimi, drag/drawing/undo, shared v1 restore, scoped disposal, root ownership ve listener cleanup.

Bu sonuç gerçek browser görsel E2E veya production Auth testi değildir. Denetimde ayrıca dosya eklemeden çalıştırılan login race probe'u M-01'i yeniden üretti; mevcut testlerin yeşil olması bu senaryonun güvenli olduğunu kanıtlamıyor. Testler gevşetilmedi veya değiştirilmedi.

## Build

- Node `v22.16.0`, npm `10.9.2`.
- `npm ci`: exit 0; 20 paket kuruldu, 21 paket audit edildi, npm çıktısında 0 vulnerability.
- Kilitli doğrudan bağımlılıklar: `@supabase/supabase-js 2.116.0`, esbuild `0.28.2`, PGlite `0.5.8`, Supabase CLI `2.117.0`.
- `npm run build`: exit 0, `Backend adapter built: configured`.
- Esbuild: `src/backend-entry.js` → minified IIFE `dist/backend.js`, target ES2022.
- Kurulum/test/build öncesi ve sonrası 574 izlenen dosyanın SHA-256 değerleri karşılaştırıldı: **değişen dosya 0**. Bundle da byte-for-byte aynı; elle düzenlenen dist dosyaları overwrite edilmedi.
- `dist/backend.js` SHA-256: `cf9c781dd73b3f9d37ffa86ce071301bb64124dd5ce1c43b91e7f0ef1fa2a58f`.

Reproducibility bu makine, kilit dosyası ve mevcut public build env için doğrulandı; farklı env'nin aynı bundle üretmesi beklenmez. Linux/CI çalıştırılmadı. Build SDK'daki belirli key-recognition ifadesini kontrollü değiştiriyor; SDK yükseltmesinde eşleşme yoksa build hata veriyor. Güncel sürüm bu kontrolü geçti.

## Auth

Ana singleton `src/lib/supabase.js`: `persistSession:true`, `autoRefreshToken:true`, `detectSessionInUrl:false`, `debug:false`; normal Auth, catalogue ve profiles bunu paylaşır. SDK session/token persistence ve refresh'i kendisi yönetir. App state sadece `id`, `email`, `emailConfirmedAt`, status/event içerir; raw client/session/token window'a verilmez.

`auth-session.js` durumları: `idle`, `signed_out`, `signed_in`, `password_recovery`. Local snapshot authorization kanıtı değil. `validateUser(expectedId)` her seferinde server `getUser()` çağırır; aynı identity ve `email_confirmed_at` gerekir. Metadata/`confirmed_at`/phone timestamp yerine geçmez. Bilinen typed invalid-session hataları yerel SDK cleanup'a; network/unknown hatalar session silmeden kontrollü hataya gider. Local signout `scope:'local'`; token storage manuel silinmez.

`onInvalidate` identity/status değişiminde UI/draft teardown'u senkron yapar. Normal subscriber'lar SDK callback lock'u dışında ertelenir. Epoch/revision ve mount generation kontrolleri stale validation/profile/draft sonuçlarını engeller. Ancak login başarı facade/UI sınırında aşağıdaki eksik var.

### M-01 — Login sonrası geciken işleme identity bağlanmıyor (MEDIUM)

Kanıt: `src/lib/auth-page-api.js:7`, `:18`; `src/lib/auth-ui.js:102`.

`signIn()` server doğrulaması başarılı olunca `await profile()` bekliyor; ardından current identity yeniden kontrol edilmeden `{ok:true,...}` dönüyor. Callback akışının aksine login sonucu `userId` taşımıyor ve login UI navigation öncesinde bu identity'yi doğrulamıyor.

Yerel, tamamen mock probe sırası:

1. A password login ve confirmed server validation başarılı.
2. Profil bootstrap `getUser()` yanıtı bekletildi.
3. `SIGNED_IN` ile B oturumu bildirildi.
4. A'nın geciken profile yanıtı döndürüldü.
5. Sonuç: current user B, profile write 0, fakat eski A submit'i `location.assign('/studyo.html')` yaptı.

Beklenen: `state_changed` ve eski işlemden navigation olmaması. İncelenen probe'da yetki aşımı veya A verisinin B'ye gösterilmesi yok; hedef route B'yi ayrıca validate eder. Yine de istenen stale-A/B ayrımını ihlal eder. Ayrı onayla login sonucunu validated identity/generation'a bağlama ve bu async sınır için regression testi önerilir; bu audit'te uygulanmadı.

## Email Confirmation

- Signup normal sonucu `confirmation_pending`; UI sabit `/giris.html?reason=confirmation_pending` hedefine gider. Login tek ve allowlisted reason için kontrollü mesaj gösterir.
- Server unconfirmed user login success olarak kabul edilmez; profile bootstrap, protected mount, catalogue, draft scope ve legacy import başlamaz. Beklenmeyen unconfirmed session desteklenen SDK local signout ile temizlenir; cleanup hatası başarı gibi gizlenmez.
- Production read-only `GET /auth/v1/settings`: HTTP 200, **`mailer_autoconfirm:false`**, `disable_signup:false`. Bu, mevcut backend'de email auto-confirm'ın kapalı olduğunu doğrular. Tarihsel kullanıcıların gerçekten email tıkladığını kanıtlamaz; kullanıcı verileri incelenmedi/değiştirilmedi.
- `consumeEmailLink`: tam bir `token_hash`, tam bir `type=email`; duplicate/extra/malformed percent encoding/boş/2048 üstü/whitespace/control karakterler reddedilir.
- `history.replaceState` consume fonksiyonunda senkron çalışır; app'in async Auth initialization/verification adımlarından önce query kaldırılır. Token yalnızca closure'da; DOM/storage/log/analytics'e yazılmaz.
- Callback GET/mount **verifyOtp çağırmaz**. Açık kullanıcı click'i → `verifyOtp(type:'email')` → aynı-id server validation ve confirmed email → profile sonucu → aynı-id UI kontrolü → `/studyo.html`.
- Callback mevcut normal/recovery session varsa token tüketmeden bloklar; auto-logout/account switch yapmaz.
- Callback HTML early `no-referrer`; sadece local CSS/bundle. URL temizliği initial hosting access log'una query yazılmasını engellediği iddiasını taşımıyor.
- Cross-device token_hash akışı PKCE verifier'a bağımlı değil; bu davranış kurulu SDK ve iki mock cihaz ile test ediliyor.

Production Site URL, redirect listesi ve gerçek email template için aşağıdaki manuel kontrol listesi geçerli.

## Password Recovery

`requestPasswordReset`: trim edilmiş geçerli email, exact recovery redirect allowlist, existing-session engeli, kontrollü generic response. Account-specific hata ayrıntıları ve raw SDK message UI'ya çıkmaz. Installed SDK `GoTrueClient.d.ts` reset signature'ında **`options.captchaToken?: string`** mevcut; uygulama bunu doğru property ile iletir.

`createRecoveryClient` her completion için ayrı client oluşturur: `persistSession:false`, `autoRefreshToken:false`, `detectSessionInUrl:false`. Uygulama token storage adapter'ı yok; SDK memory storage kullanılır. Dedicated client completion'ın verify/update/cleanup işlemleri ve bunların identity/lifecycle kontrolleri dışında normal login/catalogue/profile için kullanılmaz.

Reset parser yalnızca `token_hash` + `type=recovery` kabul eder; confirmation parser ile karışmaz. Query senkron kaldırılır. Sayfa load'unda token tüketilmez. Formda minimum 12 karakter, password trim edilmez; confirmation yalnızca UI'da karşılaştırılır ve API'ye gönderilmez. Double-submit engellenir.

Tek high-level API sırası: **verifyOtp(recovery) → updateUser(password) → signOut(local)**. Arada profile bootstrap yok. Operation boyunca app status `password_recovery`; dedicated `SIGNED_IN`, `USER_UPDATED`, `TOKEN_REFRESHED` main normal login'e dönüşmez. Main hesap değişimi, returned/current identity uyumsuzluğu ve dispatch'te farklı credential `state_changed` ile engellenir. Cleanup yalnızca dedicated client'a gider; başka main account'u logout etmez.

Verify failure update'i başlatmaz. Update failure best-effort cleanup dener. Cleanup failure `recovery_cleanup_failed`; password'ın başarıyla değiştiği kanıtlandıysa ayrı `passwordUpdated` bilgisi kontrollü mesajı belirler. Token/session UI'ya çıkmaz. Dispose sonrası dedicated memory session main restore'a taşınamaz.

Crash/in-flight belirsizliğinde token tüketilmiş veya password değişmiş olabilir; yeni link gerekebilir. Memory-only session, server-issued credential'ı tek başına revoke etmez ve gönderilmiş isteği geri alamaz. PC eski session'ının yeni password ile otomatik login olduğu varsayılmaz. Gerçek recovery email/credential değişimi çalıştırılmadı.

## Protected Routes

`/studyo.html`, `/karsilastirma.html`, `/profil.html` ilk HTML'de `protectedContent` hidden + inert. Sıra: local candidate → `signed_in` → server `getUser()` → aynı id + confirmed email → kullanıcıya bağlı mount. Recovery veya sırf local user snapshot ile content açılmaz.

Transient failure: content kapalı, retry, uygulama kaynaklı logout yok. Definite invalid session: identity/generation tekrar kontrolü ve SDK local cleanup sonrasında login. Unconfirmed: cleanup sonrasında `reason=email_not_confirmed`. Cleanup başarısızlığı, SDK önce SIGNED_OUT üretse bile kontrolsüz redirect'e dönüşmez. BFCache dönüşünde yeniden validation var.

Account A→B invalidation eski board, modal, writer ve profile DOM'unu temizler; generation eski async mount sonucunu atar. Bunlar route/privacy sınırlarıdır; backend yetkisi RLS/grants ve Auth server'dır. Login navigation boşluğu M-01 bu olumlu route kontrollerinden ayrı tutulmalıdır.

## Draft Isolation

Exact anahtarlar:

- `taktik:draft:<USER_ID>:main:v2`
- `taktik:draft:<USER_ID>:comparison:left:v2`
- `taktik:draft:<USER_ID>:comparison:right:v2`
- Public paylaşım: `taktik:draft:shared:<UUID>:v1`

Scope immutable user id + current generation kullanır. Başka kullanıcı key'leri enumerate edilmez; logout taslakları silmez. Writer debounce/pagehide ve disposal testleri geçiyor. Board disposal mount root'u kaldırmıyor; çocuklar/listener'lar temizleniyor ve disposed gesture yeni onChange üretmiyor.

Legacy importer yalnızca `confirmed:true` ile çalışır; ilk destination kontrolüne ek olarak source validation ve son active kontrolü sonrasında, write öncesi ikinci kontrol var. Existing destination overwrite edilmez, source silinmez. **Atomik localStorage CAS değildir.**

Önceki kullanıcı isteği doğrultusunda startup legacy karar ekranı kaldırılmış; `chooseLegacyDrafts` şu anda route startup'ında çağrılmıyor. Opt-in helper/testler duruyor, otomatik import yok. Bu durum yeni audit hatası olarak sınıflandırılmadı.

Profile route `drafts:false`: app draft storage/scope oluşturmaz. Normal Auth SDK persistence'ının localStorage kullanması bundan farklıdır. User-key ayrımı aynı browser origin'inde kriptografik erişim kontrolü değildir; cihaz/DevTools erişimine karşı izolasyon garantisi verilmez.

## Profile

`createProfileApi` guard'ın server-validated user id'sine pinlenir; mutable current session id hedef olarak kullanılmaz. Explicit select kolonları: `id,username,display_name,created_at,updated_at`. Email UI'da validated Auth user'dan read-only, `avatar_url` browser API dışında.

Username trim + 3–24 ASCII harf/rakam/underscore. Display name trim, boş→null, maksimum 60 Unicode code point, ASCII/C1 control character red. DB username/display constraint'leri, case-insensitive unique index ve own-row RLS asıl sınırdır; frontend validator tek güvenlik katmanı değildir.

Load/save generation kontrolü ve returned row id kontrolü var. Foreign row sonucu reddedilir; stale A sonucu B UI'ına uygulanmaz. Eksik profil bootstrap/save ile tamamlanabilir; blanket upsert yok. `23505` own-row recheck veya kontrollü `username_conflict`; başka username'in row'u sorgulanmaz. Genel username arama/listeme endpoint'i yok; conflict mesajı kullanıcı adı kullanılabilirliğini doğal olarak bildirir, bir email/account arama API'si değildir.

Profile UI safe DOM/textContent/value kullanır, raw remote `innerHTML` veya SDK error.message render etmez. Source/test ve production grant/policy kontrolleri uyumlu; gerçek kullanıcı profili açma/kaydetme bu audit'te yapılmadı.

## Catalogue

Production `teams`/`players`: anon ve authenticated için SELECT var; INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER yok. Column-level write grants de yok. Her iki role SELECT USING(true) policy mevcut; önceki anon policy'leri korunmuş. Normal Auth-aware singleton ile katalog okuması ve authenticated RLS erişimi yerel testlerde geçiyor.

Read-only public REST: teams HTTP 200, **18** row; players HTTP 200, **539** row. Production authenticated login yaratılmadı; authenticated erişim effective grant/policy metadata ve PGlite rol testleriyle doğrulandı, canlı kullanıcı browser testi olarak sunulmuyor. Veri güncelliği/gerçek kadro doğruluğu denetlenmedi.

Adapter validation, bounded pagination, minimum 11 player/team, pending dedup ve 5 dakika module cache mevcut. Landing/Auth/profile runtime catalogue request başlatmıyor; protected board yalnızca validation sonrası yüklüyor.

**L-03 (LOW):** `src/backend-entry.js:34–48` dış `catalogueReady` promise'ını failure sonrasında da tutuyor. İlk fetch transient başarısızsa aynı sayfada tekrar `loadCatalogue()` yeni deneme başlatmıyor; fallback uyarısı ve eski snapshot reload'a kadar kalıyor. Güvenlik ihlali değil, dayanıklılık/UX eksiği. Audit'te değiştirilmedi.

## Public Sharing

Yeni link `location.origin + '/?lineup=' + UUID`; eski `/lineup/<UUID>` destekleniyor. Query öncelikli; duplicate/invalid/lowercase-v4 dışı id erken reddedilir, legacy fallback'e kaçmaz. DB tablosuna browser SELECT/INSERT açılmıyor; direct apikey fetch ile Edge `GET?id=...`/POST kullanılır, main Auth Authorization header'ı eklenmez.

Public route uygulamanın Auth controller initialization/guard/profile bootstrap/user draft scope'unu çağırmaz; signed-in/out durumunda aynı shared UUID v1 key kullanılır. Public snapshot immutable, yerel düzenlemeler shared draft'ta kalır.

**I-03 (INFO, kaynak ayrımı):** Bu, SDK'nın hiç oluşturulmadığı anlamına gelmiyor. Eager import edilen ana Supabase client'ın SDK constructor'ı kendi restore initialization'ını başlatır. Kurulu SDK ile boş mock storage probe'unda controller initialize çağrılmadan 3 SDK storage read, 0 network request görüldü. Persist edilmiş/expired session için refresh yan etkisi olabileceği için “shared sayfa hiçbir Auth/storage faaliyeti yapmaz” garantisi verilemez. Mevcut route testleri controller/guard ayrımını kanıtlıyor; SDK yokluğunu değil.

Valid shared viewer ayrıca `dist/app.js:262` üzerinden catalogue yükleyip sonra snapshot'ı okur. Aynı editable board takım/roster seçimlerini kullandığından bu işlevsel bir bağımlılıktır; yalnızca snapshot göstermenin zorunlu verisi değildir. İlk snapshot gösterimi bu beklemeyle gecikebilir. Invalid share catalogue yüklemez. Landing index de shared viewer ile aynı HTML'de bulunduğu için statik `rosters.js`/`app.js` yükler; runtime katalog REST isteği olmaması asset yüklenmediği anlamına gelmez.

Canlı paylaşımın başarılı çalıştığı iddia edilmiyor: B-01 origin drift ve B-02 hosting erişimi engel. Gerçek paylaşım oluşturulmadı; production shared draft/browser E2E yapılmadı.

## Edge Function

Source: `index.ts`, `origins.js`, `handler.js`, `turnstile.js`, ortak `validation.js`.

- Source default origin `https://taktikstudyo.com`; env override comma-separated exact HTTPS origins olarak parse edilir. Wildcard/credentials/path/query/fragment reddedilir; CORS `*` yok.
- Hosted function `verify_jwt:false`: anonymous share sözleşmesinin bilinçli parçası. Origin + public apikey Auth kimliği değildir; write koruması Turnstile, validation ve DB quota ile sağlanır.
- Secret key yalnızca Edge'de. Browser private RPC çağırmaz. `create_shared_lineup` EXECUTE yalnızca service_role.
- Turnstile secret yoksa fail-closed; Siteverify success, action `share_lineup` ve izinli hostname gerekir. Site key browser-safe. Runtime secret/widget hostname değerleri okunmadı.
- Edge request body streaming sınırı **131072 byte / 128 KiB**. SQL RPC/snapshot JSON text sınırı **262144 byte / 256 KiB**; HTTP sınırının aynısı olduğu iddia edilmemeli.
- DB quota: client **5/10 dakika**, global **100/10 dakika**, **1000/gün**. Fixed windows, transaction advisory lock ve atomik quota+insert. Browser'ın kendi başına bu RPC'yi çağırma hakkı yok.
- IP, Edge içinde günlük salt'lı SHA-256 bucket üretiminde kullanılır; app DB snapshot/rate table'ına ham IP yazılmaz. Hosting/Supabase/Cloudflare altyapı loglarının IP tutmadığı iddia edilmez. Forwarded-IP trust tek başına güvenlik garantisi değil; global quota ayrıca var.

### B-01 — Production Edge origin drift (BLOCKER)

Read-only deployed source: `lineups`, ACTIVE, **version 4**, `verify_jwt:false`.

Deployed `index.ts` hâlâ `liveOrigin='https://taktik-studyo.unql9enes.chatgpt.site'` ve `.filter(v=>v===liveOrigin)` kullanıyor. Dolayısıyla `ALLOWED_ORIGINS=https://taktikstudyo.com` verilmesi yeni domaini kabul ettiremez. Yeni `origins.js` deployed dosyalarda yok.

CRLF/LF normalize edilerek `handler.js`, `turnstile.js`, `src/lib/validation.js` deployed/source eşit bulundu; farklı dosya `index.ts` ve eksik `origins.js`.

Read-only OPTIONS kontrolü: yeni domain **403**, Access-Control-Allow-Origin yok. Eski domain probe'u da 403 döndü; env'nin gerçek değeri çıkarılamaz ve eski domainin hâlâ çalıştığı varsayılmadı. `X-Sharing-Ready` alınamadığı için secret readiness teyit edilemedi. Kaynak farkı yeni domain başarısızlığını açıklamak için yeterli; production env değeri tahmin edilmedi.

Çözüm ayrı açık onayla gözden geçirilmiş Edge source deployment'ı ve ilgili origin/widget yapılandırmasının kontrolünü gerektirir. Bu denetimde deploy/config değişikliği yapılmadı.

## Database / RLS / Grants

Production SELECT-only pg_catalog/information_schema, `pg_policies`, `has_table_privilege`, `has_column_privilege`, `has_function_privilege`, constraint/index/trigger tanımları incelendi. Kullanıcı profili/email/token satırları okunmadı. Denied-write testleri production'a gönderilmedi.

| Migration source | Amaç / etki | Production kaydı ve durum |
| --- | --- | --- |
| `20260913062133_football_backend.sql` | teams/players/shared_lineups, private share_limits; validation/timestamp/RPC; bütün tablolarda RLS; anon catalogue SELECT, browser shared/private deny, service_role sınırlı grant | `20260913063249 football_backend`; kayıt SQL içeriği eşleşiyor, temel object/izinler mevcut; yeniden uygulanmamalı |
| `20260918142336_catalogue_authenticated_read.sql` | authenticated teams/players SELECT grant ve iki SELECT policy; anon/sharing değişmez | `20260920094922 catalogue_authenticated_read`; içerik eşleşiyor, effective izin/policy mevcut; tekrar apply gerekmiyor |
| `20260918142348_profiles_ownership.sql` | profiles FK/constraints/index/trigger; own SELECT/INSERT/UPDATE RLS ve column grants; avatar/timestamp/id mutation/DELETE kısıtları | `20260920102243 profiles_ownership`; içerik eşleşiyor, object/izin/policy mevcut; tekrar apply gerekmiyor |

Migration içerik karşılaştırmasında yalnızca SQL yorumları ve whitespace normalize edildi; kayıt statements içerikleri ile yerel dosyalar eşleşti. Timestamp kimliği farkı ayrıca DRIFT'tir, “aynı migration numarası applied” denmedi.

Effective production sınırları:

| Object | anon | authenticated | RLS |
| --- | --- | --- | --- |
| `public.teams` | SELECT only | SELECT only | İki rol için ayrı SELECT USING(true) |
| `public.players` | SELECT only | SELECT only | İki rol için ayrı SELECT USING(true) |
| `public.profiles` | Hiçbir table/column yetkisi yok | Aşağıdaki column grants; kendi row'u | SELECT/INSERT/UPDATE own `auth.uid()=id` |
| `public.shared_lineups` | Hiçbir browser table yetkisi yok | Hiçbir browser table yetkisi yok | Enabled, policy yok: intentional deny-by-default |
| `tactics_private.share_limits` | Schema usage/create ve table yetkisi yok | Schema usage/create ve table yetkisi yok | Enabled, policy yok: private server path |

Profiles column grants authenticated:

- SELECT: `id, username, display_name, created_at, updated_at`.
- INSERT: `id, username, display_name`.
- UPDATE: `username, display_name`.
- `avatar_url`: SELECT/INSERT/UPDATE yok. DELETE ve table-wide SELECT/INSERT/UPDATE yok; column grant'ler erişimi sağlar. Ownership id/timestamp overwrite grant'i yok.

Profiles UPDATE hem USING hem WITH CHECK own-id; DELETE policy yok. Case-insensitive unique `lower(username COLLATE "C")`, username 3–24 ASCII ve display btrim-length/control constraint'leri, `auth.users(id)` FK ON DELETE CASCADE, `profiles_updated` trigger production'da mevcut.

`create_shared_lineup` ve `valid_snapshot` anon/authenticated EXECUTE false, service_role true. `touch_updated_at` browser EXECUTE false. Üç function SECURITY INVOKER, `search_path=''`. Çağırma değil tanım/ACL okuması yapıldı; rate-limit RPC çalıştırılmadı.

## Production Drift

| Alan | Sonuç |
| --- | --- |
| İncelenen table/RLS/grant/constraint/RPC durumu | Kaynakla uyumlu; eksik profiles/catalogue migration bulgusu yok |
| Migration version kimlikleri | **DRIFT — M-02**: üçü de yerel dosya timestamp'inden farklı; içerikleri eşit |
| Edge `lineups` | **DRIFT — B-01**: eski origin filtresi; yeni parser deployed değil |
| Frontend deployed bytes / commit | **UNKNOWN**: asset GET'leri 401 HTML döndürdü; bunu JS içerik farkı saymak yanlış olur |
| Production Auth/email/SMTP secret config | Public auto-confirm kontrolü dışında **MANUAL VERIFICATION REQUIRED** |

**M-02 (MEDIUM):** Migration geçmişi numara farkı gelecekte kör `db push`/reapply ile duplicate object/policy hatalarına yol açabilir. Content eşitliği tek başına CLI history eşleşmesi değildir. Ayrı plan ve onay olmadan repair, rename, reapply veya otomatik sync yapılmamalı. Denetim tam cluster dump karşılaştırması değildir; kapsam uygulama object'leri/izinleri ve kayıt SQL içerikleridir.

## Environment / Secrets

| İsim | Kullanım / sınır |
| --- | --- |
| `SUPABASE_URL` | Public hosted API URL, build allowlist |
| `SUPABASE_PUBLISHABLE_KEY` | Public modern key, build allowlist; private key kabul edilmez |
| `TURNSTILE_SITE_KEY` | Public sharing widget site key, build allowlist |
| `AUTH_TURNSTILE_SITE_KEY` | Ayrı public Auth CAPTCHA config, build allowlist; `.env.example` içinde eksik |
| `ALLOWED_ORIGINS` | Edge runtime exact HTTPS origins; browser env değil |
| `LINEUPS_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEYS` | Edge'deki uygulama public apikey kontrolü |
| `LINEUPS_SECRET_KEY` / `SUPABASE_SECRET_KEYS` | Yalnızca Edge private credential; build'e alınmaz |
| `TURNSTILE_SECRET_KEY`, `LINEUPS_RATE_SALT` | Yalnızca Edge secret/config; salt yoksa Edge secret fallback |

Yerel `.env` yalnızca ilk üç public ismi içeriyor. Auth site key bu build ortamında tanımlı değil; sharing site key tanımlı. Değerleri yazdırılmadı/değiştirilmedi. `.gitignore`: node_modules, `.env`, `.env.*` (example hariç), Sites runtime ve Supabase temp/branches hariç tutuluyor.

**L-01 (LOW):** Build'in tanıdığı `AUTH_TURNSTILE_SITE_KEY`, `.env.example`'da yok; yeni kurulum sözleşmesi eksik. Widget henüz bağlı değil. Bu değişken ayarlanırsa login/signup/reset request `captcha_required` ile fail-closed olur. Hosted CAPTCHA açık ama widget/token yoksa Auth formları çalışamaz; Dashboard durumu bilinmiyor. Sharing Turnstile ayrı ve değişmedi.

Secret scan: 102 yerel text dosyası, bunların 18'i browser-delivered dist text dosyası; ayrıca 95 uygun metin dosyasında credential literal assignment kontrolü. `sb_secret_` gerçek key şekli, service-role/JWT, personal access token, Resend key, credential içeren DB URL ve private key marker için gerçek secret adayı **0**. `.env` değerleri sadece private tarama içinde değerlendirildi. SMTP/Turnstile/service-role secret assignment adayı **0**; bundle'da server secret identifier'ları da yok. 14 literal test token fixture değeri bundle'da **0** eşleşme.

Public URL/key/site key secret sayılmadı; SDK generic token alan isimleri ve testte runtime oluşturulan fake JWT gerçek sızıntı sayılmadı. İncelenen Auth/profile/error UI'da raw `innerHTML`, `insertAdjacentHTML`, raw SDK error.message veya token debug logging bulunmadı. Safe DOM/value/textContent ve controlled code→message kullanılıyor.

Bu statik/örüntü ve kaynak incelemesi kapsamlı bir secret leak garantisi değildir; Git geçmişi, provider secret store veya erişilemeyen canlı JS bytes taranmadı. npm'in 0 vulnerability sonucu da bütün supply-chain risklerinin yokluğu anlamına gelmez.

## SMTP / Resend

**MANUAL VERIFICATION REQUIRED** — mevcut connector Auth Dashboard/SMTP/template/Resend domain ayarlarını okumaya yönelik bir araç sağlamıyor. Production credential istenmedi veya yazdırılmadı; gerçek mail gönderilmedi.

| Kontrol | Beklenen / doğrulama durumu |
| --- | --- |
| Custom SMTP | Configured; UNKNOWN |
| Provider | Resend; UNKNOWN |
| Sender domain | `taktikstudyo.com`; gerçek sender/from değeri UNKNOWN |
| Domain verification | Resend'de verified; UNKNOWN |
| SPF / DKIM / DMARC | Sender alanıyla uyumlu yayınlı kayıtlar; bu audit'te DNS doğrulaması yapılmadı |
| Confirmation template | `.RedirectTo` + `?token_hash={{ .TokenHash }}&type=email`; UNKNOWN |
| Recovery template | `.RedirectTo` + `?token_hash={{ .TokenHash }}&type=recovery`; UNKNOWN |
| Tracking | Auth linkini rewrite eden click tracking kapalı olmalı; UNKNOWN |
| Delivery/limits | Gerçek teslim, spam sınıflaması, SMTP ve Auth rate-limit uyumu; NOT RUN |

HTML template'te `&amp;type=...` kullanılabilir; browser'a ulaşan URL iki exact query parametresi olmalıdır. Varsayılan confirmation endpoint tokenı önceden tüketen link, mevcut explicit-click callback sözleşmesinin yerine geçmez. [Supabase template değişkenleri](https://supabase.com/docs/guides/auth/auth-email-templates).

Güncel changelog kontrol edildi: yeni Free projelerde default email provider ile template customization 3 Haziran 2026 sonrası kısıtlı; custom SMTP/uygun plan bağımlılığı gerçek projede doğrulanmalı. Projenin planı veya SMTP durumu tahmin edilmedi. [Resmî değişiklik](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Routes

Yerel `scripts/serve-local.cjs` geçici port 4187 ile yalnızca HTTP GET seviyesinde çalıştırıldı; process kapatıldı. Bu port sadece static serving probe'u; Auth callback allowlist'i **4173** olarak kalır. Sayfa scriptleri execute edilmedi, production Auth'a gidilmedi.

| Route | Local GET / çözümleme | Production oturumsuz GET |
| --- | --- | --- |
| `/` | 200, landing HTML | 401 |
| `/?lineup=<UUID>` | 200, index; source parser shared seçer | Query özel live GET yapılmadı; root 401, shared erişim doğrulanmadı |
| `/lineup/<UUID>` | 200, index rewrite | 401 |
| `/giris.html` | 200, login | 401 |
| `/kayit.html` | 200, registration | 401 |
| `/auth-callback.html` | 200, explicit confirmation | 401 |
| `/sifremi-unuttum.html` | 200, reset request | 401 |
| `/sifre-yenile.html` | 200, explicit recovery | 401 |
| `/studyo.html` | 200, hidden protected shell, landing değil | 401 |
| `/karsilastirma.html` | 200, hidden protected shell, landing değil | 401 |
| `/profil.html` | 200, hidden protected shell, landing değil | 401 |

`dist/_redirects` yalnızca `/lineup/* /index.html 200`; tüm route'ları landing'e gönderen wildcard yok. Production provider'ın rewrite kuralını gerçekten uyguladığı doğrulanamadı.

**B-02 (BLOCKER):** Production root HTML title `Sign in required`, HTTP 401; diğer sayfalar ve `/backend.js`, `/app.js`, `/comparison.js` da 401 HTML. Hosting erişim kapısı public kullanım önünde. Kullanıcının zaten yetkili browser'ında sayfanın açılması anonymous/cross-device erişimi kanıtlamaz. Public release için erişim politikası ayrıca kararlaştırılıp onayla düzeltilmeli; burada audience/publish değiştirilmedi.

## Manual E2E Checklist

Hepsi **NOT RUN — MANUAL VERIFICATION REQUIRED**. Önce ayrı staging/izinli test ortamı tercih edilmeli. Aşağıdaki Auth/DB yazma etkisi olan senaryolar production'da ayrıca açık onay olmadan çalıştırılmamalı; gerçek email/token ekran görüntüsü veya log'a konmamalı.

| Senaryo | Beklenen | Production yan etkisi / onay |
| --- | --- | --- |
| A. Yeni signup | Valid email/username/12+ password → confirmation_pending → sabit login mesajı | Auth user oluşturur, email gönderir: onay gerekir |
| B. Unconfirmed login | Protected content/profile/catalogue/draft açılmaz; kontrollü mesaj | Auth giriş denemesi ve olası local cleanup: onay gerekir |
| C. Confirmation PC→telefon | Callback load tokenı temizler, verify yok; click sonrası same-id confirmed session ve studio | Token tüketimi, session ve olası profile insert: onay gerekir |
| D. Confirmed login/catalogue | Server validate; 18 takım roster erişimi, beklenmeyen fallback yok | Login/session; eksikse profile bootstrap: onay gerekir |
| E. Profile edit | Username/display normalization; duplicate username kontrollü; email/avatar değiştirilemez | profiles INSERT/UPDATE: onay gerekir |
| F. Studio save→logout→login | Aynı kullanıcının konum/formasyon/drawing taslağı geri gelir | Draft local; login/logout server etkisi: onay gerekir |
| G. İkinci kullanıcı | A board/DOM/writer temiz; B yalnızca kendi taslağını görür; A'ya dönünce A taslağı durur | İki Auth session: onay gerekir. M-01 için geciken login/profile yanıtı ayrıca denenmeli |
| H. Comparison | Sol/sağ takım/formasyon/drawing bağımsız; reload aynı kullanıcı için restore | Draft local; authenticated setup gerekebilir |
| I. Public share | Turnstile; tek submit; yeni query URL; gizli pencerede login olmadan görüntüleme | Share POST snapshot/quota yazar: onay gerekir; mevcut onaylı share GET salt okunur |
| J. Legacy URL | Aynı UUID snapshot; query öncelikli; invalid query legacy'ye kaçmaz | Mevcut izinli UUID ile GET; yeni share oluşturma yok |
| K. Password recovery | Generic request; telefonda no auto verify; submit verify→update→local signout; protected erişim yok | Email, password/token/session mutation: onay gerekir |
| L. Logout / BFCache / network | Content hemen kapanır; taslaklar durur; geri dönüş validate; transient retry logout yapmaz | Logout/Auth session mutation: onay gerekir |

Ek güvenlik adımları: malformed/duplicate callback token ile token tüketilmemesi; double submit; account A→B ve A→B→A sırasında stale load/save/redirect; server invalid session cleanup error; recovery update/cleanup error; mobile focus/keyboard/accessibility. Hata enjeksiyonlarını mock/staging üzerinde yap; gerçek mail tokenlarını tekrar kullanılabilir varsayma.

## Supabase Advisors

Read-only security ve performance advisor çağrıları tamamlandı. Security: 2 lint türü / 3 bulgu; performance: 1 lint türü / 1 bulgu. Otomatik düzeltme yok.

| Bulgu | Provider seviyesi | Audit sınıfı / gerekçe |
| --- | --- | --- |
| `rls_enabled_no_policy`: `public.shared_lineups` | INFO | **I-01 INFO — intentional design**. Browser grants yok; policy-free RLS deny-by-default. Permissive policy eklenmemeli |
| `rls_enabled_no_policy`: `tactics_private.share_limits` | INFO | Aynı **I-01** altında ikinci object; private schema usage/browser grants yok, server RPC yolu |
| `auth_leaked_password_protection` disabled | WARN | **M-03 MEDIUM — gerçek hardening eksiği**. Bilinen sızmış parolalar için ek engel kapalı; tek başına auth bypass değil |
| `unused_index`: `shared_lineups_expires_idx` | INFO | **I-02 INFO — performance-only**. Advisor kullanım görmemiş; correctness açığı değil. Gelecekte expiry/cleanup kullanımını incelemeden index silinmemeli |

Remediation: [Policy-free RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [sızmış parola koruması](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [unused index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Parola korumasının plan kullanılabilirliği ayrıca doğrulanmalı; [güncel doküman](https://supabase.com/docs/guides/auth/password-security) Pro ve üzerini belirtiyor.

## Deployment Path

**B-03 — BLOCKER / operational unknown: DEPLOYMENT PATH NOT VERIFIED.**

`.openai/hosting.json` bir mevcut Sites project id ve static directory `dist` gösteriyor. `package.json` yalnızca test/build komutlarına sahip; repository'de izlenen CI deployment workflow'u yok. README yerel build'in live Site'ı otomatik güncellemediğini açıkça söylüyor. Git push'un deploy olduğu varsayılmadı.

Bu metadata hangi onaylı yayın aracı/hesabı/branch'inin hangi artefact'ı `taktikstudyo.com` adresine taşıdığını ve rollback/versiyon doğrulamasını kanıtlamıyor. Ayrıca dış asset GET'leri erişim kapısında kalıyor. Release'in kullanılabilirliği bu yola bağlı olduğundan blocker; yayınlamanın teknik olarak imkânsız olduğu iddia edilmiyor.

### Documentation consistency — L-02 (LOW)

- `AUTH_ROUTES.md:18` profile için “no profile data queries/editing” diyor; gerçek Faz 7 profile UI load/save yapıyor.
- `AUTH_ROUTES.md:107` sonrasında confirmation için automatic studio navigation olmadığı yazıyor; güncel callback başarıda `/studyo.html` replace yapıyor, registration fixed pending-login'e gidiyor.
- `AUTH_FOUNDATION.md:23,79` ve `DRAFT_ISOLATION.md` girişi protected route wiring'i hâlâ gelecekte gösteriyor; current source'ta var.
- Tarihsel “bu faz production migration uygulamaz” notları geçmiş iş kapsamı olarak anlaşılır; güncel deployment runbook yerine kullanılmamalı. Bu audit üç migration'ın canlıda eş içerikle bulunduğunu doğruladı.
- `README_LOCAL.md` yalnızca ilk migration'ın version drift'ini anlatıyor; artık üçü farklı. `docs/DOSYA_ENVANTERI.md` eski teslim dosya sayısını taşıyor.
- `supabase/config.toml` hâlâ local `[auth] enabled=false`; bu production Auth durumunu temsil etmez ve local Supabase Auth E2E için hazır config olarak sunulmamalı. Değiştirilmedi.

Bu doküman/config notları tek LOW dokümantasyon tutarlılığı bulgusu altında sayıldı. Eski belgeler düzeltilmedi; rapor yeni güncel kanıtı sunuyor.

## Release Blockers

| ID | Seviye | Bulgu | Kapatma kanıtı |
| --- | --- | --- | --- |
| B-01 | BLOCKER | Deployed Edge eski domain filtresinde | Ayrı onaylı deployment sonrası deployed source eşliği, yeni origin OPTIONS ve onaylı sharing E2E |
| B-02 | BLOCKER | Public site/Auth sayfaları oturumsuz erişimde 401 | Onaylı audience/hosting kararı sonrası anonymous sayfa/asset GET ve cross-device callback erişimi |
| B-03 | BLOCKER | Deployment path doğrulanmadı | Yayın sahibi/araç/artefact/versiyon/rollback prosedürü ve live artefact kanıtı |
| M-01 | MEDIUM | Geciken login completion hesap değişiminde yönlendiriyor | Identity/generation pin ve login-profile await race regression |
| M-02 | MEDIUM | Üç migration version ID farklı | Ayrı onaylı migration-history uzlaştırma planı; tekrar DDL uygulanmaması |
| M-03 | MEDIUM | Leaked password protection disabled | Plan/config değerlendirmesi ve ayrı onaylı karar/verification |
| L-01 | LOW | Auth public CAPTCHA env example eksik | Doğru env contract dokümantasyonu; widget durumunun açık tutulması |
| L-02 | LOW | Faz dokümanları/local Auth config tarihsel | Onaylı doküman/runbook güncellemesi |
| L-03 | LOW | Katalog failure promise aynı sayfada kalıcı | Kontrollü retry davranışı kararı ve failure→success testi |
| I-01 | INFO | İki intentional policy-free RLS advisory | Güvenli deny modelini koru; policy ekleme |
| I-02 | INFO | Unused expiry index | Kullanım/retention incele; otomatik silme |
| I-03 | INFO | Public route ayrımı SDK/asset yokluğu değil | Mevcut sınırı doğru belgele; strict lazy/no-Auth şartı istenirse ayrı kapsam |

Doğrulanmış auth bypass, cross-user DB read/write veya gerçek secret leak bulgusu yok. Bu ifade henüz çalıştırılmamış production/browser E2E'nin başarılı olduğu anlamına gelmez.

## Manual Verification Required

| Konu | Durum / gerekli kanıt |
| --- | --- |
| Email confirmation enabled | **Doğrulandı:** public settings `mailer_autoconfirm:false`; tarihsel hesap email-click kanıtı incelenmedi |
| Production Site URL | `https://taktikstudyo.com` olmalı; UNKNOWN |
| Confirmation redirect | Exact `https://taktikstudyo.com/auth-callback.html`; UNKNOWN |
| Recovery redirect | Exact `https://taktikstudyo.com/sifre-yenile.html`; UNKNOWN |
| Development redirects | Gerekliyse exact `http://localhost:4173/auth-callback.html` ve `/sifre-yenile.html`; hosted list UNKNOWN, wildcard varsayma |
| Email templates | TokenHash + uygun type + RedirectTo, GET'te tüketmeyen sözleşme; UNKNOWN |
| SMTP/Resend/DNS/tracking | Yukarıdaki checklist; UNKNOWN |
| Auth CAPTCHA Dashboard | UNKNOWN; mevcut Auth widget bağlı değil, env ayarlanırsa fail-closed |
| Sharing Turnstile hostname/secret readiness | Runtime değerleri okunmadı; origin 403 nedeniyle readiness header yok; UNKNOWN |
| Hosting public access / published frontend version | B-02/B-03; UNKNOWN release mapping |
| Gerçek browser E2E | A–L, özellikle cross-device, account race ve recovery; NOT RUN |

Hiçbir credential/gerçek token paylaşımı istenmiyor. Gerekli kanıt ayarların secretsiz durumları, onaylı release metadata'sı ve kontrollü E2E sonuçlarıdır.

## Recommended Next Actions

1. Önce B-01/B-02/B-03 için ayrı, kapsamı açık yayın/erişim planını onaylat: Edge source+origin, hosting audience ve frontend release yolu. Production'a otomatik eşitleme yapma.
2. Ayrı yerel değişiklik onayıyla M-01 login boundary düzeltmesini ve regression testini hazırla; test/build tekrar çalıştır. Callback/recovery, RLS/grants veya draft modelini değiştirme.
3. Migration history ID farklarını ayrı değerlendirme/onarım planıyla yönet; içerik eşit olduğundan mevcut migration'ları körlemesine yeniden apply etme.
4. Site URL, redirect/template, SMTP/Resend ve CAPTCHA checklist'ini secretsiz read-only incelemeyle kapat; sızmış parola korumasını plan/ayar bakımından değerlendir. Yapılacak her production değişikliği ayrıca açık onay gerektirir.
5. LOW doküman/env/retry bulguları için ayrı küçük değişiklikleri gözden geçir. Intentional RLS advisory'lerine permissive policy veya browser grant ekleme.
6. Engeller kapandıktan sonra izinli ortamda A–L manuel E2E'yi çalıştır, deployed artefact eşliğini tekrar denetle ve readiness kararını yenile.

Son durum: **NOT READY — BLOCKERS FOUND**. Commit yok; production mutation yok; düzeltmeler uygulanmadı.
