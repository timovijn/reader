import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
function load(name,next,globals={}){const start=source.indexOf('function '+name+'(');const end=source.indexOf('\nfunction '+next+'(',start);return vm.runInNewContext('('+source.slice(start,end)+')',globals);}
const pageRect=load('readingPageRect','readerViewportMetrics');
const metrics=load('readerViewportMetrics','currentReadingViewport');
const before=pageRect({left:60,top:100,width:170,height:24},{left:-40,top:-900});
const panned=pageRect({left:10,top:60,width:170,height:24},{left:-90,top:-940});
assert.equal(before.left,panned.left);assert.equal(before.top,panned.top);assert.equal(before.width,panned.width);
const viewport=metrics({pageTop:1200,pageLeft:140,height:400,width:350,scale:2,offsetTop:300,offsetLeft:100},{pageTop:900,pageLeft:40,height:800,width:700});
assert.equal(viewport.pageTop,1200);assert.equal(viewport.height,400);assert.equal(viewport.width,350);
const fallback=metrics(undefined,{pageTop:900,pageLeft:40,height:800,width:700});assert.equal(fallback.pageTop,900);assert.equal(fallback.height,800);
// The target stays on the same document line whether client rects refer to
// layout or visual coordinates, and whether visual panning changes scrollY.
for(const scenario of [
 {origin:-900,gutter:-600,pageTop:900,rendered:500},
 {origin:-900,gutter:-600,pageTop:1200,rendered:200},
 {origin:-1200,gutter:-900,pageTop:1200,rendered:200}
]){
 const target={isConnected:true,style:{},parentElement:{getBoundingClientRect:()=>({left:0,top:scenario.gutter,width:23,height:4000})}};
 const place=load('positionTargetOnPage','readingTargetPosition',{readerTarget:target,targetRenderedY:scenario.rendered,$:()=>({getBoundingClientRect:()=>({left:0,top:scenario.origin})}),readingPageRect:pageRect,currentReadingViewport:()=>({pageTop:scenario.pageTop})});
 place();assert.equal(target.style.transform,'translateY(1100px)');
}
console.log('Passed: zoom/pan coordinate invariance, visual viewport sizing, fallback metrics and stable progress gutter positioning.');
