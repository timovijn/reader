import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const handlers=new Map(),styles=new Map(),classes=new Set(),frames=[];
const reset={},scope={contains:()=>false};let geometryUpdates=0;
const context={
 document:{addEventListener(name,handler,options){handlers.set(name,{handler,options});},
  documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)},classList:{add:name=>classes.add(name)}},elementFromPoint:()=>null},
 window:{innerWidth:1000,innerHeight:800,scrollBy:()=>{}},
 requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},
 $:selector=>selector==='#zoom-reset'?reset:scope,current:{},clearSelectionInk:()=>{},refreshReaderGeometry:()=>geometryUpdates++
};
vm.runInNewContext(source.slice(source.indexOf('function textPinchScale('),source.indexOf('function ambientGrainMetrics(')),context);
function fire(name,properties={}){
 let cancelled=false;const registration=handlers.get(name);
 registration.handler({cancelable:true,preventDefault(){cancelled=true;},...properties});
 while(frames.length)frames.shift()();
 return cancelled;
}
const zoom=()=>Number(styles.get('--text-zoom'));
assert.ok(classes.has('text-pinch'));
assert.equal(fire('wheel',{ctrlKey:false,deltaY:40}),false);assert.equal(styles.size,0);
assert.equal(handlers.get('wheel').options.passive,false);
assert.equal(fire('wheel',{ctrlKey:true,deltaY:-40,deltaMode:0,clientX:400,clientY:300}),true);
assert.ok(zoom()>1);
reset.onclick();while(frames.length)frames.shift()();assert.equal(zoom(),1);
const touches=distance=>[{clientX:100,clientY:100},{clientX:100+distance,clientY:100}];
assert.equal(fire('touchstart',{touches:touches(100)}),true);
assert.equal(fire('touchmove',{touches:touches(200)}),true);assert.equal(zoom(),2);
// Safari gesture events must not apply a touch pinch for a second time.
fire('gesturestart');fire('gesturechange',{scale:2});assert.equal(zoom(),2);
fire('touchend',{touches:[]});fire('gestureend');
fire('gesturestart');fire('gesturechange',{scale:.5});assert.equal(zoom(),1);fire('gestureend');
assert.equal(fire('touchstart',{touches:[{clientX:0,clientY:0}]}),false);
fire('wheel',{ctrlKey:true,deltaY:-10000,deltaMode:0});assert.equal(zoom(),4);
fire('wheel',{ctrlKey:true,deltaY:10000,deltaMode:0});assert.equal(zoom(),.65);
assert.ok(geometryUpdates>0);
console.log('Passed: text-only trackpad/touch/Safari pinch, native-gesture cancellation, duplicate gesture prevention, normal scrolling, zoom bounds and reset.');
