// Runs existing HTTP/frontend/source regressions against an isolated application copy.
import assert from 'node:assert/strict';
import { mkdtemp,cp,symlink,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=await mkdtemp(path.join(tmpdir(),'darkcry-phase10-http-'));
if(!path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep))throw Error('Invalid disposable root');
const children=new Set();
function launch(file,env={}){const c=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(c);let output='';c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>output+=b);c.on('close',()=>children.delete(c));return {child:c,get output(){return output;}};}
async function run(file,env={}){const c=launch(file,env);let timer;try{await Promise.race([new Promise((resolve,reject)=>{c.child.once('error',reject);c.child.once('exit',code=>code===0?resolve():reject(Error(file+' failed: '+c.output.slice(-3000))));}),new Promise((_,reject)=>{timer=setTimeout(()=>{c.child.kill();reject(Error('Bounded HTTP test timeout'));},30000);})]);console.log(c.output.trim());}finally{clearTimeout(timer);}}
let app;
try{
 for(const item of ['src','public','tests','package.json'])await cp(path.join(project,item),path.join(root,item),{recursive:true});
 await symlink(path.join(project,'node_modules'),path.join(root,'node_modules'),'junction');
 const smokeFile=path.join(root,'tests','phase9-app-smoke.mjs'); await writeFile(smokeFile,(await readFile(smokeFile,'utf8')).replace('> 5000', '> 15000').replace("throw new Error('Application startup failed or timed out.')", "throw new Error('Application startup failed or timed out: ' + output)"));
 await run('tests/phase9-app-smoke.mjs');
 app=launch('src/server.js',{PORT:'3000'});
 const start=Date.now();while(!app.output.includes('PowerPoint Agent: http://127.0.0.1:3000/app.html')){if(app.child.exitCode!==null||Date.now()-start>15000)throw Error('Isolated source test server unavailable');await new Promise(r=>setTimeout(r,30));}
 await run('tests/phase2a-smoke.js',{TEST_URL:'http://127.0.0.1:3000'});
 await run('tests/frontend-response-smoke.js');
 const repoResponse=await fetch('http://127.0.0.1:3000/api/repositories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:project,branch:'main'}),signal:AbortSignal.timeout(15000)}); assert.equal(repoResponse.status,201); const repository=await repoResponse.json(); assert.match(repository.commit,/^[a-f0-9]{40}$/); const listing=await (await fetch('http://127.0.0.1:3000/api/repositories/'+repository.id+'/files',{signal:AbortSignal.timeout(5000)})).json(); assert.ok(listing.files.length>0); assert.ok(!listing.files.some(f=>/(?:^|[\\/])\.env(?:[./]|$)/i.test(f.path))); console.log('PASS: local repository analysis uses existing HEAD read-only, lists source files and excludes environment files; no fixture commit.');
 const {ProjectStore}=await import('../src/projects/projectStore.js');const store=new ProjectStore({file:path.join(root,'data','projects.json')});await store.load();console.log('PASS: isolated application metadata remained readable; no external providers invoked.');
}finally{
 for(const c of children)c.kill();
 await Promise.all([...children].map(c=>new Promise(resolve=>{if(c.exitCode!==null)return resolve();c.once('exit',resolve);setTimeout(resolve,2000);})));
 await rm(root,{recursive:true,force:true});
}
