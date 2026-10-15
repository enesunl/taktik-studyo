// Static HTTP regression fixture only. Never imported or served by the app.
// Real command-line startup always obtains config + health from Supabase CLI.
//
// PROD1.5 flake fix: the port is chosen here and held open while the (slow, CPU-bound) local
// bundle builds, then released and bound immediately. Previously the parent test reserved and
// released a port seconds before this process bound it, which raced other parallel tests.
const net=require('node:net');
const {createLocalServer}=require('../../scripts/serve-local.cjs');
(async()=>{
  const hold=net.createServer();await new Promise((resolve,reject)=>{hold.once('error',reject);hold.listen(0,'127.0.0.1',resolve);});
  const port=hold.address().port;
  const server=await createLocalServer({port,config:{url:'http://127.0.0.1:54321',key:'sb_publishable_testonly'},catalogueSource:'canonical'});
  await new Promise(resolve=>hold.close(resolve));
  server.once('error',error=>{console.error('Test server failed: '+error.code);process.exit(1);});
  server.listen(port,'127.0.0.1',()=>console.log('Taktik Studyo: fixture ready on '+port));
})().catch(error=>{console.error('Test server failed: '+(error.code||error.message));process.exit(1);});
