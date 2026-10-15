import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {pageFixture} from './helpers/auth-fixture.mjs';

const read = file => readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
const legal = ['kvkk-aydinlatma-metni','gizlilik-politikasi','kullanim-kosullari','cerez-politikasi','iletisim'];

test('LEGAL1 draft pages share theme shell, navigation, draft notice, noindex and review markers',()=>{
  for(const slug of legal){
    const html=read(slug+'.html'),head=html.split('</head>')[0];
    assert.match(head,/<meta name="robots" content="noindex">/,slug);
    assert.match(head,/href="legal.css"/,slug);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,slug);
    assert.match(html,/class="legal-draft" role="note"/,slug);
    assert.match(html,/\[REVIEW REQUIRED/,slug);
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
    for(const field of ['Ad Soyad','tebligata elverişli posta adresi'])assert.match(page,new RegExp(`\\[REVIEW REQUIRED: ${field}\\]`));
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
  for(const slug of ['gizlilik-politikasi','kullanim-kosullari','iletisim'])assert.match(read(slug+'.html'),/Tehlikeli Bölge[\s\S]{0,200}REVIEW REQUIRED: hesap silme özelliği yalnızca yerel ortamda doğrulandı; yayından önce canlıya alınmalı/,slug);
  for(const slug of legal)assert.doesNotMatch(read(slug+'.html'),/hesab(ın)?a bağlı değildir|süresiz saklanır/,slug);
  assert.match(contact,/REVIEW REQUIRED: sağlayıcı yedek ve kayıt süreleri doğrulanmalı/);
  for(const slug of legal){const html=read(slug+'.html');assert.doesNotMatch(html,/type="checkbox"|<form/,slug);assert.match(html,/<meta name="robots" content="noindex">/,slug);assert.match(html,/class="legal-draft"/,slug);}
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
  assert.match(kvkk,/Resend kullanımına işaret ediyor; Supabase Auth SMTP ayarı doğrulanmalı/);
  assert.doesNotMatch(read('gizlilik-politikasi.html'),/yazı tipleri\)/);
  assert.match(cookies,/Google Fonts veya başka bir yazı tipi servisine istek yapılmaz/);
  assert.match(cookies,/__cf_bm/);assert.match(cookies,/Turnstile’ın çerez veya tarayıcı depolaması kullanıp kullanmadığı <mark class="legal-review">\[REVIEW REQUIRED/);
});

test('LEGAL2 drafts reflect verified providers, separate live from planned features and keep review gates',()=>{
  const kvkk=read('kvkk-aydinlatma-metni.html'),privacy=read('gizlilik-politikasi.html'),terms=read('kullanim-kosullari.html'),contact=read('iletisim.html');
  // Not yet live features are named in one explicit review marker on every content page.
  for(const [slug,html] of [['kvkk',kvkk],['gizlilik',privacy],['kosullar',terms],['iletisim',contact]]){
    assert.match(html,/<p class="legal-scope"><mark class="legal-review">\[REVIEW REQUIRED: Bu taslak, yayın için planlanan hizmeti anlatır\.[^<]*uygulama içi hesap silme[^<]*yayımlanmamalı\.\]<\/mark><\/p>/,slug);
  }
  for(const slug of legal)assert.match(read(slug+'.html'),/Taslak tarihi: 15 Ekim 2026/,slug);
  // Verified facts: Google Workspace mailbox, Supabase Frankfurt region, BSD as the sports-data source.
  assert.match(kvkk,/Google \(Google Workspace e-posta hizmeti\)/);assert.match(privacy,/Google Workspace/);
  assert.doesNotMatch(kvkk,/Frankfurt, Almanya <mark class="legal-review">\[REVIEW REQUIRED: canlı ayar doğrulanmalı\]/);
  for(const html of [kvkk,privacy,terms])assert.match(html,/BSD Sports Data/);
  assert.match(terms,/resmî lig, kulüp veya federasyon verisi değildir/);
  assert.match(terms,/toplu olarak kopyalamak, ham veri olarak yeniden dağıtmak/);
  // Unverified items stay gated: identity, transfers, provider agreements, retention, licence.
  assert.match(kvkk,/Bu metindeki bilgilendirme tek başına aktarımı hukuka uygun hâle getirmez/);
  assert.match(kvkk,/E-posta yazışmaları ve KVKK başvuru kayıtları: <mark class="legal-review">\[REVIEW REQUIRED: saklama süresi/);
  // LEGAL2.1: the 8 old links are decided test data; account linkage and retention stay gated.
  for(const html of [kvkk,privacy])assert.match(html,/\[REVIEW REQUIRED: hesaba bağlama yayın güncellemesiyle canlıya alınacak \(canlıdaki 8 eski test bağlantısı bu güncellemede kaldırılır\); ayrı bir saklama süresi operatör kararı\]/);
  assert.match(contact,/hesaba bağlama yayın güncellemesiyle canlıya alınacak/);
  assert.match(kvkk,/Supabase Auth SMTP ayarı doğrulanmalı; sağlayıcı adı ve konumu buna göre yazılmalı/);
  assert.match(terms,/BSD lisansının \(sürüm 4\.0\)[^<]*hukukçu tarafından onaylanmalı/);
  // No invented identity, legal entity or private data.
  for(const slug of legal)assert.doesNotMatch(read(slug+'.html'),/T\.C\. kimlik no:|\bKEP adresi:\s*\S+@|Mah\.|Sok\.|Cad\./,slug);
});
