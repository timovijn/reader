import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normaliseDictionaryWord,normaliseDictionaryEntries,createDictionaryHandler} from '../lib/dictionary.js';
const fixture=[{word:'testword',phonetic:'/tɛst/',phonetics:[{text:'/tɛst/'},{text:'/tɛst wɜːd/'}],meanings:[{partOfSpeech:'noun',definitions:[{definition:'An entry used in automated tests.',example:'This is a testword.'},{definition:'An entry used in automated tests.'}]}],sourceUrls:['https://en.wiktionary.org/wiki/testword','javascript:alert(1)'],license:{name:'Test license',url:'https://example.com/license'}}];
for(const [input,expected] of [['“Hello,”','hello'],['can’t',"can't"],['well-being','well-being'],['résumé','résumé'],['two words',''],['http://localhost/',''],['123',''],['a'.repeat(81),''],['<script>','']])assert.equal(normaliseDictionaryWord(input),expected,input);
const entry=normaliseDictionaryEntries(fixture,'testword');assert.equal(entry.phonetics.length,2);assert.equal(entry.meanings[0].definitions.length,1);assert.equal(entry.sources.length,1);assert.equal(entry.licenses[0].name,'Test license');
assert.equal(normaliseDictionaryEntries({},'testword'),null);assert.equal(normaliseDictionaryEntries([{meanings:[]}],'testword'),null);
const request=(word,method='GET')=>new Request('https://reader.example/api/dictionary?word='+encodeURIComponent(word),{method});
let calls=0,time=100;const handler=createDictionaryHandler(async(url,options)=>{calls++;assert.equal(url,'https://api.dictionaryapi.dev/api/v2/entries/en/testword');assert.equal(options.redirect,'error');assert.equal(options.headers.accept,'application/json');return Response.json(fixture)},()=>time);
assert.equal((await handler(request('testword'))).status,200);assert.equal((await handler(request('TESTWORD'))).status,200);assert.equal(calls,1);
time+=86400001;assert.equal((await handler(request('testword'))).status,200);assert.equal(calls,2);
assert.equal((await handler(request('http://localhost/'))).status,400);assert.equal((await handler(request('testword','POST'))).status,405);assert.equal(calls,2);
for(const [reply,status] of [[()=>new Response(null,{status:404}),404],[()=>new Response(null,{status:429}),503],[()=>new Response('not JSON'),503],[()=>new Response('x'.repeat(512001)),503],[()=>{throw Object.assign(Error('deadline'),{name:'TimeoutError'})},504]])assert.equal((await createDictionaryHandler(reply)(request('word'))).status,status);
let release;calls=0;const shared=createDictionaryHandler(()=>{calls++;return new Promise(resolve=>release=resolve)});const one=shared(request('word')),two=shared(request('word'));assert.equal(calls,1);release(Response.json(fixture));assert.equal((await one).status,200);assert.equal((await two).status,200);
// Both Vercel roots and the standalone Worker expose the same local route.
const root=(await import('../../api/dictionary.js')).default,nested=(await import('../api/dictionary.js')).default;
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const bundle=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'))).default;
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json(fixture);
try{for(const implementation of [root,nested,worker]){const response=await implementation.fetch(request('word'));assert.equal(response.status,200);assert.equal((await response.json()).word,'testword')}}finally{globalThis.fetch=originalFetch}
const inlineNormaliser=source.slice(source.indexOf('function normaliseDictionaryWord('),source.indexOf('function dictionaryPlacement('));assert.equal(inlineNormaliser.trim(),normaliseDictionaryWord.toString().trim());

