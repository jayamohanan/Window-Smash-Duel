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
const PED0={w:1.6,h:.9},PED={w:1.6,h:.9}; /* raised centre of the facade: half-width, then a half-round top of radius w, centre h above H (PED = PED0 × arena scale) */
/* Long kick: the facade is built S.arena times bigger (windows, wall, mills), and layout() moves the kick spots back so the
   wall fills the same part of the screen. The ball, players and camera-to-ball distance stay real size, so the ball now
   shrinks into the distance on its way to a big, far-off wall, like a long free kick. */
const ak=()=>LVL&&LVL.ak||1;
function scaleLevel(L){const k=L.type==='facade'?S.arena:1;if(k===1)return L;
  const sp=p=>Object.assign({},p,{x:p.x*k,y:p.y*k,w:p.w*k,h:p.h*k});
  return Object.assign({},L,{ak:k,W:L.W*k,H:L.H*k,panes:L.panes.map(sp),
    mills:L.mills&&L.mills.map(m=>Object.assign({},m,{x:m.x*k,y:m.y*k,len:m.len*k,plate:m.plate*k,s:k}))})}
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

let level=0,LVL=null,group=null,panes=[],won=false,cur=null,D=13,hintDone=false,hintT=null;
const balls=[],shards=[],debris=[];
let timers=[];
const later=(s,f)=>timers.push({t:s,f});

/* Intact glass: a bright sky blue, lighter toward the bottom (nearly opaque, so it doesn't wash out to the sky colour) with one crisp diagonal
   highlight. Still plain (2026-11-14), just bolder (2026-11-15): the glass is the target, so it is the brightest thing on the wall. */
function glassPaint(top,bot,hi){return canvasTex(256,256,(g,w,h)=>{const a=g.createLinearGradient(0,0,0,h);a.addColorStop(0,top);a.addColorStop(1,bot);g.fillStyle=a;g.fillRect(0,0,w,h);
  g.save();g.translate(w*.5,h*.5);g.rotate(-.75);const b=g.createLinearGradient(0,-60,0,-36);b.addColorStop(0,'rgba(255,255,255,0)');b.addColorStop(.35,hi);b.addColorStop(.65,hi);b.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=b;g.fillRect(-w,-60,w*2,30);g.restore()})}
const glassTex=glassPaint('rgba(62,160,236,.93)','rgba(124,198,246,.9)','rgba(255,255,255,.85)');
const glassMat=new T.MeshBasicMaterial({map:glassTex,transparent:true,depthWrite:false,side:T.DoubleSide});
/* Prize window: the same glass in gold. */
const goldTex=glassPaint('rgba(255,196,50,.88)','rgba(255,214,90,.8)','rgba(255,255,235,.6)');
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
  spark.clear();dust.clear();timers=[];$('win').hidden=true;$('intro').hidden=true;$('again').hidden=true;$('rematch').hidden=true;$('winMenu').hidden=true;tensionOff();$('wipe').classList.remove('on');
  retrying=false;confetti.length=0;confRain=0;fctx.clearRect(0,0,W_,H_);
  obs=[];movers=[];MILLS=[];lt=0;wind=0;wheel=null;hinges=[];clock=null;VS.on=false;
}
function makeFrame(p,parent,c){const f=.2*Math.sqrt(ak()),z=.1; /* bigger windows, slightly sturdier frames */
  p.frame=[box(p.w+f*2,f,.34,c,p.x,p.y+p.h/2+f/2,z,parent),box(p.w+f*2,f,.34,c,p.x,p.y-p.h/2-f/2,z,parent),
    box(f,p.h,.34,c,p.x-p.w/2-f/2,p.y,z,parent),box(f,p.h,.34,c,p.x+p.w/2+f/2,p.y,z,parent)];
  /* thin dark outline on the frame's front face, along its outer and inner edges. Children of the top bar, so they hide
     and show with the frame (round intro), and tintFrame (which swaps the bars' material) leaves them dark. */
  const t=.045*Math.sqrt(ak()),top=p.frame[0];
  [[p.w+f*2,p.h+f*2],[p.w+t*2,p.h+t*2]].forEach(([w,h])=>{const m=new T.Mesh(outlineGeo(w,h,t),FRAME_LINE);m.position.set(0,-(p.h/2+f/2),.171);top.add(m)})}
const FRAME_LINE=new T.MeshBasicMaterial({color:0x1b2233});
/* a w x h rectangle outline, t thick, drawn inward from its outer edge */
function outlineGeo(w,h,t){const s=new T.Shape(),q=new T.Path(),a=w/2,b=h/2;
  s.moveTo(-a,-b);s.lineTo(a,-b);s.lineTo(a,b);s.lineTo(-a,b);s.closePath();
  q.moveTo(-a+t,-b+t);q.lineTo(-a+t,b-t);q.lineTo(a-t,b-t);q.lineTo(a-t,-b+t);q.closePath();s.holes.push(q);return new T.ShapeGeometry(s)}
