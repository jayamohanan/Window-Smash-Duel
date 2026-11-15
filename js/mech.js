'use strict';
/* ---------- level mechanics ----------
   Solid obstacles (oriented boxes the ball bounces off), movers (per-frame animation), roller shutters, wooden boards,
   wired glass, sliding board, wind, windmills, gap wheel, free-standing panes, carousel, spin boards / flip panels, gantry.
   All of it assumes the ball comes from the front (+z, the player's side). */
let obs=[],movers=[],lt=0,wind=0,MILLS=[]; /* MILLS: each windmill's turning maths, so the bot can see if its kick would hit a sail */
const _lp=new T.Vector3(),_lq=new T.Vector3(),_ld=new T.Vector3(),_n=new T.Vector3(),_rv=new T.Vector3(),_wp=new T.Vector3();

/* Bounce per material: e = restitution along the normal, f = friction kept along the surface. */
const OBK={wood:{e:.45,f:.75,snd:'wood'},roof:{e:.3,f:.82,snd:'thud'},wall:{e:.35,f:.7,snd:'thud'},metal:{e:.5,f:.8,snd:'clang'}};
/* Register a box() mesh as a solid. Meshes used as solids must not be scaled. */
function addOb(m,kind){const g=m.geometry.parameters;obs.push({m,kind,h:new T.Vector3(g.width/2,g.height/2,g.depth/2),inv:new T.Matrix4(),q:new T.Quaternion(),vel:new T.Vector3(),last:null});return m}
function updateObs(dt){
  if(group)group.updateMatrixWorld(true);
  obs.forEach(o=>{o.m.getWorldPosition(_wp);
    if(o.last){if(dt>0)o.vel.copy(_wp).sub(o.last).divideScalar(dt)}else o.last=new T.Vector3();
    o.last.copy(_wp);o.inv.copy(o.m.matrixWorld).invert();o.m.getWorldQuaternion(o.q)});
}
function mechTick(dt){lt+=dt;movers.forEach(f=>f(lt,dt));updateObs(dt)}

/* Sphere vs oriented box, in the box's local frame. Moving solids hand their velocity to the ball. */
function hitObs(b){
  if(b.ghost||b.rebound)return; /* a rebounding ball is on a set path to its glass */
  for(const o of obs){
    if(o.skip&&o.skip(b))continue;
    if(o.mill&&b.glanceT>lt)continue; /* just glanced: let it clear the windmill */
    _lp.copy(b.p).applyMatrix4(o.inv);const h=o.h;
    let nx=_lp.x-clamp(_lp.x,-h.x,h.x),ny=_lp.y-clamp(_lp.y,-h.y,h.y),nz=_lp.z-clamp(_lp.z,-h.z,h.z),d=Math.hypot(nx,ny,nz);
    if(d>=R)continue;
    if(d<1e-4){const px=h.x-Math.abs(_lp.x),py=h.y-Math.abs(_lp.y),pz=h.z-Math.abs(_lp.z);
      if(px<py&&px<pz){_n.set(Math.sign(_lp.x)||1,0,0);d=-px}else if(py<pz){_n.set(0,Math.sign(_lp.y)||1,0);d=-py}else{_n.set(0,0,Math.sign(_lp.z)||1);d=-pz}}
    else _n.set(nx/d,ny/d,nz/d);
    if(o.sail&&b.v.z<0&&_lp.z>=-h.z&&glance(b,o,_lp))continue;
    _n.applyQuaternion(o.q);b.p.addScaledVector(_n,R-d+.004);
    _rv.copy(b.v).sub(o.vel);const vn=_rv.dot(_n);
    if(vn<0){const k=OBK[o.kind];_rv.addScaledVector(_n,-vn).multiplyScalar(k.f).addScaledVector(_n,-vn*k.e);b.v.copy(_rv).add(o.vel);obHit(b,o,-vn)}
  }
}
/* Windmill glance: a ball touching the outer 10% of a sail's width (either long edge) or its tip keeps going toward the
   building instead of bouncing back. It keeps 55-80% of its forward speed (more the nearer the very edge), gets a 3-5 m/s
   push off the sail plus some of the sail's own motion, and flies on with no aim help or steering. The middle 80% of the
   sail, the arms and the hub still bounce it back (hitObs). lp: ball centre in the sail's frame (x along it, y across). */
