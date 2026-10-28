import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/page.html',import.meta.url),'utf8');
const format=vm.runInNewContext('('+source.slice(source.indexOf('function formatArticleDate('),source.indexOf('function createCollectionCard('))+')');
const create=vm.runInNewContext('('+source.slice(source.indexOf('function createArticleEpub('),source.indexOf('function downloadArticleEpub('))+')',{TextEncoder,URL,formatArticleDate:format});
const article={title:'Café & <Quiet> "Essay"',author:'Writer & Co',url:'https://example.com/story?x=1&y=2',published:'2026-10-27T23:00:00-08:00',excerpt:'A short introduction.',body:[['p','Original words',["A ",{tag:'em',children:['quiet']},' sentence. ',{tag:'a',href:'/context',children:['Context']},{tag:'a',href:'javascript:alert(1)',children:['Safe text']}]],['h2','The next chapter'],['p','Literal <script>alert(1)</script> & more.'],['img','https://example.com/photo.jpg']]};
const result=create(article),bytes=Buffer.from(result.bytes),entries=new Map();
assert.ok(result.filename.endsWith('.epub'));assert.ok(!result.filename.includes('<'));assert.ok(result.filename.startsWith('cafe-'));
// Decode the central directory independently from its local-file offsets.
const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);
const count=bytes.readUInt16LE(end+10);assert.equal(count,6);
let index=bytes.readUInt32LE(end+16);
for(let i=0;i<count;i++){
 assert.equal(bytes.readUInt32LE(index),0x02014b50);
 const size=bytes.readUInt32LE(index+24),nameLength=bytes.readUInt16LE(index+28),extra=bytes.readUInt16LE(index+30),comment=bytes.readUInt16LE(index+32),local=bytes.readUInt32LE(index+42);
 const name=bytes.subarray(index+46,index+46+nameLength).toString('utf8');
 assert.equal(bytes.readUInt32LE(local),0x04034b50);assert.equal(bytes.readUInt16LE(local+8),0);
 assert.equal(bytes.readUInt32LE(local+14),bytes.readUInt32LE(index+16));
 const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
 entries.set(name,bytes.subarray(start,start+size).toString('utf8'));
 index+=46+nameLength+extra+comment;
}
assert.equal(index,end);assert.equal(entries.keys().next().value,'mimetype');
assert.equal(bytes.subarray(30,38).toString(),'mimetype');assert.equal(bytes.readUInt16LE(28),0);
assert.equal(entries.get('mimetype'),'application/epub+zip');
assert.match(entries.get('META-INF/container.xml'),/full-path="EPUB\/package.opf"/);
const packageXml=entries.get('EPUB/package.opf'),content=entries.get('EPUB/article.xhtml');
assert.match(packageXml,/<dc:creator>Writer &amp; Co<\/dc:creator>/);assert.match(packageXml,/<dc:date>2026-10-27<\/dc:date>/);
assert.match(packageXml,/properties="nav"/);assert.match(packageXml,/dcterms:modified/);
assert.match(content,/<em>quiet<\/em>/);assert.match(content,/href="https:\/\/example.com\/context"/);
assert.match(content,/<h2>The next chapter<\/h2>/);assert.match(content,/&lt;script&gt;/);
assert.ok(!content.includes('javascript:'));assert.ok(!content.includes('<script>'));assert.ok(!content.includes('photo.jpg'));
assert.match(content,/Café &amp; &lt;Quiet&gt; &quot;Essay&quot;/);
assert.match(entries.get('EPUB/nav.xhtml'),/href="article.xhtml"/);
assert.throws(()=>create({title:'Empty',body:[]}),/no text/);
assert.ok(create({title:'مرحبا',dir:'rtl',body:[['p','نص عربي']]}).bytes.length>0);
console.log('Passed: EPUB archive structure/mimetype, metadata, publication date, navigation, Unicode, text formatting, safe links, escaped markup and image exclusion.');
