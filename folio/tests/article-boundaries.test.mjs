import assert from 'node:assert/strict';
import { extractArticle, cleanArticleTitle, articleTitleMetadata } from '../lib/article-extractor.js';
import { isMediaCaption, cleanArticleBlocks } from '../lib/article-boundaries.js';

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
const browserMetadata=page.slice(page.indexOf('function articleTitleMetadata('),page.indexOf('\nfunction cleanArticleTitle('));
assert.equal(browserMetadata.trim(),articleTitleMetadata.toString().trim());
assert.equal(runInNewContext('('+browserHelper+')')(brandedTitle,['The Creative Factor']),headline);
const harpersTitle='Kicking Robots, by James Vincent';
assert.equal(cleanArticleTitle(harpersTitle,[],{author:'James Vincent'}),'Kicking Robots');
assert.equal(cleanArticleTitle(harpersTitle,[],{headlines:['Kicking Robots']}),'Kicking Robots');
assert.equal(cleanArticleTitle(harpersTitle,[],{schemaHeadline:'Kicking Robots'}),'Kicking Robots');
assert.equal(cleanArticleTitle(harpersTitle+' — Harper’s Magazine',['Harper’s Magazine'],{author:'James Vincent'}),'Kicking Robots');
assert.equal(cleanArticleTitle('A field — a return, by Émile Zola',[],{author:'Émile Zola'}),'A field — a return');
assert.equal(cleanArticleTitle('Designed by Nature',[],{author:'Someone Else'}),'Designed by Nature');
assert.equal(cleanArticleTitle('Stand by Me',[],{author:'Someone Else'}),'Stand by Me');
assert.equal(cleanArticleTitle('Travelling, by Train',[],{author:'Train',headlines:['Travelling, by Train']}),'Travelling, by Train');
assert.equal(cleanArticleTitle('Travelling, by Train',[],{headlines:['Travelling, by Train'],schemaHeadline:'Travelling'}),'Travelling, by Train');
assert.equal(cleanArticleTitle(harpersTitle,[],{author:'Different Writer'}),harpersTitle);
assert.equal(cleanArticleTitle(harpersTitle),harpersTitle); // No unsupported guessing.
for(const metadata of [
 '<meta name="author" content="James Vincent">',
 '<script type="application/ld+json">{"@type":"Article","headline":"Kicking Robots","author":{"name":"James Vincent"}}</script>',
 ''
]){
 const imported=extractArticle(`<meta property="og:title" content="${harpersTitle}">${metadata}<header><h1>Magazine masthead</h1></header><article><h1>Kicking Robots</h1><p>${intro.repeat(3)}</p></article>`,'https://harpers.org/archive/example');
 assert.equal(imported.title,'Kicking Robots');
 assert.equal(imported.author,'James Vincent');
 assert.equal(imported.originalTitle,harpersTitle);
}
const recovered=articleTitleMetadata(harpersTitle+' — Harper’s Magazine',['Harper’s Magazine'],{headlines:['Kicking Robots']});
assert.equal(recovered.title,'Kicking Robots');assert.equal(recovered.author,'James Vincent');
assert.equal(articleTitleMetadata('Travelling, by Train',[],{headlines:['Travelling, by Train']}).author,'');
assert.equal(articleTitleMetadata(harpersTitle,[],{headlines:['Kicking Robots'],author:'https://example.com/authors/james'}).author,'James Vincent');
const profileAuthor=extractArticle(`<meta property="og:title" content="${harpersTitle}"><meta property="article:author" content="https://example.com/author/james"><script type="application/ld+json">{"@type":"Article","author":{"name":"James Vincent"}}</script><article><h1>Kicking Robots</h1><p>${intro.repeat(3)}</p></article>`,'https://example.com/story');
assert.equal(profileAuthor.author,'James Vincent');
const hiddenTitle=extractArticle(`<meta property="og:title" content="${harpersTitle}"><div hidden><h1>Kicking Robots</h1></div><article><p>${intro.repeat(3)}</p></article>`,'https://example.com/story');
assert.equal(hiddenTitle.title,harpersTitle);
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
const caption='The RBO Hand 3 robot holds a flower in Berlin, 2019. The robot was developed in the Robotics and Biology Laboratory at Technische Universität Berlin.';
const captionHelper=page.slice(page.indexOf('function isMediaCaption('),page.indexOf('\nfunction articleTitleMetadata('));
assert.equal(captionHelper.trim(),isMediaCaption.toString().trim());
for(const label of ['caption','caption-text','wp-caption-text','slideshow-caption','gallery__caption','imageCaption','photo-credit']){
 assert.equal(isMediaCaption(label),true,label);
 const imported=extractArticle(`<article class="article-body"><p>${intro.repeat(3)}</p><div class="${label}"><p>${caption}</p></div><p>${final}</p></article>`,url);
 assert.ok(!JSON.stringify(imported.body).includes(caption),label);assert.equal(imported.body.at(-1)[1],final);
}
for(const label of ['captioned-article','recaptioning','article-body','photography','credit-policy'])assert.equal(isMediaCaption(label),false,label);
assert.equal(isMediaCaption('','caption'),true);
assert.ok(!JSON.stringify(extractArticle(`<article><p>${intro.repeat(3)}</p><span itemprop="caption">${caption}</span><p>${final}</p></article>`,url).body).includes(caption));
// Metadata with more text must not resurrect a caption that was labelled in HTML.
const metadataCaption=extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',articleBody:intro.repeat(12)+'\n'+caption+'\n'+final})}</script><article><p>${intro.repeat(3)}</p><p class="caption">${caption}</p></article>`,url);
assert.equal(metadataCaption.extraction.method,'structured-data');assert.ok(!JSON.stringify(metadataCaption.body).includes(caption));
// Also filter caption wrappers in metadata HTML and embedded application state.
for(const metadata of [
 {'@type':'Article',articleBody:`<p>${intro.repeat(12)}</p><div class="caption"><p>${caption}</p></div><p>${final}</p>`},
 {article:{url,title:headline,body:`<p>${intro.repeat(12)}</p><p class="slideCaption">${caption}</p><p>${final}</p>`}}
]){
 const imported=extractArticle(`<meta property="og:title" content="${headline}"><script type="${metadata['@type']?'application/ld+json':'application/json'}">${JSON.stringify(metadata)}</script><article><p>${intro.repeat(2)}</p></article>`,url);
 assert.ok(!JSON.stringify(imported.body).includes(caption));assert.ok(imported.body.some(block=>block[1]===final));
}
// Wording alone is insufficient: the same sentence in normal prose stays.
assert.ok(extractArticle(`<article><p>${intro.repeat(3)}</p><p>${caption}</p><p>We discussed captions and photographic credits at length.</p></article>`,url).body.some(block=>block[1]===caption));
console.log('Passed: nested article-body boundaries, captions, newsletter widgets/prompts, author bios, related links, mid-article recovery and editorial/list/formatting preservation.');
