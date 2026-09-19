export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';
export const row = (id = A, username = 'Canonical') => ({id,username,display_name:'Görünen ad',created_at:'2026-09-19',updated_at:'2026-09-19'});
export const deferred = () => {let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve};};
export const tick = () => new Promise(r => setTimeout(r,0));

// Supabase query-builder double, including thenable INSERT for existing bootstrap.
export function profileClient(handler = () => ({data:row(),error:null})) {
  const calls = [];
  const client = {
    auth:{async getUser(){calls.push({kind:'getUser'});return {data:{user:{id:A,email_confirmed_at:'yes',user_metadata:{username:'SeedName'}}}};},
      updateUser(){throw Error('Auth metadata must never be updated');}},
    from(table) {
      const call = {table,kind:'select',filters:[]};
      let pending;
      const run = () => pending ||= Promise.resolve().then(() => {calls.push(call);return handler(call);});
      const query = {
        select(columns){call.columns=columns;return query;},
        eq(column,value){call.filters.push([column,value]);return query;},
        insert(values){call.kind='insert';call.values=values;return query;},
        update(values){call.kind='update';call.values=values;return query;},
        maybeSingle(){call.single=true;return run();},
        then(a,b){return run().then(a,b);},
      };
      return query;
    },
  };
  return {client,calls};
}

export class ProfileNode {
  constructor(){this.listeners=new Map();this.children=[];this.value='';this.textContent='';this.hidden=false;this.inert=false;this.disabled=false;this.attrs={};}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  removeEventListener(name,fn){if(this.listeners.get(name)===fn)this.listeners.delete(name);}
  setAttribute(name,value){this.attrs[name]=value;}
  emit(name){return this.listeners.get(name)?.({preventDefault(){}});}
  replaceChildren(...children){this.children=children;}
  querySelector(selector){return this.children[0]?.fields[selector];}
}
export function profileDocument(base = {getElementById(){}}) {
  const root = new ProfileNode(), mounts = [];
  const template = {content:{cloneNode(){
    const fields = Object.fromEntries(['form','#profileUsername','#profileDisplayName','#profileEmail','#profileStatus','#profileSave','#profileRetry'].map(key=>[key,new ProfileNode()]));
    fields.form.hidden=true;fields.form.inert=true;
    const fragment={fields};mounts.push(fragment);return fragment;
  }}};
  const get = base.getElementById.bind(base);
  return {root,mounts,document:{...base,getElementById:id=>id==='profileContent'?root:id==='profileTemplate'?template:get(id)}};
}
