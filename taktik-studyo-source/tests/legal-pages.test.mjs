import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {pageFixture} from './helpers/auth-fixture.mjs';

const read = file => readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
const legal = ['kvkk-aydinlatma-metni','gizlilik-politikasi','kullanim-kosullari','cerez-politikasi','iletisim'];
const cookiesPage = () => read('cerez-politikasi.html');

test('legal pages share theme shell and navigation, with no draft notice, noindex or review markers',()=>{
  for(const slug of legal){
    const html=read(slug+'.html'),head=html.split('</head>')[0];
    // Public beta (operator decision, 17 Oct 2026): draft notice and noindex removed; effective date 18 Oct 2026.
    assert.doesNotMatch(html,/noindex|legal-draft|legal-review|REVIEW REQUIRED|\(taslak\)|TODO|TBD/,slug);
    assert.match(head,/href="legal.css"/,slug);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,slug);
    assert.match(html,/Yürürlük tarihi: 18 Ekim 2026/,slug);
    assert.match(html,new RegExp(`href="/${slug}.html" aria-current="page"`),slug);
    for(const other of legal)assert.match(html,new RegExp(`href="/${other}.html"`),`${slug} -> ${other}`);
    assert.doesNotMatch(html,/<script(?! src="theme.js")/,`${slug} loads no app/backend scripts`);
    assert.doesNotMatch(html,/<form|type="checkbox"/,slug);
  }
});

test('legal copy keeps the KVKK notice separate from consent and invents no operator identity',()=>{
  const kvkk=read('kvkk-aydinlatma-metni.html'),contact=read('iletisim.html');
  assert.match(kvkk,/açık rıza alınması anlamına gelmez/);
  // LEGAL1.2: only the operator-supplied contact email is filled; identity and postal address stay placeholders.
  for(const page of [kvkk,contact]){
    // The operator-confirmed name is published; no postal address is published and there is no KEP row.
    assert.match(page,/gerçek kişi Enes Ünal\. Taktik Stüdyo bir şirket değildir\./);
    assert.match(page,/<dt>Posta adresi<\/dt><dd>Yayımlanmaz; tüm soru ve talepler e-posta ile alınır\./);assert.doesNotMatch(page,/<dt>KEP adresi<\/dt>|tebligata elverişli posta adresi/);
    assert.match(page,/<dt>E-posta<\/dt><dd><a href="mailto:iletisim@taktikstudyo.com">iletisim@taktikstudyo.com<\/a><\/dd>/);
    assert.doesNotMatch(page,/REVIEW REQUIRED: iletişim ve KVKK başvuru e-posta adresi/);
  }
  assert.match(kvkk,/m\.5\/2-c/);assert.match(kvkk,/m\.9/);
  assert.match(contact,/en geç 30 gün/);assert.match(contact,/60 gün/);
  for(const slug of legal){
    const html=read(slug+'.html');
    assert.deepEqual([...new Set(html.match(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/gi))],['iletisim@taktikstudyo.com'],slug);
    assert.doesNotMatch(html,/Ltd\.|A\.Ş\.|vergi no/i,slug);
    assert.match(html,/<footer class="legal-footer">[\s\S]*mailto:iletisim@taktikstudyo.com[\s\S]*<\/footer>/,slug);
  }
});

