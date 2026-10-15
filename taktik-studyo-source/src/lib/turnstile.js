// Cloudflare Turnstile, explicit rendering. Shared by sharing, the Auth forms and account deletion.
let widgetScript;
export function loadTurnstile() {
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!widgetScript)widgetScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error('Doğrulama yüklenemedi.'));},15000);
    script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):reject(new Error('Doğrulama yüklenemedi.'));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Doğrulama yüklenemedi.'));};document.head.append(script);
  }).catch(error=>{widgetScript=null;throw error;});
  return widgetScript;
}

// SEC2.2: one widget for a form. Tokens are single-use: token() is '' until solved and after expiry or reset().
// onChange(token, failed) lets the form enable its submit button.
export function mountTurnstile({host,siteKey,action,onChange=()=>{},load=loadTurnstile}) {
  let token='',sdk=null,id=null,disposed=false;
  const set=value=>{if(disposed)return;token=value;onChange(token,false);};
  const ready=load().then(api=>{
    if(disposed)return;sdk=api;
    id=api.render(host,{sitekey:siteKey,action,theme:'auto',callback:set,'expired-callback':()=>set(''),
      'error-callback':()=>{set('');return true;},'timeout-callback':()=>set('')});
  }).catch(()=>{if(!disposed)onChange('',true);});
  return {ready,token:()=>token,
    reset(){token='';if(sdk&&id!==null)sdk.reset(id);if(!disposed)onChange('',false);},
    dispose(){disposed=true;token='';if(sdk&&id!==null)sdk.remove(id);}};
}
