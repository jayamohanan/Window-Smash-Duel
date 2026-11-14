'use strict';
/* ---------- audio ---------- */
let ac=null,master,noiseBuf;
function buildAudio(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();const comp=ac.createDynamicsCompressor();comp.connect(ac.destination);master=ac.createGain();master.gain.value=.8;master.connect(comp);noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
/* iOS Safari: after the phone is locked (or the tab hidden) the context often comes back saying 'running' but plays nothing,
   or stays 'suspended'/'interrupted'. So once the page has been hidden, the next tap throws the old context away and builds
   a fresh one inside that tap (iOS lets a context start only from a gesture), plus a silent blip to unlock output. */
let audioStale=false;
function unlockBlip(){try{const b=ac.createBuffer(1,1,ac.sampleRate),s=ac.createBufferSource();s.buffer=b;s.connect(ac.destination);s.start(0)}catch(e){}}
function initAudio(){
  if(!ac||audioStale){audioStale=false;if(ac){const o=ac;ac=null;try{o.close()}catch(e){}}buildAudio();if(!ac)return;unlockBlip()}
  if(ac.state==='running')return;
  const cur=ac;try{const p=cur.resume();if(p&&p.then)p.then(()=>{if(cur.state!=='running'&&ac===cur)audioStale=true},()=>{if(ac===cur)audioStale=true})}catch(e){audioStale=true}
  unlockBlip();
  setTimeout(()=>{if(ac===cur&&cur.state!=='running')audioStale=true},400); /* still dead: rebuild on the next tap */
}
function sleepAudio(){if(document.visibilityState==='hidden'||document.hidden){audioStale=true;try{ac&&ac.suspend()}catch(e){}}}
/* Coming back: try a resume so desktop browsers carry on; the next tap rebuilds anyway, which is what iOS needs. */
function wakeAudio(){if(ac&&ac.state!=='running'&&document.visibilityState!=='hidden'){try{const p=ac.resume();if(p&&p.catch)p.catch(()=>{})}catch(e){}}}
document.addEventListener('visibilitychange',()=>{sleepAudio();wakeAudio()});
addEventListener('pagehide',()=>{audioStale=true});
addEventListener('pageshow',e=>{if(e.persisted)audioStale=true;wakeAudio()});
addEventListener('focus',wakeAudio);
function env(g,t,a,dec){g.gain.setValueAtTime(a,t);g.gain.exponentialRampToValueAtTime(.0008,t+dec)}
function noise(t,type,f,q,a,dec){const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;const g=ac.createGain();env(g,t,a,dec);s.connect(b);b.connect(g);g.connect(master);s.start(t,Math.random()*.8);s.stop(t+dec+.02)}
/* brass-like note: two detuned saws through a lowpass that opens on the attack; held for dur, then released */
function brass(t,f,dur,a){const g=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.Q.value=1.2;
  lp.frequency.setValueAtTime(500,t);lp.frequency.linearRampToValueAtTime(Math.min(5200,f*6),t+.05);lp.frequency.exponentialRampToValueAtTime(Math.max(700,f*2.5),t+dur+.25);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+.03);g.gain.setValueAtTime(a*.8,t+dur);g.gain.exponentialRampToValueAtTime(.0008,t+dur+.3);
  lp.connect(g);g.connect(master);[-6,6].forEach(c=>{const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=c;o.connect(lp);o.start(t);o.stop(t+dur+.35)})}
/* noise that swells in (rise s) and fades (fall s) through a bandpass: crowd 'aah' layers */
function swell(t,f,q,a,rise,fall){const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;const b=ac.createBiquadFilter();b.type='bandpass';b.frequency.value=f;b.Q.value=q;
  const g=ac.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(a,t+rise);g.gain.exponentialRampToValueAtTime(.0008,t+rise+fall);
  s.connect(b);b.connect(g);g.connect(master);s.start(t,Math.random()*.8);s.stop(t+rise+fall+.05)}
