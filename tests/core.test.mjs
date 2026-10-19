import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=ts.transpile(readFileSync(new URL('../lib/core.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const c=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
function ready(){const state=c.initialState();for(const e of state.elements){e.approved=true;e.files=[{id:e.id+'-image',name:'oficial.png',mime:'image/png',size:100}];}return {state,p:state.projects[0]};}
test('cadastros iniciais não inventam imagem ou aprovação',()=>{const s=c.initialState();assert.equal(s.elements.length,7);assert.ok(s.elements.every(e=>!e.approved&&!e.files.length));assert.equal(s.projects[0].scenes.length,3);});
test('decupagem distingue ator e narração e associa os IDs oficiais',()=>{const {state,p}=ready();assert.equal(p.scenes[0].lines[0].speaker,'Emanuel');assert.equal(p.scenes[0].lines[0].type,'dialogue');assert.equal(p.scenes[2].lines[0].type,'narration');assert.equal(c.elementName(p.scenes[0].environment,state.elements),'Casa da Luz');assert.equal(p.scenes[0].duration,10);assert.equal(c.preflight(p,p.scenes[0],state.elements).length,0);});
test('não libera personagem sem imagem aprovada',()=>{const {state,p}=ready();state.elements[0].approved=false;assert.match(c.preflight(p,p.scenes[0],state.elements).join(' '),/Emanuel/);});
test('cena seguinte exige predecessor aprovado e frame final',()=>{const {state,p}=ready();let errors=c.preflight(p,p.scenes[1],state.elements).join(' ');assert.match(errors,/Aprove a cena anterior/);assert.match(errors,/último frame/);p.scenes[0].status='approved';p.scenes[0].lastFrame={id:'end',name:'end.png',mime:'image/png',size:1};assert.deepEqual(c.preflight(p,p.scenes[1],state.elements),[]);});
test('elenco duplicado e fala de personagem fora do elenco são bloqueados',()=>{const {state,p}=ready();p.scenes[0].characters.push(p.scenes[0].characters[0]);assert.match(c.preflight(p,p.scenes[0],state.elements).join(' '),/duplicado/);p.scenes[0].lines.push({speaker:'Lia',text:'Olá!',type:'dialogue'});assert.match(c.preflight(p,p.scenes[0],state.elements).join(' '),/não está no elenco/);});
test('somente dez segundos é permitido e fala longa é sinalizada',()=>{const {state,p}=ready();p.scenes[0].duration=8;assert.match(c.preflight(p,p.scenes[0],state.elements).join(' '),/10 segundos/);p.scenes[0].duration=10;p.scenes[0].lines[0].text=Array(40).fill('palavra').join(' ');assert.match(c.preflight(p,p.scenes[0],state.elements).join(' '),/não caber/);});
test('alteração invalida apenas a partir da cena dependente e preserva tomadas',()=>{const {p}=ready();for(const s of p.scenes){s.status='approved';s.checked=c.checks.map(()=>true);s.video={id:s.id,name:'clip.mp4',mime:'video/mp4',size:1};s.approvedAt='agora';}c.invalidate(p,1);assert.equal(p.scenes[0].status,'approved');assert.equal(p.scenes[1].status,'stale');assert.equal(p.scenes[2].status,'stale');assert.ok(p.scenes[1].video);assert.ok(!p.scenes[1].approvedAt);assert.ok(p.scenes[1].checked.every(x=>!x));});
test('corte não exige que o cenário seja o mesmo; continuação exige',()=>{const {state,p}=ready();p.scenes[0].status='approved';p.scenes[0].lastFrame={id:'end'};const env={...state.elements.at(-1),id:'new-env',name:'Jardim'};state.elements.push(env);p.scenes[1].environment=env.id;assert.match(c.preflight(p,p.scenes[1],state.elements).join(' '),/ambiente mudou/);p.scenes[1].transition='cut';assert.deepEqual(c.preflight(p,p.scenes[1],state.elements),[]);});
test('prompt usa último frame anterior como entrada inicial e não como final alvo',()=>{const {state,p}=ready();const text=c.promptFor(p,p.scenes[1],state.elements);assert.match(text,/PRIMARY FIRST IMAGE/);assert.match(text,/not a desired ending/);assert.match(text,/Each listed character exists only once/);assert.match(text,/continuous master soundtrack/);assert.match(text,/OFFICIAL CHARACTER Emanuel/);});
test('referência desconhecida vira pendência e não identidade inventada',()=>{const {state}=ready();const scenes=c.parseScript('CENA 1 | Jardim | 8s\nAMBIENTE: Jardim novo\nPERSONAGENS: Novo\nAÇÃO: Observa.\nNOVO: Olá!',state.elements);assert.equal(scenes[0].environment,'pending:Jardim novo');assert.equal(scenes[0].characters[0],'pending:Novo');});

test('migração para Omni mantém biblioteca e vídeos e invalida tomadas antigas',()=>{const state=c.initialState();delete state.videoProfile;const p=state.projects[0];p.scenes[0].duration=8;p.scenes[0].status='approved';p.scenes[0].video={id:'old',name:'old.mp4',mime:'video/mp4',size:1};const elements=JSON.stringify(state.elements);assert.equal(c.migrateVideoProfile(state),true);assert.ok(p.scenes.every(s=>s.duration===10));assert.equal(p.scenes[0].status,'stale');assert.equal(p.scenes[0].video.id,'old');assert.equal(JSON.stringify(state.elements),elements);assert.equal(c.migrateVideoProfile(state),false);});
test('migração preserva o identificador de uma operação anterior sem consultar o modelo antigo',()=>{const state=c.initialState();delete state.videoProfile;const s=state.projects[0].scenes[0];s.operation='old-provider-operation';s.status='generating';assert.equal(c.migrateVideoProfile(state),true);assert.equal(s.operation,undefined);assert.equal(s.generationHistory[0].operation,'old-provider-operation');assert.equal(s.duration,10);assert.equal(s.status,'draft');assert.ok(state.events.some(e=>e.text.includes('não foi cancelada no provedor')));});

test('retirada do conector limpa os vínculos e preserva a biblioteca e uma tomada aprovada',()=>{
  const {state,p}=ready();state.videoProvider='useapi';state.flowConnection={email:'old@example.com'};state.flowAssets=[{id:'remote-image'}];
  const element=state.elements[0];element.voice='Voz oficial';element.voiceId='preset-oficial';element.flowVoice={ref:'remote-voice'};
  const scene=p.scenes[0];Object.assign(scene,{status:'approved',video:{id:'saved-video'},firstFrame:{id:'first'},lastFrame:{id:'last'},audio:{id:'official-audio'},checked:c.checks.map(()=>true),approvedAt:'today',generationProvider:'useapi',flowMediaId:'remote-video'});
  const originalScene=structuredClone(scene),originalElement=structuredClone(element);
  assert.equal(c.migrateVideoConnector(state),true);
  for(const key of ['videoProvider','flowConnection','flowAssets'])assert.ok(!(key in state));
  assert.ok(!('flowVoice' in element));assert.equal(element.voiceId,originalElement.voiceId);assert.equal(element.voice,originalElement.voice);assert.deepEqual(element.files,originalElement.files);assert.equal(element.approved,true);
  for(const key of ['status','video','firstFrame','lastFrame','audio','checked','approvedAt'])assert.deepEqual(scene[key],originalScene[key]);
  assert.ok(!('generationProvider' in scene));assert.ok(!('flowMediaId' in scene));
  assert.equal(c.migrateVideoConnector(state),false);
});
test('reservas antigas são arquivadas e liberadas sem apagar tomadas ou reenviar geração',()=>{
  for(const operation of ['useapi/job-123','useapi/unknown','useapi/submitting']){
    const {state,p}=ready(),scene=p.scenes[0];Object.assign(scene,{status:'generating',operation,generationProvider:'useapi',flowSubmission:{ref:'old-submission'},generationFileUri:'https://old.invalid/video'});
    if(operation.endsWith('unknown'))scene.video={id:'previous-take'};
    assert.equal(c.migrateVideoConnector(state),true);assert.equal(scene.operation,undefined);assert.equal(scene.generationFileUri,undefined);assert.equal(scene.status,scene.video?'stale':'draft');assert.ok(!('flowSubmission' in scene));assert.equal(scene.generationHistory[0].operation,operation);assert.match(scene.generationError,/não foi cancelado/);
    if(scene.video)assert.equal(scene.video.id,'previous-take');
    assert.equal(c.migrateVideoConnector(state),false);assert.equal(scene.generationHistory.length,1);
  }
});
test('uma reserva legada sem metadados também deixa de bloquear o estúdio',()=>{
  const {state,p}=ready();p.scenes[0].operation='useapi/job-old';p.scenes[0].status='generating';
  assert.equal(c.migrateVideoConnector(state),true);assert.equal(p.scenes[0].operation,undefined);assert.equal(p.scenes[0].status,'draft');
});
test('a retirada da geração direta arquiva também reservas Gemini sem apagar os clipes',()=>{
  const {state,p}=ready();p.flowProjectUrl='https://labs.google/fx/tools/flow/old';
  const scene=p.scenes[0];Object.assign(scene,{status:'generating',operation:'interactions/current',generationProvider:'gemini',generationFileUri:'https://storage.googleapis.com/current',video:{id:'previous-clip'}});
  assert.equal(c.migrateVideoConnector(state),true);assert.equal(scene.operation,undefined);assert.equal(scene.status,'stale');assert.equal(scene.video.id,'previous-clip');assert.equal(scene.generationHistory[0].operation,'interactions/current');assert.ok(!('flowProjectUrl' in p));assert.ok(!('generationProvider' in scene));assert.equal(c.migrateVideoConnector(state),false);
});
