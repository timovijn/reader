import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {assignedData,nytArticleBlocks} from '../../folio/lib/nyt-extractor.js';
import {chooseArticleCandidate} from '../../folio/lib/embedded-articles.js';
import {analyseArticleBlocks,cleanArticleBlocks,isMediaCaption} from '../../folio/lib/article-boundaries.js';
import {cleanArticleTitle,articleTitleMetadata,cleanArticleExcerpt,resolveArticleAuthor} from '../../folio/lib/article-extractor.js';

const source=await readFile(new URL('../Shared/Extractor.js',import.meta.url),'utf8');
const context=vm.createContext({URL});vm.runInContext(source,context);
for(const [name,implementation] of Object.entries({assignedData,nytArticleBlocks,chooseArticleCandidate,analyseArticleBlocks,cleanArticleBlocks,isMediaCaption,cleanArticleTitle,articleTitleMetadata,cleanArticleExcerpt,resolveArticleAuthor})){
 assert.equal(context[name].toString(),implementation.toString(),name+' must match the web engine');
}
const profiles=JSON.parse(await readFile(new URL('../Shared/PublisherProfiles.json',import.meta.url),'utf8'));
assert.deepEqual(profiles,JSON.parse(await readFile(new URL('../../folio/lib/publisher-profiles.json',import.meta.url),'utf8')));
const profileFor=value=>{const url=new URL(value);return profiles.find(profile=>(url.hostname===profile.domain||url.hostname.endsWith('.'+profile.domain))&&new RegExp(profile.pathPattern).test(url.pathname));};
assert.equal(profileFor('https://www.nytimes.com/2026/10/21/magazine/story.html?src=longreads').userAgent,'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)');
for(const url of ['https://nytimes.com.example.org/2026/10/21/a/story.html','https://www.nytimes.com/account','https://www.nytimes.com/games/wordle.html','https://example.com/2026/10/21/a/story.html'])assert.equal(profileFor(url),undefined);
assert.ok(profiles[0].blockedResourcePatterns.some(pattern=>new RegExp(pattern).test('https://www.nytimes.com/meter.js')));
assert.ok(!profiles[0].blockedResourcePatterns.some(pattern=>new RegExp(pattern).test('https://www.nytimes.com/2026/10/21/magazine/story.html')));

const url='https://www.nytimes.com/2026/10/21/magazine/story.html?src=longreads';
const prose='This synthetic article follows a reader through a changing city. It describes the people, their homes and the stories they share. ';
const publisher=[{__typename:'ParagraphBlock',content:[{__typename:'TextInline',text:prose.repeat(6),formats:[{__typename:'ItalicFormat'}]}]},{__typename:'ImageBlock',caption:'UNWANTED IMAGE CAPTION'},{__typename:'Dropzone',text:'UNWANTED ADVERTISEMENT'},{__typename:'ParagraphBlock',content:[{__typename:'TextInline',text:'The final paragraph is part of the original article.',formats:[]}]}];
const metadata={author:'Example Writer','og:title':'An example article','og:site_name':'The New York Times',description:'An incomplete search preview...'};
let structuredMetadata=[];
const paragraph=text=>({tagName:'P',textContent:text,parentElement:{closest:()=>null},querySelectorAll:()=>[]});
const preview=paragraph(prose),root={querySelectorAll:()=>[preview]};
const clone={body:root,querySelectorAll:selector=>selector.startsWith('.entry-content')?[root]:[]};
const heading={textContent:'An example article',closest:()=>null};
context.location=new URL(url);
context.document={title:'Search title',cloneNode:()=>clone,
 querySelector:selector=>selector==='h1'?heading:selector.startsWith('meta')?{content:metadata[selector.match(/(?:property|name)="([^"]+)"/)?.[1]]||''}:null,
 querySelectorAll:selector=>selector==='h1'?[heading]:selector==='script[type="application/ld+json"]'?structuredMetadata.map(textContent=>({textContent})):selector==='script'?[{textContent:'window.__preloadedData = '+JSON.stringify({loaderData:{data:{article:{url,sprinkledBody:{content:publisher}}}}})}]:[]};
const clip=context.otherLivesExtract();
assert.equal(clip.title,'An example article');assert.equal(clip.author,'Example Writer');assert.equal(clip.excerpt,'');
assert.equal(clip.body.length,2);assert.equal(clip.body[0][1],prose.repeat(6).trim());
assert.equal(clip.body.at(-1)[1],'The final paragraph is part of the original article.');
assert.ok(clip.body.every(block=>block.length===2&&block.every(value=>typeof value==='string')));
assert.ok(!JSON.stringify(clip).includes('UNWANTED'));assert.ok(!clip.url.includes('?'));
// NYT supplies article:author as a profile URL, with the real author in JSON-LD.
delete metadata.author;metadata['article:author']='https://www.nytimes.com/by/sophie-haigney';
structuredMetadata=[JSON.stringify({'@type':'NewsArticle',url,author:[{'@type':'Person',name:'Sophie Haigney',url:metadata['article:author']}]})];
assert.equal(context.otherLivesExtract().author,'Sophie Haigney');
structuredMetadata=['malformed JSON',JSON.stringify({'@graph':[{'@type':'NewsArticle',url:'https://another.example/story',author:{name:'Wrong Writer'}},{'@type':'NewsArticle',url,author:[{name:'A Writer'},{name:'B Writer'},{name:'A Writer'}]}]})];
assert.equal(context.otherLivesExtract().author,'A Writer, B Writer');
console.log('Passed: native/web extraction parity, shared publisher profiles, NYT resource scope, typed article selection, excluded images/ads, complete paragraph retention and native clip compatibility.');
