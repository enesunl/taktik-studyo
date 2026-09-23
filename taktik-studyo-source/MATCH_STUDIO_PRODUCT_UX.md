# Match Studio M4.2 — yerel uygulama ve doğrulama

## Modlar ve gezinme

- `/mac-studyosu` ve `.html` eşleniği, ID yoksa boş **Serbest Stüdyo** açar. Gerçek maç API'si çağrılmaz.
- `?id=215997&hafta=6` aynı workspace/board/çizim araçlarını maç verisiyle açar. Boş, tekrarlı veya geçersiz explicit ID serbest moda düşmez.
- Navbar **Stüdyo** → `/mac-studyosu`; **Taktik Tahtası** → mevcut `/studyo.html` (extensionless `/studyo` korunur). Karşılaştırma, Maçlar ve Profil bağlantıları korunur.
- Landing authenticated CTA **Başla** → `/mac-studyosu`. Anonymous kayıt/giriş davranışı değişmedi. Auth redirect whitelist ve korumalı sayfa doğrulaması değiştirilmedi.

## Workspace ve tercih sınırları

Varsayılan saha **1200 × 650 CSS px**. Genişlik **800–1800**, yükseklik **450–900** aralığında bağımsız slider ile ayarlanır. Değerler sonlu sayıya göre doğrulanır, sınıra çekilir; hatalı tür/JSON güvenli varsayılana döner. Geniş saha kendi viewport'unda yatay kayar. Masaüstünde sidebar ve çalışma alanı ayrı dikey kayabilir; mobilde araçlar altta, kendi içinde kaydırılabilir.

Panel düğmesi `aria-controls` / `aria-expanded` taşır; 220 px panel 48 px şeride daralır ve serbest kalan alan saha viewport'una geçer. Collapse board'u yeniden kurmaz, seçili Pas aracı dahil araç durumunu değiştirmez. Kısa CSS geçişi reduced-motion ile kapanır.

| Durum | Saklama |
| --- | --- |
| Tema | `taktik:theme:v1` — mevcut controller |
| Panel | `taktik:match-studio:sidebar:v1` — `collapsed` / `expanded` |
| Saha ölçüleri | `taktik:match-studio:pitch-size:v1` — `{width,height}` |
| Saha rengi | `taktik:match-studio:pitch-color:v1` — mevcut controller |
| Seçilen takımlar, oyuncu konumları ve değişiklikleri, çizimler | Yalnızca açık sayfanın belleği |
| Provider maç verisi | Normalize edilmiş kaynak; kullanıcı sürüklemeleri bunu değiştirmez |

**Varsayılana Dön** yalnızca genişlik, yükseklik ve rengi sıfırlar. Oyuncular, seçilen takımlar ve çizimler korunur. SVG `preserveAspectRatio="none"` ile bağımsız boyutlandırmayı izler; oyuncu ve çizim koordinatları normalize kalır. Silgi hit-test'i gerçek genişlik/yükseklik üzerinden hesaplanır. Boyut ayarı yeni provider isteği veya taktik taslak yazımı üretmez.

## Yerel kadro ve oyuncu etkileşimleri

Tek `createMatchBoard` hem serbest hem maç moduna hizmet eder. `setTeam(side, team)` sadece ilgili tarafın kaynak/çalışma oyuncularını, formasyonunu, rengini ve yedeklerini yeniler. Diğer takımın hareketleri, değişiklikleri ve çizim geçmişi korunur; eski oyuncu listener'ları temizlenir.

Takım seçimi native `dialog.showModal()` üzerinde markalı, aranabilir bir liste kullanır. Tarayıcı modal focus trap / inert arka plan sağlar. Escape ve Kapat düğmesi açan düğmeye odağı döndürür. Aynı takım diğer tarafta devre dışıdır. Takım adı güvenli `textContent`, renkler mevcut yerel katalogdan gelir; logo/fotoğraf isteği yoktur.

Mevcut `dist/app.js` içindeki ilk 11 seçimi ortak `selectRosterXI()` yardımcısına çıkarıldı: fotoğraf varlığı / starts / value sıralaması ve mevki eşleme sırası korundu. Yeni bir sıralama sistemi yoktur. Serbest mod `dist/rosters.js` ve mevcut takım renk listesini kullanır; varsayılan **4-3-3**, BSD formasyonu olarak sunulmaz. Mevcut roster kaynaklarındaki katalog ID'leri kullanılır. Provider → local eşlemesi yalnızca bilinen `teamId` ile yapılır; isim benzerliğiyle eşleme yapılmaz.

