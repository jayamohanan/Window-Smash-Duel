'use strict';
/* ---------- bot opponent (simple, no real AI) ----------
   Loop: think (S.botThink s, varied) -> pick an open window (the gold one if it's up, else the nearest or a random one)
   -> wind up for S.botWindup s (turns to face the window and pulls the kicking leg back: that's the tell, so you can snipe
   the window first) -> kick: solveArc (the same launch maths as shotFrom) toward the window centre plus aim error, with a
   flight time of about S.botFlight s -> follow-through -> think again. Its balls carry owner 'bot' and score for it.
   Difficulty: S.botErr = aim error (m, roughly the spread around the centre), S.botThink = delay between kicks,
   S.botMiss = chance of a deliberate miss onto the wall or frame, S.botEase = how much it slows and loosens while it
   leads by 2 or more. Presets: BOT_PRESETS in settings.js (Easy / Normal / Hard chips in the ⚙ panel).
   Where it kicks from: BOT.from (set by placeBot from the layout) and BOT.side (1 = the player's side, kicking toward -z).
   A bot on the far side of the wall would be side -1, kicking toward +z; that needs crossPlane to judge a +z crossing too. */
const BOT={on:false,st:'off',t:0,T:1,ball:null,ballT:0,target:null,fig:null,parts:null,yaw:0,yawGoal:0,kickT:-1,side:1,committed:false,from:new T.Vector3()};

/* The figure: a chunky red robot standing just behind and to the right of its ball. Built once, kept across rounds. */
(function buildBotFig(){
  const f=new T.Group(),body=new T.Group(),red=TEAM.bot,dark=0x23304a,cream=0xfff8e8;
  body.position.set(.28,0,.62);f.add(body);
  const leg=x=>{const g=new T.Group();g.position.set(x,.82,0);body.add(g);box(.2,.62,.22,dark,0,-.36,0,g);box(.26,.14,.38,red,0,-.75,-.06,g);return g};
  const kickLeg=leg(-.15),plant=leg(.15);
  const torso=new T.Group();torso.position.y=.82;body.add(torso);
  box(.62,.64,.4,red,0,.38,0,torso);box(.64,.08,.42,cream,0,.14,0,torso);
  box(.5,.4,.42,cream,0,.96,0,torso);box(.4,.13,.04,dark,0,.98,-.22,torso);box(.5,.06,.44,red,0,.8,0,torso);
  box(.04,.22,.04,dark,0,1.27,0,torso,false);const bulb=new T.Mesh(new T.SphereGeometry(.07,10,8),mat(GOLD));bulb.position.y=1.4;torso.add(bulb);
  const arm=x=>{const g=new T.Group();g.position.set(x,.64,0);torso.add(g);box(.16,.5,.18,red,0,-.22,0,g);box(.18,.14,.2,dark,0,-.5,0,g);return g};
  const armL=arm(-.4),armR=arm(.4);
  f.visible=false;scene.add(f);BOT.fig=f;BOT.parts={kickLeg,plant,torso,armL,armR};
})();
/* Called by layout(): the bot's kick spot (BX, BZ) depends on the screen shape. */
function placeBot(){
  BOT.from.set(BX,R,BZ);BOT.fig.position.set(BX,0,BZ);
  const b=BOT.ball;if(b){b.p.set(BX,b.p.y,BZ);b.sh.position.set(BX,.04,BZ)}
}
function botBall(){const b=makeBall(BOT.from.x,BOT.from.z);b.owner='bot';BOT.ball=b}
/* level loaded: figure and its ball in place, idle until the round starts */
function botReady(){BOT.fig.visible=botSpot.visible=true;BOT.yaw=BOT.yawGoal=0;BOT.kickT=-1;BOT.st='off';BOT.on=false;if(!BOT.ball)botBall()}
function botStart(){BOT.on=true;BOT.st='think';BOT.t=thinkDelay()*.6+.3}
function botStop(){BOT.on=false;BOT.st='off'}
function botClear(){if(BOT.ball){removeBallMesh(BOT.ball);BOT.ball=null}BOT.ballT=0;botStop();BOT.target=null;BOT.fig.visible=botSpot.visible=false}