const _gn=new T.Vector3();
function glance(b,o,lp){
  const h=o.h,band=.2*h.y,cy=clamp(lp.y,-h.y,h.y),cx=clamp(lp.x,-h.x,h.x);
  const side=Math.abs(cy)>h.y-band,tip=cx>h.x-band;if(!side&&!tip)return false;
  const e=side?(Math.abs(cy)-(h.y-band))/band:(cx-(h.x-band))/band; /* 0 at the band's inner line, 1 at the very edge */
  _gn.set(side?0:1,side?Math.sign(cy)||1:0,0).applyQuaternion(o.q);_gn.z=0;_gn.normalize(); /* off the sail, in the wall's plane */
  const push=rnd(3,5);
  b.v.z*=.55+.25*clamp(e,0,1);b.v.x=b.v.x*.8+_gn.x*push+o.vel.x*.5;b.v.y=b.v.y*.8+_gn.y*push+o.vel.y*.5;
  b.p.addScaledVector(_gn,.05);
  b.live=false;b.glance=true;b.glanceT=lt+.15;b.a.set(0,-S.gravity,0);
  if(b.state==='fly'||b.state==='ground'){b.state='bounce';b.age=Math.min(b.age,.4)}
  sfx.tick();netSfx(b,'tick');
  for(let i=0;i<6;i++)dust.emit(b.p.x,b.p.y,b.p.z,rnd(-1.2,1.2),rnd(-.6,1.4),rnd(0,1),rnd(.2,.4),[.92,.8,.6],2);
  return true;
}
function obHit(b,o,imp){
  if(o.hit)o.hit(b);
  if(b.live){b.live=false}
  b.a.set(0,-S.gravity,0);
  if(b.state==='fly'||b.state==='ground'){b.state='bounce';b.age=Math.min(b.age,.4)}
  if(imp<2.5)return;
  const k=OBK[o.kind];sfx[k.snd]();netSfx(b,k.snd);addShake(Math.min(.25,imp*.012));
  if(o.kind==='metal')for(let i=0;i<16;i++)spark.emit(b.p.x,b.p.y,b.p.z,rnd(-4,4),rnd(-2,4),rnd(-1,4),rnd(.15,.35),[1,.85,.45],6);
  for(let i=0;i<12;i++)dust.emit(b.p.x,b.p.y,b.p.z,rnd(-2,2),rnd(-1,2.4),rnd(0,2),rnd(.25,.5),[.92,.8,.6],2);
}

/* Build every mechanic a level lists. Runs after buildFacade/buildStand. */
function buildMech(L){
  if(L.field==='carousel')buildCarousel(L);else if(L.field==='flip')buildFlips(L);
  panes.forEach(p=>{if(p.shutter)buildShutter(p);if(p.armor)buildBoards(p);if(p.hp>1)buildWired(p)});
  if(!isPractice())(L.mills||(L.mill?[L.mill]:[])).forEach(buildMill); /* the practice match (vs.js) has no windmills */
  if(L.wheel)buildWheel(L.wheel);
  if(L.gantry)buildGantry(L.gantry);
  if(L.spin)buildSpins(L);
  if(L.board)buildBoard(L.board);
  if(wind)buildWind();
  updateObs(0);
}

/* ---------- roller shutter: rolls down over the glass and back up.
   shutter:{phase} = on a loop; shutter:{ctrl:true} = driven by the game (p.shutGoal 1 = shut, 0 = open; p.onShut runs
   when it is fully down). A ctrl shutter also comes down over a broken window, and clangs balls like a closed one. ---------- */
const SH_T=4.2,SH_MOVE=.42;
function shutAmt(t,ph){const u=((t/SH_T+ph)%1+1)%1;let f=u<.4?0:u<.48?(u-.4)/.08:u<.92?1:1-(u-.92)/.08;return f*f*(3-2*f)}
function buildShutter(p){
  const top=p.y+p.h/2,bh=.26,n=Math.ceil(p.h/bh)+1,bars=[],ctrl=!!p.shutter.ctrl;
  for(let j=0;j<n;j++){const m=box(p.w+.12,bh*.95,.07,j%2?0x9aa6b8:0x8793a6,p.x,top,.3,group,false);m.visible=false;bars.push(m)}
  const hous=box(p.w+.5,.46,.56,0x5f6b80,p.x,top+.2,.36,group);
  if(ctrl){p.shutK=p.shutGoal=p.shutter.start===undefined?1:p.shutter.start}
  const place=f=>{const yb=top-f*p.h;p.shutF=f;p.shutY=yb;bars.forEach((m,j)=>{const cy=yb+(j+.5)*bh;m.position.y=cy;m.visible=f>.003&&cy-bh/2<top})};
  place(ctrl?p.shutK:0);
  movers.push((t,dt)=>{
    if(ctrl){const k0=p.shutK;p.shutK=k0<p.shutGoal?Math.min(p.shutGoal,k0+dt/SH_MOVE):Math.max(p.shutGoal,k0-dt/SH_MOVE);
      place(p.shutK*p.shutK*(3-2*p.shutK));if(k0<1&&p.shutK>=1&&p.onShut)p.onShut(p);return}
    if(p.broken){hous.visible=false;bars.forEach(m=>m.visible=false);p.shutF=0;return}
    place(shutAmt(t,p.shutter.phase))});
}

/* ---------- wooden boards nailed over a window: one kick breaks them, the next breaks the glass ---------- */
function buildBoards(p){
  const bg=new T.Group();bg.position.set(p.x,p.y,.44);group.add(bg);p.boards=bg;p.planks=[];
  const n=Math.max(3,Math.round(p.h/.56)),sp=p.h/n;
  for(let i=0;i<n;i++){const y=-p.h/2+sp*(i+.5),c=i%2?0x9a663a:0xb07a46,m=box(p.w+.6,sp*.9,.1,c,0,y,0,bg);m.rotation.z=(i%2?-1:1)*.045;p.planks.push({y,c,w:p.w+.6,h:sp*.9});
    [-1,1].forEach(s=>box(.09,.09,.04,0x3a3a44,s*(p.w/2+.05),y,.07,bg,false))}
}
function breakBoards(p,b){
  p.armor--;p.boards.visible=false;
  p.planks.forEach(k=>[-1,1].forEach(s=>{const m=new T.Mesh(sharedDebris,mat(k.c));m.scale.set(k.w/2,k.h,.1);m.position.set(p.x+s*k.w/4,p.y+k.y,.5);scene.add(m);
    debris.push({m,v:new T.Vector3(s*rnd(1.5,4.5),rnd(2,6),rnd(2.5,7)),w:new T.Vector3(rnd(-8,8),rnd(-8,8),rnd(-8,8)),floor:.06,zMin:.4,zMax:40,xMin:-40,xMax:40,age:0,rest:false})}));
  for(let i=0;i<40;i++)dust.emit(b.p.x,b.p.y,.5,rnd(-4,4),rnd(-2,5),rnd(0,5),rnd(.3,.7),[.75,.55,.32],7);
  sfx.wood();addShake(.4);freezeT=.05;
}

