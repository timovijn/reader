import {fileURLToPath} from 'node:url';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
// Resolve inputs from this script, so builds work from either Vercel root.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await mkdir('dist/public',{recursive:true});
const html=await readFile('worker/page.html','utf8');
await mkdir('dist/public/fonts',{recursive:true});
const fonts = {};
for (const style of ['Regular', 'Italic', 'Bold', 'BoldItalic']) {
  const name = `MartinaPlantijn-${style}.otf`;
  const bytes = await readFile(`fonts/${name}`);
  if (bytes.subarray(0,4).toString() !== 'OTTO') throw new Error(`Invalid OpenType font: ${name}`);
  await writeFile(`dist/public/fonts/${name}`, bytes);
  fonts[`/fonts/${name}`] = bytes.toString('base64');
}
const worker=(await readFile('worker/index.js','utf8'))
  .replace('"__FOLIO_HTML__"',JSON.stringify(html))
  .replace('"__FOLIO_FONTS__"',JSON.stringify(fonts));
await writeFile('dist/server/index.js',worker);
await writeFile('dist/public/index.html',html);
// A Vercel checkout does not need a Sites hosting manifest.
try { await copyFile('.openai/hosting.json','dist/.openai/hosting.json'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Folio built: static homepage and Worker bundle.');
