'use strict';
/* ---------- bot opponent (simple, no real AI, but kicks like a person) ----------
   Loop: think (botThink s, varied) -> pick an open window (the gold one if it's up, else the nearest or a random one)
   and roll how this kick will go -> wind up for S.botWindup s (turns to face the window and pulls the kicking leg back:
   that's the tell, so you can snipe the window first) -> kick: solveArc (the same launch maths as shotFrom) toward the
   window plus the rolled error, flight time about S.botFlight s -> follow-through -> think again. Its balls carry owner
   'bot' and score for it.
   Each kick is good (near the centre, spread botErr), okay (near an edge: sometimes clips the glass, sometimes the frame)
   or bad (a clear miss, but always close to the window). Chances: botGood / botBad, the rest are okay. Errors are
   mostly too high / too low (power), less often sideways. On top:
   - habit: a fixed lean per match (BOT.bias, size botBias), e.g. always a bit high or a bit right;
   - correction: after a miss the next kick isn't bad, and lands a little to the other side of the window;
     never more than 2 bad kicks in a row;
   - hard windows (far, high, small, moving) and rushed kicks (short think) go wrong more often; long thinks less;
   - pressure: 2+ behind it focuses (fewer mistakes), 5+ behind a little more and slightly quicker (never under minThink);
     2+ ahead it gets careless and slower (S.botEase);
   - windmills: with chance botSmart a kick is careful: at the end of the wind-up it checks whether a sail would be in the
     ball's way (millBlock) and holds the kick up to ~0.9 s for a gap. Careless kicks just go.
   Gold window: per profile, a chance it goes for it at all (prizeP) and a delay after it opens (prizeWait).
   Its numbers (BOT.P, fixed at round start): skill matching (strProfile(PROG.str), the default) or, with S.botAuto off,
   the ⚙ sliders / Easy-Normal-Hard chips. Later each level brings its own bot.
   Where it kicks from: BOT.from (set by placeBot from the layout) and BOT.side (1 = the player's side, kicking toward -z).
   A bot on the far side of the wall would be side -1, kicking toward +z; that needs crossPlane to judge a +z crossing too. */
