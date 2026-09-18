export function createBotVerifier({secret,origins,fetcher=fetch}) {
  return async request=>{
    const token=request.headers.get('x-bot-token');
    // Production is fail-closed: missing configuration never bypasses verification.
    if(!secret || !token || token.length>2048)return false;
    try{
      const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
        method:'POST',body:new URLSearchParams({secret,response:token}),signal:AbortSignal.timeout(5000)
      });
      if(!response.ok)return false;
      const result=await response.json();
      return result.success===true && result.action==='share_lineup' && origins.some(origin=>new URL(origin).hostname===result.hostname);
    }catch{return false;}
  };
}
