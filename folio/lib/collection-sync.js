// Each article (including a deletion tombstone) is merged independently in Redis.
// Atomic comparison prevents concurrent devices from replacing whole collections.
export const mergeScript=`
for i=1,#ARGV,2 do
 local incoming=cjson.decode(ARGV[i+1])
 local old=redis.call('HGET',KEYS[1],ARGV[i])
 if not old or cjson.decode(old).version < incoming.version then
  redis.call('HSET',KEYS[1],ARGV[i],ARGV[i+1])
 end
end
return redis.call('HVALS',KEYS[1])`;
export function validSyncRecord(record){
 return record&&typeof record.id==='string'&&record.id.length>0&&record.id.length<=2048&&/^\d{16}-[a-f0-9]{32}$/.test(record.version)&&
 (record.article===null||(record.article&&record.article.id===record.id&&typeof record.article.title==='string'&&Array.isArray(record.article.body)));
}
export function createCollectionHandler(env={},fetchRedis=fetch){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 return async request=>{
  if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
  const endpoint=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;
  const token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
  if(!endpoint||!token)return reply({error:'Device sync is not configured yet. Your articles are still saved on this device.'},503);
  let records=[];
  if(request.method==='POST'){
   if(Number(request.headers.get('content-length'))>3_000_000)return reply({error:'Sync batch is too large.'},413);
   try{
    let size=0;const chunks=[];const reader=request.body?.getReader();
    if(!reader)return reply({error:'Missing sync data.'},400);
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000){await reader.cancel();return reply({error:'Sync batch is too large.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    records=JSON.parse(new TextDecoder().decode(bytes)).records;
    if(!Array.isArray(records)||records.length>100||!records.every(validSyncRecord))return reply({error:'Invalid sync data.'},400);
   }catch{return reply({error:'Invalid sync data.'},400);}
  }
  try{
   // One collection for this personal deployment. Access follows website access.
   const namespace='other-lives:collection:shared';
   const command=records.length?['EVAL',mergeScript,1,namespace,...records.flatMap(record=>[record.id,JSON.stringify(record)])]:['HVALS',namespace];
   const response=await fetchRedis(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error();const result=await response.json();if(result.error||!Array.isArray(result.result))throw Error();
   return reply({records:result.result.map(value=>JSON.parse(value)).filter(validSyncRecord)});
  }catch{return reply({error:'Sync is temporarily unavailable. Your changes remain on this device.'},503);}
 };
}
export default {fetch:request=>createCollectionHandler(process.env)(request)};
