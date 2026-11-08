'use strict';
(()=>{
const $=id=>document.getElementById(id);
const heroInfo={
 faisca:{label:'FAÍSCA',title:'Batedora veloz',color:'#e9af40',rgb:[.91,.55,.19],head:'⚡'},
 tita:{label:'TITÃ',title:'Blindado pesado',color:'#3bc9ac',rgb:[.16,.67,.56],head:'🛡'},
 nebula:{label:'NÉBULA',title:'Atiradora de elite',color:'#ba83d6',rgb:[.58,.37,.80],head:'✧'},
 sombra:{label:'SOMBRA',title:'Agente furtiva',color:'#8e9ba8',rgb:[.37,.45,.54],head:'◈'},
 ranger:{label:'RANGER',title:'Soldado de assalto',color:'#4da7e6',rgb:[.20,.48,.68],head:'✚'},
 vega:{label:'VEGA',title:'Especialista tecnológica',color:'#da8a69',rgb:[.71,.36,.22],head:'✺'},
 bruto:{label:'BRUTO',title:'Demolidor blindado',color:'#63ab67',rgb:[.24,.52,.27],head:'✦'}
};
const weaponInfo={smg:{label:'SMG',desc:'Rápida',icon:'▰'},assalto:{label:'ASSALTO',desc:'Versátil',icon:'⚔'},cacadeira:{label:'CAÇADEIRA',desc:'Curta distância',icon:'◈'},precisao:{label:'PRECISÃO',desc:'Longo alcance',icon:'⌁'},plasma:{label:'PLASMA',desc:'Energia',icon:'✷'},granadas:{label:'GRANADAS',desc:'Explosiva',icon:'✹'}};
const OBS=[{x:232,y:132,w:104,h:150},{x:764,y:132,w:104,h:150},{x:232,y:418,w:104,h:150},{x:764,y:418,w:104,h:150},{x:503,y:303,w:94,h:94}];
const WORLD_SCALE=.06, wx=x=>(x-550)*WORLD_SCALE,wz=y=>(y-350)*WORLD_SCALE;
const screens=['menu','lobby','game','end'];
let socket=null,meId=null,room=null,gameState=null,screen='menu',hero='ranger',weapon='assalto',firing=false,guard=false,superQueued=false,move={x:0,y:0},stickPointer=null,aimAngle=null,keys=new Set(),connected=false,toastTimeout=null,reconnectTimer=0,frameTime=performance.now();
const visuals=new Map();
const nickname=$('nameInput');try{nickname.value=localStorage.getItem('batalha3d_name')||'Campeão';}catch{}
const invited=new URLSearchParams(location.search).get('sala');if(invited)$('joinCode').value=invited.slice(0,6).toUpperCase().replace(/[^A-Z0-9]/g,'');
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.add('hidden'),3300)}
function show(s){screen=s;screens.forEach(n=>$(n).classList.toggle('hidden',n!==s));if(s==='game')resize();}
function name(){const n=(nickname.value||'Campeão').trim().slice(0,16)||'Campeão';try{localStorage.setItem('batalha3d_name',n)}catch{}return n;}
function send(obj){if(socket?.readyState===1){socket.send(JSON.stringify(obj));return true;}toast('Sem ligação ao servidor. A tentar reconectar…');return false;}
function connectionStatus(v){connected=v;$('onlinePill').classList.toggle('ok',v);$('connText').textContent=v?'ONLINE':'SEM LIGAÇÃO';}
function connect(){if(socket&&(socket.readyState===0||socket.readyState===1))return;clearTimeout(reconnectTimer);connectionStatus(false);
 try{socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
 socket.addEventListener('open',()=>{connectionStatus(true);});
 socket.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}
  if(m.type==='hello'){meId=m.id;return;}
  if(m.type==='error'){toast(m.message||'Ocorreu um erro');return;}
  if(m.type==='joined'){room={code:m.code,members:[],hostId:null,status:'lobby'};visuals.clear();show('lobby');return;}
  if(m.type==='room'){room=m;if(m.status==='lobby'){renderLobby();show('lobby')}else if(m.status==='playing'&&screen==='lobby')show('game');return;}
  if(m.type==='started'){gameState=null;visuals.clear();resetControls();show('game');return;}
  if(m.type==='state'){gameState=m;updateHud();return;}
  if(m.type==='ended'){renderResults(m.board||[]);show('end');return;}
  if(m.type==='left'){room=null;gameState=null;show('menu');return;}
 });
 socket.addEventListener('close',()=>{connectionStatus(false);if(screen!=='menu'){room=null;gameState=null;resetControls();show('menu');toast('Ligação perdida. Volta a entrar na sala.')}reconnectTimer=setTimeout(connect,2300);});
 socket.addEventListener('error',()=>{});
 }catch(e){reconnectTimer=setTimeout(connect,2300);}
}
function renderLobby(){if(!room)return;$('roomCode').textContent=room.code;$('memberCount').textContent=room.members.length+'/6';$('members').replaceChildren();for(const p of room.members){const div=document.createElement('div');div.className='member';const h=heroInfo[p.hero]||heroInfo.faisca;div.innerHTML=`<span>${h.head}</span>`;const label=document.createElement('span');label.textContent=p.name+(p.id===meId?' (tu)':'');div.appendChild(label);const badge=document.createElement('span');badge.textContent=p.id===room.hostId?'LÍDER':h.label;div.appendChild(badge);$('members').appendChild(div)}const isHost=room.hostId===meId;$('startBtn').classList.toggle('hidden',!isHost);$('waiting').classList.toggle('hidden',isHost)}
function renderResults(board){let winner=board[0];$('endTitle').textContent=winner?.id===meId?'VITÓRIA!':'BOM COMBATE!';$('endDesc').textContent='Vencedor: '+(winner?.name||'—');$('scoreboard').replaceChildren();board.forEach((p,i)=>{const d=document.createElement('div');d.className='score-row';const a=document.createElement('span');a.textContent=`${i+1}º ${p.name}${p.bot?' 🤖':''}`;const b=document.createElement('b');b.textContent=`${p.kills} eliminações`;d.append(a,b);$('scoreboard').appendChild(d)});$('rematchBtn').classList.toggle('hidden',room?.hostId!==meId)}
function invite(){return location.origin+'/?sala='+encodeURIComponent(room?.code||'')}
function leave(){send({type:'leave'});room=null;gameState=null;resetControls();show('menu');if(location.search)history.replaceState(null,'',location.pathname)}
Object.entries(heroInfo).forEach(([key,h])=>{const b=document.createElement('button');b.className='character-btn';b.dataset.hero=key;b.innerHTML=`<span class="portrait" style="--color:${h.color}">${h.head}</span><strong>${h.label}</strong><small>${h.title}</small>`;b.onclick=()=>{hero=key;refreshSelect();if(room?.status==='lobby')send({type:'hero',hero})};$('heroChoices').appendChild(b)});
Object.entries(weaponInfo).forEach(([key,w])=>{const b=document.createElement('button');b.className='weapon-btn';b.dataset.weapon=key;b.innerHTML=`<span>${w.icon}</span><strong>${w.label}</strong><small>${w.desc}</small>`;b.onclick=()=>{weapon=key;refreshSelect();if(room?.status==='lobby')send({type:'weapon',weapon})};$('weaponChoices').appendChild(b)});
function refreshSelect(){document.querySelectorAll('[data-hero]').forEach(b=>b.classList.toggle('selected',b.dataset.hero===hero));document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('selected',b.dataset.weapon===weapon));}refreshSelect();
$('createBtn').onclick=()=>send({type:'create',name:name(),hero,weapon});
$('soloBtn').onclick=()=>send({type:'solo',name:name(),hero,weapon});
$('joinBtn').onclick=()=>{const code=$('joinCode').value.trim().replace(/[^a-z0-9]/gi,'').toUpperCase();if(code.length!==6)return toast('Escreve os 6 caracteres do código');send({type:'join',code,name:name(),hero,weapon})};
$('joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click()});
$('startBtn').onclick=()=>send({type:'start'});$('leaveLobby').onclick=leave;$('exitBtn').onclick=()=>{if(confirm('Sair do combate?'))leave()};$('exitEnd').onclick=leave;$('rematchBtn').onclick=()=>send({type:'start'});
$('shareBtn').onclick=async()=>{const t=`Vem jogar Batalha Turbo 3D comigo! Código da sala: ${room.code}\n${invite()}`;if(navigator.share){try{await navigator.share({title:'Batalha Turbo 3D',text:t})}catch(e){if(e.name!=='AbortError')toast(room.code)}return}try{await navigator.clipboard.writeText(t);toast('Convite copiado!')}catch{toast('Código: '+room.code)}};
function updateHud(){if(!gameState)return;const p=gameState.players.find(x=>x.id===meId);if(!p)return;$('gameCode').textContent='SALA · '+(room?.code||'');$('time').textContent=Math.floor(gameState.time/60)+':'+String(gameState.time%60).padStart(2,'0');$('hudHero').textContent=(heroInfo[p.hero]?.label||'GUERREIRO');$('hpBar').style.width=Math.max(0,p.hp/p.maxHp*100)+'%';$('hpNumber').textContent=p.hp+' / '+p.maxHp;$('killCount').textContent=p.kills+' ELIMINAÇÕES';$('hudWeapon').textContent=weaponInfo[p.weapon]?.label||weaponInfo[weapon].label;$('superNumber').textContent=p.charge+'%';$('superBar').style.width=p.charge+'%';$('superBtn').classList.toggle('ready',p.charge>=100)}
// Touch and keyboard controls
const stick=$('joystick'),knob=$('joystickKnob');
function updateStick(e){const b=stick.getBoundingClientRect(),r=b.width*.31;let dx=(e.clientX-b.left-b.width/2)/r,dy=(e.clientY-b.top-b.height/2)/r;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}move.x=dx;move.y=dy;knob.style.transform=`translate(${dx*r}px,${dy*r}px)`}
stick.addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e)});
stick.addEventListener('pointermove',e=>{if(stickPointer===e.pointerId){e.preventDefault();updateStick(e)}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(stickPointer===e.pointerId){stickPointer=null;move={x:0,y:0};knob.style.transform=''}});
function bindHold(id,setValue){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();setValue(true);try{b.setPointerCapture(e.pointerId)}catch{}});['pointerup','pointercancel','lostpointercapture'].forEach(event=>b.addEventListener(event,()=>setValue(false)))}
bindHold('shootBtn',v=>firing=v);bindHold('guardBtn',v=>{guard=v;$('guardBtn').classList.toggle('active',v)});
$('superBtn').addEventListener('pointerdown',e=>{e.preventDefault();superQueued=true});
let draggingAim=null;const sceneCanvas=$('world3d');sceneCanvas.addEventListener('pointerdown',e=>{if(e.clientX<innerWidth*.45)return;draggingAim=e.pointerId;sceneCanvas.setPointerCapture(e.pointerId)});sceneCanvas.addEventListener('pointermove',e=>{if(e.pointerId!==draggingAim)return;const dx=e.clientX-innerWidth*.50,dy=e.clientY-innerHeight*.47;if(Math.hypot(dx,dy)>26)aimAngle=Math.atan2(dy,dx)});for(const evt of ['pointerup','pointercancel'])sceneCanvas.addEventListener(evt,e=>{if(draggingAim===e.pointerId){draggingAim=null;aimAngle=null}});
window.addEventListener('keydown',e=>{if(screen!=='game')return;let k=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown',' ','shift'].includes(k))e.preventDefault();keys.add(k);if(k==='e'||k==='shift')superQueued=true});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',resetControls);
function resetControls(){firing=false;guard=false;superQueued=false;stickPointer=null;move={x:0,y:0};knob.style.transform='';keys.clear();aimAngle=null;}
setInterval(()=>{if(screen!=='game'||socket?.readyState!==1)return;let kx=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),ky=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));socket.send(JSON.stringify({type:'input',x:kx||move.x,y:ky||move.y,shoot:firing||keys.has(' '),super:superQueued,guard:guard||keys.has('q'),aim:aimAngle}));superQueued=false},50);

