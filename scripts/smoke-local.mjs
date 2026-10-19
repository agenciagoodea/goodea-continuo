import './check-node.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';

const dir=await mkdtemp(path.join(tmpdir(),'continuo-smoke-'));
let child,logs='';
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function start(){
  const port=await freePort();const url=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:{...process.env,CONTINUO_DATA_DIR:dir,GEMINI_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{logs=(logs+d).slice(-10000);});child.stderr.on('data',d=>{logs=(logs+d).slice(-10000);});
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Servidor encerrou: '+logs);try{const r=await fetch(url+'/api/studio');if(r.ok)return url;}catch{}await new Promise(resolve=>setTimeout(resolve,150));}
  throw new Error('Servidor não iniciou: '+logs);
}
async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await exit;clearTimeout(timer);}child=undefined;}
try{
  let url=await start();let response=await fetch(url+'/');assert.equal(response.status,200);assert.match(await response.text(),/Contínuo/);
  response=await fetch(url+'/api/studio');const initial=await response.json();assert.ok(initial.state.elements.length);assert.equal(initial.configured,false);
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'reference.png');response=await fetch(url+'/api/media',{method:'POST',body:form});assert.equal(response.status,200);const file=await response.json();
  const original=initial.state.elements.find(e=>e.kind==='character');
  response=await fetch(url+'/api/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'saveElement',revision:initial.state.revision,payload:{...original,rules:'Ficha de teste de persistência local.',files:[file],approved:true}})});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.state.elements.find(e=>e.id===original.id).version,2);
  response=await fetch(url+'/api/media/'+file.id,{headers:{range:'bytes=1-5'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 1-5/${bytes.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(1,6));
  response=await fetch(url+'/api/media/'+file.id,{headers:{range:'bytes=99999-'}});assert.equal(response.status,416);
  response=await fetch(url+'/api/studio',{headers:{origin:'https://attacker.invalid'}});assert.equal(response.status,401);
  await stop();
  const db=new DatabaseSync(path.join(dir,'continuo.sqlite'));
  try{
    const row=db.prepare('SELECT owner,data FROM studios').get(),legacy=JSON.parse(row.data);
    legacy.videoProvider='useapi';legacy.flowConnection={email:'old@example.com'};legacy.flowAssets=[{id:'remote-image'}];
    legacy.elements[0].flowVoice={ref:'old-voice'};
    Object.assign(legacy.projects[0].scenes[0],{operation:'useapi/job-old',status:'generating',generationProvider:'useapi',flowSubmission:{ref:'old-submission'}});
    db.prepare('UPDATE studios SET data=? WHERE owner=?').run(JSON.stringify(legacy),row.owner);
  }finally{db.close();}
  url=await start();response=await fetch(url+'/api/studio');const restored=await response.json();assert.equal(restored.state.elements.find(e=>e.id===original.id).approved,true);
  for(const field of ['videoProvider','flowConnection','flowAssets'])assert.ok(!(field in restored.state));
  assert.ok(!('flowVoice' in restored.state.elements[0]));assert.equal(restored.state.projects[0].scenes[0].operation,undefined);assert.equal(restored.state.projects[0].scenes[0].status,'draft');assert.equal(restored.state.projects[0].scenes[0].generationHistory[0].operation,'useapi/job-old');
  response=await fetch(url+'/api/studio');assert.equal((await response.json()).state.revision,restored.state.revision);
  response=await fetch(url+'/api/media/'+file.id);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  console.log('PASS: página, banco, upload, ficha, reprodução parcial, proteção de origem, persistência e limpeza de reservas antigas após reiniciar. Nenhuma chamada paga.');
}finally{await stop();await rm(dir,{recursive:true,force:true});}
