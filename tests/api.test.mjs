import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const compile=s=>ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const coreUrl=url(compile(readFileSync(new URL('../lib/core.ts',import.meta.url),'utf8')));
const c=await import(coreUrl);
const referenceUrl=url(compile(readFileSync(new URL('../lib/reference.ts',import.meta.url),'utf8')));
const httpUrl=url(compile(readFileSync(new URL('../lib/http.ts',import.meta.url),'utf8')));
const omniUrl=url(compile(readFileSync(new URL('../lib/omni.ts',import.meta.url),'utf8').replace('"./core"',JSON.stringify(coreUrl))));
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const h={z,ApiError,data:null,calls:0,google:null};globalThis.__continuoTest=h;
const serverUrl=url(`const h=globalThis.__continuoTest;
export const ApiError=h.ApiError;
export async function owner(){return 'owner';}
export async function loadState(){return structuredClone(h.data);}
export async function commit(id,state,revision){if(h.data.revision!==revision)throw new ApiError('Conflito',409);state.revision=revision+1;h.data=structuredClone(state);return state;}
export function log(s,text){s.events.push({at:new Date().toISOString(),text});}
export async function verifyFile(id,ref,kind){if(kind&&!ref.mime.startsWith(kind))throw new ApiError('Tipo incompatível');return ref;}
export function errorResponse(e){return Response.json({error:e.message},{status:e.status||400});}
export function apiKey(){return 'test-only-not-a-real-key';}
export async function google(key,path,payload){h.calls++;return h.google(path,payload);}
export function aiText(data){return data.text;}
export async function inlineFile(id,f){return {data:'AA==',mimeType:f.mime};}
export async function fileBytes(id,ref){return {bytes:new Uint8Array([1,2]).buffer,mime:ref.mime};}
export async function putFile(){return {id:'generated',name:'video.mp4',mime:'video/mp4',size:100};}
export async function downloadGoogleVideo(){return new ArrayBuffer(1);}
`);
let route=readFileSync(new URL('../app/api/studio/route.ts',import.meta.url),'utf8');
route=route.replace('import { env } from "../../../lib/runtime";','const env={};').replace('import { z } from "zod";','const {z}=globalThis.__continuoTest;').replace('"../../../lib/server"',JSON.stringify(serverUrl)).replace('"../../../lib/core"',JSON.stringify(coreUrl)).replace('"../../../lib/omni"',JSON.stringify(omniUrl)).replace('"../../../lib/reference"',JSON.stringify(referenceUrl));
const api=await import(url(compile(route)));
function reset(){h.data=c.initialState();h.calls=0;for(const e of h.data.elements){e.approved=true;e.files=[{id:e.id+'image',name:'reference.png',mime:'image/png',size:1}];}return h.data.projects[0];}
async function action(type,payload={},sceneIndex=0,revision=h.data.revision){const p=h.data.projects[0];const response=await api.POST(new Request('https://test/api/studio',{method:'POST',body:JSON.stringify({type,payload,revision,projectId:p.id,sceneId:p.scenes[sceneIndex]?.id})}));return {status:response.status,data:await response.json()};}
const ref={id:'video',name:'clip.mp4',mime:'video/mp4',size:1},frame={id:'frame',name:'frame.png',mime:'image/png',size:1};
test('ações do conector retirado são recusadas sem alterar o estúdio nem chamar o Google',async()=>{
  reset();const before=structuredClone(h.data);
  for(const type of ['flowAccounts','connectFlow','disconnectFlow','setVideoProvider','recoverFlowJob','releaseFlowSubmission']){
    const r=await action(type,{email:'old@example.com',provider:'useapi',jobId:'j-old'});assert.equal(r.status,400);assert.match(r.data.error,/Operação desconhecida/);
  }
  assert.deepEqual(h.data,before);assert.equal(h.calls,0);
});
test('API bloqueia geração da segunda cena sem predecessor aprovado',async()=>{reset();const r=await action('generate',{},1);assert.equal(r.status,400);assert.equal(h.calls,0);});
test('API não permite aprovar com checklist incompleto',async()=>{const p=reset();Object.assign(p.scenes[0],{video:ref,firstFrame:frame,lastFrame:frame,status:'review',actualDuration:10,width:1280,height:720});const r=await action('review',{checked:c.checks.map(()=>false),notes:'',approve:true});assert.equal(r.status,400);assert.notEqual(h.data.projects[0].scenes[0].status,'approved');});
test('API aprova e desbloqueia continuação; alterar a direção revoga aprovação',async()=>{const p=reset();Object.assign(p.scenes[0],{video:ref,firstFrame:frame,lastFrame:frame,status:'review',actualDuration:10,width:1280,height:720});let r=await action('review',{checked:c.checks.map(()=>true),notes:'Conferido',approve:true});assert.equal(r.status,200);assert.equal(h.data.projects[0].scenes[0].status,'approved');assert.deepEqual(c.preflight(h.data.projects[0],h.data.projects[0].scenes[1],h.data.elements),[]);const s=h.data.projects[0].scenes[0];r=await action('saveScene',{...s,action:'Outra ação'});assert.equal(r.status,200);assert.equal(h.data.projects[0].scenes[0].status,'stale');});
test('API rejeita clipe com proporção errada e divergência da auditoria',async()=>{const p=reset();const s=p.scenes[0];Object.assign(s,{video:ref,firstFrame:frame,lastFrame:frame,status:'review',actualDuration:10,width:720,height:1280});let r=await action('review',{checked:c.checks.map(()=>true),notes:'',approve:true});assert.equal(r.status,400);s.width=1280;s.height=720;s.audit={verdict:'reject',findings:['Duplicado'],createdAt:'agora'};r=await action('review',{checked:c.checks.map(()=>true),notes:'',approve:true});assert.equal(r.status,400);});
test('reserva de geração precede a chamada paga e impede envio concorrente',async()=>{reset();h.google=async(path,payload)=>{assert.equal(h.data.projects[0].scenes[0].operation,'submitting');assert.equal(path,'interactions');assert.equal(payload.model,'gemini-omni-1.1-flash');assert.deepEqual(payload.response_format,{type:'video',aspect_ratio:'16:9',resolution:'720p',duration:'10s',delivery:'uri'});return {id:'v1_test_operation',status:'in_progress',model:'gemini-omni-1.1-flash'};};const oldRevision=h.data.revision;const first=await action('generate');assert.equal(first.status,200);assert.equal(h.data.projects[0].scenes[0].status,'generating');assert.equal(h.calls,1);const duplicate=await action('generate',{},0,oldRevision);assert.equal(duplicate.status,409);assert.equal(h.calls,1);const mutation=await action('saveScene',h.data.projects[0].scenes[0]);assert.equal(mutation.status,400);});
test('API bloqueia importação de clipe fora da ordem de continuidade',async()=>{reset();const r=await action('attachVideo',{video:ref,firstFrame:frame,lastFrame:frame,duration:10,width:1280,height:720},1);assert.equal(r.status,400);});
test('nova versão da ficha invalida as cenas dependentes',async()=>{const p=reset();for(const s of p.scenes){s.status='approved';s.video=ref;}const e=h.data.elements.find(e=>e.name==='Emanuel');const r=await action('saveElement',{...e,rules:e.rules+' Preservar acessórios.'});assert.equal(r.status,200);assert.ok(h.data.projects[0].scenes.every(s=>s.status==='stale'));assert.equal(h.data.elements.find(x=>x.id===e.id).version,2);});

