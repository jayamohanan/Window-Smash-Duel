'use strict';
/* ---------- online: play a friend by code (Poki Netlib: WebRTC peer-to-peer; Poki's server only introduces the two) ----------
   Create game -> a private 2-player lobby and its code. The friend types the code (or opens ?room=CODE) -> join. Once the
   two are connected the creator sends 'start' (with its kicks per turn) and both load a fresh turn-mode round; the creator
   kicks first.
   Each device sees itself as blue on the left. The arena is a mirror image, so every message is in the sender's view and
   the receiver flips x. The kicker's device referees its own balls: it runs the physics and reports
     kick (start + velocity), pos (~30 a second, unreliable channel), st (flight state change), end (ball gone),
     hit (window broken, with the spot), sfx (wall / windmill sound).
   The other device draws that ball as a puppet (no physics of its own) and replays the breaks, so both keep the same score.
   The windmills are kept in step by copying the kicker's mechanics clock (lt) at each kick. Messages are JSON strings. */
const GAME_ID='d0eb2e6d-a84f-4577-8470-fa110135d28b'; /* development ID: replace with the Poki game ID before release */
const NET={nw:null,peer:null,host:false,code:'',id:0,snapT:0,off:Infinity,out:[],in:{},idle:null,timer:0};
const nowS=()=>performance.now()/1000,r3=v=>Math.round(v*1000)/1000;

function netSend(m,fast){const n=NET.nw;if(!n||!NET.peer)return;try{n.broadcast(fast?'unreliable':'reliable',JSON.stringify(m))}catch(e){}}
function netClose(){
  const n=NET.nw;clearTimeout(NET.timer);
  Object.assign(NET,{nw:null,peer:null,host:false,code:'',off:Infinity,snapT:0});
  if(n)try{n.close()}catch(e){}
}
/* Something went wrong (or the friend left): drop the connection, put the robot round back behind the menu, say what happened. */
function netFail(h,p){
  netClose();
  if(OPP.mode==='net'){OPP.mode='bot';tapped=false;setPause(false);$('retryBtn').hidden=false;loadLevel(level)}
  showMsg(h,p,{bot:true});
}
function netOpen(onReady){
  netClose();
  if(!window.Netlib){netFail("COULDN'T CONNECT",'Online play is not available here.');return null}
  const nw=new Netlib.Network(GAME_ID);NET.nw=nw;
  const mine=f=>(...a)=>{if(NET.nw===nw)f(...a)}; /* ignore anything from a network we already closed */
  nw.on('ready',mine(onReady));
  nw.on('connected',mine(peer=>{NET.peer=peer;clearTimeout(NET.timer);
    if(NET.host){OPP.turns=S.turns>0?S.turns:3;netSend({t:'start',turns:OPP.turns});startMode('net')}
    else $('msgP').textContent='Starting…'}));
  nw.on('disconnected',mine(()=>{if(!NET.peer)return;NET.peer=null;netFail('YOUR FRIEND LEFT','The game has ended.')}));
  nw.on('message',mine((peer,ch,data)=>{if(!NET.peer)NET.peer=peer;if(typeof data==='string')netMsg(data)}));
  /* only a lost socket is fatal here; a refused request (e.g. a wrong code) also comes as a signalling error and is handled by its promise */
  nw.on('signalingerror',mine(e=>{if(!NET.peer&&e&&e.type==='socket-error')netFail("COULDN'T CONNECT",'Check your internet connection and try again.')}));
  nw.on('failed',mine(()=>netFail("COULDN'T CONNECT",'Your friend could not be reached. Try again.')));
  return nw;
}
function netHost(){
  showMenu('wait');$('myCode').textContent='····';$('waitSt').textContent='Getting a code…';$('mCopy').hidden=true;
  const nw=netOpen(()=>nw.create({public:false,maxPlayers:2,codeFormat:'short'}).then(code=>{if(NET.nw!==nw)return;
      if(!code){netFail("COULDN'T CONNECT",'No game code came back. Try again.');return}
      NET.code=code;$('myCode').textContent=code;$('waitSt').textContent='Waiting for your friend…';$('mCopy').hidden=false},
    ()=>{if(NET.nw===nw)netFail("COULDN'T CONNECT",'No game code came back. Try again.')}));
  if(nw)NET.host=true;
}
function netJoin(raw){
  const code=(raw||'').trim();if(!code)return;
  showMsg('JOINING…','Game '+code);
  const nw=netOpen(()=>{
    const tryJ=c=>nw.join(c).then(i=>i,()=>undefined); /* codes may be typed in lower case: retry in capitals */
    tryJ(code).then(i=>i||(code.toUpperCase()!==code?tryJ(code.toUpperCase()):undefined)).then(info=>{if(NET.nw!==nw)return;
      if(!info){netFail('NO GAME WITH THAT CODE','Check the code with your friend and try again.');return}
      NET.code=info.code;$('msgP').textContent='Connecting to your friend…';
      NET.timer=setTimeout(()=>{if(NET.nw===nw&&!NET.peer)netFail("COULDN'T CONNECT",'Your friend could not be reached. Try again.')},15000)})});
}
/* Invite: the share sheet on phones, else the clipboard. A ?room= link is added only when the game is its own page
   (inside Poki's frame the page address isn't one a friend can open). */
