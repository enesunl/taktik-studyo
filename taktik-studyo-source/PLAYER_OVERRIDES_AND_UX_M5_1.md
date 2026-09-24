# M5.1 — Kişisel oyuncu düzenlemeleri ve çalışma alanı UX

24 Eylül 2026. Yerel uygulama tamamlandı. **Production migration uygulanmadı; commit, push veya deploy yapılmadı.**

## Karşılaştırma

- İki saha aynı CSS kuralını kullanır. Masaüstünde eski 440px genişlik üst sınırı 516px oldu: toplam +76px görsel hedef. Yükseklik eski geometriye yakın, 430–569px aralığında tutulur. Dar alanlarda container genişliğine göre sınırlandırılır; fiziksel `cm` kullanılmaz.
- 1024px civarında kart boşlukları küçülür. 700px altında iki kart, yalnızca karşılaştırma bölgesinde yatay kayar. Belge genişliğini büyüten bir minimum genişlik verilmez.
- Alttaki yinelenen “Dizilişini kur” paneli ve ona özel CSS kaldırıldı. Üstteki iki diziliş dropdown'ı çalışmaya devam eder. Ortak board motorundaki opsiyonel formation-panel elemanları yokken hata oluşmaz; Taktik Tahtası'nın paneli korunur.
- İki board da mevcut `benchOnly` davranışını kullanır: **yedekler = kanonik takım kadrosu − güncel XI athleteId kümesi**. İsimle filtreleme yoktur. Swap, takım/diziliş değişimi, undo ve restore sonrasında yeniden hesaplanır. Ad düzenlemek artık athleteId'yi silmez.
- Koordinatlar yüzde olarak kalır. Yeni genişlikte drag testi, yatay/dikey hareketin aynı yüzde delta ile gerçekleştiğini ve karşı tarafı etkilemediğini doğrular.

## Oyuncu override mimarisi

`src/lib/player-overrides.js` tek persistence/resolver katmanıdır. Supabase sorguları renderer'lara kopyalanmaz. Mevcut Auth-aware client kullanılır; yeni client, Auth akışı, RPC veya Edge Function eklenmez.

Protected route, sunucuda doğrulanmış kullanıcının kimliğine ve route generation'ına bağlı bir store oluşturur. Karşılaştırmadaki iki board aynı store'u paylaşır. Store her async sınırdan sonra `current()` kontrolü yapar; account switch/unmount sonrası eski sonuç cache veya UI'ya yayınlanmaz. RLS gerçek authorization sınırıdır.

Bulk yükleme owner filtresiyle, player_key sırasına göre 500 satırlık keyset sayfaları kullanır. Aynı anda yapılan load çağrıları bir Promise paylaşır. En fazla 20 sayfa denenir; limit aşımında eksik listeyi başarı saymaz. Normal katalog büyüklüğünde tek bulk sorgu yeterlidir; 25/50 oyuncu render etmek 25/50 istek üretmez. Cache yalnızca bellektedir, sayfa/generation ömrü kadardır. Tam sayfa geçişi veya yeni cihaz DB'den tekrar yükler. Realtime/cross-tab push eklenmedi.

Save, yalnızca mevcut editörün alanlarını saklar:

| Alan | Uygulama/DB doğrulaması |
| --- | --- |
| `name` | Trim; boş olamaz; en fazla 24 Unicode karakter; control character yok |
| `number` | NULL veya 1–99 tamsayı |
| `role` | KL, STP, SLB, SĞB, ÖL, MO, OO, SLK, SĞK, SF |

Koordinat, selection, kadro/yedek durumu, renk, gol sayısı ve çizimler override'a girmez. Kanonik roster/provider nesneleri değiştirilmez. Kimliği olmayan özel oyuncuların mevcut yerel taslak düzenlemesi korunur ve bu durum mesajda belirtilir.

