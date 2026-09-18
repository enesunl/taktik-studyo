# Taktik Stüdyo — yerel kaynak proje

Bu klasör, Site sürüm 10'un 511 takip edilen dosyasını içerir. Orijinal kaynaklar,
package.json, lockfile, migration, Edge Function ve 473 PNG dosyası korunmuştur.
Yerel sunucu, VS Code çalışma alanı ve bu rehberler dışa aktarma için eklenmiştir.

## VS Code ile aç ve çalıştır

1. ZIP'i çıkar; `taktik-studyo-source` klasörünü VS Code'da **File → Open Folder**
   ile veya `taktik-studyo.code-workspace` dosyasını açarak kullan.
2. Bilgisayarında Node.js 22 veya üstü kurulu olmalı (`node --version`).
3. VS Code terminalinde proje kökünden:

```sh
npm ci
npm run build
node scripts/serve-local.cjs
```

4. Tarayıcıda **http://localhost:4173** aç. Sunucuyu durdurmak için Ctrl+C.
   Port doluysa `node scripts/serve-local.cjs 4174` kullan.

Paket, mevcut public Supabase ve Turnstile yapılandırmasını içeren `.env` ile gelir.
Bu dosyada yalnızca tarayıcıda kullanılabilen üç public değer vardır; server secret yoktur.
`.env.example` boş şablon olarak korunmuştur. `.env` eksikse şablondan oluştur;
mevcut Supabase projesinin URL ve **publishable** anahtarını gir. Üçünü de boş
bırakmak çevrimdışı katalog modunu üretir. Bir sonraki build yapılandırmayı bundle'a yazar.

Hazır `dist/backend.js` de pakette bulunduğundan, yalnızca arayüzü görmek için
bağımlılık kurmadan `node scripts/serve-local.cjs` çalıştırabilirsin.

## Hangi dosyayı düzenleyeceğim?

| İhtiyaç | Dosya |
|---|---|
| Ana ekranın HTML'i | `dist/index.html` |
| Karşılaştırma ekranının HTML'i | `dist/karsilastirma.html` |
| Renk, yerleşim, saha ve genel görünüm | `dist/styles.css` |
| Kadro, drag & drop, yedek değişimi, çizim, fullscreen | `dist/app.js` |
| İki kadronun oluşturulması ve karşılaştırma görünümü | `dist/comparison.js`, `dist/comparison.css` |
| Yedek statik oyuncu kataloğu | `dist/rosters.js` |
| Supabase okuma ve model dönüştürme | `src/lib/catalogue.js` |
| Supabase istemcisi | `src/lib/supabase.js` |
| localStorage kaydı | `src/lib/drafts.js` ve `dist/app.js` |
| Paylaşım arayüzü | `src/lib/sharing-ui.js` |
| Paylaşım isteği ve modüllerin birleşimi | `src/backend-entry.js` |
| Ortak veri doğrulama | `src/lib/validation.js` |
| Sunucudaki paylaşım ve Turnstile | `supabase/functions/lineups/` |

`dist/` bu projede yalnızca geçici build çıktısı değildir. Silme veya otomatik
temizleme uygulama: asıl arayüz kaynakları ve fotoğraflar burada tutulur.
**Yalnızca `dist/backend.js` üretilir; onu elle değiştirmek yerine `src/` düzenle.**
HTML/CSS ve diğer `dist/*.js` düzenlemelerinde tarayıcıyı yenile.
`src/` veya public `.env` değiştiğinde `npm run build` ardından yenile.
Bu sunucuda otomatik rebuild/HMR yoktur.

## Test ve backend sınırları

`npm test` mevcut dokuz yerel testi ve saha regresyon kontrolünü çalıştırır.
Veritabanı testi bellek içi PGlite kullanır; canlı Supabase'e migration uygulamaz.
Bağımlılık sürümleri `package-lock.json` ile sabittir.

Takım/oyuncu okuması mevcut Supabase'e public anahtarla bağlanır. Ağ/API hatasında
statik katalog kullanılır. Kadro düzenlemeleri localStorage'dadır; her harekette
veritabanına yazılmaz. Localhost'un localStorage'ı canlı sitenin kaydından ayrıdır;
farklı portlar da ayrı tarayıcı kayıt alanı oluşturur.

**Paylaşım origin yapılandırması:** yerel Edge kaynaklarında `ALLOWED_ORIGINS`
tanımlanmamışsa varsayılan `https://taktikstudyo.com` kullanılır. Tanımlanmışsa
virgülle ayrılmış HTTPS origin listesi varsayılanın yerini alır. Boş/geçersiz
girdiler, wildcard, kullanıcı bilgisi, path, query ve fragment reddedilir;
sondaki tek `/` normalize edilir. Alt domainler kendiliğinden izin kazanmaz.

`http://localhost:4173` bu yapılandırmada izinli değildir. Yerel sunucu CORS veya
Turnstile kısıtlarını aşan bir proxy içermez; ana kadro düzenleyicisi çalışır.
Bu kaynak değişikliği production'a deploy edilmedi. İleride onaylı geçişte mevcut
`ALLOWED_ORIGINS` override'ı ve Cloudflare widget'ının `taktikstudyo.com` hostname
izni ayrıca kontrol edilmelidir. Canlı paylaşım başarısı bu değişiklikle test edilmedi.

## Canlı sistemi koruyan çalışma biçimi

Bu kopyayı düzenlemek/build etmek canlı Site'yi kendiliğinden güncellemez.
Yerel sunucu sadece `dist/` servis eder; proje kökündeki `.env`, SQL veya kaynak
belgeler sunulmaz. Git geçmişi ve erişim token'ları pakette yoktur; otomatik push
ve deployment yoktur. `.openai/hosting.json` ve `supabase/project.json` mevcut
projenin kimliğini korur; yeni Site/proje oluşturulmadı.

SQL ve Edge dosyaları incelenebilir kaynak olarak dahil edildi. Mevcut backend'e
`seed.sql` veya başlangıç migration'ını yeniden uygulama. Yerel migration adı
`20260913062133_football_backend.sql`, canlı migration kaydı
`20260913063249 / football_backend`: içerik aynı, tarih kimliği farklıdır.
Bu durum gelecekteki backend deployment'ından önce ayrıca uzlaştırılmalıdır;
otomatik `db push` veya migration repair bu paket tarafından çalıştırılmaz.

`scripts/verify-live-backend.mjs` korunmuş eski canlı test aracıdır; normal
`npm test` akışında yoktur. Canlı API'ye yazma girişimleri gönderdiğinden bu
dışa aktarma doğrulamasında çalıştırılmadı. `scripts/prepare-seed.mjs` ise yalnızca
yerel seed dosyasını yeniden üretir; normal geliştirme için gerekli değildir.

Codex'te örneğin şöyle çalışabilirsin:

> Önce README_LOCAL.md ve docs/PROJE_REHBERI.md dosyalarını oku. Sadece yerel
> kaynaklarda istediğim değişikliği yap. Canlı Site'ye yayınlama, Supabase
> migration/seed/Edge deployment çalıştırma. dist içindeki düzenlenen kaynakları koru.

Tam dosya ağacı ve her dosyanın açıklaması: `docs/DOSYA_ENVANTERI.md`.
Kaynak doğrulaması ve ortam değişkenleri: `docs/PROJE_REHBERI.md`.
