// A sign-in page or a gateway error can be HTML even when a fetch resolves.
// Never turn that response into an opaque JSON syntax error or retry a paid call.
export async function readJsonResponse(response:Response):Promise<any>{
  const body=await response.text();
  try{
    const data=JSON.parse(body);
    if(data&&typeof data==="object"&&!Array.isArray(data))return data;
  }catch{}
  if(response.status===401||response.status===403||/\/signin-with-chatgpt(?:[/?]|$)/.test(response.url))throw new Error("Acesso local recusado. Abra o Contínuo em http://127.0.0.1:3000 no próprio computador.");
  if(response.status===413)throw new Error("O envio excedeu o limite do servidor. Reduza o tamanho dos arquivos; os campos preenchidos continuam nesta ficha.");
  if(response.status===429)throw new Error("O serviço recebeu muitas solicitações. Aguarde e consulte as leituras salvas antes de analisar novamente.");
  if(response.status>=500)throw new Error(`O servidor retornou uma página de erro (HTTP ${response.status}). Os campos continuam nesta ficha. Atualize as leituras salvas antes de iniciar outra análise.`);
  throw new Error("O serviço retornou uma página HTML ou uma resposta inválida em vez de dados. Os campos continuam nesta ficha. Verifique a sessão e atualize as leituras salvas antes de analisar novamente.");
}
