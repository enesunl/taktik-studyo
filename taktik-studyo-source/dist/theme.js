// Hand-maintained, synchronous pre-paint preference bootstrap. No Auth/network dependency.
(() => {
  const key='taktik:theme:v1',valid=value=>value==='light'||value==='dark';
  let saved=null,media=null;
  try{saved=localStorage.getItem(key);}catch{}
  try{media=matchMedia('(prefers-color-scheme: dark)');}catch{}
  let explicit=valid(saved),theme=explicit?saved:media?.matches?'dark':'light';
  function apply(value,animate=false){
    for(const b of document.querySelectorAll('[data-theme-toggle]'))b.setAttribute('data-theme-animate',String(animate));
    theme=value;document.documentElement.dataset.theme=value;
    document.documentElement.style.colorScheme=value;
    for(const b of document.querySelectorAll('[data-theme-toggle]')){
      b.textContent='';
      b.setAttribute('aria-pressed',String(value==='dark'));
      b.setAttribute('aria-label',value==='dark'?'Koyu tema etkin. Açık temaya geç':'Açık tema etkin. Koyu temaya geç');
      b.title=b.getAttribute('aria-label');
    }
  }
  apply(theme);
  document.addEventListener('DOMContentLoaded',()=>{
    apply(theme);
    for(const b of document.querySelectorAll('[data-theme-toggle]'))b.addEventListener('click',()=>{
      explicit=true;apply(theme==='dark'?'light':'dark',true);try{localStorage.setItem(key,theme);}catch{}
    });
  },{once:true});
  media?.addEventListener?.('change',()=>{if(!explicit)apply(media.matches?'dark':'light');});
  window.addEventListener('storage',event=>{
    if(event.key!==key&&event.key!==null)return;
    explicit=event.key===key&&valid(event.newValue);apply(explicit?event.newValue:media?.matches?'dark':'light');
  });
})();