const BOT={P:Object.assign({},BOT_TIERS[2]),on:false,st:'off',t:0,T:1,ball:null,ballT:0,target:null,fig:null,parts:null,yaw:0,yawGoal:0,kickT:-1,side:1,committed:false,from:new T.Vector3(),
  shot:null,bias:{x:0,y:0},misses:0,lastMiss:null,thought:1,careful:false,hold:0};

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
/* ---------- progress on this device: drives the difficulty ramp and the one-time warm-up (vs.js) ---------- */
const PROG_KEY='windowSmashDuel.prog';
let PROG={played:0,str:0,warm:false,mills:false,v:0}; /* str: opponent strength 0..1; warm: practice done; mills: windmill banner shown */
try{Object.assign(PROG,JSON.parse(localStorage.getItem(PROG_KEY)||'{}'))}catch(e){}
const progSave=()=>{try{localStorage.setItem(PROG_KEY,JSON.stringify(PROG))}catch(e){}};
/* v3 (2026-11-14): tiers became one strength dial; carry the old tier over (at most normal) */
if(PROG.v!==3){PROG.str=clamp((Math.min(PROG.tier|0,2))/4,0,.5);PROG.v=3;progSave()}
const STR_GOAL=.88; /* the opponent should score about this share of the player's score */
/* a finished match against the bot (scores p = player, b = opponent): move the dial toward a close game */
function progRecord(p,b){
  const P=PROG;P.played++;
  if(P.played>2){const r=b/Math.max(1,p),e=clamp(STR_GOAL-r,-.6,.6);P.str+=.35*e} /* 20-8: +.17; 12-11: about 0; lose 10-16: -.21 */
  if(P.played===2)P.str=Math.max(P.str,.25); /* after the 2 rookie matches */
  P.str=P.played<2?0:clamp(P.str,0,P.played<5?.25:P.played<10?.75:1);
  progSave();
}
/* the opponent's numbers at strength s: blended between the neighbouring BOT_TIERS anchors */
function strProfile(s){
  const n=BOT_TIERS.length-1,u=clamp(s,0,1)*n,i=Math.min(n-1,Math.floor(u)),f=u-i,A=BOT_TIERS[i],B=BOT_TIERS[i+1],o={};
  for(const k in A){const a=A[k],b=B[k];o[k]=typeof a==='number'?lerp(a,b,f):Array.isArray(a)?a.map((x,j)=>lerp(x,b[j],f)):a}
  return o;
}
function botProfile(){
  if(S.botAuto)return strProfile(PROG.played<2?0:PROG.str);
  return {botGood:S.botGood,botBad:S.botBad,botErr:S.botErr,botBias:S.botBias,botSmart:S.botSmart,botThink:S.botThink,minThink:0,prizeP:.65,prizeWait:[.9,1.4]};
}
function botBall(){const b=makeBall(BOT.from.x,BOT.from.z);b.owner='bot';BOT.ball=b}
/* level loaded: figure and its ball in place, idle until the round starts */
function botReady(){BOT.P=botProfile();BOT.fig.visible=botSpot.visible=true;BOT.fig.scale.setScalar(1);newHabit();BOT.yaw=BOT.yawGoal=0;BOT.kickT=-1;BOT.st='off';BOT.on=false;if(!BOT.ball)botBall()}
function botStart(){BOT.on=true;BOT.st='think';BOT.t=thinkDelay()*.6+.3;BOT.thought=BOT.P.botThink}
function botStop(){BOT.on=false;BOT.st='off'}
function botClear(){if(BOT.ball){removeBallMesh(BOT.ball);BOT.ball=null}BOT.ballT=0;botStop();BOT.target=null;BOT.fig.visible=botSpot.visible=false}

/* how far the bot leads (+) or trails (-) */
const botLead=()=>VS.score.bot-VS.score.p;
/* while 2+ ahead it slows down (and gets careless, see rollShot) */
const botEaseK=()=>{const lead=botLead();return lead>=2?1+S.botEase*Math.min(3,lead-1):1};
function thinkDelay(){
  const lead=botLead();let d=Math.max(BOT.P.minThink||0,BOT.P.botThink*rnd(.75,1.3)*(lead<=-5?.9:1))*botEaseK(); /* 5+ behind: a little quicker, never under minThink */
  if(Math.random()<1/6)d=Math.max(d,rnd(1.5,2.5)); /* now and then a longer look around */
  BOT.thought=d;return d}
