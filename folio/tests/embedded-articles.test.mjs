import assert from 'node:assert/strict';
import {extractArticle} from '../lib/article-extractor.js';
import {chooseArticleCandidate} from '../lib/embedded-articles.js';

const url='https://example.com/essays/a-quiet-town';
const title='A quiet town';
const prose='The residents met beside the old library to discuss the future of their town. They described the buildings, the gardens and the people who had shaped their lives. ';
const full=Array.from({length:8},(_,i)=>`<p>Chapter ${i+1}. ${prose}</p>`).join('');
const article={title,url,body:{html:full}};
const page=script=>`<html><head><title>${title}</title></head><body><article><p>${prose.repeat(2)}</p></article>${script}</body></html>`;
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const script=(name,value)=>`<script>window.${name} = ${json(value)};</script>`;
const next=value=>`<script id="__NEXT_DATA__" type="application/json">${json(value)}</script>`;
for(const embedded of [
  next({props:{pageProps:{article}}}),
  script('__NUXT__',{data:[{article}]}),
  `<script id="__NUXT_DATA__" type="application/json">${json([{data:1},[2],{article:3},{title:4,url:5,body:6},title,url,{html:7},full])}</script>`,
  script('__APOLLO_STATE__',{'Article:123':{__typename:'Article',...article}}),
  script('__INITIAL_STATE__',{story:article}),
]){
  const result=extractArticle(page(embedded),url);
  assert.equal(result.extraction.method,'embedded-data');
  assert.equal(result.body.length,8);assert.ok(result.body.at(-1)[1].startsWith('Chapter 8.'));
}
// Public JSON-LD and HTML are judged by the same candidate comparison.
const schema=`<script type="application/ld+json">${json({'@type':'Article',headline:title,articleBody:full})}</script>`;
assert.ok(extractArticle(page(schema),url).wordCount>200);
// Other stories, recommendations and UI caches cannot win just by being long.
for(const state of [
  {props:{pageProps:{article:{...article,url:'https://example.com/other'}}}},
  {props:{pageProps:{article:{title:'A different story',body:full}}}},
  {recommendations:[article],menu:{content:full}},
  {article:{...article,isAccessibleForFree:false}},
  {article:{...article,isAccessibleForFree:'false'}},
])assert.equal(extractArticle(page(next(state)),url).extraction.method,'html');
// Inert parsing removes media and scripts while preserving paragraph boundaries.
const contaminated=full+'<script>globalThis.__folioExecuted=true</script><img src="https://example.com/photo.jpg"><figcaption>UNWANTED CAPTION</figcaption>';
const safe=extractArticle(page(next({article:{...article,body:contaminated}})),url);
assert.equal(globalThis.__folioExecuted,undefined);assert.equal(safe.body.length,8);
assert.ok(!JSON.stringify(safe.body).includes('UNWANTED'));assert.ok(!JSON.stringify(safe.body).includes('photo.jpg'));
assert.equal(extractArticle(page('<script>window.__NUXT__ = getArticle()</script>'),url).extraction.method,'html');
// Repeated cache text and many tiny labels are weaker than coherent article prose.
const formatted={method:'html',blocks:Array.from({length:4},(_,i)=>['p',`${i} ${prose}`])};
const duplicate={method:'embedded-data',blocks:Array.from({length:100},()=>['p',prose])};
assert.equal(chooseArticleCandidate([formatted,duplicate]),formatted);
assert.equal(chooseArticleCandidate([formatted,{method:'embedded-data',blocks:Array.from({length:100},(_,i)=>['p',`Navigation ${i}`])}]),formatted);
console.log('Passed: Next.js, Nuxt object/indexed payloads, Apollo and initial-state article extraction; candidate comparison; unrelated/restricted content exclusion; inert parsing and text-only output.');
