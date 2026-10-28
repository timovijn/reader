import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { createPublicFetch, createVercelHandler, isPublicAddress } from '../lib/vercel-article.js';
import { extractArticle } from '../lib/article-extractor.js';
import { handleRequest } from '../worker/index.js';

const articleUrl='https://clereviewofbooks.com/the-anderson-speedway-indianas-data-centers/';
const prose='This is an original fixture about a town and its changing landscape. People gather to watch a race and talk about the future. The old buildings stand beside new developments, and everyone has a different idea of what comes next. ';
const paras=Array.from({length:5},(_,i)=>`<p>Section ${i+1}. ${prose}</p>`).join('');
const fixture=`<!doctype html><html><head><title>Fallback</title><meta property="og:title" content="A town in motion"><meta name="author" content="Fixture Author"><meta property="og:site_name" content="A Literary Review"></head><body><header><nav>${'<a href="/shop">Store and subscription navigation</a>'.repeat(30)}</nav></header><article><header><h1>A town in motion</h1></header><div class="entry-content">${paras}<h2>Next chapter</h2><p>A <em>quiet</em> moment and <strong>bold</strong> words, with <a href="/context">more context</a> to consider. ${prose}</p><blockquote>A thought to pause on.</blockquote><ol start="3"><li>A first item.</li><li>A second item.</li></ol><img src="data:image/gif;base64,AAAA" data-src="/photo.jpg" alt="The track"><script>alert('unsafe')</script><div class="related-posts"><p>${'UNWANTED RECOMMENDATION '.repeat(100)}</p></div><section class="comments"><p>${'UNWANTED COMMENT '.repeat(100)}</p></section></div></article><footer>${prose.repeat(3)}</footer></body></html>`;
const post=(url=articleUrl)=>new Request('https://folio.example/api/article',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});
const response=(html=fixture,options={})=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'},...options});

// The original filter incorrectly blocked the whole 192.0.*.* range.
for(const address of ['192.0.78.24','192.0.78.25','192.0.80.1','::ffff:192.0.78.24','::ffff:c000:4e18','2606:4700:4700::1111'])assert.equal(isPublicAddress(address),true,address);
for(const address of ['192.0.0.1','192.0.2.1','192.168.1.1','169.254.169.254','::ffff:192.168.1.1','0:0:0:0:0:ffff:7f00:1','fc00::1','fe80::1','2001:0db8:0:0:0:0:0:1'])assert.equal(isPublicAddress(address),false,address);

const article=extractArticle(fixture,articleUrl);
assert.equal(article.title,'A town in motion');assert.equal(article.author,'Fixture Author');assert.equal(article.siteName,'A Literary Review');
const body=JSON.stringify(article.body);assert.ok(!body.includes('UNWANTED'));assert.ok(!body.includes('unsafe'));assert.ok(body.includes('Next chapter'));assert.ok(body.includes('"tag":"em"'));assert.ok(body.includes('"tag":"strong"'));assert.ok(body.includes('https://clereviewofbooks.com/context'));assert.ok(body.includes('3. A first item.'));assert.ok(!body.includes('https://clereviewofbooks.com/photo.jpg'));assert.ok(!body.includes('The track'));
assert.equal(article.body.filter(b=>b[0]==='img').length,0);

// Malformed publisher HTML, plain div prose, short essays and inert unsafe markup.
assert.ok(extractArticle('<h1>A short essay</h1><main><div>'+prose.repeat(2)+'</div></main>',articleUrl).wordCount>50);
assert.ok(extractArticle('<h1>Unclosed paragraphs</h1><article><p>'+prose+'<p>'+prose,articleUrl).body.length>=2);
const hostile=extractArticle(`<article><h1>Safe</h1><p>${prose}<a href="javascript:alert(1)">a link</a><img src="javascript:alert(1)"><iframe src="https://evil.example">BAD</iframe></p></article>`,articleUrl);
assert.ok(!JSON.stringify(hostile).includes('javascript:'));assert.ok(!JSON.stringify(hostile).includes('iframe'));

