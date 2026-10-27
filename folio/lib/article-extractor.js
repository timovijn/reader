import { parse } from '../vendor/parse5/dist/index.js';
import { importFailure } from '../worker/index.js';
import { nytArticleBlocks } from './nyt-extractor.js';

const normalise = value => String(value||'').replace(/\s+/g,' ').trim();
const attr = (node,name) => node.attrs?.find(item=>item.name===name)?.value || '';
const tag = node => node.tagName || '';
const positive = /(^|[\s_-])(entry-content|post-content|article-body|article-content|story-body|story-content|body-copy|content-body|post-body|articlebody)([\s_-]|$)/i;
// Match an ancillary component's own name, not layout flags like no-sidebar
// or has-footer. A page's ancestor must never disappear from a substring hit.
const negative = /^(nav|menu|sidebar|footer|comments?|related|recommended|newsletter|advertisement|advert|social|share-buttons|cookie|promo|paywall|subscription-wall)(?:[-_]|$)/i;
const ignored = new Set(['script','style','nav','footer','aside','form','button','input','iframe','svg','noscript','dialog','template','select','canvas','img','picture','source','figcaption']);
const blockTags = new Set(['p','h2','h3','h4','h5','h6','blockquote','pre','li','img','figcaption','hr']);
const inlineTags = { em:'em',i:'em',strong:'strong',b:'strong',code:'code',sup:'sup',sub:'sub',s:'s',del:'s',a:'a',br:'br' };

function safeUrl(value,base){
  if(!value)return null;
  try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function excluded(node,articleAncestors,publisherProse){
  const name=tag(node);if(ignored.has(name))return true;
  if(name==='body')return false;
  if(attr(node,'aria-hidden')==='true'||node.attrs?.some(a=>a.name==='hidden'))return true;
  if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node,'style')))return true;
  if(['navigation','dialog','complementary'].includes(attr(node,'role')))return true;
  const label=attr(node,'class')+' '+attr(node,'id');
  if(['main','article'].includes(name)||attr(node,'role')==='main'||attr(node,'itemprop')==='articleBody'||articleAncestors?.has(node))return false;
  if(publisherProse?.has(node))return false;
  return label.split(/\s+/).some(token=>negative.test(token))&&!positive.test(label);
}
function walk(root,filter=()=>true){
  const result=[];const stack=[root];while(stack.length){const node=stack.pop();if(!filter(node))continue;result.push(node);if(result.length>80000)throw importFailure('page_too_complex','This page is too complex to extract. Try pasting the article text.');const children=node.childNodes||[];for(let i=children.length-1;i>=0;i--)stack.push(children[i]);}return result;
}
function jsonArticles(nodes){
  const result=[];
  for(const node of nodes){
    if(tag(node)!=='script'||!/^application\/ld\+json\b/i.test(attr(node,'type')))continue;
    try{
      const value=JSON.parse((node.childNodes||[]).map(n=>n.value||'').join(''));
      const queue=Array.isArray(value)?[...value]:[value];let count=0;
      while(queue.length&&count++<500){const item=queue.shift();if(!item||typeof item!=='object')continue;
        const types=Array.isArray(item['@type'])?item['@type']:[item['@type']];
        if(types.some(type=>/^(Article|NewsArticle|BlogPosting|Report|Review|ScholarlyArticle|TechArticle)$/i.test(type)))result.push(item);
        for(const key of ['@graph','mainEntity','hasPart']){const child=item[key];if(child)queue.push(...(Array.isArray(child)?child:[child]));}
      }
    }catch{/* Invalid publisher metadata should not break a readable page. */}
  }
  return result;
}

