import './check-node.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {once} from 'node:events';

const dir=await mkdtemp(path.join(tmpdir(),'continuo-smoke-'));
let child,logs='';
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function start(){
  const port=await freePort();const url=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:{...process.env,CONTINUO_DATA_DIR:dir,GEMINI_API_KEY:'',USEAPI_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{logs=(logs+d).slice(-10000);});child.stderr.on('data',d=>{logs=(logs+d).slice(-10000);});
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Servidor encerrou: '+logs);try{const r=await fetch(url+'/api/studio');if(r.ok)return url;}catch{}await new Promise(resolve=>setTimeout(resolve,150));}
  throw new Error('Servidor não iniciou: '+logs);
}
async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await exit;clearTimeout(timer);}child=undefined;}
try{
  let url=await start();let response=await fetch(url+'/');assert.equal(response.status,200);assert.match(await response.text(),/Contínuo/);
  response=await fetch(url+'/api/studio');const initial=await response.json();assert.ok(initial.state.elements.length);assert.equal(initial.configured,false);assert.equal(initial.useapiConfigured,false);
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'reference.png');response=await fetch(url+'/api/media',{method:'POST',body:form});assert.equal(response.status,200);const file=await response.json();
  const original=initial.state.elements.find(e=>e.kind==='character');
  response=await fetch(url+'/api/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'saveElement',revision:initial.state.revision,payload:{...original,rules:'Ficha de teste de persistência local.',files:[file],approved:true}})});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.state.elements.find(e=>e.id===original.id).version,2);
  response=await fetch(url+'/api/media/'+file.id,{headers:{range:'bytes=1-5'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 1-5/${bytes.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(1,6));
  response=await fetch(url+'/api/media/'+file.id,{headers:{range:'bytes=99999-'}});assert.equal(response.status,416);
  response=await fetch(url+'/api/studio',{headers:{origin:'https://attacker.invalid'}});assert.equal(response.status,401);
  await stop();url=await start();response=await fetch(url+'/api/studio');const restored=await response.json();assert.equal(restored.state.elements.find(e=>e.id===original.id).approved,true);
  response=await fetch(url+'/api/media/'+file.id);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  console.log('PASS: página, banco, upload, ficha, reprodução parcial, proteção de origem e persistência após reiniciar. Nenhuma chamada paga.');
}finally{await stop();await rm(dir,{recursive:true,force:true});}
