import {createAuthSession} from '../../src/lib/auth-session.js';
import {createAuthPageApi} from '../../src/lib/auth-page-api.js';

export const id = '11111111-1111-4111-8111-111111111111';
export const user = {id,email:'test@example.test',email_confirmed_at:'2026-09-18T10:00:00Z',
  user_metadata:{username:'Test_12',id:'attacker-id',role:'admin'}};
export const session = {user,access_token:'fake-access-private',refresh_token:'fake-refresh-private'};
export const credentials = {email:' test@example.test ',password:' twelve chars ',username:'Test_12'};
export function fixture({initial = null, captchaConfigured = false, origin = 'https://taktikstudyo.com'} = {}) {
  const calls = {signup:[],login:[],verify:[],select:[],insert:[],getUser:0};
  let callback, current = initial;
  const f = {calls,signupResult:{data:{user,session:null},error:null},
    verificationResult:{data:{user,session},error:null},loginResult:{data:{user,session},error:null},
    userResult:{data:{user},error:null},rows:[{data:{id,username:'Test_12'},error:null}],insertResult:{error:null}};
  const client = {auth:{
    onAuthStateChange(fn) {callback = fn; return {data:{subscription:{unsubscribe(){callback = null;}}}};},
    async getSession(){return {data:{session:current},error:null};},
    async getUser(){calls.getUser++; return f.userResult;},
    async signUp(args){calls.signup.push(args); if (!f.signupResult.error && f.signupResult.data?.session) f.emit('SIGNED_IN',f.signupResult.data.session); return f.signupResult;},
    async signInWithPassword(args){calls.login.push(args); if (!f.loginResult.error) f.emit('SIGNED_IN',session); return f.loginResult;},
    async verifyOtp(args){calls.verify.push(args); if (!f.verificationResult.error) f.emit('SIGNED_IN',session); return f.verificationResult;},
    async signOut(){throw Error('must not sign out');},
  },from(table){
    if (table !== 'profiles') throw Error('unexpected table');
    return {select(columns){return {eq(column,value){calls.select.push({table,columns,column,value});
      return {async maybeSingle(){return f.rows.length > 1 ? f.rows.shift() : f.rows[0];}};}};},
      async insert(payload){calls.insert.push(payload); return f.insertResult;},
      upsert(){throw Error('upsert forbidden');}};
  }};
  f.emit = (event,value) => {current = value; callback?.(event,value);};
  f.client = client; f.auth = createAuthSession(client);
  f.api = createAuthPageApi({auth:f.auth,client,origin,captchaConfigured});
  return f;
}

export function element(value = '') {
  const listeners = new Map();
  return {value,textContent:'',disabled:false,attributes:{},
    setAttribute(k,v){this.attributes[k] = v;},
    addEventListener(k,fn){listeners.set(k,fn);},
    removeEventListener(k,fn){if (listeners.get(k) === fn) listeners.delete(k);},
    async emit(k){await listeners.get(k)?.({preventDefault(){}});},
  };
}
export function pageFixture(page = 'callback', search = '?token_hash=fake-token-hash&type=email') {
  const fields = Object.fromEntries(['authSubmit','authMessage','profileMessage','email','password','passwordConfirmation','username'].map(k => [k,element()]));
  if (page !== 'callback') fields.authForm = element();
  fields.email.value = credentials.email; fields.password.value = credentials.password;
  fields.passwordConfirmation.value = credentials.password; fields.username.value = credentials.username;
  const events = element(), historyCalls = [], calls = [];
  const f = {fields,events,calls,state:{status:'signed_out',user:null}};
  f.api = {async initialize(){return {ok:true};},getState:() => f.state,
    async verifyEmail(token){calls.push({kind:'verify',token}); f.state = {status:'signed_in',user}; return {ok:true,userId:id,profile:{status:'ready'}};},
    async signIn(args){calls.push({kind:'login',args}); return {ok:true,profile:{status:'ready'}};},
    async signUp(args){calls.push({kind:'signup',args}); return {ok:true,status:'confirmation_pending'};}};
  f.options = {page,api:f.api,eventTarget:events,document:{getElementById:id => fields[id] || null},
    location:{search,pathname:page === 'callback' ? '/auth-callback.html' : '/giris.html',assign(url){calls.push({kind:'navigate',url});},replace(url){calls.push({kind:'replace',url});}},
    history:{replaceState(...args){historyCalls.push(args);}}};
  f.historyCalls = historyCalls;
  return f;
}