function shareCode(){
  const c=NET.code;if(!c)return;
  const own=window.top===window&&location.protocol.startsWith('http'),url=own?location.origin+location.pathname+'?room='+encodeURIComponent(c):'';
  const text='Play Window Smash Duel with me! Game code: '+c+(url?'\n'+url:'');
  const b=$('mCopy'),done=()=>{b.textContent='COPIED';setTimeout(()=>b.textContent='COPY INVITE',1200)};
  try{if(navigator.share&&matchMedia('(pointer:coarse)').matches){navigator.share({text}).catch(()=>{});return}}catch(e){}
  try{navigator.clipboard.writeText(text).then(done,()=>{})}catch(e){}
}

/* ---------- in the round ---------- */
/* level cleared: forget the balls of the last round */
function netClear(){if(NET.idle){removeBallMesh(NET.idle);NET.idle=null}NET.out.length=0;NET.in={}}
/* one of our kicks (input.js kickFx): announce it, then keep reporting it from netTick */
function netKick(b){
  if(OPP.mode!=='net'||!NET.peer)return;
  b.nid=++NET.id;b.sentSt=b.state;NET.out.push(b);
  netSend({t:'kick',id:b.nid,st:nowS(),lt,p:[b.p.x,b.p.y,b.p.z].map(r3),v:[b.v.x,b.v.y,b.v.z].map(r3)});
}
function netHit(p,b,hx,hy){if(OPP.mode==='net'&&b.nid&&!b.puppet)netSend({t:'hit',id:b.nid,i:panes.indexOf(p),h:[r3(hx),r3(hy)]})}
function netSfx(b,k){if(OPP.mode==='net'&&b.nid&&!b.puppet)netSend({t:'sfx',k})}
function netAgain(){if(OPP.mode==='net')netSend({t:'again'})}
function netTick(real){
  if(OPP.mode!=='net')return;
  /* the friend's waiting ball on their spot while it's their turn */
  const want=VS.on&&VS.tb&&VS.turn==='bot'&&VS.left>0&&!won&&!balls.some(b=>b.owner==='bot'&&b.state==='fly');
  if(want&&!NET.idle){NET.idle=makeBall(BX,D);NET.idle.owner='bot'}
  else if(!want&&NET.idle){removeBallMesh(NET.idle);NET.idle=null}
  if(NET.idle){const b=NET.idle;b.born+=real;const s=clamp(b.born/.14,0,1);b.m.scale.setScalar(s<1?s*(1.25-.25*s):1);b.p.y=R+(1-s)*.5}
  if(!NET.peer)return;
  NET.snapT-=real;const snap=NET.snapT<=0;if(snap)NET.snapT=1/30;
  for(let i=NET.out.length-1;i>=0;i--){const b=NET.out[i];
    if(!balls.includes(b)){netSend({t:'end',id:b.nid});NET.out.splice(i,1);continue}
    if(b.state!==b.sentSt){b.sentSt=b.state;netSend({t:'st',id:b.nid,s:b.state})}
    if(snap)netSend({t:'pos',id:b.nid,st:nowS(),p:[b.p.x,b.p.y,b.p.z].map(r3),v:[b.v.x,b.v.y,b.v.z].map(r3)},true)}
}
const netLag=()=>{const l=NET.peer&&NET.peer.latency;return l&&l.average>0?l.average/2000:.05}; /* one way, s */
function netMsg(data){
  let m;try{m=JSON.parse(data)}catch(e){return}
  if(typeof m.st==='number')NET.off=Math.min(NET.off,nowS()-m.st); /* clock offset + quickest delivery seen */
  const b=m.id!==undefined?NET.in[m.id]:null;
  switch(m.t){
    case 'start':if(!NET.host){OPP.turns=(m.turns|0)||3;startMode('net')}break;
    case 'kick':remoteKick(m);break;
    case 'pos':if(b&&!b.gone){const s=b.snaps;if(m.st>s[s.length-1].t)s.push({t:m.st,p:new T.Vector3(-m.p[0],m.p[1],m.p[2]),v:new T.Vector3(-m.v[0],m.v[1],m.v[2])})}break;
    case 'st':if(b)b.state=m.s;break;
    case 'end':if(b)b.gone=true;break;
    case 'hit':remoteHit(m,b);break;
    case 'sfx':if(sfx[m.k])sfx[m.k]();addShake(.05);break;
    case 'again':if(won)restart();break;
  }
}
function remoteKick(m){
  if(!VS.on||VS.over)return;
  if(VS.tb&&VS.turn==='p'&&VS.ending)endTurn(); /* their turn began before our end-of-turn pause ran out */
  lt=m.lt+netLag(); /* keep the windmills in step with the kicker's */
  if(NET.idle){removeBallMesh(NET.idle);NET.idle=null}
  const x=-m.p[0],b=makeBall(x,m.p[2]);
  b.m.scale.setScalar(1);b.p.y=m.p[1];b.owner='bot';b.puppet=true;b.state='fly';b.age=0;b.gone=false;
  b.v.set(-m.v[0],m.v[1],m.v[2]);b.snaps=[{t:m.st,p:b.p.clone(),v:b.v.clone()}];
  NET.in[m.id]=b;balls.push(b);turnKick('bot');
  sfx.kick(.8);for(let i=0;i<10;i++)dust.emit(x+rnd(-.3,.3),.1,m.p[2]+rnd(-.2,.2),rnd(-1.8,1.8),rnd(.6,2.2),rnd(-.5,1.5),rnd(.25,.5),[.72,.6,.42],3);
}
/* their window i (their view) is our mirror-image window */
function remoteHit(m,b){
  const q=panes[m.i];if(!q)return;
  const p=panes.find(o=>o.vs&&Math.abs(o.x+q.x)<.01&&Math.abs(o.y-q.y)<.01);if(!p||p.broken)return;
  const hx=-m.h[0],hy=m.h[1];
  smash(p,b||{owner:'bot',puppet:true,p:new T.Vector3(hx,hy,ZF),v:new T.Vector3(0,0,-20),a:new T.Vector3(),state:'fly'},{x:hx,y:hy});
}
/* The friend's ball: shown 0.1 s behind their newest report, between two reports (or a short way past the last one). */
function puppetStep(b,dt){
  const s=b.snaps,rt=nowS()-NET.off-.1;
  let i=s.length-1;while(i>0&&s[i].t>rt)i--;
  const a=s[i],c=s[i+1];
  if(c){const k=clamp((rt-a.t)/(c.t-a.t),0,1);b.p.lerpVectors(a.p,c.p,k);b.v.lerpVectors(a.v,c.v,k)}
  else{const e=clamp(rt-a.t,0,.15);b.p.copy(a.p).addScaledVector(a.v,e);b.v.copy(a.v)}
  b.p.y=Math.max(R,b.p.y);b.age+=dt;
  const sp=b.v.length();b.spin.set(0,1,0).cross(b.v);if(sp>.05&&b.spin.lengthSq()>1e-4){b.spin.normalize();b.m.rotateOnWorldAxis(b.spin,sp/R*dt*.75)}
  b.sh.position.x=b.p.x;b.sh.position.z=b.p.z;b.sh.material.opacity=clamp(1-b.p.y/9,.15,1);
  if(b.state==='fly'&&Math.random()<.9)spark.emit(b.p.x,b.p.y,b.p.z,0,0,0,.42,[1,.45,.35],0);
  if((b.gone&&rt>=s[s.length-1].t)||b.age>10){removeBallMesh(b);return false}
  return true;
}
