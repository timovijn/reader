import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {analyseArticleBlocks,cleanArticleBlocks} from '../lib/article-boundaries.js';
import {extractArticle} from '../lib/article-extractor.js';

const prose='The study follows how people build institutions and develop shared habits over time. Its evidence is uncertain, and the argument depends on comparing different communities rather than assuming a single universal explanation. ';
const conclusion='The comparison leaves an open question about what these institutions can teach us today.';
const note='This is our third article from Issue 26, which arrives with print subscribers this week.';
const bio='Samuel Hughes is an editor at Works in Progress.';
const thanks='Thanks for reading The Works in Progress Newsletter!';
const blocks=[['p',note],['p','* * *'],['p',prose],['p','* * *'],['p',conclusion],['p','* * *'],['p',bio],['p',thanks]];
const analysis=analyseArticleBlocks(blocks,{author:'Samuel Hughes'});
assert.deepEqual(analysis.blocks,[blocks[2],blocks[3],blocks[4]]);
assert.deepEqual(analysis.removed.map(item=>item.role),['publication-note','decoration','decoration','author-bio','subscription']);
assert.ok(analysis.removed.filter(item=>item.role!=='decoration').every(item=>item.evidence.length>=2));
assert.ok(!JSON.stringify(analysis.removed).includes('Samuel')); // Evidence contains no article text.
assert.equal(blocks.length,8); // Do not mutate source candidates or their formatting.

// Different publication, author, phrasing and URL: the same evidence applies.
const other=[['p','Read this essay in our latest print edition, on sale now.'],['p',prose],['p',conclusion],['p','Alex Rivera is a senior contributing editor at Another Journal.'],['p','Thank you for reading Another Journal Newsletter.']];
assert.deepEqual(cleanArticleBlocks(other,{author:'Alex Rivera'}),other.slice(1,3));
const linkedNote=['p','Our new issue features this essay.',[{tag:'a',href:'https://another.example/print/',children:['Our new issue features this essay.']}]];
assert.deepEqual(cleanArticleBlocks([linkedNote,['p',prose]]),[['p',prose]]);

// Similar vocabulary is not sufficient evidence to delete editorial prose.
const editorial=[['p','Issue 26 of the historical newspaper arrives at the archive this week.'],['p','The editor wrote about print subscribers and the economics of delivery.'],['blockquote',note],['pre',thanks],['h2','Thanks for reading the newsletter'],['p',bio],['p',prose],['p','* * *'],['p',conclusion]];
assert.deepEqual(cleanArticleBlocks(editorial,{author:'Samuel Hughes'}),editorial);
assert.deepEqual(cleanArticleBlocks([['p',prose],['p',bio]],{author:'Someone Else'}),[['p',prose],['p',bio]]);
assert.deepEqual(cleanArticleBlocks([['p',prose],['p',bio]]),[['p',prose],['p',bio]]);
assert.deepEqual(cleanArticleBlocks([['p',prose],['blockquote',thanks]]),[['p',prose],['blockquote',thanks]]);
assert.deepEqual(cleanArticleBlocks([['p',prose],['p','Thanks for reading the newsletter, she said, before returning to the argument.']]),[['p',prose],['p','Thanks for reading the newsletter, she said, before returning to the argument.']]);

// Fixture follows the reported page's opening/closing sequence. Content is
// synthetic except for the publishing notes supplied in the bug report.
const html=`<meta name="author" content="Samuel Hughes"><meta property="og:title" content="Institutional habits"><article><div class="body markup"><p><em>This is our third article from Issue 26, which arrives with <a href="https://worksinprogress.co/print/">print subscribers</a> this week.</em></p><hr><p>${prose.repeat(3)}</p><hr><h2>A different conclusion</h2><p>${conclusion}</p><hr><p><em>${bio}</em></p><p>${thanks}</p></div></article>`;
for(const domain of ['https://publication.example/essay','https://another.example/a-post']){
 const imported=extractArticle(html,domain),text=JSON.stringify(imported.body);
 for(const unwanted of [note,bio,thanks])assert.ok(!text.includes(unwanted));
 assert.ok(text.includes(conclusion));assert.ok(text.includes('A different conclusion'));
 assert.equal(imported.body.filter(block=>block[1]==='* * *').length,1);
 assert.equal(imported.extraction.boundaries.roles['publication-note'],1);
 assert.equal(imported.extraction.boundaries.roles['author-bio'],1);
}
// Every candidate is classified before ranking; fuller metadata must neither
// restore boilerplate nor flatten quotations into removable publisher text.
for(const type of ['application/ld+json','application/json']){
 const body=`<p>${note}</p><p>${prose.repeat(15)}</p><blockquote>${thanks}</blockquote><pre>${note}</pre><p>${conclusion}</p><p>${bio}</p><p>${thanks}</p>`;
 const data=type==='application/ld+json'?{'@type':'Article',articleBody:body}:{article:{body}};
 const imported=extractArticle(`<meta name="author" content="Samuel Hughes"><script type="${type}">${JSON.stringify(data)}</script><article><p>${prose.repeat(2)}</p></article>`,'https://third.example/story');
 assert.equal(imported.extraction.method,type==='application/ld+json'?'structured-data':'embedded-data');
 assert.ok(imported.body.some(block=>block[0]==='blockquote'&&block[1]===thanks));
 assert.ok(imported.body.some(block=>block[0]==='pre'&&block[1]===note));
 assert.ok(!imported.body.some(block=>block[0]==='p'&&[note,bio,thanks].includes(block[1])));
 assert.ok(imported.body.some(block=>block[1]===conclusion));
}

