# M5 — Çalışmalarım ve Studio kayıtları

**23 Eylül 2026 güncellemesi:** Aşağıdaki hazırlık/inceleme notları tarihsel kayıttır.
Sonraki ayrı kullanıcı onayıyla history hizalandı ve yalnızca M5 migration'ı
production'a uygulandı. Güncel doğrulama ve smoke test durumu:
[`STUDIO_PROJECTS_M5_RELEASE.md`](STUDIO_PROJECTS_M5_RELEASE.md).

Yerel uygulama değişikliği. Production migration, DB/Auth ayarı, Edge deploy, site publish, commit veya push yapılmadı. BSD production lisans engeli değişmedi. Bu özellik production'a kendiliğinden açılmış değildir.

## Veri tabanı ve yetki sınırı

Migration: `supabase/migrations/20260923135716_studio_projects.sql`.

`public.studio_projects`: UUID `id`, `auth.users(id)` referanslı `user_id` (ON DELETE CASCADE), `title`, `studio_mode`, nullable `match_id`/`match_week`, `snapshot_version`, JSONB `snapshot`, bigint `revision`, `created_at`, `updated_at`.

- Başlık trim edilmiş 1–120 karakter; kontrol karakterleri yasak.
- Snapshot sürümü 1. DB nesne/üst alan tiplerini, 22 yerleşim ve 200 çizim sınırını denetler; tam geometrik/içerik doğrulama istemci normalizer'ındadır.
- İstemci JSON UTF-8 sınırı **3 MiB**, DB `octet_length(snapshot::text)` sınırı **4 MiB**. JSONB metnindeki boşluk payı nedeniyle sınırlar farklıdır. 200 × 256 noktalı çizimler için alan bırakır; sınırsız JSON saklanamaz.
- Tek bileşik liste indeksi: `(user_id, updated_at DESC, id DESC)`.
- RLS SELECT/INSERT/UPDATE/DELETE policy'lerinin her biri yalnızca `authenticated` ve `(select auth.uid()) = user_id`. UPDATE hem USING hem WITH CHECK kullanır.
- PUBLIC/anon/authenticated varsayılan tablo grant'leri önce kaldırılır. `authenticated`: SELECT, DELETE; INSERT yalnızca `id,user_id,title,snapshot_version,snapshot`; UPDATE yalnızca `title,snapshot_version,snapshot`.
- Anon hiçbir erişim almaz. ID/owner/revision/timestamp/context alanlarına UPDATE grant verilmez.
- `tactics_private.studio_project_metadata()` **SECURITY INVOKER**, boş search_path ile BEFORE INSERT/UPDATE trigger'ıdır. Context snapshot'tan türetilir; INSERT revision=1, UPDATE revision=old+1; zamanlar DB tarafından yazılır. İstemci için EXECUTE/RPC açılmaz.
- Diğer tablolar, profiles/catalogue/shared_lineups grant/policy'leri ve Edge Function'lar değişmedi.

## Snapshot v1

`studio-project-snapshot.js` serializer ve normalizer için tek sözleşmedir:

```text
version: 1
source: { mode: free | match, matchId: string | null, week: number | null }
teams: { home: Team | null, away: Team | null }
Team: { teamId, name, color, color2, formation, lineupKind, players, bench }
Player: { key, playerId, name, number, position, goals }
source XI player: Player + { initialX, initialY }
working: [{ slotKey, personKey, x, y }]
drawings: [{ id, type, color, width, geometry }]
pitch: { color, width, height }
```

Oyuncu kimliği ad üzerinden kurulmaz; mevcut takım/taraf/oyuncu key'leri ve playerId korunur. Source XI ve çalışma yerleşimi ayrıdır. `working.personKey` o slotta bulunan oyuncuyu belirtir; kullanılmayan oyuncular yedektir. Böylece yedekten giren oyuncu yeniden açılışta sahada, çıkan oyuncu yedekte kalır. Normalized koordinatlar 0–1; board sınırında yüzde koordinata dönüşür. Float dönüşümleri görsel konumları değiştirmeyecek hassasiyette test edilir.