/* its habit for this match: a fixed lean, more often up/down than sideways */
function newHabit(){const a=Math.random()*Math.PI*2,m=BOT.P.botBias*rnd(.6,1);BOT.bias={x:Math.cos(a)*m*.7,y:Math.sin(a)*m};BOT.misses=0;BOT.lastMiss=null}
function botPick(){
  const open=panes.filter(p=>p.vs&&isOpen(p)&&!p.aimOff&&!p.narrow&&(!VS.tb||p.side==='bot'));if(!open.length)return null; /* turn mode: only its own half */
  /* gold window: decide once per opening whether to go for it, and how quickly */
  const pr=VS.prize;if(pr&&isOpen(pr)){if(pr.botWant===undefined){const w=BOT.P.prizeWait;pr.botWant=Math.random()<BOT.P.prizeP;pr.botAt=pr.openAt+rnd(w[0],w[1])}
    if(pr.botWant&&VS.t>=pr.botAt)return pr}
  if(Math.random()<.55){let best=open[0],bd=1e9;open.forEach(p=>{const d=Math.hypot(p.x-BOT.from.x,(p.y-3*ak())*1.3);if(d<bd){bd=d;best=p}});return best}
  return open[Math.floor(Math.random()*open.length)];
}
function aimYaw(p){const dx=(p.c?p.c.x:p.x)-BOT.from.x,dz=(p.c?p.c.z:0)-BOT.from.z;BOT.yawGoal=Math.atan2(-dx,-dz)}
const gauss=()=>(Math.random()+Math.random()+Math.random()-1.5)/1.5; /* -1..1, bunched toward 0 */
const sgn=()=>Math.random()<.5?-1:1;
/* Roll how the kick at window p will go: offsets ex, ey from its centre (m) and the flight time. */
function rollShot(p){
  const A=ak(),hw=p.w/2,hh=p.h/2,c=p.c||p;
  /* how hard this window is: far / high, small, moving */
  const far=Math.hypot(c.x-BOT.from.x,c.y-2*A)/A,hard=1+clamp((far-4)/8,0,.5)+Math.min(.5,Math.abs(p.vx||0)*.15/A)+(p.w*p.h<3*A*A?.2:0);
  const rush=BOT.thought<BOT.P.botThink*.85?1.15:BOT.thought>BOT.P.botThink*1.4?.9:1; /* a quick kick is sloppier, a long look steadier */
  const lead=botLead(),press=lead>=2?1+S.botEase*Math.min(3,lead-1)*.35:lead<=-5?.8:lead<=-2?.9:1; /* behind: it focuses */
  const m=hard*rush*press*(p.gold?1.25:1); /* the gold window: a rushed, greedy shot */
  let bad=Math.min(.7,BOT.P.botBad*m);if(BOT.misses>=2)bad=0;else if(BOT.misses===1)bad*=.5;
  const good=BOT.misses>=2?1:clamp(BOT.P.botGood/m,0,1-bad),r=Math.random(),q=r<bad?'bad':r<bad+good?'good':'okay'; /* after 2 misses in a row: a good one */
  const bx=BOT.bias.x*A,by=BOT.bias.y*A;let ex,ey;
  if(q==='bad'){ /* a clear miss, close by: mostly over / under (power), sometimes wide; the habit picks the side more often than not */
    const out=hw=>hw+.12*A+rnd(.15,1.1)*A;
    if(Math.random()<.65){ey=(Math.random()<.7&&by?Math.sign(by):sgn())*out(hh);ex=gauss()*hw*.4+bx}
    else{ex=(Math.random()<.7&&bx?Math.sign(bx):sgn())*out(hw);ey=gauss()*hh*.4+by}}
  else{
    if(q==='okay'){ /* near one edge: most land on the glass, some clip the frame */
      if(Math.random()<.6){ey=sgn()*hh*rnd(.6,1.06);ex=gauss()*hw*.35+bx}else{ex=sgn()*hw*rnd(.6,1.06);ey=gauss()*hh*.35+by}}
    else{const e=BOT.P.botErr*A;ex=clamp(gauss()*e,-hw*.55,hw*.55)+bx;ey=clamp(gauss()*e*.8,-hh*.55,hh*.55)+by}
    /* just missed: this one lands a little to the other side (it corrected, maybe a touch too much) */
    const lm=BOT.lastMiss;if(lm&&q!=='okay'){if(lm.ax==='y')ey=-lm.s*hh*rnd(.15,.4);else ex=-lm.s*hw*rnd(.15,.4)}}
  BOT.shot={q,ex,ey,TT:S.botFlight*Math.sqrt(A)*rnd(.92,1.08)};
}
/* the kick's start velocity for the rolled shot (it knows the wind, roughly) */
function aimShot(b,p){const s=BOT.shot,c=p.c||p;
  const tgt=new T.Vector3(c.x+(p.vx||0)*s.TT+s.ex,Math.max(R+.3,c.y+s.ey),p.c?c.z+.1:ZF);
  return solveArc(b.p,tgt,s.TT,new T.Vector3(wind*.85,-S.gravity,0))}
