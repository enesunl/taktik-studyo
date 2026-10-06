// Static HTTP regression fixture only. Never imported or served by the app.
// Real command-line startup always obtains config + health from Supabase CLI.
const {createLocalServer}=require('../../scripts/serve-local.cjs');
const port=Number(process.argv[2]);
createLocalServer({port,config:{url:'http://127.0.0.1:54321',key:'sb_publishable_testonly'},catalogueSource:'canonical'})
 .then(server=>server.listen(port,'127.0.0.1',()=>console.log('Taktik Studyo: fixture ready')))
 .catch(()=>{console.error('Test server failed');process.exitCode=1;});
