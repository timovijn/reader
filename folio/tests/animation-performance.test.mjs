import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
const follow=vm.runInNewContext('('+section('function animationFollowAmount(','function textPinchScale(')+')');
const advance=vm.runInNewContext('('+section('function advanceAmbientPointer(','function animationFollowAmount(')+')',{animationFollowAmount:follow});
function travel(hz){let position=0;for(let frame=0;frame<hz/2;frame++)position+=(1-position)*follow(1000/hz);return position;}
for(const hz of [60,90,120,144,240])assert.ok(Math.abs(travel(hz)-travel(60))<1e-10);
assert.equal(follow(8,true),1);assert.equal(follow(0),0);
assert.ok(Number.isFinite(follow(5000)));
function springTravel(hz){
 let point={x:0,y:0,targetX:1,targetY:1,vx:0,vy:0};
 for(let frame=0;frame<hz/2;frame++)point={...point,...advance(point,1000/hz)};
 return point;
}
for(const hz of [60,90,120,144,240]){
 const point=springTravel(hz);
 assert.ok(Math.abs(point.x-springTravel(60).x)<1e-10);
 assert.ok(Math.abs(point.vx-springTravel(60).vx)<1e-10);
 assert.ok(point.x>.7&&point.x<.85); // Visible lag, rather than snapping to the pointer.
}
const moving=springTravel(120),reversed={...moving,targetX:0,targetY:0};
const noTime=advance(reversed,0);assert.equal(noTime.x,moving.x);assert.equal(noTime.vx,moving.vx);
const reduced=advance(reversed,8,true);assert.equal(reduced.x,0);assert.equal(reduced.vx,0);
const colour=(name)=>{
 const match=source.match(new RegExp('body'+(name?'\\[data-theme="'+name+'"\\]':'')+'\\{--ambient-glow:rgba\\(([^)]+)\\)'));
 assert.ok(match,'Missing glow for '+(name||'stone'));return match[1].split(',').map(Number);
};
for(const name of ['', 'parchment', 'snow', 'moss']){const rgba=colour(name);assert.ok(rgba[3]>=.1&&rgba[3]<=.4);}
const snow=colour('snow');assert.ok(Math.max(...snow.slice(0,3))-Math.min(...snow.slice(0,3))>30);
// The CSS fallback follows the same spring rather than jumping on each event.
const fallbackFrames=new Map(),fallbackStyles=new Map();let fallbackId=0,reducedMotion=false;
const fallbackContext={advanceAmbientPointer:advance,ambientRenderer:null,shinkaCursorOpacity:1,document:{hidden:false},$:()=>({style:{setProperty:(key,value)=>fallbackStyles.set(key,value)}}),requestAnimationFrame:fn=>{fallbackFrames.set(++fallbackId,fn);return fallbackId},matchMedia:()=>({matches:reducedMotion})};
vm.createContext(fallbackContext);vm.runInContext(section('let ambientFallbackFrame=','function setAmbientPointer('),fallbackContext);
function fallbackPaint(time){const callbacks=[...fallbackFrames.values()];fallbackFrames.clear();callbacks.forEach(fn=>fn(time));}
fallbackContext.moveFallbackGlow(100,100);fallbackPaint(0);
fallbackContext.moveFallbackGlow(900,500);fallbackPaint(1000/120);
assert.ok(parseFloat(fallbackStyles.get('--ambient-pointer-x'))>100&&parseFloat(fallbackStyles.get('--ambient-pointer-x'))<200);
for(let i=2;i<480&&fallbackFrames.size;i++)fallbackPaint(i*1000/120);
assert.equal(fallbackFrames.size,0);
reducedMotion=true;fallbackContext.moveFallbackGlow(200,300);fallbackPaint(5000);
assert.equal(fallbackStyles.get('--ambient-pointer-x'),'200px');

// Execute the actual fade implementation with display-paced callbacks. A
// 120 Hz display receives twice as many opacity updates in the same duration.
function fadeAt(hz){
 let now=0,next=0,writes=0;const frames=new Map(),styles=new Map();
 const style={setProperty(name,value){styles.set(name,value);if(name==='--pointer-ink-opacity')writes++},set opacity(value){}};
 const context={$:()=>({style}),document:{documentElement:{style}},performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id),clearTimeout(){},setTimeout(){},shinkaCursorPalette:{normal:'full',frames:[],ink:'ink',paper:'paper'},shinkaCursorFadeTimer:0,shinkaCursorOpacity:0,shinkaCursorTarget:null,ambientPointerPresent:true,ambientRenderer:{setGlow(){}},shinkaCursorImage:(_weight,_ink,_paper,opacity)=>String(opacity)};
 vm.createContext(context);vm.runInContext(section('function syncPointerGlow(','async function updateShinkaCursor('),context);
 context.fadeShinkaCursor(1,1600);
 for(let i=1;i<=hz*.8;i++){now=i*1000/hz;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}
 assert.ok(Math.abs(context.shinkaCursorOpacity-.5)<1e-10);
 assert.ok(Math.abs(Number(styles.get('--pointer-ink-opacity'))-.5)<1e-10);
 return writes;
}
assert.ok(fadeAt(120)>fadeAt(60)*1.9);fadeAt(90);