// Dedicated WebGL 3D renderer; actual perspective projection, lighting and meshes.
const gl=sceneCanvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false})||sceneCanvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){$('loading3d').textContent='O dispositivo não suporta WebGL. Experimenta atualizar o Chrome.';$('loading3d').classList.remove('hidden');return;}
const vs=`attribute vec3 aPosition;attribute vec3 aNormal;uniform mat4 uModel;uniform mat4 uViewProjection;varying vec3 vNormal;varying vec3 vWorld;void main(){vec4 w=uModel*vec4(aPosition,1.);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);gl_Position=uViewProjection*w;}`;
const fs=`precision mediump float;varying vec3 vNormal;varying vec3 vWorld;uniform vec4 uColor;uniform vec3 uEye;uniform float uEmissive;void main(){vec3 n=normalize(vNormal);vec3 sun=normalize(vec3(-.5,.94,.38));float diffuse=max(.0,dot(n,sun));float fill=.48+.45*diffuse;float bounce=.10*max(0.,dot(n,normalize(vec3(.4,.2,-.8))));vec3 lit=uColor.rgb*(fill+bounce)+uColor.rgb*uEmissive;float fog=smoothstep(45.,100.,distance(vWorld,uEye));lit=mix(lit,vec3(.39,.58,.71),fog*.65);gl_FragColor=vec4(lit,uColor.a);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const attribPos=gl.getAttribLocation(program,'aPosition'),attribNorm=gl.getAttribLocation(program,'aNormal'),uModel=gl.getUniformLocation(program,'uModel'),uVP=gl.getUniformLocation(program,'uViewProjection'),uColor=gl.getUniformLocation(program,'uColor'),uEye=gl.getUniformLocation(program,'uEye'),uEmissive=gl.getUniformLocation(program,'uEmissive');
function matIdentity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function matMul(a,b){const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)m[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return m}
function mTranslate(x,y,z){const m=matIdentity();m[12]=x;m[13]=y;m[14]=z;return m}
function mScale(x,y,z){const m=matIdentity();m[0]=x;m[5]=y;m[10]=z;return m}
function mRotateY(a){const m=matIdentity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m}
function mRotateZ(a){const m=matIdentity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m}
function perspective(fovy,aspect,n,f){const p=new Float32Array(16),q=1/Math.tan(fovy/2);p[0]=q/aspect;p[5]=q;p[10]=(f+n)/(n-f);p[11]=-1;p[14]=2*f*n/(n-f);return p}
function norm(a){const n=Math.hypot(...a)||1;return a.map(x=>x/n)}
function lookAt(eye,target){const z=norm([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=norm([z[2],0,-z[0]]),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1])}
function vertex(out,x,y,z,nx,ny,nz){out.push(x,y,z,nx,ny,nz)}
function makeBox(){const out=[],faces=[[[1,0,0],[[1,-1,-1],[1,-1,1],[1,1,1],[1,1,-1]]], [[-1,0,0],[[-1,-1,1],[-1,-1,-1],[-1,1,-1],[-1,1,1]]], [[0,1,0],[[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]], [[0,-1,0],[[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]]], [[0,0,1],[[1,-1,1],[-1,-1,1],[-1,1,1],[1,1,1]]], [[0,0,-1],[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]]];for(const [n,v] of faces)for(const k of [0,1,2,0,2,3])vertex(out,...v[k],...n);return out}
function makeSphere(rings=10,segments=14){const out=[];function pt(i,j){let a=i/rings*Math.PI,b=j/segments*2*Math.PI;let x=Math.sin(a)*Math.cos(b),y=Math.cos(a),z=Math.sin(a)*Math.sin(b);return [x,y,z,x,y,z]}for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){let a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);out.push(...a,...b,...c,...a,...c,...d)}return out}
function makeCylinder(segments=14){const out=[];for(let j=0;j<segments;j++){const a=j/segments*Math.PI*2,b=(j+1)/segments*Math.PI*2,ax=Math.cos(a),az=Math.sin(a),bx=Math.cos(b),bz=Math.sin(b);let p=[ax,-1,az,ax,0,az],q=[bx,-1,bz,bx,0,bz],r=[bx,1,bz,bx,0,bz],s=[ax,1,az,ax,0,az];out.push(...p,...q,...r,...p,...r,...s);vertex(out,0,1,0,0,1,0);vertex(out,bx,1,bz,0,1,0);vertex(out,ax,1,az,0,1,0);vertex(out,0,-1,0,0,-1,0);vertex(out,ax,-1,az,0,-1,0);vertex(out,bx,-1,bz,0,-1,0)}return out}
function mesh(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return {buffer:b,count:data.length/6}}
const shapes={box:mesh(makeBox()),sphere:mesh(makeSphere()),cylinder:mesh(makeCylinder())};
const rgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const shades={metal:[.33,.40,.49],steel:[.19,.24,.34],dark:[.095,.16,.23],glow:[.32,.95,.99],yellow:[1,.72,.23],red:[1,.28,.16],ground:[.23,.32,.35],grass:[.17,.29,.27],brick:[.32,.35,.39],concrete:[.31,.38,.42],white:[.84,.92,.98]};
let viewProjection=matIdentity(),camera=[0,17,27],cameraTarget=[0,0,0],lastResize=0,labelsCtx=$('labelsCanvas').getContext('2d');
function draw(shape,x,y,z,sx,sy,sz,color,yaw=0,rZ=0,alpha=1,glow=0){const mesh=shapes[shape];let m=matMul(mTranslate(x,y,z),matMul(mRotateY(yaw),matMul(mRotateZ(rZ),mScale(sx,sy,sz))));gl.uniformMatrix4fv(uModel,false,m);gl.uniform4f(uColor,color[0],color[1],color[2],alpha);gl.uniform1f(uEmissive,glow);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(attribPos);gl.enableVertexAttribArray(attribNorm);gl.vertexAttribPointer(attribPos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attribNorm,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}
function drawPart(shape,base,dx,dy,dz,sx,sy,sz,color,yaw=0,rZ=0,alpha=1,glow=0){const c=Math.cos(base.yaw),s=Math.sin(base.yaw),x=base.x+dx*c+dz*s,z=base.z-dx*s+dz*c;draw(shape,x,dy,z,sx,sy,sz,color,base.yaw+yaw,rZ,alpha,glow)}
function floorScene(t){gl.clearColor(.47,.64,.73,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);draw('box',0,-.65,0,33.5,.95,21.5,shades.ground);draw('box',0,-.12,0,32.5,.04,20.5,shades.grass);
// Surface lanes and angular metal markings to emphasize the 3D perspective
for(let z=-20;z<=20;z+=7){draw('box',0,-.04,z,32,.012,.065,[.28,.43,.43])}for(let x=-31;x<=31;x+=9)draw('box',x,-.03,0,.06,.013,20,[.28,.40,.42]);
// Arena boundaries, platforms and obstacle volumes matching the server collision geometry
for(const [x,z,w,d] of [[0,-21,34,.5],[0,21,34,.5],[-33,0,.5,22],[33,0,.5,22]]){draw('box',x,1.1,z,w,2.2,d,shades.steel);draw('box',x,2.28,z,w,.13,d,shades.metal)}
for(let i=0;i<OBS.length;i++){const o=OBS[i],x=wx(o.x+o.w/2),z=wz(o.y+o.h/2),w=o.w*.03,d=o.h*.03,h=i===4?3.3:4.1;
 draw('box',x,h/2,z,w,h,d,i===4?[.26,.32,.41]:[.36,.39,.41]);draw('box',x,h+.13,z,w+.28,.25,d+.28,shades.metal);
 for(let edge=-1;edge<=1;edge+=2){draw('box',x+edge*(w/2-.25),h/2+.05,z,.29,h-.2,d+.1,shades.dark);draw('box',x,h/2+.06,z+edge*(d/2-.18),w,.26,.2,[.50,.54,.57])}
 draw('box',x,h*.65,z+d/2+.07,w*.50,.17,.14,[.88,.66,.25]);}
// fixed decorative lamps outside the movement zone
for(let x=-29;x<=29;x+=29)for(let z=-17;z<=17;z+=34){draw('cylinder',x,1.6,z,.15,1.5,.15,shades.metal);draw('box',x,3.15,z,1.1,.25,.5,shades.glow,0,0,1,.45)}
}
function playerModel(p,t){const h=heroInfo[p.hero]||heroInfo.faisca,main=h.rgb,accent=[Math.min(1,main[0]*1.45),Math.min(1,main[1]*1.5),Math.min(1,main[2]*1.5)],body={x:p.rx,z:p.rz,yaw:-(p.dir||0)},walking=Math.hypot(p.vx||0,p.vz||0)>.05,walk=walking?Math.sin(t*10+(p.bot?1:0))*.22:0,dead=p.hp<=0;
 if(dead){draw('sphere',body.x,.07,body.z,.73,.08,.57,shades.red,0,0,.64);return}
 draw('cylinder',body.x,.015,body.z,.64,.028,.64,shades.dark,0,0,.38);
 // segmented boots and shins
 for(let s of [-1,1]){drawPart('box',body,-.13+walk*s,.39,s*.26,.28,.41,.25,shades.steel);drawPart('box',body,.11+walk*s,.17,s*.26,.43,.20,.31,shades.dark)}
 // vest, armor and faction tint
 drawPart('box',body,0,1.42,0,.62,.82,.53,main);drawPart('box',body,.45,1.48,0,.18,.67,.46,shades.steel);drawPart('box',body,.54,1.68,0,.17,.18,.36,accent);drawPart('box',body,-.28,1.12,0,.37,.20,.50,shades.dark);
 // shoulder plates and arms gripping gun
 for(let s of [-1,1]){drawPart('sphere',body,.05,1.95,s*.57,.43,.33,.37,main);drawPart('box',body,.23,1.48,s*.69,.29,.58,.27,shades.steel)}
 drawPart('cylinder',body,.30,2.36,0,.14,.17,.14,shades.dark);
 drawPart('sphere',body,.06,2.69,0,.43,.45,.42,main);drawPart('box',body,.43,2.67,0,.12,.18,.45,shades.dark);drawPart('box',body,.51,2.68,0,.04,.10,.35,[.20,.88,.91],0,0,1,.25);
 // gun with extended barrel aligned to the local forward +X direction
 drawPart('box',body,.67,1.55,-.30,.63,.18,.19,shades.dark);drawPart('box',body,.57,1.70,-.31,.38,.18,.09,shades.metal);
 drawPart('cylinder',body,1.47,1.53,-.31,.11,.48,.11,shades.metal,0,-Math.PI/2);
 drawPart('box',body,.72,1.22,-.30,.12,.42,.13,shades.steel);
 if(p.guard||p.shield){gl.depthMask(false);draw('sphere',body.x,1.55,body.z,1.32,1.72,1.32,shades.glow,0,0,.21,.35);gl.depthMask(true)}
 if(p.invuln){draw('cylinder',body.x,.03,body.z,.86,.022,.86,shades.glow,0,0,.65,.3)}
}
function drawBullet(b,t){const rgb= b.weapon==='plasma'?[.15,1,.96]:b.weapon==='granadas'?[1,.48,.12]:shades.yellow,x=wx(b.x),z=wz(b.y);draw('sphere',x,1.48,z,b.weapon==='granadas'?.34:.15,.14,.18,rgb,0,0,1,.55)}
function worldToScreen(x,y,z){const a=viewProjection,p=[x,y,z,1],q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=a[r]*p[0]+a[4+r]*p[1]+a[8+r]*p[2]+a[12+r]*p[3];if(q[3]<=0)return null;return [(q[0]/q[3]*.5+.5)*innerWidth,(-q[1]/q[3]*.5+.5)*innerHeight,q[2]/q[3]]}
function labels(t){const c=labelsCtx,w=innerWidth,h=innerHeight;c.clearRect(0,0,w,h);if(!gameState)return;for(const p of gameState.players){if(p.hp<=0)continue;const v=visuals.get(p.id);if(!v)continue;const screen=worldToScreen(v.rx,3.35,v.rz);if(!screen||screen[0]<-120||screen[0]>w+120||screen[1]<0||screen[1]>h)continue;const x=screen[0],y=screen[1],mine=p.id===meId;const size=mine?12:11;const name=(p.name||'JOGADOR').slice(0,15);c.textAlign='center';c.textBaseline='middle';c.font=`900 ${size}px system-ui`;c.lineWidth=3;c.strokeStyle='#07172e';c.strokeText(name,x,y-11);c.fillStyle=mine?'#ffffff':'#e9f4fa';c.fillText(name,x,y-11);const hp=Math.max(0,p.hp/p.maxHp);c.fillStyle='#081326';c.fillRect(x-23,y+1,46,5);c.fillStyle=mine?'#4ae6ad':'#ff976e';c.fillRect(x-23,y+1,46*hp,5);}}
let fpsCam={x:0,z:0},lastNow=performance.now();
function resize(){const dpr=Math.min(devicePixelRatio||1,innerWidth<680?1.3:1.6);const width=Math.floor(innerWidth*dpr),height=Math.floor(innerHeight*dpr);if(sceneCanvas.width!==width||sceneCanvas.height!==height){sceneCanvas.width=width;sceneCanvas.height=height;gl.viewport(0,0,width,height)}$('labelsCanvas').width=innerWidth;$('labelsCanvas').height=innerHeight;}
window.addEventListener('resize',resize);resize();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
function render(t){requestAnimationFrame(render);const now=t*.001,dt=Math.min(.05,(t-lastNow)*.001||.016);lastNow=t;if(screen!=='game')return;
 const me=gameState?.players.find(p=>p.id===meId);if(me){const tx=wx(me.x),tz=wz(me.y);fpsCam.x+=(tx-fpsCam.x)*Math.min(1,dt*5.8);fpsCam.z+=(tz-fpsCam.z)*Math.min(1,dt*5.8)}
 camera=[fpsCam.x+0,15.5,fpsCam.z+22.5];const target=[fpsCam.x,1.0,fpsCam.z-5.5];const aspect=sceneCanvas.width/Math.max(1,sceneCanvas.height);viewProjection=matMul(perspective(Math.PI/3.25,aspect,.1,200),lookAt(camera,target));gl.uniformMatrix4fv(uVP,false,viewProjection);gl.uniform3f(uEye,...camera);floorScene(now);
 if(gameState){for(const p of gameState.players){let v=visuals.get(p.id);if(!v){v={rx:wx(p.x),rz:wz(p.y),dir:p.dir||0,vx:0,vz:0};visuals.set(p.id,v)}const nx=wx(p.x),nz=wz(p.y),k=Math.min(1,dt*18);v.vx=(nx-v.rx)/Math.max(.01,dt);v.vz=(nz-v.rz)/Math.max(.01,dt);v.rx+=(nx-v.rx)*k;v.rz+=(nz-v.rz)*k;v.dir=p.dir||0;playerModel({...p,...v},now)}for(const b of gameState.bullets||[])drawBullet(b,now);for(const e of gameState.effects||[]){if(e.type==='boom'||e.type==='pulse'){gl.depthMask(false);draw('sphere',wx(e.x),1.4,wz(e.y),1.2,1.3,1.2,e.type==='boom'?shades.red:shades.glow,0,0,.20,.45);gl.depthMask(true)}}}
 labels(now);
}
requestAnimationFrame(render);
// Offline visual check: only for a local file opened during development.
if(location.protocol==='file:'||location.href==='about:blank'){
 meId='demo';room={code:'DEMO3D',status:'playing',members:[{id:'demo',name:'Campeão',hero:'ranger',weapon:'assalto'}],hostId:'demo'};
 gameState={type:'state',time:118,players:[
 {id:'demo',name:'Campeão',hero:'ranger',weapon:'assalto',x:552,y:540,dir:-1.57,hp:136,maxHp:136,kills:2,deaths:0,charge:60,guard:false,invuln:false},
 {id:'enemy1',name:'Sombra',hero:'sombra',weapon:'plasma',x:450,y:320,dir:2.2,hp:88,maxHp:105,kills:0,deaths:2,charge:40,guard:true,invuln:false},
 {id:'enemy2',name:'Titã',hero:'tita',weapon:'cacadeira',x:710,y:270,dir:2.3,hp:150,maxHp:175,kills:1,deaths:1,charge:30,guard:false,invuln:false},
 {id:'enemy3',name:'Faísca',hero:'faisca',weapon:'smg',x:288,y:360,dir:0,hp:112,maxHp:112,kills:1,deaths:0,charge:80,guard:false,invuln:false}
 ],bullets:[{x:575,y:478,weapon:'assalto'},{x:560,y:444,weapon:'assalto'}],effects:[]};
 show('game');updateHud();
} else connect();
})();