/* ---------- wired glass: needs two kicks; the first leaves cracks ---------- */
const wireTex=canvasTex(128,128,(g,w,h)=>{g.strokeStyle='rgba(70,90,110,.55)';g.lineWidth=2;for(let i=-4;i<8;i++){g.beginPath();g.moveTo(i*32,0);g.lineTo(i*32+h,h);g.stroke();g.beginPath();g.moveTo(i*32+h,0);g.lineTo(i*32,h);g.stroke()}});
wireTex.wrapS=wireTex.wrapT=T.RepeatWrapping;
function buildWired(p){
  const t=wireTex.clone();t.needsUpdate=true;t.repeat.set(p.w/.9,p.h/.9);
  const wm=new T.Mesh(new T.PlaneGeometry(p.w,p.h),new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));wm.position.set(p.x,p.y,p.sg?.05:.015);wm.renderOrder=4;(p.sg||group).add(wm);
  const c=document.createElement('canvas');c.width=256;c.height=Math.round(256*p.h/p.w);const ct=new T.CanvasTexture(c);
  const cm=new T.Mesh(new T.PlaneGeometry(p.w,p.h),new T.MeshBasicMaterial({map:ct,transparent:true,depthWrite:false}));cm.position.set(p.x,p.y,p.sg?.06:.03);cm.renderOrder=5;(p.sg||group).add(cm);
  p.extra=[wm,cm];p.crackCv=c;p.crackTex=ct;
}
function crackPane(p,b,lh){
  p.hp--;const c=p.crackCv,g=c.getContext('2d'),k=c.width/p.w,src=lh||b.p;
  const lx=(clamp(src.x-p.x,-p.w/2,p.w/2)+p.w/2)*k,ly=(p.h/2-clamp(src.y-p.y,-p.h/2,p.h/2))*k,lines=[];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2+rnd(-.2,.2),L=rnd(70,190);let x=lx,y=ly;const pts=[[x,y]];for(let s=0;s<6;s++){const ang=a+rnd(-.4,.4);x+=Math.cos(ang)*L/6;y+=Math.sin(ang)*L/6;pts.push([x,y])}lines.push(pts)}
  const rings=[1,3].map(r=>lines.map(l=>l[r]));
  const stroke=(col,wd)=>{g.strokeStyle=col;g.lineWidth=wd;g.lineCap=g.lineJoin='round';lines.forEach(l=>{g.beginPath();l.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke()});
    rings.forEach(r=>{g.beginPath();r.forEach((q,i)=>i?g.lineTo(q[0]+rnd(-3,3),q[1]+rnd(-3,3)):g.moveTo(q[0],q[1]));g.closePath();g.stroke()})};
  stroke('rgba(35,48,74,.45)',4.5);stroke('rgba(255,255,255,.95)',2);
  p.crackTex.needsUpdate=true;
  for(let i=0;i<30;i++)spark.emit(b.p.x,b.p.y,p.sg?b.p.z:.2,rnd(-4,4),rnd(-3,5),rnd(0,5),rnd(.15,.45),[.85,.95,1],8);
  sfx.crack();addShake(.32);freezeT=.05;
}

/* ---------- sliding board: a wooden barrier on a ground rail, sliding across the windows ---------- */
const boardTex=canvasTex(256,192,(g,w,h)=>{g.fillStyle='#c58a52';g.fillRect(0,0,w,h);g.fillStyle='#9a6438';for(let i=1;i<8;i++)g.fillRect(i*w/8-1,0,3,h);
  g.fillStyle='rgba(255,255,255,.07)';for(let i=0;i<8;i++)g.fillRect(i*w/8+6,0,8,h);
  for(let i=-2;i<18;i++){g.fillStyle=i%2?'#23304a':'#ffc53a';g.beginPath();g.moveTo(i*16,0);g.lineTo(i*16+16,0);g.lineTo(i*16+36,20);g.lineTo(i*16+20,20);g.closePath();g.fill()}
  g.fillStyle='#23304a';g.fillRect(0,20,w,3)});
function buildBoard(o){
  const bw=o.w||3.2;box(o.amp*2+bw+1.2,.08,.36,0x8d8577,0,.04,o.z,group,false);
  const bd=new T.Group();bd.position.set(0,0,o.z);group.add(bd);
  addOb(box(bw,4.2,.26,new T.MeshLambertMaterial({map:boardTex}),0,2.55,0,bd),'wood');
  addOb(box(bw+.2,.24,.7,0x6b4a2c,0,.46,0,bd),'wood');
  const wg=new T.CylinderGeometry(.3,.3,.16,14);[-bw*.38,bw*.38].forEach(x=>[-1,1].forEach(s=>{const w=new T.Mesh(wg,mat(0x2b2230));w.rotation.x=Math.PI/2;w.position.set(x,.3,s*.4);w.castShadow=true;bd.add(w)}));
  movers.push(t=>{bd.position.x=o.amp*Math.sin(t*o.speed)});
}


/* Glass first: the glass counts from the moment the ball touches the frame's front face (frame front z .27 + ball radius),
   and it is checked before the frames, so a ball whose centre is over the glass breaks it even if its side clips the frame.
   Only a ball centred on the frame or outside it bounces off the wood (same rule as house windows). */
