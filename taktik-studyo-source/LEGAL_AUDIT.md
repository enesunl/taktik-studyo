# LEGAL1 / LEGAL1.1 — Kişisel veri ve yasal hazırlık denetimi

İlk denetim: 14 Ekim 2026 (LEGAL1). Teknik temizlik ve doğrulama: 14 Ekim 2026 (LEGAL1.1).
Kapsam: `release/netlify-migration` dalındaki kaynak kod, migration'lar, Edge Function kaynakları,
`dist/` dosyaları, depo belgeleri; ayrıca LEGAL1.1'de yalnızca okuma amaçlı canlı kontroller
(HTTP başlıkları, DNS kayıtları, Supabase proje meta verisi, tarayıcıda çerez/depolama ölçümü).
Hiçbir canlı ayar, veri veya dağıtım değiştirilmedi.

> Bu belge bir teknik bulgu kaydıdır, hukuki görüş değildir. Yasal metinler taslaktır ve KVKK/bilişim
> hukuku alanında uzman bir hukukçu tarafından incelenip onaylanmadan yayımlanmamalıdır.

İşaretler: **[DOĞRULANDI]** kodda veya canlı kontrolde görüldü · **[DOĞRULANMADI]** erişim olmadığı için
kontrol edilemedi · **[REVIEW REQUIRED]** operatör veya hukukçu kararı gerekli.

## 1. Operatör ve hizmet

| Konu | Durum |
| --- | --- |
| Platform | Taktik Stüdyo — `taktikstudyo.com` |
| İşleten | Türkiye'de yerleşik gerçek kişi; şirket yok (operatör beyanı) |
| Ücret | Ücretsiz; ödeme/abonelik kodu yok [DOĞRULANDI] |
| Yayın durumu | Canlı alan adı Netlify üzerinde parola korumalı: `https://taktikstudyo.com/` → `401 Unauthorized` [DOĞRULANDI, 14.10.2026] |
| İletişim e-postası | `iletisim@taktikstudyo.com` (operatör bildirimi, LEGAL1.2). **Alan adında MX kaydı yok**; adres şu an posta alamaz [DOĞRULANDI, 14.10.2026] |
| Veri sorumlusu adı-soyadı, tebligat adresi, (varsa) KEP | Depoda yok → **[REVIEW REQUIRED]** |
| VERBİS | Gerçek kişi, küçük ölçek; muafiyet hukukçu tarafından teyit edilmeli **[REVIEW REQUIRED]** |

## 2. İşlenen kişisel veriler (kodla doğrulandı)

| Veri / tablo | İçerik | Silme / düzeltme durumu |
| --- | --- | --- |
| Supabase Auth kullanıcısı | E-posta, şifre (Supabase hash'i), `user_metadata.username`, doğrulama/oturum zamanları | Hesap silme yok; e-posta değiştirme yok |
| `public.profiles` | `username`, `display_name`, `favorite_team_slug`, `onboarding_completed_at`, `onboarding_version`, zaman damgaları (`avatar_url` kullanılmıyor) | Ad/görünen ad/favori takım profilde düzenlenebilir; Auth kullanıcısı silinince `on delete cascade` |
| `public.studio_projects` | Çalışma başlığı, mod, maç/hafta, kadro ve çizim anlık görüntüsü | Kullanıcı silebilir; cascade |
| `public.weekly_lineups` | Başlık, sezon/hafta, diziliş, 11'lik anlık görüntü | RLS silmeye izin veriyor, **arayüzde silme yok**; cascade |
| `public.player_overrides` | Oyuncu adı/numara/rol düzeltmeleri | Arayüzden sıfırlanabilir; cascade |
| `public.shared_lineups` | Paylaşılan kadro (takım adı, diziliş, oyuncu adları, çizimler) | Hosted (şu an): **sahipsiz, süresiz**; bağlantıyı bilen herkes görür. ACCOUNT1 migration'ı (yerelde uygulandı, hosted'da onay bekliyor) eski sahipsiz bağlantıları siler ve `owner_id NOT NULL … ON DELETE CASCADE` ekler. Sonrasında bağlantılar hesapla birlikte silinir. |
| `tactics_private.share_limits` | IP'nin günlük tuzlu SHA-256 özeti + sayaç (ham IP saklanmaz) | 2 günden eski satırlar her paylaşımda silinir |
| Sağlayıcı günlükleri | Supabase/Netlify erişim ve Auth günlükleri (IP, tarayıcı, zaman) | Süreler **[DOĞRULANMADI]** |

Özel nitelikli veri, konum, ödeme veya fotoğraf yüklemesi yok. Yaş doğrulaması yok.

## 3. Dış servisler ve veri akışları (LEGAL1.1 doğrulaması)

