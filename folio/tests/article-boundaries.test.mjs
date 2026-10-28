import assert from 'node:assert/strict';
import { extractArticle, cleanArticleTitle } from '../lib/article-extractor.js';
import { cleanArticleBlocks } from '../lib/article-boundaries.js';

const url='https://example.com/articles/interview';
const intro='An interview about the craft of building music players. The designer explains how physical objects carry a culture across generations and why a careful choice of materials matters. ';
const final='The last answer remains part of the interview, even when it is short.';
const headline='What We Can Learn About Craft From Turntable Design';
const brandedTitle=headline+' — The Creative Factor';
assert.equal(cleanArticleTitle(brandedTitle,['The Creative Factor']),headline);
assert.equal(cleanArticleTitle(brandedTitle,['thecreativefactor']),headline);
assert.equal(cleanArticleTitle('Music — machines — The Creative Factor',['The Creative Factor']),'Music — machines');
assert.equal(cleanArticleTitle('Music — machines',['The Creative Factor']),'Music — machines');
assert.equal(cleanArticleTitle('Music: the human connection',['The Creative Factor']),'Music: the human connection');
assert.equal(cleanArticleTitle('The Creative Factor',['The Creative Factor']),'The Creative Factor');
for(const separator of [' | ',' – ',' - ',' · '])assert.equal(cleanArticleTitle(headline+separator+'The Creative Factor',['The Creative Factor']),headline);
for(const metadata of ['', '<meta property="og:site_name" content="The Creative Factor">']){
 const imported=extractArticle(`<meta property="og:title" content="${brandedTitle}">${metadata}<article><h1>${headline}</h1><p>${intro.repeat(3)}</p></article>`,'https://www.thecreativefactor.co/articles/example');
 assert.equal(imported.title,headline);
}
const {readFile}=await import('node:fs/promises');
const {runInNewContext}=await import('node:vm');
const page=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const browserHelper=page.slice(page.indexOf('function cleanArticleTitle('),page.indexOf('\nfunction extract(html,url)'));
assert.equal(browserHelper.trim(),cleanArticleTitle.toString().trim());
assert.equal(runInNewContext('('+browserHelper+')')(brandedTitle,['The Creative Factor']),headline);
const link=(text,href='/another-story')=>['p',text,[{tag:'a',href,children:[text]}]];
// A synthetic Squarespace-style interview, including components that live
// inside its article container. No publisher-specific hostname is required.
const fixture=`<main><article><header><h1>Design and music</h1><p>Written by Example Author</p></header>
  <div class="blog-item-content"><div class="sqs-html-content"><p>${intro.repeat(3)}</p>
  <div class="image-caption-wrapper"><p>UNWANTED IMAGE CAPTION</p></div>
  <h2>Where did this interest begin?</h2><p>${intro}</p>
  <div class="sqs-block-newsletter"><h2>UNWANTED SIGNUP HEADING</h2><p>${intro.repeat(15)}</p><form><input></form></div>
  <p>A useful <a href="/context">reference about materials</a> belongs in the answer.</p>
  <ol><li>Choose a material.</li><li>Listen carefully.</li></ol><p>${final}</p>
  <p><a href="/subscribe">If you’d like to read more from this publication, sign up for our newsletter.</a></p>
  <p>Plus, check out the following pieces:</p><ul><li><a href="/first">UNWANTED RECOMMENDED STORY ONE</a></li><li><a href="/second">UNWANTED RECOMMENDED STORY TWO</a></li></ul>
  <div class="blog-item-author-profile-wrapper"><p>UNWANTED AUTHOR BIO ${intro.repeat(3)}</p></div>
  </div></div></article><section><h2>More from this publication</h2><p><a href="/next">UNWANTED OUTSIDE STORY</a></p></section></main>`;
const article=extractArticle(fixture,url);
const text=JSON.stringify(article.body);
assert.ok(!text.includes('UNWANTED'));
assert.ok(!text.includes('Written by'));
assert.ok(!text.includes('newsletter'));
assert.ok(!text.includes('following pieces'));
assert.ok(text.includes('Where did this interest begin?'));
assert.ok(text.includes('https://example.com/context'));
assert.ok(text.includes('1. Choose a material.'));
assert.equal(article.body.at(-1)[1],final);
assert.equal(article.extraction.method,'html');

// Recommendations embedded mid-article do not cut off the remaining prose.
const inline=[['p',intro],['h2','Related stories'],link('A recommended story'),['h2','The next interview question'],['p',final]];
assert.deepEqual(cleanArticleBlocks(inline),[inline[0],inline[3],inline[4]]);
// Preserve editorial references, quotations, headings and ordinary link lists.
const editorial=[['p','We built a newsletter to share our research with other designers.'],['p','Sign up is a phrase the designer dislikes seeing on every page.'],['blockquote','Sign up for our newsletter.'],['h2','Read next'],['p',intro],link('A useful reference'),link('Another useful reference'),['h2','Related stories'],['p',final]];
assert.deepEqual(cleanArticleBlocks(editorial),editorial);
// Clean every extraction candidate before ranking; a public metadata fallback
// must not restore a standalone subscription prompt.
const structured=extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',articleBody:`<p>${intro.repeat(8)}</p><p>Sign up for our newsletter.</p>`})}</script><article><p>${intro.repeat(2)}</p></article>`,url);
assert.equal(structured.extraction.method,'structured-data');
assert.ok(!JSON.stringify(structured.body).includes('Sign up'));
// A real article subsection whose name resembles a component stays intact.
assert.ok(extractArticle(`<article><div class="article-body"><p>${intro.repeat(3)}</p><h2>Related stories</h2><p>${final}</p></div></article>`,url).body.some(block=>block[1]===final));
console.log('Passed: nested article-body boundaries, captions, newsletter widgets/prompts, author bios, related links, mid-article recovery and editorial/list/formatting preservation.');
