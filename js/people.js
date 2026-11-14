'use strict';
/* ---------- people: a chunky footballer beside each human player's ball ----------
   Green for you; orange for player 2 (pass-and-play) or the online friend. The robot (bot.js) stays for the computer opponent.
   Built from boxes like the robot, facing the wall (-z), so you mostly see their back (with a shirt number). Each stands
   beside and a little behind its ball on the outer side (green to the left of its ball, orange to the right), so it never
   hides the ball or the windows from the camera behind you. On every kick it steps in, swings the inside leg through and
   turns a little toward the shot. */
const SKIN=0xf1c27d,HAIR=0x4a2f1c,BOOT=0x23304a,SHORTS=0xfff8e8;
const numTex=canvasTex(64,64,(g,w,h)=>{g.clearRect(0,0,w,h);g.font='400 46px "Lilita One","Trebuchet MS",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff8e8';g.fillText('10',w/2,h/2+3)});
if(document.fonts)document.fonts.load('400 46px "Lilita One"').then(()=>{const c=numTex.image,g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.font='400 46px "Lilita One","Trebuchet MS",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff8e8';g.fillText('10',c.width/2,c.height/2+3);numTex.needsUpdate=true},()=>{});
/* side: -1 = stands left of its ball (kicks with the right leg), 1 = right of it (left leg) */
function buildKid(shirt,side){
  const f=new T.Group(),body=new T.Group();f.add(body);
  const leg=x=>{const g=new T.Group();g.position.set(x,.78,0);body.add(g);
    box(.2,.24,.24,SHORTS,0,-.1,0,g);box(.15,.36,.16,SKIN,0,-.4,0,g);box(.16,.2,.17,shirt,0,-.62,0,g);box(.18,.1,.3,BOOT,0,-.74,-.05,g);return g};
  const kickLeg=leg(-side*.11),plant=leg(side*.11);
  const torso=new T.Group();torso.position.y=.78;body.add(torso);
  box(.46,.14,.27,SHORTS,0,0,0,torso);box(.48,.5,.28,shirt,0,.32,0,torso);box(.22,.05,.29,SHORTS,0,.56,0,torso);
  const num=new T.Mesh(new T.PlaneGeometry(.3,.3),new T.MeshBasicMaterial({map:numTex,transparent:true,depthWrite:false}));num.position.set(0,.36,.142);torso.add(num);
  const head=new T.Group();head.position.y=.6;torso.add(head);
  box(.12,.08,.12,SKIN,0,.02,0,head);box(.32,.34,.3,SKIN,0,.22,0,head);
  box(.34,.11,.32,HAIR,0,.42,.01,head);box(.34,.22,.06,HAIR,0,.3,.15,head); /* hair on top and down the back */
  [-1,1].forEach(s=>box(.05,.06,.01,BOOT,s*.07,.24,-.155,head,false)); /* eyes */
  const arm=x=>{const g=new T.Group();g.position.set(x,.52,0);torso.add(g);box(.13,.18,.15,shirt,0,-.07,0,g);box(.11,.3,.12,SKIN,0,-.3,0,g);return g};
  const armL=arm(-.31),armR=arm(.31);
  f.visible=false;scene.add(f);
  return{f,body,side,kickLeg,plant,torso,armL,armR,kickT:-1,yaw:0,yawGoal:0};
}
const KIDS={p:buildKid(TEAM.p,-1),bot:buildKid(TEAM.bot,1)};
/* Called by placeSpots (layout, level load): beside its spot, shown only for sides a person plays. */
function placeKids(){
  const vs=!!(LVL&&LVL.vs)&&!sandbox;
  KIDS.p.f.visible=vs;KIDS.bot.f.visible=vs&&OPP.mode!=='bot'&&!VS.intro; /* hidden during the turn-mode round intro (vs.js) */
  KIDS.p.f.position.set(PX-.75,0,D+.35);KIDS.bot.f.position.set(BX+.75,0,BZ+.35);
}
/* a kick by side s with launch velocity v */
function kidKick(s,v){const k=KIDS[s];if(!k||!k.f.visible)return;k.kickT=0;k.yawGoal=clamp(Math.atan2(-v.x,-v.z)*.6,-.5,.5)}
function kidTick(dt){
  for(const s in KIDS){const k=KIDS[s];if(!k.f.visible)continue;
    let leg=0,lean=0,arm=0,step=0;
    if(k.kickT>=0){k.kickT+=dt;const q=k.kickT;
      if(q<.07){const u=q/.07;leg=lerp(0,-.9,u);step=u}                                     /* plant and draw the leg back */
      else if(q<.16){const u=(q-.07)/.09;leg=lerp(-.9,1.15,u);lean=-.15*u;step=1}           /* swing through */
      else{const u=clamp((q-.16)/.45,0,1),e=u*u*(3-2*u);leg=lerp(1.15,0,e);lean=lerp(-.15,0,e);step=1-e}
      arm=Math.sin(Math.min(q,.6)/.6*Math.PI)*.8;if(q>.7){k.kickT=-1;k.yawGoal=0}}
    k.yaw+=(k.yawGoal-k.yaw)*(1-Math.exp(-8*dt));k.f.rotation.y=k.yaw;
    k.body.position.set(-k.side*.32*step,0,-.25*step); /* step in toward the ball */
    k.kickLeg.rotation.x=leg;k.plant.rotation.x=-leg*.15;k.torso.rotation.x=lean;
    k.armL.rotation.x=arm*(k.side<0?1:-1)*.7;k.armR.rotation.x=-arm*(k.side<0?1:-1)*.7;
    k.armL.rotation.z=-.25-arm*.3;k.armR.rotation.z=.25+arm*.3; /* arms out for balance */
    k.torso.position.y=.78+(k.kickT<0?Math.sin(lt*3+(s==='p'?0:1.7))*.012:0);
  }
}
