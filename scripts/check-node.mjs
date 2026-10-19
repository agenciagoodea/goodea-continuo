const major=Number(process.versions.node.split('.')[0]);
if(major<24){console.error('Instale o Node.js 24 LTS ou superior: https://nodejs.org/');process.exit(1);}
