import {promptFor,type Element,type FileRef,type Project,type Scene} from "./core";

export const FLOW_MODEL="omni-flash";
export const FLOW_SETUP_URL="https://useapi.net/docs/start-here/setup-google-flow#automated-setup-recommended";
export type FlowVoice={ref:string;name:string;source:"system"|"user"};
export type FlowAccount={email:string;health:string;backend:string;projectId?:string;projectTitle?:string;credits?:number;supportsOmni?:boolean};
export type FlowConnection=FlowAccount&{verifiedAt:string;voices:FlowVoice[];voicesError?:string};
export type FlowAsset={fileId:string;email:string;projectId:string;ref:string;at:string};
export type FlowSubmission={ref:string;email:string;at:string;stage:"uploading"|"sending"|"submitted"|"uncertain";sentAt?:string;jobId?:string};
export type FlowInput={file:FileRef;label:string;firstFrame?:boolean};
const text=(value:unknown,max=300)=>typeof value==="string"?value.slice(0,max):"";
export function flowAccount(email:string,data:any):FlowAccount{
  const models=Array.isArray(data?.models?.videoModels)?data.models.videoModels:undefined;
  return {email,health:data?.health==="OK"?"OK":"Requer verificação",backend:["flow","labs"].includes(data?.backend)?data.backend:"Não informado",projectId:text(data?.project?.projectId)||undefined,projectTitle:text(data?.project?.projectTitle)||undefined,credits:typeof data?.credits?.credits==="number"&&Number.isFinite(data.credits.credits)?data.credits.credits:undefined,supportsOmni:models?models.some((m:any)=>/omni.*flash/i.test(`${m.key||""} ${m.displayName||""}`)&&(!m.resolution||m.resolution==="720p")):undefined};
}
export function flowAccounts(data:any):FlowAccount[]{
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("A lista de contas da useapi.net veio em um formato inválido.");
  return Object.entries(data).filter(([email,value])=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&value&&typeof value==="object").map(([email,value])=>flowAccount(email,value));
}
export function flowVoices(data:any):FlowVoice[]{
  if(!Array.isArray(data?.voices))throw new Error("A useapi.net não retornou a lista de vozes.");
  return data.voices.filter((v:any)=>typeof v.voice==="string"&&["system","user"].includes(v.source)).slice(0,200).map((v:any)=>({ref:text(v.voice,1000),name:text(v.displayName)||text(v.voice),source:v.source}));
}
export function flowInputs(p:Project,s:Scene,elements:Element[]):FlowInput[]{
  const i=p.scenes.findIndex(x=>x.id===s.id);
  if(i>0&&s.transition==="continue"){
    const file=p.scenes[i-1].lastFrame;if(!file)throw new Error("Extraia o último frame aprovado antes de continuar.");
    return [{file,label:"Último frame aprovado",firstFrame:true}];
  }
  return [...s.characters,s.environment].map(id=>{const e=elements.find(e=>e.id===id),file=e?.files.find(f=>f.mime.startsWith("image/"));if(!e||!file)throw new Error("Uma referência oficial está sem imagem.");return {file,label:e.name};});
}
export function flowIssues(p:Project,s:Scene,elements:Element[],account?:FlowConnection):string[]{
  const errors:string[]=[];
  if(!account)return ["Conecte uma conta em Integrações → Google Flow via useapi.net."];
  if(account.backend!=="flow")errors.push("Atualize o login da conta no assistente da useapi.net para usar o backend atual do Flow.");
  if(account.health!=="OK")errors.push("A conta Flow precisa de novo login ou verificação na useapi.net.");
  if(account.supportsOmni!==true)errors.push("A useapi.net ainda não confirmou Omni Flash 720p nesta conta. Revalide a conexão.");
  try{
    const inputs=flowInputs(p,s,elements);
    if(inputs.length>7)errors.push("O Omni Flash aceita até 7 imagens por abertura ou corte, contando personagens e ambiente. Divida o elenco desta cena.");
    for(const {file} of inputs){if(!["image/png","image/jpeg","image/webp"].includes(file.mime))errors.push(`${file.name}: use PNG, JPG ou WebP no Flow.`);if(file.size>20*1024*1024)errors.push(`${file.name}: o Flow aceita até 20 MB por imagem.`);}
    if(!inputs.some(x=>x.firstFrame)){
      const voices=elements.filter(e=>s.characters.includes(e.id)&&e.flowVoice);
      if(voices.some(e=>e.flowVoice!.email!==account.email||!account.voices.some(v=>v.ref===e.flowVoice!.ref)))errors.push("Há uma voz de personagem vinculada a outra conta Flow. Selecione a voz da conta atual na ficha.");
      if(new Set(voices.map(e=>e.flowVoice!.ref)).size>5)errors.push("O Omni Flash aceita até 5 referências de voz nesta cena.");
    }
  }catch(e){errors.push(e instanceof Error?e.message:"Confira as referências da cena.");}
  return errors;
}
export function flowVideoRequest(p:Project,s:Scene,elements:Element[],email:string,images:(FlowInput&{ref:string})[],submissionRef:string){
  const first=images.find(x=>x.firstFrame);
  if(first&&images.length!==1)throw new Error("Frame inicial não pode ser combinado com imagens de referência no Omni Flash da useapi.net.");
  if(!first&&images.length>7)throw new Error("Use até 7 imagens de referência.");
  if(!["16:9","9:16"].includes(p.aspect)||s.duration!==10)throw new Error("Use cenas de 10 segundos em 16:9 ou 9:16.");
  const body:Record<string,unknown>={email,model:FLOW_MODEL,duration:10,resolution:"720p",aspectRatio:p.aspect==="16:9"?"landscape":"portrait",count:1,async:true,replyRef:submissionRef};
  const labels:string[]=[];
  if(first){body.startImage=first.ref;labels.push("The supplied startImage is the exact last frame of the previous approved clip. Begin from it. Canonical identity details below remain mandatory. No extra image or voice references are attached in this mode.");}
  else{
    images.forEach((image,i)=>{body[`referenceImage_${i+1}`]=image.ref;labels.push(`@referenceImage_${i+1}: official reference for ${image.label}.`);});
    const voices:string[]=[];
    for(const id of s.characters){const e=elements.find(e=>e.id===id);if(!e?.flowVoice)continue;if(e.flowVoice.email!==email)throw new Error("A voz pertence a outra conta Flow.");let i=voices.indexOf(e.flowVoice.ref);if(i<0){i=voices.push(e.flowVoice.ref)-1;body[`referenceAudio_${i+1}`]=e.flowVoice.ref;}labels.push(`Voice for ${e.name}: @referenceAudio_${i+1}. Only ${e.name} uses this voice.`);}
    if(voices.length>5)throw new Error("Use até 5 referências de voz.");
  }
  body.prompt=labels.join("\n")+"\n\n"+promptFor(p,s,elements).replace("Attach previous ending as continuity context; use an approved opening composition for this new shot.","Use the attached official references to establish this shot. The previous action provides edit context.");
  return body;
}
export function flowJobId(data:any):string|undefined{
  const id=data?.jobid||data?.jobId;
  return typeof id==="string"&&id.length<=1000&&/^j[a-zA-Z0-9@._:+*=-]+$/.test(id)?id:undefined;
}
export function flowVideo(data:any):{id?:string;url?:string;model?:string}|undefined{
  const media=data?.response?.media||data?.media;
  if(!Array.isArray(media))return undefined;
  const m=media.find((m:any)=>m.video?.generatedVideo&&m.mediaMetadata?.mediaStatus?.mediaGenerationStatus!=="MEDIA_GENERATION_STATUS_FAILED");
  if(!m)return undefined;
  return {id:typeof m.mediaGenerationId==="string"?m.mediaGenerationId:undefined,url:typeof m.videoUrl==="string"?m.videoUrl:undefined,model:m.video.generatedVideo.model};
}
export function flowDownloadUrl(value:string):URL{
  const url=new URL(value);
  if(url.protocol!=="https:"||url.username||url.password||(url.port&&url.port!=="443")||!(url.hostname==="flow-content.google"||url.hostname==="storage.googleapis.com"||url.hostname.endsWith(".googleusercontent.com")))throw new Error("O endereço de download do Flow não foi reconhecido.");
  return url;
}