11 benzersiz geçerli oyuncu ve tam bir kaleci yoksa takım sahaya kurulmaz; kontrollü eksik kadro mesajı gösterilir. 18 mevcut yerel takım test edildi. Gol/maç skoru serbest moda eklenmez.

Sahadaki oyuncu takası pointer ve Shift+Enter için **yalnızca aynı takımda** mümkündür. Rakibin üzerine bırakılan oyuncu geçerli son konumunda kalır; rakibin kimliği ve konumu değişmez. Yedekler kendi takımıyla değişir.

## Muhtemel 11 ve server cache

Her takım ayrı çözülür; kaynak sırası:

1. `confirmed`: eksiksiz, onaylanmış provider kadrosu.
2. `probable-provider`: yalnızca upcoming maç ve açık `lineup_status: predicted`.
3. `probable-recent-match`: aynı sezon Süper Lig fikstüründeki, hem hedef kickoff hem de şu andan önce tamamlanmış en yeni geçerli onaylı kadro.
4. `probable-local`: ortak yerel ilk 11 seçimi; frontend'de tamamlanır, BSD araması yapılmaz.

BSD'nin [Events / When a lineup exists](https://sports.bzzoiro.com/docs/football/events/#when-a-lineup-exists) dokümanı 23 Eylül 2026'da kontrol edildi: `confirmed`, `predicted`, `unavailable` ayrı durumlar. Yedek veya roster listesinden provider tahmini icat edilmez. Provider açıklamalarındaki genel tahmin kapsama oranları bizim proje için garanti sayılmaz.

`supabase/functions/matches/probable.js`, mevcut M1 sezon cache ve M2 detay cache'ini kullanır. Her takım için son **iki** uygun geçmiş maç denenir; ilk geçerli onaylı kadroda durur. İki aday da eksikse daha eski bütün sezon taranmaz, yerel tahmine düşülür. Bu bilinçli kota sınırı nedeniyle daha eski bir maçta mevcut olabilecek kadro atlanabilir.

`studioLineups` ek alanı kaynak/provenance ve gerektiğinde `sourceMatchId` taşır. Orijinal `lineups`, incidents ve score değiştirilmez. Auth kontrolü cache hit'lerinde de önce çalışır. İstekler maç ID'sine göre single-flight ile birleştirilir. Cache isolate belleğindedir, dağıtık/durable değildir; otomatik polling yoktur.

- Sezon cache: 300 saniye; en fazla 4 sayfa.
- Upcoming detay ve türetilmiş sonuç: normalde en fazla 300 saniye; mevcut optional error politikası 60 saniyeye indirebilir. Türetilmiş sonuç raw detayın expiry'sini uzatmaz.
- Geçmiş detay: mevcut politika, eksiksiz finished için 3600 saniye; eksik/error için 60 saniye.
- 128 raw / 128 türetilmiş cache kaydı, 32 pending sınırları.
- Yeni onaylı kadro ilk cache yenilemesinde tahmini geçersiz kılar. Cache süresi dolmadan canlı anlık onay garantisi yoktur; açık sayfa kendiliğinden yenilenmez.
- Soğuk maliyet: hedef detay 4 GET + sezon 1–4 sayfa + en fazla 4 benzersiz geçmiş detay × 4 GET = **en fazla 24 GET**. 306 maçlık iki sayfalı sezonda üst sınır 22, ilk adayların yeterli olduğu tipik soğuk yol 14'tür. Ortak maçlar ve cache hit'leri bunu azaltır.
- Tarihsel lookup başarısızlığı yerel fallback'i engellemez. Mevcut ağ timeout/hata davranışı korunur; provider'ın yavaş olması halinde ilk açılış kontrollü hata verebilir.

Match Center ve Studio **Muhtemel 11** ile takım bazında kaynak açıklamasını gösterir. İki tam kadro varsa açılış düğmesi etkinleşir. Eksik veride düğme kapalı kalır. Upcoming için gol göstergesi ve uydurma skor üretilmez.

## Tema ve hesap menüsü

Tema anahtarı mevcut `theme.js` controller'ını kullanır: güneş/ay, kayan gösterge, `aria-pressed`, saved/system tercihi ve ilk boya öncesi uygulama korunur. Reduced-motion animasyonu kapatır. Tema, saha rengini değiştirmez.