| Servis | Kanıt | Veri akışı | Bilinmeyen |
| --- | --- | --- | --- |
| **Netlify** (hosting) | `Server: Netlify`, `X-Nf-Request-Id` başlıkları; `www` → CNAME `singular-madeleine-6f3c29.netlify.app`; apex A kaydı `75.2.60.5` [DOĞRULANDI] | Tüm sayfa/varlık istekleri: IP, user-agent, URL, zaman | Netlify hesabı/planı, log saklama süresi, DPA kabulü, parola koruması kaldırıldıktan sonraki davranış. `.openai/hosting.json` eski Sites projesine işaret ediyor (repo kaydı, üretim değil). |
| **DNS / alan adı** | NS: `ns1/ns2.metunic.com.tr` [DOĞRULANDI] | Kişisel veri akışı yok | — |
| **Supabase** | `get_project`: bölge `eu-central-1` (Frankfurt), Postgres 17, `ACTIVE_HEALTHY` [DOĞRULANDI, salt okuma]. API yanıtları `Server: cloudflare`, `sb-project-ref` | Auth, veritabanı, Edge Functions; API Cloudflare ağı üzerinden | Plan, yedek/günlük saklama süreleri, DPA ve alt işleyici listesi kabulü |
| **Supabase Edge Functions** | Canlıda yalnızca `lineups` (v6, ACTIVE, `verify_jwt:false`) [DOĞRULANDI] | Paylaşım oluşturma/okuma; Turnstile doğrulaması | `matches` canlıda **yok** → Bzzoiro maç verisi akışı üretimde şu an çalışmıyor |
| **Cloudflare Turnstile** | Kodda yalnızca "Kadroyu paylaş" akışında yüklenir; sunucu doğrulaması `remoteip` göndermez [DOĞRULANDI: kod] | Tarayıcı → `challenges.cloudflare.com` (IP, cihaz sinyalleri) | Üretim site anahtarıyla çerez/depolama davranışı |
| **E-posta gönderimi** | DNS: `resend._domainkey` TXT (DKIM), `send.taktikstudyo.com` → CNAME `send.forge.rmta.net` (MX `feedback.forge.rmta.net`), `_dmarc` kaydı [DOĞRULANDI]. Kök alan adında MX yok | Doğrulama/şifre sıfırlama e-postaları: alıcı e-posta adresi | Supabase Auth'un özel SMTP ile bu alan adını (Resend?) kullandığı **doğrulanamadı** (Auth SMTP ayarı connector ile okunamıyor). `rmta.net` altyapısının sahibi teyit edilmeli. |
| **Google Fonts** | LEGAL1.1'de **kaldırıldı**: `styles.css` artık `dist/fonts/` içindeki yerel WOFF2 dosyalarını kullanıyor | Yok | — |
| **Bzzoiro Sports Data** | Yalnızca `matches` Edge Function kaynağında; sunucudan sunucuya, kişisel veri yok | Üretimde etkin değil (fonksiyon dağıtılmamış) | — |

## 3a. Hosted veritabanı ilişkileri ve şema farkı (LEGAL1.2, salt okuma)

- `auth.users`'a bağlı yabancı anahtarlar: `profiles_id_fkey`, `studio_projects_user_id_fkey`,
  `player_overrides_user_id_fkey`. Üçü de **ON DELETE CASCADE** [DOĞRULANDI: `pg_constraint`].
- `shared_lineups` ve `tactics_private.share_limits` kullanıcıya bağlı değil; hesap silmeden etkilenmez.
- Storage: 0 bucket, 0 dosya.
- Sayımlar (yalnızca sayı okundu): 2 Auth kullanıcısı, 1 profil, 2 çalışma, 2 oyuncu düzeltmesi,
  8 paylaşılan kadro (hepsinde `expires_at` boş).
- **Şema farkı:** Hosted ortamda yalnızca ilk 5 migration var. Şunlar uygulanmamış:
  `catalogue_identity_foundation`, `profile_onboarding_foundation` (favori takım/onboarding),
  `weekly_lineups`, `weekly_snapshot_validation`. Yasal metinler bu özelliklerin yayında olacağını
  varsayıyor; yayından önce şema ile metinler eşitlenmeli (migration ayrı onay gerektirir).
- Uygulamalı talep prosedürü: `DATA_REQUEST_PROCEDURE.md`.

## 4. Çerez ve tarayıcı depolama denetimi

### Uygulamanın kendi depolaması [DOĞRULANDI]