`lineupKind` confirmed/probable-provider/probable-recent-match/probable-local bilgisini korur. Yeni resmi kadro geldiğinde eski çalışma değiştirilmez. “Kaynak Dizilişe Dön”, snapshot'ın orijinal source XI/koordinatlarını kullanır; provider fetch yapmaz. Serbest stüdyoda seçilen takım değişince o tarafın yeni source XI'ı oluşturulur.

Altı çizim türü desteklenir: movement-arrow, pass-arrow, line, freehand, zone, circle. ID'ler benzersizdir; renk/kalınlık enum, koordinat ve obje sayısı doğrulanır. En çok 200 nesne, freehand başına 256 nokta. Yeniden açılışta çizimler korunur, undo/redo geçmişi boş başlar. Yeni çizim ID'leri yüklenmiş ID'lerle çakışmaz.

Renk ve boyutlar kayıttan açılan projede global tercihlerin önüne geçer. Sadece projeyi açmak global tercihi yazmaz; yüklü proje görünümü düzenlenirken de global varsayılanlar korunur. Yeni projelerde mevcut yerel tercihler başlangıç değeridir.

Kaydedilmeyenler: selection, pointer/drag preview, tool/color-toolbar seçimi, modal, sidebar, tema, undo/redo, DOM, Auth session/token, logo/fotoğraf, ham BSD cevabı, incident/statistics feed. Maç gol göstergeleri için yalnızca oyuncu gol sayısı saklanır; free mode gol sayısı sıfırdır.

Eksik/bozuk/sınır dışı/gelecek sürümlü snapshot güvenli hata ile açılmaz. Normalizer beyaz listedeki alanları yeni nesnelere kopyalar. Metinler `textContent`/input value ile render edilir.

## Rotalar ve API

- `/mac-studyosu`: yeni serbest çalışma; başlangıçta DB INSERT yok.
- `/mac-studyosu?id=215997&hafta=6`: maçtan başlangıç; sadece izlemek INSERT yapmaz.
- `/mac-studyosu?project=<UUID>`: kayıtlı çalışma; `project` parametresi `id`'den öncelikli. Bozuk veya tekrarlı UUID parametresi güvenli hata, free fallback yok.
- `/calismalarim` ve `/calismalarim.html`: mevcut protected guard ile korunur. Password recovery session kabul edilmez.
- Kaydedilmiş proje açılışında yalnızca Supabase proje sorgusu; **0 BSD çağrısı**, kadro yeniden oluşturulmaz. Yükleme sırasında boş Free Studio gösterilmez.
- Başarılı ilk kayıttan sonra URL `history.replaceState` ile project rotasına geçer.
- Var olmayan ve başka kullanıcıya ait UUID aynı unavailable deneyimini verir.

`studio-projects.js`, mevcut tek Auth-aware Supabase client'ını kullanır. API mount'u guard tarafından doğrulanan identity ve generation'a pinlenir; await sonrası current kontrolü yapılır. Query'lerde owner filtresi ve sunucuda RLS vardır. Account change sonrası stale sonuç UI/history/follow-up request üretemez; başlamış A sorgusu B kaydını değiştiremez.

API: listProjects, getProject, createProject, updateProject, renameProject, duplicateProject, deleteProject. Ham SDK hata/metaverileri UI'ya çıkarılmaz. Client UUID ilk create öncesinde atanır; tekrar deneme aynı UUID kullanır. Belirsiz INSERT cevabı sonrası unique conflict oluşursa yalnızca aynı sahibin aynı başlık/snapshot'ı başarı sayılır; upsert yapılmaz.

## Kayıt ve concurrency

