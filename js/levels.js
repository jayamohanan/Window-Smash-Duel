'use strict';
/* ---------- arenas ----------
   Pane fields: x,y,w,h on the wall plane (glass at z 0, ball crossing at ZF); vs:true = takes part in the VS window rotation;
   shutter:{ctrl:true} = game-driven roller shutter (shutter:{phase} = one on a loop); armor:1 = wooden boards (one kick each);
   hp:2 = wired glass (cracks first); rail:{amp,speed,phase} = stand window sliding on a rail; hang:true = hangs from the gantry.
   Level fields:
   type:'facade' = a wall of windows (W half-width, H height, with a raised centre that holds the round clock);
   type:'stand' = windows on stands; type:'field' = free-standing panes placed by a builder (field:'carousel' | 'flip').
   vs:true = race the bot (see vs.js); prize:{first,every:[a,b],stay,pts} = gold window now and then;
   mills:[{x,y,z,len,speed,dir,plate}] = windmills on the wall; wind = sideways push (m/s²); board = sliding barrier;
   wheel = gap wheel; gantry = overhead beam for hang:true rail windows; spin:[pane indexes] = spin boards in front of those;
   carousel / flip = see mech.js; tut = swipe hint until the first kick. */
const PED={w:1.6,h:.9}; /* raised centre of the facade: half-width, then a half-round top of radius w, centre h above H */
/* windows in a grid (row by row, bottom first); extra[i] adds fields to window i */
function grid(xs,ys,w,h,extra){const a=[];ys.forEach(y=>xs.forEach(x=>{a.push(Object.assign({x,y,w,h,vs:true,shutter:{ctrl:true}},extra&&extra[a.length]||{}))}));return a}
const LV=[
 {name:'Windmill Facade',type:'facade',vs:true,tut:true,W:7.3,H:9.2,
  prize:{first:8,every:[10,15],stay:6,pts:3},
  /* mirror-symmetric, so both halves play the same: one mill centred on each half at mid-height, turning opposite ways at
     the same speed; the wired (two-kick) windows are the outer middle pair */
  mills:[{x:-3.4,y:4.5,z:1.6,len:2.6,speed:.9,dir:1,plate:.45},{x:3.4,y:4.5,z:1.6,len:2.6,speed:.9,dir:-1,plate:.45}],
  panes:grid([-5.1,-1.7,1.7,5.1],[1.8,4.5,7.2],2.4,1.8,{4:{hp:2},7:{hp:2}})}
];

let level=0,LVL=null,group=null,panes=[],won=false,cur=null,D=13,hintDone=false;
const balls=[],shards=[],debris=[];
let timers=[];
const later=(s,f)=>timers.push({t:s,f});

/* Intact glass reads as solid: a sky-blue reflection fading down the pane, with bold diagonal glints. */
const glassTex=canvasTex(256,256,(g,w,h)=>{const a=g.createLinearGradient(0,0,0,h);a.addColorStop(0,'rgba(96,180,240,.8)');a.addColorStop(1,'rgba(176,226,252,.56)');g.fillStyle=a;g.fillRect(0,0,w,h);g.fillStyle='rgba(255,255,255,.78)';g.save();g.translate(w*.5,h*.5);g.rotate(-.75);g.fillRect(-w,-74,w*2,44);g.fillRect(-w,-14,w*2,14);g.restore()});
const glassMat=new T.MeshBasicMaterial({map:glassTex,transparent:true,depthWrite:false,side:T.DoubleSide});
/* Prize window: the same glass in gold. */
const goldTex=canvasTex(256,256,(g,w,h)=>{const a=g.createLinearGradient(0,0,0,h);a.addColorStop(0,'rgba(255,190,40,.9)');a.addColorStop(1,'rgba(255,226,120,.72)');g.fillStyle=a;g.fillRect(0,0,w,h);g.fillStyle='rgba(255,255,235,.85)';g.save();g.translate(w*.5,h*.5);g.rotate(-.75);g.fillRect(-w,-74,w*2,44);g.fillRect(-w,-14,w*2,14);g.restore()});
/* turn mode: a dim room behind each window, shown once it's broken (instead of the yard behind the wall) */
const roomTex=canvasTex(64,128,(g,w,h)=>{const a=g.createLinearGradient(0,0,0,h);a.addColorStop(0,'#3b4256');a.addColorStop(1,'#151925');g.fillStyle=a;g.fillRect(0,0,w,h)});
let roomMat=null;
function roomBehind(p,parent){roomMat=roomMat||new T.MeshBasicMaterial({map:roomTex,side:T.BackSide});
  const d=1.4,m=new T.Mesh(new T.BoxGeometry(p.w,p.h,d),roomMat);m.position.set(p.x,p.y,ZF-.38-d/2+.001);m.visible=false;parent.add(m);return m}
