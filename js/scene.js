'use strict';
/* ---------- renderer and scene ---------- */
const canvas=$('gl'), fx=$('fx'), fctx=fx.getContext('2d');
const renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(), camera=new T.PerspectiveCamera(46,1,.1,400);
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return new T.CanvasTexture(c)}
scene.background=canvasTex(8,256,(g,w,h)=>{const a=g.createLinearGradient(0,0,0,h);a.addColorStop(0,'#3f9fdf');a.addColorStop(.55,'#9bd6ef');a.addColorStop(.75,'#ffe9bf');g.fillStyle=a;g.fillRect(0,0,w,h)});
const hemi=new T.HemisphereLight(0xffffff,0x93b56a,.72);scene.add(hemi);
const sun=new T.DirectionalLight(0xfff1d6,.72); sun.position.set(-11,20,17); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-30,right:30,top:34,bottom:-26,near:1,far:110}); /* room for the bigger, farther arena (long kick) */ scene.add(sun);

const TEAM_P=0x2a8a3e,TEAM_B=0xf08a24; /* you: dark green, opponent: orange (dark vs bright, readable for colour-blind players too) */ /* team colours (vs.js TEAM uses the same) */
const mats={};
const mat=c=>mats[c]||(mats[c]=new T.MeshLambertMaterial({color:c}));
const bmats={};
const bmat=c=>bmats[c]||(bmats[c]=new T.MeshBasicMaterial({color:c}));
function box(w,h,d,c,x,y,z,p,shadow){const m=new T.Mesh(new T.BoxGeometry(w,h,d),typeof c==='number'?mat(c):c);m.position.set(x,y,z);if(shadow!==false){m.castShadow=true;m.receiveShadow=true}p.add(m);return m}