function tintFrame(p,c){(p.frame||[]).forEach(m=>m.material=mat(c))}
function makePane(p,parent){const m=new T.Mesh(new T.PlaneGeometry(p.w,p.h),glassMat);m.position.set(p.x,p.y,0);m.renderOrder=3;parent.add(m);p.mesh=m;p.broken=false;addGlare(p)}

/* ---------- facade: a stone wall full of windows, solid between them (a miss thuds off and costs time).
   Front face at ZF, so crossPlane judges glass, shutter and wall at the same plane. Open behind: through a broken window
   you see the yard on the other side (where a bot on the far side would stand). ---------- */
const stoneTex=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#e3bd86';g.fillRect(0,0,w,h);const rows=4,rh=h/rows;
  for(let r=0;r<rows;r++){const off=r%2?w/4:0;for(let c=-1;c<3;c++){g.fillStyle='rgba(255,255,255,'+(.02+((r*7+c*3+9)%5)*.015)+')';g.fillRect(c*w/2+off+4,r*rh+4,w/2-8,rh-8)}}
  g.fillStyle='#d2a971';for(let r=0;r<=rows;r++)g.fillRect(0,r*rh-1.5,w,3);
  for(let r=0;r<rows;r++){const off=r%2?w/4:0;for(let c=0;c<3;c++)g.fillRect(c*w/2+off-1.5,r*rh,3,rh)}});
stoneTex.wrapS=stoneTex.wrapT=T.RepeatWrapping;stoneTex.repeat.set(.4,.4);
function buildFacade(L){
  const g=group,W=L.W,H=L.H,pw=PED.w,ph=PED.h;
  const tb=tbOn(),hole=(sh,p)=>{const q=new T.Path();q.moveTo(p.x-p.w/2,p.y-p.h/2);q.lineTo(p.x-p.w/2,p.y+p.h/2);q.lineTo(p.x+p.w/2,p.y+p.h/2);q.lineTo(p.x+p.w/2,p.y-p.h/2);q.closePath();sh.holes.push(q)};
  let shapes;
  if(tb){ /* turn mode: one flat-topped wall (no raised centre, no clock) */
    const sh=new T.Shape();sh.moveTo(-W,0);sh.lineTo(W,0);sh.lineTo(W,H);sh.lineTo(-W,H);sh.closePath();panes.forEach(p=>hole(sh,p));shapes=[sh]}
  else{const sh=new T.Shape();sh.moveTo(-W,0);sh.lineTo(W,0);sh.lineTo(W,H);sh.lineTo(pw,H);sh.lineTo(pw,H+ph);sh.absarc(0,H+ph,pw,0,Math.PI,false);sh.lineTo(-pw,H);sh.lineTo(-W,H);sh.closePath();
    panes.forEach(p=>hole(sh,p));shapes=[sh]}
  const wall=new T.Mesh(new T.ExtrudeGeometry(shapes,{depth:.38,bevelEnabled:false,curveSegments:24}),[new T.MeshLambertMaterial({map:stoneTex}),mat(0xbf9258)]);
  wall.position.z=ZF-.38;wall.castShadow=true;wall.receiveShadow=true;g.add(wall);
  if(tb){box(W*2+.3,.55,.62,0xa57c48,0,.275,ZF-.19,g); /* plinth */
    box(W*2+.5,.3,.6,0xf6e0b6,0,H+.15,ZF-.19,g); /* flat cornice */
    if(!shuffled())box(.4,H,.62,0xf6e0b6,0,H/2,ZF-.19,g)} /* centre pilaster: your half | the opponent's half (classic split only) */
  else{box(W*2+.3,.55,.62,0xa57c48,0,.275,ZF-.19,g); /* plinth */
    [-1,1].forEach(s=>box(W-pw+.2,.3,.6,0xf6e0b6,s*(W+pw)/2+s*.05,H+.15,ZF-.19,g))} /* cornice either side of the raised centre */
  [-1,1].forEach(s=>box(.4,H+.3,.62,0xf6e0b6,s*(W+.05),(H+.3)/2,ZF-.19,g)); /* corner posts */
  panes.forEach(p=>{makeFrame(p,g,p.fc||FRAME);makePane(p,g);
    const f=.2*Math.sqrt(ak());box(p.w+f*3.2,f*.6,.56,0xf6e0b6,0,-f*.8,.1,p.frame[1]); /* stone sill under the window: gives the facade depth (visual only) */
    if(p.side)p.inner=roomBehind(p,g)});
  if(!tb)clock=buildClock(0,H+ph,ak()); /* turn mode has no clock: the footballs in the turn pill count kicks */
}
/* Is (x,y) on the facade's solid wall (the window holes are checked before this)? */
function facadeAt(x,y){const W=LVL.W,H=LVL.H;if(Math.abs(x)>W+.25||y<0)return false;if(tbOn())return y<=H+.05;if(y<=H+.05)return true;if(Math.abs(x)>PED.w)return false;const dy=y-H-PED.h;return dy<=0||Math.hypot(x,dy)<=PED.w+.05}

