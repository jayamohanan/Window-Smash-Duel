'use strict';
const T=THREE, $=id=>document.getElementById(id);
const rnd=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), lerp=(a,b,t)=>a+(b-a)*t;

/* ---------- settings ---------- */
const DEF={mode:'live',power:5.5,loft:.5,side:1,lift:1,gravity:16,grab:1.5,ring:3,speed:30,curve:1,snap:.2,reach:1.5,flick:1,reachP:1,arcP:.5,pMax:36,preview:.4,arena:1.7,freeze:85,slow:.3,shake:1,shards:1,sound:true,glSkyOn:false, /* sky drift off by default (renamed from glSky so old saved 'on' values don't bring it back) */ glints:true,
  /* VS round and bot (see bot.js / vs.js) */
  round:60,live:4,turns:0,botGood:.5,botBad:.27,botErr:.45,botBias:.22,botSmart:.4,botThink:1,botEase:.35,botWindup:.45,botFlight:.8};
const KEY='windowSmashDuel.v1'; /* its own key: the original game's saved settings stay separate */
let S=Object.assign({},DEF);
try{Object.assign(S,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
/* bot difficulty presets (the Easy / Normal / Hard chips set these; the sliders fine-tune). Later, each level brings its own
   bot with its own numbers. good/bad = chance of a good / bad (missing) kick, the rest are okay kicks near the edge;
   err = spread of a good kick (m); bias = size of its personal habit (m); smart = chance it times kicks past the windmills.
   Simulated hit rate with no windmills in the way (long kick facade): Easy ~64%, Normal ~73%, Hard ~86%. */
const BOT_PRESETS={easy:{botGood:.35,botBad:.4,botErr:.55,botBias:.3,botSmart:0,botThink:1.5},
  normal:{botGood:.5,botBad:.27,botErr:.45,botBias:.22,botSmart:.4,botThink:1},
  hard:{botGood:.68,botBad:.13,botErr:.35,botBias:.15,botSmart:.85,botThink:.65}};
if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)S.shake=Math.min(S.shake,.2);
/* Live+ (dev mode 'livep'): same flick as live, but swipe speed only decides kick vs dribble; how high the finger goes sets the height. */
/* Who plays the red side: 'bot' (the robot), 'local' (a second player on this device, pass-and-play) or 'net' (a friend
   online, net.js). Side 'p' is always this device's player (blue, left half); 'bot' is the red side (right half), whoever
   plays it. Online, each device sees itself as blue on the left: the arena is a mirror image, so net.js flips x. */
const OPP={mode:'bot',turns:3,quick:false}; /* quick: an online match with a stranger (vs a friend by code) */
const localHuman=s=>s==='p'||OPP.mode==='local';
/* kicks per turn (0 = real-time race): the ⚙ setting; games between two people are always turn-based (3 kicks if the
   setting says real-time); online the creator's setting is used (OPP.turns) */
const turnsPer=()=>OPP.mode==='net'?OPP.turns:S.turns>0?S.turns:OPP.mode==='bot'?0:3;
const isLive=()=>S.mode==='live'||S.mode==='livep';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const SL=[['power','Kick power (swipe speed)',2,12,.25,'live1'],['loft','Kick height',.2,1,.05,'live1'],['flick','Live+: flick speed for a full kick',.3,3,.05,'plus'],['reachP','Live+: swipe reach (× finger height)',.8,2,.05,'plus'],['arcP','Live+: arc peak above aim point (m)',0,3,.1,'plus'],['pMax','Live+: max kick speed (m/s)',20,50,1,'plus'],['side','Steering: sideways',.2,2,.05,'live'],['lift','Steering: height',.2,2,.05,'live'],['gravity','Gravity',6,30,.5,'live'],['reach','Swipe reach (× finger height)',1,3,.05,'live1'],['grab','Grab circle (× ball)',1,3,.1,'live'],['ring','Kick ring (× ball)',1.5,6,.1,'live'],['speed','Ball speed',18,50,1,'old'],['curve','Curve strength',0,2,.05,'old'],['snap','Aim help',0,1,.05],['preview','Path preview',.1,1,.05,'old'],['freeze','Freeze on hit (ms)',0,200,5],['slow','Slow-mo speed',.1,1,.05],['shake','Screen shake',0,2,.1],['shards','Glass pieces',.4,2,.1],
  ['botGood','Opponent: good kick chance',0,1,.01,'bot'],['botBad','Opponent: bad kick (miss) chance',0,.6,.01,'bot'],['botErr','Opponent: good kick spread (m)',0,1,.05,'bot'],['botBias','Opponent: habit size (m)',0,.6,.02,'bot'],['botSmart','Opponent: dodges windmills',0,1,.05,'bot'],['botThink','Opponent: think delay (s)',.2,3,.05,'bot'],['botEase','Opponent: careless when 2+ ahead',0,1,.05,'bot'],['botWindup','Opponent: wind-up (s)',.15,1,.05,'bot'],['botFlight','Opponent: ball flight time (s)',.5,1.4,.05,'bot'],['arena','Long kick: arena size (next round)',1,2.4,.05],['round','Round length (s, next round)',20,120,5,'bot'],['live','Open windows',3,5,1,'bot']];

