import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../worker/dictionary-glass.js',import.meta.url),'utf8');
const vendor=await readFile(new URL('../vendor/liquidgl/liquidGL.js',import.meta.url),'utf8');
new vm.Script(vendor);new vm.Script(source);
const bundle=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'))).default;
for(const [path,expected] of [['dictionary-glass.js',source],['liquidGL.js',vendor]]){
 assert.equal(await readFile(new URL('../dist/public/scripts/'+path,import.meta.url),'utf8'),expected);
 const response=await worker.fetch(new Request('https://reader.example/scripts/'+path));
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(await response.text(),expected);
}
assert.match(await (await worker.fetch(new Request('https://reader.example/scripts/liquidGL.LICENSE.txt'))).text(),/MIT License/);
assert.match((await worker.fetch(new Request('https://reader.example/'))).headers.get('content-security-policy'),/worker-src 'self' blob:/);
const html=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
assert.match(html,/otherLivesDictionaryGlass\?\.hide\(\)/);
assert.match(html,/otherLivesDictionaryGlass\?\.update\(popup\)/);
assert.match(html,/otherLivesDictionaryGlass\?\.show\(popup,canvas=>ambientRenderer\?\.copyFrame\(canvas\)\)/);
assert.match(html,/copyFrame\(target\)\{draw\(performance.now\(\)\)/);

class Element{
 constructor(tag='div'){this.tag=tag;this.style={};this.dataset={};this.children=[];this.attributes={};this.hidden=false;}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.removed=true;}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 querySelectorAll(){return [];}
 getBoundingClientRect(){return{left:120,top:180,width:380,height:240};}
 cloneNode(){return new Element(this.tag);}
}
const body=new Element('body'),head=new Element('head'),article=new Element('article');
const queries=[],timeouts=new Map(),documentEvents={},windowEvents={},calls=[];
let clock=0,destroyed=0;
const document={body,head,hidden:false,createElement:tag=>new Element(tag),querySelector:selector=>selector==='#reader > .article'?article:null,addEventListener:(type,fn)=>documentEvents[type]=fn};
const window={devicePixelRatio:2,addEventListener:(type,fn)=>windowEvents[type]=fn};
const context={document,window,console:{warn(){}},getComputedStyle:()=>({getPropertyValue:()=> 'rgba(49,48,44,.48)'}),matchMedia:query=>{const media={query,matches:false,addEventListener(type,fn){this.changed=fn}};queries.push(media);return media},setTimeout:fn=>{timeouts.set(++clock,fn);return clock},clearTimeout:id=>timeouts.delete(id)};
vm.createContext(context);vm.runInContext(source,context);
const glass=window.otherLivesDictionaryGlass,popup=new Element();
assert.equal(head.children.length,0); // Lazy: no download until first opening.
const abandoned=glass.show(popup,()=>true);assert.equal(head.children.length,1);
const renderer={backend:{kind:'webgl'},hasTexture:true,canvas:{width:2000,height:1400}};
glass.hide();window.liquidGL=options=>{calls.push(options);return{renderer,options,destroy(){destroyed++;}}};head.children[0].onload();await abandoned;
assert.equal(calls.length,0);assert.equal(body.children.length,0); // Close during load.
await glass.show(popup,()=>true);assert.equal(calls.length,1);
assert.equal(calls[0].content,false);assert.equal(calls[0].snapshot,'#dictionary-glass-scene');assert.equal(calls[0].tilt,false);assert.equal(calls[0].draggable,false);
assert.equal(popup.dataset.glass,undefined);calls[0].on.init({renderer});assert.equal(popup.dataset.glass,'gpu');assert.equal(popup.dataset.glassState,'webgl');assert.equal(glass.status().backend,'webgl');assert.equal(timeouts.size,0);
const pane=body.children.find(node=>node.id==='dictionary-glass-pane');assert.equal(pane.style.left,'120px');assert.equal(pane.style.height,'240px');
popup.getBoundingClientRect=()=>({left:15,top:20,width:300,height:450});glass.update(popup);assert.equal(pane.style.height,'450px');assert.equal(pane.style.left,'15px');
const scene=body.children.find(node=>node.id==='dictionary-glass-scene');assert.equal(scene.inert,true);assert.equal(scene.attributes['aria-hidden'],'true');assert.equal(scene.children[0].children[0].tag,'canvas');
glass.hide();assert.equal(destroyed,1);assert.equal(body.children.length,0);assert.equal(popup.dataset.glass,undefined);
calls[0].on.init({renderer});assert.equal(popup.dataset.glass,undefined); // Late init cannot revive a closed popup.
await glass.show(popup,()=>true);document.hidden=true;documentEvents.visibilitychange();assert.equal(destroyed,2);assert.equal(body.children.length,0);document.hidden=false;
for(const media of queries.filter(media=>!media.query.includes('reduced-motion'))){media.matches=true;await glass.show(popup,()=>true);assert.equal(body.children.length,0);assert.equal(glass.status().state,'fallback');media.matches=false;}
const motion=queries.find(media=>media.query.includes('reduced-motion'));motion.matches=true;await glass.show(popup,()=>true);assert.equal(calls.at(-1).specular,false);assert.ok(body.children.length>0);glass.hide();motion.matches=false;
await glass.show(popup,()=>true);queries[0].matches=true;queries[0].changed();assert.equal(body.children.length,0);queries[0].matches=false;
await glass.show(popup,()=>true);for(const fn of [...timeouts.values()])fn();assert.equal(body.children.length,0);assert.equal(popup.hidden,false); // GPU never initialises: retain CSS popup.
assert.equal(glass.status().state,'fallback');assert.match(glass.status().reason,/15 seconds/);
await glass.show(popup,()=>true);calls.at(-1).on.init({renderer:{backend:{kind:'webgl'},hasTexture:false,canvas:renderer.canvas}});assert.equal(popup.dataset.glass,undefined);assert.equal(glass.status().state,'fallback');
window.liquidGL=()=>({destroy(){destroyed++;}});await glass.show(popup,()=>true);assert.equal(glass.status().reason,'WebGPU and WebGL are unavailable');assert.equal(body.children.length,0);
window.liquidGL=()=>{throw Error('GPU failure')};await glass.show(popup,()=>true);assert.equal(body.children.length,0);assert.equal(popup.hidden,false);
console.log('Passed: self-hosted liquidGL assets/licence/CSP, lazy loading, viewport snapshot, native content separation, resize positioning, late init, close/load races, GPU failures, preference and visibility cleanup.');
