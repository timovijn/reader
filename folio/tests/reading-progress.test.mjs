import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const start=source.indexOf('function readingTargetPosition(');
const end=source.indexOf('\nfunction updateReadingTarget',start);
const position=vm.runInNewContext('('+source.slice(start,end)+')');
const lines=Array.from({length:101},(_,index)=>({top:index*40,height:24}));
const at=scroll=>position(lines,300,scroll,800,75,4500);
assert.equal(at(0).top,0);assert.equal(at(0).progress,0);
// Start = 145; finish = 3596, when the last text line clears the bottom fade.
const halfway=at((145+3596)/2);assert.equal(halfway.top,2000);assert.equal(halfway.line,51);assert.equal(halfway.progress,.5);
const last=at(3596);assert.equal(last.top,lines.at(-1).top);assert.equal(last.line,101);assert.equal(last.progress,1);
assert.equal(at(4500).top,4000);assert.equal(at(0).top,0);
for(const scroll of [400,1000,2000,3000]){const y=300+at(scroll).top-scroll;assert.ok(y>75&&y<728,'The travelling total stays beside visible text');}
const short=position([{top:0,height:24},{top:40,height:24}],300,0,800,75,0);assert.equal(short.progress,1);assert.equal(short.top,40);
assert.equal(position([],0,0,800,75,0).progress,0);
console.log('Passed: travelling total position, end-line alignment, reverse scrolling, visible gutter placement and short articles.');