/* ---------- static yard ---------- */
const world=new T.Group(); scene.add(world);
(function yard(){
  const tex=canvasTex(256,256,(g,w,h)=>{for(let i=0;i<4;i++){g.fillStyle=i%2?'#6bb64f':'#62ac47';g.fillRect(i*w/4,0,w/4,h)}for(let i=0;i<1400;i++){g.fillStyle=Math.random()<.5?'rgba(255,255,190,.05)':'rgba(20,70,20,.06)';g.fillRect(Math.random()*w,Math.random()*h,2,5)}});
  tex.wrapS=tex.wrapT=T.RepeatWrapping; tex.repeat.set(16,16); tex.anisotropy=4;
  const ground=new T.Mesh(new T.PlaneGeometry(320,320),new T.MeshLambertMaterial({map:tex}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; world.add(ground);
  [[-70,-95,46,15,0x7fb86a],[20,-110,70,22,0x6fab60],[85,-90,44,13,0x86bf70],[-20,-130,90,30,0x8fbf86]].forEach(a=>{const m=new T.Mesh(new T.SphereGeometry(1,14,8),mat(a[4]));m.scale.set(a[2],a[3],30);m.position.set(a[0],0,a[1]);world.add(m)});
  const tree=(x,z,s,c)=>{const g=new T.Group();box(.55,3,.55,0x7a5532,0,1.5,0,g);[[0,3.8,0,2],[-.9,3.2,.3,1.35],[.9,3.3,-.2,1.45],[0,5,0,1.3]].forEach(l=>{const m=new T.Mesh(new T.IcosahedronGeometry(l[3],1),mat(c));m.position.set(l[0],l[1],l[2]);m.castShadow=true;g.add(m)});g.position.set(x,0,z);g.scale.setScalar(s);world.add(g)};
  [[-15,-5,1.5,0x4f9a45],[15.5,-6,1.65,0x459040],[-23,-14,2,0x5ba84e],[24,-15,2.1,0x4f9a45],[-9,-20,2.3,0x66ae55],[10,-24,2.5,0x5ba84e],[-32,-6,1.7,0x459040],[33,-5,1.6,0x66ae55]].forEach(a=>tree(...a));
  const n=70, geo=new T.BoxGeometry(.28,1.5,.1), pick=new T.InstancedMesh(geo,mat(0xfaf3e3),n), d=new T.Object3D();
  for(let i=0;i<n;i++){const s=i<n/2?-1:1,k=i<n/2?i:i-n/2;d.position.set(s*(8+k*.62),.75,-1.4);d.updateMatrix();pick.setMatrixAt(i,d.matrix)}pick.castShadow=true;world.add(pick);
  [-1,1].forEach(s=>[.5,1.1].forEach(y=>box(22,.12,.06,0xefe6d2,s*19,y,-1.48,world,false)));
})();
/* ---------- a small neutral crowd standing behind the fence on both sides of the building: flat cut-outs (one sheet of
   16 people, each a plane facing the camera), heads and shoulders above the fence. Static scenery, no collisions. ---------- */
(function crowd(){
  const N=16,pk=a=>a[Math.floor(Math.random()*a.length)],
    TOPS=['#d94b3d','#3f7fd0','#f2c230','#f4f4f4','#3a9b5c','#8a5bc4','#f08a3c','#2f3542','#e86f9a','#5bc0d6','#9aa3ad','#7a5232'],
    LEGS=['#2f3a55','#3b3b3b','#5a4a3a','#6b7c99','#25303f'],SKINS=['#f1c9a5','#e0ac83','#c68a5e','#8d5a3b','#5e3a26'],HAIRS=['#2b1d14','#4a2f1d','#8a5a2b','#d9b25c','#1a1a1a','#b8b8b8'];
  const tex=canvasTex(64*N,160,(g,w,h)=>{for(let i=0;i<N;i++){const cx=i*64+32,top=pk(TOPS),skin=pk(SKINS),hair=pk(HAIRS),leg=pk(LEGS);
    g.fillStyle=leg;g.fillRect(cx-11,100,9,60);g.fillRect(cx+2,100,9,60); /* legs */
    g.fillStyle=top;g.beginPath();g.moveTo(cx-15,104);g.lineTo(cx-16,46);g.quadraticCurveTo(cx-15,36,cx-6,35);g.lineTo(cx+6,35);g.quadraticCurveTo(cx+15,36,cx+16,46);g.lineTo(cx+15,104);g.closePath();g.fill(); /* body */
    const up=i%4===1; /* now and then an arm up */
    g.fillRect(cx-21,up?6:42,6,up?40:44);g.fillRect(cx+15,42,6,44);
    g.fillStyle=skin;g.beginPath();g.arc(cx-18,up?6:88,4,0,7);g.arc(cx+18,88,4,0,7);g.fill();
    g.fillRect(cx-3,28,6,8);g.beginPath();g.ellipse(cx,20,9,11,0,0,7);g.fill(); /* neck, head */
    g.fillStyle=hair;g.beginPath();g.ellipse(cx,15,9.5,7,0,Math.PI,0);g.fill();
    if(i%5===2){g.fillStyle=pk(TOPS);g.beginPath();g.ellipse(cx,13,10.5,6,0,Math.PI,0);g.fill();g.fillRect(cx-1,11,13,3)} /* cap */
    if(i%6===3){g.fillStyle=pk(TOPS);g.fillRect(cx-15,40,30,6)} /* scarf */
  }});
  const m=new T.MeshBasicMaterial({map:tex,alphaTest:.5,color:0xe6e6e6}); /* a touch darker than full white, so they sit in the scene */
  const add=(x,z)=>{const hgt=rnd(1.6,1.82),q=new T.PlaneGeometry(hgt*.4,hgt),uv=q.attributes.uv,id=Math.floor(Math.random()*N);
    for(let v=0;v<uv.count;v++)uv.setX(v,(id+uv.getX(v))/N);
    const p=new T.Mesh(q,m);p.position.set(x,hgt/2,z);world.add(p)};
  /* loose clumps along the fence, beyond the building's sides (the facade is at most ~12.6 m wide each way) */
  [-1,1].forEach(s=>{let x=13.6;while(x<27){const c=1+Math.floor(Math.random()*3);for(let j=0;j<c;j++)add(s*(x+j*.62),rnd(-2.2,-3.4));x+=c*.62+rnd(.6,2.2)}});
})();
const clouds=[];
for(let i=0;i<6;i++){const g=new T.Group();for(let k=0;k<4;k++){const m=new T.Mesh(new T.IcosahedronGeometry(rnd(2.5,5),1),bmat(0xffffff));m.position.set(k*4-6,rnd(-1,1),rnd(-1,1));m.scale.y=.62;g.add(m)}g.position.set(rnd(-90,90),rnd(26,44),-110);g.userData.s=rnd(.5,1.2);clouds.push(g);scene.add(g)}

/* kick spots: the player's (green ring) and the bot's (red ring) */
function kickSpot(ring){const s=new T.Group(),a=new T.Mesh(new T.CircleGeometry(1.15,28),new T.MeshLambertMaterial({color:0xa98e5c}));a.rotation.x=-Math.PI/2;a.position.y=.02;a.receiveShadow=true;s.add(a);const r=new T.Mesh(new T.RingGeometry(.92,1.04,32),bmat(ring));r.rotation.x=-Math.PI/2;r.position.y=.03;s.add(r);scene.add(s);return s}
const spot=kickSpot(TEAM_P),botSpot=kickSpot(TEAM_B);botSpot.visible=false;

/* ---------- camera layout ---------- */
let gainX=.02,gainHigh=.02,gainLow=.01;const KNEE=3;
const camBase=new T.Vector3();let W_=1,H_=1,camLook=new T.Vector3(0,3,0);
/* Camera x (added to camBase / camLook). It never moves during a round (moving cameras make players motion-sick):
   straight behind your ball vs the robot or online, so a straight-up swipe goes straight ahead and your half is in
   front of you; on the middle of the wall in pass-and-play (two players share the screen) and the sandbox. */
let camX=0;
const camGoal=()=>!LVL||!LVL.vs||sandbox||OPP.mode==='local'?0:PX;
/* Kick spots: mirror images at the same distance from the wall, one centred in front of each half (x = -SX blue, +SX red),
   pulled in on narrow screens so both stay in view. Outside VS (sandbox) your spot is in the middle. */
let BX=2.4,BZ=13,PX=0,SX=2.4,SHW=4;
function placeSpots(){
  /* SHW = half the view's width at the kick spots. With the camera behind you (robot / online) the spots come in
     until the opponent's spot still fits at the right edge (phones in portrait); pass-and-play keeps them wider. */
  const w=clamp(SHW*.55,1.6,3.4);SX=OPP.mode==='local'?w:Math.min(w,Math.max(.9,(SHW-.6)/2));
  PX=LVL&&LVL.vs?-SX:0;camX=camGoal();
  const ks=LVL&&LVL.vs?Math.min(1,(SX-.08)/1.15):1;spot.scale.setScalar(ks);botSpot.scale.setScalar(ks); /* close spots (portrait): smaller discs, so they don't overlap */BX=SX;BZ=D;spot.position.set(PX,0,D);botSpot.position.set(BX,0,BZ);
  if(cur){cur.p.set(cur.owner==='bot'?BX:PX,cur.p.y,D);cur.sh.position.set(cur.p.x,.04,D)}
  placeBot();placeKids();
}
function layout(){
  W_=$('stage').clientWidth||innerWidth;H_=$('stage').clientHeight||innerHeight;const a=W_/H_;
  renderer.setSize(W_,H_,false);const dpr=Math.min(devicePixelRatio||1,2);fx.width=W_*dpr;fx.height=H_*dpr;fctx.setTransform(dpr,0,0,dpr,0,0);
  let fov,z;
  if(a>=1){fov=46;z=21;D=13}else{fov=62;z=Math.max(21,7.9/(Math.tan(31*Math.PI/180)*a));D=z-7.2}
  z+=2; /* camera a little further back so the ball sits higher on screen (D unchanged) */
  /* Long kick: the facade is ak() times bigger, so put it ak() times further from the camera (same size on screen) and
     move the kick spot back with it; the camera stays the same distance behind the ball. The camera drops a little so the
     gap between the ball and the foot of the wall stays about the same on screen, and its tilt keeps the ball where it was. */
  const k=ak(),off=z-D,cy=3.2-1.1*(k-1),pitch0=Math.atan2(-.2,z),aBall=Math.atan2(R-3.2,off)-pitch0;
  z*=k;D=z-off;const pitch=Math.atan2(R-cy,off)-aBall;camLook.y=cy+z*Math.tan(pitch);
  camera.fov=fov;camera.aspect=a;camera.updateProjectionMatrix();camBase.set(0,cy,z);camera.position.copy(camBase);camera.lookAt(camLook);camera.updateMatrixWorld();
  gainHigh=gainX=2*Math.tan(fov/2*Math.PI/180)*z/H_;gainLow=(KNEE*ak()-R)/Math.max(60,toScreen(0,R,D)[1]-toScreen(0,KNEE*ak(),ZF)[1]);
  SHW=Math.tan(fov/2*Math.PI/180)*a*(camBase.z-D);placeSpots();
  sun.target.position.set(0,0,4);scene.add(sun.target);updateHint();
}
const proj=new T.Vector3();
function toScreen(x,y,z){proj.set(x,y,z).project(camera);return[(proj.x+1)/2*W_,(1-proj.y)/2*H_]}
function updateHint(){
  if(!LVL)return;const t=panes.find(p=>isOpen(p)&&(!p.side||p.side==='p')),show=!hintDone&&!sandbox&&!won&&!VS.intro&&!!LVL.tut&&!!t; /* not during the turn-mode round intro (vs.js introDone shows it) */$('hint').hidden=!show;if(!show)return;
  const a=toScreen(PX,.3,D),b=toScreen(t.x,t.y,0),h=$('hint');
  h.style.setProperty('--x0',a[0]+'px');h.style.setProperty('--y0',(a[1]-16)+'px');h.style.setProperty('--x1',b[0]+'px');h.style.setProperty('--y1',b[1]+'px');
}