test('análise preenche rascunho sem salvar nem inventar voz com uma imagem',async()=>{reset();const revision=h.data.revision;h.google=async()=>({text:JSON.stringify({nameFromReference:'Outro nome',rules:'Preservar rosto e jaqueta amarela.',palette:'Amarelo e verde',voiceFromReference:'Voz grave inventada',voiceEvidence:'audio',visualDetails:{hair:'Cabelo castanho',clothing:'Jaqueta amarela e camisa verde'},uncertainties:['Calçado não visível']})});const r=await action('analyzeElement',{kind:'character',name:'Bento',rules:'Não mudar a roupa oficial.',palette:'',voice:'',files:[{id:'image',name:'bento.png',mime:'image/png',size:500}]});assert.equal(r.status,200);assert.equal(r.data.proposal.name,'Bento');assert.equal(r.data.proposal.voice,'');assert.equal(r.data.proposal.approved,false);assert.match(r.data.proposal.rules,/Não mudar a roupa oficial/);assert.equal(r.data.proposal.visualDetails.clothing,'Jaqueta amarela e camisa verde');assert.equal(h.data.revision,revision+2);assert.equal(h.data.referenceReadings[0].status,'complete');assert.equal(h.data.elements.find(e=>e.name==='Bento').version,1);});
test('análise exige imagem e não aceita só áudio',async()=>{reset();const r=await action('analyzeElement',{kind:'character',files:[{id:'audio',name:'voz.wav',mime:'audio/wav',size:100}]});assert.equal(r.status,400);assert.equal(h.calls,0);});
test('detalhes visuais ficam salvos na ficha e entram no prompt canônico',async()=>{reset();const e=h.data.elements.find(e=>e.name==='Bento');const r=await action('saveElement',{...e,visualDetails:{clothing:'Jaqueta amarela'},analysis:{at:'2026-10-16',fileIds:[e.files[0].id],uncertainties:[]}});assert.equal(r.status,200);const saved=h.data.elements.find(x=>x.id===e.id);assert.equal(saved.visualDetails.clothing,'Jaqueta amarela');assert.match(c.promptFor(h.data.projects[0],h.data.projects[0].scenes[0],h.data.elements),/Jaqueta amarela/);});
test('atalho do Flow aceita somente domínio Google próprio de Flow',async()=>{reset();let r=await action('setFlowProject',{url:'https://labs.google.evil.test/fx/tools/flow/project/123'});assert.equal(r.status,400);r=await action('setFlowProject',{url:'https://labs.google/fx/tools/flow/project/example'});assert.equal(r.status,200);assert.match(h.data.projects[0].flowProjectUrl,/labs.google/);});
test('API envia 9:16, 10s e 720p sem aceitar modelo alternativo do cliente',async()=>{const p=reset();p.aspect='9:16';h.google=async(path,body)=>{assert.equal(path,'interactions');assert.equal(body.model,c.VIDEO_MODEL);assert.equal(body.response_format.aspect_ratio,'9:16');assert.equal(body.response_format.duration,'10s');assert.equal(body.response_format.resolution,'720p');assert.ok(body.input.filter(x=>x.type==='image').length===3);return {id:'v1_vertical',model:c.VIDEO_MODEL,status:'in_progress'};};const r=await action('generate',{model:'other-model',resolution:'4k',duration:8});assert.equal(r.status,200);assert.equal(h.calls,1);});
test('continuação envia último frame aprovado e referências oficiais juntas',async()=>{const p=reset();p.scenes[0].status='approved';p.scenes[0].lastFrame=frame;h.google=async(path,body)=>{assert.equal(body.input.filter(x=>x.type==='image').length,4);assert.match(body.input.at(-1).text,/<FIRST_FRAME>@Image1/);assert.match(body.input.at(-1).text,/PRIMARY FIRST IMAGE/);return {id:'v1_continuation',status:'in_progress',model:c.VIDEO_MODEL};};const r=await action('generate',{},1);assert.equal(r.status,200);});
test('consulta processa somente o vídeo de model_output e conserva revisão humana',async()=>{const p=reset();p.scenes[0].operation='interactions/v1_poll';p.scenes[0].status='generating';h.google=async()=>({model:c.VIDEO_MODEL,status:'completed',steps:[{type:'user_input',content:[{type:'video',data:'bad'}]},{type:'model_output',content:[{type:'video',mime_type:'video/mp4',data:'AA=='}]}]});const r=await action('poll');assert.equal(r.status,200);const s=h.data.projects[0].scenes[0];assert.equal(s.status,'review');assert.equal(s.video.id,'generated');assert.equal(s.generationModel,c.VIDEO_MODEL);assert.ok(!s.lastFrame);});
test('API bloqueia aprovar resolução 360p mesmo com proporção correta',async()=>{const p=reset();Object.assign(p.scenes[0],{video:ref,firstFrame:frame,lastFrame:frame,status:'review',actualDuration:10,width:640,height:360});const r=await action('review',{checked:c.checks.map(()=>true),notes:'',approve:true});assert.equal(r.status,400);assert.match(r.data.error,/720p/);});
test('editar uma cena para oito segundos é recusado',async()=>{const p=reset();const r=await action('saveScene',{...p.scenes[0],duration:8});assert.equal(r.status,400);assert.equal(h.data.projects[0].scenes[0].duration,10);});

