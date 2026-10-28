import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const collectionSearchCache='),source.indexOf('let collectionView='));
const context={URL};vm.createContext(context);vm.runInContext(helpers,context);
const view=overrides=>context.normaliseCollectionView(overrides);
const items=[
 {id:'a',title:'Café craft',author:'Alex Smith',url:'https://www.design.example/a',siteName:'Design',minutes:5,savedAt:200,published:'2025-01-01',body:[['p','A turntable and a needle.']]},
 {id:'b',title:'Another life',author:'Jo',url:'https://news.example/b',minutes:15,savedAt:100,readAt:500,published:'2026-01-01',body:[['p','A distant mountain.']]},
 {id:'c',title:'Long story',minutes:16,savedAt:300,readAt:'2026-02-01',body:[['p','Unknown places.']]},
 {id:'d',title:'No date',minutes:null,readAt:'invalid',body:[['p','Some text.']]}
];
const selected=overrides=>Array.from(context.selectCollection(items,view(overrides)),item=>item.id);
assert.deepEqual(selected({status:'ready'}),['a','d']);
assert.deepEqual(selected({status:'read'}),['c','b']);
assert.deepEqual(selected({query:'CAFE needle'}),['a']);
assert.deepEqual(selected({query:'smith'}),['a']);
assert.deepEqual(selected({query:'needle missing'}),[]);
assert.deepEqual(selected({source:'design.example',length:'short',status:'ready'}),['a']);
assert.deepEqual(selected({length:'short'}),['a']);
assert.deepEqual(selected({length:'medium'}),['b']);
assert.deepEqual(selected({length:'long'}),['c']);
assert.deepEqual(selected({sort:'oldest'}),['d','b','a','c']);
assert.deepEqual(selected({sort:'published'}),['b','a','c','d']);
assert.deepEqual(selected({sort:'title'}),['b','a','c','d']);
assert.deepEqual(selected({sort:'shortest'}),['a','b','c','d']);
assert.deepEqual(selected({sort:'longest'}),['c','b','a','d']);
assert.deepEqual(selected({sort:'read'}),['c','b','a','d']);
assert.equal(context.collectionSource({url:'not a URL'}).label,'Pasted text');
assert.equal(view({status:'bad',sort:'bad'}).status,'all');
assert.equal(view({status:'bad',sort:'bad'}).sort,'newest');
// Legacy articles have no save/read timestamps. Preserve their existing
// ordering, classify them Ready and reverse predictably for oldest-first.
const legacy=Array.from({length:135},(_,i)=>({...items[0],id:'legacy-'+i,savedAt:undefined}));
assert.equal(context.selectCollection(legacy,view()).length,135);
assert.equal(context.selectCollection(legacy,view())[0].id,'legacy-0');
assert.equal(context.selectCollection(legacy,view({sort:'oldest'}))[0].id,'legacy-134');
const titleHelper=vm.runInNewContext('('+source.slice(source.indexOf('function cleanArticleTitle('),source.indexOf('\nfunction extract(html,url)'))+')');
const startup={saved:[],prefs:{},collectionSource:context.collectionSource,cleanArticleTitle:titleHelper,localStorage:{getItem:key=>key==='folio-collection'?JSON.stringify(legacy):key==='folio-design'?'typewriter-v1':'{}',setItem(){}}};
vm.runInNewContext(source.slice(source.indexOf("try{const s=JSON.parse(localStorage.getItem('folio-collection')"),source.indexOf('function persist(')),startup);
assert.equal(startup.saved.length,135);
const storedArticle={...items[0],title:'Kicking Robots, by James Vincent',author:'James Vincent',readAt:123,savedAt:456};
startup.localStorage.getItem=key=>key==='folio-collection'?JSON.stringify([storedArticle]):key==='folio-design'?'typewriter-v1':'{}';
vm.runInNewContext(source.slice(source.indexOf("try{const s=JSON.parse(localStorage.getItem('folio-collection')"),source.indexOf('function persist(')),startup);
assert.equal(startup.saved[0].title,'Kicking Robots');assert.equal(startup.saved[0].readAt,123);assert.equal(startup.saved[0].savedAt,456);assert.equal(startup.saved[0].id,storedArticle.id);

