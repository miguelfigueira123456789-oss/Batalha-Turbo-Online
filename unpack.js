'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const source=fs.readFileSync(path.join(__dirname,'batalha_payload.txt'),'utf8').replace(/\s+/g,'');
const files=JSON.parse(zlib.inflateSync(Buffer.from(source,'base64')).toString('utf8'));
for(const [name,data] of Object.entries(files)){
 if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error('Caminho inválido');
 const dest=path.join(__dirname,name);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,Buffer.from(data,'base64'));
}
console.log('Batalha Turbo: extraídos '+Object.keys(files).length+' ficheiros');
require('./patch3d/apply.js');