const sheet={kind:'character',name:'Lia',rules:'Regra manual',palette:'',voice:'',files:[{id:'lia-image',name:'lia.png',mime:'image/png',size:500}]};
const referenceResult={nameFromReference:'Lia',rules:'Manter laço rosa.',palette:'Rosa',voiceFromReference:'',voiceEvidence:'none',visualDetails:{hair:'Castanho'},uncertainties:[]};
test('contagem prévia usa os mesmos arquivos e não gera nem registra análise paga',async()=>{
  reset();const revision=h.data.revision;let counted;
  h.google=async(path,body)=>{assert.equal(path,'models/gemini-3.8-flash:countTokens');counted=body.contents;return {totalTokens:3141};};
  const r=await action('countElementTokens',sheet);assert.equal(r.status,200);assert.equal(r.data.inputTokens,3141);assert.equal(h.data.revision,revision);assert.equal(h.data.referenceReadings,undefined);
  h.google=async(path,body)=>{assert.deepEqual(body.contents,counted);return {text:JSON.stringify(referenceResult)};};
  assert.equal((await action('analyzeElement',sheet)).status,200);
});
test('análise guarda consumo e recuperar ou salvar não chama o Google novamente',async()=>{
  reset();h.google=async()=>({text:JSON.stringify(referenceResult),usageMetadata:{promptTokenCount:3000,candidatesTokenCount:1500,thoughtsTokenCount:500,totalTokenCount:5000}});
  const first=await action('analyzeElement',sheet);assert.equal(first.status,200);assert.equal(first.data.proposal.analysis.usage.total,5000);assert.ok(Math.abs(first.data.proposal.analysis.estimate.usd-.00975)<1e-10);assert.equal(h.calls,1);
  const recovered=await action('analyzeElement',{...sheet,rules:'Regra manual\n\nManter laço rosa.'});assert.equal(recovered.status,200);assert.equal(recovered.data.reused,true);assert.equal(recovered.data.proposal.rules,'Regra manual\n\nManter laço rosa.');assert.equal(h.calls,1);
  const e=h.data.elements.find(e=>e.name==='Lia');const saved=await action('saveElement',{...e,...recovered.data.proposal,files:sheet.files});assert.equal(saved.status,200);assert.equal(h.calls,1);assert.equal(h.data.elements.find(x=>x.id===e.id).version,2);assert.equal(h.data.elements.find(x=>x.id===e.id).analysis.usage.total,5000);
});
test('resposta de ficha inválida ainda registra tokens e impede repetição silenciosa',async()=>{
  reset();h.google=async()=>({text:'não é JSON',usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,totalTokenCount:1200,thoughtsTokenCount:100}});
  const r=await action('analyzeElement',sheet);assert.equal(r.status,502);assert.match(r.data.error,/consumo/);assert.equal(h.data.referenceReadings[0].usage.total,1200);assert.equal(h.data.referenceReadings[0].status,'failed');
  assert.equal((await action('analyzeElement',sheet)).status,409);assert.equal(h.calls,1);
  assert.equal((await action('analyzeElement',{...sheet,force:true})).status,502);assert.equal(h.calls,2);
});
test('reserva da ficha bloqueia outra aba antes da resposta paga',async()=>{
  reset();const original=h.data.revision;
  h.google=async()=>{assert.equal(h.data.referenceReadings[0].status,'running');const duplicate=await action('analyzeElement',sheet,0,original);assert.equal(duplicate.status,409);return {text:JSON.stringify(referenceResult)};};
  assert.equal((await action('analyzeElement',sheet)).status,200);assert.equal(h.calls,1);
});
test('nova referência envia uma nova leitura e preserva resultados anteriores',async()=>{
  reset();h.google=async()=>({text:JSON.stringify(referenceResult)});
  await action('analyzeElement',sheet);await action('analyzeElement',{...sheet,files:[{...sheet.files[0],id:'nova-image'}]});assert.equal(h.calls,2);assert.equal(h.data.referenceReadings.length,2);
});

test('resultado de leitura não sobrescreve alterações feitas por outra aba',async()=>{
  reset();h.google=async()=>{h.data.projects[0].name='Episódio renomeado em outra aba';h.data.revision++;return {text:JSON.stringify(referenceResult)};};
  const r=await action('analyzeElement',sheet);assert.equal(r.status,200);assert.equal(r.data.state.projects[0].name,'Episódio renomeado em outra aba');assert.equal(h.data.referenceReadings[0].status,'complete');
});
