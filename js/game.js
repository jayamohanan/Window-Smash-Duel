'use strict';
/* ---------- round restart ---------- */
let winAt=0,retrying=false,spawnWait=0;
/* Retry button / end-of-round tap: a quick fade, then the same arena from the start. */
function restart(){if(retrying)return;retrying=true;$('wipe').classList.add('on');later(.2,reloadLevel)}
function vsTap(){if(performance.now()-winAt>1300)restart()}

/* ---------- ball step ---------- */
function wallHit(b,kind){ /* kind: 'thud' | 'clang' | 'soft' (no sound; the caller makes its own) */
  b.p.z=ZF+R*.5;b.v.z*=-.42;b.v.x*=.55;b.v.y*=.55;b.a.x=0;b.state='bounce';b.age=Math.min(b.age,.3);
  for(let i=0;i<20;i++)dust.emit(b.p.x,b.p.y,.3,rnd(-2.2,2.2),rnd(-1,2.4),rnd(0,2.2),rnd(.25,.55),[.92,.76,.56],2);
  if(kind==='soft')return;
  addShake(b.owner==='bot'?.06:.16);if(kind==='clang')sfx.clang();else sfx.thud();
}
/* The ball reaches the wall plane ZF from the front (+z). Windows first (shutter, boards, wired glass, glass, hole),
   then the solid wall around them. A bot on the far side would need the mirror of this for a -z -> +z crossing. */
function crossPlane(b){
  if(b.live){b.live=false;b.a.set(0,-S.gravity,0)}
  const x=b.p.x,y=b.p.y;
  for(const p of panes){if(p.xf)continue;if(Math.abs(x-p.x)<=p.w/2+.06&&Math.abs(y-p.y)<=p.h/2+.06){
    if(p.shutF>0&&y>p.shutY-R*.3){wallHit(b,'clang');return}
    if(!p.broken){
      if(p.armor>0){breakBoards(p,b);wallHit(b,'soft');return}
      if(p.hp>1){crackPane(p,b);wallHit(b,'soft');return}
      smash(p,b);return}
    b.state='passed';return}} /* through a hole */
  if(LVL.type==='facade'){if(facadeAt(x,y))wallHit(b,'thud');return}
  if(LVL.type==='stand'){const f=.3;for(const p of panes){
    if(Math.abs(x-p.x)<=p.w/2+f&&Math.abs(y-p.y)<=p.h/2+f){wallHit(b,'thud');return}
    if(!p.hang&&Math.abs(Math.abs(x-p.x)-(p.w/2+.1))<.26&&y<p.y){wallHit(b,'thud');return}}}
}
const _pp=new T.Vector3();
function stepBall(b,dt){
  b.age+=dt;if(b.live&&b.state==='fly')flyLive(b,dt);const sub=4,h=dt/sub;
  /* wind pushes any ball that is in the air */
  if(wind&&!b.ghost&&b.p.y>R+.05&&(b.state==='fly'||b.state==='passed'||b.state==='bounce'))b.v.x+=wind*dt;
  for(let i=0;i<sub;i++){
    const z0=b.p.z;_pp.copy(b.p);b.v.addScaledVector(b.a,h);b.p.addScaledVector(b.v,h);
    const was=b.state;
    if((was==='fly'||was==='ground'||was==='bounce')&&!b.ghost&&z0>ZF&&b.p.z<=ZF){crossPlane(b);if(b.state===was&&!(was==='bounce'&&b.v.z>0)&&LVL.type!=='field')b.state='passed'} /* field levels have no wall at ZF: the ball is still in flight */
    freeHit(b,_pp);hitObs(b);wheelHit(b);
    if(b.p.y<R){b.p.y=R;
      if(b.live){ /* live kick that falls short: bounce, roll on the grass, stop */
        if(b.state==='fly'){b.state='ground';b.age=0;b.a.set(0,-S.gravity,0)}
        if(b.v.y<-1.5){if(b.v.y<-3)sfx.thud();b.v.y*=-.45;b.v.x*=.85;b.v.z*=.85}
        else{b.v.y=0;const f=Math.exp(-2.2*h);b.v.x*=f;b.v.z*=f;if(Math.hypot(b.v.x,b.v.z)<.4&&b.age<1.6)b.age=1.6}}
      else{if(b.v.y<0){if(b.v.y<-3)sfx.thud();b.v.y*=-.48}b.v.x*=.88;b.v.z*=.88}}
  }
  const sp=b.v.length();if(sp>.05)b.m.rotateOnWorldAxis(b.spin,sp/R*dt*.75);
  b.sh.position.x=b.p.x;b.sh.position.z=b.p.z;b.sh.material.opacity=clamp(1-b.p.y/9,.15,1);
  /* flight trail in the owner's colour */
  if(b.state==='fly'&&Math.random()<.9)spark.emit(b.p.x,b.p.y,b.p.z,0,0,0,b.live?.42:.3,b.owner==='bot'?[1,.45,.35]:[.5,.75,1],0);
  const done=b.age>(b.state==='fly'?3:2.2)||b.p.z<-16;
  if(done){if(b.state==='fly')b.state='gone';removeBallMesh(b);return false}
  return true;
}

