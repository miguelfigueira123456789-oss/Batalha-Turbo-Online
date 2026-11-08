'use strict';
/* BATALHA TURBO | servidor HTTP + WebSocket, sem dependências externas.
   As partidas vivem em memória. Para jogos com amigos na Internet,
   publicar este projecto num servidor Node com HTTPS (ex.: Render).
*/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const W = 1100, H = 700, MAX_MEMBERS = 6, MATCH_TIME = 120;
const OBSTACLES = [
  {x:232,y:132,w:104,h:150}, {x:764,y:132,w:104,h:150},
  {x:232,y:418,w:104,h:150}, {x:764,y:418,w:104,h:150},
  {x:503,y:303,w:94,h:94}
];
const HEROES = {
  faisca: {label:'FAÍSCA', maxHp:112, speed:253, damage:17, delay:.31, bulletSpeed:715, life:.98, radius:24},
  tita: {label:'TITÃ', maxHp:175, speed:185, damage:12, delay:.65, bulletSpeed:570, life:.76, radius:29},
  nebula: {label:'NÉBULA', maxHp:96, speed:229, damage:34, delay:.88, bulletSpeed:900, life:1.05, radius:23},
  sombra: {label:'SOMBRA', maxHp:105, speed:269, damage:22, delay:.47, bulletSpeed:780, life:1.0, radius:23},
  ranger: {label:'RANGER', maxHp:136, speed:225, damage:20, delay:.37, bulletSpeed:840, life:1.0, radius:25},
  vega: {label:'VEGA', maxHp:118, speed:225, damage:23, delay:.46, bulletSpeed:780, life:1.05, radius:24},
  bruto: {label:'BRUTO', maxHp:185, speed:185, damage:15, delay:.58, bulletSpeed:650, life:.84, radius:29}
};
const WEAPONS={
 smg:{label:'SMG',damage:11,delay:.15,bulletSpeed:830,life:.60,count:1,spread:.05},
 assalto:{label:'ASSALTO',damage:19,delay:.30,bulletSpeed:920,life:1.05,count:1,spread:.02},
 cacadeira:{label:'CAÇADEIRA',damage:11,delay:.74,bulletSpeed:725,life:.42,count:5,spread:.21},
 precisao:{label:'PRECISÃO',damage:47,delay:1.05,bulletSpeed:1200,life:1.10,count:1,spread:0},
 plasma:{label:'PLASMA',damage:27,delay:.43,bulletSpeed:750,life:1.0,count:1,spread:.01},
 granadas:{label:'GRANADAS',damage:36,delay:1.05,bulletSpeed:560,life:.78,count:1,spread:.01}
};
const cleanWeapon=w=>WEAPONS[w]?w:'assalto';
const rooms = new Map();
const clients = new Map();
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const len = (x,y)=>Math.hypot(x,y);
const randomCode = ()=>crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();
const safeName = name => String(name || 'Jogador').replace(/[<>\\]/g,'').trim().slice(0,16) || 'Jogador';
const cleanHero = hero => HEROES[hero] ? hero : 'faisca';
const now = ()=>Date.now()/1000;

