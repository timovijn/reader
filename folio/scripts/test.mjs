import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const source=await readFile('dist/server/index.js','utf8');
const {default:worker,validateUrl}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const html=await readFile('worker/page.html','utf8');new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
for(const url of ['file:///etc/passwd','https://localhost/a','http://127.0.0.1/a','http://0x7f000001/a','http://2130706433/a','http://[::1]/a','http://user:password@example.com/a','http://example.com:8080/a','https://foo.internal/a','http://foo.localhost./a'])assert.throws(()=>validateUrl(url));
assert.equal(validateUrl('https://example.com/article').hostname,'example.com');
const page=await worker.fetch(new Request('https://folio.example/'));assert.equal(page.status,200);assert.match(await page.text(),/A little room/);assert.match(page.headers.get('content-security-policy'),/frame-src 'none'/);
assert.equal((await worker.fetch(new Request('https://folio.example/api/article'))).status,405);
assert.equal((await worker.fetch(new Request('https://folio.example/missing'))).status,404);
const post=url=>new Request('https://folio.example/api/article',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});
assert.equal((await worker.fetch(post('http://127.0.0.1'))).status,422);
assert.equal((await worker.fetch(new Request('https://folio.example/api/article',{method:'POST',body:'broken'}))).status,422);
const realFetch=globalThis.fetch;let calls=[];
try{
 globalThis.fetch=async url=>{calls.push(String(url));return new Response('<article><p>A real article fixture.</p></article>',{headers:{'content-type':'text/html'}})};
 const success=await worker.fetch(post('https://example.com/story'));assert.equal(success.status,200);assert.match((await success.json()).html,/article fixture/);
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});assert.equal((await worker.fetch(post('https://example.com'))).status,422);
 globalThis.fetch=async()=>new Response('blocked',{status:403});assert.match((await (await worker.fetch(post('https://example.com'))).json()).error,/did not allow/);
 globalThis.fetch=async()=>new Response('pdf',{headers:{'content-type':'application/pdf'}});assert.equal((await worker.fetch(post('https://example.com'))).status,422);
 globalThis.fetch=async()=>new Response('x'.repeat(6_000_001),{headers:{'content-type':'text/html'}});assert.match((await (await worker.fetch(post('https://example.com'))).json()).error,/too large/);
 let redirects=0;globalThis.fetch=async()=>{redirects++;return new Response(null,{status:302,headers:{location:'https://example.com/again'+redirects}})};assert.equal((await worker.fetch(post('https://example.com'))).status,422);assert.equal(redirects,5);
}finally{globalThis.fetch=realFetch}
console.log('Passed: client script syntax, app response and CSP, URL restrictions, methods, malformed input, article fetch, redirect validation and limit, blocked responses, non-HTML pages, oversized pages.');

// Exercise the actual Vercel entry points without making network requests.
const {isPublicAddress,createPublicFetch,createVercelHandler} = await import('../lib/vercel-article.js');
for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.0.1','100.64.1.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
for(const ip of ['93.184.216.34','1.1.1.1','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true,ip);
const rejectedFetch=createPublicFetch(async()=>[{address:'127.0.0.1',family:4}]);
await assert.rejects(()=>rejectedFetch('https://example.com'),/private or reserved/);
const {EventEmitter}=await import('node:events');const {Readable}=await import('node:stream');let pinned=false;
const transport={request(url, options, onResponse){
 assert.equal(url.hostname,'example.com');assert.equal(options.headers['Accept-Encoding'],'gzip, deflate, br');
 options.lookup(url.hostname,{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);pinned=true});
 const request=new EventEmitter();request.end=()=>{const response=Readable.from([Buffer.from('<article><h1>Vercel article fixture</h1><p>'+('A thoughtful original essay about books and reading in a quiet room. '.repeat(12))+'</p></article>')]);response.statusCode=200;response.headers={'content-type':'text/html'};onResponse(response)};return request;
}};
const publicFetch=createPublicFetch(async()=>[{address:'93.184.216.34',family:4}],{http:transport,https:transport});
const vercelResponse=await createVercelHandler(publicFetch).fetch(post('https://example.com/article'));
assert.equal(vercelResponse.status,200);assert.equal((await vercelResponse.json()).article.title,'Vercel article fixture');assert.equal(pinned,true);
const rootApi=(await import('../../api/article.js')).default;const nestedApi=(await import('../api/article.js')).default;
for(const handler of [rootApi,nestedApi])assert.equal((await handler.fetch(new Request('https://folio.example/api/article'))).status,405);
assert.equal(await readFile('dist/public/index.html','utf8'),html);
for(const [configPath,output] of [['../../vercel.json','folio/dist/public'],['../vercel.json','dist/public']]){
 const config=JSON.parse(await readFile(new URL(configPath,import.meta.url),'utf8'));assert.equal(config.outputDirectory,output);assert.equal(config.functions['api/article.js'].maxDuration,60);assert.equal(config.framework,null);
}
console.log('Passed: static homepage, both Vercel entry points/configurations, API success response, private DNS rejection and pinned public DNS connection.');
await import('../tests/importer.test.mjs');
