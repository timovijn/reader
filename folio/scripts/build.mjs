import {fileURLToPath} from 'node:url';
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
// Resolve inputs from this script, so builds work from either Vercel root.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await mkdir('dist/public',{recursive:true});
const html=await readFile('worker/page.html','utf8');
await mkdir('dist/public/fonts',{recursive:true});
const fonts = {};
for (const family of ['MartinaPlantijn', 'Shinka']) {
  for (const name of await readdir(`fonts/${family}`)) {
    if (!/\.(otf|woff2)$/.test(name)) continue;
    const bytes = await readFile(`fonts/${family}/${name}`);
    const signature = name.endsWith('.woff2') ? 'wOF2' : 'OTTO';
    if (bytes.subarray(0,4).toString() !== signature) throw new Error(`Invalid font: ${name}`);
    await writeFile(`dist/public/fonts/${name}`, bytes);
    fonts[`/fonts/${name}`] = { data: bytes.toString('base64'), type: name.endsWith('.woff2') ? 'font/woff2' : 'font/otf' };
  }
}
const worker=(await readFile('worker/index.js','utf8'))
  .replace('"__FOLIO_HTML__"',JSON.stringify(html))
  .replace('"__FOLIO_FONTS__"',JSON.stringify(fonts));
await writeFile('dist/server/index.js',worker);
await writeFile('dist/public/index.html',html);
// A Vercel checkout does not need a Sites hosting manifest.
try { await copyFile('.openai/hosting.json','dist/.openai/hosting.json'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('other lives built: static homepage and Worker bundle.');