test('LEGAL1.2 contact page explains access, correction and deletion requests without adding consent controls',()=>{
  const contact=read('iletisim.html');
  for(const id of ['talep-gonder','erisim','duzeltme','silme','kvkk-basvuru','sure','kendin-yap'])assert.match(contact,new RegExp(`id="${id}"`),id);
  for(const subject of ['Veri erişim talebi','Düzeltme talebi','Hesap silme talebi'])assert.match(contact,new RegExp(subject));
  assert.match(contact,/Hesabında kayıtlı e-posta adresinden/);
  // ACCOUNT1: owned share links are deleted with the account; the in-app flow is not claimed as live.
  assert.match(contact,/oluşturduğun paylaşım bağlantıları veritabanından silinir/);
  assert.match(contact,/Silinen paylaşım bağlantıları artık açılmaz/);
  // LAUNCH-LEGAL2: in-app deletion is live (account-delete deployed, production smoke test passed), incl. Google-only reauth.
  for(const slug of ['gizlilik-politikasi','kullanim-kosullari','iletisim']){
    const html=read(slug+'.html');
    assert.match(html,/Tehlikeli Bölge/,slug);assert.match(html,/Google ile yeniden giriş yapman/,slug);
    assert.doesNotMatch(html,/yalnızca yerel ortamda doğrulandı/,slug);
  }
  for(const slug of legal)assert.doesNotMatch(read(slug+'.html'),/hesab(ın)?a bağlı değildir|süresiz saklanır/,slug);
  assert.match(contact,/Elle alınan veritabanı yedeklerinde ve hizmet sağlayıcıların teknik günlüklerinde bulunabilecek kopyalar, yedek silinene veya günlük süresi dolana kadar kalabilir/);
  for(const slug of legal){const html=read(slug+'.html');assert.doesNotMatch(html,/type="checkbox"|<form/,slug);}
  assert.equal((read('kayit.html').match(/type="checkbox"/g)||[]).length,1);
});

test('registration has an information-only privacy notice and one separate, unchecked, required Terms checkbox',()=>{
  const html=read('kayit.html'),form=html.split('<form id="authForm">')[1].split('</form>')[0];
  const boxes=form.match(/<input[^>]*type="checkbox"[^>]*>/g)||[];
  assert.equal(boxes.length,1);
  assert.match(boxes[0],/id="termsAccepted"/);assert.match(boxes[0],/\brequired\b/);assert.doesNotMatch(boxes[0],/\bchecked\b/);
  assert.match(form,/<label for="termsAccepted"><a href="\/kullanim-kosullari.html"[^>]*>Kullanım Koşulları/);
  const notice=form.match(/<p id="privacyNotice"[^>]*>(.*?)<\/p>/)[1];
  assert.match(notice,/href="\/kvkk-aydinlatma-metni.html"/);assert.match(notice,/href="\/gizlilik-politikasi.html"/);
  assert.doesNotMatch(notice,/onay|kabul|rıza veriyorum/i);
});

test('Terms acceptance gates registration; only the explicit acceptance (no personal-data consent) reaches the API',async()=>{
  const f=pageFixture('register'),page=mountAuthPage(f.options);await page.ready;
  f.fields.termsAccepted.checked=false;await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/Kullanım Koşulları/);assert.equal(f.calls.length,0);
  f.fields.termsAccepted.checked=true;await f.fields.authForm.emit('submit');
  // SEC2.3: the API records the accepted Terms version; nothing else about consent is sent.
  assert.deepEqual(f.calls[0],{kind:'signup',args:{email:'test@example.test',password:f.calls[0].args.password,username:f.calls[0].args.username,termsAccepted:true}});page.dispose();
  const login=pageFixture('login'),loginPage=mountAuthPage(login.options);await loginPage.ready;
  await login.fields.authForm.emit('submit');assert.equal(login.calls[0].kind,'login');loginPage.dispose();
});

test('landing, login and registration link to every legal page and all legal links resolve',()=>{
  for(const file of ['index.html','giris.html','kayit.html',...legal.map(s=>s+'.html')]){
    const html=read(file);
    for(const slug of legal)assert.match(html,new RegExp(`href="/${slug}.html"`),`${file} -> ${slug}`);
    for(const [,target] of html.matchAll(/href="\/([a-z0-9-]+\.html)"/g))assert(existsSync(new URL('../dist/'+target,import.meta.url)),`${file} -> ${target}`);
  }
  assert.doesNotMatch(read('index.html'),/Reserved for future legal/);
});

