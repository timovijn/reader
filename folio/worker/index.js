const page = "__FOLIO_HTML__";
const fonts = "__FOLIO_FONTS__";
const json = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export function validateUrl(value) {
 const url=new URL(value); const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))||!host.includes('.')||host.includes(':')||host.startsWith('[')||/^\d+(\.\d+){3}$/.test(host)||/(^|\.)(localhost|local|internal|test|invalid|home|lan|arpa)$/.test(host)) throw Error('Please use a public http or https article URL.');
 return url;
}
export async function handleRequest(request, fetchPage = fetch){
 const path=new URL(request.url).pathname;
 if (request.method === 'GET' && Object.hasOwn(fonts, path)) {
   const bytes = Uint8Array.from(atob(fonts[path]), char => char.charCodeAt(0));
   return new Response(bytes, {headers: {'content-type': 'font/otf', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff'}});
 }
 if(path==='/'&&request.method==='GET') return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
 if(path!=='/api/article')return new Response('Not found',{status:404});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(Number(request.headers.get('content-length'))>4096)return json({error:'Request too large'},413);
 try{
 const input=await request.text();if(input.length>4096)return json({error:'Request too large'},413);
 let url=validateUrl(JSON.parse(input).url);let response;
 for(let i=0;i<5;i++){
 response=await fetchPage(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'FolioReader/1.0 (article reading view)','Accept':'text/html,application/xhtml+xml'}});
 if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('The article redirected without a destination.');url=validateUrl(new URL(location,url).href);continue;}break;
 }
 if(!response||!response.ok)throw Error('This website did not allow Folio to open the article. You can paste the article text instead.');
 if(!/(text\/html|application\/xhtml\+xml)/i.test(response.headers.get('content-type')||''))throw Error('This link is not a web article. Please use an article page URL.');
 const reader=response.body.getReader();let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_000_000){await reader.cancel();throw Error('This page is too large to open. Try pasting the article text.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return json({html:new TextDecoder().decode(bytes),url:url.href});
 }catch(error){return json({error:error.name==='TimeoutError'?'The website took too long to respond. Please try again.':error.message||'Unable to open this article.'},422);}
}
export default { fetch(request) { return handleRequest(request); } };
