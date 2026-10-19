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
const useapiUrl=url(compile(readFileSync(new URL('../lib/useapi.ts',import.meta.url),'utf8').replace('"./core"',JSON.stringify(coreUrl))));
const omniUrl=url(compile(readFileSync(new URL('../lib/omni.ts',import.meta.url),'utf8').replace('"./core"',JSON.stringify(coreUrl))));
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const h={z,ApiError,data:null,calls:0,google:null,flowFetch:null};globalThis.__continuoTest=h;
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
let flowServer=readFileSync(new URL('../lib/useapi-server.ts',import.meta.url),'utf8');
flowServer=flowServer.replace('import {env} from "./runtime";','const env={};const fetch=(...args)=>globalThis.__continuoTest.flowFetch(...args);').replace('"./server"',JSON.stringify(serverUrl)).replace('"./core"',JSON.stringify(coreUrl)).replace('"./http"',JSON.stringify(httpUrl)).replace('"./useapi"',JSON.stringify(useapiUrl));
const flowServerUrl=url(compile(flowServer));
let route=readFileSync(new URL('../app/api/studio/route.ts',import.meta.url),'utf8');
route=route.replace('import { env } from "../../../lib/runtime";','const env={};').replace('import { z } from "zod";','const {z}=globalThis.__continuoTest;').replace('"../../../lib/server"',JSON.stringify(serverUrl)).replace('"../../../lib/core"',JSON.stringify(coreUrl)).replace('"../../../lib/omni"',JSON.stringify(omniUrl)).replace('"../../../lib/reference"',JSON.stringify(referenceUrl)).replace('"../../../lib/useapi-server"',JSON.stringify(flowServerUrl));
const api=await import(url(compile(route)));
function reset(){h.data=c.initialState();h.calls=0;h.flowFetch=null;for(const e of h.data.elements){e.approved=true;e.files=[{id:e.id+'image',name:'reference.png',mime:'image/png',size:1}];}return h.data.projects[0];}
async function action(type,payload={},sceneIndex=0,revision=h.data.revision){const p=h.data.projects[0];const response=await api.POST(new Request('https://test/api/studio',{method:'POST',headers:{'x-useapi-key':'fake-test-useapi-token'},body:JSON.stringify({type,payload,revision,projectId:p.id,sceneId:p.scenes[sceneIndex]?.id})}));return {status:response.status,data:await response.json()};}
const ref={id:'video',name:'clip.mp4',mime:'video/mp4',size:1},frame={id:'frame',name:'frame.png',mime:'image/png',size:1};
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

