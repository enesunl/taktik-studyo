# Taktik Stüdyo — kaynak proje rehberi

İnceleme tarihi: 17 Eylül 2026. Bu teslim, önce salt okunur incelenen mevcut
Site'nin ayrı yerel kaynak kopyasıdır. Canlı Site, domain, Supabase tabloları,
RLS/grant kuralları, Edge Function ve secrets değiştirilmedi; yayın yapılmadı.

Sonraki yerel güncelleme: Edge origin yapılandırması `taktikstudyo.com` için
güncellendi; production deploy yapılmadı. Aşağıdaki orijinal kaynak/canlı Edge
eşleşmesi ve teslim doğrulaması kayıtları ilk teslimin tarihsel sonuçlarıdır.

## 1. Kaynağın doğrulanması

| Kontrol | Sonuç |
|---|---|
| Site | Taktik Stüdyo, sürüm 10 |
| Güncel Site adresi | https://taktikstudyo.com |
| Kaynak commit | `bb87663cbf20df1ede5b776222b8c88d8f2ea525` |
| Orijinal dosya sayısı | 511; 473'ü oyuncu PNG'si |
| Tamlık | Orijinal 511 dosya SHA-256 ile kontrol edildi; kaynak, lockfile ve varlıklar korundu |
| Supabase | Mevcut Taktik Stüdyo projesi: `zwhoailuklwtxaaawfaq` |
| Canlı Edge | `lineups`, sürüm 4; üç Edge dosyası ve ortak validation dosyası yereldekiyle birebir eşleşiyor |
| Migration | Yerel `20260913062133`, canlı `20260913063249`; `football_backend` içeriği boşluk/yorum normalizasyonunda aynı |
| Sites runtime env | Okunan listede kayıt yok; public frontend ayarları yerel build sırasında bundle içine alınıyor |
| Secrets | Supabase secret değerleri istenmedi veya okunmadı; pakete dahil edilmedi |

Bu paket Git geçmişi veya veritabanı yedeği değildir. Tam mevcut kaynak ağacı,
frontend build çıktısı, SQL migration/schema/seed ve Edge kaynaklarını içerir.
Kullanıcıların localStorage kayıtları, paylaşılmış kadro kayıtları, secret değerleri,
`node_modules/`, `.git/`, Supabase CLI geçici önbellekleri dahil değildir.
Bağımlılıklar lockfile ile `npm ci` üzerinden yeniden kurulur.

## 2. Tam dosya ağacı ve her dosyanın görevi

`docs/DOSYA_ENVANTERI.md` dosyasında eksiksiz ağaç ve tek tek açıklamalar var.
473 PNG dahil hiçbir kaynak dosyası toplu bir “vb.” kısaltmasının arkasında
bırakılmadı. `docs/ORIGINAL_SHA256.json` yalnızca orijinal 511 dosyanın özetidir.

| Klasör / dosya | Rol |
|---|---|
| `dist/` | Düzenlenen frontend kaynakları, statik portreler ve tek üretilen backend bundle |
| `src/` | Supabase, localStorage ve paylaşım modülleri |
| `scripts/` | Build, seed hazırlığı, eski canlı test aracı ve eklenen yerel sunucu |
| `supabase/` | Config, proje kimliği, migration, şema, seed ve Edge Function kaynakları |
| `tests/` | Mevcut yerel birim, veritabanı ve saha regresyon testleri |
| `package.json`, `package-lock.json` | Çalıştırma komutları ve bağımlılık sürümleri |
| `.openai/hosting.json` | Mevcut Site kimliği ve dist yayın kökü |
| `.env.example`, `.gitignore` | Public ayar şablonu ve Git dışlama kuralları |
| `BACKEND.md`, `TURNSTILE_SETUP.md` | Önceki entegrasyon/kurulum notları; tarihsel durum raporları |
| `README_LOCAL.md`, `taktik-studyo.code-workspace`, `docs/` | Bu teslim için eklenen yerel kullanım ve envanter dosyaları |

## 3. Frontend kaynakları

Framework: düz HTML/CSS/JavaScript. React, Next.js veya Vite projesi değil.
Her saha örneği kendi closure state'ini tutuyor. Karşılaştırma iki ayrı saha
örneği kullanıyor. `players` sahadaki 11 slot; yedekler katalogdan bu oyuncuların
kimlikleri çıkarılarak türetiliyor. Çizimler normalize koordinatlarla tutuluyor.

