// Disclosure only. The existing guarded #signOut handler remains the sole logout path.
(() => {
  const cleanups=[];
  for(const root of document.querySelectorAll('[data-account-menu]')){
    const trigger=root.querySelector('[data-account-trigger]'),panel=root.querySelector('[data-account-panel]');
    const items=[...panel.querySelectorAll('button:not(:disabled),a[href]')];
    function set(open,focus=false){panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(focus)(open?items[0]:trigger)?.focus();}
    function listen(target,type,fn){target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));}
    listen(trigger,'click',()=>set(panel.hidden));
    listen(root,'keydown',event=>{
      if(event.key==='Escape'&&!panel.hidden){event.preventDefault();set(false,true);}
      else if(event.target===trigger&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();set(true,true);}
    });
    listen(document,'pointerdown',event=>{if(!root.contains(event.target))set(false);});
    listen(document,'focusin',event=>{if(!root.contains(event.target))set(false);});
    listen(panel,'click',event=>{if(event.target.closest('button:not(:disabled),a[href]'))set(false);});
  }
  window.addEventListener('pagehide',()=>{for(const off of cleanups)off();},{once:true});
})();