// The website fallback and portable bookmarklet use exactly the same engine.
const page=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const browserSource=page.slice(page.indexOf('function analyseArticleBlocks('),page.indexOf('function isMediaCaption('));
assert.equal(browserSource.trim(),(analyseArticleBlocks.toString()+'\n\n'+cleanArticleBlocks.toString()).trim());
const browserClean=vm.runInNewContext(browserSource+';cleanArticleBlocks',{URL});
assert.equal(JSON.stringify(browserClean(blocks,{author:'Samuel Hughes'})),JSON.stringify(analysis.blocks));
assert.match(page,/analyseArticleBlocks\.toString\(\)\+';'\+cleanArticleBlocks\.toString\(\)/);
console.log('Passed: shared publisher-independent boundary classification, explanation evidence, multiple publication styles, author identity, metadata/embedded candidates, preserved quotes/code/scene breaks/editorial references and browser engine parity.');

// Aeon-shaped synthetic content: author/header, audio UI, essay, footer and cards.
const aeonUrl='https://aeon.co/essays/a-synthetic-essay';
const aeonBlocks=[['p','Example Writer'],['p','is an independent researcher studying cultural change.'],['p','Edited byExample Editor'],['p','3,400 words Save'],['p','SYNDICATE THIS ESSAY'],['p','Listen to this essay'],['p','26 minute listen'],['p',prose.repeat(3)],['h2','An editorial heading'],['blockquote','Save Share'],['p',conclusion],['p','Published in association with Example Institute, an Aeon Strategic Partner.'],['p','6 August 2024'],['p','Save Share'],['p','SYNDICATE THIS ESSAY'],['p','A recommended essay',[{tag:'a',href:'https://aeon.co/essays/other',children:['A recommended essay']}]]];
const aeonClean=cleanArticleBlocks(aeonBlocks,{author:'Example Writer',url:aeonUrl});
assert.deepEqual(aeonClean,aeonBlocks.slice(7,11));
// Scope must be exact, and quoted interface labels must remain editorial content.
for(const url of ['https://aeon.co.example.org/essay','https://example.org/essay']){
 assert.ok(cleanArticleBlocks(aeonBlocks,{author:'Example Writer',url}).some(block=>block[1]==='26 minute listen'));
}
const noMarker=aeonBlocks.filter(block=>block[1]!=='SYNDICATE THIS ESSAY').slice(0,10);
assert.ok(!cleanArticleBlocks(noMarker,{author:'Example Writer',url:aeonUrl}).some(block=>block[1].startsWith('is an independent')));
const aeonFixture='<meta name="author" content="Example Writer"><article>'+aeonBlocks.map(([tag,text,parts])=>`<${tag}>${parts?`<a href="/essays/other">${text}</a>`:text}</${tag}>`).join('')+'</article>';
const aeonArticle=extractArticle(aeonFixture,aeonUrl);
assert.ok(aeonArticle.body.some(block=>block[1]===conclusion));
assert.ok(!JSON.stringify(aeonArticle.body).includes('26 minute listen'));
assert.ok(!JSON.stringify(aeonArticle.body).includes('Example Editor'));
assert.equal(JSON.stringify(browserClean(aeonBlocks,{author:'Example Writer',url:aeonUrl})),JSON.stringify(aeonClean));
console.log('Passed: Aeon header/audio/partner/footer cleanup, linked recommendations, host scope and preserved editorial formatting.');
