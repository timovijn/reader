import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createCollectionHandler} from '../lib/collection-sync.js';
const env={UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'server-only'};
const buckets=new Map();
const redis=async(url,options)=>{
 assert.equal(url,env.UPSTASH_REDIS_REST_URL);assert.equal(options.headers.authorization,'Bearer server-only');
 const [command,...args]=JSON.parse(options.body);const key=command==='EVAL'?args[2]:args[0];
 if(!buckets.has(key))buckets.set(key,new Map());const bucket=buckets.get(key);
 if(command==='EVAL')for(let i=3;i<args.length;i+=2){const incoming=JSON.parse(args[i+1]),old=bucket.get(args[i]);if(!old||old.version<incoming.version)bucket.set(args[i],incoming);}
 return Response.json({result:[...bucket.values()].map(r=>JSON.stringify(r))});
};
const handler=createCollectionHandler(env,redis);
const request=(method='GET',records,origin)=>new Request('https://reader.example/api/collection',{method,headers:{...(origin?{origin}:{}),'content-type':'application/json'},...(records?{body:JSON.stringify({records})}:{})});
assert.equal((await createCollectionHandler()(request())).status,503);
assert.equal((await handler(request())).status,200);
assert.equal((await handler(request('GET',null,'https://evil.example'))).status,403);
assert.equal((await handler(request('POST',[{}]))).status,400);
assert.equal((await handler(request('DELETE'))).status,405);
const item=id=>({id,title:id,body:[['p','Reading across devices.']],savedAt:1});
const record=(id,n,article=item(id))=>({id,version:String(n).padStart(16,'0')+'-'+ 'a'.repeat(32),article});
assert.equal((await handler(request('POST',[record('one',1)]))).status,200);
await handler(request('POST',[record('two',2)]));
assert.equal((await (await handler(request())).json()).records.length,2);
await handler(request('POST',[record('one',3,null)]));await handler(request('POST',[record('one',1)]));
assert.equal((await (await handler(request())).json()).records.find(r=>r.id==='one').article,null);
assert.equal((await (await handler(request())).json()).records.length,2);
assert.ok(buckets.has('other-lives:collection:shared'));
buckets.clear();
assert.equal((await createCollectionHandler(env,async()=>{throw Error('secret');})(request())).status,503);
// Execute the actual browser sync implementation for two independent devices.
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const client=source.slice(source.indexOf('// Durable local outbox.'),source.indexOf('\n</script>',source.indexOf('// Durable local outbox.')));
function device(articles){
 const data=new Map(),nodes=new Map();
 const context={saved:articles,crypto:webcrypto,TextEncoder,AbortSignal,Map,Date,JSON,Uint8Array,document:{hidden:false,addEventListener(){}},window:{addEventListener(){}},location:{reload(){}},navigator:{},setTimeout(){return 1},clearTimeout(){},setInterval(){},renderCards(){},updateBookmark(){},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});return nodes.get(id)},fetch:async(path,options)=>handler(new Request('https://reader.example'+path,options))};
 vm.createContext(context);vm.runInContext(client,context);
 context.ready=vm.runInContext('initialCollectionSync',context);
 return context;
}
const a=device([item('a')]);await a.ready;const b=device([item('b')]);await b.ready;await a.syncCollection();
const beforeReconnect=JSON.stringify(vm.runInContext('syncState.records',a));await a.syncCollection();assert.equal(JSON.stringify(vm.runInContext('syncState.records',a)),beforeReconnect);
assert.deepEqual(Array.from(a.saved,x=>x.id).sort(),['a','b']);assert.equal(b.saved.length,2);
a.saved=a.saved.filter(x=>x.id!=='a');a.captureSyncChanges();await a.syncCollection();
b.saved=b.saved.map(x=>x.id==='b'?{...x,readAt:123}:x);b.captureSyncChanges();await b.syncCollection();await a.syncCollection();
assert.deepEqual(Array.from(b.saved,x=>x.id),['b']);assert.equal(a.saved[0].readAt,123);
// Offline changes survive browser restart and retry.
a.fetch=async()=>{throw Error('offline')};a.saved.push(item('offline'));a.captureSyncChanges();await a.syncCollection();assert.equal(a.saved.length,2);
a.fetch=async(path,options)=>handler(new Request('https://reader.example'+path,options));await a.syncCollection();await b.syncCollection();assert.equal(b.saved.length,2);
console.log('Passed: automatic shared sync without a key, origin checks, configuration/errors, independent additions, deletion tombstones, stale-device reconnect, Read status and offline retry using the actual browser client.');
