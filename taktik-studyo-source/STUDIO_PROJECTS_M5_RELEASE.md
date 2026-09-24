# Studio Projects migration uygulama kaydı — 23 Eylül 2026

Hedef production proje: `zwhoailuklwtxaaawfaq`. Kullanıcı, dry-run yalnızca M5'i gösterirse uygulamaya açık koşullu onay verdi. Bu koşul uygulamadan önce sağlandı.

## History reconciliation

Production history source of truth kabul edildi. History statements SQL'i ile yerel dosyalar CRLF/LF ve dış whitespace normalizasyonunda tekrar birebir eşleşti. Bağımlılık sırası korundu. Yalnızca şu dosyalar yeniden adlandırıldı; her dosyada rename öncesi/sonrası SHA-256 eşitliği doğrulandı:

| Eski dosya | Yeni dosya |
| --- | --- |
| `20260913062133_football_backend.sql` | `20260913063249_football_backend.sql` |
| `20260918142336_catalogue_authenticated_read.sql` | `20260920094922_catalogue_authenticated_read.sql` |
| `20260918142348_profiles_ownership.sql` | `20260920102243_profiles_ownership.sql` |

SQL içerikleri değişmedi. DB testlerindeki dosya yolları ve güncel doküman bağlantıları güncellendi. Tarihsel audit tabloları ve original hash manifesti eski inceleme kayıtları olarak korundu. Remote history repair, eski DDL reapply yapılmadı. CLI bağlantı metadata'sı gitignore kapsamındaki `supabase/.temp/` içindedir.

## Uygulamadan önce dry-run

CLI 2.117.0, linked project doğrulandı. Komut:

```text
supabase db push --linked --dry-run --skip-vault
Would push these migrations:
 • 20260923135716_studio_projects.sql
{"upToDate":false,"dryRun":true,"migrations":["20260923135716_studio_projects.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

| Local version | Remote version (uygulamadan önce) |
| --- | --- |
| 20260913063249 | 20260913063249 |
| 20260920094922 | 20260920094922 |
| 20260920102243 | 20260920102243 |
| 20260923135716 | — |

Tek pending migration M5 idi. Eski migration'ların hiçbiri pending değildi. Uygulamadan hemen önce yerel migration dosya kümesinin aynı dört dosyadan oluştuğu ve M5 SHA-256 değerinin `888308EABF31ED510C1EA2D314163CE4FFC43F864F0994F0183141F1A234BA28` olduğu yeniden doğrulandı.

## Uygulama

```text
supabase db push --linked --skip-vault --yes
Applying migration 20260923135716_studio_projects.sql...
{"upToDate":false,"dryRun":false,"migrations":["20260923135716_studio_projects.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Yalnızca `20260923135716_studio_projects.sql` uygulandı. Vault sync atlandı; seed/custom roles dahil edilmedi. M5 migration'ın tablo/index/RLS/grant/trigger/function tanımları ve kendi migration history kaydı dışında uygulama schema/data değişikliği yapılmadı.

## Production doğrulaması

- `public.studio_projects` mevcut; RLS enabled, FORCE RLS false. Browser rollerinin sahiplik denetimi RLS ile uygulanıyor; tablo sahibi/yetkili yönetici bypass'ı için FORCE garantisi iddia edilmiyor.
- Dört policy: `studio_projects_select_own`, `studio_projects_insert_own`, `studio_projects_update_own`, `studio_projects_delete_own`. Hepsi yalnızca authenticated; SELECT/DELETE USING ve INSERT WITH CHECK `auth.uid() = user_id`; UPDATE hem USING hem WITH CHECK kullanıyor.
- Anon effective tablo/kolon izinlerinin tamamı false. Publishable key ile gerçek anonim REST SELECT isteği **HTTP 401, PostgreSQL 42501** ile reddedildi; hata gövdesi/veri/secret loglanmadı.
- Authenticated SELECT/DELETE mevcut. INSERT yalnızca `id,user_id,title,snapshot_version,snapshot`; UPDATE yalnızca `title,snapshot_version,snapshot`. Revision/timestamp/context doğrudan yazımı açılmadı.
- `studio_projects_owner_updated (user_id, updated_at DESC, id DESC)` ve primary key index mevcut.
- `studio_projects_metadata` BEFORE INSERT/UPDATE trigger'ı ve `tactics_private.studio_project_metadata()` mevcut. Function SECURITY INVOKER, boş search_path; anon/authenticated EXECUTE yok. Context snapshot'tan türetiliyor.
- Production migration history: `20260923135716 / studio_projects` kayıtlı. Eski üç version değişmedi.
- Önce/sonra karşılaştırmasında incelenen mevcut teams/players/profiles/shared_lineups/private share_limits kolon, constraint, index, RLS, policy, grant ve fonksiyon/trigger tanımları değişmedi. Tam cluster diff iddiası değildir.

Son dry-run: `upToDate:true`, `migrations:[]`, `seeds:[]`, `roles:[]`. Son migration listesinde dört version'ın tamamı local/remote eşleşiyor.

## Testler ve kalan smoke testi

- Yerel profiles + Studio Projects gerçek SQL/RLS testleri: **21/21 PASS**.
- Tam `npm test`: **447/447 PASS**, board regression **9/9 grup PASS**.
- Production authenticated free CRUD/list/reopen/rename/update/delete ve match context smoke testi **henüz yapılmadı**. Otomasyon envanterinde erişilebilir tarayıcı yok; localhost browser açma girişimi `No browser is available` döndürdü. Yerel `TAKTIK_SMOKE_EMAIL` ve `TAKTIK_SMOKE_PASSWORD` da tanımlı değil. Kullanıcıdan mevcut test oturumuna erişim veya yerel test hesabı konfigürasyonu istendi.
- Authenticated smoke geçmeden uçtan uca production kayıt davranışının doğrulandığı iddia edilmez. Yerel SQL/RLS testleri hosted Auth/PostgREST testi yerine geçmez.
- İkinci güvenli test hesabı olmadığı için production çapraz hesap denemesi yapılmadı. B/anon izolasyonu yerel gerçek SQL/RLS testlerinde geçti; canlı grant/policy metadata'sı ayrıca doğrulandı.
- Smoke projesi oluşturulmadı; silinecek smoke kaydı yok. Mevcut kullanıcı kayıtlarına dokunulmadı; yeni Auth kullanıcısı oluşturulmadı.

BSD/diğer Edge deploy, secret değişikliği, Netlify deploy, Auth ayarı değişikliği, git commit/push yapılmadı.