const GLASS_REACH=.27+R+.02;
/* Free-pane hit test (free-standing, carousel and flip panes): the ball touches the glass from its front side. */
/* prev = where the ball was a substep ago, so a fast ball can't skip over the thin hit zone */
function freeHit(b,prev){
  if(b.ghost)return;
  for(const p of panes){if(!p.inv||p.broken||p.locked)continue;_lp.copy(b.p).applyMatrix4(p.inv);const z1=_lp.z,z0=prev?_lq.copy(prev).applyMatrix4(p.inv).z:z1;
    const lo=p.inner?-R:p.oneWay?-.05:-.5,hi=p.inner?.05:GLASS_REACH;
    /* angled glass: judge by where the ball's path will pierce the glass, not where its centre is now, so a ball sweeping
       along a slanted pane isn't caught by the far frame bar on its way in (straight-on hits land on the same spot) */
    if(!p.inner&&z1>0&&z1<hi){_ld.copy(b.v).transformDirection(p.inv);if(_ld.z<-.05){const t=z1/-_ld.z;_lp.x+=_ld.x*t;_lp.y+=_ld.y*t}}
    if(Math.abs(_lp.x)<=p.w/2+.08&&Math.abs(_lp.y)<=p.h/2+.08&&Math.min(z0,z1)<hi&&Math.max(z0,z1)>lo){
      if(p.hp>1){crackPane(p,b,_lp.clone());stopBall(b);return}
      smash(p,b,_lp.clone());return}}
}

/* ---------- wind: steady sideways push on the ball, shown with streaks, leaves and a flag ---------- */
function buildWind(){
  const g=group,dir=Math.sign(wind);
  /* flag on top of the facade (or a tall pole beside the stand), pointing downwind */
  const L=LVL,fa=L.type==='facade',py=fa?L.H+PED.h+PED.r-.2:0,ph=fa?2.6:7.5,px=fa?0:-6,pz=fa?-.05:-1;
  box(.13,ph,.13,0xfffaf0,px,py+ph/2,pz,g);
  const fg=new T.PlaneGeometry(1.9,1.1,10,1);fg.translate(.95,0,0);
  const flag=new T.Mesh(fg,new T.MeshLambertMaterial({color:0xd9503f,side:T.DoubleSide}));flag.position.set(px,py+ph-.6,pz);flag.rotation.y=dir>0?0:Math.PI;g.add(flag);
  const base=fg.attributes.position.array.slice();
  const sgeo=new T.BoxGeometry(1,.045,.045),st=[];
  const seed=(s,first)=>{s.m.position.set(first?rnd(-15,15):-dir*rnd(12,16),rnd(.6,9.5),rnd(-1,D+1));s.m.scale.x=rnd(1,2.8);s.u=first?Math.random():0;s.d=rnd(1.2,2.4)};
  for(let i=0;i<38;i++){const s={m:new T.Mesh(sgeo,new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false}))};g.add(s.m);seed(s,true);st.push(s)}
  let leafT=0;
  movers.push((t,dt)=>{
    const pa=fg.attributes.position;for(let i=0;i<pa.count;i++){const x=base[i*3];pa.array[i*3+2]=Math.sin(x*3.2-t*11)*.17*x/1.9}pa.needsUpdate=true;
    st.forEach(s=>{s.u+=dt/s.d;s.m.position.x+=wind*3*dt;s.m.material.opacity=Math.sin(Math.PI*clamp(s.u,0,1))*.6;if(s.u>=1)seed(s,false)});
    leafT-=dt;if(leafT<0){leafT=.1;dust.emit(-dir*rnd(9,14),rnd(1,8),rnd(-1,D),wind*rnd(1.6,2.6),rnd(-.4,.6),rnd(-.4,.4),rnd(3,5),Math.random()<.5?[.45,.72,.25]:[.95,.7,.25],.35)}
  });
}

/* ---------- free pane: glass at any position and tilt, hit-tested in its own frame (see freeHit) ---------- */
function freePane(p,pos,rx,col){
  const sg=new T.Group();sg.position.copy(pos);sg.rotation.x=rx||0;group.add(sg);p.x=0;p.y=0;
  makeFrame(p,sg,col);makePane(p,sg);p.mesh.position.z=.03;
  group.updateMatrixWorld(true);p.xf=sg.matrixWorld.clone();p.inv=p.xf.clone().invert();p.q=sg.getWorldQuaternion(new T.Quaternion());p.c=pos.clone();
  return sg;
}

/* ---------- windmill on the wall: big sails turn in front of the windows.
   o:{x,y,z,len,speed,n (sails, default 4),dir (1 anticlockwise, -1 clockwise; default: with the wind),plate (wall mount size)} ---------- */