/* ---------- round clock on the facade: the gold wedge is the time left, it turns red for the last 10 s and pulses in sudden death;
   the seconds left sit in the middle (num), white-outlined so they read on gold, red and cream. No needle, so nothing crosses them. ---------- */
let clock=null;
function buildClock(cx0,cy0,r){
  const g=new T.Group(),z=ZF+.01,x=0,y=0;g.position.set(cx0,cy0,0);group.add(g); /* own group: it pops bigger on each of the last 5 seconds */
  let popAt=-1;
  const disc=(rad,c,dz)=>{const m=new T.Mesh(new T.CircleGeometry(rad,48),bmat(c));m.position.set(x,y,z+dz);g.add(m);return m};
  disc(r+.14,0x23304a,0);const face=disc(r,0xfff8e8,.005);
  const wm=new T.MeshBasicMaterial({color:GOLD,side:T.DoubleSide}),wedge=new T.Mesh(new T.BufferGeometry(),wm);wedge.position.set(x,y,z+.01);g.add(wedge);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,t=box(.06,i%3?.12:.22,.01,0x23304a,x+Math.sin(a)*r*.84,y+Math.cos(a)*r*.84,z+.015,g,false);t.rotation.z=-a}
  /* the number: a canvas texture on a plane over the face, redrawn when the second changes */
  const cv=document.createElement('canvas');cv.width=cv.height=256;const cx=cv.getContext('2d'),tex=new T.CanvasTexture(cv);
  const nm=new T.Mesh(new T.PlaneGeometry(r*1.5,r*1.5),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));nm.position.set(x,y,z+.03);nm.renderOrder=4;g.add(nm);
  let lastN=null,lastW=null;
  const drawN=(n,w)=>{cx.clearRect(0,0,256,256);cx.font='400 150px "Lilita One","Trebuchet MS",sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.lineJoin='round';
    cx.lineWidth=26;cx.strokeStyle='#fff8e8';cx.strokeText(n,128,138);cx.fillStyle=w?'#c8281e':'#23304a';cx.fillText(n,128,138);tex.needsUpdate=true};
  if(document.fonts&&!document.fonts.check(TAG_FONT))document.fonts.load(TAG_FONT).then(()=>{if(lastN!==null)drawN(lastN,lastW)},()=>{}); /* iOS: redraw once the font is in */
  let lastK=-1;
  return{pop(){popAt=performance.now()},
    set(k,warn,sudden){
    if(popAt>=0){const u=(performance.now()-popAt)/450;g.scale.setScalar(u<1?1+.22*Math.exp(-u*4)*Math.cos(u*7):1);if(u>=1)popAt=-1}
    if(Math.abs(k-lastK)>.003||(k===0&&lastK!==0)){lastK=k;wedge.geometry.dispose();wedge.geometry=k>0?new T.CircleGeometry(r*.97,Math.max(3,Math.ceil(64*k)),Math.PI/2,k*Math.PI*2):new T.BufferGeometry()}
    wm.color.setHex(warn?TEAM.bot:GOLD);
    face.material=bmat(sudden&&Math.sin(lt*10)>0?0xffb3a6:0xfff8e8)},
    num(n,w){if(n===lastN&&w===lastW)return;lastN=n;lastW=w;drawN(String(n),w)}};
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
  clearLevel();sandbox=false;level=(i+LV.length)%LV.length;const k0=ak();LVL=scaleLevel(LV[level]);PED.w=PED0.w*ak();PED.h=PED0.h*ak();if(ak()!==k0)layout();
  group=new T.Group();scene.add(group);
  panes=(LVL.layout?LVL.layout():LVL.panes).map(p=>Object.assign({},p));if(tbOn())turnPanes(panes);placeSpots();lt=0;wind=LVL.wind||0;
  if(LVL.type==='facade')buildFacade(LVL);else if(LVL.type==='stand')buildStand(LVL);
  buildMech(LVL);
  won=false;hintDone=false;hintT=null;
  if(LVL.vs)vsStart(LVL);else drawScore();spawnBall(); /* after vsStart: the first ball goes to whoever kicks first */
  updateHint();chips();
}
/* Dev sandbox: empty yard with unlimited balls, for testing kick feel and juice (no bot, no round). */
let sandbox=false;
function loadSandbox(){
  const k0=ak();clearLevel();sandbox=true;LVL={name:'Sandbox',type:'sandbox',panes:[]};PED.w=PED0.w;PED.h=PED0.h;if(k0!==1)layout();placeSpots();
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
