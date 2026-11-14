'use strict';
/* ---------- VS round: race the bot; whoever has more points when the clock runs out wins ----------
   Unlimited balls for both sides; S.round seconds on the facade clock.
   Every facade window sits behind a game-driven roller shutter. S.live of them are open at a time. A broken window is
   shuttered 0.7 s later and re-glazed behind the shutter while another one opens elsewhere (whack-a-mole), so the wall stays
   fresh to the end. Now and then one extra window opens with gold glass (LVL.prize.pts points, tagged "+3") for a few seconds.
   Breaks are credited by the ball's owner ('p' or 'bot'); the frame takes the breaker's colour and keeps it while shut, and
   a "+1" rises over the scorer's kick spot. A draw at the bell goes to sudden death: the next point wins. */
const TEAM={p:0x3f8fe0,bot:0xe2513f},FRAME=0xfffaf0,GOLD=0xffc53a;
const VS={on:false,started:false,over:false,sudden:false,t:0,len:60,score:{p:0,bot:0},prize:null,prizeT:0,gap:0,recent:[],tickS:-1};
/* open, intact and not shuttered: a live target */
function isOpen(p){return !!p&&!p.broken&&!p.locked&&(p.shutF===undefined||p.shutF<.15)}
const prizeGap=()=>rnd(LVL.prize.every[0],LVL.prize.every[1]);

function vsStart(L){
  Object.assign(VS,{on:true,started:false,over:false,sudden:false,t:0,len:S.round,score:{p:0,bot:0},prize:null,prizeT:L.prize?L.prize.first:1e9,gap:0,recent:[],tickS:-1,
    tb:turnsPer()>0,each:Math.ceil(TB_KICKS/Math.max(1,turnsPer())),turn:null,left:0,ending:false,pT:0,bT:0,kicks:{p:0,bot:0}});
  panes.forEach(p=>{if(!p.vs)return;p.onShut=reglaze;p.hp0=p.hp;p.armor0=p.armor});
  drawScore();if(clock)clock.set(1,false,false);
  if(OPP.mode==='bot')botReady();else botSpot.visible=true; /* a person plays red: no robot */
  if(VS.tb)beginTurn(OPP.mode==='net'&&!NET.host?'bot':'p') /* turn mode: blue starts; online, whoever created the game */
  const go=()=>{if(VS.tb)roundIntro();later(.8,()=>{if(!VS.on)return;VS.started=true;if(VS.tb)SHUF.played=true;if(!VS.tb)botStart()})}; /* the first shutters rolling up are the start signal */
  if(tapped)go();else startGo=go; /* very first round waits for the tap-to-play gate (ui.js) */
}
/* Start gate: the round waits behind the menu until a mode is picked (ui.js startMode, which reloads the round with
   tapped set); that tap also switches sound on (iOS only allows that from a gesture). */
let tapped=false,startGo=null;
function vsTick(dt){
  prizeTagTick(dt);
  if(!VS.on||!VS.started||VS.over)return;
  VS.t+=dt;
  if(VS.tb)turnTick();
  else{const left=Math.max(0,VS.len-VS.t);
    if(clock)clock.set(left/VS.len,left<=10,VS.sudden);
    const s=Math.ceil(left);if(left>0&&s<=5&&s!==VS.tickS){VS.tickS=s;sfx.click()}
    if(left<=0){if(VS.score.p!==VS.score.bot){endRound();return}if(!VS.sudden){VS.sudden=true;sfx.ding()}}}
  /* keep S.live ordinary windows up (a broken one still counts until its shutter starts down) */
  if(VS.tb)return; /* turn mode: no shutters, every window stays open (re-glazed at each turn start) */
  VS.gap-=dt;
  const up=panes.filter(p=>p.vs&&p.shutGoal===0&&!p.gold).length;
  if(up<S.live&&VS.gap<=0&&openOne(false)){VS.gap=.12;if(!hintDone)updateHint()}
  if(LVL.prize){const pr=VS.prize;
    if(pr){if(!pr.broken&&!VS.tb){pr.goldT-=dt;if(pr.goldT<=0)closeWin(pr)}}
    else if(!VS.tb){VS.prizeT-=dt;if(VS.prizeT<=0&&!openOne(true))VS.prizeT=1}} /* turn mode: no gold window */
}
/* ---------- Turn mode (⚙ panel: S.turns = 1 or 3 kicks per turn; 0 = the real-time race) ----------
   Two goals on one flat-topped wall, a stone pilaster down the middle: the left half's windows are yours (blue frames),
   the right half's the opponent's (red frames; the glass stays plain). A broken one shows a dim room behind it. A broken window scores 1 for the half's OWNER, whoever kicked the ball, and stays
   broken. Clear your whole half and you win at once. Otherwise each side gets TB_KICKS kicks (in turns of S.turns, you first);
   then the one with more of their half broken wins; level -> one-kick turns each until someone leads after a pair.
   A turn ends once that side has used its kicks and its last ball has landed (+0.6 s). No shutters, wired glass, gold or clock. */
