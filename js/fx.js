'use strict';
/* ---------- particles ---------- */
const dot=canvasTex(32,32,(g,w,h)=>{const a=g.createRadialGradient(16,16,1,16,16,16);a.addColorStop(0,'#fff');a.addColorStop(.45,'rgba(255,255,255,.75)');a.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=a;g.fillRect(0,0,w,h)});
function Particles(n,size,blend){
  const pos=new Float32Array(n*3).fill(-999), col=new Float32Array(n*3).fill(1), g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('color',new T.BufferAttribute(col,3));
  const pts=new T.Points(g,new T.PointsMaterial({size,map:dot,transparent:true,depthWrite:false,vertexColors:true,blending:blend,sizeAttenuation:true}));
  pts.frustumCulled=false;scene.add(pts);
  const v=new Float32Array(n*3),life=new Float32Array(n),grav=new Float32Array(n);let i=0;
  return{emit(x,y,z,vx,vy,vz,l,c,gr){pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;v[i*3]=vx;v[i*3+1]=vy;v[i*3+2]=vz;life[i]=l;grav[i]=gr==null?9:gr;col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];i=(i+1)%n},
    step(dt){for(let k=0;k<n;k++){if(life[k]<=0)continue;life[k]-=dt;if(life[k]<=0){pos[k*3+1]=-999;continue}v[k*3+1]-=grav[k]*dt;pos[k*3]+=v[k*3]*dt;pos[k*3+1]+=v[k*3+1]*dt;pos[k*3+2]+=v[k*3+2]*dt}g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true},
    clear(){life.fill(0);pos.fill(-999)}};
}
const spark=Particles(500,.26,T.AdditiveBlending), dust=Particles(260,.7,T.NormalBlending);

