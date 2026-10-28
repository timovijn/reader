import { handleDictionaryRequest } from '../lib/dictionary.js';
const page = "__FOLIO_HTML__";
const fonts = "__FOLIO_FONTS__";
const json = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export function importFailure(code,message){return Object.assign(new Error(message),{code});}
export function validateUrl(value) {
 let url;
 try { url=new URL(value); } catch { throw importFailure('invalid_url','Please paste a complete http or https article URL.'); }
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))||!host.includes('.')||host.includes(':')||host.startsWith('[')||/^\d+(\.\d+){3}$/.test(host)||/(^|\.)(localhost|local|internal|test|invalid|home|lan|arpa)$/.test(host)) throw importFailure('invalid_url','Please use a public http or https article URL.');
 url.hash='';return url;
}
async function readPage(response,signal){
 const reader=response.body?.getReader();if(!reader)throw importFailure('empty_page','This website returned an empty page.');
 let size=0;const chunks=[];
 const cancel=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
 while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>6_000_000){await reader.cancel();throw importFailure('page_too_large','This page is too large to open. Try pasting the article text.');}chunks.push(value);}
 signal.throwIfAborted();
 }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const type=response.headers.get('content-type')||'';
 const prefix=new TextDecoder().decode(bytes.subarray(0,2048));
 const charset=type.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]||prefix.match(/<meta[^>]+charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1]||'utf-8';
 try{return new TextDecoder(charset).decode(bytes);}catch{return new TextDecoder().decode(bytes);}
}
export async function handleRequest(request, fetchPage = fetch){
 const path=new URL(request.url).pathname;
 if(path==='/api/dictionary')return handleDictionaryRequest(request);
 if (request.method === 'GET' && Object.hasOwn(fonts, path)) {
   const bytes = Uint8Array.from(atob(fonts[path].data), char => char.charCodeAt(0));
   return new Response(bytes, {headers: {'content-type': fonts[path].type, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff'}});
 }
 if(path==='/'&&request.method==='GET') return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
 if(path!=='/api/article')return new Response('Not found',{status:404});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(Number(request.headers.get('content-length'))>4096)return json({error:'Request too large'},413);
 try{
 const input=await request.text();if(input.length>4096)return json({error:'Request too large'},413);
 let url=validateUrl(JSON.parse(input).url);let response;
 const signal=AbortSignal.timeout(35000);const visited=new Set();
 for(let i=0;i<5;i++){
 if(visited.has(url.href))throw importFailure('redirect_loop','The website redirects in a loop. Try its final article link.');
 visited.add(url.href);
 const options={redirect:'manual',signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; OtherLivesReader/1.0; article reading view)','Accept':'text/html,application/xhtml+xml;q=0.9','Accept-Language':'en;q=0.8,*;q=0.5'}};
 response=await fetchPage(url,options);
 if([502,503,504].includes(response.status)){await response.body?.cancel();response=await fetchPage(url,options);}
 if([301,302,303,307,308].includes(response.status)){
 const location=response.headers.get('location');await response.body?.cancel();if(!location)throw importFailure('bad_redirect','The article redirected without a destination.');
 url=validateUrl(new URL(location,url).href);response=null;continue;
 }break;
 }
 if(!response)throw importFailure('too_many_redirects','This website redirected too many times. Try its final article link.');
 if(!response.ok){
 await response.body?.cancel();
 const errors={401:['sign_in_required','This article requires a sign-in. Open it at the source, then paste text you can access.'],403:['access_denied','This website did not allow other lives to open the article (HTTP 403). Use “Import from an open browser page” below, or paste the article text.'],404:['not_found','This article could not be found. Please check the link.'],429:['rate_limited','This website is limiting requests. Please try again later.']};
 const [code,message]=errors[response.status]||['upstream_error','The website returned an error ('+response.status+'). Please try again later.'];throw importFailure(code,message);
 }
 const type=response.headers.get('content-type')||'';
 if(type&&!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(type)){await response.body?.cancel();throw importFailure('not_html','This link is not a web article. Please use an article page URL.');}
 const html=await readPage(response,signal);
 if(!/<(?:!doctype|html|head|body|article|main|p|div|h1)\b/i.test(html))throw importFailure('not_html','This link does not contain an HTML article.');
 return json({html,url:url.href});
 }catch(error){
 const timedOut=error.name==='TimeoutError'||error.name==='AbortError';
 return json({error:timedOut?'The website took too long to respond. Please try again.':error.code?error.message:'Unable to open this article. Please check the link or paste the article text.',code:timedOut?'timeout':error.code||'import_failed'},422);
 }
}
export default { fetch(request) { return handleRequest(request); } };
