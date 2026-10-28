// A fixed upstream endpoint: lookups never accept a caller-supplied URL.
export function normaliseDictionaryWord(value){
 if(typeof value!=='string')return '';
 const word=value.normalize('NFKC').trim().replace(/[‘’]/g,"'").replace(/^[“”"'([{]+/u,'').replace(/[“”"')\]},.!?:;]+$/u,'').toLowerCase();
 return word.length<=80&&/^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$/u.test(word)?word:'';
}
function dictionaryLink(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function normaliseDictionaryEntries(data,word){
 if(!Array.isArray(data))return null;
 const tidy=(value,max)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
 const phonetics=new Set(),groups=new Map(),sources=new Set(),licenses=new Map();let headword='';
 for(const entry of data.slice(0,8)){
  if(!entry||typeof entry!=='object')continue;
  headword ||= tidy(entry.word,100);
  for(const item of [{text:entry.phonetic},...(Array.isArray(entry.phonetics)?entry.phonetics:[]).slice(0,8)]){
   const text=tidy(item?.text,160);if(text&&phonetics.size<4)phonetics.add(text);
  }
  for(const meaning of (Array.isArray(entry.meanings)?entry.meanings:[]).slice(0,10)){
   const partOfSpeech=tidy(meaning?.partOfSpeech,60)||'definition';
   if(!groups.has(partOfSpeech)&&groups.size<8)groups.set(partOfSpeech,[]);
   const definitions=groups.get(partOfSpeech);if(!definitions)continue;
   for(const item of (Array.isArray(meaning?.definitions)?meaning.definitions:[]).slice(0,12)){
    const definition=tidy(item?.definition,1200),example=tidy(item?.example,600);
    if(definition&&definitions.length<8&&!definitions.some(item=>item.definition===definition))definitions.push({definition,example});
   }
  }
  for(const source of (Array.isArray(entry.sourceUrls)?entry.sourceUrls:[]).slice(0,6)){const url=dictionaryLink(source);if(url&&sources.size<4)sources.add(url);}
  const license=entry.license,url=dictionaryLink(license?.url),name=tidy(license?.name,100);if(url&&name&&licenses.size<4)licenses.set(url,{name,url});
 }
 const meanings=[...groups].filter(([,definitions])=>definitions.length).map(([partOfSpeech,definitions])=>({partOfSpeech,definitions}));
 return meanings.length?{word:headword||word,phonetics:[...phonetics],meanings,sources:[...sources],licenses:[...licenses.values()],provider:'Free Dictionary API',providerUrl:'https://dictionaryapi.dev/'}:null;
}
async function readDictionaryData(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Empty dictionary response');
 const chunks=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512000){await reader.cancel();throw Error('Dictionary response too large');}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
// Provider markup is converted to inert text, never inserted as HTML.
export function normaliseWiktionaryEntries(data,word){
 const text=value=>typeof value==='string'?value.slice(0,16000).replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
  if(entity[0]!=='#')return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity.toLowerCase()];
  const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'�';
 }):'';
 const meanings=(Array.isArray(data?.en)?data.en:[]).slice(0,10).map(group=>({partOfSpeech:text(group?.partOfSpeech).toLowerCase(),definitions:(Array.isArray(group?.definitions)?group.definitions:[]).slice(0,12).map(item=>({definition:text(item?.definition),example:text(item?.parsedExamples?.[0]?.example||item?.examples?.[0])}))}));
 const entry=normaliseDictionaryEntries([{word,meanings,sourceUrls:['https://en.wiktionary.org/wiki/'+encodeURIComponent(word)+'#English'],license:{name:'CC BY-SA 4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/'}}],word);
 return entry?{...entry,provider:'Wiktionary',providerUrl:'https://en.wiktionary.org/'}:null;
}
export function createDictionaryHandler(fetcher=(...args)=>fetch(...args),now=()=>Date.now()){
 const cache=new Map(),pending=new Map();
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':status===200?'public, max-age=86400':'no-store','x-content-type-options':'nosniff',...(status===405?{allow:'GET'}:{})}});
 async function lookup(word){
  const providers=[['https://api.dictionaryapi.dev/api/v2/entries/en/',normaliseDictionaryEntries],['https://en.wiktionary.org/api/rest_v1/page/definition/',normaliseWiktionaryEntries]];
  let missing=0,lastError;
  for(const [base,normalise] of providers){
   try{
    const response=await fetcher(base+encodeURIComponent(word),{headers:{accept:'application/json','user-agent':'OtherLivesReader/1.0 (English dictionary lookup)'},redirect:'follow',signal:AbortSignal.timeout(5500)});
    if(response.status===404){await response.body?.cancel();missing++;continue;}
    if(!response.ok){await response.body?.cancel();throw Error('Upstream HTTP '+response.status);}
    const entry=normalise(await readDictionaryData(response),word);if(entry)return entry;missing++;
   }catch(error){lastError=error;console.warn('other lives dictionary provider failed',{provider:new URL(base).hostname,reason:error.name==='TimeoutError'?'timeout':error.message});}
  }
  if(missing===providers.length)return null;
  throw lastError||Error('Dictionary unavailable');
 }
 return async request=>{
  if(request.method!=='GET')return reply({error:'Method not allowed.'},405);
  const word=normaliseDictionaryWord(new URL(request.url).searchParams.get('word'));
  if(!word)return reply({error:'Select a single word of up to 80 letters.',code:'invalid_word'},400);
  const cached=cache.get(word);if(cached&&cached.expires>now())return reply(cached.entry);
  try{
   if(!pending.has(word))pending.set(word,lookup(word));
   const promise=pending.get(word);let entry;
   try{entry=await promise;}finally{if(pending.get(word)===promise)pending.delete(word);}
   if(!entry)return reply({error:'No English definition found for this word.',code:'not_found'},404);
   cache.delete(word);cache.set(word,{entry,expires:now()+86400000});while(cache.size>256)cache.delete(cache.keys().next().value);
   return reply(entry);
  }catch(error){return reply({error:'The dictionary is unavailable. Please try again.',code:'dictionary_unavailable'},error.name==='TimeoutError'||error.name==='AbortError'?504:503);}
 };
}
export const handleDictionaryRequest=createDictionaryHandler();
export default {fetch:handleDictionaryRequest};