let active=null,selectedWord='testword';const created=[],pending=[],documentEvents=new Map(),windowEvents=new Map(),frames=[];
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.attributes={};this.style={};this.handlers={};this.hidden=false;this.isConnected=true;this.textContent='';this.offsetWidth=360;this.offsetHeight=260;}
 append(...nodes){for(const node of nodes){if(node.tag==='fragment')this.append(...node.children);else{this.children.push(node);node.parent=this}}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(name,handler){this.handlers[name]=handler}
 contains(node){return this===node||this.children.some(child=>child.contains?.(node))}
 focus(){active=this}
 closest(){return null}
}
const elements=new Map(),$=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)};
const popup=$('#dictionary-popup');popup.hidden=true;
for(const id of ['dictionary-close','dictionary-word','dictionary-phonetics','dictionary-listen','dictionary-audio-status','dictionary-content','dictionary-sources'])popup.append($('#'+id));
const text=new Element('#text'),paragraph=new Element('p');paragraph.append(text);$('.article').append(paragraph);active=$('#article-title');
const range={getClientRects:()=>[{left:200,top:100,right:260,bottom:124,width:60,height:24}],cloneRange(){return this}};
const selection={isCollapsed:false,rangeCount:1,anchorNode:text,focusNode:text,toString:()=>selectedWord,getRangeAt:()=>range};
let spoken,cancels=0;
const context={current:{},$,URL,AbortController,SpeechSynthesisUtterance:function(word){this.text=word},safeHref:value=>{try{return new URL(value).href}catch{return null}},notify(){},requestAnimationFrame:fn=>{frames.push(fn);return frames.length},fetch:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject})),document:{get activeElement(){return active},createElement:tag=>{created.push(tag);return new Element(tag)},createTextNode:value=>{const node=new Element('#text');node.textContent=value;return node},createDocumentFragment:()=>new Element('fragment'),addEventListener:(name,fn)=>documentEvents.set(name,fn),fonts:{addEventListener(){}}},window:{innerWidth:1000,innerHeight:700,getSelection:()=>selection,addEventListener:(name,fn)=>windowEvents.set(name,fn),speechSynthesis:{cancel(){cancels++},getVoices:()=>[{lang:'en-GB',localService:true}],speak(speech){spoken=speech}}}};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function normaliseDictionaryWord('),source.indexOf('// One fresh composition per page load.')),context);
for(const anchor of [{left:0,top:0,bottom:20,width:40},{left:900,top:670,bottom:695,width:70}]){const place=context.dictionaryPlacement(anchor,360,260,{left:0,top:0,width:1000,height:700});assert.ok(place.left>=12&&place.left+360<=988);assert.ok(place.top>=12&&place.top+260<=688)}
const panned=context.dictionaryPlacement({left:500,top:490,bottom:510,width:40},240,200,{left:400,top:400,width:300,height:300});assert.ok(panned.left>=412&&panned.left+240<=688);
assert.equal(context.dictionarySelection({...selection,isCollapsed:true},$('.article')),null);
selectedWord='multiple words';assert.equal(context.dictionarySelection(selection,$('.article')),null);selectedWord='testword';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
$('.article').handlers.dblclick({target:paragraph});assert.equal(popup.hidden,false);assert.equal(pending.length,1);assert.equal(pending[0].url,'/api/dictionary?word=testword');
pending[0].resolve(Response.json(entry));await flush();assert.equal($('#dictionary-word').textContent,'testword');assert.ok($('#dictionary-phonetics').textContent.includes('/tɛst/'));assert.equal($('#dictionary-content').attributes['aria-busy'],'false');assert.equal($('#dictionary-listen').hidden,false);
$('#dictionary-listen').onclick();assert.equal(spoken.text,'testword');assert.equal(spoken.lang,'en-GB');assert.equal(spoken.voice.localService,true);
let escaped=false;documentEvents.get('keydown')({key:'Escape',preventDefault(){escaped=true},stopImmediatePropagation(){}});assert.equal(escaped,true);assert.equal(popup.hidden,true);assert.ok(cancels>0);
context.openDictionarySelection({word:'testword',range});await flush();assert.equal(pending.length,1); // Client cache.
context.openDictionarySelection({word:'first',range});const stale=pending.at(-1);
context.openDictionarySelection({word:'second',range});const latest=pending.at(-1);assert.equal(stale.options.signal.aborted,true);
latest.resolve(Response.json({...entry,word:'second'}));await flush();stale.resolve(Response.json({...entry,word:'first'}));await flush();assert.equal($('#dictionary-word').textContent,'second');
context.lookupDictionaryWord('missing');pending.at(-1).resolve(new Response('{}',{status:404}));await flush();assert.match($('#dictionary-content').children[0].textContent,/No English definition/);
context.lookupDictionaryWord('offline');pending.at(-1).reject(Error('offline'));await flush();assert.equal($('#dictionary-content').children[1].textContent,'Try again');
context.openDictionarySelection({word:'closing',range});const closing=pending.at(-1);windowEvents.get('scroll')();assert.equal(popup.hidden,true);assert.equal(closing.options.signal.aborted,true);closing.resolve(Response.json(entry));await flush();assert.equal(popup.hidden,true);
context.openDictionarySelection({word:'testword',range});await flush();documentEvents.get('pointerdown')({target:new Element()});assert.equal(popup.hidden,true);
let shortcut=false;documentEvents.get('keydown')({key:'d',target:paragraph,preventDefault(){shortcut=true}});assert.equal(shortcut,true);assert.equal(popup.hidden,false);
context.renderDictionaryEntry({...entry,meanings:[{partOfSpeech:'noun',definitions:[{definition:'<img src=x onerror=alert(1)>',example:'<script>not executable</script>'}]}]});assert.ok(!created.includes('img'));assert.ok(!created.includes('script'));
console.log('Passed: dictionary word validation, response limits, safe fields/attribution, caching/deduplication, failures, both Vercel routes and Worker, popover positioning, selection, races, keyboard/dismissal, pronunciation and inert text rendering.');
