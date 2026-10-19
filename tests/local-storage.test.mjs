import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';
const compile=async name=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022})).toString('base64');
const root=await mkdtemp(path.join(tmpdir(),'continuo-local-'));process.env.CONTINUO_DATA_DIR=root;
const {localDatabase:db,localBucket:bucket,closeLocalDatabases}=await import(await compile('local-storage'));
const {localRequestAllowed}=await import(await compile('local-access'));
after(async()=>{closeLocalDatabases();await rm(root,{recursive:true,force:true});});
test('dados SQLite persistem entre conexões e atualização obsoleta não sobrescreve dados',async()=>{
  await db.prepare('INSERT INTO studios(owner,revision,data,updated_at) VALUES (?,0,?,?)').bind('local-owner','{"name":"Episódio"}','today').run();
  assert.equal((await db.prepare('UPDATE studios SET data=?,revision=1 WHERE owner=? AND revision=0').bind('{"name":"Salvo"}','local-owner').run()).meta.changes,1);
  assert.equal((await db.prepare('UPDATE studios SET data=? WHERE owner=? AND revision=0').bind('{"name":"Antigo"}','local-owner').run()).meta.changes,0);
  closeLocalDatabases();const row=await db.prepare('SELECT data,revision FROM studios WHERE owner=?').bind('local-owner').first();assert.equal(row.revision,1);assert.equal(JSON.parse(row.data).name,'Salvo');
  assert.equal(await db.prepare('SELECT data FROM studios WHERE owner=?').bind('another-owner').first(),null);
});
test('arquivos locais persistem e podem ser lidos sem carregar um vídeo inteiro na memória',async()=>{
  const bytes=Uint8Array.from([0,1,2,3,4,5,6,7,8,9]);await bucket.put('local-owner/file-id',bytes);
  const object=await bucket.get('local-owner/file-id');assert.equal(object.size,10);assert.deepEqual(new Uint8Array(await object.arrayBuffer()),bytes);
  const ranged=await bucket.get('local-owner/file-id',{range:new Headers({range:'bytes=2-5'})});assert.deepEqual(ranged.range,{offset:2,length:4});assert.deepEqual(new Uint8Array(await new Response(ranged.body).arrayBuffer()),Uint8Array.from([2,3,4,5]));
});
test('reprodução suporta sufixo e intervalo aberto; intervalos inválidos são recusados',async()=>{
  const suffix=await bucket.get('local-owner/file-id',{range:new Headers({range:'bytes=-3'})});assert.deepEqual(suffix.range,{offset:7,length:3});
  const open=await bucket.get('local-owner/file-id',{range:new Headers({range:'bytes=7-'})});assert.deepEqual(open.range,{offset:7,length:3});
  for(const range of ['bytes=20-30','bytes=8-2','bytes=-0','bytes=1-2,4-5','invalid'])await assert.rejects(bucket.get('local-owner/file-id',{range:new Headers({range})}),/Intervalo/);
});
test('armazenamento bloqueia travessia de diretórios e trata arquivo removido',async()=>{
  for(const key of ['../secret','local-owner/../secret','/etc/passwd','local-owner/file/extra'])await assert.rejects(bucket.get(key),/Identificador/);
  await bucket.delete('local-owner/file-id');assert.equal(await bucket.get('local-owner/file-id'),null);
});
test('acesso local aceita os endereços de loopback e bloqueia origem externa ou hostname remoto',()=>{
  for(const host of ['localhost:3000','127.0.0.1:3000','[::1]:3000'])assert.equal(localRequestAllowed(new Headers({host})),true);
  assert.equal(localRequestAllowed(new Headers({host:'localhost:3000',origin:'http://localhost:3000'})),true);
  for(const headers of [{host:'example.com'},{host:'localhost.attacker.test'},{host:'localhost:3000',origin:'https://attacker.test'},{host:'localhost:3000',origin:'http://localhost:9000'},{host:'localhost:3000','sec-fetch-site':'cross-site'},{}])assert.equal(localRequestAllowed(new Headers(headers)),false);
});