const goldGlassMat=new T.MeshBasicMaterial({map:goldTex,transparent:true,depthWrite:false,side:T.DoubleSide});
const shardMats=[0xd9f2ff,0xaedcf5,0xffffff].map(c=>new T.MeshPhongMaterial({color:c,specular:0xffffff,shininess:90,transparent:true,opacity:.86,side:T.DoubleSide,flatShading:true}));
const goldShardMats=[0xffd34d,0xffc53a,0xfff0b0].map(c=>new T.MeshPhongMaterial({color:c,specular:0xffffff,shininess:90,transparent:true,opacity:.9,side:T.DoubleSide,flatShading:true}));

function clearLevel(){
  if(group){group.traverse(o=>{if(o.geometry)o.geometry.dispose()});scene.remove(group)}
  shards.forEach(s=>{scene.remove(s.m);s.m.geometry.dispose()});shards.length=0;
  debris.forEach(d=>scene.remove(d.m));debris.length=0;
  balls.forEach(removeBallMesh);balls.length=0;
  if(cur){removeBallMesh(cur);cur=null}
  botClear();netClear();
  spark.clear();dust.clear();timers=[];$('win').hidden=true;$('again').hidden=true;$('rematch').hidden=true;$('wipe').classList.remove('on');
  retrying=false;confetti.length=0;fctx.clearRect(0,0,W_,H_);
  obs=[];movers=[];lt=0;wind=0;wheel=null;hinges=[];clock=null;VS.on=false;
}
function makeFrame(p,parent,c){const f=.2,z=.1;
  p.frame=[box(p.w+f*2,f,.34,c,p.x,p.y+p.h/2+f/2,z,parent),box(p.w+f*2,f,.34,c,p.x,p.y-p.h/2-f/2,z,parent),
    box(f,p.h,.34,c,p.x-p.w/2-f/2,p.y,z,parent),box(f,p.h,.34,c,p.x+p.w/2+f/2,p.y,z,parent)]}
function tintFrame(p,c){(p.frame||[]).forEach(m=>m.material=mat(c))}
function makePane(p,parent){const m=new T.Mesh(new T.PlaneGeometry(p.w,p.h),glassMat);m.position.set(p.x,p.y,0);m.renderOrder=3;parent.add(m);p.mesh=m;p.broken=false;addGlare(p)}

/* ---------- facade: a stone wall full of windows, solid between them (a miss thuds off and costs time).
   Front face at ZF, so crossPlane judges glass, shutter and wall at the same plane. Open behind: through a broken window
   you see the yard on the other side (where a bot on the far side would stand). ---------- */
const stoneTex=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#e8d2ac';g.fillRect(0,0,w,h);const rows=4,rh=h/rows;
  for(let r=0;r<rows;r++){const off=r%2?w/4:0;for(let c=-1;c<3;c++){g.fillStyle='rgba(255,255,255,'+(.03+((r*7+c*3+9)%5)*.025)+')';g.fillRect(c*w/2+off+4,r*rh+4,w/2-8,rh-8)}}
  g.fillStyle='#c9ad82';for(let r=0;r<=rows;r++)g.fillRect(0,r*rh-2,w,4);
  for(let r=0;r<rows;r++){const off=r%2?w/4:0;for(let c=0;c<3;c++)g.fillRect(c*w/2+off-2,r*rh,4,rh)}});
