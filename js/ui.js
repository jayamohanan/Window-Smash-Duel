'use strict';
/* ---------- UI ---------- */
function chips(){
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===S.mode));
  document.querySelectorAll('[data-lvl]').forEach(b=>b.classList.toggle('on',!sandbox&&+b.dataset.lvl===level));
  document.querySelectorAll('[data-bot]').forEach(b=>{const k=b.dataset.bot,p=BOT_PRESETS[k];b.classList.toggle('on',k==='auto'?S.botAuto:!S.botAuto&&Object.keys(p).every(k=>S[k]===p[k]))});
  /* start screen mode switch: Timed (S.turns 0, the default) or Turns (3 kicks a turn) */
  document.querySelectorAll('[data-pm]').forEach(b=>{const on=(+b.dataset.pm>0)===(S.turns>0);b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
  document.querySelectorAll('[data-turns]').forEach(b=>b.classList.toggle('on',+b.dataset.turns===S.turns));
  $('sandbox').classList.toggle('on',sandbox);
  $('glSky').classList.toggle('on',S.glSkyOn);$('glGlint').classList.toggle('on',S.glints);
  const sb=$('soundBtn');sb.classList.toggle('muted',!S.sound);sb.setAttribute('aria-label',S.sound?'Sound on':'Sound off');
}
$('lvlRow').innerHTML=LV.map((L,i)=>'<button class="chip" data-lvl="'+i+'" title="'+L.name+'">'+(i+1)+'</button>').join('');
function buildSliders(){
  const tags=(S.mode==='live'?['live','live1']:S.mode==='livep'?['live','plus']:['old']).concat('bot');
  const vis=SL.filter(a=>!a[5]||tags.includes(a[5]));
  $('sliders').innerHTML=vis.map(a=>'<label for="s_'+a[0]+'"><span>'+a[1]+'</span><output id="o_'+a[0]+'"></output><input id="s_'+a[0]+'" type="range" min="'+a[2]+'" max="'+a[3]+'" step="'+a[4]+'"></label>').join('');
  vis.forEach(a=>{const i=$('s_'+a[0]),o=$('o_'+a[0]);i.value=S[a[0]];o.textContent=S[a[0]];i.oninput=()=>{S[a[0]]=+i.value;o.textContent=i.value;save();chips()}});
}
$('gear').onclick=()=>{$('panel').hidden=!$('panel').hidden};
/* online, both devices must play the same round: nothing here may reload it */
const offline=()=>OPP.mode!=='net';
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;save();buildSliders();chips();if(offline())reloadLevel()});
document.querySelectorAll('[data-lvl]').forEach(b=>b.onclick=()=>{if(offline())loadLevel(+b.dataset.lvl)});
document.querySelectorAll('[data-bot]').forEach(b=>b.onclick=()=>{const k=b.dataset.bot;if(k==='auto')S.botAuto=true;else{S.botAuto=false;Object.assign(S,BOT_PRESETS[k])}save();buildSliders();chips()});
/* start screen switch: rebuild the waiting round behind the menu in that mode, so PLAY starts it as shown */
document.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{initAudio();const t=+b.dataset.pm;if(t===S.turns)return;S.turns=t;save();chips();if(offline())loadLevel(level)});
document.querySelectorAll('[data-turns]').forEach(b=>b.onclick=()=>{S.turns=+b.dataset.turns;save();chips();if(offline())reloadLevel()});
$('glSky').onclick=()=>{S.glSkyOn=!S.glSkyOn;save();chips()};
$('glGlint').onclick=()=>{S.glints=!S.glints;save();chips()};
$('sandbox').onclick=()=>{if(offline())loadSandbox()};
$('soundBtn').onclick=()=>{initAudio();S.sound=!S.sound;save();chips()};
$('retryBtn').onclick=()=>{initAudio();$('panel').hidden=true;setPause(false);restart()};
$('pauseBtn').onclick=()=>{initAudio();$('panel').hidden=true;setPause(!paused)};
$('resume').onclick=()=>{initAudio();setPause(false)};
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPause(true)});
$('reset').onclick=()=>{S=Object.assign({},DEF);save();buildSliders();chips()};
$('copy').onclick=()=>{const txt=JSON.stringify(S),box=$('copyBox');const fb=()=>{box.hidden=false;box.value=txt;box.select()};$('copy').textContent='Copied';setTimeout(()=>$('copy').textContent='Copy values',1100);try{navigator.clipboard.writeText(txt).catch(fb)}catch(e){fb()}};
$('again').onclick=()=>{initAudio();if(OPP.mode==='net'&&OPP.quick){netQuick();return} /* stranger: Play again = a new match */netAgain();restart()};
$('rematch').onclick=()=>{initAudio();netRematch()};
/* ---------- menu: who you play. The round waits behind it (vs.js start gate) until a mode is picked. ---------- */
/* menuOn (on <body>): the in-game HUD hides except Sound; 'title' = the start screen (the live game shows through) */
function showMenu(v){const m=$('menu');m.hidden=false;m.querySelectorAll('[data-v]').forEach(c=>c.hidden=c.dataset.v!==v);m.classList.toggle('title-on',v==='main');document.body.classList.add('menuOn');$('panel').hidden=true;setPause(false)}
function hideMenu(){$('menu').hidden=true;document.body.classList.remove('menuOn')}
function showMsg(h,p,o){$('msgH').textContent=h;$('msgP').textContent=p||'';$('mMsgBot').hidden=!(o&&o.bot);$('mRetry').hidden=!(o&&o.retry);showMenu('msg')}
/* start a round against the robot ('bot'), a second player on this device ('local') or the connected friend ('net') */
function startMode(mode){
  if(mode!=='net')netClose();
  OPP.mode=mode;OPP.quick=mode==='net'&&NET.quick;tapped=true;initAudio();hideMenu();startGo=null;setPause(false);
  $('retryBtn').hidden=mode==='net'; /* online, a new round comes from Play again on both sides */
  loadLevel(level);
}
function goMenu(){netClose();OPP.mode='bot';tapped=false;setPause(false);$('retryBtn').hidden=false;showMenu('main');loadLevel(level)}
$('mPlay').onclick=()=>startMode('bot'); /* PLAY: the opponent, in the mode on the switch */
$('mLocal').onclick=()=>startMode('local');
$('mOnline').onclick=()=>{initAudio();netQuick()};
$('mRetry').onclick=()=>{initAudio();netQuick()};
$('mFriend').onclick=()=>{initAudio();showMenu('friend')};
$('mCreate').onclick=()=>{initAudio();netHost()};
$('joinForm').onsubmit=e=>{e.preventDefault();initAudio();netJoin($('code').value)};
$('mCopy').onclick=shareCode;
$('mMsgBot').onclick=()=>startMode('bot');
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{initAudio();goMenu()});
$('homeBtn').onclick=$('winMenu').onclick=()=>{initAudio();$('panel').hidden=true;goMenu()};
/* number keys jump to an arena: digits within 350 ms of each other make one number; unknown numbers do nothing */
let numBuf='',numT=0;
function numKey(d){numBuf+=d;clearTimeout(numT);const go=()=>{const n=+numBuf;numBuf='';if(n>=1&&n<=LV.length)loadLevel(n-1)};if(numBuf.length>=2)go();else numT=setTimeout(go,350)}
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;
  if(!tapped||(!offline()&&/^[0-9mMrR]$/.test(e.key)))return; /* menu up: its buttons take the keys; online: no reloads */
  if(/^[0-9]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){numKey(e.key);return}
  if(e.key==='m'||e.key==='M'){const o=['live','livep','aim','shape'];S.mode=o[(o.indexOf(S.mode)+1)%o.length];save();buildSliders();chips();reloadLevel();pop('Control: '+S.mode,0,4,0,true)}
  else if(e.key==='p'||e.key==='P'||e.key==='Escape')setPause(!paused);
  else if(e.key==='r'||e.key==='R'){setPause(false);reloadLevel()}
  else if((e.key===' '||e.key==='Enter')&&won){e.preventDefault();vsTap()}});
addEventListener('resize',layout);

buildSliders();
chips();
layout();
loadLevel(0);
/* an invite link (?room=CODE) opens straight on the join screen with the code filled in */
{const room=new URLSearchParams(location.search).get('room');if(room){$('code').value=room.slice(0,12);showMenu('friend')}else showMenu('main')}
requestAnimationFrame(frame);
/* Loading screen: once the first frames are drawn (and at least ~0.8 s in, so it doesn't flash) the bar runs up to 100%, then fades out. */
requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>{window.ldDone=true;const w=()=>{const l=$('loader');if(!l)return;if(!window.ldFull)return requestAnimationFrame(w);setTimeout(()=>{l.classList.add('done');setTimeout(()=>l.remove(),500)},180)};w()},Math.max(0,800-performance.now()))));
window.__ws={get panes(){return panes},get level(){return level},get sandbox(){return sandbox},get won(){return won},get cur(){return !!cur},get balls(){return balls},get vs(){return VS},get bot(){return BOT},ballPx,scr:toScreen,S};
