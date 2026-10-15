# LEGAL2 — Nihai inceleme paketi (operatör ve hukukçu için)

> **LEGAL2.1:** Güncel ve tek eylem listesi `MVP_LEGAL_FINAL_CHECKLIST.md` (6 başlık, yayın engelleri işaretli). Bu belge gerekçe ve ayrıntı için arşivdir. LEGAL2.1'de iki gereksiz işaret kaldırıldı (42 kaldı).

Hazırlanma: 15 Ekim 2026. Kapsam: beş taslak yasal sayfa (`dist/kvkk-aydinlatma-metni.html`,
`gizlilik-politikasi.html`, `kullanim-kosullari.html`, `cerez-politikasi.html`, `iletisim.html`),
`LEGAL_AUDIT.md`, `DATA_REQUEST_PROCEDURE.md`, `MATCHES_RELEASE_REVIEW.md`, `PROD1_RELEASE_PLAN.md`.

> Bu belge teknik bir hazırlık kaydıdır, hukuki görüş değildir.
> - Metinler taslaktır: `noindex`, taslak notu ve `[REVIEW REQUIRED]` işaretleri yerinde duruyor.
> - Hukukçu onayı ve operatör kararı olmadan yayımlanmamalıdır.
> - Hiçbir izin, güvence veya sözleşme varmış gibi yazılmadı.

## 1. Canlı ile planlanan yapılandırma (15.10.2026)

Metinler **yayın için planlanan** hizmeti anlatır. Bu ayrım dört sayfanın başında ayrı bir
`[REVIEW REQUIRED]` kapsam notuyla belirtildi.

| Özellik / veri akışı | Canlı (taktikstudyo.com, parola korumalı) | Yerelde hazır, canlıda yok |
| --- | --- | --- |
| Hesap, giriş, profil (kullanıcı adı, görünen ad) | Var | — |
| Stüdyo çalışmaları, oyuncu düzeltmeleri | Var | Düzeltmeler BSD iç kimliğiyle (`internal:`) |
| Favori takım ve tanıtım akışı | Yok (migration uygulanmadı) | Var |
| Haftanın İlk 11'i kayıtları | Yok (migration uygulanmadı) | Var |
| Oyuncu verisi | **Eski FotMob anlık görüntüsü** (giriş yapanlara açık) | BSD kataloğu (`catalogue_*`, yalnızca giriş yapanlara) |
| Maçlar (BSD maç verisi) | Yok (`matches` dağıtılmadı; lisans koşulları açık) | Var |
| Kadro paylaşımı | Var: **girişsiz**, Turnstile ile; bağlantılar hiçbir hesapla ilişkili değil, süresiz (8 test bağlantısı) | Giriş zorunlu; bağlantı hesaba bağlı, hesapla birlikte silinir |
| Uygulama içi hesap silme | Yok | Var (`account-delete`) |
| İletişim e-postası | Var: Google Workspace | — |
| Yazı tipleri | Kendi sunucusundan (Google Fonts yok) | — |
| Anonim okuma kısıtı (SEC1) | Eski katalog tabloları **anonim okunabilir** | Kapalı |

## 2. LEGAL2'de çözülen konular