stoneTex.wrapS=stoneTex.wrapT=T.RepeatWrapping;stoneTex.repeat.set(.4,.4);
function buildFacade(L){
  const g=group,W=L.W,H=L.H,pw=PED.w,ph=PED.h;
  const tb=tbOn(),hole=(sh,p)=>{const q=new T.Path();q.moveTo(p.x-p.w/2,p.y-p.h/2);q.lineTo(p.x-p.w/2,p.y+p.h/2);q.lineTo(p.x+p.w/2,p.y+p.h/2);q.lineTo(p.x+p.w/2,p.y-p.h/2);q.closePath();sh.holes.push(q)};
  let shapes;
  if(tb){ /* turn mode: one flat-topped wall (no raised centre, no clock) */
    const sh=new T.Shape();sh.moveTo(-W,0);sh.lineTo(W,0);sh.lineTo(W,H);sh.lineTo(-W,H);sh.closePath();panes.forEach(p=>hole(sh,p));shapes=[sh]}
  else{const sh=new T.Shape();sh.moveTo(-W,0);sh.lineTo(W,0);sh.lineTo(W,H);sh.lineTo(pw,H);sh.lineTo(pw,H+ph);sh.absarc(0,H+ph,pw,0,Math.PI,false);sh.lineTo(-pw,H);sh.lineTo(-W,H);sh.closePath();
    panes.forEach(p=>hole(sh,p));shapes=[sh]}
  const wall=new T.Mesh(new T.ExtrudeGeometry(shapes,{depth:.38,bevelEnabled:false,curveSegments:24}),[new T.MeshLambertMaterial({map:stoneTex}),mat(0xc9ad82)]);
  wall.position.z=ZF-.38;wall.castShadow=true;wall.receiveShadow=true;g.add(wall);
  if(tb){box(W*2+.3,.55,.62,0xb79a70,0,.275,ZF-.19,g); /* plinth */
    box(W*2+.5,.3,.6,0xd8bf95,0,H+.15,ZF-.19,g); /* flat cornice */
    box(.4,H,.62,0xd8bf95,0,H/2,ZF-.19,g)} /* centre pilaster: your half | the opponent's half */
  else{box(W*2+.3,.55,.62,0xb79a70,0,.275,ZF-.19,g); /* plinth */
    [-1,1].forEach(s=>box(W-pw+.2,.3,.6,0xd8bf95,s*(W+pw)/2+s*.05,H+.15,ZF-.19,g))} /* cornice either side of the raised centre */
  [-1,1].forEach(s=>box(.4,H+.3,.62,0xd8bf95,s*(W+.05),(H+.3)/2,ZF-.19,g)); /* corner posts */
  panes.forEach(p=>{makeFrame(p,g,p.fc||FRAME);makePane(p,g);
    if(p.side)p.inner=roomBehind(p,g)});
  if(!tb)clock=buildClock(0,H+ph,1); /* turn mode has no clock: the footballs in the turn pill count kicks */
}
/* Is (x,y) on the facade's solid wall (the window holes are checked before this)? */
function facadeAt(x,y){const W=LVL.W,H=LVL.H;if(Math.abs(x)>W+.25||y<0)return false;if(tbOn())return y<=H+.05;if(y<=H+.05)return true;if(Math.abs(x)>PED.w)return false;const dy=y-H-PED.h;return dy<=0||Math.hypot(x,dy)<=PED.w+.05}

/* ---------- round clock on the facade: the gold wedge is the time left, it turns red for the last 10 s and pulses in sudden death ---------- */
let clock=null;
function buildClock(x,y,r){
  const g=group,z=ZF+.01;
  const disc=(rad,c,dz)=>{const m=new T.Mesh(new T.CircleGeometry(rad,48),bmat(c));m.position.set(x,y,z+dz);g.add(m);return m};
  disc(r+.14,0x23304a,0);const face=disc(r,0xfff8e8,.005);
  const wm=new T.MeshBasicMaterial({color:GOLD,side:T.DoubleSide}),wedge=new T.Mesh(new T.BufferGeometry(),wm);wedge.position.set(x,y,z+.01);g.add(wedge);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,t=box(.06,i%3?.12:.22,.01,0x23304a,x+Math.sin(a)*r*.84,y+Math.cos(a)*r*.84,z+.015,g,false);t.rotation.z=-a}
  const hand=new T.Group();hand.position.set(x,y,z+.02);g.add(hand);box(.08,r*.9,.01,0x23304a,0,r*.45,0,hand,false);
  disc(.1,0x23304a,.03);
  let lastK=-1;
  return{set(k,warn,sudden){
    if(Math.abs(k-lastK)>.003||(k===0&&lastK!==0)){lastK=k;wedge.geometry.dispose();wedge.geometry=k>0?new T.CircleGeometry(r*.97,Math.max(3,Math.ceil(64*k)),Math.PI/2,k*Math.PI*2):new T.BufferGeometry()}
    hand.rotation.z=-(1-k)*Math.PI*2;wm.color.setHex(warn?TEAM.bot:GOLD);
    face.material=bmat(sudden&&Math.sin(lt*10)>0?0xffb3a6:0xfff8e8)}};
}

