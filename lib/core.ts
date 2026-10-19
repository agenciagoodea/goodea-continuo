export type FileRef = { id: string; name: string; mime: string; size: number };
export const VIDEO_MODEL="gemini-omni-1.1-flash";
export const VIDEO_DURATION=10;
export const VIDEO_RESOLUTION="720p";
export const VIDEO_PROFILE="omni-10s-720p-v1";
export const visualLabels = {face:"Rosto e expressão",hair:"Cabelo",eyes:"Olhos",skin:"Tom de pele visível",clothing:"Roupas e calçados",accessories:"Acessórios",proportions:"Proporções e silhueta",style:"Estilo visual",lighting:"Iluminação",environment:"Arquitetura e objetos"};
export type VisualDetails = Partial<Record<keyof typeof visualLabels,string>>;
import type {TokenUsage,CostEstimate,ReferenceReading} from "./reference";
export type ReferenceAnalysis = {at:string;fileIds:string[];uncertainties:string[];readingId?:string;model?:string;usage?:TokenUsage;estimate?:CostEstimate};
export type Element = { id: string; kind: "character" | "environment"; name: string; rules: string; palette: string; voice: string; voiceId: string; files: FileRef[]; approved: boolean; version: number; visualDetails?:VisualDetails;analysis?:ReferenceAnalysis };
export type Line = { speaker: string; text: string; type: "dialogue" | "narration" };
export const checks = ["Identidade e roupas", "Quantidade de personagens", "Ações e falas do roteiro", "Ligação com a cena anterior", "Vozes e sincronização", "Cenário, luz e áudio"];
export type Scene = { id: string; title: string; duration: number; environment: string; characters: string[]; action: string; camera: string; lines: Line[]; sound: string; transition: "continue" | "cut"; video?: FileRef; firstFrame?: FileRef; lastFrame?: FileRef; audio?: FileRef; actualDuration?: number; width?: number; height?: number; status: "draft" | "review" | "approved" | "stale" | "generating"; checked: boolean[]; notes: string; attempts: { video: FileRef; createdAt: string }[]; operation?: string; generationError?: string; generationFileUri?:string; generationModel?:string;generationHistory?:{operation:string;model?:string;at:string}[]; audit?: { verdict: string; findings: string[]; createdAt: string }; approvedAt?: string };
export type Project = { id: string; name: string; script: string; aspect: "16:9" | "9:16"; style: string; rules: string; palette: string; scenes: Scene[]; music?: FileRef; narration?: FileRef; musicVolume: number; muteOriginal: boolean; createdAt: string };
export type State = { elements: Element[]; projects: Project[]; selectedProject: string; revision: number; events: { at: string; text: string }[];videoProfile?:string;referenceReadings?:ReferenceReading[] };
export const uid = () => crypto.randomUUID();
export const emptyScene = (title = "Nova cena"): Scene => ({id:uid(),title,duration:VIDEO_DURATION,environment:"",characters:[],action:"",camera:"Plano médio, movimento suave",lines:[],sound:"Som ambiente discreto. Sem trilha musical gerada por cena.",transition:"continue",status:"draft",checked:checks.map(()=>false),notes:"",attempts:[]});
export const defaultRules = "Usar somente referências oficiais aprovadas. Preservar rosto, cabelo, idade aparente, proporções, roupa e acessórios. Não duplicar personagens. Manter arquitetura, mobiliário e iluminação do ambiente. Somente quem fala move a boca. Não gerar logotipos, legendas ou texto: aplicar a marca original na pós-produção.";
export function newProject(name: string): Project { return { id:uid(),name,script:"",aspect:"16:9",style:"Animação 3D cinematográfica infantil; acabamento natural, luz acolhedora e movimentos sutis.",rules:defaultRules,palette:"Usar a paleta das fichas oficiais. Não inventar cores de personagens.",scenes:[],musicVolume:0.16,muteOriginal:false,createdAt:new Date().toISOString()}; }
export const exampleScript = `CENA 01 | Uma nova descoberta | 10s
AMBIENTE: Casa da Luz
PERSONAGENS: Emanuel, Bento
AÇÃO: Emanuel e Bento entram devagar e observam a sala. Cada personagem aparece uma única vez. Eles param perto da mesa.
CÂMERA: Plano aberto com aproximação suave.
EMANUEL: Bento, olha o que eu encontrei!
SOM: Passos suaves e ambiente interno tranquilo.

CENA 02 | O convite | 10s
AMBIENTE: Casa da Luz
PERSONAGENS: Emanuel, Bento
AÇÃO: Continuar exatamente da posição final da cena anterior. Bento olha para Emanuel e sorri.
BENTO: Vamos descobrir juntos?
CÂMERA: Plano médio, mantendo o eixo de câmera.

CENA 03 | Juntos na descoberta | 10s
AMBIENTE: Casa da Luz
PERSONAGENS: Emanuel, Bento
AÇÃO: Os dois se aproximam da mesa, preservando suas posições relativas e roupas oficiais.
NARRAÇÃO: Uma grande aventura começa com uma pequena descoberta.
CÂMERA: Aproximação suave para a mesa.`;
export function initialState(): State {
  const p = newProject("Emanuel e Sua Turma · Primeiro episódio"); p.script=exampleScript;
  const elements: Element[] = ["Emanuel","Téo","Bento","Lia","Tico","Tio Luz"].map(name=>({id:uid(),kind:"character",name,rules:defaultRules,palette:"Consultar ficha oficial",voice:"Cadastrar descrição e amostra da voz oficial.",voiceId:"",files:[],approved:false,version:1}));
  elements.push({id:uid(),kind:"environment",name:"Casa da Luz",rules:"Preservar rigorosamente a arquitetura, a porta, o mobiliário, a escala e a iluminação do guia oficial. Não reinterpretar.",palette:"Consultar Guia de Ambiente Casa da Luz",voice:"",voiceId:"",files:[],approved:false,version:1});
  p.scenes=parseScript(exampleScript,elements);
  return {elements,projects:[p],selectedProject:p.id,revision:0,videoProfile:VIDEO_PROFILE,events:[{at:new Date().toISOString(),text:"Estúdio criado. Cadastros iniciais aguardam fichas oficiais. O roteiro de exemplo é editável."}]};
}
const norm = (s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function parseScript(script: string, elements: Element[]): Scene[] {
  const blocks=script.split(/(?=^\s*(?:CENA|SCENE)\s+\d+)/gim).filter(b=>b.trim());
  return blocks.map((block,i)=>{
    const rows=block.trim().split(/\r?\n/); const heading=rows[0]; const s=emptyScene(heading.replace(/^\s*(?:CENA|SCENE)\s*\d+\s*[:|—–-]?\s*/i,"").replace(/\s*\|\s*\d+\s*s\s*$/i,"")||`Cena ${i+1}`);
    const duration=heading.match(/(\d+)\s*s\b/i);if(duration&&Number(duration[1])!==VIDEO_DURATION)s.notes=`O roteiro indicava ${duration[1]}s. Ajuste o ritmo para 10 segundos.`;
    for(const row of rows.slice(/^(?:CENA|SCENE)\s+\d+/i.test(heading)?1:0)) {
      const m=row.match(/^\s*([^:]+):\s*(.*)$/); if(!m){if(row.trim())s.action+=(s.action?"\n":"")+row.trim();continue;}
      const key=norm(m[1]),value=m[2].trim();
      if(["ambiente","cenario","environment"].includes(key))s.environment=elements.find(e=>e.kind==="environment"&&norm(e.name)===norm(value))?.id||`pending:${value}`;
      else if(["personagens","characters"].includes(key))s.characters=value.split(/[,;]/).map(v=>elements.find(e=>e.kind==="character"&&norm(e.name)===norm(v))?.id||`pending:${v.trim()}`);
      else if(["acao","action"].includes(key))s.action+=(s.action?"\n":"")+value;
      else if(["camera","enquadramento"].includes(key))s.camera=value;
      else if(["som","musica","sound"].includes(key))s.sound=value;
      else if(["transicao","transition"].includes(key))s.transition=/corte|cut/i.test(value)?"cut":"continue";
      else if(["duracao","duration"].includes(key))s.duration=VIDEO_DURATION;
      else if(["narracao","narrador","narration"].includes(key))s.lines.push({speaker:"Narrador",text:value,type:"narration"});
      else { const name=m[1].replace(/^fala\s+/i,"").trim();s.lines.push({speaker:elements.find(e=>norm(e.name)===norm(name))?.name||name,text:value,type:"dialogue"}); }
    }
    return s;
  });
}
export function elementName(id:string,elements:Element[]){return elements.find(e=>e.id===id)?.name||id.replace(/^pending:/,"")||"Não definido";}
export function preflight(p: Project, s: Scene, elements: Element[]): string[] {
  const errors:string[]=[];const i=p.scenes.findIndex(x=>x.id===s.id);
  if(!s.action.trim())errors.push("Descreva a ação da cena.");
  if(s.duration!==VIDEO_DURATION)errors.push("Todas as cenas usam Omni Flash, 10 segundos e 720p. Ajuste a duração da cena.");
  if(!s.environment)errors.push("Selecione o ambiente.");
  for(const id of [...s.characters,...(s.environment?[s.environment]:[])]){const e=elements.find(e=>e.id===id);if(!e)errors.push(`Cadastre ${elementName(id,elements)} na biblioteca.`);else if(!e.approved||!e.files.some(f=>f.mime.startsWith("image/")))errors.push(`${e.name}: anexe uma imagem oficial e aprove a ficha.`);}
  if(new Set(s.characters).size!==s.characters.length)errors.push("Há um personagem duplicado na lista de elenco.");
  for(const line of s.lines){if(line.type==="dialogue"&&!s.characters.some(id=>norm(elementName(id,elements))===norm(line.speaker)))errors.push(`${line.speaker} tem fala, mas não está no elenco.`);}
  const words=s.lines.reduce((n,l)=>n+l.text.split(/\s+/).filter(Boolean).length,0);if(words/2.2>s.duration-0.5)errors.push("As falas podem não caber na duração. Divida a cena ou reduza o texto.");
  if(i>0){const prev=p.scenes[i-1];if(prev.status!=="approved")errors.push("Aprove a cena anterior antes de avançar.");if(!prev.lastFrame)errors.push("Extraia o último frame da cena anterior.");}
  if(s.transition==="continue"&&i>0&&s.environment!==p.scenes[i-1].environment)errors.push("O ambiente mudou: escolha corte e cadastre uma transição coerente.");
  return [...new Set(errors)];
}
export function promptFor(p: Project,s: Scene,elements:Element[]):string{
  const i=p.scenes.findIndex(x=>x.id===s.id); const prev=p.scenes[i-1];
  return [`SCENE ${i+1} — ${s.title}`,`MODEL: Gemini Omni Flash (${VIDEO_MODEL}) only. RESOLUTION: ${VIDEO_RESOLUTION}. DURATION: exactly ${VIDEO_DURATION} seconds. FORMAT: ${p.aspect}. STYLE: ${p.style}. Generate a single continuous unbroken shot; no internal scene cuts.`,`GLOBAL PALETTE: ${p.palette}`,`ABSOLUTE CANONICAL RULES: ${p.rules}`,
    `CAST: Exactly ${s.characters.length} characters: ${s.characters.map(id=>elementName(id,elements)).join(", ")||"no characters"}. Each listed character exists only once. No extra characters, duplicates, clones, reflections resembling extra people or costume changes.`,
    ...[...s.characters,s.environment].map(id=>{const e=elements.find(e=>e.id===id);return e?`OFFICIAL ${e.kind.toUpperCase()} ${e.name} v${e.version}: ${e.rules}. PALETTE: ${e.palette}${e.visualDetails?`. CANONICAL VISUAL DETAILS: ${JSON.stringify(e.visualDetails)}`:""}${e.voice?`. VOICE: ${e.voice}; fixed voice ID: ${e.voiceId||"reference sample, no guaranteed voice lock in Flow"}`:""}`:`MISSING CANONICAL REFERENCE: ${elementName(id,elements)}`;}),
    prev?(s.transition==="continue"?`CONTINUITY: Use the extracted last frame of the APPROVED previous scene as the PRIMARY FIRST IMAGE. Keep exact poses, positions, eyelines, props, clothing, lighting and camera axis. Previous action: ${prev.action}. The uploaded first image is the previous ending, not a desired ending.`:`EDIT CUT: Previous approved scene ends with: ${prev.action}. Establish the new location coherently. Preserve canonical identities. Attach previous ending as continuity context; use an approved opening composition for this new shot.`):"OPENING: Establish the scene from approved official image references.",
    `ACTION: ${s.action}`,`CAMERA: ${s.camera}`,`EXACT PORTUGUESE (pt-BR) LINES, in order:\n${s.lines.map(l=>`${l.type==="narration"?"OFF-SCREEN NARRATOR":l.speaker}: "${l.text}"`).join("\n")||"No spoken dialogue."}`,
    p.muteOriginal?"AUDIO PLAN: Imported master voice track replaces generated sound in final edit. Mouth animation must match only the indicated speaking character. No invented speech.":"AUDIO: Only the assigned speaker moves their mouth. No extra speech, overlapping voices, changed wording or voice swapping. Narration is off-screen; no character lip movement during narration.",`SOUND: ${s.sound}. No generated background music; use the same continuous master soundtrack in post-production.`,"END: Complete the described action, leave a stable readable final composition for the next scene. Do not generate a title, watermark overlay, logo or subtitles."].join("\n\n");
}
export function invalidate(p:Project,from:number){for(let i=from;i<p.scenes.length;i++){const s=p.scenes[i];s.status=s.video?"stale":"draft";s.checked=checks.map(()=>false);delete s.approvedAt;delete s.audit;delete s.generationFileUri;if(s.operation){delete s.operation;s.generationError="O contexto mudou durante a geração. Confira a operação original no provedor antes de gerar novamente.";}}}
export function sceneContent(s:Scene){const {id,title,duration,environment,characters,action,camera,lines,sound,transition}=s;return JSON.stringify({id,title,duration,environment,characters,action,camera,lines,sound,transition});}
export function seconds(n:number){return `${Math.floor(n/60).toString().padStart(2,"0")}:${Math.round(n%60).toString().padStart(2,"0")}`;}

// Retire stored video connections and reservations without contacting providers.
export function migrateVideoConnector(state:State):boolean{
  let changed=false;
  const remove=(value:object,keys:string[])=>{const data=value as Record<string,unknown>;for(const key of keys)if(Object.hasOwn(data,key)){delete data[key];changed=true;}};
  remove(state,["videoProvider","flowConnection","flowAssets"]);
  for(const element of state.elements)remove(element,["flowVoice"]);
  for(const project of state.projects){
    remove(project,["flowProjectUrl"]);
    for(const scene of project.scenes){
      if(scene.operation||scene.status==="generating"){
        if(scene.operation)scene.generationHistory=[...(scene.generationHistory||[]),{operation:scene.operation,model:scene.generationModel,at:new Date().toISOString()}];
        delete scene.operation;
        scene.status=scene.video?"stale":"draft";scene.checked=checks.map(()=>false);delete scene.approvedAt;
        scene.generationError="A geração direta foi retirada do estúdio. O envio remoto não foi cancelado. Confira o resultado no provedor e importe o clipe para revisão.";
        changed=true;
      }
      remove(scene,["flowSubmission","flowMediaId","generationProvider","generationFileUri"]);
    }
  }
  if(changed)state.events.push({at:new Date().toISOString(),text:"Geração direta e vínculos de conta retirados do estúdio. Biblioteca, mídias e histórico preservados. Envios remotos não foram cancelados."});
  return changed;
}

export function migrateVideoProfile(state:State):boolean{
  if(state.videoProfile===VIDEO_PROFILE)return false;
  for(const p of state.projects){const first=p.scenes.findIndex(s=>s.duration!==VIDEO_DURATION||!!s.operation);for(const s of p.scenes){s.duration=VIDEO_DURATION;if(s.operation){s.generationHistory=[...(s.generationHistory||[]),{operation:s.operation,model:s.generationModel,at:new Date().toISOString()}];state.events.push({at:new Date().toISOString(),text:`Operação anterior ${s.operation} preservada no histórico e retirada da sequência local. Ela pode continuar no Google; não foi cancelada no provedor.`});delete s.operation;delete s.generationFileUri;s.generationError="Configuração atualizada para Omni Flash. A operação anterior ficou registrada no histórico e pode continuar no provedor.";}}if(first>=0)invalidate(p,first);}
  state.videoProfile=VIDEO_PROFILE;state.events.push({at:new Date().toISOString(),text:"Produção atualizada para Omni Flash, cenas de 10 segundos e 720p. Formatos disponíveis: 16:9 e 9:16."});return true;
}
