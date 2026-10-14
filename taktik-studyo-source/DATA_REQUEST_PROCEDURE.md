# Kişisel veri talepleri — iç prosedür (taslak)

Taktik Stüdyo'yu işleten gerçek kişi için iç çalışma talimatıdır; kamuya açık değildir.
Hazırlanma: 14 Ekim 2026 (LEGAL1.2). Hukuki inceleme tamamlanana kadar taslaktır.
Kamuya açık açıklama: `dist/iletisim.html`. Bulgular: `LEGAL_AUDIT.md`.

> Bu prosedür uygulama içine otomatik silme veya migration eklemez. Aşağıdaki işlemler, yetkili
> operatör tarafından Supabase Dashboard üzerinden ve her talep için ayrı ayrı elle yapılır.

## 0. Ön koşul — talep kanalı çalışmıyor

`iletisim@taktikstudyo.com` sitede yayımlandı, ancak 14.10.2026 itibarıyla `taktikstudyo.com` alan
adının **MX kaydı yok** (yetkili sunucu `ns1.metunic.com.tr` yalnızca SOA döndürüyor). Bu adrese
gönderilen e-postalar teslim edilemez. Yayından önce:

1. Bir posta kutusu sağlayıcısı seçilip MX, SPF ve DMARC kayıtları eklenmeli **[REVIEW REQUIRED]**.
2. Mevcut `send.taktikstudyo.com` / `resend._domainkey` kayıtları yalnızca gönderime yöneliktir; gelen
   postayı karşılamaz.
3. Dışarıdan test e-postası gönderilip teslim doğrulanmalı.

## 1. Talep alma ve kimlik doğrulama

1. Talep `iletisim@taktikstudyo.com` adresine, yazılı posta ile veya KEP/güvenli e-imza ile gelir.
2. Talep kaydına (bölüm 7) bir satır açılır; **son yanıt tarihi = alış tarihi + 30 gün**.
3. Gönderen e-posta adresi, Supabase Dashboard › Authentication › Users içinde aranır.
   - **Adres kayıtlı bir hesapla eşleşiyorsa** talep o hesap için işleme alınır.
   - **Eşleşmiyorsa** hiçbir hesap bilgisi açıklanmaz ("böyle bir hesap var/yok" bile denmez). Talep
     sahibinden kayıtlı adresten yazması veya Tebliğ'e uygun resmî başvuru yapması istenir.
4. Silme ve e-posta değişikliği gibi geri dönüşü olmayan işlemlerde, kayıtlı adrese "onaylıyor
   musun?" yanıtı istenir ve yazılı onay kaydedilir.
5. Yalnızca gerekli bilgi istenir. Kimlik belgesi kopyası, resmî başvuru şartı olmadıkça istenmez.
   Alınırsa işlem bitince silinir **[REVIEW REQUIRED: saklama süresi]**.
6. Veri asla kayıtlı olmayan bir adrese gönderilmez.

## 2. Veritabanı ilişkileri (silme öncesi doğrulandı)

Hosted proje `zwhoailuklwtxaaawfaq` üzerinde **salt okuma** sorgularıyla kontrol edildi (14.10.2026):