Kod `document.cookie` kullanmaz. Anahtarlar: `taktik:auth:<host>:v1` (oturum, zorunlu),
`taktik:theme:v1` (tercih), `taktik:draft:*` / `taktik:studio:autosave:*` / `taktik:weekly-xi:*`
(talep edilen işlev), `taktik:studio:recovery:*` (sessionStorage), `taktik:match-studio:*` (tercih).
Şifre sıfırlama istemcisi oturumu yalnızca bellekte tutar (`persistSession:false`).

### Tarayıcı ölçümleri (headless Chrome, 14.10.2026)

| Ölçüm | Sonuç |
| --- | --- |
| Yerel geliştirme sunucusu: `/`, giriş, kayıt, iki yasal sayfa, korumalı sayfalar (girişe yönlenen) | Yalnızca `localhost` istekleri; **sıfır çerez**; dört yerel font dosyası 200 ile yüklendi |
| Uygulama ile aynı biçimde (kimlik bilgisi olmadan) Supabase API'sine çapraz kaynak isteği | Yanıt `Set-Cookie: __cf_bm` içeriyor, ancak tarayıcı **saklamadı** (credentials gönderilmeyen isteklerde çapraz kaynak çerezleri yok sayılır) |
| Cloudflare Turnstile, Cloudflare'in herkese açık **test** site anahtarı ile | Token üretildi; **çerez saklanmadı**, sayfa kaynağında depolama kullanımı 0. Üretim anahtarı davranışı farklı olabilir → **[DOĞRULANMADI]** |
| Netlify canlı yanıtı (parola korumalı 401) | `Set-Cookie` yok. Parola girildiğinde Netlify'ın oturum çerezi kullanması beklenir; bu yalnızca yayın öncesi koruma içindir |

### Çerez bandı gerekliliği

Mevcut durumda reklam, analitik veya profil çıkaran bir teknoloji yok; uygulamanın depolaması
zorunlu ya da kullanıcının seçtiği tercihlere ilişkin; Google Fonts kaldırıldı; Turnstile yalnızca
kullanıcının başlattığı paylaşım işleminde güvenlik amacıyla yükleniyor. Bu nedenle **çerez bandı
eklenmedi ve şu an için gerekli görünmüyor** (hukukçu teyidi önerilir). Bant, şu durumlarda yeniden
değerlendirilmeli: analitik/izleme eklenmesi, üçüncü taraf gömülü içerik (video, sosyal medya),
Turnstile üretim anahtarının kalıcı çerez/depolama kullandığının tespit edilmesi.

## 5. Yurt dışı aktarım (KVKK m.9)