function tone(t,type,f0,f1,a,dec){const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1!==f0)o.frequency.exponentialRampToValueAtTime(f1,t+dec);const g=ac.createGain();env(g,t,a,dec);o.connect(g);g.connect(master);o.start(t);o.stop(t+dec+.02)}
let tinkAt=-1;
const can=()=>S.sound&&ac&&noiseBuf;
const sfx={
  kick(v){if(!can())return;const t=ac.currentTime,k=v||1;tone(t,'sine',170*(2-k),52,.9*k,.13);noise(t,'lowpass',1800,.6,.35*k,.05)},
  glass(){if(!can())return;const t=ac.currentTime,p=rnd(.92,1.1);
    noise(t,'highpass',2200*p,.7,.8,.11);noise(t,'bandpass',4200*p,.9,.55,.22);tone(t,'sine',135,48,.7,.16);
    for(let i=0;i<10;i++){const q=Math.pow(Math.random(),1.6)*.45;tone(t+.02+q,Math.random()<.5?'triangle':'sine',rnd(2600,7600),rnd(2400,7200),rnd(.05,.13)*(1-q),rnd(.04,.1))}},
  /* falling shards: at most 3 per window, at least 0.12 s apart, so breaks don't chain into noise */
  tink(p){if(!can())return;const t=ac.currentTime;if(t-tinkAt<.12)return;if(p){p.tinks=(p.tinks||0)+1;if(p.tinks>3)return}tinkAt=t;tone(t,'triangle',rnd(3000,6500),rnd(2800,6000),.08,.07);tone(t+.05,'sine',rnd(4000,7500),4000,.045,.05)},
  thud(){if(!can())return;const t=ac.currentTime;tone(t,'sine',120,46,.8,.16);noise(t,'lowpass',620,.8,.5,.09)},
  /* roller shutter moving: a run of metal clicks over a low hum (d: length in s; the VS windows use short, quiet ones) */
  rattle(d){if(!can())return;const t=ac.currentTime,L=d||1.5,n=Math.round(L/.07),k=d?.55:1;for(let i=0;i<n;i++)noise(t+i*.07,'bandpass',rnd(1500,2600),4,.16*k*(1-i/(n+4)),.035);tone(t,'sawtooth',72,64,.05*k,L)},
  /* last-5-seconds beep: a little higher each second (n = seconds left) */
  beep(n){if(!can())return;const t=ac.currentTime,f=660+(5-n)*110;tone(t,'square',f,f,.09,.13);tone(t,'sine',f*2,f*2,.08,.1)},
  click(){if(!can())return;const t=ac.currentTime;tone(t,'square',1900,1700,.14,.035);noise(t,'highpass',3000,1,.25,.03)},
  clang(){if(!can())return;const t=ac.currentTime;tone(t,'square',760,740,.16,.2);tone(t,'triangle',1240,1190,.2,.3);noise(t,'bandpass',2100,2,.25,.05)},
  crack(){if(!can())return;const t=ac.currentTime;noise(t,'highpass',3000,.8,.9,.07);tone(t,'triangle',2400,1800,.3,.09);tone(t,'sine',300,90,.45,.1);for(let i=0;i<6;i++)tone(t+.02+i*.02,'triangle',rnd(3000,6000),rnd(2500,5000),.08,.04)},
  wood(){if(!can())return;const t=ac.currentTime;noise(t,'bandpass',900,1.2,1,.13);tone(t,'triangle',220,90,.6,.14);for(let i=0;i<5;i++)noise(t+.03+i*.03,'bandpass',rnd(1200,2400),2,.35,.05)},
  whoosh(){if(!can())return;const t=ac.currentTime;noise(t,'bandpass',500,.7,.35,1.1);noise(t+.25,'bandpass',900,.7,.25,.8)},
  ding(){if(!can())return;const t=ac.currentTime;tone(t,'sine',1320,1320,.5,1.2);tone(t,'triangle',2640,2630,.18,.8);tone(t,'sine',1980,1975,.12,1)},
  lost(){if(!can())return;const t=ac.currentTime;tone(t,'triangle',392,370,.2,.22);tone(t+.22,'triangle',330,311,.2,.22);tone(t+.46,'triangle',262,196,.22,.55)}, /* softer than the win */
  boom(){if(!can())return;const t=ac.currentTime;tone(t,'sine',96,30,1,.55);noise(t,'lowpass',260,.9,.5,.4)},
  /* win: a short fanfare (da-da-da-DAAA on a bright C major chord) with sparkle, over a crowd cheer and claps */
  win(){if(!can())return;const t=ac.currentTime+.05;
    [[523,0,.1],[659,.13,.1],[784,.26,.1]].forEach(([f,d,l])=>brass(t+d,f,l,.13));
    [523,659,784,1047].forEach(f=>brass(t+.42,f,.85,.085));brass(t+.42,262,.85,.07);
    for(let i=0;i<12;i++)tone(t+.42+i*.07,'sine',rnd(2200,4200),rnd(2200,4200),.05,.18); /* sparkle */
    swell(t+.1,800,1.4,.16,.35,1.9);swell(t+.1,1500,1.1,.12,.4,1.7);swell(t+.15,2600,.9,.06,.3,1.5); /* crowd */
    for(let i=0;i<34;i++){const d=.15+Math.pow(Math.random(),1.3)*1.9;noise(t+d,'bandpass',rnd(1300,2600),1.5,rnd(.08,.18)*(1-d/2.3),.035)}}, /* claps */
  /* party popper: a crack and a puff (fires with the confetti) */
  popper(){if(!can())return;const t=ac.currentTime;noise(t,'highpass',2500,.7,.9,.06);tone(t,'sine',180,60,.6,.09);noise(t+.02,'bandpass',900,.8,.35,.32)},
  star(i){if(!can())return;const t=ac.currentTime,f=[880,1109,1319][i]||1319;tone(t,'triangle',f,f,.32,.3);tone(t,'sine',f*2,f*2,.12,.24)}
};


