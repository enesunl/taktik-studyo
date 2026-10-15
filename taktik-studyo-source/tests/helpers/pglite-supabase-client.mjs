// Minimal supabase-js-shaped client over PGlite for server-tool tests. Every call runs under
// the given database role (e.g. service_role), so real grants, RLS and SQL functions apply.
// Supports from(table).select().order().range()/eq() and rpc(name,args). Test-only.
export function pgliteClient(db,role='service_role'){
  const run=async(sql,params)=>{
    await db.exec('set role '+role);
    try{return {data:(await db.query(sql,params)).rows,error:null};}
    catch(e){return {data:null,error:{code:e.code,message:e.message}};}
    finally{await db.exec('reset role');}
  };
  return {
    from(table){
      if(!/^[a-z_]+$/.test(table))throw Error('table');
      const q={where:[],args:[],order:null,from:0,to:null};
      const b={select(){return b;},order(c){if(!/^[a-z_]+$/.test(c))throw Error('order');q.order=c;return b;},
        eq(c,v){if(!/^[a-z_]+$/.test(c))throw Error('col');q.args.push(v);q.where.push(c+'=$'+q.args.length);return b;},
        range(a,z){q.from=a;q.to=z;return b;},
        then(ok,ko){return run(`select * from public.${table}${q.where.length?' where '+q.where.join(' and '):''}${q.order?' order by '+q.order:''}${q.to!==null?` limit ${q.to-q.from+1} offset ${q.from}`:''}`,q.args)
          .then(r=>r.data?{...r,data:r.data.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString():v])))}:r).then(ok,ko);}};
      return b;
    },
    async rpc(name,args={}){
      if(!/^[a-z_]+$/.test(name))throw Error('rpc');
      const keys=Object.keys(args);
      const r=await run(`select public.${name}(${keys.map((k,i)=>k+'=>$'+(i+1)+'::jsonb').join(',')}) as result`,keys.map(k=>JSON.stringify(args[k])));
      return r.error?{data:null,error:r.error}:{data:r.data[0].result,error:null};
    },
  };
}
