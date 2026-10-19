import { VIDEO_MODEL, VIDEO_RESOLUTION, VIDEO_DURATION } from "./core";
export type OmniImage={data:string;mime_type:string;label:string;firstFrame?:boolean};
export function omniRequest(aspect:"16:9"|"9:16",prompt:string,images:OmniImage[]){
  if(aspect!=="16:9"&&aspect!=="9:16")throw new Error("Formato inválido.");
  const first=images.findIndex(i=>i.firstFrame);
  const references=images.map((image,i)=>image.firstFrame?null:`<IMAGE_REF_${i}>@Image${i+1} (${image.label})`).filter(Boolean).join(" ");
  const declarations=[first>=0?`[# Sources <FIRST_FRAME>@Image${first+1}] Use Image${first+1} as the exact starting frame; it is the last frame of the previous approved scene, not the final target frame.`:"",references?`[# References ${references}] Use these images only as canonical identity, costume, palette and environment references. They are not additional first or last frames.`:""].filter(Boolean).join("\n");
  return {model:VIDEO_MODEL,input:[...images.map(({data,mime_type})=>({type:"image" as const,data,mime_type})),{type:"text" as const,text:`${declarations}\n\n${prompt}`}],response_format:{type:"video",aspect_ratio:aspect,resolution:VIDEO_RESOLUTION,duration:`${VIDEO_DURATION}s`,delivery:"uri"},background:true,store:true,stream:false};
}
export function omniVideo(result:any):{data?:string;uri?:string;mime_type?:string}|undefined{
  for(const step of [...(result.steps||[])].reverse()){if(step.type!=="model_output")continue;const video=step.content?.find((x:any)=>x.type==="video"&&(x.data||x.uri));if(video)return video;}
  return undefined;
}