INSERT payload: `{user_id, player_key, name, number, role}`. Satır varsa `23505` sonrası yalnızca `{name, number, role}` UPDATE edilir; owner ve key filtreleri korunur. Ownership/key UPDATE izni isteyen upsert kullanılmaz. Her key için double-submit engeli vardır. Başarılı yazı cache'i ve aboneleri günceller; subscriber hatası tamamlanmış DB yazısını başarısız gibi göstermez.

## Kimlik ve merge

- Katalog `athleteId` / roster `id` → `local:<id>`.
- Provider'ın doğrulanmış oyuncu `id` / `playerId` → `bsd:<id>`.
- Match board'ın mevcut `prefix:side:teamId:playerId` person key'i değişmez. Override lookup, mevcut playerId ve source bilgisinden türetilir. `local:` prefix veya `probable-local` lineupKind yerel namespace'i seçer; diğer provider kadroları BSD kullanır.
- Aynı sayısal local/BSD ID birbirinin düzenlemesini almaz. İsim benzerliğiyle eşleştirme yapılmaz; roster ID değişirse tahmini migration yapılmaz.
- Merge sırası: kanonik/snapshot oyuncu → kişisel name/number/role. Renderer'ın broad position/roles gösterimi bu role'den türetilir; identity, x/y, gol ve taktik state korunur. Reset, override satırını DELETE eder; saklı taktik slotu değiştirmeden temel gösterim geri gelir.

## Sayfalar, kayıtlar ve paylaşım

Taktik Tahtası ve Karşılaştırma mevcut editörle düzenlemeyi kalıcı kaydeder. Aynı sayfadaki aynı oyuncunun saha ve yedek gösterimleri hemen güncellenir. Takım değiştirme/geri dönme ve yeni store ile reload test edilmiştir. Diğer editördeki açık formun yazılmakta olan değerleri bildirimle ezilmez.

Free Studio ve Match Studio aynı resolver'ı saha/yedek render'ında kullanır. BSD namespace'i desteklenir; bu fazda mevcut üründe olmayan ayrı bir Match Studio metin editörü icat edilmedi. Match Center lineup, golcü, olay ve oyuncu değişikliği isimleri de mevcut kimlikle çözümlenir; dakika, skor, own-goal attribution gibi maç gerçekleri değişmez.

Studio Projects için seçim **presentation overlay**'dir. Persist edilen model, source/working oyuncu kimlikleri, bench, substitution, drawings ve pitch temel snapshot olarak kalır. Override save/reset, board `onChange`/autosave çağırmaz; geçmiş veya yeni snapshot'a otomatik rewrite yapmaz. Yeni kayıt ve yeniden açma aynı resolver'ı kullanır. Taktik kimlik veya saha yerleşimi isim/numara değişiminden etkilenmez.

Classic board `getState()` görünür kişisel değerleri döndürür; böylece kullanıcı yeni bir paylaşım oluşturduğunda gördüğü isim/numara snapshot'a girebilir. Public readonly viewer override store oluşturmaz/kullanmaz; yalnızca paylaşılan sabit snapshot'ı gösterir. Mevcut paylaşım Edge akışı, readonly davranışı ve taslak izolasyonu korunur.

Yazı başarısızsa kontrollü hata görünür; formdaki girişler korunur, cache'e sahte başarı yazılmaz. Migration henüz bulunmayan ortamda override yükleme/yazma kontrollü başarısız olur, temel kadro kullanılabilir. Migration ayrı onayla uygulanmadan production'da kalıcı kişisel oyuncu düzenleme özelliği hazır sayılmamalıdır.

## Yerel migration

Dosya: `supabase/migrations/20260924094207_player_overrides.sql`.

