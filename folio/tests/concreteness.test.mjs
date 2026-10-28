import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function createConcretenessAnalysis('),source.indexOf("\n$('#concreteness-toggle').onclick="));
const elements=new Map(),created=[];
function element(){return{attributes:{},children:[],style:{},classList:{add(){}},setAttribute(key,value){this.attributes[key]=value},append(child){this.children.push(child)}};}
let rects=[];const selected=[];
const context={prefs:{concreteness:true},$:key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key)},document:{createElementNS(namespace,name){const el=element();el.name=name;created.push(el);return el},createRange(){return{setStart(node,offset){assert.ok(offset>=0&&offset<=node.length);selected.push([node,offset])},setEnd(node,offset){assert.ok(offset>=0&&offset<=node.length);selected.push([node,offset])},getClientRects(){return rects}}}}};
vm.createContext(context);vm.runInContext(code,context);
const analyse=context.createConcretenessAnalysis;
const concrete='The child held a red apple beside the wooden table. Rain fell against the kitchen window. Her hand rested on a cold glass bottle.';
const abstract='The theory concerns the meaning of freedom and responsibility. Its implications challenge our assumptions about justice, truth and knowledge.';
const mean=result=>result.samples.reduce((sum,sample)=>sum+sample.score,0)/result.samples.length;
assert.ok(mean(analyse(concrete))>.7);
assert.ok(mean(analyse(abstract))<.25);
assert.ok(analyse('xyzzy qqq zzzz.').samples.every(sample=>sample.score===null));
assert.equal(analyse('你好世界。').rated,0);
assert.equal(analyse('').samples.length,0);
assert.equal(analyse('hands bottles apples').rated,3);
assert.equal(analyse('An idea without punctuation\nA red apple on the table').samples.length,2);
assert.equal(analyse('Apple.\n\nFreedom.').samples.length,2);
for(const sample of analyse(concrete+' '+abstract).samples){assert.ok(sample.score>=0&&sample.score<=1);assert.ok(sample.end>sample.start);assert.ok(sample.clues.length<=4);}
// Scoring depends only on the source text, not typography or viewport geometry.
assert.equal(JSON.stringify(analyse(concrete)),JSON.stringify(analyse(concrete)));
const path=context.concretenessPath([{score:0,y:10},{score:1,y:30},{score:null,y:50},{score:.5,y:70}]);
assert.ok(path.startsWith('M 3.00 10.00 C'));
assert.ok(path.includes('21.00 30.00 M 12.00 70.00'));
assert.ok(!/NaN|Infinity/.test(path));
assert.equal(context.concretenessPath([]),'');

// Draw from actual DOM text offsets across inline elements. The same source
// scores map onto different line positions after reflow, without changing text.
const left={length:30},right={length:concrete.length-30};
const records=[{node:left,start:0,end:30},{node:right,start:30,end:concrete.length}];
function draw(top,height){
 rects=[{top,width:200,height}];const root=element();
 context.drawConcreteness(root,[{top:top-100,height,center:top-100+height/2}],records,concrete,100);
 return root;
}
const normal=draw(120,20),zoomed=draw(160,40);
assert.equal(normal.children.length,1);assert.equal(zoomed.children.length,1);
const normalPath=normal.children[0].children[0].attributes.d;
const zoomedPath=zoomed.children[0].children[0].attributes.d;
assert.equal(normalPath.split(' ')[1],zoomedPath.split(' ')[1]);
assert.notEqual(normalPath.split(' ')[2],zoomedPath.split(' ')[2]);
assert.equal(elements.get('#concreteness-toggle').attributes['aria-pressed'],'true');
assert.ok(selected.some(([node])=>node===right));
context.prefs.concreteness=false;assert.equal(draw(120,20).children.length,0);
assert.equal(elements.get('#concreteness-note').hidden,true);
context.prefs.concreteness=true;
const unknown=element();context.drawConcreteness(unknown,[{top:0,height:20,center:10}],[{node:{length:5},start:0,end:5}],'xyzzy',0);
assert.equal(unknown.children.length,0);
assert.match(elements.get('#concreteness-note').textContent,/Not enough/);
console.log('Passed: experimental concreteness ranking, abstention, sparse/non-English text, sentence offsets, plural forms, bounded curves/gaps, inline DOM ranges, zoom reflow and visibility controls.');