// Exercise the actual renderer and controls with a small DOM implementation.
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.hidden=false;this.handlers={};this.textContent='';}
 append(...nodes){for(const node of nodes)node.tag==='fragment'?this.children.push(...node.children):this.children.push(node);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(key,value){this.attributes[key]=value;}
 querySelector(selector){return selector==='span'?this.children.find(node=>node.tag==='span'):null;}
 addEventListener(name,handler){this.handlers[name]=handler;}
 focus(){dom.activeElement=this;}
}
const elements=new Map();const $=key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key)};
const filters=['all','ready','read'].map(status=>{const button=new Element('button');button.dataset.collectionStatus=status;button.append(new Element('span'));return button});
const dom={activeElement:null,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),querySelectorAll:()=>filters};
let persistSuccess=true,observerCallback;const timers=new Map();let timerId=0;
Object.assign(context,{$,document:dom,saved:legacy,current:null,collectionView:view(),collectionLimit:40,collectionResults:[],collectionSearchTimer:0,formatArticleDate:()=>'',persist:()=>persistSuccess,updateBookmark(){},notify(){},toggleSave(){},downloadArticleEpub(){},openArticle(){},setTimeout:callback=>{timers.set(++timerId,callback);return timerId},clearTimeout:id=>timers.delete(id),IntersectionObserver:class{constructor(callback){observerCallback=callback}observe(){}}});
vm.runInContext(source.slice(source.indexOf('function createCollectionCard('),source.indexOf('function safeHref(')),context);
context.renderCards();assert.equal($('#cards').children.length,40);assert.equal($('#collection-more').hidden,false);
observerCallback([{isIntersecting:true}]);assert.equal($('#cards').children.length,80);
context.extendCollection();assert.equal($('#cards').children.length,120);
context.extendCollection();assert.equal($('#cards').children.length,135);assert.equal($('#collection-more').hidden,true);
context.current={};context.extendCollection();assert.equal($('#cards').children.length,135);context.current=null;
filters[1].onclick();assert.equal(context.collectionView.status,'ready');assert.equal($('#cards').children.length,40);
assert.equal(filters[1].attributes['aria-pressed'],'true');
const first=context.saved[0];context.setArticleRead(first,true);assert.equal(context.saved.length,135);assert.ok(context.isArticleRead(context.saved[0]));
assert.equal($('#cards').children.length,40);assert.equal(filters[2].children[0].textContent,'1');
context.setArticleRead(context.saved[0],false);assert.equal(context.isArticleRead(context.saved[0]),false);
const before=context.saved;persistSuccess=false;context.setArticleRead(context.saved[0],true);assert.equal(context.saved,before);persistSuccess=true;
context.setArticleRead({...items[2],id:'new'},true);assert.equal(context.saved.length,136);assert.equal(context.saved[0].id,'new');assert.ok(context.saved[0].savedAt>0);
// Search is debounced and filters full text. Clear restores the full collection.
$('#collection-search').value='no matches anywhere';$('#collection-search').handlers.input({target:$('#collection-search')});
assert.equal(timers.size,1);for(const callback of timers.values())callback();timers.clear();
assert.equal($('#cards').children.length,0);assert.equal($('#empty-message').textContent,'No articles match.');
$('#collection-clear').onclick();assert.equal(context.collectionView.status,'all');assert.equal($('#cards').children.length,40);
context.saved=[];context.renderCards();assert.equal($('#empty-message').textContent,'No saved articles.');assert.equal($('#collection-more').hidden,true);
console.log('Passed: collection search/status/source/time filters, all sorting modes, legacy ordering and >100-item loading, progressive rendering, control state, explicit Read/Ready updates, storage-failure rollback and empty states.');
