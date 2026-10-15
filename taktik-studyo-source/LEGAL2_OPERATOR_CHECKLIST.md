# LEGAL2 — Operatörden beklenen bilgiler ve kararlar

> **LEGAL2.1:** Güncel ve tek eylem listesi `MVP_LEGAL_FINAL_CHECKLIST.md`. Karara bağlananlar:
> - gerçek kişi operatör, şirket yok;
> - `iletisim@taktikstudyo.com` çalışıyor (A5);
> - Maçlar MVP'de (B10);
> - BSD, FotMob kataloğunun yerini alıyor;
> - 8 eski paylaşım bağlantısı test verisi (B3);
> - uygulama içi hesap silme yayına alınacak.

Hazırlanma: 15 Ekim 2026. Bu liste yasal taslakların tamamlanması için **senden** gelmesi gereken
bilgileri sayar. Hiçbir bilgi tahmin edilmedi veya depoya eklenmedi.

> **Kimlik bilgileri depoya ayrı onay olmadan yazılmaz.** Ad, adres ve KEP bilgisi yayımlanacak sayfalara
> girer (KVKK m.10 aydınlatma). Bilgileri bana ilettiğinde, hangi dosyalara yazılacağını göstermem ve
> senin ayrıca onaylaman gerekir. İstersen bu alanları kendin doldurabilirsin; yerler aşağıda.

## A. Kimlik ve iletişim (yayın için zorunlu)

| # | Bilgi | Nerede kullanılıyor | Not |
| --- | --- | --- | --- |
| A1 | Veri sorumlusunun **adı soyadı** (gerçek kişi) | `kvkk-aydinlatma-metni.html` §1, `kullanim-kosullari.html` giriş, `iletisim.html` | Şirket yoksa gerçek kişi adı. Ticari unvan/marka adı tek başına yetmez. |
| A2 | **Tebligata elverişli posta adresi** | `kvkk-aydinlatma-metni.html` §1, `iletisim.html` | Islak imzalı KVKK başvuruları bu adrese gelir. Ev adresi yerine başka bir adres (ör. sanal ofis, avukat adresi) kullanılabilir mi? → hukukçuya sor (B9). |
| A3 | **KEP adresi** (varsa) | Aynı iki sayfa | Yoksa satır kaldırılır. Gerçek kişi için KEP zorunlu değildir (hukukçu teyidi). |
| A4 | **Yürürlük tarihi** | Beş sayfanın başlığı | Hukukçu onayından ve canlı eşitlemeden sonra verilir. |
| A5 | İletişim e-postası | `iletisim@taktikstudyo.com` | ✅ Tamam: Google Workspace (MX/SPF/DMARC doğrulandı, gönderme/alma senin testinle doğrulandı). |

## B. Kararlar

| # | Karar | Seçenekler / not |
| --- | --- | --- |
| B1 | **Yaş politikası** | Örn. 13+, 16+ veya 18+; 18 altı için veli bilgisi/onayı. Kayıtta yaş beyanı alınacak mı? Hukukçu ile. |
| B2 | **Paylaşım bağlantısı saklama süresi** | Hesap açık kaldıkça (şu anki taslak) veya sabit süre (ör. 12 ay; migration gerektirir). |
| B3 | ✅ **Karara bağlandı (LEGAL2.1):** 8 eski bağlantı silinebilir test verisi | Yayın migration'ı `20261014150000` ile kaldırılır (dağıtım onayıyla). |
| B4 | **Yazışma ve KVKK başvuru kayıtları saklama süresi** | Örn. başvuru sonuçlandıktan sonra zamanaşımı süresince; kimlik belgesi kopyaları işlem bitince silinir. |
| B5 | **Pasif hesaplar** | Süresiz mi, yoksa ör. 24 ay işlemsizlikten sonra bildirim + silme mi? |
| B6 | **Yetkili mahkeme / icra daireleri** | İkametgâhına göre hukukçu belirler; tüketici mevzuatı ayrıca değerlendirilir. |
| B7 | **Koşulları kabul kaydı** | Şu an kabul yalnızca tarayıcıda kontrol ediliyor, kayıt tutulmuyor. Sunucuda kayıt (migration) gerekli mi? |
| B8 | **Çerez onayı** | Mevcut değerlendirme: onay bandı gerekmiyor (yalnızca zorunlu/tercih depolaması). Hukukçu teyidiyle kabul. |
| B9 | **Adres seçimi** | A2 için ev adresi mi, alternatif adres mi? |
| B10 | ✅ **Karara bağlandı (LEGAL2.1):** Maçlar MVP'de kalır | BSD lisans onayı ve `matches` dağıtımı yayından önce tamamlanmalı. |

## C. Hesap panellerinden doğrulaman gerekenler (buradan erişim yok)

| # | Sağlayıcı | Kontrol edilecek | Neden |
| --- | --- | --- | --- |
| C1 | **Supabase** | Plan; yedek ve PITR süresi; Auth/API günlük süreleri; DPA'nın kabul edilip edilmediği (Dashboard › Organization › Legal/Documents); alt işleyici listesi | Saklama süreleri ve KVKK m.9 dayanağı |
| C2 | **Supabase Auth SMTP** | Authentication › SMTP Settings: hangi sağlayıcı (Resend?), gönderen adres, şablonlar | E-posta gönderim sağlayıcısı metinde hâlâ belirsiz |
| C3 | **E-posta gönderim sağlayıcısı** (Resend olduğu varsayılıyor) | Hesap sahibi, DPA, veri bölgesi, gönderim günlüğü süresi; `send.forge.rmta.net` kaydının bu sağlayıcıya ait olduğu | Alıcı/aktarım tablosu |
| C4 | **Netlify** | Plan, hesap sahibi, DPA kabulü, erişim günlüğü süresi, parola korumasının kapsamı (deploy önizlemeleri dahil mi) | Alıcı tablosu, saklama |
| C5 | **Google Workspace** | Sürüm; sözleşme tarafı Google kuruluşu (fatura/sözleşme sayfası); Admin Console'da Cloud Data Processing Addendum kabulü; veri bölgesi ayarı (varsa); posta kutusuna kimlerin eriştiği; iki adımlı doğrulama | Yeni alıcı; KVKK başvuruları bu posta kutusunda tutuluyor |
| C6 | **Cloudflare (Turnstile)** | Hesap, DPA; üretim site anahtarıyla Turnstile'ın çerez/depolama kullanıp kullanmadığı (parola korumalı canlıda tarayıcı geliştirici araçlarıyla bakılabilir) | Çerez politikası işareti |
| C7 | **BSD (Bzzoiro)** | Plan (Free/Unlimited); lisans sürümü 4.0'ın kabul tarihi; hesap e-postası; isteğe bağlı yazılı onay (tüketici web uygulamasında gösterim, kullanıcı paylaşımları, PNG dışa aktarım) | Spor verisi lisansı |

## D. Operasyonel

| # | Yapılacak |
| --- | --- |
| D1 | KVKK başvuru kaydını depo dışında, erişimi kısıtlı bir yerde oluştur (`DATA_REQUEST_PROCEDURE.md` §7). |
| D2 | Posta kutusunda başvurular için bir etiket/klasör ve 30 günlük süre takibi. |
| D3 | Hesap silme yayına alınana kadar manuel silme prosedürünü (`DATA_REQUEST_PROCEDURE.md` §5) kullan. |
| D4 | Bilgileri ilettiğinde, kimlik alanlarını yazmadan önce yazılı onayını iste (bkz. üstteki not). |