/* how far the bot leads (it eases off from 2 up) */
const botEaseK=()=>{const lead=VS.score.bot-VS.score.p;return lead>=2?1+S.botEase*Math.min(3,lead-1):1};
function thinkDelay(){return S.botThink*rnd(.75,1.3)*botEaseK()}
function botPick(){
  const open=panes.filter(p=>p.vs&&isOpen(p)&&!p.aimOff&&!p.narrow&&(!VS.tb||p.side==='bot'));if(!open.length)return null; /* turn mode: only its own half */
  const pr=VS.prize;if(pr&&isOpen(pr)&&VS.t-pr.openAt>.5&&Math.random()<.8)return pr;
  if(Math.random()<.55){let best=open[0],bd=1e9;open.forEach(p=>{const d=Math.hypot(p.x-BOT.from.x,(p.y-3)*1.3);if(d<bd){bd=d;best=p}});return best}
  return open[Math.floor(Math.random()*open.length)];
}
function aimYaw(p){const dx=(p.c?p.c.x:p.x)-BOT.from.x,dz=(p.c?p.c.z:0)-BOT.from.z;BOT.yawGoal=Math.atan2(-dx,-dz)}
const gauss=()=>(Math.random()+Math.random()+Math.random()-1.5)/1.5; /* -1..1, bunched toward 0 */
function botKick(){
  const b=BOT.ball,p=BOT.target;if(!b||!p){BOT.st='think';BOT.t=.2;return}
  BOT.ball=null;BOT.ballT=.45;
  const TT=S.botFlight*rnd(.92,1.08),k=botEaseK(),err=S.botErr*(1+(k-1)*.5),c=p.c||p;
  let ex,ey;
  if(Math.random()<S.botMiss){ /* a deliberate miss: just off the glass, onto the frame or wall */
    if(Math.random()<.6){ex=(Math.random()<.5?-1:1)*(p.w/2+rnd(.2,.7));ey=gauss()*p.h*.3}else{ex=gauss()*p.w*.3;ey=(Math.random()<.5?-1:1)*(p.h/2+rnd(.2,.6))}}
  else{ex=gauss()*err;ey=gauss()*err*.8}
  const tgt=new T.Vector3(c.x+(p.vx||0)*TT+ex,Math.max(R+.2,c.y+ey),p.c?c.z+.1:ZF);
  const v0=solveArc(b.p,tgt,TT,new T.Vector3(wind*.85,-S.gravity,0)); /* it knows the wind, roughly */
  b.state='fly';b.live=false;b.age=0;b.born=1;b.m.scale.setScalar(1);b.p.y=R;b.v.copy(v0);b.a.set(0,-S.gravity,0);b.spin.set(0,1,0).cross(b.v).normalize();balls.push(b);
  sfx.kick(.8);for(let i=0;i<10;i++)dust.emit(b.p.x+rnd(-.3,.3),.1,b.p.z+rnd(-.2,.2),rnd(-1.8,1.8),rnd(.6,2.2),rnd(-.5,1.5),rnd(.25,.5),[.72,.6,.42],3);
  BOT.st='follow';BOT.t=.35;BOT.kickT=0;turnKick('bot');
}
function botTick(dt){
  if(!BOT.fig.visible)return;
  const b=BOT.ball;
  if(b){b.born+=dt;const s=clamp(b.born/.14,0,1);b.m.scale.setScalar(s<1?s*(1.25-.25*s):1);b.p.y=R+(1-s)*.5}
  else if(BOT.ballT>0){BOT.ballT-=dt;if(BOT.ballT<=0&&!won)botBall()}
  if(BOT.on){BOT.t-=dt;
    if(BOT.st==='think'){BOT.yawGoal*=1-Math.min(1,dt*1.5);
      if(BOT.t<=0){const p=b&&b.born>.2?botPick():null;if(p){BOT.target=p;BOT.st='wind';BOT.t=BOT.T=S.botWindup;BOT.committed=false;aimYaw(p)}else BOT.t=.25}}
    else if(BOT.st==='wind'){
      /* its window went (sniped, or shut): early in the wind-up it picks another; late, it's committed and kicks anyway */
      if(!isOpen(BOT.target)&&!BOT.committed){if(BOT.t>BOT.T*.4){const p=botPick();if(p){BOT.target=p;aimYaw(p);BOT.t+=.12}else{BOT.st='think';BOT.t=.3}}else BOT.committed=true}
      if(BOT.st==='wind'&&BOT.t<=0)botKick()}
    else if(BOT.st==='follow'&&BOT.t<=0){if(VS.tb&&(VS.turn!=='bot'||VS.left<=0))botStop();else{BOT.st='think';BOT.t=thinkDelay()}}}
  /* pose */
  const P=BOT.parts;BOT.yaw+=(BOT.yawGoal-BOT.yaw)*(1-Math.exp(-10*dt));BOT.fig.rotation.y=BOT.yaw+(BOT.side<0?Math.PI:0);
  let leg=0,lean=0,arm=0;
  if(BOT.st==='wind'){const u=clamp(1-BOT.t/BOT.T,0,1),e=u*u*(3-2*u);leg=-1.15*e;lean=.2*e;arm=.7*e}
  else if(BOT.kickT>=0){BOT.kickT+=dt;const q=BOT.kickT;leg=q<.08?lerp(-1.15,1,q/.08):lerp(1,0,clamp((q-.08)/.35,0,1));lean=-.12*clamp(1-q/.4,0,1);arm=lerp(.7,0,clamp(q/.4,0,1));if(q>.5)BOT.kickT=-1}
  P.kickLeg.rotation.x=leg;P.torso.rotation.x=lean;P.armL.rotation.x=arm;P.armR.rotation.x=-arm*.6;
  P.torso.position.y=.82+(BOT.st==='think'||BOT.st==='off'?Math.sin(lt*3.2)*.012:0);
}
