import type {Element,VisualDetails,FileRef} from "./core";

export const REFERENCE_MODEL="gemini-3.8-flash";
export type TokenUsage={input?:number;output?:number;thinking?:number;cached?:number;total?:number};
export type CostEstimate={usd:number;inputRate:number;outputRate:number;cachedRate:number;asOf:string;source:string};
export type ReferenceResult={nameFromReference:string;rules:string;palette:string;voiceFromReference:string;voiceEvidence:"audio"|"document"|"none";visualDetails:VisualDetails;uncertainties:string[]};
export type ReferenceReading={id:string;key:string;at:string;kind:Element["kind"];name:string;fileIds:string[];files?:FileRef[];status:"running"|"complete"|"failed";model:string;usage?:TokenUsage;estimate?:CostEstimate;result?:ReferenceResult;error?:string};
const count=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:undefined;
export function tokenUsage(response:any):TokenUsage|undefined{
  const m=response?.usageMetadata;
  if(!m)return undefined;
  const usage:TokenUsage={input:count(m.promptTokenCount),output:count(m.candidatesTokenCount),thinking:count(m.thoughtsTokenCount),cached:count(m.cachedContentTokenCount),total:count(m.totalTokenCount)};
  return Object.values(usage).some(v=>v!==undefined)?usage:undefined;
}
export function estimateReferenceCost(usage:TokenUsage|undefined,at:string,model=REFERENCE_MODEL):CostEstimate|undefined{
  if(!usage||usage.input===undefined||model!==REFERENCE_MODEL)return undefined;
  // total includes thoughts. Do not count cached input or thinking twice.
  const generated=usage.total!==undefined?usage.total-usage.input:usage.output!==undefined&&usage.thinking!==undefined?usage.output+usage.thinking:undefined;
  if(generated===undefined||generated<0)return undefined;
  const multiplier=at>="2027-01-01"?2:1;
  const inputRate=.75*multiplier,outputRate=3.75*multiplier,cachedRate=.075*multiplier;
  const cached=Math.min(usage.cached||0,usage.input);
  return {usd:((usage.input-cached)*inputRate+cached*cachedRate+generated*outputRate)/1e6,inputRate,outputRate,cachedRate,asOf:at.slice(0,10),source:"https://ai.google.dev/gemini-api/docs/pricing"};
}
export function referenceProposal(input:Pick<Element,"name"|"rules"|"voice">,reading:ReferenceReading):Partial<Element>{
  const r=reading.result;if(!r)throw new Error("Esta leitura ainda não tem uma ficha pronta.");
  const existingVoice=input.voice.trim()&&!/^Cadastrar descrição e amostra/.test(input.voice);
  return {name:input.name.trim()||r.nameFromReference,rules:input.rules.includes(r.rules)?input.rules:[input.rules,r.rules].filter(Boolean).join("\n\n"),palette:r.palette,voice:existingVoice?input.voice:r.voiceFromReference||input.voice,visualDetails:r.visualDetails,approved:false,analysis:{at:reading.at,fileIds:reading.fileIds,uncertainties:r.uncertainties,readingId:reading.id,model:reading.model,usage:reading.usage,estimate:reading.estimate}};
}