- Autosave varsayılan **açık**, son anlamlı commit'ten **2000 ms** sonra çalışır. Kullanıcı tercihi `taktik:studio:autosave:<userId>:v1` anahtarında; snapshot'ın parçası değildir.
- Team seçimi, tamamlanan player move/swap/substitution, çizim commit/erase/undo/redo/clear, saha boyut/rengi, source reset ve başlık değişikliği dirty yapar.
- Oyuncu/tool seçimi, hover, scroll, sidebar/tema/modal açmak kayıt oluşturmaz. Pointermove'da serialization veya network yok. Slider değişiklikleri debounce edilir.
- `new → dirty → saving → saved`; uçuş sırasında yeni değişiklik latest snapshot olarak tutulur, başarıdan sonra tek takip kaydı planlanır. Paralel sınırsız save yok.
- Kaydet debounce'u atlar. Uçuş sırasında buton disabled; temiz mevcut kayıt tekrar yazılmaz. İlk manuel kayıt boş projeyi açık kullanıcı isteğiyle kaydedebilir.
- Autosave kapalıyken dirty görünür, otomatik write olmaz; manuel kayıt çalışır. Açıldığında dirty kayıt planlanır.
- Hata dirty state ve kurtarma kopyasını korur. “Kaydetme hatası / Tekrar Dene”; sonsuz otomatik retry yok.
- Revision CAS: UPDATE `id + user_id + expected revision` ile filtrelenir; trigger atomik olarak revision'ı artırır. Sıfır dönen satır conflict'tir. Rename da aynı revision modelini kullanır; snapshot değiştirmez. DELETE de revision ile filtrelenir.
- Conflict autosave'i durdurur. “Sunucudaki Sürümü Aç” veya “Kopya Olarak Kaydet”; kör overwrite yok. Kopya yeni UUID/revision1/zamanlar ile oluşturulur.

Kalıcı topbar statüleri: Henüz kaydedilmedi, Kaydedilmedi, Kaydediliyor…, Kaydedildi ✓, Kaydetme hatası ve conflict. Küçük ekranda ikincil seçenekler details menüsündedir. Switch aria-checked ve statü aria-live kullanır.

## Yerel kurtarma ve ayrılma

Her mount için user-scoped çalışma/tab anahtarı döndürülür: `taktik:studio:recovery:<userId>:<mount UUID>:v1`. O çalışma oturumu için yalnızca en son snapshot/başlık/id/expected revision tutulur. sessionStorage'da yalnızca son kurtarma key'inin UUID işaretçisi bulunur. Başka sekmelerin aktif kaydı üzerine yazılmaz; localStorage işlemleri atomik CAS değildir.

Snapshot, dirty commit ve save öncesinde yazılır. Başarılı durable save temizler; uçuş sırasında başka değişiklik varsa latest recovery korunur. Auth expiry/current invalidation'da UI guard temizlenir fakat kurtarma kopyası silinmez. Sonraki aynı-user açılışında açık “Yerel Çalışmayı Kurtar” / “Yoksay” seçimi vardır; otomatik import yapılmaz. Yoksay mevcut yeni düzenlemelerin kurtarma kopyasını silmez. Kurtarmada eski revision korunur: başka tab güncellemişse conflict olur.

Kurtarma verisi token/session içermez ve canonical store değildir. Eski (7 günden büyük), bozuk veya başka kullanıcıya ait kayıt yüklenmez. Mount'a özgü ayrı kayıtlar farklı işler/sekme oturumları için kalabilir; her biri en çok bir son snapshot içerir. Tarayıcı storage quota/engeli, sessionStorage kaybı, tarayıcının veriyi temizlemesi veya ilk commit öncesi crash için kurtarma garantisi yoktur. Storage yazımı başarısızsa save status bunu bildirir. Bu mekanizma cihazda özel çalışma metinleri tutar; aynı origin script erişimine karşı şifreli kasa değildir.

Dirty/in-flight kayıt için beforeunload uyarısı, tarayıcının izin verdiği ölçüde çalışır. Aynı origin anchor gezinmesinde branded native dialog vardır; iptal/focus return desteklenir. OS kapanışı, Auth yönlendirmesi ve browser crash için bu dialog garanti değildir; kurtarma kaydı bunun için tutulur.

