import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=s=>ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const core=url(compile(readFileSync(new URL('../lib/core.ts',import.meta.url),'utf8')));
const c=await import(core);
const f=await import(url(compile(readFileSync(new URL('../lib/useapi.ts',import.meta.url),'utf8').replace('"./core"',JSON.stringify(core)))));
const email='owner@example.com';
const connection={email,health:'OK',backend:'flow',supportsOmni:true,voices:[{ref:'Puck',name:'Puck',source:'system'}],verifiedAt:'2026-10-16'};
function setup(){const state=c.initialState();for(const e of state.elements){e.files=[{id:e.id,name:e.name+'.png',mime:'image/png',size:100}];e.approved=true;}return state;}
test('duas vozes iguais compartilham um slot, sem trocar o personagem das falas',()=>{
  const state=setup(),p=state.projects[0],s=p.scenes[0];for(const e of state.elements.filter(e=>s.characters.includes(e.id)))e.flowVoice={...connection.voices[0],email};
  const images=f.flowInputs(p,s,state.elements).map((i,n)=>({...i,ref:'ref-'+n}));const body=f.flowVideoRequest(p,s,state.elements,email,images,'submission');
  assert.equal(body.referenceAudio_1,'Puck');assert.ok(!body.referenceAudio_2);for(const id of s.characters)assert.ok(body.prompt.includes(`Voice for ${c.elementName(id,state.elements)}: @referenceAudio_1`));
});
test('frame inicial não pode se misturar com ingredientes na API Flow',()=>{
  const state=setup(),p=state.projects[0],s=p.scenes[1];p.scenes[0].lastFrame={id:'frame',mime:'image/png',name:'end.png',size:100};const images=f.flowInputs(p,s,state.elements).map(i=>({...i,ref:'last-frame'}));
  assert.equal(images.length,1);assert.throws(()=>f.flowVideoRequest(p,s,state.elements,email,[...images,{...images[0],firstFrame:false}],'submission'),/não pode ser combinado/);
});
test('corte usa biblioteca oficial e não usa o frame do cenário anterior como abertura',()=>{
  const state=setup(),p=state.projects[0],s=p.scenes[1];s.transition='cut';p.scenes[0].lastFrame={id:'frame',mime:'image/png',name:'end.png',size:100};const inputs=f.flowInputs(p,s,state.elements);assert.ok(inputs.length>1);assert.ok(!inputs.some(i=>i.firstFrame||i.file.id==='frame'));
});
test('mais de sete imagens oficiais é uma pendência antes da geração',()=>{
  const state=setup(),p=state.projects[0],s=p.scenes[0];const base=state.elements.find(e=>e.kind==='character');s.characters=Array.from({length:7},(_,i)=>'extra-'+i);for(const id of s.characters)state.elements.push({...base,id,name:id});assert.match(f.flowIssues(p,s,state.elements,connection).join(' '),/até 7 imagens/);
});
test('voz de outra conta e mais de cinco vozes não seguem para geração',()=>{
  const state=setup(),p=state.projects[0],s=p.scenes[0];const e=state.elements.find(e=>s.characters.includes(e.id));e.flowVoice={ref:'Puck',name:'Puck',source:'system',email:'other@example.com'};assert.match(f.flowIssues(p,s,state.elements,connection).join(' '),/outra conta/);
  const voices=Array.from({length:6},(_,i)=>({ref:'voice-'+i,name:'Voz '+i,source:'system'}));s.characters=voices.map((v,i)=>'voice-cast-'+i);for(let i=0;i<voices.length;i++)state.elements.push({...e,id:s.characters[i],name:s.characters[i],flowVoice:{...voices[i],email}});assert.match(f.flowIssues(p,s,state.elements,{...connection,voices}).join(' '),/até 5 referências de voz/);
});
test('nenhum domínio externo ou credencial na URL recebe download ou token',()=>{
  for(const u of ['http://flow-content.google/video','https://flow-content.google.attacker.test/video','https://user:pass@flow-content.google/video','https://127.0.0.1/video','https://flow-content.google:8443/video'])assert.throws(()=>f.flowDownloadUrl(u));assert.equal(f.flowDownloadUrl('https://flow-content.google/video/123?Signature=fake').hostname,'flow-content.google');
});