/* ---------- juice ---------- */
let freezeT=0,slowT=0,shakeA=0,zoomK=0,focus=new T.Vector3(),focusK=0;
/* NO_JOLT: camera shake, hit-freeze and the impact zoom / look are off for now (set false to bring them all back) */
const NO_JOLT=true;
function addShake(a){if(NO_JOLT)return;shakeA=Math.min(1.1,shakeA+a*S.shake)}
function pop(text,x,y,z,small){const s=toScreen(x,y,z),d=document.createElement('div');d.className='pop'+(small?' small':'');d.textContent=text;d.style.left=clamp(s[0],90,W_-90)+'px';d.style.top=clamp(s[1],70,H_-50)+'px';$('stage').appendChild(d);setTimeout(()=>d.remove(),1000)}
function clipRect(poly,xa,xb,ya,yb){
  const cut=(pts,ins,inter)=>{const o=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],ia=ins(a),ib=ins(b);if(ia)o.push(a);if(ia!==ib)o.push(inter(a,b))}return o};
  const at=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  let p=poly;
  p=cut(p,q=>q[0]>=xa,(a,b)=>at(a,b,(xa-a[0])/(b[0]-a[0])));if(p.length<3)return p;
  p=cut(p,q=>q[0]<=xb,(a,b)=>at(a,b,(xb-a[0])/(b[0]-a[0])));if(p.length<3)return p;
  p=cut(p,q=>q[1]>=ya,(a,b)=>at(a,b,(ya-a[1])/(b[1]-a[1])));if(p.length<3)return p;
  p=cut(p,q=>q[1]<=yb,(a,b)=>at(a,b,(yb-a[1])/(b[1]-a[1])));return p;
}
function shatter(p,hx,hy,ballSpeed){
  const sm=p.gold?goldShardMats:shardMats;
  const lx=hx-p.x,ly=hy-p.y,xa=-p.w/2,xb=p.w/2,ya=-p.h/2,yb=p.h/2,rays=Math.round(17*S.shards),maxR=Math.hypot(p.w,p.h)*1.15;
  const ang=[];for(let i=0;i<rays;i++)ang.push((i+rnd(-.32,.32))/rays*Math.PI*2);
  const rs=[0,.2,.5,.92,1.5,maxR*1.5];
  const pt=(i,k,j)=>{const a=ang[(i+rays)%rays]+(i>=rays?Math.PI*2:0),r=rs[k]*(k?j[((i%rays)*7+k*3)%j.length]:0);return[lx+Math.cos(a)*r,ly+Math.sin(a)*r]};
  const jit=Array.from({length:31},()=>rnd(.82,1.18));
  const add=poly=>{
    const c=clipRect(poly,xa,xb,ya,yb);if(c.length<3)return;
    let cx=0,cy=0,ar=0;c.forEach((q,i)=>{const n=c[(i+1)%c.length];ar+=q[0]*n[1]-n[0]*q[1];cx+=q[0];cy+=q[1]});cx/=c.length;cy/=c.length;if(Math.abs(ar)<.0025)return;
    const edge=c.some(q=>Math.abs(q[0]-xa)<.001||Math.abs(q[0]-xb)<.001||Math.abs(q[1]-ya)<.001||Math.abs(q[1]-yb)<.001);
    const sh=new T.Shape();c.forEach((q,i)=>{const x=(q[0]-cx)*.94,y=(q[1]-cy)*.94;i?sh.lineTo(x,y):sh.moveTo(x,y)});
    const m=new T.Mesh(new T.ShapeGeometry(sh),sm[(Math.random()*3)|0]);m.position.set(p.x+cx,p.y+cy,0);m.renderOrder=4;scene.add(m);
    const dx=cx-lx,dy=cy-ly,d=Math.hypot(dx,dy)||.01,n=clamp(d/maxR,0,1),out=!p.xf&&Math.random()<.42,rad=rnd(1,5.5)*(1.3-n);
    const v=new T.Vector3(dx/d*rad,dy/d*rad+rnd(0,2.5),out?rnd(2.5,10):-ballSpeed*rnd(.12,.38)*(1.1-n));
    if(p.oneWay)v.z=-v.z; /* hit from its glass side: the pieces fly away from the wood */
    if(p.xf){m.position.applyMatrix4(p.xf);m.quaternion.copy(p.q);v.applyQuaternion(p.q)} /* free pane: pane-local to world */
    const stuck=edge&&Math.random()<.38&&!p.moving;
    shards.push({m,v,w:new T.Vector3(rnd(-16,16),rnd(-16,16),rnd(-16,16)),delay:stuck?rnd(.45,2.3):n*.14+rnd(0,.05),stuck,pane:p,px:p.x,rest:false,age:0,floor:.04});
  };
  for(let i=0;i<rays;i++)for(let k=0;k<rs.length-1;k++){
    const a=pt(i,k,jit),b=pt(i+1,k,jit),c=pt(i+1,k+1,jit),e=pt(i,k+1,jit);
    if(k===0)add([a,c,e]);else if(k>2&&Math.random()<.6){if(Math.random()<.5){add([a,b,c]);add([a,c,e])}else{add([a,b,e]);add([b,c,e])}}else add([a,b,c,e]);
  }
  while(shards.length>700){const s=shards.shift();scene.remove(s.m);s.m.geometry.dispose()}
}
function ringAt(p){
  const m=new T.Mesh(new T.RingGeometry(.28,.31,48),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
  m.position.copy(p);scene.add(m);fxObjs.push({m,t:0,d:.32});
}
const fxObjs=[];
/* Confetti on the 2D layer (#fx, drawn above the end panel): two cannons from the bottom corners, a second smaller
   volley, then ~3 s of confetti rain from the top; flat pieces that flutter, curly streamers and gold stars.
   confPop(x,y): a small gold burst at a screen point (the winner's crown landing). */
const confetti=[],CONF=['#ffc53a','#f08a24','#4fbf5a','#47c3ff','#fff8e8','#f35f7d','#ffe27a'];let confOn=false,confRain=0;
function confPiece(o){if(confetti.length>900)return;const r=Math.random();
  confetti.push(Object.assign({kind:r<.14?'streamer':r<.22?'star':'flake',r:rnd(0,6),w:rnd(-12,12),s:rnd(8,16),c:CONF[Math.floor(Math.random()*CONF.length)],t:0,d:rnd(2.4,3.6),
    g:1050,drag:1.1,air:0,sw:0,ph:rnd(0,6),fs:rnd(3,6)},o))}
function cannon(left,n,k){for(let i=0;i<n;i++)confPiece({x:left?-10:W_+10,y:H_*rnd(.8,.95),vx:(left?1:-1)*rnd(180,W_*.85+220)*k,vy:-rnd(560,H_*1.3+300)*k,air:.9,sw:rnd(20,60)})}
function burstConfetti(){
  cannon(true,170,1);cannon(false,170,1);
  setTimeout(()=>{cannon(true,70,.85);cannon(false,70,.85)},450);
  confRain=3;sfx.popper();
}
/* gentle rain from the top: slow fall, side-to-side sway */
function rainStep(dt){if(confRain<=0)return;confRain-=dt;const n=Math.round(dt*95*Math.min(1,confRain+.3));
  for(let i=0;i<n;i++)confPiece({x:rnd(0,W_),y:-20,vx:rnd(-30,30),vy:rnd(60,140),g:220,drag:.4,air:1.6,sw:rnd(30,80),d:7,s:rnd(7,13)})}
function confPop(x,y){for(let i=0;i<46;i++){const a=rnd(0,Math.PI*2),v=rnd(220,520);
  confPiece({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-240,g:900,drag:2,air:.6,d:rnd(1.2,1.9),s:rnd(6,11),c:Math.random()<.6?'#ffc53a':Math.random()<.5?'#fff8e8':'#ffe27a',kind:Math.random()<.35?'star':'flake'})}}
function drawStar(g,s){g.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?s*.42:s;g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();g.lineWidth=1.5;g.strokeStyle='rgba(35,48,74,.55)';g.stroke()}
function stepConfetti(dt){
  rainStep(dt);
  if(!confetti.length&&!confOn)return;fctx.clearRect(0,0,W_,H_);
  for(let i=confetti.length-1;i>=0;i--){const c=confetti[i];c.t+=dt;c.vy+=c.g*dt;c.vx*=1-c.drag*dt;if(c.air&&c.vy>0)c.vy*=1-c.air*dt; /* air: falling pieces float */
    c.x+=(c.vx+Math.sin(c.t*c.fs+c.ph)*c.sw)*dt;c.y+=c.vy*dt;c.r+=c.w*dt;if(c.t>c.d||c.y>H_+40){confetti.splice(i,1);continue}
    fctx.save();fctx.translate(c.x,c.y);fctx.rotate(c.r);fctx.globalAlpha=Math.min(1,(c.d-c.t)*3);fctx.fillStyle=fctx.strokeStyle=c.c;
    if(c.kind==='star')drawStar(fctx,c.s*.6);
    else if(c.kind==='streamer'){fctx.lineWidth=3;fctx.lineCap='round';fctx.beginPath();const L=c.s*2.2;for(let k=0;k<=8;k++){const u=k/8;fctx.lineTo(-L/2+u*L,Math.sin(u*Math.PI*2+c.t*9+c.ph)*c.s*.28)}fctx.stroke()}
    else fctx.fillRect(-c.s/2,-c.s*.3,c.s,c.s*.6*Math.abs(Math.cos(c.r*1.7))+1); /* flutter: the piece turns edge-on and back */
    fctx.restore()}
  confOn=confetti.length>0;
}
/* lh: hit point in the pane's own frame (free panes); wall panes use the ball position.
   The player's breaks get the full juice (freeze, short slow-mo, zoom); the bot's only a small shake, so they don't stall play. */
function smash(p,b,lh){
  p.broken=true;p.mesh.visible=false;(p.extra||[]).forEach(m=>m.visible=false);
  const speed=b.v.length(),src=lh||b.p,hx=clamp(src.x,p.x-p.w/2+.05,p.x+p.w/2-.05),hy=clamp(src.y,p.y-p.h/2+.05,p.y+p.h/2-.05);
  shatter(p,hx,hy,Math.max(speed,26));
  const w=p.xf?new T.Vector3(hx,hy,.1).applyMatrix4(p.xf):new T.Vector3(hx,hy,.15),col=p.gold?[1,.85,.35]:[.85,.95,1];
  for(let i=0;i<90;i++)spark.emit(w.x,w.y,w.z,rnd(-7,7),rnd(-5,8),rnd(-5,8),rnd(.2,.75),col,8);
  ringAt(new T.Vector3(w.x,w.y,p.xf?w.z+.3:.3));
  netHit(p,b,hx,hy);
  if(localHuman(b.owner)&&!b.puppet){freezeT=S.freeze/1000;slowT=.18;if(!NO_JOLT){zoomK=1;focus.set(w.x,w.y,0);focusK=1}} /* NO_JOLT: no zoom / look toward the window either */else addShake(.22);
  sfx.glass();if(p.gold)sfx.boom();glareBreak(p);
  if(p.stop)stopBall(b);
  else{b.v.multiplyScalar(.72);b.a.x=0;b.state='passed'}
  onBreak(p,b);
}
const sharedDebris=new T.BoxGeometry(1,1,1);