| Kolon | Tip / constraint |
| --- | --- |
| `user_id` | UUID NOT NULL; auth.users(id) FK, ON DELETE CASCADE |
| `player_key` | TEXT NOT NULL; local ID 1–80 harf/rakam/alt çizgi/tire veya BSD pozitif 1–16 basamak |
| `name` | TEXT NOT NULL; trim, 1–24 karakter, C0/C1 control karakterleri reddedilir |
| `number` | SMALLINT nullable; 1–99 CHECK |
| `role` | TEXT NOT NULL; desteklenen 10 rol CHECK |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Composite PK `(user_id, player_key)` tek kullanıcı/oyuncu kaydı sağlar; PK B-tree index owner bulk sorgusu ve owner/key yazıları için yeterlidir. Ayrı gereksiz index eklenmez.

RLS enabled. Dört policy: `player_overrides_select_own`, `insert_own`, `update_own`, `delete_own`; hepsi authenticated rolüne ve `(select auth.uid()) = user_id` koşuluna bağlıdır. UPDATE hem USING hem WITH CHECK içerir.

Önce PUBLIC/anon/authenticated tüm tablo yetkileri revoke edilir. Authenticated yalnızca SELECT/DELETE tablo yetkisi, INSERT `(user_id,player_key,name,number,role)` ve UPDATE `(name,number,role)` kolon yetkileri alır. Metadata, ownership veya key client tarafından UPDATE edilemez. Anon hiçbir CRUD yapamaz.

`player_overrides_updated` trigger'ı mevcut `tactics_private.touch_updated_at()` invoker fonksiyonunu kullanır; yeni fonksiyon/RPC veya mevcut fonksiyonda değişiklik yoktur. Bu yüzden önceki profiles migration'ı bağımlılıktır. Migration tek transaction'dır, bir kez migration history üzerinden uygulanmak içindir; ikinci kez doğrudan CREATE çalıştırılması tablo zaten mevcut hatası verir. Mevcut tabloların satır/policy/grant davranışını değiştirmez. Yerel testte permissive default grants altında bile güvenli revoke/grant davranışı doğrulandı.

**Production'a uygulanmadı.** History repair, eski migration rename, db push veya remote schema/data işlemi yapılmadı.

## Genişletilmiş kadro

- Mevcut modal ve canlı board korunur; kopya board oluşturulmaz.
- Desktop saha genişlik üst sınırı 650 → 802px (+152px). Boyut kullanılabilir viewport'a göre daralır; yüksekliği viewport'a göre korunur.
- Dialog fixed, 96dvh; ana workspace yerine merkez/yedek bölümlerinde gerektiğinde iç scroll vardır. Mevcut body-scroll kilidi, focus, Escape ve kapanış cleanup'ı korunur.
- Soldaki dikey takım etiketi daha büyük (`clamp(32px,5.8dvh,72px)`), daha az üst padding ve daha fazla dikey alana sahiptir. Sahanın dışındaki kendi kolonunda kalır.
- Mobilde 96dvh dialog içinde kontrollü yatay/dikey scroll, sticky kapat düğmesi vardır. Masaüstü sabit kolonları body'ye taşınmaz. Mevcut koyu saha çerçevesi her iki site temasında korunur.

## Profil ve navigation

Authenticated üst menü: Stüdyo, Taktik Tahtası, Karşılaştırma, Maçlar, Profil ve mevcut tema kontrolü. Navbar Çalışmalarım ve eski Ayarlar/Gizlilik/Çıkış dropdown'ı kaldırıldı. Artık kullanılmayan `dist/navigation.js`, script referansları ve account-menu CSS'i silindi.

Profil desktop düzeninde mevcut profil içeriği solda, hesap menüsü sağdadır. Çalışmalarım mevcut `/calismalarim` sayfasına gider. Ayarlar/Gizlilik disabled “Yakında” olarak kalır; sahte route yoktur. Çıkış Yap sağ panelin en altındadır. 700px altında bölümler tek kolona geçer; logout son sıradadır. Theme token'ları ve görünür keyboard focus kullanılır.

