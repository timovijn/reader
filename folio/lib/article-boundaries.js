// Component labels and local block context supplement the article-container
// scorer. Publishers often put recommendations and sign-up forms inside prose.
const component = /(?:^|[-_])(?:image[-_]caption|image[-_]description|photo[-_]caption|newsletter|related[-_](?:posts?|articles?|stories)|recommended[-_](?:posts?|articles?|stories)|author[-_](?:bio|profile)|social[-_]share|share[-_]buttons|post[-_]navigation)(?:$|[-_])/i;

export function isAncillaryComponent(label){
  return String(label).split(/\s+/).some(token=>component.test(token));
}

function linkedCharacters(parts){
  let total=0;
  for(const part of parts||[]){
    if(typeof part==='string')continue;
    if(part.tag==='a')total+=plainText(part.children).length;
    else total+=linkedCharacters(part.children);
  }
  return total;
}
function plainText(parts){
  return (parts||[]).map(part=>typeof part==='string'?part:plainText(part.children)).join('');
}
const normalise=text=>String(text||'').replace(/\s+/g,' ').trim();
const relatedHeading=/^(?:(?:plus[,\s]+)?(?:check out|read|see) (?:the )?following (?:pieces|articles|stories)|(?:related|recommended) (?:reading|articles|stories|posts)|(?:read|up) next|you (?:may|might) also like|more (?:from|on) .{1,100})[.!:]?$/i;
const newsletterPrompt=/^(?:if you[’']?d like to read more[^.!?]{0,160},?\s*)?(?:sign up|subscribe|join)\b[^.!?]{0,220}\bnewsletter[.!]?$/i;

export function cleanArticleBlocks(blocks){
  const remove=new Set();
  const linkOnly=block=>{
    const text=normalise(block[1]);
    return text.length>0&&linkedCharacters(block[2])/text.length>=.8;
  };
  for(let i=0;i<blocks.length;i++){
    const [tag,text]=blocks[i];const value=normalise(text);
    // Match standalone calls to action, never a sentence merely mentioning a
    // newsletter. Quotes, code and article headings retain their original text.
    if(tag==='p'&&value.length<=320&&newsletterPrompt.test(value)){remove.add(i);continue;}
    if(!['p','h2','h3'].includes(tag)||value.length>150||!relatedHeading.test(value))continue;
    // A label alone is insufficient: require an immediately following run of
    // linked recommendations. Resume at the next normal article paragraph.
    let end=i+1;
    while(end<blocks.length&&(remove.has(end)||linkOnly(blocks[end])))end++;
    if(end>i+1){for(let j=i;j<end;j++)remove.add(j);i=end-1;}
  }
  return blocks.filter((_,i)=>!remove.has(i));
}