| Dosya | Düzenleme alanı |
|---|---|
| `dist/index.html` | Ana sayfa HTML |
| `dist/karsilastirma.html` | Karşılaştırma HTML |
| `dist/styles.css` | Genel tasarım ve saha |
| `dist/comparison.css` | Karşılaştırma stilleri |
| `dist/app.js` | Saha motoru ve kullanıcı etkileşimleri |
| `dist/comparison.js` | Sol/sağ saha başlatma |
| `dist/rosters.js` | Statik fallback katalog |
| `dist/faces/*.png` | 473 yerel oyuncu fotoğrafı |
| `src/backend-entry.js` | Modülleri saha motoruna bağlayan başlangıç ve Edge çağrıları |
| `src/lib/supabase.js` | Tek merkezi Supabase client |
| `src/lib/catalogue.js` | Katalog sorguları, dönüştürme ve cache |
| `src/lib/drafts.js` | localStorage doğrulama ve kayıt |
| `src/lib/sharing-ui.js` | Paylaşım dialogu ve Turnstile |
| `src/lib/validation.js` | Ortak veri doğrulama |

Katalog başarılı bağlantıda Supabase'den okunur; hata halinde statik katalog
kullanılır. Hareketler yerel state → localStorage akışındadır. Paylaşım kaydı
yalnızca Edge üzerinden; doğrudan shared_lineups INSERT veya ayrıcalıklı RPC
çağrısı frontend'de yoktur.

## 4. Build dosyaları

| Dosya | Görev |
|---|---|
| `package.json` | `build`, `test`, Node >=22; sabit sürümler |
| `package-lock.json` | Bağımlılık kilidi |
| `scripts/build-backend.mjs` | esbuild ile backend adapter'ı bundle eder |
| `.env.example` | Üç public build değişkeninin boş şablonu |
| `.env` | Bu yerel kopyadaki üç public değer; Git dışında |
| `dist/backend.js` | Üretilen ve yayınlanan bundle; elle düzenleme |
| `dist/_redirects` | Paylaşımlı kadro URL rewrite |
| `.openai/hosting.json` | Mevcut Sites yayın kimliği/klasörü |

Build komutu sadece `dist/backend.js` üretir. `dist/` temizlenmemelidir:
diğer HTML/CSS/JS dosyaları doğrudan düzenlenen kaynaklardır. SDK sürümü
`@supabase/supabase-js 2.116.0`, esbuild `0.28.2`, test için PGlite `0.5.8`,
Supabase CLI `2.117.0` olarak korunmuştur. Yeni bağımlılık eklenmedi.

## 5. Supabase migration ve Edge kaynakları

| Dosya | İçerik |
|---|---|
| `supabase/migrations/20260913062133_football_backend.sql` | Başlangıç tabloları, constraint, RLS/grant, indeks, trigger, validation ve RPC |
| `supabase/schema/football.sql` | Aynı SQL'nin şema kaynak kopyası |
| `supabase/seed.sql` | Statik katalog kökenli 18 takım ve 539 oyuncu |
| `supabase/config.toml` | Yerel CLI ve lineups entrypoint/JWT doğrulama ayarları |
| `supabase/project.json` | Mevcut backend kimliği |
| `supabase/functions/lineups/index.ts` | Runtime env, server client, origin ve handler bağlantısı |
| `supabase/functions/lineups/origins.js` | HTTPS origin listesi doğrulama ve varsayılan production origin |
| `supabase/functions/lineups/handler.js` | CORS, public anahtar kontrolü, boyut/şema kontrolü, rate limit RPC ve GET/POST |
| `supabase/functions/lineups/turnstile.js` | Siteverify başarı/action/hostname kontrolü |
| `src/lib/validation.js` | Edge tarafından da import edilen ortak doğrulama |

Şema: `public.teams`, `public.players`, `public.shared_lineups`,
`tactics_private.share_limits`; kayıt RPC'si `public.create_shared_lineup`.
Şema dosyaları mimariyi gösterir; bu işlemde yeni şema/tablo oluşturulmadı.
Migration/seed zaten uygulanmıştır. Yerel ve canlı migration tarihleri farklı
olduğu için ilerideki migration yayını öncesi geçmiş uzlaştırması ayrıca gerekir.

## 6. Environment variable isimleri — değerler gösterilmez

