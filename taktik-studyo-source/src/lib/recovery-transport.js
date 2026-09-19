// The SDK re-reads its session asynchronously inside updateUser/signOut. During
// recovery, refuse dispatch with a different credential even before a cross-tab
// Auth event arrives. Credentials come only from verifyOtp's response, never from
// manual storage access. They remain private and are released after the operation.
export function createRecoveryTransport(baseUrl, fetcher) {
  let active = null;
  return Object.freeze({
    begin(checks) {
      if (active) throw new Error('Recovery already active');
      const operation = {checks,credential:null}; active = operation;
      return {
        authorize(token) {operation.credential = typeof token === 'string' && token ? 'Bearer '+token : null;},
        release() {operation.credential = null; if (active === operation) active = null;},
      };
    },
    fetch(input, options = {}) {
      if (active) {
        const url = new URL(typeof input === 'string' ? input : input.url || input.href);
        const method = (options.method || input.method || 'GET').toUpperCase();
        const verify = url.href === baseUrl+'/auth/v1/verify' && method === 'POST';
        const mutate = (url.origin+url.pathname === baseUrl+'/auth/v1/user' && method === 'PUT')
          || (url.origin+url.pathname === baseUrl+'/auth/v1/logout' && method === 'POST');
        if ((verify && !active.checks.canVerify()) || (mutate && (!active.checks.canMutate()
          || !active.credential || new Headers(options.headers || input.headers).get('authorization') !== active.credential))) {
          active.checks.onBlocked();
          // 409 is deliberately not one of the SDK signOut's ignored 401/403/404.
          return Promise.resolve(Response.json({code:'recovery_state_changed',message:'Recovery state changed'}, {status:409}));
        }
      }
      return fetcher(input,options);
    },
  });
}