1. **Talep kanalı çalışıyor.** `iletisim@taktikstudyo.com` → Google Workspace (MX `smtp.google.com`, SPF, DMARC `p=none`; DNS ile doğrulandı, gönderme/alma operatör testiyle). LEGAL_AUDIT §7'deki 1. engel kapandı.
2. **Google Workspace alıcı olarak eklendi.** KVKK metnine (alıcılar tablosu ve "Yazışmalar ve başvurular" veri kategorisi) ve Gizlilik Politikası'na eklendi. Bu, LEGAL1.1'deki "Google yok" ifadesinin yerini aldı; Google Fonts hâlâ yok.
3. **Supabase sunucu bölgesi doğrulandı.** Frankfurt (eu-central-1); işaret kaldırıldı. Yerine DPA ve alt işleyici doğrulaması işareti kondu.
4. **Spor verisi kaynağı adlandırıldı.** BSD Sports Data; "resmî lig, kulüp veya federasyon verisi değildir" ifadesi eklendi (BSD lisansı §7 ile uyumlu).
5. **Koşullara açık bir yasak eklendi:** sağlayıcı verisini toplu kopyalamak, ham veri olarak yeniden dağıtmak veya veri hizmeti kurmak (lisans §4'ün dağıtım kısıtıyla uyumlu). Kullanıcıya yeni bir izin **verilmedi**.
6. **Paylaşım bağlantısı saklama ifadesi düzeltildi.** "Hesaba bağlı, hesapla silinir" ifadesi planlanan davranış olarak işaretlendi; canlıdaki ilişkisiz test bağlantıları açıkça belirtildi.
7. **Yazışma ve başvuru kayıtlarının saklama süresi açık nokta olarak eklendi.**
8. **Koşullara kullanıcı içeriği sorumluluğu eklendi:** oyuncu düzeltmelerinin yalnızca kullanıcının hesabında göründüğü (doğrulandı: satır düzeyi erişim); paylaşılan kadro ve dışa aktarılan görsellerdeki içerikten kullanıcının sorumlu olduğu.
9. **Taslak tarihleri 15 Ekim 2026'ya güncellendi.** `DATA_REQUEST_PROCEDURE.md` §0/§6/§8 ve `LEGAL_AUDIT.md` eşitlendi.
10. **Çerez/depolama tablosu kodla yeniden doğrulandı.** Uygulama çerez yazmaz; tabloda listelenen anahtarlar koddaki anahtarlarla aynı. `taktik:recovery:` yalnızca bellek içi şifre sıfırlama istemcisinin ad alanıdır (kalıcı yazılmaz).

## 3. Kalan işaretler — konuya göre (44 işaret, 28 farklı)

| Konu | İşaretler (sayfa) | Kim çözer |
| --- | --- | --- |
| **Operatör kimliği ve iletişim** | Ad Soyad (KVKK, Koşullar, İletişim); tebligat adresi (KVKK, İletişim); KEP (KVKK, İletişim); yürürlük tarihi (5 sayfa) | Operatör (A1–A4), onaydan sonra |
| **Canlı / planlanan kapsam** | Kapsam notu (KVKK, Gizlilik, Koşullar, İletişim) | Yayın günü canlı durumla eşitleme |
| **KVKK amaçlar ve hukuki sebepler** | Ayrı işaret yok; bölüm 5'teki sorular | Hukukçu |
| **Yurt dışı aktarım** | KVKK §6 aktarım dayanağı | Hukukçu + operatör (sağlayıcı sözleşmeleri) |
| **Veri işleyenler / sağlayıcılar** | Supabase DPA/alt işleyiciler; Netlify sözleşme/DPA; e-posta gönderim sağlayıcısı (Resend?) ve konumu; Google Workspace sözleşme tarafı/DPA/konum (hepsi KVKK §6) | Operatör (C1–C5) |
| **Saklama ve silme** | Paylaşım bağlantısı (KVKK, Gizlilik, İletişim, Koşullar); sağlayıcı günlük/yedek süreleri (KVKK, Gizlilik, İletişim); yazışma kayıtları (KVKK); kanuni saklama istisnası (İletişim); hesap silmenin canlıya alınması (Gizlilik, Koşullar, İletişim ×2) | Operatör kararı (B2–B5) + dağıtım + hukukçu |
| **Çerezler ve dış servisler** | Turnstile üretim davranışı; çerez onayı değerlendirmesi (Çerez) | Operatör testi (C6) + hukukçu |
| **Spor verisi lisansı ve atıf** | BSD lisansının yayın kullanımına uygunluğu ve futbolcu verileri (Gizlilik); lisans 4.0 ile paylaşım ve görsel dışa aktarım (Koşullar) | Hukukçu + BSD onayı (isteğe bağlı) |
| **Kullanıcı içeriği ve fikrî mülkiyet** | Üçüncü taraf veri ve isim kullanımı (Koşullar §5) | Hukukçu |
| **Yaş ve Koşullar maddeleri** | Yaş sınırı (Gizlilik, Koşullar); sorumluluk sınırlaması; yetkili mahkeme ve tüketici mevzuatı (Koşullar) | Hukukçu + operatör (B1, B6) |
| **Başvuru prosedürleri** | İletişim'deki kanuni saklama istisnası; `DATA_REQUEST_PROCEDURE.md` içindeki süre işaretleri | Operatör + hukukçu |

## 4. Gizlilik ve KVKK incelemesi

- **Veri sorumlusu kimliği (m.10).** Gerçek kişi operatörün adı ve tebligat adresi aydınlatmada yer almalı. Bunlar olmadan metin eksiktir. KEP gerçek kişi için zorunlu görünmüyor; teyit edilmeli. VERBİS kaydı ve muafiyeti değerlendirilmeli.
- **Veri kategorileri.**
  - Kimlik/hesap, iletişim, kullanıcı içeriği/tercihleri, işlem güvenliği, paylaşım güvenliği; **yeni:** yazışmalar ve başvurular.
  - Özel nitelikli veri, konum, ödeme ve fotoğraf işlenmiyor; kodla doğrulandı.
  - **Futbolcu verileri** (ad, forma numarası, mevki) kullanıcı verisi değildir ama kişisel veridir. BSD'den alınır ve Supabase'de (Frankfurt) saklanır. Bunların hukuki dayanağı ve aydınlatma yükümlülüğünün nasıl karşılanacağı hukukçuya soru (bölüm 7).
- **Amaçlar ve hukuki sebepler.**
  - Sözleşmenin ifası (m.5/2-c) hesap ve hizmet işlevleri için uygun görünüyor.
  - Meşru menfaat (m.5/2-f) güvenlik ve hız sınırı için kullanılıyor; bunun için bir menfaat dengesi kaydı önerilir.
  - Açık rızaya dayanan işlem yok. Aydınlatma metni kabul edilen bir metin olarak sunulmuyor; kayıt formundaki onay kutusu yalnızca Kullanım Koşulları için. Bu, testle güvence altında.
- **Alıcılar ve yurt dışı aktarım (m.9).**
  - Alıcılar: Supabase (ABD merkezli; veri Frankfurt'ta, alt işleyiciler), Netlify (ABD), Cloudflare/Turnstile (ABD), Google Workspace (ABD), e-posta gönderim sağlayıcısı (muhtemelen Resend, ABD).
  - **Metinde sağlayıcıların listelenmesi aktarımı hukuka uygun hâle getirmez.** Her sağlayıcı için bir dayanak gerekir: yeterlilik kararı, Kurul'un standart sözleşmesi (imzadan sonra Kurul'a bildirim), bağlayıcı şirket kuralları ya da arızi aktarım istisnası.
  - Depoda hiçbir sözleşme veya bildirim kaydı yok. Büyük ABD sağlayıcıları genellikle kendi DPA/SCC metinlerini sunar; bunların Türk standart sözleşmesi yerine geçip geçmediği hukukçu sorusu.
- **Saklama.** Kesinleşmiş süreler:
  - hesap ve içerik: hesap açık olduğu sürece;
  - paylaşım hız sınırı özetleri: 2 gün.

  Açık olanlar: paylaşım bağlantıları (B2), yazışmalar (B4), pasif hesaplar (B5), sağlayıcı günlük ve yedekleri (C1–C5).
- **Başvurular (m.11, m.13).**
  - Kanal çalışıyor; 30 gün süre ve Kurul'a şikâyet süreleri metinde.
  - Erişim, düzeltme ve silme talepleri manuel prosedürle karşılanıyor. Uygulamada henüz yok: veri dışa aktarma, e-posta değiştirme, Haftanın İlk 11'i kaydını tek tek silme.
- **Hesap silmenin sınırları.**
  - Canlıda uygulama içi silme yok; şimdilik manuel silme prosedürü geçerli.
  - Silinmeyenler: sağlayıcı yedekleri ve günlükleri süreleri dolana kadar; üçüncü kişilerin kendi cihazlarına aldığı paylaşım kopyaları; tarayıcıdaki yerel taslaklar.
  - Canlıdaki 8 test bağlantısı hiçbir hesapla ilişkili değildir; sahiplik kanıtlanamaz (B3).
- **Çerezler ve tarayıcı depolaması.**
  - Uygulama çerez yazmıyor.
  - `localStorage`/`sessionStorage` kullanımı zorunlu ya da kullanıcı tercihine bağlı.
  - Turnstile yalnızca paylaşım sırasında yükleniyor; üretim anahtarıyla davranışı doğrulanmadı.
  - Onay bandı gerekmediği değerlendirmesi hukukçu teyidi bekliyor.

## 5. Koşullar ve spor verileri

| Konu | Mevcut taslak | Açık nokta |
| --- | --- | --- |
| Kullanıcı içeriği | Çalışmalar kullanıcıya ait; hizmeti sunmak için sınırlı, ücretsiz, devredilemez izin; içerikten kullanıcı sorumlu | Lisansın kapsamı (paylaşılan bağlantının görüntülenmesi, dışa aktarılan görseller) |
| Kulüp ve oyuncu adları | Yalnızca tanımlayıcı; TFF, lig, kulüp veya oyuncuyla bağlantı yok; arma, logo ve fotoğraf yok | Ad kullanımı ve futbolcu verisi değerlendirmesi |
| BSD lisansı (v4.0, `MATCHES_RELEASE_REVIEW.md` §3) | Kaynak adlandırıldı; "resmî değildir"; toplu kopyalama ve yeniden dağıtım yasağı | §2 kendi uygulamada gösterime izin verir. §4 ham verinin yeniden dağıtımını ve aynalanmasını yasaklar. §5 erişim sona erince saklanan veri yalnızca araştırma ve denetim için tutulabilir. Atıf zorunlu değil ama resmî veri gibi sunulamaz. Kullanıcı paylaşımları ve PNG dışa aktarımın "türetilmiş çıktı" sayılıp sayılmadığı **teyit edilmedi**. |
| Kullanıcı paylaşımı | Bağlantıyı bilen herkes görür; topluluk akışı yok | Planlanan: giriş zorunlu, hesaba bağlı |
| Yaş | 18 altı için veli bilgisi ve onayı (taslak) | Yaş sınırı ve doğrulama yöntemi |
| Hizmetin sürekliliği ve sorumluluk | Ücretsiz, beta, "olduğu gibi"; kast ve ağır ihmal saklı | Tüketici mevzuatı karşısında geçerliliği |

## 6. Doğrulanması gereken sağlayıcı sözleşmeleri ve güvenceler

| Sağlayıcı | Rol | Doğrulanacak |
| --- | --- | --- |
| Supabase | Veri işleyen (DB, Auth, Edge Functions) | DPA kabulü, alt işleyici listesi, yedek ve günlük süreleri, KVKK m.9 dayanağı |
| Netlify | Veri işleyen (barındırma, erişim günlükleri) | DPA, günlük süresi, m.9 dayanağı |
| Cloudflare (Turnstile; ayrıca Supabase ağı) | Veri işleyen / alt işleyen | DPA, Turnstile çerez/depolama davranışı, m.9 dayanağı |
| Google Workspace | Veri işleyen (iletişim posta kutusu, KVKK başvuruları) | Sözleşme tarafı Google kuruluşu, Cloud Data Processing Addendum, veri bölgesi, m.9 dayanağı, erişim/2SV |
| E-posta gönderim sağlayıcısı (Resend?) | Veri işleyen (doğrulama ve sıfırlama e-postaları) | Supabase Auth SMTP ayarıyla kimlik, DPA, bölge, günlük süresi |
| BSD (Bzzoiro) | Spor verisi lisansı (kullanıcı verisi almaz) | Lisans 4.0 kabulü, plan, isteğe bağlı yazılı onay (bkz. `MATCHES_RELEASE_REVIEW.md` §6) |

## 7. Hukukçuya sorular

1. VERBİS kaydı ve muafiyet; 5651 kapsamında içerik sağlayıcı olarak tanıtıcı bilgi yükümlülüğü.
2. Gerçek kişi operatör için tebligat adresinin aydınlatma metninde yayımlanması zorunlu mu; alternatif adres kabul edilir mi?
3. KVKK m.9 için sağlayıcı bazında hangi aktarım dayanağı kullanılmalı? Sağlayıcıların kendi DPA/SCC metinleri yeterli mi, yoksa Kurul standart sözleşmesi ve bildirim mi gerekir?
4. Futbolcu verilerinin (ad, numara, mevki) işlenmesinin hukuki dayanağı ve aydınlatma yükümlülüğünün nasıl karşılanacağı.
5. BSD lisansı 4.0 ile kullanıcı paylaşım bağlantıları ve PNG dışa aktarımların uyumu; lisans sona ererse kullanıcı kayıtlarındaki oyuncu adlarının durumu (lisans §5).
6. Yaş sınırı, veli onayı ve yaş beyanının gerekip gerekmediği.
7. Ücretsiz hizmette 6502 sayılı Tüketicinin Korunması Hakkında Kanun'un uygulanabilirliği; sorumluluk sınırlamasının ve yetkili mahkeme maddesinin geçerliliği.
8. Çerez onayı gerekmediği değerlendirmesinin teyidi (Turnstile dahil).
9. Saklama süreleri: paylaşım bağlantıları, yazışmalar ve başvurular, pasif hesaplar; kanuni saklama istisnası.
10. Koşulları kabul kaydının ispat için yeterliliği: şu an kayıt tutulmuyor (B7).
11. Eski FotMob kaynaklı verinin geçmişteki kullanımı için yapılması gereken bir şey var mı? Veri hiç herkese açık yayınlanmadı ama anonim REST erişimi açıktı; SEC1 yerelde hazır.

## 8. Operatörden beklenen kararlar

`LEGAL2_OPERATOR_CHECKLIST.md`: A1–A4 kimlik, B1–B10 kararlar, C1–C7 panel doğrulamaları, D1–D4 operasyon.

## 9. Yayını engelleyen yasal gereklilikler

1. Veri sorumlusu kimliği ve tebligat adresi metinlerde (A1–A2), yazılı onayınla.
2. KVKK m.9 aktarım dayanağının her sağlayıcı için kurulması ve metne yazılması (bölüm 6, soru 3).
3. Sağlayıcı DPA'larının kabulü ve doğrulanması (C1–C5).
4. Metinlerin canlı durumla eşitlenmesi. Kapsam notundaki özellikler ya yayına alınır ya da metinden çıkarılır:
   - Hesap silme canlıya alınmadan "kendin silebilirsin" ifadesi yayımlanamaz.
   - Paylaşım bağlantılarının hesaba bağlanması ve 8 test bağlantısı kararı (B3).
5. BSD lisansının hukukçu onayı ve BSD kataloğuna geçiş (FotMob verisiyle yayın yok; operatör kararı).
6. SEC1: eski katalog tablolarındaki anonim okumanın kapatılması (yerelde hazır, canlıda onay bekliyor).
7. Yaş politikası, sorumluluk ve yetkili mahkeme maddelerinin hukukçu onayı.
8. Hukukçu onayından sonra: işaretlerin kaldırılması, yürürlük tarihi, taslak notunun ve `noindex`'in kaldırılması. Bu adım ayrıca onay gerektirir.

## 10. Doğrulama

- `tests/legal-pages.test.mjs`: 9 test geçti, yeni LEGAL2 testi dahil. Test şunları kontrol eder:
  - kapsam notu dört sayfada var;
  - doğrulanmış sağlayıcılar adlandırıldı;
  - açık konular işaretli;
  - kimlik veya şirket bilgisi uydurulmadı;
  - `noindex` ve taslak notu yerinde;
  - kayıt formunda tek, işaretsiz Koşullar kutusu var.
- Tam sonuçlar son raporda.
