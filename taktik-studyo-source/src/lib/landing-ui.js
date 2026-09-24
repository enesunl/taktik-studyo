export function mountLanding({auth,document,eventTarget}) {
  const signedOut = document.querySelectorAll('[data-logged-out]');
  const signedIn = document.querySelectorAll('[data-logged-in]');
  let stopped = false;
  function sync() {
    if (stopped) return;
    const state = auth.getState(), loggedIn = state.status === 'signed_in' && !!state.user?.id;
    for (const node of signedOut) node.hidden = loggedIn;
    for (const node of signedIn) node.hidden = !loggedIn;
  }
  const off = auth.subscribe(sync);
  sync();
  const ready = auth.initialize().then(() => sync()).catch(() => {});
  function dispose() {stopped = true; off(); eventTarget.removeEventListener('pagehide',dispose);}
  eventTarget.addEventListener('pagehide',dispose);
  return {ready,dispose};
}
