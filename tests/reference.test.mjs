import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const moduleUrl=name=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022})).toString('base64');
const {tokenUsage,estimateReferenceCost,referenceProposal}=await import(moduleUrl('reference'));
const {readJsonResponse}=await import(moduleUrl('http'));
test('HTML com HTTP 200 preserva mensagem de recuperação sem erro de sintaxe',async()=>{
  await assert.rejects(readJsonResponse(new Response('<!DOCTYPE html><title>Login</title>',{headers:{'content-type':'text/html'}})),e=>/HTML/.test(e.message)&&!/Unexpected token/.test(e.message));
});
test('erros de sessão, gateway e limite de upload são distinguíveis',async()=>{
  for(const [status,pattern] of [[401,/Acesso local/],[413,/tamanho/],[502,/HTTP 502/],[429,/muitas solicitações/]])await assert.rejects(readJsonResponse(new Response('<html>no</html>',{status})),pattern);
});
test('JSON de erro é preservado para o chamador e resposta vazia é tratada',async()=>{
  assert.deepEqual(await readJsonResponse(Response.json({error:'Chave inválida'},{status:400})),{error:'Chave inválida'});
  await assert.rejects(readJsonResponse(new Response('')),/resposta inválida/);
});
test('custo conta pensamento e cache uma só vez, usando metadados reais',()=>{
  const usage=tokenUsage({usageMetadata:{promptTokenCount:3000,candidatesTokenCount:1500,thoughtsTokenCount:500,cachedContentTokenCount:1000,totalTokenCount:5000}});
  assert.deepEqual(usage,{input:3000,output:1500,thinking:500,cached:1000,total:5000});
  assert.ok(Math.abs(estimateReferenceCost(usage,'2026-10-16').usd-.009075)<1e-10);
  assert.ok(Math.abs(estimateReferenceCost({...usage,cached:0},'2026-10-16').usd-.00975)<1e-10);
  assert.ok(Math.abs(estimateReferenceCost(usage,'2027-01-01').usd-.01815)<1e-10);
});
test('não inventa tokens nem custo quando faltam metadados',()=>{
  assert.equal(tokenUsage({}),undefined);
  assert.equal(estimateReferenceCost(undefined,'2026-10-16'),undefined);
  assert.equal(estimateReferenceCost({input:3000},'2026-10-16'),undefined);
  assert.equal(estimateReferenceCost({input:3000,output:1500},'2026-10-16'),undefined);
  assert.equal(estimateReferenceCost({input:3000,total:5000},'2026-10-16','outro-modelo'),undefined);
  assert.equal(tokenUsage({usageMetadata:{promptTokenCount:-1,totalTokenCount:'5000'}}),undefined);
});
test('recuperar leitura preserva regras e voz sem duplicar texto nem aprovar',()=>{
  const reading={id:'r',at:'2026-10-16',fileIds:['img'],model:'gemini-3.8-flash',result:{nameFromReference:'Lia',rules:'Não alterar laço',palette:'Rosa',voiceFromReference:'',visualDetails:{hair:'Castanho'},uncertainties:[]}};
  const p=referenceProposal({name:'Lia',rules:'Regra própria\n\nNão alterar laço',voice:'Voz oficial'},reading);
  assert.equal(p.rules,'Regra própria\n\nNão alterar laço');assert.equal(p.voice,'Voz oficial');assert.equal(p.approved,false);assert.equal(p.analysis.readingId,'r');
});