export function extractArticle(html,url){
  const base=safeUrl(url);if(!base)throw importFailure('invalid_url','Please use a public article URL.');
  const doc=parse(html);const all=walk(doc);const structured=jsonArticles(all);
  const metadata=Object.create(null);
  for(const node of all)if(tag(node)==='meta')metadata[(attr(node,'property')||attr(node,'name')).toLowerCase()]=attr(node,'content');
  const rawText=node=>normalise(walk(node).filter(n=>n.nodeName==='#text').map(n=>n.value).join(' '));
  const heading=all.find(n=>tag(n)==='h1'&&!excluded(n));
  const schema=structured.find(item=>typeof item.headline==='string')||structured[0]||{};
  const title=normalise(metadata['og:title']||schema.headline||(heading&&rawText(heading))||rawText(all.find(n=>tag(n)==='title')||{} )||'Untitled article').slice(0,500);
  const authorValue=metadata.author||metadata['article:author']||schema.author;
  const author=normalise(typeof authorValue==='string'?authorValue:Array.isArray(authorValue)?authorValue.map(a=>typeof a==='string'?a:a.name).join(', '):authorValue?.name||rawText(all.find(n=>attr(n,'rel').split(/\s+/).includes('author'))||{})).slice(0,250);
  const excerpt=normalise(metadata.description||metadata['og:description']||schema.description).slice(0,500);
  const published=normalise(metadata['article:published_time']||schema.datePublished).slice(0,100);
  const siteName=normalise(metadata['og:site_name']||schema.publisher?.name||new URL(base).hostname.replace(/^www\./,'')).slice(0,150);
  const body=all.find(n=>tag(n)==='body')||doc;
  if(/^(just a moment[.!…]*|access denied|verify (?:that )?you are human|attention required(?:!|.*cloudflare)?)$/i.test(title))throw importFailure('bot_protection','This website requires browser verification. Open it at the source, then paste the article text.');
  // Preserve outer layout containers around explicitly marked article prose.
  // Filtering remains strict for sibling comments, menus and recommendations.
  const articleAncestors=new WeakSet();
  for(const node of all){
    if(!['main','article'].includes(tag(node))&&attr(node,'role')!=='main'&&attr(node,'itemprop')!=='articleBody'&&!positive.test(attr(node,'class')+' '+attr(node,'id')))continue;
    let parent=node.parentNode;
    while(parent&&!articleAncestors.has(parent)){articleAncestors.add(parent);parent=parent.parentNode;}
  }
  // New Yorker uses `paywall` on article paragraphs as well as interface UI.
  // Only preserve paragraphs in its actual body containers; banners, hidden
  // content and other publishers retain the normal exclusion rules.
  const publisherProse=new WeakSet();
  if(/(^|\.)newyorker\.com$/.test(new URL(base).hostname)){
    for(const node of all){
      if(tag(node)!=='p'||!attr(node,'class').split(/\s+/).includes('paywall'))continue;
      for(let parent=node.parentNode;parent;parent=parent.parentNode){
        if(attr(parent,'class').split(/\s+/).includes('article__body')){publisherProse.add(node);break;}
      }
    }
  }
  const clean=walk(body,n=>!excluded(n,articleAncestors,publisherProse));const cleanSet=new Set(clean);
  const stats=new WeakMap();
  for(let i=clean.length-1;i>=0;i--){const node=clean[i];if(node.nodeName==='#text'){const length=normalise(node.value).length;stats.set(node,{length,links:0,paragraphs:0,score:0});continue;}
    const children=(node.childNodes||[]).filter(n=>cleanSet.has(n));
    const values=children.map(n=>stats.get(n)).filter(Boolean);
    const length=values.reduce((s,v)=>s+v.length,0);
    const links=tag(node)==='a'?length:values.reduce((s,v)=>s+v.links,0);
    const isParagraph=['p','pre','blockquote'].includes(tag(node));
    const paragraphs=values.reduce((s,v)=>s+v.paragraphs,0)+(isParagraph&&length>=40?1:0);
    const paragraphScore=isParagraph&&length>=40?Math.min(length,1600)*(1-Math.min(1,links/Math.max(1,length))):0;
    stats.set(node,{length,links,paragraphs,score:values.reduce((s,v)=>s+v.score,0)+paragraphScore});
  }
  const candidates=clean.filter(n=>['article','main','section','div','td','body'].includes(tag(n))||attr(n,'role')==='main'||attr(n,'itemprop')==='articleBody');
  let root=null,best=0;
  for(const node of candidates){const st=stats.get(node);if(!st||st.length<160)continue;const classes=attr(node,'class')+' '+attr(node,'id');
    const semantic=positive.test(classes)||attr(node,'itemprop')==='articleBody'?1.55:tag(node)==='article'?1.25:tag(node)==='main'||attr(node,'role')==='main'?1.08:1;
    const density=st.links/Math.max(1,st.length);
    // Text-heavy paragraphs beat containers dominated by menus or card links.
    const score=(st.score||st.length*.45)*semantic*(1-Math.min(.95,density))* (tag(node)==='body'?.8:1);
    if(score>best||(score===best&&st.length<(stats.get(root)?.length||Infinity))){best=score;root=node;}
  }
  const blocks=[];
  function inline(node,depth=0){
    if(depth>100||!cleanSet.has(node))return [];
    if(node.nodeName==='#text')return [node.value];
    if(tag(node)==='img')return [];
    const children=(node.childNodes||[]).flatMap(child=>inline(child,depth+1));
    const type=inlineTags[tag(node)];if(!type)return children;
    if(type==='br')return [{tag:'br'}];
    if(type==='a'){const href=safeUrl(attr(node,'href'),base);return href?[{tag:'a',href,children}]:children;}
    return [{tag:type,children}];
  }
  function textOf(nodes){return nodes.map(n=>typeof n==='string'?n:n.tag==='br'?'\n':textOf(n.children||[])).join('');}
  function add(node,depth=0){
    if(depth>100||!cleanSet.has(node))return;
    const name=tag(node);
    if(name==='hr'){blocks.push(['p','* * *']);return;}
    if(blockTags.has(name)){
      if(name==='li'&&(node.childNodes||[]).some(n=>['ol','ul'].includes(tag(n)))){
        const children=(node.childNodes||[]).filter(n=>!['ol','ul'].includes(tag(n))).flatMap(n=>inline(n));const text=normalise(textOf(children));if(text)blocks.push(['p','• '+text,['• ',...children]]);
        (node.childNodes||[]).filter(n=>['ol','ul'].includes(tag(n))).forEach(n=>add(n,depth+1));return;
      }
      const parts=inline(node);let text=name==='pre'?textOf(parts):normalise(textOf(parts));if(!text||text===title)return;
      let output=['h4','h5','h6'].includes(name)?'h3':name==='figcaption'?'p':name;
      if(name==='li'){const ordered=tag(node.parentNode)==='ol';const siblings=(node.parentNode?.childNodes||[]).filter(n=>tag(n)==='li');const prefix=ordered?String((Number(attr(node.parentNode,'start'))||1)+siblings.indexOf(node))+'. ':'• ';text=prefix+text;parts.unshift(prefix);output='p';}
      blocks.push([output,text,parts]);
      return;
    }
    const children=(node.childNodes||[]).filter(n=>cleanSet.has(n));
    // Some publishers put their prose directly in divs rather than paragraphs.
    if(name==='div'&&!children.some(n=>n.tagName&&(!inlineTags[tag(n)]||tag(n)==='img'))){const parts=inline(node);const text=normalise(textOf(parts));if(text.length>40){blocks.push(['p',text,parts]);return;}}
    children.forEach(n=>add(n,depth+1));
  }
  if(root)add(root);
  let method='html';
  const characterCount=()=>blocks.filter(b=>b[0]!=='img').reduce((s,b)=>s+b[1].length,0);
  {
    // Use only Article bodies explicitly marked public or without a restriction.
    // A schema declaring paid access is never used to fill missing page content.
    const item=structured.filter(item=>typeof item.articleBody==='string'&&item.isAccessibleForFree!==false&&item.isAccessibleForFree!=='False'&&item.isAccessibleForFree!=='false').sort((a,b)=>b.articleBody.length-a.articleBody.length)[0];
    if(item?.articleBody?.length>=180){const fragment=parse('<article>'+item.articleBody+'</article>');
      // Structured bodies may be prose or HTML; parsing decodes entities without
      // running scripts. Emit text-only paragraphs on this fallback path.
      const text=walk(fragment,n=>!ignored.has(tag(n))).filter(n=>n.nodeName==='#text').map(n=>n.value).join('\n');
      const parts=text.split(/\n\s*\n|\n/).map(normalise).filter(Boolean);
      const structuredCharacters=parts.reduce((sum,part)=>sum+part.length,0);
      // Keep rich HTML unless public structured prose is substantially longer.
      if(characterCount()<180||structuredCharacters>characterCount()*1.5){
        blocks.length=0;for(const part of parts)blocks.push(['p',part]);method='structured-data';
      }
    }
  }
  const publisherBlocks=nytArticleBlocks(all,base);
  if(publisherBlocks.reduce((sum,block)=>sum+block[1].length,0)>Math.max(180,characterCount()*1.5)){
    blocks.length=0;blocks.push(...publisherBlocks);method='publisher-data';
  }
  if(characterCount()<180){
    const text=normalise(rawText(body)).slice(0,12000);
    const blocked=/verify you are human|checking your browser|just a moment|enable javascript and cookies|captcha|access denied/i.test(text);
    const restricted=/subscribe to (continue|read)|sign in to (continue|read)|already a subscriber|subscription required/i.test(text);
    const error=importFailure(blocked?'bot_protection':restricted?'sign_in_required':'no_article',blocked?'This website requires browser verification. Open it at the source, then paste the article text.':restricted?'This article requires a subscription or sign-in. Paste text you can access from the source.':'Folio could not find enough article text on this page. It may load with JavaScript; try pasting its text.');
    error.diagnostics={paragraphsFound:all.filter(n=>tag(n)==='p').length,paragraphsKept:clean.filter(n=>tag(n)==='p').length,cleanTextCharacters:stats.get(body)?.length||0,extractedCharacters:characterCount(),candidateCount:candidates.length};
    throw error;
  }
  const text=blocks.filter(b=>b[0]!=='img').map(b=>b[1]).join(' ');
  const wordCount=text.split(/\s+/).filter(Boolean).length;
  const declaredWordCount=Number(String(schema.wordCount||'').replace(/,/g,''));
  const restricted=schema.isAccessibleForFree===false||/^false$/i.test(String(schema.isAccessibleForFree));
  const subscriptionPrompt=/subscribe to (?:continue|read)|sign in to (?:continue|read)|subscription required/i.test(rawText(body));
  // Paid metadata alone does not imply truncation: full HTML can still be present.
  // Require a substantial, publisher-declared length discrepancy as evidence.
  if((restricted||subscriptionPrompt)&&Number.isFinite(declaredWordCount)&&declaredWordCount>=600&&wordCount<declaredWordCount*.35){
    const error=importFailure('incomplete_article','This website returned only an article preview. Folio could not retrieve the full text. Import text you can access from the source.');
    error.diagnostics={extractedWords:wordCount,declaredWords:declaredWordCount,method};throw error;
  }
  const direction=attr(all.find(n=>tag(n)==='html')||{},'dir');
  return {id:base,url:base,title,author,excerpt,siteName,published,body:blocks,minutes:Math.max(1,Math.ceil(wordCount/230)),wordCount,category:'From the web',extraction:{method},dir:['rtl','ltr'].includes(direction)?direction:'auto'};
}