const sailTex=canvasTex(64,256,(g,w,h)=>{g.fillStyle='#f4ead2';g.fillRect(0,0,w,h);g.strokeStyle='#8a5f3b';g.lineWidth=5;g.strokeRect(2,2,w-4,h-4);g.lineWidth=3;for(let i=1;i<8;i++){g.beginPath();g.moveTo(0,i*h/8);g.lineTo(w,i*h/8);g.stroke()}g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke()});
sailTex.rotation=Math.PI/2;sailTex.center.set(.5,.5);
function buildMill(o){
  const g=group,len=o.len,n=o.n||4,sail=new T.MeshLambertMaterial({map:sailTex}),s=o.s||1; /* s: arena scale (long kick), sizes the parts */
  const pl=o.plate||1.1;box(pl,pl,.14,0x6b4a2c,o.x,o.y,.22,g);
  addOb(box(.34*s,.34*s,o.z-.16,0x6b4a2c,o.x,o.y,(o.z+.16)/2,g),'wood');obs[obs.length-1].mill=true;
  const rot=new T.Group();rot.position.set(o.x,o.y,o.z);g.add(rot);
  const hub=new T.Mesh(new T.CylinderGeometry(.42*s,.48*s,.45,16),mat(0xb8432f));hub.rotation.x=Math.PI/2;hub.castShadow=true;rot.add(hub);
  const cap=new T.Mesh(new T.SphereGeometry(.22*s,12,8),mat(0xffc53a));cap.position.z=.26;rot.add(cap);
  for(let k=0;k<n;k++){const arm=new T.Group();arm.rotation.z=k*Math.PI*2/n;rot.add(arm);
    addOb(box(len,.17*s,.17*s,0x6b4a2c,len/2,0,0,arm),'wood');obs[obs.length-1].mill=true;
    addOb(box(len-.6*s,.45*s,.07,sail,(len+.6*s)/2,.275*s,.02,arm),'wood');Object.assign(obs[obs.length-1],{mill:true,sail:true})} /* sail 0.45 wide (× s), its inner edge along the arm */
  const dir=o.dir||(wind<0?1:-1); /* default: the tops of the sails move with the wind; no wind turns clockwise */
  movers.push(t=>{rot.rotation.z=dir*t*o.speed});
  MILLS.push({x:o.x,y:o.y,z:o.z,len,n,s,dir,speed:o.speed});
}

/* ---------- gap wheel: one solid disc on the wall with a single quarter-circle cut-out, the only way to the windows behind it.
   Its bottom runs below the ground. It sinks out of the way when the round ends, so the windows can be seen. ---------- */
let wheel=null;
function sector(q,r0,r1,a0,a1){q.absarc(0,0,r1,a0,a1,false);q.absarc(0,0,r0,a1,a0,true);q.closePath();return q}
const wheelTex=canvasTex(128,128,(g,w,h)=>{g.fillStyle='#e9dcc0';g.fillRect(0,0,w,h);g.strokeStyle='#c9b48e';g.lineWidth=3;for(let i=0;i<4;i++){g.beginPath();g.moveTo(0,i*h/4+8);g.lineTo(w,i*h/4+8);g.stroke();g.beginPath();g.moveTo(i*w/4+8,0);g.lineTo(i*w/4+8,h);g.stroke()}});
wheelTex.wrapS=wheelTex.wrapT=T.RepeatWrapping;wheelTex.repeat.set(.32,.32);
function buildWheel(o){
  const g=group,r=o.r,r0=1.15,r1=r-.55,ha=o.gap/2;
  box(1.1,1.1,.14,0x6b4a2c,o.x,o.y,.22,g);addOb(box(.34,.34,o.z-.16,0x6b4a2c,o.x,o.y,(o.z+.16)/2,g),'wood');
  const rot=new T.Group();rot.position.set(o.x,o.y,o.z);g.add(rot);
  const sh=new T.Shape();sh.absarc(0,0,r,0,Math.PI*2,false);sh.holes.push(sector(new T.Path(),r0,r1,-ha,ha));
  const disc=new T.Mesh(new T.ExtrudeGeometry(sh,{depth:.16,bevelEnabled:false,curveSegments:56}),[new T.MeshLambertMaterial({map:wheelTex}),mat(0x8a5f3b)]);disc.position.z=-.08;disc.castShadow=true;rot.add(disc);
  /* a bright border so the gap is easy to follow */
  const bs=sector(new T.Shape(),r0-.2,r1+.2,-ha-.05,ha+.05);bs.holes.push(sector(new T.Path(),r0,r1,-ha,ha));
  const bd=new T.Mesh(new T.ExtrudeGeometry(bs,{depth:.04,bevelEnabled:false,curveSegments:32}),mat(0xffc53a));bd.position.z=.08;rot.add(bd);
  const rim=new T.Mesh(new T.TorusGeometry(r,.13,8,72),mat(0x6b4a2c));rot.add(rim);
  const hub=new T.Mesh(new T.CylinderGeometry(.42,.48,.45,16),mat(0xb8432f));hub.rotation.x=Math.PI/2;hub.position.z=.2;rot.add(hub);
  const cap=new T.Mesh(new T.SphereGeometry(.22,12,8),mat(0xffc53a));cap.position.z=.46;rot.add(cap);
  wheel={x:o.x,y:o.y,z:o.z,r,r0,r1,ha,rot,gone:false,last:performance.now()};
  movers.push(t=>{rot.rotation.z=-t*o.speed;const now=performance.now(),rd=Math.min(.05,(now-wheel.last)/1000);wheel.last=now;
    if(won){wheel.gone=true;rot.position.y=Math.max(-r-1,rot.position.y-15*rd)}});
}
function wheelHit(b){
  const w=wheel;if(!w||w.gone||b.ghost||b.v.z>=0)return;const t=.08+R*.6;if(b.p.z>w.z+t||b.p.z<w.z-t)return;
  const dx=b.p.x-w.x,dy=b.p.y-w.y,r=Math.hypot(dx,dy);if(r>w.r+R*.4)return;
  let a=Math.atan2(dy,dx)-w.rot.rotation.z;a=Math.atan2(Math.sin(a),Math.cos(a));
  const mg=R*.45;if(r>w.r0+mg&&r<w.r1-mg&&Math.abs(a)<w.ha-mg/r)return; /* through the gap */
  b.p.z=w.z+t+.01;b.v.z=Math.abs(b.v.z)*.35;b.v.x*=.6;b.v.y*=.6;b.live=false;b.a.set(0,-S.gravity,0);if(b.state==='fly'||b.state==='ground'){b.state='bounce';b.age=Math.min(b.age,.4)}
  sfx.wood();addShake(.14);for(let i=0;i<14;i++)dust.emit(b.p.x,b.p.y,b.p.z,rnd(-2,2),rnd(-1,2.4),rnd(0,2),rnd(.25,.5),[.92,.8,.6],2);
}


