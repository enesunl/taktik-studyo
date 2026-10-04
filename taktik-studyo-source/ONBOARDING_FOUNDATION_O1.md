# O1 — Onboarding ve favori takım temeli

O1 yalnızca veri/servis/routing temelidir. Görsel onboarding, takım seçici, profil
renkleri veya maç/stüdyo sıralaması yoktur. Production'a uygulanmadı.

## Mevcut mimari ve korunan sözleşme

Auth controller kullanıcıyı sunucuda getUser ile doğrular; recovery oturumu normal
signed_in değildir. Signup/e-posta verify sonrasında mevcut profile-bootstrap
kendi profiline SELECT/INSERT yapar, username metadata'sını yalnızca seed olarak
kullanır. Callback token temizleme, explicit verify, PKCE'siz email akışı, recovery
izolasyonu ve auth generation pinning değişmedi.

Profiles: id (auth.users FK / ON DELETE CASCADE), username, display_name,
avatar_url (istemciye kapalı), created_at, updated_at. Mevcut own-row
SELECT/INSERT/UPDATE policy'leri korunur; anon erişimi ve DELETE izni yoktur.

P1 profile-api load/save hâlâ yalnızca
`id,username,display_name,created_at,updated_at` okur. Normal save sadece
username/display_name yazar. profile-ui ve mevcut profil HTML/CSS değişmedi.
Hero ad/username/email sırası, tek email, edit/save/cancel, istatistikler, son
çalışmalar, Weekly XI, navbar teması ve logout regresyon testleri korunur.

Profile client aynı kalır: canonical katalog geliştirme modu açık olsa bile
profiller yerel katalog DB'sine yönlendirilmez. Projelerin mevcut dataClient
seçimi de değişmedi. Auth/bootstrap P1 kolon listesi O1'e bağımlı değildir.

## Migration

`supabase/migrations/20261004234326_profile_onboarding_foundation.sql`
CLI tarafından oluşturuldu (filename UTC). Bağımlılıklar: profiles_ownership ve
catalogue_identity_foundation. Yeni kolonlar:

- favorite_team_slug TEXT NULL (varsayılan NULL)
- onboarding_completed_at TIMESTAMPTZ NULL (varsayılan NULL)
- onboarding_version INTEGER NOT NULL DEFAULT 0

Tek transaction'da ALTER'ın aldığı tablo kilidi korunur. Mevcut profil satırları
explicit UPDATE ile migration transaction zamanında v1 tamamlanmış yapılır.
Backfill sırasında yalnızca profiles_updated trigger'ı geçici durdurulur ve aynı
transaction'da tekrar açılır; eski created_at/updated_at, username/display_name
korunur. Sonraki INSERT'ler NULL/0/NULL ile başlar. Varsayılanı completed yapma
ve tekrar çalışan otomatik backfill yoktur. Migration tek uygulamalıdır; tekrar
çalıştırılmaz, migration history ile takip edilir. Kullanıcı adı bootstrap
profilini hiç oluşturmamış eski Auth hesapları bu profil-satırı backfill'inin
kapsamında değildir; bu davranış mevcut profiles satırları şartına uygundur.

favorite_team_slug canonical catalogue_teams(id)'ye FK, ON DELETE SET NULL'dır.
Kimlik ürün slug'ıdır (galatasaray, fenerbahce vb.); provider mapping tabloları
ayrıdır. 18 takım listesini gömen CHECK yoktur. Yalnızca slug format CHECK'i ve
v0/NULL veya v1/timestamp tutarlılık CHECK'i vardır. O2/O3 veya v2 politikası yok.

Yeni kolonlara authenticated SELECT; yalnız favorite_team_slug ve
onboarding_version kolonlarına UPDATE verilir. Yeni INSERT grant yoktur,
onboarding_completed_at doğrudan client tarafından yazılamaz. SECURITY INVOKER,
search_path='' kullanan private trigger aktif canonical üyeliğini kontrol eder,
normalizasyon yapar ve 0→1 geçişinde timestamp üretir. Sürüm düşürmek yasaktır.
Tekrarlanan completion timestamp'i değiştirmez. Trigger'ın PUBLIC/anon/
authenticated EXECUTE yetkileri kapalıdır; mevcut RLS policy'leri değişmez.

Önceden seçilmiş takım sezon değişiminde pasifleşirse kayıt silinmez; kullanıcı
tercihi değiştirebilir/temizleyebilir. Yeni non-null seçim için aktif üyelik
zorunludur. Preference güncellemek onboarding tamamlanma zamanını sıfırlamaz.

## Servis

`CURRENT_ONBOARDING_VERSION = 1` ve `needsOnboarding(profile)` onboarding.js'tedir.
Eksik profil, NULL completion veya current sürümden eski sürüm onboarding ister.
Geçersiz/erişilemeyen response servis tarafından hata kabul edilir; completed
olarak uydurulmaz.

Mevcut `createProfileApi` şu dar metotları sunar (profile-preferences modülü):

- loadPreferences(): sadece id + üç O1 kolonu; normalized projection.
- completeOnboarding({favoriteTeamSlug = null}): null ile skip veya aktif takım
  seçimi; sadece favorite_team_slug ve CURRENT_ONBOARDING_VERSION yazar.
- setFavoriteTeam(slug): yalnız favorite_team_slug değişir.
- clearFavoriteTeam(): aynı kolon NULL olur; completion değişmez.

Her işlem validated owner/generation'a bağlıdır; her await sonrası current
kontrol edilir. Başka id parametresi alınmaz. Raw SDK response/error/session
UI'ya çıkmaz. Eksik profil completion ile oluşturulmaz: mevcut bootstrap veya
P1 profile save ile önce normal profil oluşturulmalıdır.

