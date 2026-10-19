import {env} from "./runtime";
import {ApiError,commit,fileBytes,log,putFile} from "./server";
import {invalidate,uid,VIDEO_MODEL,type State,type Project,type Scene} from "./core";
import {readJsonResponse} from "./http";
import {flowAccount,flowAccounts,flowVoices,flowInputs,flowIssues,flowVideoRequest,flowJobId,flowVideo,flowDownloadUrl,type FlowConnection} from "./useapi";

const BASE="https://api.useapi.net/v1/google-flow/";
export class UseapiError extends ApiError{
  constructor(message:string,public providerStatus=0,public jobId?:string){super(message,502);}
}
export function useapiKey(req:Request){
  const key=req.headers.get("x-useapi-key")||(env as any).USEAPI_TOKEN;
  if(!key)throw new ApiError("Informe o token useapi.net em Integrações. A chave Gemini é separada.",428);
  if(key.length>2000||/[\s]/.test(key))throw new ApiError("O token useapi.net é inválido. Cole apenas o token, sem o prefixo Bearer.");
  return key as string;
}
function safeError(data:any,key:string){
  const message=typeof data?.error==="string"?data.error:typeof data?.error?.message==="string"?data.error.message:typeof data?.message==="string"?data.message:"Falha no serviço";
  const reasons=Array.isArray(data?.response?.failureReasons)?data.response.failureReasons.filter((r:unknown)=>typeof r==="string").join(", "):"";
  return `${message}${reasons?` · ${reasons}`:""}`.replaceAll(key,"[token]").slice(0,700);
}
export async function useapiRequest(key:string,path:string,payload?:unknown,binary?:{bytes:ArrayBuffer;mime:string}):Promise<any>{
  if(!/^(?:accounts(?:\/[^/?]+)?|voices\?email=[^&]+|assets\/[^/?]+|videos|jobs(?:\?options=history|\/[^/?]+)?)$/.test(path))throw new ApiError("Operação useapi.net inválida.");
  let response:Response;
  try{response=await fetch(BASE+path,{method:payload!==undefined||binary?"POST":"GET",headers:{Authorization:`Bearer ${key}`,...(binary?{"Content-Type":binary.mime}:payload!==undefined?{"Content-Type":"application/json"}:{})},body:binary?binary.bytes:payload!==undefined?JSON.stringify(payload):undefined,redirect:"error",signal:AbortSignal.timeout(240000)});}
  catch{throw new UseapiError("A useapi.net não confirmou a resposta. Consulte o andamento antes de enviar outra geração.");}
  let data:any;try{data=await readJsonResponse(response);}catch{throw new UseapiError(`A useapi.net retornou uma resposta inválida (HTTP ${response.status}). Consulte o andamento antes de reenviar.`,response.status>=400?response.status:0);}
  if(!response.ok||(data.error&&!path.startsWith("jobs/"))){
    const guidance=response.status===401?" Token inválido ou expirado; confira a conexão.":response.status===402?" Confira a assinatura useapi.net.":response.status===403?" Confira o login e o acesso da conta ao Omni Flash.":response.status===429?" Aguarde o limite informado pelo provedor; o envio não será repetido automaticamente.":"";
    throw new UseapiError(`useapi.net (${response.status}): ${safeError(data,key)}${guidance}`,response.status,flowJobId(data));
  }
  return data;
}
export async function listFlowAccounts(req:Request){return flowAccounts(await useapiRequest(useapiKey(req),"accounts"));}
export async function connectFlow(req:Request,email:string):Promise<FlowConnection>{
  const key=useapiKey(req),account=flowAccount(email,await useapiRequest(key,`accounts/${encodeURIComponent(email)}`));
  if(account.backend!=="flow")throw new ApiError("Esta conta está no backend antigo. Faça novamente o login guiado na useapi.net e atualize as contas.");
  if(account.health!=="OK")throw new ApiError("A conta precisa de novo login ou verificação no assistente da useapi.net.");
  let voices:FlowConnection["voices"]=[],voicesError:string|undefined;
  try{voices=flowVoices(await useapiRequest(key,`voices?email=${encodeURIComponent(email)}`));}catch{voicesError="Não foi possível listar as vozes. Revalide a conexão para tentar novamente; a seleção da conta foi preservada.";}
  return {...account,verifiedAt:new Date().toISOString(),voices,voicesError};
}
function result(state:State,error?:string,pending=false,needsAttention=false,status=200){return Response.json({state,error,pending,needsAttention},{status});}
export async function startFlow(req:Request,user:string,state:State,p:Project,s:Scene,revision:number){
  const key=useapiKey(req);
  if(!state.flowConnection)throw new ApiError("Selecione a conta Flow em Integrações.",428);
  const email=state.flowConnection.email;
  const current={...state.flowConnection,...flowAccount(email,await useapiRequest(key,`accounts/${encodeURIComponent(email)}`)),verifiedAt:new Date().toISOString()};
  const issues=flowIssues(p,s,state.elements,current);if(issues.length)throw new ApiError(issues.join(" "));
  state.flowConnection=current;
  const inputs=flowInputs(p,s,state.elements),images=[];
  invalidate(p,p.scenes.indexOf(s));s.status="generating";s.operation="useapi/submitting";s.generationProvider="useapi";s.generationModel=VIDEO_MODEL;
  if(s.flowSubmission) s.generationHistory=[...(s.generationHistory||[]),{operation:`useapi/${s.flowSubmission.jobId||s.flowSubmission.ref}`,model:VIDEO_MODEL,at:s.flowSubmission.at}];
  s.flowSubmission={ref:uid(),email,at:new Date().toISOString(),stage:"uploading"};delete s.generationError;delete s.flowMediaId;
  let saved=await commit(user,state,revision),sent=false;
  try{
    for(const input of inputs){
      let cached=state.flowAssets?.find(a=>a.email===email&&a.projectId===(current.projectId||"")&&a.fileId===input.file.id);
      if(!cached){
        const binary=await fileBytes(user,input.file,20*1024*1024);
        if(!["image/png","image/jpeg","image/webp"].includes(binary.mime))throw new ApiError("Use PNG, JPG ou WebP nas referências Flow.");
        const uploaded=await useapiRequest(key,`assets/${encodeURIComponent(email)}`,undefined,binary);
        const ref=uploaded.mediaGenerationId?.mediaGenerationId;
        if(typeof ref!=="string"||!ref.includes("-image:")||ref.length>1000)throw new ApiError("A useapi.net não retornou o identificador da imagem enviada.",502);
        if(uploaded.email&&uploaded.email.toLowerCase()!==email.toLowerCase())throw new ApiError("A imagem foi associada a outra conta. A geração foi interrompida.",502);
        cached={email,projectId:current.projectId||"",fileId:input.file.id,ref,at:new Date().toISOString()};
        state.flowAssets=[...(state.flowAssets||[]),cached].slice(-250);saved=await commit(user,state,saved.revision);
      }
      images.push({...input,ref:cached.ref});
    }
    const body=flowVideoRequest(p,s,state.elements,email,images,s.flowSubmission.ref);
    s.flowSubmission.stage="sending";s.flowSubmission.sentAt=new Date().toISOString();saved=await commit(user,state,saved.revision);sent=true;
    const response=await useapiRequest(key,"videos",body),jobId=flowJobId(response);
    if(!jobId)throw new UseapiError("O envio pode ter sido recebido, mas a useapi.net não confirmou o identificador da geração.");
    s.operation=`useapi/${encodeURIComponent(jobId)}`;s.flowSubmission.jobId=jobId;s.flowSubmission.stage="submitted";
    log(state,`Cena ${p.scenes.indexOf(s)+1}: enviada ao Google Flow via useapi.net, Omni Flash, 10s, 720p, ${p.aspect}.`);
    return result(await commit(user,state,saved.revision));
  }catch(e){
    const provider=e instanceof UseapiError?e:undefined;
    const confirmedRefusal=!!provider&&[400,401,402,403,404,413,422,429].includes(provider.providerStatus);
    s.generationError=e instanceof Error?e.message:"Não foi possível concluir o envio ao Flow.";
    if(provider?.jobId){s.operation=`useapi/${encodeURIComponent(provider.jobId)}`;s.flowSubmission.jobId=provider.jobId;s.flowSubmission.stage="submitted";}
    else if(sent&&!confirmedRefusal){s.operation="useapi/unknown";s.flowSubmission.stage="uncertain";s.generationError+=" O envio permanece reservado para evitar uma segunda cobrança. Consulte ou recupere o job antes de gerar novamente.";}
    else {delete s.operation;s.status=s.video?"stale":"draft";}
    return result(await commit(user,state,saved.revision),s.generationError,false,sent&&!confirmedRefusal,502);
  }
}
async function mediaBytes(response:Response){
  if(!response.ok)throw new ApiError("O download do Flow não terminou. A geração continua registrada; consulte novamente.",502);
  const max=32*1024*1024;if(Number(response.headers.get("content-length")||0)>max)throw new ApiError("O clipe excede 32 MB. Baixe no Flow e importe manualmente.",413);
  const mime=response.headers.get("content-type")?.split(";")[0];if(mime&&!['video/mp4','application/octet-stream'].includes(mime))throw new ApiError("O provedor não devolveu um arquivo de vídeo.",502);
  const reader=response.body?.getReader();if(!reader)throw new ApiError("O arquivo de vídeo está vazio.",502);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ApiError("O clipe excede 32 MB. Baixe no Flow e importe manualmente.",413);}chunks.push(value);}
  if(!size)throw new ApiError("O arquivo de vídeo está vazio.",502);
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function downloadFlow(key:string,id?:string,url?:string){
  // Downloads and URL refreshes never create another generation. No bearer goes to Google's CDN.
  if(url){const approved=flowDownloadUrl(url);try{const response=await fetch(approved,{redirect:"error",signal:AbortSignal.timeout(120000)});if(response.ok)return mediaBytes(response);}catch(e){if(e instanceof ApiError)throw e;}}
  if(id){
    let refreshed:string|undefined;
    try{const resolved=await useapiRequest(key,`assets/${encodeURIComponent(id)}`);refreshed=typeof resolved.url==="string"?resolved.url:undefined;}catch{}
    if(refreshed){const approved=flowDownloadUrl(refreshed);try{const response=await fetch(approved,{redirect:"error",signal:AbortSignal.timeout(120000)});if(response.ok)return mediaBytes(response);}catch(e){if(e instanceof ApiError)throw e;}}
    // Documented raw-download fallback when the signed URL is temporarily unavailable.
    const response=await fetch(`${BASE}assets/${encodeURIComponent(id)}?raw=true`,{headers:{Authorization:`Bearer ${key}`},redirect:"error",signal:AbortSignal.timeout(120000)});
    return mediaBytes(response);
  }
  throw new ApiError("O link do vídeo ainda não está disponível. Consulte novamente; não é necessário gerar outro clipe.",502);
}
async function findSubmission(key:string,s:Scene,jobId?:string){
  if(!s.flowSubmission)throw new ApiError("Não há envio Flow registrado nesta cena.");
  if(jobId){const job=await useapiRequest(key,`jobs/${encodeURIComponent(jobId)}`);if(job.request?.replyRef!==s.flowSubmission.ref||job.request?.email!==s.flowSubmission.email)throw new ApiError("Este job não corresponde ao envio reservado desta cena.");return job;}
  const stats=await useapiRequest(key,"jobs?options=history");
  const entries=Object.entries({...stats.videos?.executing,...stats.videos?.history}).filter(([,v]:any)=>v?.email===s.flowSubmission!.email&&v.timestamp>=Date.parse(s.flowSubmission!.at)-60000).slice(-10);
  for(const [id] of entries){const job=await useapiRequest(key,`jobs/${encodeURIComponent(id)}`);if(job.request?.replyRef===s.flowSubmission.ref&&job.request?.email===s.flowSubmission.email)return job;}
}
export async function pollFlow(req:Request,user:string,state:State,p:Project,s:Scene,revision:number,manualJobId?:string){
  const key=useapiKey(req);let job:any;
  if(manualJobId||s.operation==="useapi/unknown"||s.operation==="useapi/submitting"){
    if(!manualJobId&&s.flowSubmission&&Date.now()-Date.parse(s.flowSubmission.sentAt||s.flowSubmission.at)<300000)return result(state,undefined,true);
    job=await findSubmission(key,s,manualJobId);
    const id=flowJobId(job);
    if(!id)return result(state,"A useapi.net ainda não confirmou este envio. Consulte novamente ou informe o job da tentativa. Nenhuma nova geração foi enviada.",true,true);
    s.operation=`useapi/${encodeURIComponent(id)}`;s.flowSubmission!.jobId=id;s.flowSubmission!.stage="submitted";
  }else if(s.operation?.startsWith("useapi/"))job=await useapiRequest(key,`jobs/${s.operation.slice(7)}`);
  else throw new ApiError("Não há geração Flow para consultar.");
  if(job.type&&job.type!=="video")throw new ApiError("O job retornado não é um vídeo.",502);
  if(job.request?.model&&job.request.model!=="omni-flash")throw new ApiError("O job retornado não usa Omni Flash. O resultado foi bloqueado.",502);
  if(job.request?.email&&s.flowSubmission&&job.request.email!==s.flowSubmission.email)throw new ApiError("O job retornado pertence a outra conta Flow.",502);
  if(["created","started","pending","processing"].includes(job.status))return result(await commit(user,state,revision),undefined,true);
  if(job.status==="failed"||job.error){
    s.generationError=`O Flow não concluiu a geração: ${safeError(job,key)}`;delete s.operation;s.status=s.video?"stale":"draft";
    log(state,`Cena ${p.scenes.indexOf(s)+1}: a geração via useapi.net não foi concluída.`);
    return result(await commit(user,state,revision),s.generationError,false,true,502);
  }
  if(job.status!=="completed")throw new ApiError("A useapi.net retornou um estado de geração desconhecido. O envio continua reservado.",502);
  const video=flowVideo(job);if(!video)throw new ApiError("O vídeo ainda não está disponível nesta consulta. A geração continua registrada.",502);
  if(!video.model||!/^omni[_-]flash(?:[_-]|$)/i.test(video.model))throw new ApiError("O vídeo retornado usa outro modelo. O resultado foi bloqueado.",502);
  const bytes=await downloadFlow(key,video.id||s.flowMediaId,video.url);
  const file=await putFile(user,bytes,`cena-${p.scenes.indexOf(s)+1}-flow.mp4`,"video/mp4");
  if(s.video)s.attempts.push({video:s.video,createdAt:new Date().toISOString()});
  invalidate(p,p.scenes.indexOf(s));s.video=file;s.status="review";s.generationModel=VIDEO_MODEL;s.generationProvider="useapi";s.flowMediaId=video.id;
  delete s.operation;delete s.firstFrame;delete s.lastFrame;delete s.generationError;
  const connection=state.flowConnection;
  if(typeof job.response?.remainingCredits==="number"&&connection&&connection.email===s.flowSubmission?.email)connection.credits=job.response.remainingCredits;
  log(state,`Cena ${p.scenes.indexOf(s)+1}: vídeo do Flow importado. Extraia os frames e revise identidade, áudio, 10s e 720p antes de aprovar.`);
  return result(await commit(user,state,revision));
}
