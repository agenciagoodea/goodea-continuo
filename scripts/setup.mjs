import './check-node.mjs';
import {existsSync,copyFileSync,mkdirSync} from 'node:fs';
if(!existsSync('.env.local'))copyFileSync('.env.example','.env.local');
mkdirSync('data',{recursive:true});
console.log('Configuração local pronta. Opcional: informe as chaves em .env.local ou pela interface.');
