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
const body=JSON.stringify(article.body);assert.ok(!body.includes('UNWANTED'));assert.ok(!body.includes('unsafe'));assert.ok(body.includes('Next chapter'));assert.ok(body.includes('"tag":"em"'));assert.ok(body.includes('"tag":"strong"'));assert.ok(body.includes('https://clereviewofbooks.com/context'));assert.ok(body.includes('3. A first item.'));assert.ok(body.includes('https://clereviewofbooks.com/photo.jpg'));assert.ok(body.includes('The track'));
assert.equal(article.body.filter(b=>b[0]==='img').length,1);

// Malformed publisher HTML, plain div prose, short essays and inert unsafe markup.
assert.ok(extractArticle('<h1>A short essay</h1><main><div>'+prose.repeat(2)+'</div></main>',articleUrl).wordCount>50);
assert.ok(extractArticle('<h1>Unclosed paragraphs</h1><article><p>'+prose+'<p>'+prose,articleUrl).body.length>=2);
const hostile=extractArticle(`<article><h1>Safe</h1><p>${prose}<a href="javascript:alert(1)">a link</a><img src="javascript:alert(1)"><iframe src="https://evil.example">BAD</iframe></p></article>`,articleUrl);
assert.ok(!JSON.stringify(hostile).includes('javascript:'));assert.ok(!JSON.stringify(hostile).includes('iframe'));

const structured=extractArticle(`<html><head><script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'NewsArticle',headline:'Public structured story',author:{name:'Writer'},articleBody:prose.repeat(2),isAccessibleForFree:true}]})}</script></head><body><div id="app"></div></body></html>`,articleUrl);
assert.equal(structured.extraction.method,'structured-data');assert.equal(structured.author,'Writer');
assert.throws(()=>extractArticle(`<script type="application/ld+json">${JSON.stringify({'@type':'Article',articleBody:prose.repeat(2),isAccessibleForFree:false})}</script><p>Subscribe to continue</p>`,articleUrl),e=>e.code==='sign_in_required');
assert.throws(()=>extractArticle('<title>Just a moment</title><main>Verify you are human</main>',articleUrl),e=>e.code==='bot_protection');

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
console.log('Passed: WordPress IP regression, IPv4-mapped IPv6, private networks, HTML/metadata/structured extraction, safe rich text, lists/images, malformed HTML, compression, pinned DNS failover, redirects, status codes and character encodings.');