Netlify (ABD), Supabase (ABD merkezli; veriler Frankfurt'ta, Cloudflare ağı), Cloudflare (ABD) ve
e-posta sağlayıcısı (muhtemelen Resend, ABD — doğrulanmalı) için aktarım mekanizması belirlenmeli:
uygun güvence (ör. Kurul'un standart sözleşmesi ve imzadan sonra 5 iş günü içinde Kurul'a bildirim)
veya m.9/6 kapsamındaki arızi istisnalar. Depoda hiçbir sözleşme/bildirim kaydı yok →
**[REVIEW REQUIRED — en yüksek öncelik]**. Google Fonts kaldırıldığı için Google bu listeden çıktı.

## 6. Eksik süreçler ve önerilen asgari çözümler (uygulanmadı)

| Süreç | Önerilen asgari çözüm | Migration? | Risk / onay |
| --- | --- | --- | --- |
| **Hesap silme** | Kısa vade: kayıtlı e-postadan gelen talebi doğrula → Supabase Dashboard › Authentication › Users › kullanıcıyı sil. FK `on delete cascade` profil, çalışma, 11 ve düzeltmeleri siler. Talep/yanıt tarihleri özel bir kayıtta tutulur. Orta vade: `verify_jwt` açık bir `delete-account` Edge Function'ı (`auth.admin.deleteUser(user.id)`, yeniden kimlik doğrulama + yazılı onay) ve profilde "Hesabımı sil". | Hayır | Yıkıcı; ayrı onay gerekir |
| **Veri dışa aktarma** | Profilde "Verilerimi indir": tarayıcı, RLS'in zaten izin verdiği kendi `profiles`, `studio_projects`, `weekly_lineups`, `player_overrides` satırlarını ve oturumdaki e-postayı JSON olarak indirir. | Hayır | Yıkıcı değil |
| **E-posta değiştirme** | `supabase.auth.updateUser({email})` + "Secure email change" (iki adresten onay); yönlendirme izin listesi kontrolü. | Hayır | Auth yapılandırması gözden geçirilmeli |
| **Haftanın İlk 11'i silme** | `/ilk-11lerim` listesine Çalışmalarım'daki gibi onaylı "Sil" eylemi (RLS delete politikası mevcut). | Hayır | Kullanıcı kendi kaydını siler |
| **Paylaşılan kadro saklama** | Kısa vade: talep gelirse `public_id` ile manuel silme. Kalıcı: `create_shared_lineup` RPC'sinin `expires_at` (ör. 12 ay) yazması + periyodik temizlik; okuma tarafı süresi dolanı zaten 404 döndürüyor. | **Evet** (RPC değişikliği) | Ayrı onay |
| **Pasif hesap / genel saklama** | Politika kararı: ör. 24 ay işlem yapılmayan hesaba e-posta bildirimi, ardından silme. Sağlayıcı yedek/günlük süreleri öğrenilip metinlere yazılmalı. | Belki | **[REVIEW REQUIRED]** |
| **Koşulları kabul kaydı** | Seçenek A (migration yok): `signUp` çağrısında `options.data` içine `terms_version` ve `terms_accepted_at` eklemek — `auth.users.raw_user_meta_data`'da saklanır, ancak kullanıcı tarafından değiştirilebildiği için zayıf kanıttır. Seçenek B (önerilen): yalnızca ekleme yapılabilen `public.terms_acceptances(user_id, terms_version, accepted_at)` tablosu + ilk girişte/profil oluşturmada yazım; Koşullar değişince yeniden kabul. | A: Hayır · B: **Evet** | Kayıt yükü değişir; ayrı onay |
| **KVKK başvuru kaydı** | Başvuru tarihi, kimlik doğrulama yöntemi, yanıt tarihi ve sonuç için repo dışı özel kayıt (30 gün süresi takibi). | Hayır | Operatör süreci |

## 7. Kalan hukuki engeller

1. `iletisim@taktikstudyo.com` için gelen posta altyapısı yok (MX kaydı yok). Posta kutusu, MX/SPF/DMARC
   kurulmalı ve teslim test edilmeli; aksi hâlde KVKK başvuru kanalı çalışmaz.
2. Veri sorumlusu kimliği (ad-soyad, tebligat adresi, varsa KEP); 5651 m.3 tanıtıcı bilgi
   yükümlülüğü ve VERBİS muafiyeti değerlendirmesi.
3. KVKK m.9 yurt dışı aktarım mekanizması (Netlify, Supabase, Cloudflare, e-posta sağlayıcısı).
4. E-posta gönderim sağlayıcısının ve Supabase Auth SMTP ayarının teyidi.
5. Sağlayıcı sözleşmeleri/DPA'lar, log ve yedek saklama süreleri.
6. Uygulama içi hesap silme, veri dışa aktarma, e-posta değiştirme ve 11 silme süreçleri. Şimdilik
   `DATA_REQUEST_PROCEDURE.md` ile manuel yürütülüyor (bölüm 6).
7. Paylaşılan kadroların saklama süresi ve Koşullar kabul kaydı (migration onayı gerekir).
8. Hosted şemanın depodaki migration'larla eşitlenmesi (favori takım, Haftanın İlk 11'i) veya
   metinlerin yayındaki özelliklere göre daraltılması.
9. 18 yaş altı politikası, sorumluluk sınırlaması, yetkili mahkeme, kulüp/oyuncu adı ve üçüncü taraf
   veri kullanımı (hukukçu incelemesi).
10. Turnstile'ın üretim anahtarıyla çerez/depolama davranışı.

## 8. Değişiklik geçmişi

- **LEGAL1:** Beş taslak yasal sayfa (`noindex`, `[REVIEW REQUIRED]` işaretli), `legal.css`, ana sayfa/
  giriş/kayıt bağlantıları, kayıt formunda ayrı ve işaretsiz Kullanım Koşulları onayı.
- **LEGAL1.1:** Google Fonts yerel barındırmaya alındı (`dist/fonts/`, OFL lisans metinleriyle); yerel
  sunucuya `.woff2` MIME türü eklendi; yasal taslaklarda barındırma sağlayıcısı Netlify olarak
  güncellendi, Google alıcılardan çıkarıldı, çerez bulguları ve e-posta sağlayıcısı belirsizliği
  işlendi. Veritabanı, migration, canlı ayar veya dağıtım değişikliği yapılmadı.
- **LEGAL1.2:** `iletisim@taktikstudyo.com` beş taslağa ve ortak alt bilgiye eklendi (ad, adres ve KEP
  `[REVIEW REQUIRED]` olarak kaldı). İletişim sayfasına erişim, düzeltme ve silme talep adımları
  eklendi; `DATA_REQUEST_PROCEDURE.md` iç prosedürü oluşturuldu. Hosted FK kuralları ve şema farkı
  salt okuma sorgularıyla doğrulandı. Hesap silme, migration veya veri değişikliği yapılmadı.
