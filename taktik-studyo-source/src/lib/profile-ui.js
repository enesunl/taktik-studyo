const messages = {
  invalid_profile:'Kullanıcı adı 3–24 harf, rakam veya alt çizgi içermeli. Görünen ad en fazla 60 karakter olmalı; kontrol karakterleri kullanma.',
  username_conflict:'Bu kullanıcı adı kullanılıyor. Başka bir kullanıcı adı seç.',
  profile_load_failed:'Profil şu anda yüklenemedi. Biraz sonra tekrar dene.',
  profile_save_failed:'Profil şu anda güncellenemedi. Biraz sonra tekrar dene.',
  state_changed:'Oturum değişti. Devam etmek için sayfayı yeniden aç.',
  unauthenticated:'Devam etmek için giriş yap.',
};

export function profileInitials(name){
  const words=typeof name==='string'?name.trim().split(/\s+/).filter(Boolean):[];
  const letters=(words.length>1?[words[0],words.at(-1)]:words).map(w=>Array.from(w)[0]).join('');
  return letters.normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('en-US')||'TS';
}

export function mountProfile({document,api,validatedUser,current,projects,onSignOut}) {
  const root = document.getElementById('profileContent');
  root.replaceChildren(document.getElementById('profileTemplate').content.cloneNode(true));
  const form = root.querySelector('form'), username = root.querySelector('#profileUsername');
  const displayName = root.querySelector('#profileDisplayName'), email = root.querySelector('#profileEmail');
  const status = root.querySelector('#profileStatus'), save = root.querySelector('#profileSave');
  const retry = root.querySelector('#profileRetry');
  const name=root.querySelector('#profileName'),initials=root.querySelector('#profileInitials'),edit=root.querySelector('#profileEdit'),logout=root.querySelector('#profileSignOut');
  const accountEdit=root.querySelector('#profileAccountEdit'),cancel=root.querySelector('#profileCancel'),readOnly=root.querySelector('#profileReadOnly');
  const stats=root.querySelector('#profileStats'),recent=root.querySelector('#profileRecent'),empty=root.querySelector('#profileEmpty');
  const projectStatus=root.querySelector('#profileProjectsStatus'),projectRetry=root.querySelector('#profileProjectsRetry');
  let projectsBusy=false;
  let disposed = false, busy = false, loaded = false, editing = false, persisted = null, editOpener = edit;
  const active = () => !disposed && current();
  email.textContent = validatedUser.email || '—';
  root.querySelector('#profileReadEmail').textContent=validatedUser.email||'—';
  const apply = profile => {
    username.value = profile?.username || ''; displayName.value = profile?.display_name || '';
    const identity=profile?.display_name?.trim()||profile?.username?.trim();
    name.textContent=identity||validatedUser.email||'Çalışma alanım';initials.textContent=profileInitials(identity);
    // The verified email is shown once in the identity area, even for fallback titles.
    email.textContent=name.textContent===validatedUser.email?'':validatedUser.email||'—';
    email.hidden=!email.textContent;
    root.querySelector('#profileReadUsername').textContent=profile?.username||'—';root.querySelector('#profileReadDisplayName').textContent=profile?.display_name||'—';
  };
  apply(null);
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  async function loadProjects(){
    if(!active()||projectsBusy)return;projectsBusy=true;stats.hidden=true;empty.hidden=true;recent.replaceChildren();projectRetry.hidden=true;
    recent.setAttribute('aria-busy','true');projectStatus.textContent='Çalışmalar yükleniyor…';
    let result;try{result=await projects.getWorkspaceSummary();}catch{result={ok:false};}
    if(!active())return;projectsBusy=false;recent.setAttribute('aria-busy','false');
    if(!result.ok){projectStatus.textContent='Çalışmalar şu anda yüklenemedi. Tekrar deneyebilirsin.';projectRetry.hidden=false;return;}
    for(const [key,id]of [['total','Total'],['free','Free'],['match','Match']])root.querySelector('#profileCount'+id).textContent=String(result.counts[key]);
    stats.hidden=false;projectStatus.textContent='';empty.hidden=result.projects.length!==0;
    const ordered=[...result.projects].sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)||b.id.localeCompare(a.id)).slice(0,4);
    for(const p of ordered){
      const item=node('article'),copy=node('div'),title=node('h3',p.title),kind=node('p',p.studio_mode==='match'?'Maç çalışması':'Serbest stüdyo');
      const timestamp=Date.parse(p.updated_at),time=node('time',Number.isFinite(timestamp)?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(timestamp):'Tarih bilgisi yok');
      if(Number.isFinite(timestamp))time.setAttribute('datetime',new Date(timestamp).toISOString());
      const open=node('a','Aç →');open.href='/mac-studyosu?project='+p.id;open.setAttribute('aria-label',p.title+' çalışmasını aç');copy.append(title,kind);item.append(copy,time,open);recent.append(item);
    }
  }
  function syncMode(){
    form.hidden=!editing;form.inert=busy||!editing;readOnly.hidden=!loaded||editing;
    for(const b of [edit,accountEdit]){b.disabled=busy||!loaded;b.setAttribute('aria-expanded',String(editing));}
    accountEdit.hidden=editing;cancel.disabled=busy;
  }
  function editProfile(event){
    if(!active()||!loaded||busy)return;
    if(!editing){apply(persisted);editOpener=event?.currentTarget||edit;}
    editing=true;status.textContent='';syncMode();root.querySelector('#profileAccount').scrollIntoView({block:'start'});displayName.focus();
  }
  function cancelEdit(){if(!active()||busy||!editing)return;apply(persisted);editing=false;status.textContent='';syncMode();editOpener.focus();}
  function signOut(){if(active())void onSignOut?.();}
  function loading(value) {
    busy = value; save.disabled = value; retry.disabled = value;syncMode();
    form.setAttribute('aria-busy',String(value));
    save.textContent = value ? 'Kaydediliyor…' : 'Değişiklikleri kaydet';
  }
  function error(result, fallback) {status.textContent = messages[result.error?.code] || messages[fallback];}
  async function load() {
    if (!active() || busy) return;
    loaded = false; editing=false; retry.hidden = true; loading(true);
    status.textContent = 'Profil yükleniyor…';
    let result;
    try {result = await api.load();} catch {result = {ok:false};}
    if (!active()) return;
    loading(false);
    if (!result.ok) {error(result,'profile_load_failed'); retry.hidden = false; return;}
    persisted=result.profile;apply(persisted);loaded=true;syncMode();
    status.textContent = result.profile ? '' : 'Profilini tamamlamak için bir kullanıcı adı seç ve kaydet.';
  }
  async function submit(event) {
    event.preventDefault();
    if (!active() || busy || !loaded || !editing) return;
    loading(true); status.textContent = 'Profil kaydediliyor…';
    let result;
    try {result = await api.save({username:username.value,display_name:displayName.value});}
    catch {result = {ok:false};}
    if (!active()) return;
    loading(false);
    if (!result.ok) {error(result,'profile_save_failed'); return;}
    persisted=result.profile;apply(persisted);editing=false;syncMode();editOpener.focus();status.textContent = 'Profilin güncellendi.';
  }
  function dispose() {
    if (disposed) return;
    disposed = true; form.hidden = true; form.inert = true; apply(null); email.textContent = ''; status.textContent = '';
    form.removeEventListener('submit',submit); retry.removeEventListener('click',load);
    edit.removeEventListener('click',editProfile);accountEdit.removeEventListener('click',editProfile);cancel.removeEventListener('click',cancelEdit);logout.removeEventListener('click',signOut);projectRetry.removeEventListener('click',loadProjects);
    root.replaceChildren();
  }
  form.addEventListener('submit',submit); retry.addEventListener('click',load);
  edit.addEventListener('click',editProfile);accountEdit.addEventListener('click',editProfile);cancel.addEventListener('click',cancelEdit);logout.addEventListener('click',signOut);projectRetry.addEventListener('click',loadProjects);
  const ready = Promise.all([load(),loadProjects()]);
  return {ready,dispose};
}