| Tablo | `auth.users` ilişkisi | Hesap silinince |
| --- | --- | --- |
| `public.profiles` | `profiles_id_fkey` → `auth.users(id)` **ON DELETE CASCADE** | Silinir |
| `public.studio_projects` | `studio_projects_user_id_fkey` **ON DELETE CASCADE** | Silinir |
| `public.player_overrides` | `player_overrides_user_id_fkey` **ON DELETE CASCADE** | Silinir |
| `public.shared_lineups` | Hosted (şu an): **İlişki yok**. ACCOUNT1 sonrası: `owner_id` → `auth.users(id)` **ON DELETE CASCADE** (yerelde uygulandı, hosted'da onay bekliyor) | Hosted'da şu an **silinmez**; ACCOUNT1 sonrası silinir |
| `tactics_private.share_limits` | İlişki yok (günlük IP özeti) | En geç 2 günde kendiliğinden temizlenir |
| Storage | Bucket ve dosya yok (0 / 0) | — |
| `auth.*` iç tabloları (identities, sessions, refresh tokens vb.) | Supabase yönetir | Supabase'in kullanıcı silme işlemi kapsamında. **[DOĞRULANMADI — Supabase belgesinden teyit edilmeli]** |

**Şema farkı:** Hosted veritabanında yalnızca ilk 5 migration uygulanmış durumda (`football_backend` →
`player_overrides`). Depodaki şu migration'lar hosted ortamda **yok**:

- `catalogue_identity_foundation`
- `profile_onboarding_foundation`: `favorite_team_slug` ve onboarding sütunları
- `weekly_lineups`
- `weekly_snapshot_validation`

Bunlar uygulandığında `weekly_lineups` da `ON DELETE CASCADE` ile gelir (depodaki migration'a göre).
Prosedür her talepte o anki şemaya göre çalıştırılmalıdır.

Hosted kayıt sayıları (yalnızca sayım, 14.10.2026): 2 Auth kullanıcısı, 1 profil, 2 çalışma,
2 oyuncu düzeltmesi, 8 paylaşılan kadro. Paylaşılan kadroların tamamında `expires_at` boş.
Bir Auth kullanıcısının profili yok: profil, istemci tarafından açıkça oluşturuluyor.

## 3. Erişim talebi

1. Kimlik doğrulandıktan sonra, Dashboard › SQL Editor'da yalnızca **okuma** sorguları çalıştırılır
   (`<USER_ID>` yerine Auth kullanıcısının UUID'si yazılır):

   ```sql
   select id, email, created_at, last_sign_in_at, email_confirmed_at, raw_user_meta_data->>'username' as signup_username
     from auth.users where id = '<USER_ID>';
   select * from public.profiles where id = '<USER_ID>';
   select id, title, studio_mode, match_id, match_week, snapshot, created_at, updated_at
     from public.studio_projects where user_id = '<USER_ID>';
   select * from public.player_overrides where user_id = '<USER_ID>';
   -- Yalnızca migration uygulandıysa:
   -- select * from public.weekly_lineups where user_id = '<USER_ID>';
   ```

2. Sonuçlar tek bir JSON/metin dosyasında toplanır. Ek bir açıklama yazılır: işleme amaçları,
   hukuki sebepler, alıcılar ve sağlayıcılar (Aydınlatma Metni'ne atıf), saklama durumu.
3. Paylaşılan kadrolar kullanıcıya bağlı olmadığı için erişim yanıtına dahil edilemez; bu durum
   yanıtta belirtilir.
4. Dosya yalnızca kayıtlı adrese gönderilir. Gönderim tarihi kayda işlenir; yerel kopya silinir.

## 4. Düzeltme talebi

- **Kullanıcı adı, görünen ad, favori takım:** Kullanıcı Profil sayfasından kendisi değiştirebilir.
  Ona bu yönlendirilir.
- **E-posta adresi:** Uygulamada bu özellik yok. Eski adresten onay ve yeni adresin doğrulanması
  sağlanır, ardından Dashboard › Authentication › Users üzerinden değiştirilir. Supabase'in yeni
  adrese doğrulama e-postası göndermesi beklenir **[DOĞRULANMADI: e-posta gönderimi]**.
- **Diğer kayıtlar** (çalışma başlıkları, düzeltmeler): Kullanıcı bunları kendisi düzenleyebilir veya
  silebilir. Gerekirse yalnızca ilgili satırda manuel `update` yapılır ve işlem kayda geçirilir.

## 5. Hesap silme talebi

1. Kimlik doğrulanır ve kayıtlı adresten yazılı silme onayı alınır.
2. **Kayıt için** önce sayımlar alınır: `profiles`, `studio_projects`, `player_overrides` ve
   (varsa) `weekly_lineups` satır sayıları.
3. Dashboard › Authentication › Users › ilgili kullanıcı › **Delete user**. Bu işlem cascade ile
   bölüm 2'deki bağlı tabloları siler.
4. Silmeden sonra aynı `<USER_ID>` için sayım sorguları tekrarlanır; hepsinin 0 olduğu doğrulanır.
5. **Paylaşılan kadrolar:** Kullanıcının ilettiği bağlantılardaki `public_id` değerleri ile ayrı
   olarak silinir. Bağlantılar sahipsiz olduğu için sahiplik kanıtlanamaz; kaldırma talepleri içerik
   bazında değerlendirilir **[REVIEW REQUIRED]**.
6. Kullanıcıya şunlar bildirilir:
   - silme tarihi,
   - yedeklerde ve sağlayıcı kayıtlarında kalabilecek kopyalar (bölüm 6),
   - tarayıcıda kalan yerel verinin kendi cihazında olduğu.
7. Uygulama içi silme (Profil › Hesap › Tehlikeli Bölge, `account-delete` Edge Function) ACCOUNT1 ile
   yerelde uygulandı ve doğrulandı; hosted'a dağıtımı ayrı onay bekliyor (`ACCOUNT1_DELETION_PLAN.md`).
   Dağıtılana kadar, ve giriş yapamayan kullanıcılar için, bu manuel prosedür geçerlidir.

## 6. Yedekler ve dış sağlayıcılar

| Konu | Durum / yapılacak |
| --- | --- |
| Supabase yedekleri | Plan ve saklama süresi **[DOĞRULANMADI]**. Silinen veri, yedek süresi dolana kadar yedekte kalabilir. Yedekten geri dönüş yapılırsa, silme kaydındaki kullanıcılar yeniden silinmelidir. |
| Supabase / Netlify günlükleri | IP, tarayıcı ve istek kayıtları sağlayıcı süresince tutulur; operatörün tek tek silme imkânı yoktur **[DOĞRULANMADI: süreler]**. |
| E-posta sağlayıcısı | DNS, Resend'e işaret ediyor; Supabase Auth SMTP ayarı **[DOĞRULANMADI]**. Gönderim günlükleri alıcı adresini içerebilir. |
| Cloudflare (Turnstile, Supabase ağı) | Kullanıcıya bağlanabilir kayıt tutulmuyor (uygulama tarafı); sağlayıcı tarafı **[DOĞRULANMADI]**. |
| Yurt dışı aktarım | Netlify, Supabase, Cloudflare ve e-posta sağlayıcısı için KVKK m.9 mekanizması belirlenmeli **[REVIEW REQUIRED]**. |

## 7. Talep kaydı ve süreler

Kayıt depoda tutulmaz; operatöre özel, erişimi kısıtlı bir tabloda tutulur.

| Alan | Açıklama |
| --- | --- |
| Talep no | Örn. `2026-001` |
| Alış tarihi / kanalı | E-posta, posta, KEP |
| Talep türü | Erişim / düzeltme / silme / diğer |
| Eşleşen hesap | Auth kullanıcı UUID'si (e-posta yazılmaz) |
| Doğrulama | Yöntem ve tarih |
| Son yanıt tarihi | Alış tarihi + 30 gün (KVKK m.13) |
| Yapılan işlem ve tarih | Sorgu, silme ve sayım sonuçları |
| Yanıt tarihi ve sonuç | Kabul / kısmi / ret (gerekçe) |

İç hedefler:

- 3 iş günü içinde alındı bildirimi.
- Yanıt en geç 30. günde verilir.
- Ret yanıtı Kurul'a şikâyet hakkını hatırlatır: cevaptan itibaren 30 gün, her hâlde başvurudan
  itibaren 60 gün.
- Kayıtların ne kadar saklanacağı belirlenmeli **[REVIEW REQUIRED]**.

## 8. Açık sorular

1. Gelen posta altyapısı (MX) ve `iletisim@taktikstudyo.com` posta kutusunun kurulması.
2. E-posta gönderim sağlayıcısı ve Supabase Auth SMTP ayarı.
3. KVKK m.9 yurt dışı aktarım mekanizması (standart sözleşme ve bildirim ya da istisna).
4. Supabase yedek/günlük süreleri, Netlify ve e-posta sağlayıcısı günlük süreleri.
5. Paylaşılan kadroların saklama süresi ve sahipsiz bağlantı taleplerinin ele alınışı.
6. Hosted şemanın depodaki migration'larla eşitlenmesi (ayrı onayla).
7. Veri sorumlusu kimliği, tebligat adresi, VERBİS ve 5651 değerlendirmesi.
