import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {stat,writeFile,readFile,unlink} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {Readable} from "node:stream";
import path from "node:path";

export function dataDirectory(){return path.resolve(process.env.CONTINUO_DATA_DIR||path.join(process.cwd(),"data"));}
const databases=new Map<string,DatabaseSync>();
function database(){
  const dir=dataDirectory();let db=databases.get(dir);if(db)return db;
  mkdirSync(dir,{recursive:true});db=new DatabaseSync(path.join(dir,"continuo.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS studios(owner TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,owner TEXT NOT NULL,object_key TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS media_owner ON media(owner);`);
  databases.set(dir,db);return db;
}
export const localDatabase={
  prepare(sql:string){
    const statement=database().prepare(sql);
    function bound(values:SQLInputValue[]){return {async first<T>(){return (statement.get(...values)||null) as T|null;},async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};}};}
    return {...bound([]),bind(...values:SQLInputValue[]){return bound(values);}};
  }
};
function objectPath(key:string){
  const parts=key.split("/");
  if(parts.length!==2||parts.some(p=>!p||!/^[-a-zA-Z0-9_]+$/.test(p)))throw new Error("Identificador de arquivo inválido.");
  return path.join(dataDirectory(),"media",...parts);
}
export class InvalidRangeError extends Error{constructor(public size:number){super("Intervalo de vídeo inválido.");}}
function byteRange(value:string,size:number){
  const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2])||!size)throw new InvalidRangeError(size);
  let start:number,end:number;
  if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new InvalidRangeError(size);start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new InvalidRangeError(size);
  return {offset:start,length:end-start+1};
}
export const localBucket={
  async put(key:string,bytes:ArrayBuffer|Uint8Array,_options?:unknown){const file=objectPath(key);await import("node:fs/promises").then(fs=>fs.mkdir(path.dirname(file),{recursive:true}));await writeFile(file,bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes);},
  async delete(key:string){try{await unlink(objectPath(key));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}},
  async get(key:string,options?:{range:Headers}){
    const file=objectPath(key);let info;try{info=await stat(file);}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw e;}
    const rangeHeader=options?.range?.get("range"),range=rangeHeader?byteRange(rangeHeader,info.size):undefined;
    // Open the stream lazily. Analysis reads arrayBuffer; video playback streams a byte range.
    return {size:info.size,range,get body(){return Readable.toWeb(createReadStream(file,range?{start:range.offset,end:range.offset+range.length-1}:{})) as ReadableStream<Uint8Array>;},async arrayBuffer(){const bytes=await readFile(file);const selected=range?bytes.subarray(range.offset,range.offset+range.length):bytes;return Uint8Array.from(selected).buffer;}};
  }
};
export function closeLocalDatabases(){for(const db of databases.values())db.close();databases.clear();}
