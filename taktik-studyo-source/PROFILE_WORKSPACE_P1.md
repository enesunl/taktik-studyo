# Profil çalışma alanı — P1

## Korunan mevcut davranışlar

- Protected guard önce server user doğrulaması yapar; recovery/signed-out kullanıcı profil verisine ulaşamaz.
- `profile-api.js`: own-profile yükleme/bootstrap, mevcut username ve display_name düzenleme, validation, username çakışması, kontrollü hata/tekrar deneme davranışları korunur.
- Form klavye submit, busy/double-submit kontrolü ve account-generation kontrolü korunur. Geç gelen profil/proje cevapları disposed veya değişmiş hesaba yazamaz.
- Profilin Çıkış Yap düğmesi mevcut `guard.signOut()` akışına bağlanır. Local signout, cleanup, hata ve redirect davranışı yeniden yazılmadı.

## Sunum

- Hero: gerçek display_name, doğrulanmış auth email ve isimden baş harfler. Başlık sırası display_name → username → doğrulanmış email → “Çalışma alanım”. Avatar baş harfleri display_name/username üzerinden üretilir; ikisi de yoksa TS. Email başlık fallback’i olarak kullanıldığında alt satır gizlenir ve kimlik bölümünde tekrarlanmaz. Fotoğraf yükleme yok.
- Varsayılan hesap bölümü salt okunur label/value satırlarıdır. Hero ve hesap satırındaki Düzenle aynı formu açar ve görünen ad alanına odaklanır. Başarılı kayıt sonrasında salt okunur görünüme dönülür; Vazgeç API isteği yapmadan son sunucu değerlerini geri getirir. Kayıt sürerken iptal kapalıdır; hatada form ve girilen değerler korunur. Var olan kullanıcı adı alanı korunur; yeni sosyal alan eklenmedi.
- Toplam çalışma, Serbest Stüdyo ve Maç Çalışması gerçek `studio_projects` kayıtlarından gelir. Klasik tahta/local draft veya Weekly XI kayıtları bu sayılara eklenmez.
- En son güncellenen dört proje: başlık, mevcut mode, yerel tarayıcı saat diliminde tarih/saat, `/mac-studyosu?project=<UUID>` bağlantısı. Snapshot/diziliş detayı çekilmez.
- Loading, hata/tekrar dene, gerçek sıfır ve dolu liste ayrı gösterilir. Proje hatası hesap formunu engellemez; hata yerine sahte sıfır gösterilmez.
- `/calismalarim`, `/haftanin-ilk-11i` CTA mevcut route'ları kullanır. P1.1 ile tekrarlayan üç alt kısayol kaldırıldı. Weekly XI yalnızca özellik bağlantısıdır, sunucu geçmişi iddiası yoktur.
- İnce divider, tipografi ve açık/koyu tema tokenları; küçük ekranlarda hero ve satırlar alt alta geçer. Başlıklar, gerçek link/button, aria-live, görünür focus ve dekoratif avatar kullanılır.

## Veri ve sorgu contract'ı

`createStudioProjects().getWorkspaceSummary()` mevcut listeleme servisini yeniden kullanır:

1. `listProjects(0,4)`: `PROJECT_COLUMNS` metadata; `user_id = validatedUser.id`; `updated_at DESC, id DESC`; range 0–4 (dört kayıt + mevcut pagination contract'ının bir lookahead kaydı). `snapshot` seçilmez.
2. Free count: `select('id', {count:'exact', head:true})`, aynı owner filtresi, `studio_mode = 'free'`.
3. Match count: aynı count, `studio_mode = 'match'`.

Toplam free + match; mevcut DB constraint yalnızca bu iki modu kabul eder. Tüm sorgular mevcut RLS ve client ile çalışır. Paralel sorgular tek transaction snapshot'ı değildir; eşzamanlı kayıt değişiklikleri sırasında kısa süreli sayı/liste farkı olabilir. Sayımlar eksik/hatalıysa özet kontrollü hata döner. N+1 yok, tüm projelerin JSON snapshot'larını veya tüm sayfalarını indirme yok.

Normal durumda ayrıca mevcut own-profile SELECT yapılır; profil yoksa mevcut recovery/bootstrap sorguları aynen devam eder. SDK `head/count` imzası installed package ve [select dokümantasyonu](https://supabase.com/docs/reference/javascript/select) ile doğrulandı.

Çıkış düğmesi hero yerine alt hesap bölümündedir; aynı guard callback kullanılır. Profil içindeki görünüm ayarı kaldırıldı; tema yalnızca navbar düğmesinden mevcut `theme.js` / `taktik:theme:v1` tercihiyle yönetilir. Profil ortak tema değişkenlerini kullanmaya devam eder. Açık/koyu geçiş ve tercih yokken sistem temasını izleme korunur.

## Kapsam ve doğrulama

Yeni tablo/kolon/migration yok. Auth/profile backend, grants/RLS, provider ve weekly snapshot contract'ı değişmedi. Production mutation, commit, push veya deploy yapılmadı.

Testler: initials/kimlik/edit, gerçek sayı contract'ı ve metadata sorguları, sıralama/aç bağlantısı, empty/error/loading/retry, CTA markup, tema senkronizasyonu, guard logout, account-change/disposal ve izole PGlite üzerinde owner-only SQL/RLS sayımları. UI testleri DOM portları kullanır; gerçek tarayıcıda manuel görsel doğrulamanın yerine geçmez.