/* ---------- free-standing panes: glass at any position and turn, with a solid frame, hit-tested in their own frame (see freeHit) ---------- */
function solidFrame(p,sg,c){const f=.2;[[p.w+f*2,f,0,p.h/2+f/2],[p.w+f*2,f,0,-p.h/2-f/2],[f,p.h,-p.w/2-f/2,0],[f,p.h,p.w/2+f/2,0]].forEach(a=>addOb(box(a[0],a[1],.34,c,a[2],a[3],.1,sg),'wood'))}
function syncPane(p){p.sg.updateWorldMatrix(true,false);p.xf=(p.xf||new T.Matrix4()).copy(p.sg.matrixWorld);p.inv=(p.inv||new T.Matrix4()).copy(p.xf).invert();p.q=p.sg.getWorldQuaternion(p.q||new T.Quaternion());p.c=p.sg.getWorldPosition(p.c||new T.Vector3())}
function freeStand(p,pos,col){const sg=new T.Group();sg.position.copy(pos);group.add(sg);p.x=0;p.y=0;solidFrame(p,sg,col||0xfffaf0);makePane(p,sg);p.mesh.position.z=.03;p.sg=sg;syncPane(p);return sg}
/* The ball is used up on the glass: it knocks back and drops, so it can't also break the window behind. */
function stopBall(b){b.live=false;b.ghost=true;b.state='passed';b.age=Math.min(b.age,1.2);b.a.set(0,-S.gravity,0);b.v.set(b.v.x*.2,2.5,-Math.sign(b.v.z||-1)*Math.abs(b.v.z)*.22)}

/* ---------- carousel: windows on a circular track, widest at the front and back of the loop, edge-on at the sides.
   Items can be empty frames, or have a mesh on the outside with the glass facing the centre (break those on the far side,
   through a gap). Windows can also stand still inside the circle. ---------- */
/* metal grille: light bars with a dark outline, drawn solid (alphaTest + depth) so it sorts properly against the glass */
const meshTex=canvasTex(64,64,(g,w,h)=>{const bars=(c,lw)=>{g.strokeStyle=c;g.lineWidth=lw;g.beginPath();for(let i=0;i<=2;i++){g.moveTo(i*32,0);g.lineTo(i*32,h);g.moveTo(0,i*32);g.lineTo(w,i*32)}g.stroke()};bars('#2b3344',9);bars('#b9c3d1',4.5)});
meshTex.wrapS=meshTex.wrapT=T.RepeatWrapping;
function meshMat(w,h){const t=meshTex.clone();t.needsUpdate=true;t.repeat.set(w/.42,h/.42);return new T.MeshBasicMaterial({map:t,alphaTest:.5,side:T.DoubleSide})}
function buildCarousel(L){
  const o=L.carousel,c=0x8a5f3b,its=[],n=o.items.length;panes=[];
  const ring=new T.Mesh(new T.RingGeometry(o.r-.24,o.r+.24,72),mat(0x8d8577));ring.rotation.x=-Math.PI/2;ring.position.set(0,.03,o.z);ring.receiveShadow=true;group.add(ring);
  if(!L.inner){const hub=new T.Mesh(new T.CylinderGeometry(.55,.75,.5,16),mat(0xb8432f));hub.position.set(0,.25,o.z);hub.castShadow=true;group.add(hub)}
  o.items.forEach((d,i)=>{const p=Object.assign({},d),y=p.y,o0=obs.length;let sg;
    if(p.empty){sg=new T.Group();sg.position.set(0,y,o.z);group.add(sg);p.x=0;p.y=0;solidFrame(p,sg,0xfffaf0)}
    else{p.stop=true;p.moving=true;sg=freeStand(p,new T.Vector3(0,y,o.z));panes.push(p);
      if(p.inner){addOb(box(p.w+.3,p.h+.3,.05,meshMat(p.w+.3,p.h+.3),0,0,.24,sg,false),'metal');
        const mw=p.w+.44,mh=p.h+.44;[[mw,.14,0,mh/2],[mw,.14,0,-mh/2],[.14,mh,-mw/2,0],[.14,mh,mw/2,0]].forEach(a=>box(a[0],a[1],.1,0x7d8798,a[2],a[3],.26,sg,false))}}
    obs.slice(o0).forEach(ob=>{if(ob.kind==='wood')ob.hit=carouselDeflect});
    [-1,1].forEach(s=>{box(.22,y-p.h/2,.22,c,s*(p.w/2+.1),-(y+p.h/2)/2,.1,sg);box(.24,.14,1.2,0x704b2c,s*(p.w/2+.1),-y+.07,.1,sg)});
    its.push({p,sg,th:i/n*Math.PI*2})});
  (L.inner||[]).forEach(d=>{const p=Object.assign({},d),x=p.x,y=p.y;p.stop=true;freeStand(p,new T.Vector3(x,y,p.z));panes.push(p);
    [-1,1].forEach(s=>{box(.22,y-p.h/2,.22,c,x+s*(p.w/2+.1),(y-p.h/2)/2,p.z+.1,group);box(.24,.14,1.2,0x704b2c,x+s*(p.w/2+.1),.07,p.z+.1,group)})});
  const at=t=>its.forEach(it=>{const th=it.th+t*o.speed,sn=Math.sin(th),cs=Math.cos(th),p=it.p;it.sg.position.set(o.r*sn,it.sg.position.y,o.z+o.r*cs);it.sg.rotation.y=th;
    if(p.empty)return;p.vx=o.r*o.speed*cs;p.narrow=Math.abs(cs)<.5;p.aimOff=!!p.inner&&cs>-.5;syncPane(p)});
  at(0);movers.push(at);
}

