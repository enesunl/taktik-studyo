# MVP yasal son kontrol listesi

Güncelleme: 15 Ekim 2026 (LEGAL2.1). Bu belge `LEGAL2_REVIEW.md` ve `LEGAL2_OPERATOR_CHECKLIST.md`'nin
yerini alır; ayrıntı ve gerekçe için onlara bakılabilir.

Beş yasal sayfa taslak olarak kalır: `noindex`, taslak notu ve 42 `[REVIEW REQUIRED]` işareti yerinde.

Etiketler:
- **[O] Operatör:** senin tamamlaman gereken.
- **[T] Teknik:** uygulama veya dağıtım işi.
- **[D] Dış doğrulama:** sağlayıcı veya hukukçu.

**🔴 = yayını engeller.**

## 1. Operatör kimliği ve iletişim

✅ Gerçek kişi operatör, şirket yok · ✅ `iletisim@taktikstudyo.com` (Google Workspace) çalışıyor

| | Yapılacak |
| --- | --- |
| 🔴 [O] | Adı soyadı, tebligata elverişli posta adresi ve varsa KEP'i ilet. Yazılı onayınla KVKK metni §1, Koşullar ve İletişim'e yazılır. KEP yoksa satır kaldırılır. |
| 🔴 [D] | Hukukçu: VERBİS kaydı/muafiyeti, 5651 tanıtıcı bilgi yükümlülüğü, ev adresi yerine alternatif adres kullanılıp kullanılamayacağı. |
| 🔴 [O] | Yürürlük tarihi: hukukçu onayından sonra beş sayfaya yazılır. |

## 2. KVKK ve yurt dışı aktarım

Aydınlatma metninde sağlayıcıların listelenmesi aktarımı hukuka uygun hâle **getirmez**. Aşağıdakiler tamamlanana kadar uyum varsayılmaz.

| | Yapılacak |
| --- | --- |
| 🔴 [D] | Her sağlayıcı için KVKK m.9 aktarım dayanağı belirlenip uygulanmalı ve metne yazılmalı: Supabase, Netlify, Cloudflare (Turnstile), Google Workspace, e-posta gönderim sağlayıcısı. Seçenekler: yeterlilik kararı, standart sözleşme ve Kurul'a bildirim, ya da istisna. |
| 🔴 [O] | Panellerden her sağlayıcının veri işleme sözleşmesini (DPA) kabul et ve kaydet: Supabase, Netlify, Cloudflare, Google Workspace (sözleşme tarafı Google kuruluşu ve veri bölgesi dahil), e-posta gönderim sağlayıcısı. |
| 🔴 [O] | Supabase › Authentication › SMTP ayarından gerçek e-posta gönderim sağlayıcısını ve konumunu bildir. Resend olduğu varsayılıyor; e-posta satırındaki işaret buna göre kapanır. |
| 🔴 [D] | Hukukçu: futbolcu verilerinin (ad, numara, mevki) işlenmesinin hukuki dayanağı ve aydınlatma yaklaşımı. |
| [T] + [D] | Turnstile'ın üretim anahtarıyla çerez veya depolama kullanıp kullanmadığını parola korumalı canlıda ölç. Çerez onayı gerekmediği değerlendirmesini hukukçu teyit etsin. |

## 3. Saklama ve hesap silme

✅ Uygulama içi hesap silme yayına alınacak · ✅ 8 eski paylaşım bağlantısı silinebilir test verisi (yayın migration'ı kaldırır)

| | Yapılacak |
| --- | --- |
| 🔴 [T] | Hesap silme ve paylaşım sahipliğini canlıya al. Sırası: migration'lar (`20261014150000` dahil) → `lineups` → `account-delete` (`PROD1_RELEASE_PLAN.md`). Ardından üç sayfadaki hesap silme işaretleri kapanır. |
| 🔴 [O] | Saklama sürelerini karara bağla: paylaşım bağlantıları (hesap açık kaldıkça mı, sabit süre mi; sabit süre migration gerektirir), e-posta yazışmaları ve KVKK başvuru kayıtları. |
| 🔴 [O] | Supabase, Netlify ve e-posta sağlayıcısının günlük ve yedek saklama sürelerini panellerden bildir. Üç sayfadaki "süreler doğrulanmalı" işaretleri buna bağlı. |
| [O] | KVKK başvuru kaydını depo dışında oluştur; 30 gün takibi için `DATA_REQUEST_PROCEDURE.md` §7. |
| [O] | İsteğe bağlı: pasif hesaplar için süre (ör. 24 ay işlemsizlik → bildirim → silme). |

## 4. BSD lisansı ve futbol verisi

✅ Maçlar MVP'de · ✅ BSD kataloğu eski FotMob verisinin yerini alıyor

| | Yapılacak |
| --- | --- |
| 🔴 [D] | Hukukçu: BSD lisansı 4.0'ın yayın kullanımına, kullanıcı paylaşım bağlantılarına ve PNG dışa aktarımlarına uygunluğu. İsteğe bağlı: BSD'den yazılı onay. |
| 🔴 [O] | BSD planı ve token (Unlimited önerilir): canlı katalog içe aktarımı ve `matches` için gerekli. |
| 🔴 [T] | BSD geçişini canlıya al: katalog migration'ları ve içe aktarım → `matches` → BSD frontend. Yeni frontend yalnızca içe aktarım doğrulandıktan sonra yayına girer. |
| 🔴 [T] | SEC1: canlıdaki eski FotMob tablolarının anonim okunması kapatılmalı. Migration hazır, onay bekliyor. |
| [D] | Hukukçu: geçmişteki FotMob verisi kullanımı için ayrıca yapılacak bir şey var mı? |

## 5. Kullanım Koşulları ve yaş politikası

| | Yapılacak |
| --- | --- |
| 🔴 [O] + [D] | Yaş politikası: asgari yaş, 18 altı için veli bilgisi/onayı, kayıtta yaş beyanı gerekip gerekmediği. İşaretler Gizlilik ve Koşullar'da. |
| 🔴 [D] | Hukukçu: sorumluluk sınırlaması, yetkili mahkeme ve icra daireleri, 6502 sayılı Kanun'un uygulanabilirliği, kulüp ve oyuncu adlarının kullanımı (Koşullar §5, §8, §10). |
| [O] | Koşulları kabul şu an yalnızca tarayıcıda kontrol ediliyor. Hukukçu yeterli bulmazsa sunucu kaydı gerekir (migration). |

## 6. Canlı özelliklerle tutarlılık

Metinler MVP yayın yapılandırmasını anlatır. Dört sayfadaki kapsam notu, canlıda henüz olmayanları sayar: favori takım ve tanıtım, Haftanın İlk 11'i, Maçlar, BSD kataloğu, hesap silme, girişli paylaşım.

| | Yapılacak |
| --- | --- |
| 🔴 [T] | Kapsam notundaki her özellik canlıya alınır ve yayın günü doğrulanır (`PROD1_RELEASE_PLAN.md`). Alınmayan özellik metinden çıkarılır. |
| 🔴 [T] | Son metin geçişi, yalnızca hukukçu onayı ve senin ayrı onayınla yapılır: kimlik bilgileri, yürürlük tarihi, yalnızca çözülmüş işaretlerin kaldırılması, kapsam notu, taslak notu ve `noindex`. |
