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
  const go=()=>later(.8,()=>{if(!VS.on)return;VS.started=true;if(!VS.tb)botStart()}); /* the first shutters rolling up are the start signal */
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
function turnPanes(ps){ps.forEach(p=>{if(!p.vs)return;delete p.shutter;delete p.hp;p.pts=1;p.side=p.x<0?'p':'bot';p.fc=FRAME_SIDE[p.side]})}
const halfCount=who=>panes.filter(p=>p.vs&&p.side===who).length;
function beginTurn(who){
  if(VS.over)return;
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
/* "YOUR TURN" / "OPPONENT'S TURN" pill centred on the grass just in front of the kick spots, one football per kick in the turn (used ones fade). */
function placeTurn(){const y=toScreen(0,0,D+1.3)[1]+4;$('turn').style.top=Math.round(clamp(y,80,H_-46))+'px'}
function turnLabel(fresh){
  const e=$('turn'),show=VS.on&&VS.tb&&!VS.over&&!!VS.turn&&!sandbox;e.hidden=!show;if(!show)return;
  const you=VS.turn==='p',n=VS.turnN||1;
  e.className=you?'you':'bot';placeTurn();
  const ball='<svg viewBox="-24 -24 48 48" aria-hidden="true"><use href="#ballIcon"/></svg>';
  e.innerHTML=(VS.sudden?'SUDDEN DEATH · ':'')+sideName(VS.turn)+' <span aria-label="'+VS.left+' kicks left">'+Array.from({length:n},(_,i)=>'<i'+(i<VS.left?' class="on"':'')+'>'+ball+'</i>').join('')+'</span>'+(VS.sudden?'':'<em>'+(TB_KICKS-VS.kicks[VS.turn])+' left</em>');
  if(fresh){e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
}
/* turn pill / round-over names: pass-and-play has two players on one screen; online the red side is your friend */
function sideName(s){if(OPP.mode==='local')return s==='p'?'PLAYER 1':'PLAYER 2';return s==='p'?'YOUR TURN':OPP.mode==='net'?"FRIEND'S TURN":"OPPONENT'S TURN"}
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
  if(drag){drag=null;hidePreview()}$('hint').hidden=true;$('turn').hidden=true;
  if(clock)clock.set(0,true,false);sfx.boom();
  panes.forEach((p,i)=>{if(p.vs&&p.shutGoal===0)later(.2+i*.04,()=>closeWin(p))});
  const pw=VS.score.p>VS.score.bot;
  const loc=OPP.mode==='local',word=loc?(pw?'PLAYER 1 WINS':'PLAYER 2 WINS'):pw?'YOU WIN!':OPP.mode==='net'?'FRIEND WINS':'OPPONENT WINS';
  later(.7,()=>{$('winWord').textContent=word;$('win').classList.toggle('lose',!pw);$('win').hidden=false;
    if(pw||loc){burstConfetti();sfx.win()}else sfx.lost();
    later(.9,()=>{$('again').hidden=false})});
}
/* The two small scores at the top (blue = you, red = the bot); the scorer's number bumps. Hidden outside VS. */
function drawScore(who){
  const on=VS.on&&!sandbox;$('score').hidden=!on;if(!on){$('turn').hidden=true;return}
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