`navigation.js` yalnızca disclosure davranışını yönetir; Supabase/Auth çağırmaz. Mevcut tek `#signOut` düğmesi Ayarlar menüsüne taşındı, mevcut guarded logout listener'ı ve race korumaları aynı kaldı. Escape, dış tıklama ve odak dışına çıkış kapatır; ok tuşuyla ilk etkin düğmeye, Tab ile doğal sırada erişilir. Pagehide listener'ları temizler. Hesap ayarları / Gizlilik **Yakında**, disabled ve hedef URL'sizdir.

## Dosyalar ve doğrulama

M4.2 source alanları: `dist/app.js`; yedi authenticated header HTML'i (`index`, `studyo`, `karsilastirma`, `profil`, `maclar`, `mac`, `mac-studyosu`); `dist/match-studio.css`, `dist/theme.css`, `dist/theme.js`, yeni `dist/navigation.js`; `src/lib/match-board.js`, `match-layout.js`, `match-studio-ui.js`, `match-detail.js`, `match-detail-ui.js`, `tactical-drawing-ui.js`, `tactical-drawings.js`, yeni `studio-lineups.js`, `studio-preferences.js`, `studio-team-picker.js`; matches `handler.js`, yeni `probable.js`; ilgili testler ve yerel smoke scripti. `dist/backend.js` yalnızca `npm run build` çıktısıdır.

M4/M4.1'in önceden var olan commit edilmemiş değişiklikleri korundu. `git diff --stat` bu eski çalışmaları da içerir; untracked yeni dosyaları içermez.

Mevcut working tree `git diff --stat` özeti: **34 tracked dosya, 367 ekleme, 191 silme**. Ayrıca **16 untracked dosya** bulunur; bunların 9'u M4/M4.1'den zaten vardı. M4.2'nin yeni dosyaları: bu doküman, `dist/navigation.js`, `src/lib/studio-lineups.js`, `src/lib/studio-preferences.js`, `src/lib/studio-team-picker.js`, `supabase/functions/matches/probable.js`, `tests/studio-product.test.mjs`.

23 Eylül 2026 doğrulaması:

- `npm test`: **391 geçti, 0 hata, 0 skipped**; Auth, profile, recovery, paylaşım, katalog, database, draft ve maç testleri dahil. Testler statik fixture/mocks kullanır.
- Board regression: **9/9 PASS**; ana tahta, karşılaştırma, read-only paylaşım ve draft izolasyonu dahil.
- Ek testler: tercihler/clamp, boş serbest mod ve sıfır API isteği, yerel 18 takım, eksik/veri tekrarı, modal arama/focus/aynı takım engeli, taraf değiştirme izolasyonu, dört yönde pointer takası, rakip klavye takasının reddi, resize sonrası ok/alan/çember, callback/cache önceliği, hesap menüsü ve tek logout çağrısı.
- Gerçek veri smoke: yalnızca BSD GET; Auth ve DOM yerel mock. `215997`: 22 oyuncu, 4-2-3-1 / 4-1-4-1, altı çizim aracı ve geri alma/silme korunuyor. `216231`: her iki taraf `probable-recent-match`, kaynak maçlar **215997 / 216000**. Toplam **14 GET**, iki tekrar cache'den, etkileşim başına **0** ek GET. Token yazılmadı/gösterilmedi.
- `npm run build`: başarılı. `git diff --check`: temiz.
- Browser output secret scan: **26 metin dosyası, 0 gerçek secret adayı, 0 recovery fixture eşleşmesi**. Ortam secret'ları yalnızca bellek içinde karşılaştırıldı; değerleri raporlanmadı. **8 CSS dosyası, 0 derleyici uyarısı**.
- Gerçek tarayıcı QA **yapılamadı**: browser surface listesi boş, Windows native pipe bulunamadı. 1440 / 1024 / 390 px görsel, gerçek pointer ve native dialog focus davranışı bu ortamda gözle doğrulanmadı; DOM ve CSS kontrolleri bunların yerine tam browser kanıtı değildir.

## Production sınırı

Commit, push, deploy ve production mutation yapılmadı. Auth/DB/Netlify ayarı, migration, provider secret ve sharing Edge Function değişmedi. Yeni tarihsel resolver yerel matches Edge source değişikliğidir; production'a uygulanmadı.

**BSD production lisans blocker'ı açık kalır.** Önceki audit'teki 1 Ekim 2026 yürürlük tarihli v4.0 lisans/kullanım koşulu değerlendirmesi ayrı release şartıdır. Bu uygulama, salt okunur provider probe veya geçen testler ticari/public production yayını için lisans onayı değildir.