test('LEGAL1.1 fonts are self-hosted WOFF2 with OFL licenses; no served file requests Google Fonts',()=>{
  const css=read('styles.css');
  assert.doesNotMatch(css,/fonts\.googleapis|fonts\.gstatic|@import url\('https?:/);
  const faces=[...css.matchAll(/@font-face\{font-family:'(DM Sans|Manrope)';[^}]*src:url\(fonts\/([a-z-]+\.woff2)\) format\('woff2'\);unicode-range:[^}]+\}/g)];
  assert.deepEqual(faces.map(f=>f[2]).sort(),['dmsans-latin-ext.woff2','dmsans-latin.woff2','manrope-latin-ext.woff2','manrope-latin.woff2']);
  for(const [,,file] of faces)assert.equal(readFileSync(new URL('../dist/fonts/'+file,import.meta.url)).subarray(0,4).toString('latin1'),'wOF2',file);
  for(const license of ['OFL-DMSans.txt','OFL-Manrope.txt'])assert.match(read('fonts/'+license),/SIL Open Font License, Version 1\.1/);
  for(const file of readdirSync(new URL('../dist/',import.meta.url)).filter(f=>/\.(html|css)$/.test(f)))assert.doesNotMatch(read(file),/fonts\.googleapis|fonts\.gstatic/,file);
  assert.match(readFileSync(new URL('../scripts/serve-local.cjs',import.meta.url),'utf8'),/'\.woff2': 'font\/woff2'/);
});

test('LEGAL1.1 drafts reflect verified providers and keep unresolved items marked for review',()=>{
  const kvkk=read('kvkk-aydinlatma-metni.html'),cookies=read('cerez-politikasi.html');
  // LEGAL2: Google appears only as the verified Google Workspace contact mailbox, never Google Fonts.
  assert.match(kvkk,/Netlify, Inc\./);assert.doesNotMatch(kvkk,/Google Fonts|fonts\.googleapis/);
  // LAUNCH-LEGAL4: Resend is the operator-confirmed Auth e-mail provider (domain DKIM/send records verified).
  assert.match(kvkk,/<tr><td>Doğrulama ve şifre sıfırlama e-postaları<\/td><td>Resend, Inc\.<\/td>/);
  assert.doesNotMatch(read('gizlilik-politikasi.html'),/yazı tipleri\)/);
  assert.match(cookies,/Google Fonts veya başka bir yazı tipi servisine istek yapılmaz/);
  // LAUNCH-LEGAL3: measured — rendering Turnstile created no cookie on any domain and no site storage.
  assert.match(cookies,/__cf_bm/);assert.match(cookies,/Turnstile doğrulaması çerez oluşturmadı ve sitemizin tarayıcı depolamasına veri yazmadı/);
});

