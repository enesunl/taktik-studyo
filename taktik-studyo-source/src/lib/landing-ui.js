export function mountLanding({auth,document,eventTarget}) {
  const signedOut = document.querySelectorAll('[data-logged-out]');
  const signedIn = document.querySelectorAll('[data-logged-in]');
  const button = document.getElementById('signOut'), message = document.getElementById('navStatus');
  let stopped = false, busy = false;
  function sync() {
    if (stopped) return;
    const state = auth.getState(), loggedIn = state.status === 'signed_in' && !!state.user?.id;
    for (const node of signedOut) node.hidden = loggedIn;
    for (const node of signedIn) node.hidden = !loggedIn;
  }
  async function logout() {
    if (busy || stopped) return;
    busy = true; button.disabled = true;
    try {
      const result = await auth.signOut();
      if (!stopped) {message.textContent = result.ok ? '' : 'Çıkış yapılamadı. Tekrar dene.'; sync();}
    } catch {if (!stopped) message.textContent = 'Çıkış yapılamadı. Tekrar dene.';}
    finally {busy = false; if (!stopped) button.disabled = false;}
  }
  const off = auth.subscribe(sync);
  button.addEventListener('click',logout); sync();
  const ready = auth.initialize().then(() => sync()).catch(() => {});
  function dispose() {stopped = true; off(); button.removeEventListener('click',logout); eventTarget.removeEventListener('pagehide',dispose);}
  eventTarget.addEventListener('pagehide',dispose);
  return {ready,dispose};
}