const TB_KICKS=15,FRAME_SIDE=TEAM;
const tbOn=()=>!!(LVL&&LVL.vs&&turnsPer()>0); /* turn-mode arena (also true while loadLevel builds, before VS is set up) */
/* Turn-mode arena (called by loadLevel before building): no roller shutters, no wired (two-kick) glass; each window belongs to a half. */
/* Who owns which window. The windows form mirror pairs (left window and its twin across the middle); each round every
   pair is split, one to each side, so both sides always get mirror-image sets (fair from mirrored kick spots).
   SHUF.pat: one entry per pair, top row first, left to right; 1 = you get the left one. All 1 = the classic halves,
   used until the session's first turn round has started; after that each round is shuffled. Online the creator sends a
   seed and both devices derive the same pattern per round (net.js netPattern); since each device sees itself on the
   left, the same pattern is right on both screens. */
const SHUF={played:false,pat:null};
const classicPat=n=>Array(n).fill(1);
function turnPanes(ps){
  const L=ps.filter(p=>p.vs&&p.x<0).sort((a,b)=>b.y-a.y||a.x-b.x),n=L.length;
  const pat=OPP.mode==='net'?netPattern(n):!SHUF.played?classicPat(n):Array.from({length:n},()=>Math.random()<.5?1:0);
  SHUF.pat=pat;
  L.forEach((l,i)=>{const r=ps.find(q=>q.vs&&Math.abs(q.x+l.x)<.01&&Math.abs(q.y-l.y)<.01);l.side=pat[i]?'p':'bot';if(r)r.side=pat[i]?'bot':'p'});
  ps.forEach(p=>{if(!p.vs)return;delete p.shutter;delete p.hp;p.pts=1;if(!p.side)p.side=p.x<0?'p':'bot';p.fc=FRAME_SIDE[p.side]});
}
const shuffled=()=>!!SHUF.pat&&SHUF.pat.some(b=>!b);
/* Round start (turn mode): your windows light up in your colour (three pulses: a tint on the glass and a glowing outline
   around the frame) while a banner says what to do. Every round, since the windows are shuffled between rounds.
   Pass-and-play lights both sides, each in its own colour. */
