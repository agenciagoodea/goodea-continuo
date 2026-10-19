export function localRequestAllowed(headers:Pick<Headers,"get">){
  const host=headers.get("host");if(!host)return false;
  let url:URL;try{url=new URL(`http://${host}`);}catch{return false;}
  if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)return false;
  if(headers.get("sec-fetch-site")==="cross-site")return false;
  const origin=headers.get("origin");
  if(origin){try{const source=new URL(origin);if(!["http:","https:"].includes(source.protocol)||source.host!==url.host||source.username||source.password)return false;}catch{return false;}}
  return true;
}
