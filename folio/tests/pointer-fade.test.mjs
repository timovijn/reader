import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const styles=new Map(),timers=new Map();let now=0,next=0,glow=0;
const context={
 document:{documentElement:{style:{setProperty:(name,value)=>styles.set(name,value)}}},
 performance:{now:()=>now},setTimeout:(callback,delay)=>{timers.set(++next,{callback,time:now+delay});return next;},clearTimeout:id=>timers.delete(id),
 shinkaCursorPalette:{normal:'full',ink:'ink',paper:'paper',frames:[]},shinkaCursorFadeTimer:0,shinkaCursorIdleTimer:0,
 shinkaCursorPointer:{matches:true},shinkaCursorContrast:{matches:false},shinkaCursorTarget:null,shinkaCursorOpacity:0,
 ambientPointerPresent:true,ambientRenderer:{setGlow:value=>glow=value},
 pointerFadeDuration:Number(source.match(/const pointerFadeDuration=(\d+)/)[1]),shinkaCursorImage:(_weight,_ink,_paper,opacity)=>'alpha:'+opacity
};
vm.runInNewContext(source.slice(source.indexOf('function syncPointerGlow('),source.indexOf('async function updateShinkaCursor(')),context);
function advance(milliseconds){
 const end=now+milliseconds;
 while(true){const entry=[...timers].sort((a,b)=>a[1].time-b[1].time)[0];if(!entry||entry[1].time>end)break;timers.delete(entry[0]);now=entry[1].time;entry[1].callback();}
 now=end;
}
const duration=context.pointerFadeDuration;
assert.equal(duration,1600);
context.wakeShinkaCursor();advance(duration/2);
assert.equal(glow,.5);assert.equal(styles.get('--cursor-arrow'),'alpha:0.5, default');assert.equal(styles.get('--pointer-ink-opacity'),'0.5');
advance(duration/2);assert.equal(glow,1);assert.equal(styles.get('--cursor-arrow'),'full, default');
advance(2000-duration);advance(duration/2);assert.equal(glow,.5);
advance(duration/2);assert.equal(glow,0);assert.equal(styles.get('--cursor-arrow'),'none');
assert.equal(styles.get('--pointer-ink-opacity'),'0');
context.wakeShinkaCursor();advance(duration/2);context.hideShinkaCursor();advance(duration/2);
assert.equal(glow,.25);
context.wakeShinkaCursor();advance(duration/2);assert.equal(glow,.625);
assert.equal(Number(styles.get('--ambient-pointer-glow')),glow);
assert.equal(Number(styles.get('--pointer-ink-opacity')),glow);
console.log('Passed: shared 1.6-second pointer/glow fades in both directions, idle delay, pointer leave and smooth reversals.');
let wakes=0;
const start=source.indexOf('let lastCursorPosition=null;');
const end=source.indexOf("window.addEventListener('pointermove',handleCursorMovement",start);
const movementContext={wakeShinkaCursor:()=>wakes++};
vm.runInNewContext(source.slice(start,end),movementContext);
movementContext.handleCursorMovement({pointerType:'mouse',clientX:40,clientY:50});
movementContext.handleCursorMovement({pointerType:'mouse',clientX:40,clientY:50});
assert.equal(wakes,1); // A synthetic event at the same position cannot wake it.
movementContext.handleCursorMovement({pointerType:'touch',clientX:100,clientY:100});assert.equal(wakes,1);
movementContext.handleCursorMovement({pointerType:'mouse',clientX:41,clientY:50});assert.equal(wakes,2);
assert.ok(!/addEventListener\('(wheel|scroll|pointerdown)',wakeShinkaCursor/.test(source));
console.log('Passed: movement-only pointer wake, stationary-event filtering and touch exclusion.');