function roundIntro(){
  const sides=OPP.mode==='local'?['p','bot']:['p'],k=ak(),hl=[];
  panes.forEach(p=>{if(!p.vs||!sides.includes(p.side)||!p.mesh)return;const c=TEAM[p.side];
    const fill=new T.Mesh(p.mesh.geometry,new T.MeshBasicMaterial({color:c,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
    fill.position.z=.004;fill.renderOrder=5;p.mesh.add(fill); /* rides with the glass: gone if it breaks */
    const o=.45*k,i=.22*k,sh=new T.Shape(),hole=new T.Path(),W=p.w/2,H=p.h/2;
    sh.moveTo(-W-o,-H-o);sh.lineTo(W+o,-H-o);sh.lineTo(W+o,H+o);sh.lineTo(-W-o,H+o);sh.closePath();
    hole.moveTo(-W-i,-H-i);hole.lineTo(-W-i,H+i);hole.lineTo(W+i,H+i);hole.lineTo(W+i,-H-i);hole.closePath();sh.holes.push(hole);
    const ring=new T.Mesh(new T.ShapeGeometry(sh),new T.MeshBasicMaterial({color:c,transparent:true,opacity:0,depthWrite:false}));
    ring.position.set(p.x,p.y,.3);ring.renderOrder=5;group.add(ring);hl.push(fill,ring)});
  const t0=lt,dur=2.4;
  movers.push(t=>{const u=t-t0;if(u>dur+.3){hl.forEach(m=>m.visible=false);return}
    const a=u<dur?Math.pow(Math.sin(Math.PI*u/.8),2):0;hl.forEach((m,j)=>m.material.opacity=a*(j%2?.95:.55))});
  const b=$('intro'),loc=OPP.mode==='local';
  b.innerHTML=loc?'SMASH ALL YOUR WINDOWS FAST TO WIN!<small><span class="you">PLAYER 1: BLUE</span> · <span class="bot">PLAYER 2: RED</span></small>'
    :'SMASH ALL <span class="you">BLUE</span> WINDOWS FAST TO WIN!';
  b.hidden=false;b.classList.remove('go');void b.offsetWidth;b.classList.add('go');
  clearTimeout(roundIntro.t);roundIntro.t=setTimeout(()=>b.hidden=true,3200);
}
const halfCount=who=>panes.filter(p=>p.vs&&p.side===who).length;
function beginTurn(who){
  if(VS.over)return;
  VS.blink=localHuman(who); /* "YOUR TURN" blinks until the ball is grabbed (turnGrab) */
  VS.turn=who;VS.left=VS.turnN=VS.sudden?1:Math.min(turnsPer(),TB_KICKS-VS.kicks[who]);VS.ending=false;
  if(who==='bot'&&OPP.mode==='bot')botStart();else botStop();
  if(cur&&cur.owner!==who){removeBallMesh(cur);cur=null} /* pass-and-play: the waiting ball moves to the other spot */
  turnLabel(true);
}
/* a kick by 'p' (input.js kickFx) or 'bot' (bot.js botKick) uses one of the turn's kicks */
function turnKick(who){if(!VS.on||!VS.tb||VS.turn!==who||VS.left<=0)return;VS.left--;VS.kicks[who]++;turnLabel(false)}
function turnTick(){
  if(VS.turn&&VS.left<=0&&!VS.ending&&!balls.some(b=>b.owner===VS.turn&&b.state==='fly')){VS.ending=true;const n=VS.pT+VS.bT;later(.6,()=>{if(VS.ending&&VS.pT+VS.bT===n)endTurn()})}
}
function endTurn(){
  if(!VS.on||!VS.tb||VS.over)return;
  const who=VS.turn;VS.turn=null;
  if(VS.prize&&!VS.prize.broken)closeWin(VS.prize);
  if(who==='p'){VS.pT++;beginTurn('bot');return}
  VS.bT++;
  if(VS.kicks.p>=TB_KICKS&&VS.kicks.bot>=TB_KICKS){if(VS.score.p!==VS.score.bot){endRound();return}if(!VS.sudden){VS.sudden=true;sfx.ding()}}
  beginTurn('p');
}
/* Turn mode HUD, pinned to the kick spots (placeTags runs every frame, so it follows the camera):
   - the turn label ("YOUR TURN" / "FRIEND'S TURN" / "PLAYER 2" …) floats above the kicking side's ball (above the robot's head);
     on a turn played on this device it blinks until that player grabs the ball;
   - each side's footballs for its turn (used ones fade) plus its kicks left: yours to the left of your spot, the
     opponent's to the right of theirs (below the spot when there's no room); dimmed while it isn't their turn. */
const BALL_ICON='<svg viewBox="-24 -24 48 48" aria-hidden="true"><use href="#ballIcon"/></svg>';
function turnLabel(fresh){
  const show=VS.on&&VS.tb&&!VS.over&&!sandbox;$('tags').hidden=!show;if(!show)return;
  ['p','bot'].forEach(s=>{
    const on=VS.turn===s,L=$(s==='p'?'tlP':'tlB'),K=$(s==='p'?'kkP':'kkB');
    L.hidden=!on;
    if(on){L.textContent=(VS.sudden?'SUDDEN DEATH · ':'')+sideName(s);L.classList.toggle('blink',!!VS.blink);
      if(fresh){L.classList.remove('pop');void L.offsetWidth;L.classList.add('pop')}}
    const n=on?VS.turnN||1:VS.sudden?1:Math.max(1,Math.min(turnsPer(),TB_KICKS-VS.kicks[s])),left=on?VS.left:n;
    K.classList.toggle('idle',!on);
    K.innerHTML='<span aria-label="'+left+' kicks this turn">'+Array.from({length:n},(_,i)=>'<i'+(i<left?' class="on"':'')+'>'+BALL_ICON+'</i>').join('')+'</span>'+(VS.sudden?'':'<em>'+Math.max(0,TB_KICKS-VS.kicks[s])+' left</em>');
  });
  placeTags();
}
function placeTags(){
  if($('tags').hidden)return;
  [['p',PX,'tlP','kkP',-1],['bot',BX,'tlB','kkB',1]].forEach(([s,x,l,k,dir])=>{
    const L=$(l);
    if(!L.hidden){const a=toScreen(x,s==='bot'&&OPP.mode==='bot'?3.1:2*R+.32,D),hw=L.offsetWidth/2;L.style.left=clamp(a[0],hw+8,W_-hw-8)+'px';L.style.top=Math.max(a[1],96)+'px'}
    const K=$(k),w=K.offsetWidth,h=K.offsetHeight,b=toScreen(x+dir*1.5,R,D),c=toScreen(x,0,D);
    let left=dir<0?b[0]-w:b[0],top=b[1]-h/2;
    /* no room at the side: just below the spot, if the spot is on screen (else it stays at the screen edge on its side) */
    if((left<8||left+w>W_-8)&&c[0]>0&&c[0]<W_){const u=toScreen(x,0,D+1.3);left=u[0]-w/2;top=u[1]}
    K.style.left=clamp(left,8,W_-w-8)+'px';K.style.top=clamp(top,60,H_-h-8)+'px';
  });
}
/* the player whose turn it is pressed on their ball: stop the blinking */
function turnGrab(){if(VS.blink){VS.blink=false;turnLabel(false)}}
/* turn pill / round-over names: pass-and-play has two players on one screen; online the red side is your friend */
function sideName(s){if(OPP.mode==='local')return s==='p'?'PLAYER 1':'PLAYER 2';return s==='p'?'YOUR TURN':OPP.mode==='net'&&!OPP.quick?"FRIEND'S TURN":"OPPONENT'S TURN"}
/* Open one shut, re-glazed window: not one that just closed, and preferably away from the open ones. */
function openOne(gold){
  const ready=panes.filter(p=>p.vs&&p.shutGoal===1&&p.shutK>=1&&!p.broken);
  let pool=ready.filter(p=>!VS.recent.includes(p));if(!pool.length)pool=ready;if(!pool.length)return false;
  const open=panes.filter(q=>q.vs&&q.shutGoal===0),wt=pool.map(p=>.3+Math.min(6,...open.map(q=>Math.hypot(q.x-p.x,q.y-p.y))));
  let r=Math.random()*wt.reduce((a,b)=>a+b,0),i=0;while(i<pool.length-1&&(r-=wt[i])>0)i++;
  const p=pool[i];
  p.gold=gold;p.mesh.material=gold?goldGlassMat:glassMat;tintFrame(p,gold?GOLD:FRAME);p.shutGoal=0;p.openAt=VS.t;
  if(gold){p.goldT=LVL.prize.stay;VS.prize=p;sfx.ding()}
  sfx.rattle(.3);glFresh(p);
  return true;
}
function closeWin(p){
  p.shutGoal=1;VS.recent.push(p);if(VS.recent.length>2)VS.recent.shift();
  if(p===VS.prize){VS.prize=null;VS.prizeT=prizeGap()}
}
/* Shutter fully down: put fresh glass in (and the wire / boards back). The frame keeps the breaker's colour. */
function reglaze(p){
  if(p.broken){p.broken=false;p.mesh.visible=true;(p.extra||[]).forEach(m=>m.visible=true);p.tinks=0}
  if(p.hp0>1&&p.hp!==p.hp0){p.hp=p.hp0;const c=p.crackCv;c.getContext('2d').clearRect(0,0,c.width,c.height);p.crackTex.needsUpdate=true}
  if(p.armor0>0&&p.armor!==p.armor0){p.armor=p.armor0;p.boards.visible=true}
  if(p.gold){p.gold=false;p.mesh.material=glassMat}
}
/* Called by smash() for every broken window. */
function onBreak(p,b){
  if(!VS.on||!p.vs)return;
  const who=b.owner==='bot'?'bot':'p',gets=VS.tb?p.side:who; /* turn mode: the half's owner scores, whoever kicked */
  if(!VS.over){const pts=VS.tb?1:p.gold&&LVL.prize?LVL.prize.pts:1;VS.score[gets]+=pts;drawScore(gets);gainPop(gets,pts)}
  if(VS.tb){if(p.inner)p.inner.visible=true}else tintFrame(p,TEAM[who]); /* turn mode: frames keep the half's colour; a dark room shows */
  if(VS.tb&&!VS.over&&VS.score[gets]>=halfCount(gets))later(.45,endRound); /* half cleared: instant win */
  if(p===VS.prize){VS.prize=null;VS.prizeT=prizeGap()}
  if(!hintDone)updateHint();
  later(.7,()=>{if(VS.on&&p.shutGoal===0)closeWin(p)});
  if(VS.sudden&&!VS.tb&&VS.score.p!==VS.score.bot)later(.35,endRound); /* turn mode settles sudden death after each pair (endTurn) */
}
function endRound(){
  if(VS.over||!VS.on)return;VS.over=true;won=true;winAt=performance.now();botStop();
  if(drag){drag=null;hidePreview()}$('hint').hidden=true;$('tags').hidden=true;$('intro').hidden=true;
  if(clock)clock.set(0,true,false);sfx.boom();
  panes.forEach((p,i)=>{if(p.vs&&p.shutGoal===0)later(.2+i*.04,()=>closeWin(p))});
  const pw=VS.score.p>VS.score.bot;
  const loc=OPP.mode==='local',word=loc?(pw?'PLAYER 1 WINS':'PLAYER 2 WINS'):pw?'YOU WIN!':OPP.mode==='net'&&!OPP.quick?'FRIEND WINS':'OPPONENT WINS';
  later(.7,()=>{$('winWord').textContent=word;$('win').classList.toggle('lose',!pw);$('win').hidden=false;
    if(pw||loc){burstConfetti();sfx.win()}else sfx.lost();
    later(.9,()=>{$('again').hidden=false;if(OPP.mode==='net'&&OPP.quick)rematchUi(NET.peer?(NET.rmThem?'ask':'idle'):'left')})});
}
/* The two small scores at the top (blue = you, red = the bot); the scorer's number bumps. Hidden outside VS. */
function drawScore(who){
  const on=VS.on&&!sandbox;$('score').hidden=!on;if(!on){$('tags').hidden=true;return}
  if(VS.tb){$('scP').innerHTML=VS.score.p+'<small>/'+halfCount('p')+'</small>';$('scB').innerHTML=VS.score.bot+'<small>/'+halfCount('bot')+'</small>'}
  else{$('scP').textContent=VS.score.p;$('scB').textContent=VS.score.bot}
  if(who){const e=$(who==='p'?'scP':'scB');e.classList.remove('bump');void e.offsetWidth;e.classList.add('bump')}
}
/* "+1" (or "+3" for gold) rising and fading over the scorer's kick spot, in their colour. */
function gainPop(who,pts){
  const s=who==='p'?toScreen(PX,R+1.1,D):toScreen(BX,OPP.mode==='bot'?2.7:R+1.1,BZ),d=document.createElement('div');
  d.className='gain '+(who==='p'?'you':'bot')+(pts>1?' big':'');d.textContent='+'+pts;
  d.style.left=clamp(s[0],40,W_-40)+'px';d.style.top=clamp(s[1],60,H_-30)+'px';$('stage').appendChild(d);setTimeout(()=>d.remove(),1200);
}
/* The gold window wears a "+3" tag (a sprite just in front of its glass) while it is open, gently pulsing. */
let prizeTag=null;
/* gold "+N" text texture for tags on the facade */
function tagTex(txt){
  const draw=(g,w,h)=>{g.clearRect(0,0,w,h);g.font='400 120px "Lilita One","Trebuchet MS",sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
    g.lineWidth=22;g.strokeStyle='#23304a';g.strokeText(txt,w/2,h/2+8);g.fillStyle='#ffc53a';g.fillText(txt,w/2,h/2+8)};
  const tex=canvasTex(256,160,draw);
  /* iOS Safari draws canvas text in a still-loading web font as nothing; redraw once Lilita One is in. */
  if(document.fonts&&!document.fonts.check(TAG_FONT))document.fonts.load(TAG_FONT).then(()=>{const c=tex.image;draw(c.getContext('2d'),c.width,c.height);tex.needsUpdate=true},()=>{});
  return tex;
}
const TAG_FONT='400 120px "Lilita One"';
try{document.fonts&&document.fonts.load(TAG_FONT).catch(()=>{})}catch(e){} /* start loading it now, before any gold window */
function prizeTagTick(dt){
  const pr=VS.on&&VS.prize,show=!!pr&&isOpen(pr)&&!VS.over;
  if(!show){if(prizeTag)prizeTag.visible=false;return}
  if(!prizeTag){
    prizeTag=new T.Sprite(new T.SpriteMaterial({map:tagTex('+'+LVL.prize.pts),depthWrite:false}));prizeTag.renderOrder=6;scene.add(prizeTag)}
  prizeTag.visible=true;prizeTag.position.set(pr.x,pr.y,.45);const k=1+Math.sin(lt*7)*.08;prizeTag.scale.set(2.3*k,1.44*k,1);
}
