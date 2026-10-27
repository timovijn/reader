// Read data already included in the document; never execute publisher JavaScript.
export function assignedData(source,name='__preloadedData'){
  if(!['__preloadedData','__NEXT_DATA__','__NUXT__','__APOLLO_STATE__','__INITIAL_STATE__'].includes(name))return null;
  const match=new RegExp('^\\s*(?:window\\.)?'+name+'\\s*=\\s*(?=\\{)').exec(source);
  if(!match)return null;
  let depth=0,quoted=false,escaped=false,json='';
  for(let i=match[0].length;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"')quoted=false;
    }else{
      if(char==='"')quoted=true;
      else if(char==='{')depth++;
      else if(char==='}')depth--;
      // Times serializes some absent fields as undefined, outside JSON strings.
      else if(source.slice(i,i+9)==='undefined'&&/[:,\[]\s*$/.test(json)&&/^\s*[,}\]]/.test(source.slice(i+9))){json+='null';i+=8;continue;}
    }
    json+=char;
    if(depth===0){try{return JSON.parse(json);}catch{return null;}}
  }
  return null;
}

export function nytArticleBlocks(nodes,base){
  const requested=new URL(base);
  if(!/(^|\.)nytimes\.com$/.test(requested.hostname))return [];
  for(const node of nodes){
    if(node.tagName!=='script')continue;
    const source=(node.childNodes||[]).map(n=>n.value||'').join('');
    const article=assignedData(source)?.loaderData?.data?.article;
    if(!article)continue;
    if(article.url){try{if(new URL(article.url,base).pathname!==requested.pathname)continue;}catch{continue;}}
    const content=article.sprinkledBody?.content;
    if(!Array.isArray(content))continue;
    const blocks=[];
    for(const block of content.slice(0,10000)){
      const type={ParagraphBlock:'p',Heading2Block:'h2',Heading3Block:'h3',BlockquoteBlock:'blockquote'}[block?.__typename];
      if(!type||!Array.isArray(block.content))continue;
      const parts=[];
      for(const item of block.content.slice(0,10000)){
        if(item?.__typename!=='TextInline'||typeof item.text!=='string')continue;
        let part=item.text;
        for(const format of (Array.isArray(item.formats)?item.formats:[]).slice(0,20)){
          const tag={ItalicFormat:'em',BoldFormat:'strong',EmphasisFormat:'em',StrongFormat:'strong'}[format?.__typename];
          if(tag)part={tag,children:[part]};
          else if(format?.__typename==='LinkFormat'&&typeof format.url==='string'){
            try{const url=new URL(format.url,base);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)part={tag:'a',href:url.href,children:[part]};}catch{/* Retain the link's text. */}
          }
        }
        parts.push(part);
      }
      const text=block.content.filter(item=>item?.__typename==='TextInline'&&typeof item.text==='string').map(item=>item.text).join('').replace(/\s+/g,' ').trim();
      if(text)blocks.push([type,text,parts]);
    }
    if(blocks.length)return blocks;
  }
  return [];
}