test('LEGAL2 drafts reflect verified providers, separate live from planned features and keep review gates',()=>{
  const kvkk=read('kvkk-aydinlatma-metni.html'),privacy=read('gizlilik-politikasi.html'),terms=read('kullanim-kosullari.html'),contact=read('iletisim.html');
  // LAUNCH-LEGAL2 (17 Oct 2026): every described feature is live, so the "planned features" scope note is gone,
  // and nothing claims the old FotMob roster or a conditional (SEC2.2) Google sign-in.
  for(const slug of legal){
    const html=read(slug+'.html');
    assert.match(html,/Son güncelleme: 17 Ekim 2026/,slug);
    assert.doesNotMatch(html,/class="legal-scope"|FotMob|SEC2\.2|planlanan hizmeti/,slug);
  }
  // Google sign-in is enabled in production: described as a live feature with Google LLC as a recipient.
  assert.match(kvkk,/<tr><td>Google ile giriş<\/td><td>Google’ın ilettiği/);assert.match(kvkk,/<tr><td>Google ile giriş<\/td><td>Google LLC<\/td>/);
  assert.match(privacy,/Google ile giriş yaparsan Google’ın ilettiği/);
  // SEC2.3 Terms acceptance record and per-account counters are disclosed.
  assert.match(kvkk,/Kabul ettiğin Kullanım Koşulları sürümü ve kabul zamanı \(sunucu saatiyle\)/);
  assert.match(kvkk,/hesap kimliğinle ilişkili istek ve yazma sayaçları/);
  assert.match(kvkk,/PNG görselleri tarayıcında oluşturulur ve sunucularımıza gönderilmez/);
  // Turnstile protects the Auth forms (published build sets the Auth key), account deletion and sharing.
  assert.match(kvkk,/<tr><td>Giriş, kayıt, şifre sıfırlama isteği, hesap silme ve kadro paylaşımında bot koruması<\/td><td>Cloudflare, Inc\. \(Turnstile\)<\/td>/);
  for(const html of [kvkk,privacy,cookiesPage()])assert.doesNotMatch(html,/Yalnızca kadro paylaşırken|Yalnızca “Kadroyu paylaş” özelliğini kullandığında/);
  // Verified facts: Google Workspace mailbox, Supabase Frankfurt region, BSD as the sports-data source.
  assert.match(kvkk,/<tr><td>İletişim e-postası<\/td><td>Google \(Google Workspace\)<\/td>/);assert.match(privacy,/Google Workspace/);
  assert.match(kvkk,/Veritabanı Frankfurt’taki \(Almanya\) sunucularda tutulur/);
  assert.doesNotMatch(kvkk,/Frankfurt, Almanya <mark class="legal-review">\[REVIEW REQUIRED: canlı ayar doğrulanmalı\]/);
  for(const html of [kvkk,privacy,terms])assert.match(html,/BSD Sports Data/);
  assert.match(terms,/resmî lig, kulüp veya federasyon verisi değildir/);
  assert.match(terms,/toplu olarak kopyalamak, ham veri olarak yeniden dağıtmak/);
  // The m.9 gap is stated plainly: Frankfurt is not "EU only", DPAs/EU SCCs are not m.9 safeguards, safeguards incomplete.
  assert.match(kvkk,/tüm verilerin yalnızca Almanya’da veya Avrupa Birliği’nde kaldığı anlamına gelmez/);
  assert.match(kvkk,/Avrupa Birliği standart sözleşme maddeleri, KVKK m\.9’un aradığı güvencelerin yerine geçmez/);
  assert.match(kvkk,/bu aktarımlar için henüz tamamlanmamıştır/);
  // LAUNCH-LEGAL3 retention: active records, counters, backups, logs and legally retained records are distinct.
  for(const label of ['Etkin kayıtlar:','Kullanım sayaçları:','Yedekler:','Sistem günlükleri:','Yazışmalar ve başvurular:'])assert.match(kvkk,new RegExp('<strong>'+label+'</strong>'),label);
  assert.match(kvkk,/talep veya başvuru kapandıktan sonra 12 ay saklanır/);assert.match(kvkk,/Süresi dolan yazışmalar düzenli olarak elle silinir/);
  assert.match(kvkk,/ücretsiz planında otomatik veritabanı yedeği alınmaz/);assert.match(kvkk,/API ve veritabanı günlüğü saklama süresi 1 gündür/);
  // LAUNCH-LEGAL4: manual backups 90 days (operator confirmation tracked in the checklist), last recovery copy kept until replaced.
  assert.match(kvkk,/alındıktan sonra en geç 90 gün içinde elle silinir/);assert.match(kvkk,/en son kurtarma yedeği bu süreden sonra da tutulabilir/);
  assert.doesNotMatch(kvkk+privacy+contact,/güvenli (biçimde )?imha|kalıcı olarak yok edilir/);
  for(const html of [kvkk,privacy,contact])assert.doesNotMatch(html,/yedeklerden (de )?hemen silinir|yazışmalar otomatik olarak silinir/);
  // Age: no minimum age, no date of birth; a legal-representative statement without a review marker.
  for(const html of [privacy,terms]){assert.match(html,/Reşit değilsen[^<]*yasal temsilcinin/);assert.doesNotMatch(html,/18 yaşından küçüksen|yaş sınırı/);}
  // Cookies: no tracking; essential storage vs. optional, user-initiated preferences; no banner.
  assert.match(cookiesPage(),/Çerez Uygulamaları Hakkında Rehberi/);
  assert.equal((cookiesPage().match(/İsteğe bağlı tercih<\/td>/g)||[]).length,2);assert.match(cookiesPage(),/yalnızca temayı değiştirdiğinde yazılır/);
  // LAUNCH-LEGAL4 BSD licence v4.0 wording: in-app display, no raw redistribution, no permission claimed beyond the licence.
  assert.match(terms,/API Veri Kullanımı ve Lisansı \(sürüm 4\.0\) çerçevesinde alınır ve yalnızca Hizmet içinde/);assert.match(terms,/Hizmet ham veri sunmaz veya yeniden dağıtmaz/);
  assert.doesNotMatch(terms+privacy,/BSD(’nin)? (onayı|izni) (alınmıştır|vardır)/);
  // Terms: no exclusive jurisdiction or absolute disclaimer; consumer rights preserved.
  assert.match(terms,/tüketici hakem heyetine veya tüketici mahkemesine başvuru dahil/);assert.doesNotMatch(terms,/münhasır|“olduğu gibi”/);
  // Review markers are resolved in text only; the open legal obligations are tracked outside the pages.
  for(const html of [kvkk,terms,contact])assert.match(html,/gerçek kişi Enes Ünal/);
  // Football data: purpose explained; the BSD licence is not presented as a KVKK basis, nor is public availability.
  assert.match(privacy,/kadro kurmak, Haftanın İlk 11’i için oyuncu seçmek ve Maçlar bölümünde/);
  assert.match(privacy,/KVKK’nın aradığı hukuki sebebin yerine geçmez/);assert.doesNotMatch(privacy,/kamuya açık/);
  // Share links are live, owner-linked and deleted with the account (verified in production).
  assert.match(privacy,/Paylaşılan kadro[^<]*hesabın silindiğinde birlikte silinir/);
  assert.match(kvkk,/paylaşılan kadrolar hesabın açık olduğu sürece saklanır\. Hesabını sildiğinde bu kayıtlar veritabanından hemen silinir; paylaşım bağlantıların da artık açılmaz/);
  for(const html of [kvkk,privacy,contact])assert.doesNotMatch(html,/hesaba bağlama yayın güncellemesiyle/);
  // No postal address is published; written applications are routed via e-mail first (as on the contact page).
  assert.match(kvkk,/yazılı başvurunu nereye göndereceğini sana yazılı olarak bildiririz/);
  for(const html of [kvkk,privacy,contact])assert.doesNotMatch(html,/güvenceler (tamamlanmıştır|sağlanmıştır)|standart sözleşme imzalanmıştır/);
  assert.match(kvkk,/sonraki bir istek veya paylaşım sırasında çalışan otomatik temizlikle silinir/);
  // LAUNCH-LEGAL2 Terms: the enforced free-account limits, sharing rules and Weekly XI self-service deletion.
  for(const limit of ['10 kayıtlı Stüdyo çalışması','40 kayıtlı Haftanın İlk 11’i','500 oyuncu düzeltmesi','her UTC gününde en fazla 10 yeni paylaşım bağlantısı','400 kayıt işlemi ve toplam 50 MB'])assert.match(terms,new RegExp(limit,'i'),limit);
  assert.match(terms,/e-posta adresi doğrulanmış bir hesap/);assert.doesNotMatch(terms,/ödeme|abonelik|ücretli plan/i);
  assert.match(contact,/<tr><td>Haftanın İlk 11’i kayıtlarını silmek<\/td><td>“İlk 11’lerim” sayfası<\/td><\/tr>/);
  assert.match(cookiesPage(),/<code>taktik:oauth:next<\/code>/);
  // No invented identity, legal entity or private data.
  for(const slug of legal)assert.doesNotMatch(read(slug+'.html'),/T\.C\. kimlik no:|\bKEP adresi:\s*\S+@|Mah\.|Sok\.|Cad\./,slug);
});