// Many pointer events between paints result in one update with the latest
// coordinates, rather than one DOM/uniform update per input event.
const queue=new Map(),positions=[];let next=0;
const pointerContext={requestAnimationFrame:fn=>{queue.set(++next,fn);return next},setAmbientPointer:(x,y)=>positions.push([x,y])};
vm.createContext(pointerContext);vm.runInContext(section('let ambientPointerFrame=','document.addEventListener(\'pointermove\',queueAmbientPointer'),pointerContext);
for(let i=0;i<100;i++)pointerContext.queueAmbientPointer({pointerType:'mouse',clientX:i,clientY:40});
assert.equal(queue.size,1);[...queue.values()][0]();assert.deepEqual(positions,[[99,40]]);
queue.clear();pointerContext.queueAmbientPointer({pointerType:'touch',clientX:500,clientY:500});assert.equal(queue.size,0);

// Exercise renderer scheduling with a mock graphics context. This verifies
// lifecycle/work counts; it is not a shader or hardware frame-rate benchmark.
const frames=new Map(),calls=[],listeners=new Map();let frameId=0,draws=0,styleWrites=0;
const style=new Proxy({}, {set(target,key,value){styleWrites++;target[key]=value;return true}});
const canvas={width:0,height:0,style,addEventListener(){},remove(){}};
const gl=new Proxy({getShaderPrecisionFormat:()=>({precision:23}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_program,name)=>name,drawArrays(){draws++}}, {get(target,key){return key in target?target[key]:(...args)=>{calls.push([key,...args]);return {}}}});
canvas.getContext=()=>gl;
const host={dataset:{},append(){}};
const media=new Map();
const rendererContext={performance:{now:()=>0},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),$:()=>host,document:{hidden:false,body:{dataset:{theme:'stone'}},createElement:()=>canvas,addEventListener:(name,fn)=>listeners.set(name,fn)},window:{innerWidth:1200,innerHeight:800,devicePixelRatio:2,addEventListener(){}},getComputedStyle:()=>({getPropertyValue:()=>'#292823'}),matchMedia:query=>{if(!media.has(query))media.set(query,{matches:false,addEventListener(){}});return media.get(query)},ambientComposition:{angle:0,x:0,y:0,warpX:1,warpY:2},animationFollowAmount:follow,advanceAmbientPointer:advance,updateAmbientDither(){}};
vm.createContext(rendererContext);
vm.runInContext(section('function ambientGrainMetrics(','function createAmbientRenderer(')+section('function createAmbientRenderer(','// Fractal SVG noise'),rendererContext);
const renderer=rendererContext.createAmbientRenderer();assert.ok(renderer);
function paint(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));}
paint(0);assert.equal(draws,1);assert.equal(frames.size,0);
renderer.setPointer(100,200,true);assert.equal(frames.size,0); // Invisible glow needs no repaint.
renderer.setGlow(.5);paint(100);const writesAfterResize=styleWrites;
renderer.setPointer(900,600,true);paint(100+1000/120);paint(100+2000/120);
assert.equal(styleWrites,writesAfterResize); // No repeated canvas geometry writes.
for(let i=3;i<480&&frames.size;i++)paint(100+i*1000/120);
assert.equal(frames.size,0);
const settledDraws=draws;renderer.setGlow(.5);assert.equal(frames.size,0);assert.equal(draws,settledDraws);
renderer.setGlow(0);paint(2000);assert.equal(frames.size,0);
renderer.setPointer(500,500,true);assert.equal(frames.size,0);
renderer.updateTheme();paint(2100);assert.equal(draws,settledDraws+2);
assert.ok(!source.includes("window.addEventListener('scroll',scheduleSelectionInk"));
console.log('Passed: equal animation timing at 60–240 Hz, delayed glow with continuous momentum, theme glow palettes, CSS fallback/reduced motion, display-paced fades, pointer batching and idle GPU suspension.');