## Çalışmalarım

Mevcut authenticated menüye Taktik Tahtası sonrasında Çalışmalarım eklendi; readonly public share menüsü değişmedi. Eski Taktik Tahtası/comparison draft mimarisi M5'e taşınmadı.

Liste `updated_at DESC, id DESC`, sayfa başına 20. Daha Fazla durumunu belirlemek için 21 metadata satırı sorgulanır; snapshot indirilmez. Snapshot sadece open/duplicate için okunur. Empty state ve Yeni Çalışma/İlk Çalışmanı Oluştur linkleri vardır. Kartlarda ad, Free/Match türü, zaman, Aç/Yeniden Adlandır/Kopyala/Sil bulunur. Thumbnail yok. Rename/delete native branded dialog kullanır; input label, focus containment/Escape, textContent vardır. CSS shared Light/Dark token'larını ve mobil sarılmayı kullanır.

## Dosya haritası

Yeni source:

- `src/lib/studio-project-snapshot.js`: veri sözleşmesi.
- `src/lib/studio-projects.js`: owner-scoped CRUD.
- `src/lib/studio-autosave.js`: autosave ve kurtarma.
- `src/lib/studio-save-ui.js`: topbar ve ayrılma uyarısı.
- `src/lib/studio-projects-ui.js`: liste ve işlemler.
- `src/lib/studio-dialog.js`: branded dialog.
- `dist/calismalarim.html`, `dist/studio-projects.css`: elle düzenlenen static giriş/stil.
- Yukarıdaki SQL migration ve bu doküman.

Değişen source: match-board, match-studio-ui, tactical-drawings, tactical-drawing-ui, pitch-preference, studio-preferences, studio-team-picker, page-bootstrap, page-routes, auth-redirects. Auth redirect değişikliği yalnızca exact `/calismalarim.html` allowlist girdisidir. Auth core/recovery/Edge/schema mevcut davranışları değiştirilmedi.

HTML menü değişiklikleri: index, studyo, karsilastirma, profil, maclar, mac, mac-studyosu. `dist/backend.js` yalnızca `npm run build` tarafından üretildi.

Yeni testler: studio-project-snapshot, studio-autosave, studio-projects, studio-projects-database, studio-projects-ui ve helpers/studio-project-fixture. Mevcut board fixture tarayıcı crypto/document event desteği, theme-workspace testinde 13. HTML girişi güncellendi.

## Doğrulama (23 Eylül 2026)

- `npm test`: **445/445 PASS**, 0 fail/skip; önceki 391 teste ek 54 test/subtest.
- Board regression: **9/9 grup PASS**; normal Studio, comparison, scoped draft, readonly sharing dahil.
- DB/RLS: gerçek SQL çalıştıran yerel PGlite içinde M5 testi + 5 subtest PASS; A/B/anon, spoof owner, column grants, revision CAS, timestamps, rename snapshot koruması, boyut/sürüm/title, cascade ve mevcut policy/grant'lerin değişmemesi test edildi. Auth user/uid test double'dır; hosted Supabase kullanılmadı.
- Docker Desktop engine erişilemedi (`dockerDesktopLinuxEngine` pipe yok). Bu nedenle gerçek local Supabase Auth/PostgREST stack'i başlatılıp login yapılmadı.
- Yerel Free Studio UI smoke PASS: gerçek board ve yerel roster ile iki takım, hareket, yedek, koşu oku/alan, renk/boyut, gerçek 2s autosave, yeniden açılış eşitliği. CRUD transport in-memory test double; gerçek hesap/login veya production request yok. Ayrı guard testi confirmed signed_in'i doğrular, signed_out/password_recovery'yi engeller.
- Yerel Match 215997 smoke PASS: mevcut normalize fixture ile viewing → 0 create; hareket/kayıt, project reopen → **0 ek BSD**. Başlangıç load fixture olduğundan canlı provider başarısı iddia edilmez. Free akışında toplam BSD çağrısı 0.
- Liste/open/rename/duplicate/delete, pagination, empty state, hata/retry/conflict, kurtarma, beforeunload/internal cancel, stale identity ve no-auto-create testleri PASS.
- Browser inventory `apps: [], browsers: []`: gerçek **1440/1024/390 görsel QA yapılmadı**. DOM etkileşimleri ve responsive/theme CSS sözleşmeleri otomatik doğrulandı; gerçek tarayıcı görsel kontrolü yerine geçmez.
- `npm run build`: PASS (`Backend adapter built: configured`).
- `git diff --check`: PASS.
- Browser dist secret taraması: 28 text asset, gerçek secret key/private key/credential DB URL/service-role JWT/yerel private env değeri/M5 test fixture marker adayı **0**. Public Supabase URL/publishable key/site key secret sayılmadı; değerler çıktıya yazılmadı.