const flowEmail='studio@example.com';
const linkedAccount={health:'OK',backend:'flow',project:{projectId:'flow-project',projectTitle:'Episódio'},credits:{credits:1000},models:{videoModels:[{key:'omni_flash_t2v',displayName:'Omni 1.1 Flash',resolution:'720p'}]},accountCookies:[{name:'secret',value:'canary-private-cookie'}],sessionData:{access_token:'canary-private-access'}};
function withFlow(){const p=reset();h.data.videoProvider='useapi';h.data.flowConnection={email:flowEmail,health:'OK',backend:'flow',projectId:'flow-project',credits:1000,supportsOmni:true,voices:[{ref:'Puck',name:'Puck',source:'system'}],verifiedAt:new Date().toISOString()};return p;}
const json=Response.json;
function defaultFlowFetch(extra){let uploads=0;return async(value,options={})=>{const u=new URL(String(value));if(extra){const r=await extra(u,options);if(r)return r;}if(u.pathname.includes('/accounts/'))return json(linkedAccount);if(u.pathname.includes('/assets/')&&options.method==='POST')return json({email:flowEmail,mediaGenerationId:{mediaGenerationId:`user:1-email:abc-image:img${++uploads}`}});if(u.pathname.endsWith('/videos')&&options.method==='POST')return json({jobid:'j12345-video-flow',status:'created',type:'video'},{status:201});throw new Error('Unexpected mock request '+u.pathname);};}
function runningFlow(p){const s=p.scenes[0];s.operation='useapi/j12345-video-flow';s.status='generating';s.generationProvider='useapi';s.flowSubmission={ref:'submission-ref',email:flowEmail,at:new Date().toISOString(),stage:'submitted',jobId:'j12345-video-flow'};return s;}
function completedFlow(){return {jobid:'j12345-video-flow',type:'video',status:'completed',request:{email:flowEmail,model:'omni-flash',replyRef:'submission-ref'},response:{remainingCredits:985,media:[{mediaGenerationId:'user:1-email:abc-video:clip',video:{generatedVideo:{model:'omni_flash_r2v'}},mediaMetadata:{mediaStatus:{mediaGenerationStatus:'MEDIA_GENERATION_STATUS_SUCCESSFUL'}},videoUrl:'https://flow-content.google/video/clip?signature=fake'}]}};}
test('listagem e conexão Flow nunca devolvem cookies, access token ou API token',async()=>{
  reset();h.flowFetch=async(value)=>{const u=new URL(String(value));if(u.pathname.endsWith('/accounts'))return json({[flowEmail]:linkedAccount});if(u.pathname.includes('/accounts/'))return json(linkedAccount);if(u.pathname.endsWith('/voices'))return json({voices:[{voice:'Puck',displayName:'Puck',source:'system',sessionCookies:'canary-private-voice'}]});throw new Error('unexpected');};
  const listed=await action('flowAccounts');assert.equal(listed.status,200);assert.equal(listed.data.accounts[0].email,flowEmail);assert.doesNotMatch(JSON.stringify(listed.data),/canary-private|accountCookies|access_token|fake-test-useapi-token/);
  const connected=await action('connectFlow',{email:flowEmail});assert.equal(connected.status,200);assert.equal(connected.data.state.videoProvider,'useapi');assert.equal(connected.data.state.flowConnection.supportsOmni,true);assert.equal(connected.data.state.flowConnection.voices[0].ref,'Puck');assert.doesNotMatch(JSON.stringify(connected.data),/canary-private|accountCookies|access_token|fake-test-useapi-token/);
});
test('Flow reserva antes dos uploads e trava Omni Flash 10s 720p em modo ingredientes',async()=>{
  const p=withFlow();let body,paid=0;const revision=h.data.revision;
  h.flowFetch=defaultFlowFetch(async(u,o)=>{assert.ok(o.headers?.Authorization==='Bearer fake-test-useapi-token');if(o.method==='POST'){assert.equal(h.data.projects[0].scenes[0].operation,'useapi/submitting');}if(u.pathname.endsWith('/videos')){paid++;body=JSON.parse(o.body);const duplicate=await action('generate',{},0,revision);assert.equal(duplicate.status,409);}});
  const r=await action('generate',{model:'veo-3.1-fast',duration:8,resolution:'360p'});assert.equal(r.status,200);assert.equal(paid,1);assert.equal(body.model,'omni-flash');assert.equal(body.duration,10);assert.equal(body.resolution,'720p');assert.equal(body.count,1);assert.equal(body.async,true);assert.equal(body.email,flowEmail);assert.equal(body.aspectRatio,'landscape');assert.ok(body.referenceImage_1&&body.referenceImage_2&&body.referenceImage_3);assert.ok(!body.startImage);assert.match(body.prompt,/@referenceImage_1/);assert.equal(h.calls,0);assert.equal(r.data.state.projects[0].scenes[0].operation,'useapi/j12345-video-flow');
});
test('continuação Flow envia somente o frame final aprovado e respeita 9:16',async()=>{
  const p=withFlow();p.aspect='9:16';p.scenes[0].status='approved';p.scenes[0].lastFrame=frame;let body,uploads=0;
  h.flowFetch=defaultFlowFetch((u,o)=>{if(o.method==='POST'&&u.pathname.includes('/assets/'))uploads++;if(u.pathname.endsWith('/videos'))body=JSON.parse(o.body);});
  const r=await action('generate',{},1);assert.equal(r.status,200);assert.equal(uploads,1);assert.equal(body.aspectRatio,'portrait');assert.ok(body.startImage);assert.ok(!Object.keys(body).some(k=>/^(referenceImage|referenceAudio|character)_/.test(k)));assert.match(body.prompt,/exact last frame/);
});
test('upload parcial é reaproveitado ao repetir manualmente após falha, sem geração duplicada',async()=>{
  withFlow();let uploads=0,videos=0,first=true;
  h.flowFetch=defaultFlowFetch((u,o)=>{if(o.method==='POST'&&u.pathname.includes('/assets/')){uploads++;if(uploads===2&&first){first=false;return json({error:'USER_REQUESTS_THROTTLED'},{status:429});}}if(u.pathname.endsWith('/videos'))videos++;});
  const failed=await action('generate');assert.equal(failed.status,502);assert.equal(videos,0);assert.equal(h.data.flowAssets.length,1);assert.ok(!h.data.projects[0].scenes[0].operation);
  assert.equal((await action('generate')).status,200);assert.equal(uploads,4);assert.equal(videos,1);
});
test('timeout de envio Flow fica reservado e nunca repete o POST de geração',async()=>{
  withFlow();let paid=0;h.flowFetch=defaultFlowFetch((u,o)=>{if(u.pathname.endsWith('/videos')){paid++;throw new Error('network timeout');}});
  const r=await action('generate');assert.equal(r.status,502);assert.equal(h.data.projects[0].scenes[0].operation,'useapi/unknown');assert.equal(h.data.projects[0].scenes[0].flowSubmission.stage,'uncertain');assert.equal((await action('generate')).status,400);assert.equal(paid,1);
  const pending=await action('poll');assert.equal(pending.status,200);assert.equal(pending.data.pending,true);assert.equal(paid,1);
});
test('consulta Flow concluída importa vídeo sem enviar token à CDN e sem aprovar a cena',async()=>{
  const p=withFlow();runningFlow(p);let downloads=0;
  h.flowFetch=async(value,o={})=>{const u=new URL(String(value));assert.ok(o.method!=='POST');if(u.pathname.includes('/jobs/'))return json(completedFlow());if(u.hostname==='flow-content.google'){downloads++;assert.equal(o.headers,undefined);return new Response(new Uint8Array([0,1,2]),{headers:{'content-type':'video/mp4'}});}throw new Error('unexpected');};
  const r=await action('poll');assert.equal(r.status,200);const s=r.data.state.projects[0].scenes[0];assert.equal(s.status,'review');assert.equal(s.video.id,'generated');assert.equal(s.operation,undefined);assert.equal(s.lastFrame,undefined);assert.equal(downloads,1);assert.equal(r.data.state.flowConnection.credits,985);assert.equal(h.calls,0);
});
test('download sem URL usa a recuperação documentada do arquivo, sem nova geração',async()=>{
  const p=withFlow();runningFlow(p);let raw=0;
  h.flowFetch=async(value,o={})=>{const u=new URL(String(value));assert.ok(o.method!=='POST');if(u.pathname.includes('/jobs/')){const data=completedFlow();delete data.response.media[0].videoUrl;return json(data);}if(u.searchParams.get('raw')==='true'){raw++;assert.equal(o.headers.Authorization,'Bearer fake-test-useapi-token');return new Response(new Uint8Array([0,1]),{headers:{'content-type':'video/mp4'}});}if(u.pathname.includes('/assets/'))return json({error:'link not available'},{status:503});throw new Error('unexpected');};
  assert.equal((await action('poll')).status,200);assert.equal(raw,1);
});
test('job Flow com falha mostra a causa e não é reiniciado pela consulta',async()=>{
  const p=withFlow();runningFlow(p);let reads=0;
  h.flowFetch=async(value,o={})=>{reads++;assert.ok(o.method!=='POST');return json({jobid:'j12345-video-flow',type:'video',status:'failed',request:{email:flowEmail,model:'omni-flash'},error:'All operations failed',response:{failureReasons:['PUBLIC_ERROR_AUDIO_FILTERED']}});};
  const r=await action('poll');assert.equal(r.status,502);assert.match(r.data.error,/PUBLIC_ERROR_AUDIO_FILTERED/);assert.equal(r.data.state.projects[0].scenes[0].operation,undefined);assert.equal(r.data.state.projects[0].scenes[0].status,'draft');assert.equal(reads,1);
});
test('job de outro modelo e download fora dos domínios Google são bloqueados',async()=>{
  const p=withFlow();runningFlow(p);let cdn=false;
  h.flowFetch=async(value)=>{const u=new URL(String(value));if(!u.pathname.includes('/jobs/'))cdn=true;const data=completedFlow();data.request.model='veo-3.1-fast';return json(data);};
  assert.ok((await action('poll')).status>=400);assert.equal(cdn,false);assert.ok(h.data.projects[0].scenes[0].operation);
  h.flowFetch=async(value)=>{const u=new URL(String(value));if(!u.pathname.includes('/jobs/'))cdn=true;const data=completedFlow();data.response.media[0].videoUrl='https://127.0.0.1/private';return json(data);};
  assert.ok((await action('poll')).status>=400);assert.equal(cdn,false);
});
test('conta antiga ou sem Omni é bloqueada antes de consumir uma geração',async()=>{
  withFlow();let paid=0;h.flowFetch=defaultFlowFetch(u=>{if(u.pathname.endsWith('/videos'))paid++;if(u.pathname.includes('/accounts/'))return json({...linkedAccount,backend:'labs'});});
  assert.equal((await action('generate')).status,400);assert.equal(paid,0);
});
test('recuperação verifica a referência do envio e recusa jobs de outra cena',async()=>{
  const p=withFlow(),s=runningFlow(p);s.operation='useapi/unknown';s.flowSubmission.stage='uncertain';s.flowSubmission.at='2026-10-01T00:00:00Z';
  h.flowFetch=async()=>json({...completedFlow(),status:'started',request:{model:'omni-flash',email:flowEmail,replyRef:'other-submission'}});
  assert.equal((await action('recoverFlowJob',{jobId:'j12345-video-flow'})).status,400);assert.equal(h.data.projects[0].scenes[0].operation,'useapi/unknown');
  h.flowFetch=async()=>json({...completedFlow(),status:'started'});
  const r=await action('recoverFlowJob',{jobId:'j12345-video-flow'});assert.equal(r.status,200);assert.equal(r.data.pending,true);assert.equal(r.data.state.projects[0].scenes[0].operation,'useapi/j12345-video-flow');
});
test('remover seleção do Flow não apaga contas do provedor nem muda biblioteca',async()=>{
  withFlow();const before=structuredClone(h.data.elements);h.flowFetch=()=>{throw new Error('No provider call expected');};const r=await action('disconnectFlow');assert.equal(r.status,200);assert.equal(r.data.state.flowConnection,undefined);assert.equal(r.data.state.videoProvider,'gemini');assert.deepEqual(r.data.state.elements,before);
});