Slug trim/lowercase normalize edilir; kontroller, provider ID biçimleri ve
geçersiz format reddedilir. `createCanonicalCatalogue.hasActiveTeam` sadece
catalogue_teams.id ve catalogue_active sorgular. Oyuncu veya provider verisi
çekilmez. Browser kontrolü tek başına güvenlik değildir: migration'ın DB trigger
kontrolü, FK ve ownership RLS doğrudan API isteklerini de sınırlar.

## Şema uyumu ve routing

O1 kolonları ayrı loadPreferences çağrısındadır. Eksik kolon/tablo/schema-cache
hatası controlled onboarding_unavailable döner. O1 write kapalı kalır; P1 profil
load/save etkilenmez. Diğer read/network/format hatalarında da onboarding UX
ertelenir; normal Auth/getUser guard ve RLS çalışmaya devam eder. Bu karar
kullanıcıyı tamamlanmış saymaz veya DB'ye herhangi bir şey yazmaz. Sonraki
korumalı girişte tekrar okunur. Onboarding bir authorization sınırı değildir.

createProtectedPage içindeki beforeMount hook'u server user doğrulamasından
sonra, draft scope / içerik mount edilmeden önce çalışır. startPage yalnız
protected route için O1 okumasını bağlar. Final current kontrolü stale A
sonucunun B için mount/navigation üretmesini ve logout yarışını engeller.

Kesin incomplete sonuç: `/hos-geldin?next=<allowlisted .html path>`.
`/hos-geldin` ve `/hos-geldin.html` aynı protected sayfadır. Bu sayfa kendi
kendine yönlenmez; mevcut logout çalışır. Callback, recovery, login, landing ve
public sharing interception kapsamına girmez. Fiziksel sayfa yalnız development
placeholder'dır; skip/complete UI'si O2'de bağlanacaktır.

`onboardingDestination(search)` mevcut exact safeInternalRedirect allowlist'ini
kullanır. Duplicate next, external URL, query/hash trick ve onboarding'e geri
next reddedilir; fallback /studyo.html. Basit protected destination korunur;
match/project gibi query context restore mevcut whitelist'te desteklenmediği
için O2'ye bırakılmıştır. Login/callback yönlendirmeleri yeniden yazılmadı;
normal hedef sayfaya ulaştıktan sonra onboarding guard devreye girer.

## Yerel doğrulama ve rollout sınırı

Migration yalnızca tests/onboarding-database.test.mjs içinde in-memory PGlite'a
uygulanır. auth.users/auth.uid() minimal SQL test fixture'larıdır, gerçek Auth
sunucusu değildir. Profile API test adaptörü JSON/HTTP timestamp biçimini ve
aynı SQL role/ownership sınırlarını kullanır. Mevcut local catalogue DB loader'a
profiles migration eklenmedi; çalışan hosted profillerin kaynağı değiştirilmedi.

Normal localhost kurulumu hâlâ eski hosted şemayı kullanıyorsa O1 durumu
unavailable olur ve P1/app açılır. Bu görev production veya persistent local
veritabanına migration uygulamaz. O1'i migration uygulanmış bir geliştirme
ortamında açan yeni kullanıcı korunan placeholder'a ulaşır; O2 completion UI'si
olmadan production rollout yapılmamalıdır.

Test kapsamı: migration öncesi/sonrası kullanıcı, v1 backfill, null skip, takım
set/change/clear, geçersiz/pasif/provider kimlik, own-row/anon erişimi, timestamp
yazma ve version downgrade yasağı; ad güncellemesinin bağımsızlığı; schema
fallback; safe next/self-loop; tamamlanmış kullanıcının P1'e girişi; stale
hesap/logout sonuçları; alias HTTP testi ve P1/Auth/board regresyonları.

Kaynak kontrolü: Supabase güncel [RLS dokümantasyonu](https://supabase.com/docs/guides/database/postgres/row-level-security)
ve [changelog](https://supabase.com/changelog). Yeni SDK/API veya dependency yok.

Production mutation/migration apply, Auth setting, Edge deploy, commit, push
ve site deploy yapılmadı.


## Sonuç ve tam dosya listesi

- npm test: 566/566 test başarılı; 9 board regression grubu başarılı.
- O1: 6 servis testi, 6 route testi, 6 SQL alt testi + database suite.
- npm run build: başarılı; dist/backend.js yalnızca build ile üretildi.
- git diff --check: başarılı; generated bundle için CRLF dönüşüm uyarısı dışında hata yok.
- Manuel tarayıcı görsel kontrolü yapılmadı; onboarding UI bu fazın kapsamında değil.

Eklenenler:
- ONBOARDING_FOUNDATION_O1.md
- dist/hos-geldin.html
- src/lib/onboarding.js
- src/lib/profile-preferences.js
- supabase/migrations/20261004234326_profile_onboarding_foundation.sql
- tests/onboarding-database.test.mjs
- tests/onboarding-routes.test.mjs
- tests/onboarding-service.test.mjs

Güncellenenler:
- dist/_redirects
- dist/backend.js (generated)
- scripts/serve-local.cjs
- src/lib/auth-redirects.js
- src/lib/catalogue-canonical.js
- src/lib/page-bootstrap.js
- src/lib/page-routes.js
- src/lib/profile-api.js
- src/lib/protected-page.js
- tests/auth-routes.test.mjs
- tests/local-static-server.test.mjs
- tests/profile-ui.test.mjs
- tests/theme-workspace.test.mjs