## Production için uygulanmamış adımlar

Migration yalnızca yerelde oluşturuldu ve izole PGlite testinde yürütüldü. Production migration apply/db push, gerçek hesap oluşturma, Auth testi, Edge deploy, secrets/settings değişikliği, site deploy ve commit/push **yapılmadı**. Ayrı production onayı ve release süreci olmadan uygulanmamalı. Migration ve frontend release'i birlikte planlanmalı; migration yokken UI kontrollü kayıt/liste hatası gösterir. BSD production lisans engeli bu özelliğin tamamlanmasıyla kalkmaz.

## Localhost kayıt/404 takibi

`scripts/serve-local.cjs` içindeki exact protected alias listesine `/calismalarim` eklendi. `tests/local-static-server.test.mjs` gerçek yerel HTTP sunucusu başlatarak tüm protected alias'ları, `.html` eşlerini, query/HEAD davranışını ve 404/405 sınırlarını doğrular. Düzeltilmiş 4173 sunucusunda `/calismalarim` ve `/calismalarim.html` HTTP 200 ile doğru HTML'i döndürdü.

Localhost frontend'in bağlandığı hosted Supabase projesinde salt okunur metadata sorgusu `public.studio_projects = NULL`, M5 migration applied = false döndürdü. Bu nedenle kayıt hizmeti henüz çalışamaz. Eksik production migration bu hata incelemesinde uygulanmadı; ayrı açık onay gerekir.

Kayıt kontrolleri Serbest/Maç Stüdyosu başlığının sağındaki alana taşındı; ayrı tam genişlikteki alt kayıt satırı ve üst çizgisi kaldırıldı. Seçenekler açılan bir menüde, mobilde başlık ve kompakt kayıt grubu yan yana durur. Son salt okunur kontrolde de tablo/migration eksikliği devam etti; production mutation yapılmadı. Yerleşim değişikliğinden sonra 445 test ve 9 board regression grubu, build ve diff kontrolü geçti.

## INSERT / bench / migration history doğrulaması — 23 Eylül 2026

İki potansiyel blocker doğrulanmadı. Migration ve uygulama kodu bu incelemede değiştirilmedi; `tests/studio-projects-database.test.mjs` iki entegrasyon alt testiyle genişletildi. Migration SHA-256 değişmedi: `888308EABF31ED510C1EA2D314163CE4FFC43F864F0994F0183141F1A234BA28`.

### Gerçek INSERT sözleşmesi

`createProject()` normalize ettiği snapshot ve trim ettiği başlıkla tam olarak şu kolonları gönderir:

```js
{id, user_id: owner, title, snapshot_version: 1, snapshot}
```

`owner` doğrulanmış kullanıcıdır. Free snapshot source: `{mode:'free', matchId:null, week:null}`; match örneği: `{mode:'match', matchId:'215997', week:6}`. Match week sözleşmede nullable'dır.

