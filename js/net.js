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
   The windmills are kept in step by copying the kicker's mechanics clock (lt) at each kick. The two screens may place
   the kick spots differently, so the friend's ball is remapped from their spot to ours (puppetStep). Messages are JSON strings. */
const GAME_ID='d0eb2e6d-a84f-4577-8470-fa110135d28b'; /* development ID: replace with the Poki game ID before release */
const NET_VER=2; /* bump when the online messages or rules change: quick match only pairs players on the same version */
const NET={nw:null,peer:null,host:false,code:'',id:0,snapT:0,off:Infinity,out:[],in:{},idle:null,timer:0,
  quick:false,findT:0,scanT:0,joinT:0,bad:[],rmMe:false,rmThem:false,seed:1,classic:false,round:-1};
const nowS=()=>performance.now()/1000,r3=v=>Math.round(v*1000)/1000;

function netSend(m,fast){const n=NET.nw;if(!n||!NET.peer)return;try{n.broadcast(fast?'unreliable':'reliable',JSON.stringify(m))}catch(e){}}
function netClose(){
  const n=NET.nw;clearTimeout(NET.timer);clearTimeout(NET.findT);clearTimeout(NET.scanT);clearTimeout(NET.joinT);
  Object.assign(NET,{nw:null,peer:null,host:false,code:'',off:Infinity,snapT:0,quick:false,expect:false,rmMe:false,rmThem:false});
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
  nw.on('connected',mine(peer=>{NET.peer=peer;clearTimeout(NET.timer);clearTimeout(NET.findT);clearTimeout(NET.scanT);clearTimeout(NET.joinT);
    if(NET.quick)NET.host=nw.id<peer.id; /* quick match: either could have opened the lobby; the lower id starts */
    if(NET.host){OPP.turns=NET.quick?3:S.turns>0?S.turns:3;NET.seed=(Math.random()*2147483646|0)+1;NET.classic=!SHUF.played;NET.round=-1;
      netSend({t:'start',turns:OPP.turns,seed:NET.seed,classic:NET.classic});startMode('net')} /* strangers: fixed 3-kick turns */
    else if(NET.quick)$('findSt').textContent='Found a player! Starting…';
    else $('msgP').textContent='Starting…'}));
  nw.on('disconnected',mine(()=>{if(!NET.peer)return;NET.peer=null;
    if(OPP.mode==='net'&&OPP.quick&&won){netClose();rematchUi('left');return} /* stranger left after the round: no rematch */
    netFail(OPP.quick?'YOUR OPPONENT LEFT':'YOUR FRIEND LEFT','The game has ended.')}));
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
/* ---------- quick match: play a stranger ----------
   Netlib's joinOrCreate: join a public lobby of this version with one player waiting, or open one and wait. Two players
   searching at the same moment may each open their own lobby, so every 3 s a waiting player looks for another open lobby
   and moves to it if its code sorts lower (only one of the two moves). A player who closed their tab can leave a ghost
   lobby behind for a while: after joining someone, if no connection comes within 5 s, leave, skip that lobby from then
   on (NET.bad) and search again. Nobody after 15 s: offer the robot or a retry. */
const QUICK={v:NET_VER,q:1};
const quickFilter=()=>Object.assign({playerCount:{$lt:2}},QUICK,NET.bad.length?{code:{$nin:NET.bad}}:{});
function quickJoin(nw){
  nw.joinOrCreate({maxPlayers:2,customData:QUICK,filter:quickFilter()}).then(info=>{if(NET.nw!==nw)return;
    if(!info){netFail("COULDN'T CONNECT",'Check your internet connection and try again.');return}
    NET.code=info.code;if(info.playerCount>1)quickExpect(nw);quickScan(nw)},()=>{if(NET.nw===nw)netFail("COULDN'T CONNECT",'Check your internet connection and try again.')});
}
/* we joined someone's lobby: they should connect within 5 s, else it's a ghost */
function quickExpect(nw){
  clearTimeout(NET.joinT);NET.expect=true;
  NET.joinT=setTimeout(()=>{NET.expect=false;if(NET.nw!==nw||NET.peer)return;NET.bad.push(NET.code);clearTimeout(NET.scanT);
    nw.leave().then(()=>{if(NET.nw===nw)quickJoin(nw)},()=>{if(NET.nw===nw)quickJoin(nw)})},5000);
}
function quickScan(nw){
  clearTimeout(NET.scanT);
  NET.scanT=setTimeout(()=>{if(NET.nw!==nw||NET.peer)return;
    if(NET.expect){quickScan(nw);return} /* just joined someone: quickExpect decides */
    nw.list(quickFilter()).then(l=>{if(NET.nw!==nw||NET.peer)return;
      const o=(l||[]).filter(x=>x.code!==NET.code&&x.playerCount===1&&NET.bad.indexOf(x.code)<0).sort((a,b)=>a.code<b.code?-1:1)[0];
      if(!o||!(o.code<NET.code)){quickScan(nw);return}
      nw.leave().then(()=>nw.join(o.code)).then(i=>{if(NET.nw!==nw)return;if(i){NET.code=i.code;quickExpect(nw);quickScan(nw)}else quickJoin(nw)},()=>{if(NET.nw===nw)quickJoin(nw)});
    },()=>quickScan(nw))},3000);
}
function netQuick(){
  showMenu('find');$('findSt').textContent='Looking for someone to play…';
  const nw=netOpen(()=>{quickJoin(nw);
    nw.getPlayerCounts().then(c=>{if(NET.nw===nw&&!NET.peer&&c&&c.online>1)$('findSt').textContent=c.online+' players online · looking…'},()=>{})});
  if(!nw)return;NET.quick=true;NET.bad=[];
  NET.findT=setTimeout(()=>{if(NET.nw===nw&&!NET.peer){netClose();showMsg('NO ONE FOUND','Nobody else is looking for a game right now.',{bot:true,retry:true})}},15000);
}
/* Rematch (quick match, end of round): both must ask; the second ask starts it on both devices. */
function rematchUi(st){
  const b=$('rematch'),on=OPP.mode==='net'&&OPP.quick;b.hidden=!on;if(!on)return;
  b.disabled=st==='wait'||st==='left';b.classList.toggle('ask',st==='ask');
  b.textContent={idle:'REMATCH',wait:'WAITING…',ask:'ACCEPT REMATCH',left:'OPPONENT LEFT'}[st];
}
function netRematch(){if(!NET.peer)return;NET.rmMe=true;netSend({t:'rematch'});if(NET.rmThem)rematchGo();else rematchUi('wait')}
function rematchGo(){NET.rmMe=NET.rmThem=false;restart()}
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

/* Window owners online: round 0 is the classic split if the creator hadn't played a turn round yet this session,
   then a pattern from the shared seed and the round number (both devices restart in step: start, again, rematch). */
function netPattern(n){
  const r=++NET.round;if(r===0&&NET.classic)return classicPat(n);
  let a=(NET.seed+r*0x9E3779B1)>>>0;const rand=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}; /* mulberry32 */
  return Array.from({length:n},()=>rand()<.5?1:0);
}
/* ---------- in the round ---------- */
/* level cleared: forget the balls of the last round */
function netClear(){if(NET.idle){removeBallMesh(NET.idle);NET.idle=null}NET.out.length=0;NET.in={}}
/* one of our kicks (input.js kickFx): announce it, then keep reporting it from netTick */
function netKick(b){
  if(OPP.mode!=='net'||!NET.peer)return;
  b.nid=++NET.id;b.sentSt=b.state;NET.out.push(b);
  netSend({t:'kick',id:b.nid,st:nowS(),lt,sx:r3(PX),sd:r3(D),p:[b.p.x,b.p.y,b.p.z].map(r3),v:[b.v.x,b.v.y,b.v.z].map(r3)});
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
    case 'start':if(!NET.host){OPP.turns=(m.turns|0)||3;NET.seed=m.seed|0||1;NET.classic=!!m.classic;NET.round=-1;startMode('net')}break;
    case 'kick':remoteKick(m);break;
    case 'pos':if(b&&!b.gone){const s=b.snaps;if(m.st>s[s.length-1].t)s.push({t:m.st,p:new T.Vector3(-m.p[0],m.p[1],m.p[2]),v:new T.Vector3(-m.v[0],m.v[1],m.v[2])})}break;
    case 'st':if(b)b.state=m.s;break;
    case 'end':if(b)b.gone=true;break;
    case 'hit':remoteHit(m,b);break;
    case 'sfx':if(sfx[m.k])sfx[m.k]();addShake(.05);break;
    case 'again':if(won)restart();break;
    case 'rematch':if(!won)break;NET.rmThem=true;if(NET.rmMe)rematchGo();else rematchUi('ask');break;
  }
}
function remoteKick(m){
  if(!VS.on||VS.over)return;
  if(VS.tb&&VS.turn==='p'&&VS.ending)endTurn(); /* their turn began before our end-of-turn pause ran out */
  lt=m.lt+netLag(); /* keep the windmills in step with the kicker's */
  if(NET.idle){removeBallMesh(NET.idle);NET.idle=null}
  const b=makeBall(BX,D);
  b.m.scale.setScalar(1);b.owner='bot';b.puppet=true;b.state='fly';b.age=0;b.gone=false;
  b.sx=-(m.sx===undefined?-BX:m.sx);b.sd=m.sd||D; /* their spot, mirrored into our view, and their spot's distance */
  b.v.set(-m.v[0],m.v[1],m.v[2]);b.snaps=[{t:m.st,p:new T.Vector3(-m.p[0],m.p[1],m.p[2]),v:b.v.clone()}]; /* reports stay in their (mirrored) coordinates; puppetStep remaps */
  introDone(); /* their kick came in before our intro finished: bring them in now */
  NET.in[m.id]=b;balls.push(b);turnKick('bot');kidKick('bot',b.v);
  sfx.kick(.8);for(let i=0;i<10;i++)dust.emit(BX+rnd(-.3,.3),.1,D+rnd(-.2,.2),rnd(-1.8,1.8),rnd(.6,2.2),rnd(-.5,1.5),rnd(.25,.5),[.72,.6,.42],3);
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
  /* Their screen may place the spots differently (another shape): stretch the depth so their spot lands on ours,
     and slide x onto our spot near the kick, fading to their true path at the wall (where the windows are the same). */
  const k=clamp(b.p.z/b.sd,0,1);b.p.x+=(BX-b.sx)*k;b.p.z*=D/b.sd;
  b.p.y=Math.max(R,b.p.y);b.age+=dt;
  const sp=b.v.length();b.spin.set(0,1,0).cross(b.v);if(sp>.05&&b.spin.lengthSq()>1e-4){b.spin.normalize();b.m.rotateOnWorldAxis(b.spin,sp/R*dt*.75)}
  b.sh.position.x=b.p.x;b.sh.position.z=b.p.z;b.sh.material.opacity=clamp(1-b.p.y/9,.15,1);
  if(b.state==='fly'&&Math.random()<.9)spark.emit(b.p.x,b.p.y,b.p.z,0,0,0,.42,[1,.45,.35],0);
  if((b.gone&&rt>=s[s.length-1].t)||b.age>10){removeBallMesh(b);return false}
  return true;
}