function wsFrame(opcode, data=Buffer.alloc(0)) {
  const b = Buffer.isBuffer(data)?data:Buffer.from(String(data));
  const head = b.length < 126 ? Buffer.from([0x80|opcode,b.length]) : Buffer.from([0x80|opcode,126,b.length>>8,b.length&255]);
  return Buffer.concat([head,b]);
}
function safeSend(client, object) {
  if (!client || client.dead || client.socket.destroyed) return;
  if (client.socket.writableLength > 256*1024) return;
  try { client.socket.write(wsFrame(1,JSON.stringify(object))); } catch(e) { dropClient(client); }
}
function broadcast(room, object) { for(const member of room.members.values()) safeSend(member.client,object); }
function error(client,msg) { safeSend(client,{type:'error',message:msg}); }
function sendRoom(room) {
  broadcast(room,{type:'room',code:room.code,hostId:room.hostId,status:room.status,
    members:[...room.members.values()].map(m=>({id:m.id,name:m.name,hero:m.hero,weapon:m.weapon})),
    seconds:Math.ceil(room.remaining ?? MATCH_TIME)});
}
function dropClient(client) {
  if(client.dead) return;
  client.dead=true;
  try {client.socket.destroy();}catch(e){}
  clients.delete(client.id);
  leaveRoom(client);
}
function leaveRoom(client) {
  if (!client.room) return;
  const room=rooms.get(client.room); client.room=null;
  if (!room) return;
  room.members.delete(client.id);
  room.players.delete(client.id);
  if(room.members.size===0) { rooms.delete(room.code); return; }
  if(room.hostId===client.id) room.hostId=room.members.keys().next().value;
  sendRoom(room);
}
function joinRoom(client, code, name, hero, weapon) {
  if (client.room) leaveRoom(client);
  const room=rooms.get(String(code||'').trim().toUpperCase());
  if (!room) return error(client,'Essa sala não existe. Confirma o código.');
  if (room.status==='playing') return error(client,'A partida já começou. Pede aos amigos para acabarem a ronda.');
  if (room.members.size >= MAX_MEMBERS) return error(client,'A sala está cheia (máximo 6 amigos).');
  const member={id:client.id,name:safeName(name),hero:cleanHero(hero),weapon:cleanWeapon(weapon),client};
  room.members.set(client.id,member); client.room=room.code;
  safeSend(client,{type:'joined',id:client.id,code:room.code}); sendRoom(room);
}
function createRoom(client, name, hero, weapon, solo=false) {
  if(client.room) leaveRoom(client);
  let code=randomCode(); while(rooms.has(code)) code=randomCode();
  const room={code,hostId:client.id,status:'lobby',members:new Map(),players:new Map(),bullets:[],effects:[],remaining:MATCH_TIME,solo};
  rooms.set(code,room);
  joinRoom(client,code,name,hero,weapon);
  if(solo) startMatch(room);
}
function nearest(p,room, max=Infinity) {
  let best=null, distance=max;
  for(const q of room.players.values()) {
    if(q.id===p.id || q.hp<=0) continue;
    const d=len(q.x-p.x,q.y-p.y);
    if(d < distance) {best=q;distance=d;}
  }
  return best;
}
function blocked(x,y,r) {
  if(x<r+12 || x>W-r-12 || y<r+12 || y>H-r-12) return true;
  for(const o of OBSTACLES) {
    const cx=clamp(x,o.x,o.x+o.w),cy=clamp(y,o.y,o.y+o.h);
    if((x-cx)**2+(y-cy)**2 < (r+1)**2) return true;
  }
  return false;
}
function spawnPos(index) {
  const pts=[[90,93],[1009,605],[1005,92],[96,601],[546,92],[554,609]];
  const [x,y]=pts[index%pts.length]; return {x:x+(Math.random()-.5)*26,y:y+(Math.random()-.5)*26};
}
function makePlayer(id,name,hero,weapon,bot,index) {
  hero=cleanHero(hero);
  const pos=spawnPos(index), stats=HEROES[hero];
  return {id,name,hero,weapon:cleanWeapon(weapon),bot,guard:false,guardEnergy:100,x:pos.x,y:pos.y,dir:0,hp:stats.maxHp,maxHp:stats.maxHp,
    kills:0,deaths:0,charge:0,shield:0,invuln:1.5,deadFor:0,fireWait:0,
    inp:{x:0,y:0,shoot:false,super:false,guard:false,aim:null},aiClock:0,aiSide:Math.random()<.5?-1:1};
}
function startMatch(room) {
  if(room.status==='playing' || room.members.size===0) return;
  room.status='playing';room.remaining=MATCH_TIME;
  room.players.clear();room.bullets=[];room.effects=[];
  let i=0;
  for(const m of room.members.values())room.players.set(m.id,makePlayer(m.id,m.name,m.hero,m.weapon,false,i++));
  const botCount=Math.max(0,4-room.members.size);
  const choices=Object.keys(HEROES);
  const names=['Bolt','Kira','Max','Zeta'];
  for(let j=0;j<botCount;j++) {
    const id='bot'+j;
    room.players.set(id,makePlayer(id,names[j],choices[(j+1)%7],Object.keys(WEAPONS)[j%6],true,i++));
  }
  broadcast(room,{type:'started'});sendRoom(room);
}
function doDamage(room,target,from,amount) {
  if(target.hp<=0 || target.invuln>0) return;
  if(target.shield>0 || target.guard) amount*=.30;
  target.hp=Math.max(0,target.hp-amount);
  if(from && from.id!==target.id && from.hp>0) from.charge=clamp(from.charge+24,0,100);
  room.effects.push({type:'hit',x:target.x,y:target.y,ttl:.36,hero:target.hero});
  if(target.hp<=0) {
    target.deadFor=2.8;target.deaths++;
    if(from && from.id!==target.id){from.kills++;from.charge=clamp(from.charge+30,0,100);}
    room.effects.push({type:'boom',x:target.x,y:target.y,ttl:.65,hero:target.hero});
  }
}
function shoot(room,p,angle,heavy=false) {
  if(p.hp<=0)return;
  const weapon=WEAPONS[p.weapon]||WEAPONS.assalto;
  p.fireWait=heavy?.65:weapon.delay;
  const count=heavy?6:weapon.count,spread=heavy?.13:weapon.spread;
  for(let i=0;i<count;i++) {
    const a=angle+(i-(count-1)/2)*spread;
    const speed=heavy?920:weapon.bulletSpeed;
    room.bullets.push({id:crypto.randomBytes(3).toString('hex'),owner:p.id,hero:p.hero,weapon:p.weapon,
      x:p.x+Math.cos(a)*(HEROES[p.hero].radius+10),y:p.y+Math.sin(a)*(HEROES[p.hero].radius+10),
      vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
      damage:heavy?24:weapon.damage,ttl:heavy?.80:weapon.life,r:heavy?9:p.weapon==='granadas'?11:7});
  }
  if(room.bullets.length>270)room.bullets.splice(0,room.bullets.length-270);
}
function doSuper(room,p) {
  if(p.hp<=0 || p.charge<100) return;
  p.charge=0;
  if(p.hero==='faisca') {
    for(const other of room.players.values())if(other.id!==p.id && other.hp>0 && len(p.x-other.x,p.y-other.y)<150)doDamage(room,other,p,48);
    p.invuln=Math.max(p.invuln,.6);
    room.effects.push({type:'pulse',x:p.x,y:p.y,ttl:.6,hero:p.hero});
  }else if(p.hero==='tita'){
    p.hp=clamp(p.hp+75,0,p.maxHp);p.shield=3.8;
    room.effects.push({type:'heal',x:p.x,y:p.y,ttl:.65,hero:p.hero});
  }else{
    const target=nearest(p,room); const angle=target?Math.atan2(target.y-p.y,target.x-p.x):p.dir;
    shoot(room,p,angle,true);
    room.effects.push({type:'pulse',x:p.x,y:p.y,ttl:.4,hero:p.hero});
  }
}
function updatePlayer(room,p,dt) {
  p.shield=Math.max(0,p.shield-dt);p.invuln=Math.max(0,p.invuln-dt);
  p.fireWait=Math.max(0,p.fireWait-dt);
  if(p.inp.guard && p.guardEnergy>0 && p.hp>0){p.guard=true;p.guardEnergy=Math.max(0,p.guardEnergy-dt*29);}
  else {p.guard=false;p.guardEnergy=Math.min(100,p.guardEnergy+dt*17);}
  if(p.hp<=0) {
    p.deadFor-=dt;
    if(p.deadFor<=0) {
      const arr=[...room.players.values()]; const pos=spawnPos(arr.indexOf(p));
      p.x=pos.x;p.y=pos.y;p.hp=p.maxHp;p.invuln=1.4;p.charge=Math.min(100,p.charge+20);
    }
    return;
  }
  if(p.bot) {
    const target=nearest(p,room);
    p.aiClock-=dt;
    if(p.aiClock<=0){p.aiClock=1+Math.random()*1.7;p.aiSide=Math.random()<.5?-1:1;}
    if(target) {
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.max(1,len(dx,dy));
      const forward=d>265?1:d<155?-.68:0;
      const strafe=d<400?.63*p.aiSide:0;
      p.inp.x=dx/d*forward-dy/d*strafe;
      p.inp.y=dy/d*forward+dx/d*strafe;
      p.dir=Math.atan2(dy,dx);
      p.inp.shoot=d<800; p.inp.guard=(p.hp<p.maxHp*.35 && d<180);
      p.inp.super=p.charge>=100 && (d<145 || (p.hero==='nebula' && d<650) || p.hp<p.maxHp*.48);
    }
  }
  const stats=HEROES[p.hero];
  let dx=clamp(Number(p.inp.x)||0,-1,1),dy=clamp(Number(p.inp.y)||0,-1,1);
  const mag=len(dx,dy);if(mag>1){dx/=mag;dy/=mag;}
  if(mag>.05 && !p.bot && !Number.isFinite(p.inp.aim)) p.dir=Math.atan2(dy,dx);
  if(Number.isFinite(p.inp.aim))p.dir=p.inp.aim;
  const speed=stats.speed*dt;
  if(!blocked(p.x+dx*speed,p.y,stats.radius))p.x+=dx*speed;
  else if(p.bot) p.aiSide*=-1;
  if(!blocked(p.x,p.y+dy*speed,stats.radius))p.y+=dy*speed;
  if(p.inp.shoot && p.fireWait<=0) {
    const target=nearest(p,room,930);
    let angle=Number.isFinite(p.inp.aim)?p.inp.aim:target?Math.atan2(target.y-p.y,target.x-p.x):p.dir;
    if(target || !p.bot){p.dir=angle;shoot(room,p,angle);}
  }
  if(p.inp.super) {
    doSuper(room,p);p.inp.super=false;
  }
}
function updateRoom(room,dt){
  if(room.status!=='playing')return;
  room.remaining=Math.max(0,room.remaining-dt);
  for(const p of room.players.values())updatePlayer(room,p,dt);
  for(let i=room.bullets.length-1;i>=0;i--) {
    const b=room.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.ttl-=dt;
    let remove=b.ttl<=0||blocked(b.x,b.y,b.r);
    if(!remove)for(const p of room.players.values()){
      if(p.id===b.owner||p.hp<=0)continue;
      const r=HEROES[p.hero].radius+b.r;
      if((p.x-b.x)**2+(p.y-b.y)**2<=r*r) {
        doDamage(room,p,room.players.get(b.owner),b.damage);remove=true;break;
      }
    }
    if(remove)room.bullets.splice(i,1);
  }
  room.effects=room.effects.filter(e=>(e.ttl-=dt)>0);
  if(room.remaining<=0){
    room.status='ended';
    const board=[...room.players.values()].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)
      .map(p=>({id:p.id,name:p.name,kills:p.kills,deaths:p.deaths,hero:p.hero,bot:p.bot}));
    broadcast(room,{type:'ended',board});sendRoom(room);
  }
}
function snapshot(room){
  return {type:'state',time:Math.ceil(room.remaining),
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,hero:p.hero,weapon:p.weapon,bot:p.bot,guard:p.guard,guardEnergy:Math.round(p.guardEnergy),x:Math.round(p.x),y:Math.round(p.y),
      dir:Math.round(p.dir*100)/100,hp:Math.ceil(p.hp),maxHp:p.maxHp,kills:p.kills,deaths:p.deaths,
      charge:Math.round(p.charge),shield:p.shield>0,invuln:p.invuln>0})),
    bullets:room.bullets.map(b=>({x:Math.round(b.x),y:Math.round(b.y),hero:b.hero,weapon:b.weapon,r:b.r})),
    effects:room.effects.map(e=>({type:e.type,x:Math.round(e.x),y:Math.round(e.y),ttl:e.ttl,hero:e.hero}))};
}
function processMessage(client,msg){
  if(!msg || typeof msg!=='object')return;
  if(msg.type==='create')return createRoom(client,msg.name,msg.hero,msg.weapon,false);
  if(msg.type==='solo')return createRoom(client,msg.name,msg.hero,msg.weapon,true);
  if(msg.type==='join')return joinRoom(client,msg.code,msg.name,msg.hero,msg.weapon);
  if(msg.type==='leave') {leaveRoom(client);return safeSend(client,{type:'left'});}
  if(!client.room)return;
  const room=rooms.get(client.room);if(!room)return;
  if(msg.type==='start' && room.hostId===client.id && room.status!=='playing')return startMatch(room);
  if(msg.type==='hero' && room.status==='lobby') {
    const m=room.members.get(client.id);if(m){m.hero=cleanHero(msg.hero);sendRoom(room);}return;
  }
  if(msg.type==='weapon' && room.status==='lobby'){const m=room.members.get(client.id);if(m){m.weapon=cleanWeapon(msg.weapon);sendRoom(room);}return;}
  if(msg.type==='input' && room.status==='playing'){
    const p=room.players.get(client.id);
    if(p) p.inp={x:clamp(Number(msg.x)||0,-1,1),y:clamp(Number(msg.y)||0,-1,1),shoot:msg.shoot===true,super:msg.super===true||p.inp.super,guard:msg.guard===true,aim:Number.isFinite(Number(msg.aim)) && msg.aim!==null ? clamp(Number(msg.aim),-6.3,6.3):null};
  }
  if(msg.type==='emote'){
    const emotes=['👍','🔥','😂','⚡','👋'];
    if(emotes.includes(msg.value) && (!client.lastEmote || Date.now()-client.lastEmote>1800)){
      client.lastEmote=Date.now();broadcast(room,{type:'emote',id:client.id,value:msg.value});
    }
  }
}
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  if(url.pathname==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,version:'3d-v4',rooms:rooms.size,players:clients.size}));return;
  }
  const allowed=new Set(['/','/index.html','/style.css','/game.js','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/sw.js']);
  const pathname=url.pathname==='/'?'/index.html':url.pathname;
  if(!allowed.has(pathname)){res.writeHead(404);res.end('Not found');return;}
  const file=path.join(ROOT,pathname);
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'text/plain',
      'Cache-Control':pathname==='/index.html'?'no-cache':'public, max-age=3600',
      'X-Content-Type-Options':'nosniff'});
    res.end(data);
  });
});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ws' || req.headers.upgrade?.toLowerCase()!=='websocket') return socket.destroy();
  const key=req.headers['sec-websocket-key'];
  if(typeof key!=='string'||!/^[-a-zA-Z0-9+/]{22}==$/.test(key))return socket.destroy();
  if(clients.size>350)return socket.destroy();
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);
  const client={id:crypto.randomBytes(8).toString('hex'),socket,room:null,dead:false,buffer:Buffer.alloc(0),fragment:[],fragmentLength:0};
  clients.set(client.id,client);
  safeSend(client,{type:'hello',id:client.id,version:1});
  const handleData=chunk=>{
    if(client.dead)return;
    client.buffer=Buffer.concat([client.buffer,chunk]);
    if(client.buffer.length>128*1024)return dropClient(client);
    for(;;){
      const b=client.buffer;if(b.length<2)break;
      const fin=!!(b[0]&0x80),op=b[0]&0x0f,masked=!!(b[1]&0x80);
      if(!masked)return dropClient(client);
      let length=b[1]&0x7f,offset=2;
      if(length===126){if(b.length<4)break;length=b.readUInt16BE(2);offset=4;}
      if(length===127){if(b.length<10)break;const big=b.readBigUInt64BE(2);if(big>16384n)return dropClient(client);length=Number(big);offset=10;}
      if(length>16384)return dropClient(client);
      if(b.length<offset+4+length)break;
      const mask=b.subarray(offset,offset+4),payload=Buffer.from(b.subarray(offset+4,offset+4+length));
      client.buffer=b.subarray(offset+4+length);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      if(op===8){dropClient(client);return;}
      if(op===9){try{socket.write(wsFrame(10,payload));}catch(e){dropClient(client);}continue;}
      if(op===10)continue;
      if(op===1||op===0){
        if(op===1 && client.fragment.length){dropClient(client);return;}
        if(op===0 && !client.fragment.length){dropClient(client);return;}
        client.fragment.push(payload);client.fragmentLength+=payload.length;
        if(client.fragmentLength>16384)return dropClient(client);
        if(fin){
          let msg;
          try{msg=JSON.parse(Buffer.concat(client.fragment).toString('utf8'));}catch(e){msg=null;}
          client.fragment=[];client.fragmentLength=0;
          if(msg){try{processMessage(client,msg);}catch(e){console.warn('Mensagem inválida:',e.message);}}
        }
      }else{dropClient(client);return;}
    }
  };
  socket.on('data',handleData);socket.on('error',()=>dropClient(client));socket.on('close',()=>dropClient(client));
  if(head.length)handleData(head);
});
let previous=now(),sendTimer=0;
const loop=setInterval(()=>{
  const t=now(),dt=clamp(t-previous,.001,.06);previous=t;
  for(const room of rooms.values())updateRoom(room,dt);
  sendTimer+=dt;
  if(sendTimer>=1/20){sendTimer=0;for(const room of rooms.values())if(room.status==='playing')broadcast(room,snapshot(room));}
},1000/30);
loop.unref?.();
server.listen(PORT,'0.0.0.0',()=>console.log('🎮 Batalha Turbo online em http://localhost:'+PORT));
module.exports={server,rooms,clients,processMessage,updateRoom,blocked,HEROES,WEAPONS};
