// Offline evidence extraction. No provider requests, no production credentials.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFileSync(resolve(root,p),'utf8');
const norm=v=>v.normalize('NFKD').replace(/[ıİ]/g,'i').toLowerCase().replace(/\p{M}/gu,'').replace(/[’‘`´ʼ']/g,'').replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
const rows=s=>s.split('\n').filter(l=>/^\| \d/.test(l)).map(l=>l.trim().slice(1,-1).split('|').map(x=>x.trim()));
export function auditInput(){
  const d1=read('BSD_CATALOGUE_COMPATIBILITY_AUDIT.md'),d11=read('BSD_MIGRATION_BLOCKER_AUDIT.md');
  const roster=JSON.parse(read('dist/rosters.js').replace(/^\s*window\.TAKTIK_ROSTERS\s*=\s*/,'').replace(/;\s*$/,''));
  const seed=read('supabase/seed.sql');
  const slugs=['alanyaspor','amedspor','basaksehir','besiktas','caykur-rizespor','corum-fk','erzurumspor','eyupspor','fenerbahce','galatasaray','gaziantep-fk','genclerbirligi','goztepe','kasimpasa','kocaelispor','konyaspor','samsunspor','trabzonspor'];
  const teamRows=d1.split('## 3.')[1].split('## 4.')[0].split('\n').filter(l=>/^\| .*\| fotmob-/.test(l)).map(l=>l.trim().slice(1,-1).split('|').map(x=>x.trim()));
  assert.equal(teamRows.length,slugs.length);
  const teams=teamRows.map(([legacyName,legacyId,bsdId,name],i)=>{
    const line=seed.split('\n').find(l=>l.startsWith('insert into public.teams')&&l.includes("values ('"+legacyId+"',"));
    const fields=[...line.matchAll(/'((?:''|[^'])*)'/g)].map(m=>m[1].replaceAll("''","'"));
    return {id:slugs[i],display_name:fields[1],short_name:fields[2],color_primary:fields[3],color_secondary:fields[4],sort_order:i,bsdId,legacyId,legacyName,providerName:name};
  });
  const players=rows(d11.split('## Appendix B.')[1]).map(([id,team,name,group,detailGroup,specific,n,detailNumber])=>{
    assert.equal(group,detailGroup);assert.equal(n,detailNumber);
    const t=teams.find(t=>t.providerName===team);assert(t,'Unknown audit team');
    return {provider_id:id,team_id:t.id,display_name:name,position_group:group,specific_position:specific,shirt_number:n==='NULL'?null:Number(n)};
  });
  const old=teams.flatMap(t=>roster.teams[t.legacyName].players.map(p=>({...p,team_id:t.id})));
  const matches=old.map(p=>{
    const global=players.filter(b=>norm(b.display_name)===norm(p.name)),same=global.filter(b=>b.team_id===p.team_id),c=same.length?same:global;
    return {p,c,match:c.length===1?c[0]:null,high:c.length===1&&same.length>0&&p.number!=null&&p.number===c[0].shirt_number&&p.position===c[0].position_group};
  });
  const claims=new Map();for(const m of matches)if(m.match)claims.set(m.match.provider_id,(claims.get(m.match.provider_id)||0)+1);
  const high=matches.filter(m=>m.high&&claims.get(m.match.provider_id)===1).map(m=>({legacy_id:m.p.id,provider_id:m.match.provider_id,evidence:'D1_HIGH'}));
  const variants=rows(d11.split('## Appendix A.')[1].split('## Appendix B.')[0]).map(([legacy_id,,provider_id,,evidence])=>{
    const a=old.find(p=>p.id===legacy_id),b=players.find(p=>p.provider_id===provider_id);
    assert(a&&b&&a.team_id===b.team_id&&a.number===b.shirt_number&&a.position===b.position_group);
    assert(matches.find(m=>m.p.id===legacy_id).c.length===0,'Variant must be in legacy-only cohort');
    assert(!matches.some(m=>m.c.some(c=>c.provider_id===provider_id)),'Reserved D1 target');
    return {legacy_id,provider_id,evidence:'D1_1_'+evidence};
  });
  const aliases=[...high,...variants];
  assert.equal(new Set(aliases.map(a=>a.legacy_id)).size,aliases.length);assert.equal(new Set(aliases.map(a=>a.provider_id)).size,aliases.length);
  assert.equal(players.length,543);assert.equal(new Set(players.map(p=>p.provider_id)).size,543);
  const unresolved=matches.filter(m=>!aliases.some(a=>a.legacy_id===m.p.id)).map(m=>({legacy_id:m.p.id,team_id:m.p.team_id,
    reason:m.c.length===0?'NO_SAFE_MATCH':m.c.length>1||claims.get(m.match?.provider_id)>1?'AMBIGUOUS':'MEDIUM'}));
  return {version:1,evidence:Object.fromEntries(['BSD_CATALOGUE_COMPATIBILITY_AUDIT.md','BSD_MIGRATION_BLOCKER_AUDIT.md','dist/rosters.js'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')])),
    summary:{teams:teams.length,players:players.length,high:high.length,safeVariants:variants.length,safeAliases:aliases.length,unresolved:unresolved.length},teams,players,aliases,unresolved};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const fixture=auditInput();mkdirSync(resolve(root,'tests/fixtures'),{recursive:true});
  // One curated row per line keeps this review fixture compact and diffable.
  const json='{\n'+Object.entries(fixture).map(([key,value])=>'  '+JSON.stringify(key)+': '+(Array.isArray(value)?'[\n'+value.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':JSON.stringify(value))).join(',\n')+'\n}\n';
  writeFileSync(resolve(root,'tests/fixtures/bsd-catalogue-audit.json'),json);
  console.log(JSON.stringify(fixture.summary));
}