/* A ball that clips a carousel frame gets a lucky break half the time (one roll per ball): it is sent into the circle
   at an unbroken inner window (or, with none, a ring window facing the player), so it breaks a window it wasn't aimed at. */
function carouselDeflect(b){
  if(b.defl!==undefined||b.rebound)return;b.defl=Math.random()<.5;if(!b.defl)return;
  const inner=panes.filter(p=>!p.broken&&!p.moving),ring=panes.filter(p=>!p.broken&&p.moving&&!p.narrow&&!p.aimOff),pool=inner.length?inner:ring;
  if(!pool.length)return;
  const q=pool[Math.floor(Math.random()*pool.length)],c=q.c,g=S.gravity,Tt=clamp(b.p.distanceTo(c)/15,.3,.7),tx=c.x+(q.vx||0)*Tt;
  b.rebound=true;b.v.set((tx-b.p.x)/Tt,(c.y-b.p.y+.5*g*Tt*Tt)/Tt,(c.z-b.p.z)/Tt);
}

/* ---------- hinged blockers: the force of the kick swings them out of the way ----------
   Spin board: a board on a vertical pole in front of a window. A kick away from the pole swings it 90° and it stays open
   (edge-on); a kick near the pole only makes it wobble.
   Flip panel: a panel standing on a horizontal bar. A kick on its top half tips it over backwards, and it ends up hanging below
   the bar. It uncovers a window behind (cover), or shows glass on its own back (back glass). A kick low on it only wobbles it. */
let hinges=[];
const _hv=new T.Vector3();
function hingeHit(hg,b){
  if(hg.open)return;
  _hv.copy(b.p);hg.pg.worldToLocal(_hv);
  const k=hg.axis==='y'?Math.abs(_hv.x)/(hg.w/2):_hv.y/hg.h; /* where on the board it was hit: 0 = at the hinge, 1 = far edge */
  if(k<hg.need){hg.wob=0;return}
  hg.open=true;hg.t=0;if(hg.axis==='y')hg.dir=Math.sign(_hv.x)||1;else{hg.phi=0;hg.om=-3.2;hg.crossed=false}sfx.whoosh();
}
function addHinge(hg){
  hinges.push(hg);
  addOb(hg.solid,'wood');obs[obs.length-1].hit=b=>hingeHit(hg,b);
  movers.push((t,dt)=>{
    if(hg.open&&hg.axis==='y'&&hg.t<1){hg.t=Math.min(1,hg.t+dt/hg.dur);
      hg.pg.rotation.y=hg.dir*Math.PI/2*(1-Math.pow(1-hg.t,3)*Math.cos(hg.t*5));if(hg.t>=1)hg.done&&hg.done()}
    else if(hg.open&&hg.axis==='x'&&!hg.rest){swingStep(hg,dt)}
    else if(!hg.open&&hg.wob!==undefined){hg.wob+=dt;const w=Math.sin(hg.wob*18)*Math.exp(-hg.wob*5)*.12;if(hg.axis==='y')hg.pg.rotation.y=w;else hg.pg.rotation.x=-Math.abs(w)}
    hg.sync&&hg.sync()});
}
/* Flip panel as a pendulum: phi 0 = standing, -PI = hanging. It falls over the top and its momentum carries it through the bottom
   and up toward the player (about 86°, then 55°, 36°, 12°…), settling in about 5 s. Light friction while the swings are big, more once
   they are small. Its glass/window is usable from the first pass through the bottom. */
