import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const html=await readFile('worker/page.html','utf8');
const worker=(await readFile('worker/index.js','utf8')).replace('"__FOLIO_HTML__"',JSON.stringify(html));
await writeFile('dist/server/index.js',worker);await copyFile('.openai/hosting.json','dist/.openai/hosting.json');console.log('Folio built.');