function standLegs(p,sg){[-1,1].forEach(s=>{box(.26,p.y-p.h/2,.26,0x8a5f3b,s*(p.w/2+.1),(p.y-p.h/2)/2,.1,sg);box(.26,.14,1.8,0x704b2c,s*(p.w/2+.1),.07,.1,sg)})}
/* Each stand is its own group so rail windows can slide (p.x follows; p.vx is used by aim help and the bot's lead). */
function buildStand(L){
  panes.forEach(p=>{const sg=new T.Group();sg.position.x=p.x;group.add(sg);const x=p.x;p.x=0;makeFrame(p,sg,FRAME);makePane(p,sg);p.x=x;
    if(p.hang){const top=p.y+p.h/2+.2,gy=L.gantry.y-.17;[-1,1].forEach(s=>box(.05,gy-top,.05,0x3a3a44,s*p.w*.4,(gy+top)/2,.1,sg,false));box(.9,.3,.5,0x4a5466,0,gy-.1,.1,sg)}
    else standLegs(p,sg);
    if(!p.rail)return;const r=p.rail,ph=r.phase||0;p.x0=x;
    if(!p.hang)[-.5,.5].forEach(z=>box(r.amp*2+p.w+1.6,.06,.1,0x8d8577,x,.03,.1+z,group,false));
    const at=t=>{p.x=p.x0+r.amp*Math.sin(t*r.speed+ph);p.vx=r.amp*r.speed*Math.cos(t*r.speed+ph);sg.position.x=p.x};at(0);
    movers.push(at)});
}
function loadLevel(i){
  clearLevel();sandbox=false;level=(i+LV.length)%LV.length;LVL=LV[level];
  group=new T.Group();scene.add(group);
  panes=(LVL.layout?LVL.layout():LVL.panes).map(p=>Object.assign({},p));if(tbOn())turnPanes(panes);placeSpots();lt=0;wind=LVL.wind||0;
  if(LVL.type==='facade')buildFacade(LVL);else if(LVL.type==='stand')buildStand(LVL);
  buildMech(LVL);
  won=false;
  if(LVL.vs)vsStart(LVL);else drawScore();spawnBall(); /* after vsStart: the first ball goes to whoever kicks first */
  updateHint();chips();
}
/* Dev sandbox: empty yard with unlimited balls, for testing kick feel and juice (no bot, no round). */
let sandbox=false;
function loadSandbox(){
  clearLevel();sandbox=true;LVL={name:'Sandbox',type:'sandbox',panes:[]};placeSpots();
  group=new T.Group();scene.add(group);panes=[];
  buildTestPanes();
  won=false;
  drawScore();spawnBall();updateHint();chips();
}
/* Sandbox aim test: three towers, near (left, z 6) / mid (centre, z 1.5) / far (right, z -4), each with a low, middle and high
   window and a clear gap between them, so every window can be hit on its own. A broken one comes back after 2.5 s. */
function buildTestPanes(){
  const w=2,h=1.7,ys=[1.1,4.1,7.1];
  [[-4.8,6],[0,1.5],[7,-4]].forEach(([x,z])=>{
    ys.forEach(y=>{const p={w,h,stop:true,z};freeStand(p,new T.Vector3(x,y,z));panes.push(p)});
    const top=ys[ys.length-1]-h/2;[-1,1].forEach(s=>box(.18,top,.18,0x8a5f3b,x+s*(w/2+.1),top/2,z+.1,group))});
  movers.push((t,dt)=>panes.forEach(p=>{if(!p.broken){p.rt=0;return}p.rt=(p.rt||0)+dt;if(p.rt>2.5){p.rt=0;p.broken=false;p.mesh.visible=true;(p.extra||[]).forEach(m=>m.visible=true)}}));
}
const reloadLevel=()=>sandbox?loadSandbox():loadLevel(level);
