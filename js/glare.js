'use strict';
/* ---------- glass glare: makes intact windows read as glass, and broken ones (no glare at all) easy to tell apart.
   One overlay quad per pane (shares the pane's geometry, rides along with it, hides with it when it breaks).
   Two layers, each with a dev toggle:
   - sky drift (S.glSkyOn, off by default): faint light patches of a reflected sky drifting slowly across the glass. The pattern is laid out
     in world metres, so neighbouring windows show different parts of the same sky.
   - glints (S.glints): now and then a single bright band sweeps once across one pane. Random gaps per pane, never two
     panes at once (a short global cooldown). The last window glints more often.
   Always on: one sweep on each window as its shutter rolls up (glFresh). A gold (prize) window glints often.
   Kept deliberately plain (2026-11-14): no intro sweep, no row chains or doubles, no shimmer when a neighbour breaks. */
const GLARE_V='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const GLARE_F=`uniform float uS,uA,uW,uDir,uSky,uOff,uX0,uY0,uPW,uPH;varying vec2 vUv;
void main(){
  vec2 m=vec2(vUv.x*uPW,vUv.y*uPH);
  float d=(m.x*.73-m.y*.68+uPH*.68)/(uPW*.73+uPH*.68); /* 0..1 across the pane, along the streaks' normal */
  if(uDir<0.)d=1.-d;
  float e=(d-uS)/uW,f=(d-uS+uW*2.4)/(uW*.3);
  float g=(exp(-e*e)+.5*exp(-f*f))*uA; /* the glint band plus a thin trailing line */
  g+=uA*.16*clamp(1.-abs(uS-.5)*2.,0.,1.); /* the whole pane lifts a little while the band crosses */
  float x=uX0+m.x-uOff,y=uY0+m.y;
  float n=sin(x*1.1+sin(y*.7+x*.4)*1.3)*.6+sin(x*2.3-y*1.2+1.7)*.4; /* reflected sky: light cloud patches, deeper blue between */
  float hi=smoothstep(0.,.75,n)*.62*uSky,lo=smoothstep(-.05,-.75,n)*.5*uSky;
  float a=clamp(g+hi,0.,1.);
  vec3 c=vec3(1.);
  if(lo>a){c=vec3(.16,.42,.72);a=lo;}
  gl_FragColor=vec4(c,a);
}`;
const GL={arr:null,cool:0,time:0,queue:[]};
function addGlare(p){
  if(!p.mesh||!p.mesh.geometry.parameters)return;
  const u={uS:{value:-1},uA:{value:0},uW:{value:.1},uDir:{value:1},uSky:{value:0},uOff:{value:0},uX0:{value:0},uY0:{value:0},uPW:{value:p.w},uPH:{value:p.h}};
  const o=new T.Mesh(p.mesh.geometry,new T.ShaderMaterial({uniforms:u,vertexShader:GLARE_V,fragmentShader:GLARE_F,transparent:true,depthWrite:false,side:T.DoubleSide}));
  o.position.z=.002;o.renderOrder=4;o.visible=false;p.mesh.add(o);
  p.gl={o,u,t:rnd(3,8),s:-1,dur:.5};
}
const glOn=()=>LVL&&!sandbox;
const glLive=()=>panes.filter(p=>p.gl&&isOpen(p));
/* a window just opened: one bright sweep as the shutter clears it */
function glFresh(p){if(p.gl)glQueue(p,.32,{amp:1,dur:.5,w:.17,dir:1})}
const glX=p=>p.mesh.matrixWorld.elements[12];
function glStart(p,o){const g=p.gl;if(!g||p.broken)return;g.s=0;g.dur=o.dur||rnd(.35,.55);g.u.uA.value=o.amp;g.u.uW.value=o.w||rnd(.09,.18);g.u.uDir.value=o.dir||(Math.random()<.7?1:-1)}
function glQueue(p,t,o){GL.queue.push({p,t,o})}
function glRandom(p,live){
  const g=p.gl;GL.cool=rnd(.9,1.7);g.t=live.length===1?rnd(2.5,5):rnd(4,10);
  glStart(p,{amp:rnd(.5,.8)});
}
/* a window broke: no shimmer on the others (kept plain) */
function glareBreak(p){}
function glareTick(dt){
  if(!glOn())return;
  if(panes!==GL.arr){GL.arr=panes;GL.queue=[];GL.cool=1.5;glLive().forEach(p=>p.gl.t=rnd(3,8))}
  GL.time+=dt;GL.cool-=dt;
  for(let i=GL.queue.length-1;i>=0;i--){const q=GL.queue[i];q.t-=dt;if(q.t<=0){GL.queue.splice(i,1);glStart(q.p,q.o)}}
  const live=glLive(),sky=S.glSkyOn?1:0;
  for(const p of live){const g=p.gl,u=g.u;
    if(g.s>=0){g.s+=dt/g.dur;if(g.s>=1)g.s=-1}
    else if(S.glints){g.t-=dt;if(p.gold&&g.t>1.3)g.t=1.3;if(g.t<=0){if(GL.cool>0&&!p.gold)g.t=rnd(.3,1.2);else glRandom(p,live)}}
    u.uS.value=g.s>=0?lerp(-.25,1.25,g.s):-9;
    u.uSky.value=sky;u.uOff.value=GL.time*.15;
    const e=p.mesh.matrixWorld.elements;u.uX0.value=e[12]-p.w/2;u.uY0.value=e[13]-p.h/2;
    g.o.visible=sky>0||g.s>=0;
  }
}
