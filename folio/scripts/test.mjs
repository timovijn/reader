import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
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
 globalThis.fetch=async()=>new Response('x'.repeat(3_000_001),{headers:{'content-type':'text/html'}});assert.match((await (await worker.fetch(post('https://example.com'))).json()).error,/too large/);
 let redirects=0;globalThis.fetch=async()=>{redirects++;return new Response(null,{status:302,headers:{location:'https://example.com/again'}})};assert.equal((await worker.fetch(post('https://example.com'))).status,422);assert.equal(redirects,5);
}finally{globalThis.fetch=realFetch}
console.log('Passed: client script syntax, app response and CSP, URL restrictions, methods, malformed input, article fetch, redirect validation and limit, blocked responses, non-HTML pages, oversized pages.');