/* ---------- main loop ---------- */
let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const real=Math.min(.05,(now-last)/1000);last=now;
  let dt=real;
  if(freezeT>0){freezeT-=real;dt=0}
  else if(slowT>0){slowT-=real;dt=real*S.slow}
  tick(dt,real);
  renderer.render(scene,camera);
}
function tick(dt,real){
  const tl=timers; /* a timer can load a level, which replaces the list */
  for(let i=tl.length-1;i>=0&&tl===timers;i--){tl[i].t-=real;if(tl[i].t<=0){const f=tl[i].f;tl.splice(i,1);f()}}
  mechTick(dt);glareTick(real);vsTick(dt);botTick(dt);
  /* the player's next ball appears once their last one is no longer in flight */
  if(isLive()&&!cur&&!won&&!balls.some(b=>b.owner==='p'&&b.state==='fly')){spawnWait+=real;if(spawnWait>.22){spawnWait=0;spawnBall()}}else spawnWait=0;
  if(cur){cur.born+=real;const s=clamp(cur.born/.14,0,1);cur.m.scale.setScalar(s<1?s*(1.25-.25*s):1);cur.p.y=R+(1-s)*.5}
  for(let i=balls.length-1;i>=0;i--)if(!stepBall(balls[i],dt))balls.splice(i,1);
  for(let i=shards.length-1;i>=0;i--){const s=shards[i];if(s.rest)continue;
    /* shards still in the frame ride along with a moving window (rail windows) until they drop */
    if(s.delay>0&&s.pane.x!==s.px){s.m.position.x+=s.pane.x-s.px;s.px=s.pane.x}
    if(s.delay>0){s.delay-=dt;if(s.stuck&&s.delay<.2)s.m.rotation.z=Math.sin(s.delay*70)*.03;if(s.delay<=0){if(s.stuck){sfx.tink(s.pane);s.v.set(rnd(-.6,.6),-.5,rnd(.2,2))}s.v.x+=s.pane.vx||0}continue}
    s.age+=dt;s.v.y-=23*dt;s.m.position.addScaledVector(s.v,dt);s.m.rotation.x+=s.w.x*dt;s.m.rotation.y+=s.w.y*dt;s.m.rotation.z+=s.w.z*dt;
    if(s.m.position.y<s.floor){
      s.m.position.y=s.floor;
      if(s.v.y<-3.5&&s.w.lengthSq()>4){s.v.y*=-.26;s.v.x*=.5;s.v.z*=.5;s.w.multiplyScalar(.4);if(Math.random()<.05)sfx.tink(s.pane)}
      else{s.rest=true;s.m.rotation.set(-Math.PI/2+rnd(-.04,.04),rnd(-.04,.04),rnd(0,6.28));s.m.position.y=s.floor+rnd(0,.02)}
    }
  }
  for(let i=debris.length-1;i>=0;i--){const d=debris[i];if(d.rest)continue;d.v.y-=22*dt;d.m.position.addScaledVector(d.v,dt);d.m.rotation.x+=d.w.x*dt;d.m.rotation.y+=d.w.y*dt;
    const q=d.m.position;if(q.z<d.zMin){q.z=d.zMin;d.v.z*=-.4}if(q.z>d.zMax){q.z=d.zMax;d.v.z*=-.4}if(q.x<d.xMin){q.x=d.xMin;d.v.x*=-.4}if(q.x>d.xMax){q.x=d.xMax;d.v.x*=-.4}
    if(q.y<d.floor){q.y=d.floor;if(d.v.y<-2.5){d.v.y*=-.32;d.v.x*=.6;d.v.z*=.6}else d.rest=true}}
  for(let i=fxObjs.length-1;i>=0;i--){const f=fxObjs[i];f.t+=real;const k=f.t/f.d;if(k>=1){scene.remove(f.m);f.m.geometry.dispose();f.m.material.dispose();fxObjs.splice(i,1);continue}f.m.scale.setScalar(1+k*8);f.m.material.opacity=.5*(1-k)}
  spark.step(dt);dust.step(dt);
  clouds.forEach(c=>{c.position.x+=c.userData.s*real;if(c.position.x>110)c.position.x=-110});
  stepConfetti(real);
  shakeA=Math.max(0,shakeA-real*2.6);zoomK=Math.max(0,zoomK-real*3.2);focusK=Math.max(0,focusK-real*1.5);
  const sx=(Math.random()-.5)*shakeA*.75,sy=(Math.random()-.5)*shakeA*.75,fk=focusK*focusK;
  camera.position.set(camBase.x+sx+focus.x*fk*.1,camBase.y+sy+focus.y*fk*.03,camBase.z-fk*1.5);
  const lx=lerp(camLook.x,focus.x,fk*.2),ly=lerp(camLook.y,focus.y,fk*.12);
  camera.lookAt(lx,ly,0);
  camera.zoom=1+zoomK*zoomK*.07;camera.updateProjectionMatrix();
}
