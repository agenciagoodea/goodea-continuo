import {localDatabase,localBucket} from "./local-storage";
// Server-only settings. Never expose these through NEXT_PUBLIC_* variables.
export const env={DB:localDatabase,BUCKET:localBucket,get GEMINI_API_KEY(){return process.env.GEMINI_API_KEY;},get USEAPI_TOKEN(){return process.env.USEAPI_TOKEN;}};