const structured=extractArticle(`<html><head><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'NewsArticle',headline:'Public structured story',author:{name:'Writer'},articleBody:prose.repeat(2),isAccessibleForFree:true}]})}</script></head><body><div id="app"></div></body></html>`,articleUrl);
assert.equal(structured.extraction.method,'structured-data');assert.equal(structured.author,'Writer');
// A readable introduction must not prevent a longer public metadata fallback.
const publicBody=prose.repeat(12);
const publicPreview=extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',articleBody:publicBody,isAccessibleForFree:true})}</script><article><p>${prose}</p></article>`,articleUrl);
assert.equal(publicPreview.extraction.method,'structured-data');assert.ok(publicPreview.wordCount>400);
const paidMetadata={'@type':'Article',isAccessibleForFree:false,wordCount:'2,000',articleBody:publicBody};
assert.throws(()=>extractArticle(`<script type="application/ld+json">${JSON.stringify(paidMetadata)}</script><article><p>${prose}</p></article>`,articleUrl),e=>e.code==='incomplete_article');
// Full article HTML remains importable even when the publisher labels it paid.
assert.ok(extractArticle(`<script type="application/ld+json">${JSON.stringify({...paidMetadata,wordCount:800})}</script><article>${paras.repeat(4)}</article>`,articleUrl).wordCount>700);
// Do not guess that a short essay is incomplete without length evidence.
assert.ok(extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',isAccessibleForFree:false})}</script><article><p>${prose}</p></article>`,articleUrl).wordCount>20);
assert.throws(()=>extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',articleBody:prose.repeat(2),isAccessibleForFree:false})}</script><p>Subscribe to continue</p>`,articleUrl),e=>e.code==='sign_in_required');
assert.throws(()=>extractArticle('<title>Just a moment</title><main>Verify you are human</main>',articleUrl),e=>e.code==='bot_protection');

// New Yorker labels real prose paragraphs `paywall`, including drop caps,
// across several body containers. This is distinct from its paywall interface.
const newYorkerUrl='https://www.newyorker.com/magazine/2026/11/02/fixture';
const newYorkerFixture=`<article><div class="article__body"><p>${prose}</p><p class="paywall">Second paragraph. ${prose}<em>Preserved emphasis.</em></p></div><aside class="paywall-bar"><p>${'UNWANTED SUBSCRIPTION '.repeat(40)}</p></aside><div class="article__body"><p class="has-dropcap body paywall">Final paragraph. ${prose}</p><p class="paywall" hidden>UNWANTED HIDDEN TEXT</p></div></article><p class="paywall">${'UNWANTED OUTSIDE BODY '.repeat(40)}</p>`;
const newYorkerArticle=extractArticle(newYorkerFixture,newYorkerUrl);
assert.equal(newYorkerArticle.extraction.method,'html');assert.equal(newYorkerArticle.body.length,3);
assert.ok(newYorkerArticle.body[2][1].startsWith('Final paragraph.'));
assert.ok(JSON.stringify(newYorkerArticle.body).includes('"tag":"em"'));
assert.ok(!JSON.stringify(newYorkerArticle.body).includes('UNWANTED'));
assert.equal(extractArticle(newYorkerFixture,articleUrl).body.length,1);
assert.equal(extractArticle(newYorkerFixture,'https://newyorker.com.example.org/article').body.length,1);

// Times preloaded data contains JSON-like data, not executable extraction code.
const nytUrl='https://www.nytimes.com/2026/10/27/business/fixture.html';
const nytContent=[{__typename:'ParagraphBlock',content:[{__typename:'TextInline',text:prose.repeat(6),formats:[]},{__typename:'TextInline',text:'A word: undefined, and braces { inside a string }.',formats:[{__typename:'LinkFormat',url:'javascript:alert(1)'}]}]},{__typename:'ImageBlock',media:{caption:'UNWANTED CAPTION'}},{__typename:'Dropzone',text:'UNWANTED AD'},{__typename:'ParagraphBlock',content:[{__typename:'TextInline',text:prose,formats:[{__typename:'LinkFormat',url:'/context'}]}]}];
const nytData={loaderData:{data:{article:{url:nytUrl,sprinkledBody:{content:nytContent}}}},errors:null};
const nytState=JSON.stringify(nytData).replace('"errors":null','"errors":undefined');
const nytPage=state=>`<article><p>${prose}</p></article><script>window.__preloadedData = ${state}; throw new Error('must never execute');</script>`;
const nytArticle=extractArticle(nytPage(nytState),nytUrl);
assert.equal(nytArticle.extraction.method,'publisher-data');assert.equal(nytArticle.body.length,2);
assert.ok(nytArticle.body[0][1].includes('undefined, and braces { inside a string }'));
assert.ok(JSON.stringify(nytArticle.body).includes('https://www.nytimes.com/context'));
assert.ok(!JSON.stringify(nytArticle.body).includes('javascript:'));assert.ok(!JSON.stringify(nytArticle.body).includes('UNWANTED'));
assert.equal(extractArticle(nytPage(nytState),articleUrl).extraction.method,'html');
assert.equal(extractArticle(nytPage(nytState),nytUrl.replace('fixture.html','other.html')).extraction.method,'html');
assert.equal(extractArticle(nytPage('{broken:true}'),nytUrl).extraction.method,'html');

// Simulate actual Node request streams, including compression and failed IPs.
function transport({encoding='',failFirst=false,addresses=[]}={}){
 let attempts=0;
 return {request(url,options,ready){
  const request=new EventEmitter();
  options.lookup(url.hostname,{},(error,address)=>{assert.equal(error,null);addresses.push(address)});
  request.end=()=>{
   if(failFirst&&attempts++===0){queueMicrotask(()=>request.emit('error',Object.assign(new Error('unreachable'),{code:'ENETUNREACH'})));return;}
   const encoded=encoding==='gzip'?gzipSync(fixture):encoding==='deflate'?deflateSync(fixture):encoding==='br'?brotliCompressSync(fixture):Buffer.from(fixture);
   const incoming=Readable.from([encoded]);incoming.statusCode=200;incoming.headers={'content-type':'text/html',...(encoding?{'content-encoding':encoding}:{})};ready(incoming);
  };return request;
 }};
}
for(const encoding of ['','gzip','deflate','br']){
 const attempts=[];const fake=transport({encoding,failFirst:true,addresses:attempts});
 const fetchPage=createPublicFetch(async()=>[{address:'127.0.0.1',family:4},{address:'192.0.78.24',family:4},{address:'192.0.78.25',family:4}],{http:fake,https:fake});
 const result=await createVercelHandler(fetchPage).fetch(post());assert.equal(result.status,200);const value=await result.json();assert.equal(value.article.title,'A town in motion');assert.ok(!('html' in value));assert.deepEqual(attempts,['192.0.78.24','192.0.78.25']);
}
const privateFetch=createPublicFetch(async()=>[{address:'10.0.0.1',family:4}]);await assert.rejects(()=>privateFetch(articleUrl),e=>e.code==='private_address');
const unresolved=createPublicFetch(async()=>{throw Error('DNS failed')});await assert.rejects(()=>unresolved(articleUrl),e=>e.code==='dns_failed');

// Redirects are bounded and revalidated; temporary upstream failures get one retry.
let count=0;const transient=await handleRequest(post(),async()=>++count===1?new Response(null,{status:503}):response());assert.equal(transient.status,200);assert.equal(count,2);
const loop=await handleRequest(post(),async()=>new Response(null,{status:302,headers:{location:articleUrl}}));assert.equal((await loop.json()).code,'redirect_loop');
const redirectedPrivate=await handleRequest(post(),async()=>new Response(null,{status:302,headers:{location:'https://localhost/secret'}}));assert.equal((await redirectedPrivate.json()).code,'invalid_url');
for(const [status,code] of [[401,'sign_in_required'],[403,'access_denied'],[404,'not_found'],[429,'rate_limited']])assert.equal((await (await handleRequest(post(),async()=>new Response(null,{status}))).json()).code,code);
assert.equal((await (await handleRequest(post(),async()=>response('Not an article',{headers:{'content-type':'application/pdf'}}))).json()).code,'not_html');
assert.equal((await (await createVercelHandler(async()=>response('<html><h1>Empty app</h1><div id="app"></div></html>')).fetch(post())).json()).code,'no_article');

// Decode the actual charset, including publishers still serving Windows-1252.
const latin=Buffer.from('<html><p>caf\xe9</p></html>','latin1');const decoded=await handleRequest(post(),async()=>response(latin,{headers:{'content-type':'text/html; charset=windows-1252'}}));assert.ok((await decoded.json()).html.includes('café'));
console.log('Passed: WordPress IP regression, IPv4-mapped IPv6, private networks, HTML/metadata/structured extraction, safe rich text, lists/text-only imports, malformed HTML, compression, pinned DNS failover, redirects, status codes and character encodings.');

// Theme layout flags are not sidebar/footer content. They often live on the
// body or on the outer site wrapper, and previously removed the whole article.
for(const classes of ['no-sidebar','has-sidebar','right-sidebar','single single-post no-sidebar footer-light','has-footer with-comments']){
 const themed=fixture.replace('<body>',`<body class="${classes}">`);
 const imported=extractArticle(themed,articleUrl);
 assert.equal(imported.title,article.title);assert.equal(imported.wordCount,article.wordCount);
 assert.ok(!JSON.stringify(imported.body).includes('UNWANTED'));
}
for(const wrapper of ['<div class="no-sidebar">','<div class="sidebar-layout">','<div id="footer-light" class="theme-layout">']){
 const wrapped=fixture.replace('<body>',`<body>${wrapper}`).replace('</body>','</div></body>');
 assert.equal(extractArticle(wrapped,articleUrl).wordCount,article.wordCount);
}
const unmarked='<body class="no-sidebar"><div class="layout-sidebar"><p>'+prose.repeat(3)+'</p></div><div class="sidebar"><p>UNWANTED SIDEBAR '+prose.repeat(5)+'</p></div></body>';
assert.ok(!JSON.stringify(extractArticle(unmarked,articleUrl).body).includes('UNWANTED SIDEBAR'));
// Real ancillary components are still removed, including prefixed class names.
const ancillary=fixture.replace('</article>','<div class="newsletter-signup"><p>'+prose.repeat(20)+'</p></div></article>');
assert.equal(extractArticle(ancillary,articleUrl).wordCount,article.wordCount);
console.log('Passed: theme layout flags, body/root preservation, outer article wrappers and actual sidebar/newsletter exclusion.');

// Browser clips are imported locally, text-only, without executing pasted HTML.
const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');
const client=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const clipFunction=client.slice(client.indexOf('function normaliseBrowserClip('),client.indexOf("\n$('#browser-bookmarklet').href="));
const normaliseClip=vm.runInNewContext('('+clipFunction+')',{safeHref:value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}},Date});
const clip=normaliseClip(JSON.stringify({format:'folio-browser-clip',version:1,title:'A browser article',url:'https://www.washingtonian.com/article/',author:'Author',body:[['p',prose],['img','https://example.com/image.jpg'],['script','alert(1)'],['p','<script>This stays literal text</script>']]}));
assert.equal(clip.title,'A browser article');assert.equal(clip.body.length,2);assert.equal(clip.body[0][0],'p');assert.equal(clip.url,'https://www.washingtonian.com/article/');
assert.throws(()=>normaliseClip('not json'),/Please paste/);assert.throws(()=>normaliseClip('{}'),/not an other lives browser clip/);
assert.equal(normaliseClip(JSON.stringify({format:'folio-browser-clip',version:1,title:'Test',url:'javascript:alert(1)',body:[['p',prose]]})).url,undefined);
console.log('Passed: browser-clip format validation, text-only blocks, unsafe URL rejection and local import model.');