/* would a ball kicked now with velocity v0 run into a windmill's arm or sail? (checks where the sails will be when it gets there) */
function millBlock(p0,v0){
  for(const m of MILLS){if(v0.z>=0)break;const tc=(m.z-p0.z)/v0.z;if(tc<=0)continue;
    const dx=p0.x+v0.x*tc+.5*wind*tc*tc-m.x,dy=p0.y+v0.y*tc-.5*S.gravity*tc*tc-m.y;if(Math.hypot(dx,dy)>m.len+R)continue;
    const base=m.dir*(lt+tc)*m.speed,s=m.s;
    for(let k=0;k<m.n;k++){const a=base+k*Math.PI*2/m.n,ca=Math.cos(a),sa=Math.sin(a),lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca;
      if(lx>-R&&lx<m.len+R&&ly>-.085*s-R&&ly<.5*s+R)return true}}
  return false}
/* note whether the kick was aimed off the glass (windmills and snipes don't count): drives correction and the 2-in-a-row cap */
function botAimed(p){const s=BOT.shot,oy=Math.abs(s.ey)>p.h/2+.06,ox=Math.abs(s.ex)>p.w/2+.06;
  if(ox||oy){BOT.misses++;BOT.lastMiss=oy?{ax:'y',s:Math.sign(s.ey)}:{ax:'x',s:Math.sign(s.ex)}}else{BOT.misses=0;BOT.lastMiss=null}}
function pickTarget(p){BOT.target=p;rollShot(p);BOT.careful=Math.random()<BOT.P.botSmart;BOT.hold=0;aimYaw(p)}
function botKick(v0){
  const b=BOT.ball,p=BOT.target;if(!b||!p){BOT.st='think';BOT.t=.2;return}
  BOT.ball=null;BOT.ballT=.45;
  botAimed(p);
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
      if(BOT.t<=0){const p=b&&b.born>.2?botPick():null;if(p){pickTarget(p);BOT.st='wind';BOT.t=BOT.T=S.botWindup;BOT.committed=false}else BOT.t=.25}}
    else if(BOT.st==='wind'){
      /* its window went (sniped, or shut): early in the wind-up it picks another; late, it's committed and kicks anyway */
      if(!isOpen(BOT.target)&&!BOT.committed){if(BOT.t>BOT.T*.4){const p=botPick();if(p){pickTarget(p);BOT.t+=.12}else{BOT.st='think';BOT.t=.3}}else BOT.committed=true}
      if(BOT.st==='wind'&&BOT.t<=0){
        /* careful kick: wait (leg back) for a gap in the sails, up to ~0.9 s, then go anyway */
        if(!b||!BOT.target)botKick();else{const v0=aimShot(b,BOT.target);
          if(BOT.careful&&BOT.hold<.9&&millBlock(b.p,v0))BOT.hold+=dt;else botKick(v0)}}}
    else if(BOT.st==='follow'&&BOT.t<=0){if(VS.tb&&(VS.turn!=='bot'||VS.left<=0))botStop();else{BOT.st='think';BOT.t=thinkDelay()}}}
  /* pose */
  const P=BOT.parts;BOT.yaw+=(BOT.yawGoal-BOT.yaw)*(1-Math.exp(-10*dt));BOT.fig.rotation.y=BOT.yaw+(BOT.side<0?Math.PI:0);
  let leg=0,lean=0,arm=0;
  if(BOT.st==='wind'){const u=clamp(1-BOT.t/BOT.T,0,1),e=u*u*(3-2*u);leg=-1.15*e;lean=.2*e;arm=.7*e}
  else if(BOT.kickT>=0){BOT.kickT+=dt;const q=BOT.kickT;leg=q<.08?lerp(-1.15,1,q/.08):lerp(1,0,clamp((q-.08)/.35,0,1));lean=-.12*clamp(1-q/.4,0,1);arm=lerp(.7,0,clamp(q/.4,0,1));if(q>.5)BOT.kickT=-1}
  P.kickLeg.rotation.x=leg;P.torso.rotation.x=lean;P.armL.rotation.x=arm;P.armR.rotation.x=-arm*.6;
  P.torso.position.y=.82+(BOT.st==='think'||BOT.st==='off'?Math.sin(lt*3.2)*.012:0);
}