const SWING={k:14,damp:.9,dampSmall:2.5,small:40*Math.PI/180};
function swingStep(hg,dt){
  const n=Math.max(1,Math.ceil(dt/.004)),h=dt/n;
  for(let i=0;i<n;i++){const c=hg.crossed&&hg.amp<SWING.small?SWING.dampSmall:SWING.damp,om0=hg.om;
    hg.om+=(SWING.k*Math.sin(hg.phi)-c*hg.om)*h;hg.phi+=hg.om*h;
    if(!hg.crossed&&hg.phi<=-Math.PI){hg.crossed=true;hg.amp=9;sfx.wood();hg.done&&hg.done()}
    if(hg.crossed&&om0*hg.om<=0)hg.amp=Math.abs(hg.phi+Math.PI)} /* each turning point sets the current swing size */
  if(hg.crossed&&Math.abs(hg.phi+Math.PI)<.025&&Math.abs(hg.om)<.1){hg.phi=-Math.PI;hg.rest=true}
  hg.pg.rotation.x=hg.phi;
}
/* spin boards in front of the wall windows listed in L.spin (pane indexes) */
function buildSpins(L){
  L.spin.forEach(i=>{const p=panes[i],z=1.7,w=p.w+.9,h=p.h+.7;p.aimOff=true;
    const pg=new T.Group();pg.position.set(p.x,p.y,z);group.add(pg);
    const solid=box(w,h,.16,0xb07a46,0,0,0,pg);[-1,1].forEach(s=>{box(w-.2,.06,.02,0x8a5f3b,0,s*h*.3,.09,pg,false);const d=new T.Mesh(new T.CircleGeometry(.24,20),bmat(0xffc53a));d.position.set(s*(w/2-.42),0,.09);pg.add(d)}); /* yellow spots near the edges: hit here */
    const pole=new T.Mesh(new T.CylinderGeometry(.1,.1,p.y+h/2+.5,10),mat(0x5f6b80));pole.position.set(p.x,(p.y+h/2+.5)/2,z);pole.castShadow=true;group.add(pole);
    [-1,1].forEach(s=>{const bolt=new T.Mesh(new T.CylinderGeometry(.2,.2,.24,12),mat(0x3a3a44));bolt.position.set(0,s*h/2,0);pg.add(bolt)});
    addHinge({axis:'y',pg,solid,w,h,need:.3,dur:.55,aim:{x:p.x+w*.3,y:p.y,z:z+.1,w:w*.4,h:h*.8,vx:0},done:()=>{p.aimOff=false}})});
}
/* field level: panels on one bar. L.flip:{bar:{y,z},items:[{x}],w,h,win:{y,z,w,h} (a window behind each panel) | glass:true (glass on the back)} */
function buildFlips(L){
  const o=L.flip,by=o.bar.y,bz=o.bar.z,w=o.w,h=o.h,xs=o.items.map(a=>a.x),x0=Math.min(...xs)-w/2-.6,x1=Math.max(...xs)+w/2+.6;panes=[];
  const bar=new T.Mesh(new T.CylinderGeometry(.13,.13,x1-x0,12),mat(0x5f6b80));bar.rotation.z=Math.PI/2;bar.position.set((x0+x1)/2,by,bz);bar.castShadow=true;group.add(bar);
  [x0,x1].forEach(x=>{box(.26,by+.2,.26,0x8a5f3b,x,(by+.2)/2,bz,group);box(.3,.14,1.6,0x704b2c,x,.07,bz,group)});
  const zc=23; /* camera distance: each hidden window is lined up with its panel as seen from the camera */
  o.items.forEach(it=>{
    const pg=new T.Group();pg.position.set(it.x,by,bz);group.add(pg);
    const solid=box(w,h,.16,0xb07a46,0,h/2,0,pg);[.25,.5,.75].forEach(k=>box(w-.16,.06,.02,0x8a5f3b,0,h*k,.09,pg,false));
    const d=new T.Mesh(new T.CircleGeometry(.26,20),bmat(0xffc53a));d.position.set(0,h-.45,.09);pg.add(d); /* hit here: near the top */
    [-1,1].forEach(s=>box(.3,.3,.3,0x3a3a44,s*(w/2-.3),0,0,pg)); /* hinge knuckles on the bar */
    const hg={axis:'x',pg,solid,w,h,need:.45,aim:{x:it.x,y:by+h*.72,z:bz+.1,w:w*.8,h:h*.4,vx:0}};
    if(o.glass){const q={w:w-.5,h:h-.5,stop:true,locked:true},sg=new T.Group();sg.position.set(0,h/2,-.1);sg.rotation.y=Math.PI;pg.add(sg);
      q.x=0;q.y=0;makeFrame(q,sg,0xfffaf0);makePane(q,sg);q.mesh.position.z=.03;q.sg=sg;syncPane(q);panes.push(q);
      hg.sync=()=>syncPane(q);hg.done=()=>{q.locked=false;syncPane(q)}}
    else{const v=o.win,q={w:v.w,h:v.h,stop:true,aimOff:true},wx=it.x*(zc-v.z)/(zc-bz),pos=new T.Vector3(wx,v.y,v.z);freeStand(q,pos);panes.push(q);
      [-1,1].forEach(s=>{box(.22,v.y-v.h/2,.22,0x8a5f3b,wx+s*(v.w/2+.1),(v.y-v.h/2)/2,v.z+.1,group);box(.24,.14,1.2,0x704b2c,wx+s*(v.w/2+.1),.07,v.z+.1,group)});
      hg.done=()=>{q.aimOff=false}}
    addHinge(hg)});
}

/* ---------- gantry: a beam on two poles that hanging rail windows ride along ---------- */
function buildGantry(o){
  const g=group,c=0x5f6b80;
  [-1,1].forEach(s=>{addOb(box(.36,o.y,.36,c,s*o.x,o.y/2,.1,g),'metal');box(1.4,.14,1.4,0x4a5466,s*o.x,.07,.1,g)});
  addOb(box(o.x*2+.36,.34,.34,c,0,o.y,.1,g),'metal');
}

/* ---------- aim help targets: open windows, plus the spot that swings a closed blocker ---------- */
function aimTargets(b){
  const a=[],side=b?b.owner:'p';
  panes.forEach(p=>{if(!isOpen(p)||p.oneWay||p.narrow||p.aimOff||(VS.tb&&p.side!==side))return; /* turn mode: the help never pulls toward the other half */
    a.push({x:p.c?p.c.x:p.x,y:p.c?p.c.y:p.y,z:p.c?p.c.z:ZF,w:p.w,h:p.h,vx:p.vx||0})});
  hinges.forEach(hg=>{if(!hg.open&&hg.aim)a.push(hg.aim)});
  return a;
}
