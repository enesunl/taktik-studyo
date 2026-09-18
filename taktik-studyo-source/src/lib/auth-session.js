const failure = code => Object.freeze({ok:false, error:Object.freeze({code})});
const success = value => Object.freeze({ok:true, ...value});
const userView = user => user && typeof user.id === 'string' && user.id
  ? Object.freeze({id:user.id, email:typeof user.email === 'string' ? user.email : null,
    emailConfirmedAt:typeof user.email_confirmed_at === 'string' ? user.email_confirmed_at : null})
  : null;

// SDK owns session persistence and token refresh. This controller keeps only a
// UI identity snapshot; it is never an authorization proof. RLS remains decisive.
export function createAuthSession(client) {
  let state = Object.freeze({status:'idle', user:null, event:null});
  let subscription = null, pending = null, epoch = 0, revision = 0, liveEvent = false;
  const listeners = new Map();
  function notify(listener, marker, snapshot, generation) {
    // Do not run consumer Auth calls inside the SDK's synchronous callback/lock.
    setTimeout(() => {
      if (epoch !== generation || listeners.get(listener) !== marker) return;
      try { Promise.resolve(listener(snapshot)).catch(() => {}); } catch {}
    }, 0);
  }
  function publish(user, event) {
    const currentUser = userView(user);
    const status = currentUser ? (event === 'PASSWORD_RECOVERY' ? 'password_recovery' : 'signed_in') : 'signed_out';
    const next = Object.freeze({status, user:currentUser, event});
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    for (const [listener, marker] of listeners) notify(listener, marker, state, epoch);
  }
  function initialize() {
    if (pending) return pending;
    if (!client) return Promise.resolve(failure('auth_unavailable'));
    const generation = epoch, start = revision;
    // Defer setup so pending is assigned even for synchronously emitting fakes.
    pending = Promise.resolve().then(async () => {
      try {
        if (generation !== epoch) return failure('state_changed');
        if (!subscription) {
          subscription = client.auth.onAuthStateChange((event, session) => {
            if (generation !== epoch) return;
            if (!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED','PASSWORD_RECOVERY'].includes(event)) return;
            if (event === 'INITIAL_SESSION' && liveEvent) return;
            if (event !== 'INITIAL_SESSION') liveEvent = true;
            revision++;
            publish(event === 'SIGNED_OUT' ? null : session?.user, event);
          }).data.subscription;
        }
        const result = await client.auth.getSession();
        if (generation !== epoch) return failure('state_changed');
        // A late restore must not resurrect a session after logout/account change.
        if (revision === start) {
          if (result.error) return failure('session_restore_failed');
          publish(result.data?.session?.user, 'INITIAL_SESSION');
        }
        return success({state});
      } catch { return failure('session_restore_failed'); }
    }).then(result => {
      if (!result.ok && generation === epoch) {
        subscription?.unsubscribe(); subscription = null; pending = null;
      }
      return result;
    });
    return pending;
  }
  async function signInWithPassword(credentials) {
    const ready = await initialize();
    if (!ready.ok) return ready;
    if (!credentials || typeof credentials.email !== 'string' || !credentials.email.trim()
      || typeof credentials.password !== 'string' || !credentials.password) return failure('invalid_credentials');
    const generation = epoch, start = revision;
    try {
      const options = typeof credentials.captchaToken === 'string' ? {captchaToken:credentials.captchaToken} : undefined;
      const result = await client.auth.signInWithPassword({email:credentials.email, password:credentials.password, ...(options ? {options} : {})});
      if (generation !== epoch) return failure('state_changed');
      if (result.error || !result.data?.session || !userView(result.data.user)) return failure('sign_in_failed');
      if (revision === start) { revision++; liveEvent = true; publish(result.data.user, 'SIGNED_IN'); }
      else if (state.user?.id !== result.data.user.id) return failure('state_changed');
      return success({user:state.user});
    } catch { return failure('sign_in_failed'); }
  }
  async function signOut() {
    const ready = await initialize();
    if (!ready.ok) return ready;
    const generation = epoch, start = revision;
    try {
      const result = await client.auth.signOut({scope:'local'});
      if (generation !== epoch) return failure('state_changed');
      if (result.error) return failure('sign_out_failed');
      if (revision === start) { revision++; liveEvent = true; publish(null, 'SIGNED_OUT'); }
      else if (state.user) return failure('state_changed');
      return success({state});
    } catch { return failure('sign_out_failed'); }
  }
  async function validateUser() {
    const ready = await initialize();
    if (!ready.ok) return ready;
    const generation = epoch, start = revision;
    try {
      // Always ask Auth server; never accept the restored local user as proof.
      const result = await client.auth.getUser();
      if (generation !== epoch || revision !== start) return failure('state_changed');
      if (result.error) return failure('user_validation_failed');
      const user = userView(result.data?.user);
      if (!user) return failure('unauthenticated');
      return success({user});
    } catch { return failure('user_validation_failed'); }
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected listener');
    if (!listeners.has(listener)) {
      const marker = {};
      listeners.set(listener, marker);
      notify(listener, marker, state, epoch);
    }
    const marker = listeners.get(listener);
    return () => { if (listeners.get(listener) === marker) listeners.delete(listener); };
  }
  function dispose() {
    epoch++; revision++; liveEvent = false;
    subscription?.unsubscribe(); subscription = null; pending = null;
    listeners.clear(); state = Object.freeze({status:'idle', user:null, event:null});
    // No signOut, storage clearing or SDK shutdown: client is shared with catalogue.
  }
  return Object.freeze({initialize, getState:() => state, getCurrentUser:() => state.user,
    signInWithPassword, signOut, subscribe, validateUser, dispose});
}
