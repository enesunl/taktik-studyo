import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{}});
vm.runInContext(readFileSync('dist/rosters.js','utf8'),ctx);
const app=readFileSync('dist/app.js','utf8');
const expression=app.match(/const teams=([\s\S]*?);\nconst shapes=/)[1];
const teams=vm.runInContext(expression,ctx);
const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
let sql='-- Existing bundled catalogue snapshot; no new roster accuracy claim.\nbegin;\n',total=0;
const ids=new Set();
for(let i=0;i<teams.length;i++){
  const t=teams[i],roster=ctx.window.TAKTIK_ROSTERS.teams[t.name],id='fotmob-'+roster.source.match(/teams\/(\d+)/)[1];
  sql+=`insert into public.teams(id,name,short_name,color_primary,color_secondary,source_url,sort_order) values (${[id,t.name,t.short,t.color,t.color2,roster.source].map(q).join(',')},${i});\n`;
  for(const p of roster.players){
    if(ids.has(p.id))throw new Error('Duplicate player ID in bundled catalogue');ids.add(p.id);
    const rank=(p.starts||0)+(p.value||0)/1e12;
    sql+=`insert into public.players(id,team_id,name,position,shirt_number,photo_url,roles,selection_rank) values (${[p.id,id,p.name,p.position].map(q).join(',')},${p.number??'null'},${q(p.photo)},ARRAY[${(p.roles||[]).map(q).join(',')}]::text[],${rank});\n`;
    total++;
  }
}
sql+='commit;\n';writeFileSync('supabase/seed.sql',sql);
console.log(`${teams.length} teams / ${total} players prepared from the existing catalogue.`);
