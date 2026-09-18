# Turnstile için gereken iki gerçek değer

Public site key `0x4AAAAAAEyi1ASiQO5Ao9Nz`, frontend build ortamına eklendi.
Kullanıcı gerçek secret değerini Supabase Edge Function Secrets bölümüne eklediğini
bildirdi. Secret okunmadı veya istemci dosyalarına konulmadı. Sahte/test anahtarı
kullanılmadı. Aşağıdaki adımlar, yapılandırmanın referansıdır.

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Turnstile** → **Add widget**.
2. Widget adı: **Taktik Stüdyo**. Mod: **Managed**.
3. Hostname: **taktikstudyo.com**. Protokol/yol veya wildcard ekleme. Mevcut widget kullanılıyorsa bu hostname'in izinli olduğunu kontrol et.
4. **Create** sonrasında verilen iki değeri al:

| Değer | Nereye konacak? |
|---|---|
| **Site key** (public) | Frontend build ortamında `TURNSTILE_SITE_KEY`. Bunu sohbette paylaşabilirsin; siteyi bu değerle yeniden derleyip yayınlayabiliriz. |
| **Secret key** (gizli) | [Taktik Stüdyo → Edge Functions → Secrets](https://supabase.com/dashboard/project/zwhoailuklwtxaaawfaq/functions/secrets) içinde `TURNSTILE_SECRET_KEY` adıyla kaydet. Sohbete veya frontend dosyasına koyma. |

Widget action değeri kodda **share_lineup** olarak ayarlı. Sunucu aynı action ve
hostname'i zorunlu tutuyor. Kodda ek değişiklik gerekmeden sunucu secret'ı okuyacak;
frontend ise public site key ile yeniden derlenip yayınlanacak.

Supabase bağlantısı zaten modern, platformun sağladığı publishable/secret anahtarları
kullanıyor. `LINEUPS_PUBLISHABLE_KEY` ve `LINEUPS_SECRET_KEY` isteğe bağlı override
isimleridir; ayrıca oluşturulmaları gerekmez. Yerel Edge kaynaklarında
`ALLOWED_ORIGINS` tanımlanmamışsa `https://taktikstudyo.com` kullanılır; tanımlanmışsa
virgülle ayrılmış geçerli HTTPS origin listesi varsayılanın yerini alır. Wildcard,
kullanıcı bilgisi, path, query, fragment ve boş/geçersiz değerler reddedilir.
Turnstile hostname kontrolü bu izin listesine bağlı kalır. `LINEUPS_RATE_SALT`
verilmemişse mevcut server key, günlük istemci hash'lerinin sunucu tarafındaki salt
kaynağıdır; ayrı değişkenin varlığına dair bir iddia yoktur.

Domain geçişi yalnızca yerel kaynaklarda hazırlandı. Production Edge, environment
ve Cloudflare widget ayarları bu değişiklikte güncellenmedi. Yeni varsayılan,
production'da açıkça tanımlanmış eski bir `ALLOWED_ORIGINS` değerini geçersiz kılmaz.

Gerçek tarayıcıda widget/token ile oluşturma → `/?lineup=<id>` açma →
yenileme akışının canlı testi tamamlanmalıdır. Site şu an özel erişimli olduğundan
bağlantıyı açacak kişinin siteye erişim izni de bulunmalıdır.

Kaynaklar: [Cloudflare widget oluşturma](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/),
[Sunucu doğrulaması](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[Supabase Edge ortam değişkenleri](https://supabase.com/docs/guides/functions/secrets).