| İsim | Okuyan taraf | Görev / gizlilik |
|---|---|---|
| `SUPABASE_URL` | Frontend build ve Edge | Public proje API adresi |
| `SUPABASE_PUBLISHABLE_KEY` | Frontend build | Public Supabase anahtarı |
| `TURNSTILE_SITE_KEY` | Frontend build | Public widget site anahtarı |
| `LINEUPS_SECRET_KEY` | Yalnızca Edge | İsteğe bağlı server secret override; frontend'e girmez |
| `SUPABASE_SECRET_KEYS` | Yalnızca Edge | Platform anahtar sözlüğü; `.default` server fallback; secret |
| `LINEUPS_PUBLISHABLE_KEY` | Edge | Beklenen public apikey override |
| `SUPABASE_PUBLISHABLE_KEYS` | Edge | Platform public anahtar sözlüğünün `.default` fallback'i |
| `ALLOWED_ORIGINS` | Edge | Virgülle ayrılmış HTTPS origin listesi; tanımlanmamışsa `https://taktikstudyo.com`; boş/geçersiz değer hata verir |
| `TURNSTILE_SECRET_KEY` | Yalnızca Edge | Cloudflare sunucu doğrulama secret'ı |
| `LINEUPS_RATE_SALT` | Yalnızca Edge | Günlük rate bucket hash salt'ı; yoksa server key kullanılır |
| `LIVE_CATALOGUE_FILE` | Opsiyonel regresyon testi | Testte kullanılacak katalog JSON dosya yolu; normal çalışmada gerekli değil |

`__SUPABASE_URL__`, `__SUPABASE_PUBLISHABLE_KEY__`, `__TURNSTILE_SITE_KEY__`
esbuild tarafından yerleştirilen sabit adlarıdır; ayrı ortam değişkenleri değildir.
Bu tablo kaynakta okunan isimleri gösterir. Hangi Edge secret override'ının gerçekten
tanımlı olduğunu iddia etmez; Supabase secrets listesi/değerleri okunmadı.

## 7. Yerel proje olarak kullanım

ZIP'i çıkar, klasörü VS Code'da aç; Node 22+ ile:

```sh
npm ci
npm run build
node scripts/serve-local.cjs
```

http://localhost:4173 üzerinden aç. `npm test` yerel testleri çalıştırır.
HTML/CSS değişikliği sonrası yenile; src veya public build ayarı sonrası tekrar
build et. Hazır bundle bulunduğundan sadece ekranı açmak için Node sunucusu yeterlidir.
Sunucu `dist/` dışındaki dosyaları servis etmez ve API proxy yapmaz.
Detaylı çalışma biçimi `README_LOCAL.md` dosyasındadır.

### Mevcut bağlantının sınırları

Yerel Edge kaynakları, `ALLOWED_ORIGINS` tanımlanmamışsa `https://taktikstudyo.com`
kullanır. Tanımlanan liste varsayılanın yerini alır; yalnızca açıkça listelenmiş
HTTPS origin'lerine izin verilir. Wildcard, kullanıcı bilgisi, path, query,
fragment ve boş/geçersiz girdiler reddedilir. Sondaki tek `/` normalize edilir;
tekrarlar kaldırılır. CORS yanıtında yalnızca tam eşleşen origin döndürülür.
Turnstile mevcut action/token/hostname kontrollerini aynı origin listesiyle sürdürür.

Bu yerel değişiklik production'a uygulanmadı. Onaylı bir geçişte Edge deployment,
mevcut `ALLOWED_ORIGINS` override'ı ve Cloudflare widget hostname izni ayrı ayrı
değerlendirilmelidir; burada canlı paylaşım için başarılı uçtan uca test iddiası yoktur.

Yerel katalog okuması public Supabase bağlantısını kullanabilir; paylaşım
backend'i ve Turnstile ise ek yerel geliştirme yapılandırması olmadan kullanılamaz.
Localhost taslakları canlı domain taslaklarından ayrıdır. Bu kopyayı düzenlemek
canlı siteyi otomatik yayınlamaz. Yeni Site, tablo veya Supabase projesi gerekmez.

## 8. Bu teslim için yapılan doğrulama

Sonuçlar `docs/DOSYA_ENVANTERI.md` sonundaki doğrulama bölümünde verilir.
Önceki BACKEND.md test/advisor notları tarihsel olarak korunmuştur; yeni
Security/Performance Advisor veya canlı mutasyon testleri bu dışa aktarma
işleminin parçası olarak çalıştırılmadı.