`studio_projects_metadata` BEFORE INSERT/UPDATE trigger'ı `studio_mode`, `match_id`, `match_week` değerlerini sırasıyla `snapshot.source.mode`, `matchId`, `week` alanlarından türetir. BEFORE trigger NOT NULL/row constraint denetiminden önce çalışır; default bulunmaması INSERT'i bozmaz. İstemcinin doğrudan yazmadığı bu kolonlar için INSERT yetkisi gerekmez. `revision`, `created_at`, `updated_at` sunucuda belirlenir. Dolayısıyla beş kolonluk mevcut INSERT grant'i doğru ve yeterlidir; sekiz kolona genişletilmedi. [PostgreSQL trigger sırası](https://www.postgresql.org/docs/17/sql-createtrigger.html).

Context kolonlarının doğrudan UPDATE'i yasaktır; ancak snapshot.source güncellenirse trigger context'i yeniden türetir. Bu nedenle mevcut sözleşme context için mutlak creation-sonrası immutability garantisi vermez. Bu incelemede davranış değiştirilmedi. RLS ownership kuralları aynen kaldı.

### Bench kayıttan nasıl geri gelir?

- `teams.home/away.players`: kaynak ilk 11, kimlikler ve başlangıç koordinatları.
- `teams.home/away.bench`: kaynak yedekler ve kimlikleri.
- `working`: en fazla 22 saha slotu; `slotKey` kaynak slot, `personKey` o slotun güncel oyuncusu, `x/y` güncel koordinatlar.
- Güncel yedekler: her takımın kaynak ilk 11 + kaynak yedekleri içinden working.personKey'lerde bulunmayan oyuncular.

Oyuncu değişiminde yedek oyuncunun key'i slotun personKey'i olur; çıkan oyuncu kaynak players içinde kaldığından yedek olarak yeniden türetilir. `projectBoardState()` yalnızca snapshot'tan modeli kurar. `createMatchBoard()` aynı kimlik kümesi ve occupancy üzerinden paneli kurar. Bu nedenle `working <= 22` bench sayısını sınırlamaz ve bench verisini kesmez; constraint değiştirilmedi.

### Production ile salt okunur karşılaştırma

Production `supabase_migrations.schema_migrations` kayıtlarındaki SQL, yalnızca CRLF/LF ve dış whitespace normalize edilerek yerel dosyalarla karşılaştırıldı. Üçünde de SQL **birebir aynı**; yorumlar silinmeden de eşleşiyor.

| Migration | Repo version | Production version | Sonuç |
| --- | --- | --- | --- |
| football_backend | 20260913062133 | 20260913063249 | Aynı SQL; catalogue/shared_lineups/private paylaşım altyapısı eşleşiyor |
| catalogue_authenticated_read | 20260918142336 | 20260920094922 | Aynı SQL; authenticated teams/players SELECT, iki SELECT policy; anon erişimi korunuyor |
| profiles_ownership | 20260918142348 | 20260920102243 | Aynı SQL; profiles own-row policy, column grant, FK/trigger/index eşleşiyor |

Bu üç migration temiz izole PostgreSQL'de çalıştırıldı; canlı metadata ile karşılaştırmada 37 kolon, 31 CHECK/PK/UNIQUE/FK constraint, 10 index, 7 policy, 5 tablonun RLS durumu, 3 trigger, 3 fonksiyonun tanımı/güvenlik/search_path özellikleri, 60 effective tablo privilege, 272 anon/authenticated kolon privilege ve 9 function EXECUTE kontrolü eşleşti. Yerel PostgreSQL'in NOT NULL bilgilerini ayrıca pg_constraint satırı olarak sunması katalog temsil farkıdır; kolonların `is_nullable` değerleri ayrıca eşleşti. Bu inceleme tam cluster/schema dump eşitliği iddiası değildir; uygulamanın üç migration'ının kapsadığı nesnelerle sınırlıdır. Mevcut kullanıcı/proje verileri sorgulanmadı.

