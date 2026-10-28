import {parse} from '../vendor/parse5/dist/index.js';
import {assignedData} from './nyt-extractor.js';
import {isMediaCaption} from './article-boundaries.js';

const normalise=value=>String(value||'').replace(/\s+/g,' ').trim();
const skip=new Set(['script','style','aside','nav','footer','form','button','img','picture','figcaption','svg','iframe']);
const isCaption=node=>isMediaCaption((node.attrs||[]).filter(attr=>['class','id'].includes(attr.name)).map(attr=>attr.value).join(' '),node.attrs?.find(attr=>attr.name==='itemprop')?.value);

// Nuxt 3 serializes an indexed table rather than an ordinary object tree.
// Decode only data/reference wrappers, with bounded work and cycle detection.
function nuxtState(table){
  if(!Array.isArray(table)||table.length>12000)return null;
  const cache=new Map(),active=new Set();let visits=0;
  function resolve(index,depth=0){
    if(!Number.isInteger(index)||index<0||index>=table.length||depth>24||++visits>24000)return null;
    if(cache.has(index))return cache.get(index);
    if(active.has(index))return null;
    active.add(index);const value=table[index];let result=value;
    if(Array.isArray(value)){
      if(['Reactive','ShallowReactive','Ref','ShallowRef'].includes(value[0]))result=resolve(value[1],depth+1);
      else if(typeof value[0]==='string')result=null; // Unsupported tagged value.
      else result=value.slice(0,200).map(ref=>resolve(ref,depth+1));
    }else if(value&&typeof value==='object'){
      result=Object.create(null);
      for(const [key,ref] of Object.entries(value).slice(0,1000))result[key]=resolve(ref,depth+1);
    }
    active.delete(index);cache.set(index,result);return result;
  }
  return resolve(0);
}

// Parse inert fragments, collecting prose only. Do not concatenate each inline
// text node as a separate paragraph or include media captions and script text.
export function proseBlocks(value){
  if(typeof value!=='string'||value.length>2_000_000)return [];
  if(!/<[a-z][\s\S]*>/i.test(value))return value.split(/\n+/).map(normalise).filter(Boolean).map(text=>['p',text]);
  const blocks=[];let visited=0;
  function text(node,depth=0){
    if(depth>80||++visited>40000||skip.has(node.tagName)||isCaption(node))return '';
    if(node.nodeName==='#text')return node.value;
    if(node.tagName==='br')return '\n';
    return (node.childNodes||[]).map(n=>text(n,depth+1)).join('');
  }
  function collect(node,depth=0){
    if(depth>80||++visited>40000||skip.has(node.tagName)||isCaption(node))return;
    if(['p','h2','h3','blockquote','pre','li'].includes(node.tagName)){
      const value=normalise(text(node));if(value)blocks.push([node.tagName==='li'?'p':node.tagName,value]);return;
    }
    for(const child of node.childNodes||[])collect(child,depth+1);
  }
  const doc=parse(value);collect(doc);
  if(!blocks.length){const value=normalise(text(doc));if(value)blocks.push(['p',value]);}
  return blocks;
}

export function embeddedArticleCandidates(nodes,base,title){
  const candidates=[];let inspected=0;
  const requested=new URL(base),wanted=normalise(title).toLowerCase();
  const excluded=/recommend|related|comment|navigation|menu|advert|caption|image|video|footer|sidebar/i;
  function inspect(item,path,depth=0){
    if(!item||typeof item!=='object'||depth>24||++inspected>12000)return;
    if(Array.isArray(item)){for(const child of item.slice(0,200))inspect(child,path,depth+1);return;}
    if(item.isAccessibleForFree===false||/^false$/i.test(String(item.isAccessibleForFree)))return;
    const label=normalise(item.headline?.default||item.headline||item.title||item.name).toLowerCase();
    const url=typeof item.url==='string'?item.url:typeof item.canonicalUrl==='string'?item.canonicalUrl:null;
    let matchingUrl=false,mismatchedUrl=false;
    if(url){try{const target=new URL(url,base);matchingUrl=target.hostname===requested.hostname&&target.pathname===requested.pathname;mismatchedUrl=!matchingUrl;}catch{mismatchedUrl=true;}}
    const matchingTitle=label&&wanted&&label===wanted;
    const articleScope=/(?:^|\.)(?:article|story|post|entry)(?:\.|$)/i.test(path)||/^(?:NewsArticle|Article|BlogPosting)$/i.test(item['@type']||item.__typename||'');
    if(articleScope&&(mismatchedUrl||(label&&!matchingTitle&&!matchingUrl)))return;
    // Require identity evidence or a named article object, never arbitrary text
    // found somewhere in the application cache. Reject other stories by URL/title.
    if(!mismatchedUrl&&(!label||matchingTitle||matchingUrl)&&(matchingTitle||matchingUrl||articleScope)){
      const restricted=item.isAccessibleForFree===false||/^false$/i.test(String(item.isAccessibleForFree));
      if(!restricted){
        for(const key of ['articleBody','body','content','html']){
          const field=item[key];
          const value=typeof field==='string'?field:typeof field?.rendered==='string'?field.rendered:typeof field?.html==='string'?field.html:null;
          if(!value)continue;
          const blocks=proseBlocks(value);
          if(blocks.length)candidates.push({method:'embedded-data',blocks});
        }
      }
    }
    for(const [key,value] of Object.entries(item))if(!excluded.test(key)&&!['articleBody','html'].includes(key))inspect(value,path+'.'+key,depth+1);
  }
  for(const node of nodes){
    if(inspected>12000||node.tagName!=='script')continue;
    const source=(node.childNodes||[]).map(n=>n.value||'').join('');
    const attr=name=>node.attrs?.find(a=>a.name===name)?.value||'';
    let state;
    try{
      if(/^application\/(?:ld\+)?json\b/i.test(attr('type')))state=JSON.parse(source);
      else for(const name of ['__NEXT_DATA__','__NUXT__','__APOLLO_STATE__','__INITIAL_STATE__']){state=assignedData(source,name);if(state)break;}
      if(attr('id')==='__NUXT_DATA__'&&Array.isArray(state))state=nuxtState(state);
    }catch{continue;}
    if(state)inspect(state,'state');
  }
  return candidates;
}

export function chooseArticleCandidate(candidates){
  const metrics=candidate=>{
    const texts=candidate.blocks.map(block=>normalise(block[1])).filter(Boolean);
    const unique=[...new Set(texts)];
    const characters=unique.reduce((sum,text)=>sum+text.length,0);
    const prose=unique.filter(text=>text.length>=80).reduce((sum,text)=>sum+text.length,0);
    return {characters,score:prose+characters*.15};
  };
  let best=candidates[0],quality=metrics(best);
  for(const candidate of candidates.slice(1)){
    const next=metrics(candidate);
    // Prefer the formatted HTML when candidates are similar; avoid replacing it
    // with duplicated cache content or a collection of short interface labels.
    if(next.characters>=180&&(quality.characters<180||next.score>quality.score*1.3)){
      best=candidate;quality=next;
    }
  }
  return best;
}
