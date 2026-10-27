import articleHandler from '../lib/vercel-article.js';
import {fileURLToPath} from 'node:url';
import http from 'node:http';import {readFile} from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const source=await readFile('dist/server/index.js','utf8');const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const response=await (req.url.split('?')[0]==='/api/article'?articleHandler:worker).fetch(new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview error');}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
