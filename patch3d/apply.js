'use strict';
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
for(const file of ['server.js','public/index.html','public/style.css','public/game.js']){
 const name=file.split('/').at(-1);
 const source=path.join(__dirname,name);
 const dest=path.join(base,file);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(source,dest);
}
const manifestPath=path.join(base,'public/manifest.webmanifest');
if(fs.existsSync(manifestPath)){
 const data=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 data.name='Batalha Turbo 3D Online';data.short_name='Batalha 3D';data.description='Arena 3D online para jogar com amigos no Android';
 data.theme_color='#0b1020';data.background_color='#0b1020';
 fs.writeFileSync(manifestPath,JSON.stringify(data,null,2));
}
const sw=`const CACHE='batalha-turbo-3d-v4';
self.addEventListener('install',e=>{e.waitUntil(self.skipWaiting());});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname==='/ws'||u.pathname==='/health')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});`;
fs.writeFileSync(path.join(base,'public/sw.js'),sw);
console.log('Batalha Turbo 3D: motor WebGL e servidor multijogador prontos');