Logout mevcut `createProtectedPage().signOut()` yoluna bağlıdır. İkinci signout sistemi eklenmez. Landing'in artık butonu olmayan eski logout handler'ı kaldırıldı; dışarıdan gelen Auth state değişimini dinlemeye devam eder. Profile API, Auth/recovery ve protected guard güvenlik davranışı değişmedi.

## Doğrulama ve sınırlar

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | **466/466 geçti**, 0 fail/cancel/skip |
| Board regression | **9/9 grup geçti**; gerçek board motoru, swap, drag, bounds, drawing, scoped dispose, readonly ve route mount |
| Yeni M5.1 testleri | 17 test/alt test: resolver/service 5, UI/cross-page 7, DB parent + 4 alt test |
| PostgreSQL / RLS | PGlite gerçek PostgreSQL: A CRUD, B izolasyon, anon ret, exact service payload, kolon yetkileri, CHECK/FK/trigger, eski güvenliğin korunması başarılı |
| `npm run build` | Başarılı; `dist/backend.js` yalnızca build tarafından üretildi |
| Secret scan | 27 browser text dosyası; credential adayı 0, private env değer eşleşmesi 0, yeni test fixture'ı bundle'da yok |
| `git diff --check` | Başarılı |
| Browser görsel QA | Yapılamadı: CUA envanteri boş, browser açma “No browser is available” döndürdü |
| Gerçek local Supabase user smoke | Yapılamadı: Docker daemon pipe mevcut değil. SQL/RLS ve DOM fixture testleri gerçek Auth/PostgREST/browser E2E yerine sunulmaz |

1440/1024/390px light/dark Comparison, expanded modal, Profil ve klavye/focus görsel kontrolü erişilebilir tarayıcıda ayrıca yapılmalıdır. Yeni oyuncu editörü → refresh → başka takım → Karşılaştırma → Free Studio → reset gerçek kullanıcı smoke'u da local Supabase çalıştığında yapılmalıdır. Otomatik testler bu geçişlerin veri/DOM sözleşmesini kapsar; görsel taşma yokluğu ölçülmüş gibi iddia edilmez.

## Dosya özeti

- Yeni source: `src/lib/player-overrides.js`.
- Source entegrasyonu: `src/lib/page-bootstrap.js`, `landing-ui.js`, `match-board.js`, `match-detail-ui.js`, `match-studio-ui.js`.
- Elle düzenlenen frontend source: `dist/app.js`, `comparison.js`, `comparison.css`, `styles.css`, `routes.css`, `theme.css`; `index.html`, `studyo.html`, `karsilastirma.html`, `mac-studyosu.html`, `mac.html`, `maclar.html`, `profil.html`, `calismalarim.html`.
- Silinen eski source: `dist/navigation.js`.
- Generated: `dist/backend.js` (build).
- Yeni migration: `supabase/migrations/20260924094207_player_overrides.sql`.
- Yeni testler: `tests/player-overrides.test.mjs`, `player-overrides-ui.test.mjs`, `player-overrides-database.test.mjs`; helper'lar `classic-board-fixture.mjs`, `player-overrides-fixture.mjs`.
- Güncellenen testler: `auth-initialization.test.mjs`, `auth-routes.test.mjs`, `board-regression.cjs`, `profile-ui.test.mjs`, `studio-product.test.mjs`, `studio-projects-ui.test.mjs`.
- Rapor: bu dosya.

`git diff --stat` tracked dosyalar için: **27 files changed, 148 insertions(+), 119 deletions(-)**. Ayrıca henüz Git'e eklenmemiş **8 yeni dosya** (source, migration, 5 test/helper, rapor) vardır; normal `git diff --stat` bunları saymaz. Git staging yapılmadı.

Bu görev boyunca production DB/Auth/Edge, canonical roster/provider verisi, secret veya environment ayarı değiştirilmedi. Commit, push ve deploy yapılmadı.
