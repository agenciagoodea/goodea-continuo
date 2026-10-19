# Contínuo — Goodea Studio

Versão para usar no próprio computador. Biblioteca de personagens e ambientes, análise automática de fichas, roteiro, cenas de 10 segundos, geração pelo Google Flow via useapi.net, continuidade por frame, revisão e montagem.

O perfil de vídeo permanece fixo: **Omni Flash · 10s · 720p**, com escolha entre **16:9** (1280×720) e **9:16** (720×1280).

## Instalar no Windows

1. Instale o **Node.js 24 LTS ou superior** pelo site https://nodejs.org/.
2. Baixe o código pelo GitHub em **Code → Download ZIP** e extraia para uma pasta, por exemplo `C:\Goodea\continuo`. Também pode usar `git clone` com o endereço do repositório.
3. Abra `instalar.cmd` e aguarde a instalação e a compilação. É necessária internet para baixar os componentes.
4. Quando concluir, abra `iniciar.cmd`.
5. No navegador, entre em **http://127.0.0.1:3000**.
6. Mantenha a janela do servidor aberta enquanto usar o sistema. Para encerrar, pressione Ctrl+C.

A instalação cria `.env.local` a partir do exemplo e prepara a pasta `data` sem apagar dados existentes. Nos próximos usos, basta abrir `iniciar.cmd`. Se atualizar o código pelo GitHub, execute `instalar.cmd` novamente para recompilar.

## Instalar pelo terminal, macOS ou Linux

Na pasta do projeto, com Node.js 24 ou superior:

```sh
npm ci
npm run setup
npm run build
npm start
```

Depois, abra http://127.0.0.1:3000. Para desenvolvimento, use `npm run dev`.

## Conectar o Google Flow

1. Abra **Integrações → Google Flow via useapi.net**.
2. Informe seu API token da useapi.net. Ele é diferente da chave Gemini.
3. Use **Abrir login guiado**. No site do fornecedor, abra **Automated setup → Open automated setup**, informe o token e faça o login Google no navegador remoto fornecido por ele.
4. Volte ao Contínuo, clique em **Atualizar contas**, escolha a conta e clique em **Verificar e usar esta conta**.
5. No Estúdio, clique em **Gerar no Google Flow**, ou ative a produção sequencial. A sequência pausa em cada revisão e precisa da aba aberta.

A useapi.net é um fornecedor independente, com assinatura própria, que mantém uma sessão autenticada da sua conta Google. Os clipes consomem seus créditos Flow. O fornecedor recomenda conta dedicada e informa que abrir o mesmo login diretamente no Flow pode invalidar a sessão da integração. O Contínuo não solicita senha, código de verificação ou cookies Google.

As vozes disponíveis na conta vinculada aparecem nas fichas dos personagens. Na abertura ou em cortes, podem ser enviados até 7 imagens oficiais e até 5 referências de voz. **Na continuação direta, a API aceita somente o último frame aprovado como imagem inicial**, sem referências adicionais de imagem ou voz; as regras das fichas permanecem no texto. Use as faixas oficiais na montagem para uniformizar as vozes do episódio.

O sistema reserva cada envio antes da geração e guarda o job para consulta. Consultar, recuperar o job ou baixar novamente não envia outro pedido de geração. Falhas interrompem a sequência. Não existe troca automática para outro modelo ou para outra modalidade de cobrança.

## Analisar as fichas dos personagens

A análise usa a **Gemini API**, separadamente da useapi.net e dos créditos Flow. Em Integrações, informe a chave Gemini; depois abra a Biblioteca oficial e envie a imagem. A leitura automática preenche um rascunho para conferência e aprovação.

Há contagem de tokens de entrada antes da análise e consumo informado pelo Google após ela. O custo mostrado é estimado. Leituras concluídas podem ser recuperadas sem gerar novamente. Salvar uma ficha não executa outra análise.

## Chaves e configuração

Você pode informar as chaves pela interface, onde ficam somente na memória da aba, ou preencher o arquivo `.env.local` no seu computador:

```dotenv
GEMINI_API_KEY=sua_chave_gemini
USEAPI_TOKEN=seu_token_useapi
CONTINUO_DATA_DIR=
```

Campos vazios são permitidos. Para produção assistida e cadastro manual, não é preciso informar as chaves. Reinicie o servidor depois de alterar `.env.local`.

`.env.local`, banco, uploads e backups ficam fora do Git. As chamadas de geração e análise continuam dependendo de internet, acesso aos modelos e saldo nos respectivos fornecedores.

## Onde ficam os dados

- `data/continuo.sqlite`: projetos, roteiros, fichas, revisões e histórico.
- `data/media/`: imagens, vídeos, áudios e documentos enviados ou recebidos.

As tabelas são criadas automaticamente. Para fazer backup, **encerre o sistema e copie a pasta `data` completa** para um local seguro, junto com `.env.local` se quiser preservar a configuração. Para restaurar, com o sistema encerrado, recoloque a pasta e inicie novamente.

Esta versão começa com a biblioteca de exemplo em texto; os cadastros e arquivos privados já enviados à versão hospedada não estão neste repositório. O código e as funções são mantidos, mas cada instalação tem seus próprios dados. Nunca coloque dados privados ou chaves no GitHub. Se personalizar `CONTINUO_DATA_DIR`, prefira uma pasta fora do repositório.

## Montagem do episódio

Depois de aprovar as cenas, abra **Áudio e montagem**. É possível usar música contínua, faixa mestre de vozes/narração e substituição de áudio por cena.

A prévia do navegador exporta em tempo real com a aba aberta. Para o **MP4 completo**, instale Python 3 e FFmpeg, exporte e extraia o pacote de produção e execute o arquivo `render_mp4.py` que acompanha o pacote. O montador confere as tomadas aprovadas de 10s e 720p antes de unir.

## Verificação e manutenção

```sh
npm test
npm run typecheck
npm run build
npm run test:local
```

`test:local` usa uma pasta temporária e um servidor de teste na interface de loopback para verificar página, banco, upload, ficha, reprodução parcial e persistência após reiniciar. Não usa seus dados nem faz chamadas pagas. Os testes dos provedores usam respostas simuladas; geração real exige conectar sua conta.

O servidor é destinado a uso individual no próprio computador e inicia somente em `127.0.0.1`. Não requer login do ChatGPT nem conta Cloudflare para abrir. Hospedar para outras pessoas exige acrescentar autenticação e uma configuração de servidor apropriada.

Se a porta 3000 estiver ocupada, encerre outro programa que esteja usando essa porta e abra `iniciar.cmd` novamente. O processo pode ser identificado no Gerenciador de Tarefas do Windows; não apague a pasta `data` para resolver problema de porta.

## Origem e documentação

Exportado da versão Contínuo publicada em 16/10/2026, fonte `3f1f8f5f7cd3b07e3b7b437026a14192801a054c`. A distribuição local substitui os serviços de hospedagem por SQLite e arquivos locais, preservando o estúdio e as integrações.

- https://useapi.net/docs/api-google-flow-v1
- https://useapi.net/docs/start-here/setup-google-flow
- https://useapi.net/docs/api-google-flow-v1/post-google-flow-videos
- https://ai.google.dev/gemini-api/docs/omni
- https://ai.google.dev/gemini-api/docs/api-key