Git'te football dosyası `918feb2` baseline commit'inde (18 Eylül), catalogue/profiles dosyaları `41b79e0` commit'inde (18 Eylül 17:39:42 +0300) bulunuyor. Production version'ları catalogue/profiles için 20 Eylül tarihli. Ayrı dosya oluşturma ve production uygulama zamanlarıyla uyumlu; hangi araç/işlemin farklı version ürettiğini kesin gösteren deploy log'u yok. Timestamp farkı gerçektir; semantic SQL farkı bulunmadı.

### Önerilen, henüz uygulanmamış history uzlaştırması

1. Bu eşleştirmeyi koru; üç eski SQL'i tekrar çalıştırma. Content eşitliği CLI version eşitliği değildir.
2. Ayrı onaylı history çalışmasında production history'yi kanonik kabul ederek yerel dosya version'larını eşleştirmek değerlendirilebilir. SQL değişmeden yalnızca yerel isimler ve test/doküman referansları değişir. Başka ortamların history'si de önceden kontrol edilmeli. Bu görevde rename/repair yapılmadı.
3. Temiz local replay ve migration list karşılaştırmasından sonra dry-run çıktısında yalnızca M5 migration'ı kaldığını doğrula. Bu görevde production `db push` veya dry-run çalıştırılmadı.
4. Ancak ayrı production onayıyla, M5'in dosya version'ını koruyan migration akışını kullan; yeni ve farklı timestamp yaratıp drift'i tekrarlama. Öncesinde backup/rollback planı, sonrasında read-only RLS/grant/constraint/trigger doğrulaması yap.

Remote history'yi kör repair etmek, eski migration'ları reverted işaretleyip DDL'lerini tekrar uygulamak önerilmez. [Supabase migration history rehberi](https://supabase.com/docs/guides/deployment/database-migrations).

### Test kapsamı ve sınırı

- Gerçek `createProject()` payload'ı ve CRUD sorguları ince bir SQL transport adapter üzerinden, authenticated rolünde PGlite PostgreSQL'e gönderildi. Hem free hem match INSERT/SELECT/snapshot UPDATE/rename/DELETE geçti. Context değerleri ve server metadata doğru; client'ın context/revision/timestamp INSERT denemeleri permission denied aldı.
- A sahipliği, B'nin SELECT/UPDATE/DELETE ile A satırına erişememesi, anon CRUD reddi, revision CAS, owner spoof reddi ve mevcut tablo izin/policy'lerinin korunması geçti.
- Her iki modda SQL save → SQL SELECT → gerçek Match Studio mount: 22 saha slotu ve occupant kimliği/koordinatı, iki takımın yedek kimlikleri, her iki taraftaki substitution, altı çizim, renk ve boyut restore edildi. Yerel roster script'i yüklenmedi; provider load sayısı 0. Snapshot'ın tamamı DB roundtrip sonunda eşit; yeniden açılışta undo history boş.
- Yeni DB paketi: **8/8 test (1 ana + 7 alt test) PASS**. Auth user/uid ve HTTP transport test double; SQL privilege, trigger, constraint ve RLS gerçek PostgreSQL'de çalıştı. Docker engine erişilemediği için tam local Supabase Auth/PostgREST testi yapılmadı.
- Tam `npm test`: **447/447 PASS**, 0 fail/skip; board regression **9/9 grup PASS**.
- `npm run build`: PASS; `dist/backend.js` yalnızca build tarafından üretildi. `git diff --check`: PASS; bu görevde düzenlenen untracked test/doküman dosyaları için ek whitespace kontrolü de PASS.
- Son production read-only kontrolde `to_regclass('public.studio_projects') = NULL`, M5 migration kaydı yok. Dolayısıyla localhost'un hosted projeye yaptığı kayıt henüz çalışamaz; bu inceleme production migration gerekliliğini ortadan kaldırmaz.
- Production'a yalnızca salt okunur metadata/history SELECT sorguları gönderildi. Migration apply/repair/rename/db push, production veri veya ayar değişikliği, commit/push/deploy yapılmadı.
