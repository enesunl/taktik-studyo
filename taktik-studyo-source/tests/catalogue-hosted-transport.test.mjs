import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createCatalogueSource} from '../src/lib/catalogue-source.js';

// SEC1.1: on a hosted origin the BSD catalogue is read through the app's own Supabase client
// (authenticated catalogue_* tables). No legacy tables, no local transport, no static roster.
const url='https://abcdefghijklmnopqrst.supabase.co',key='sb_publishable_test_only',jwt='signed-in-jwt';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const bsd=read('./fixtures/bsd-catalogue-clean.json'),registry=read('../scripts/catalogue/team-registrations.json');
const uuid=s=>{const h=createHash('sha256').update(s).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);};
const teams=registry.map(t=>({id:t.id,display_name:t.display_name,short_name:t.short_name,color_primary:t.color_primary,color_secondary:t.color_secondary,sort_order:t.sort_order,catalogue_active:true}));
const players=bsd.players.map(p=>({id:uuid('bsd:'+p.provider_id),team_id:p.team_id,display_name:p.display_name,position_group:p.position_group,specific_position:p.specific_position,shirt_number:p.shirt_number,catalogue_active:true}));

function hosted({status=200}={}){
  const calls=[];
  const fetchImpl=async(input,init={})=>{
    const target=new URL(input),headers=new Headers(init.headers);calls.push({path:target.pathname,auth:headers.get('authorization')});
    assert.equal(target.origin,url);
    if(status!==200)return Response.json({code:'42501',message:'permission denied'},{status});
    if(target.pathname==='/rest/v1/catalogue_teams')return Response.json(teams);
    if(target.pathname==='/rest/v1/catalogue_players')return Response.json(players.filter(p=>!target.searchParams.get('id')||p.id>target.searchParams.get('id').replace(/^gt\./,'')).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,1000));
    throw Error('unexpected request '+target.pathname);
  };
  const client=createClient(url,key,{accessToken:async()=>jwt,global:{fetch:fetchImpl}});
  const window={location:{origin:'https://taktikstudyo.com'}};
  return {calls,window,source:createCatalogueSource({config:{source:'canonical'},client,window,fetchImpl:()=>{throw Error('local transport must not be used');}})};
}

test('hosted canonical catalogue: 18 teams / 543 BSD players via catalogue_* with the user session; boards get internal identities',async()=>{
  const h=hosted();assert.equal(h.source.local,false);
  const model=await h.source.load();
  assert.equal(model.teams.length,18);assert.equal(model.players.length,543);
  assert.ok(h.calls.length>=2&&h.calls.every(c=>['/rest/v1/catalogue_teams','/rest/v1/catalogue_players'].includes(c.path)),JSON.stringify(h.calls));
  assert.ok(h.calls.every(c=>c.auth==='Bearer '+jwt),'every catalogue read carries the signed-in session');
  const rosters=h.window.TAKTIK_ROSTERS.teams;assert.equal(Object.keys(rosters).length,18);
  for(const [name,squad] of Object.entries(rosters)){
    assert.equal(squad.identity,'internal',name);assert.equal('source' in squad,false,'no legacy source URL');
    // Default XI comes from the deterministic canonical arrangement (no local defaults service here).
    const xi=h.source.selectXI(squad,'4-3-3');assert.equal(xi.length,11);assert.equal(new Set(xi.map(p=>p.id)).size,11);
    assert.equal(xi.filter(p=>p.positionGroup==='G').length,1,name);
  }
  assert.doesNotMatch(JSON.stringify(h.window.TAKTIK_ROSTERS),/fotmob|source_url|photo|faces\/|"starts"|"value"|selection_rank/);
});

test('hosted canonical failure is explicit (no legacy tables, no bundled roster)',async()=>{
  const h=hosted({status:401});
  await assert.rejects(h.source.load(),e=>['network_failure','schema_unavailable'].includes(e.code));
  assert.equal(h.window.TAKTIK_ROSTERS,undefined);assert.equal(h.window.TAKTIK_TEAMS,undefined);
  assert.ok(h.calls.every(c=>c.path==='/rest/v1/catalogue_teams'));
});
