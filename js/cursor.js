'use strict';
/* ---------- mouse cursor: a big neon-green arrow drawn over the canvas (the system cursor is hidden there), so it's easy
   to find between quick kicks. One fixed look (green arrow, black outline, tip = pointer spot) in every state; while dragging
   it also leaves a short trail of dots. Mouse only: never shown for touch. Buttons and the ⚙ panel
   sit over the canvas, so the normal cursor comes back on them. ---------- */
const CUR={el:$('cursor'),on:false,x:0,y:0,trail:[],hist:[]};
for(let i=0;i<8;i++){const d=document.createElement('i');d.className='ctrail';d.hidden=true;$('stage').appendChild(d);CUR.trail.push(d)}
function curMove(e){if(e.pointerType!=='mouse'){CUR.on=false;return}const r=canvas.getBoundingClientRect();CUR.x=e.clientX-r.left;CUR.y=e.clientY-r.top;CUR.on=true}
canvas.addEventListener('pointermove',curMove);canvas.addEventListener('pointerdown',curMove);canvas.addEventListener('pointerenter',curMove);
canvas.addEventListener('pointerleave',()=>{if(!drag)CUR.on=false});
function curTick(){
  requestAnimationFrame(curTick);
  const el=CUR.el;el.hidden=!CUR.on;canvas.classList.toggle('nocur',CUR.on);
  if(!CUR.on){CUR.hist.length=0;CUR.trail.forEach(d=>d.hidden=true);return}
  const dragging=!!drag;
  el.style.transform='translate('+CUR.x+'px,'+CUR.y+'px)';
  if(dragging){CUR.hist.unshift([CUR.x,CUR.y]);if(CUR.hist.length>9)CUR.hist.pop()}else if(CUR.hist.length)CUR.hist.pop();
  CUR.trail.forEach((d,i)=>{const h=CUR.hist[i+1];d.hidden=!h;if(!h)return;const k=1-(i+1)/9;d.style.transform='translate('+h[0]+'px,'+h[1]+'px) scale('+(.4+.6*k).toFixed(2)+')';d.style.opacity=(k*.8).toFixed(2)});
}
requestAnimationFrame(curTick);
