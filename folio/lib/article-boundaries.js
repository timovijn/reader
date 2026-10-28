// Component labels and local block context supplement the article-container
// scorer. Publishers often put recommendations and sign-up forms inside prose.
const component = /(?:^|[-_])(?:image[-_]caption|image[-_]description|photo[-_]caption|newsletter|related[-_](?:posts?|articles?|stories)|recommended[-_](?:posts?|articles?|stories)|author[-_](?:bio|profile)|social[-_]share|share[-_]buttons|post[-_]navigation)(?:$|[-_])/i;

export function isMediaCaption(label,itemprop=''){
  const tokens=String(label||'').replace(/([a-z\d])([A-Z])/g,'$1-$2').split(/\s+/);
  return String(itemprop).split(/\s+/).includes('caption')||tokens.some(token=>/(?:^|[-_])(?:caption|(?:image|photo|picture|figure|media)[-_](?:description|credit))(?:$|[-_])/i.test(token));
}

export function isAncillaryComponent(label){
  return isMediaCaption(label)||String(label).split(/\s+/).some(token=>component.test(token));
}

// One conservative, publisher-independent classifier for all import paths.
// Decisions expose structural/metadata evidence without storing article text.
export function analyseArticleBlocks(blocks,context={}){
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

  const remove=new Set(),decisions=new Map();
  function discard(index,role,evidence){remove.add(index);decisions.set(index,{index,role,evidence});}
  const separator=block=>block?.[0]==='p'&&/^(?:\*\s*){3,}$|^(?:[-–—]\s*){3,}$|^(?:•\s*){3,}$/.test(normalise(block[1]));
  const newsletterThanks=/^(?:thanks|thank you) for reading\b[^!?]{0,200}\bnewsletter[.!]?$/i;
  const identity=normalise(context.author).normalize('NFKC').toLowerCase();
  const authorBio=value=>{
    const text=value.normalize('NFKC').toLowerCase();
    if(!identity||!text.startsWith(identity+' is '))return false;
    return /^is (?:an?|the) (?:[\p{L}-]+\s+){0,3}(?:editor|writer|author|journalist|reporter|contributor|columnist|researcher|professor|fellow)\b[^!?]{0,220}[.!]?$/iu.test(text.slice(identity.length+1));
  };
  const linkOnly=block=>{
    const text=normalise(block[1]);
    return text.length>0&&linkedCharacters(block[2])/text.length>=.8;
  };
  const subscriptionLink=parts=>(parts||[]).some(part=>typeof part==='object'&&((part.tag==='a'&&/\/(?:print|subscribe|subscription|shop)(?:[/?#]|$)/i.test(part.href||''))||subscriptionLink(part.children)));
  for(let i=0;i<blocks.length;i++){
    const [tag,text]=blocks[i];const value=normalise(text);
    // Match standalone calls to action, never a sentence merely mentioning a
    // newsletter. Quotes, code and article headings retain their original text.
    if(tag==='p'&&value.length<=320&&newsletterPrompt.test(value)){discard(i,'subscription',['standalone-call-to-action','newsletter-reference']);continue;}
    // Publisher housekeeping is identified by its role and edge position,
    // rather than rejecting prose that happens to discuss issues or authors.
    const publicationEvidence=[];
    if(i<3)publicationEvidence.push('opening-position');
    if(/^(?:this|our|we|you|read|from|available|the (?:latest|new))\b/i.test(value))publicationEvidence.push('publisher-addresses-reader');
    if(/\b(?:issue\s+#?\d+|(?:new|latest|print) (?:issue|edition))\b/i.test(value))publicationEvidence.push('publication-edition');
    if(/\b(?:print subscribers?|subscriptions?|arriv(?:es?|ing)|ship(?:s|ping|ped)?|order(?:ing)?|on sale)\b/i.test(value)||subscriptionLink(blocks[i][2]))publicationEvidence.push('subscription-or-delivery');
    if(tag==='p'&&value.length<=420&&publicationEvidence.length===4){discard(i,'publication-note',publicationEvidence);continue;}
    if(tag==='p'&&i>=blocks.length-6&&value.length<=240&&newsletterThanks.test(value)){discard(i,'subscription',['closing-position','reader-thank-you','newsletter-reference']);continue;}
    if(!['p','h2','h3'].includes(tag)||value.length>150||!relatedHeading.test(value))continue;
    // A label alone is insufficient: require an immediately following run of
    // linked recommendations. Resume at the next normal article paragraph.
    let end=i+1;
    while(end<blocks.length&&(remove.has(end)||linkOnly(blocks[end])))end++;
    if(end>i+1){for(let j=i;j<end;j++)discard(j,'related-links',['recommendation-label','consecutive-linked-blocks']);i=end-1;}
  }
  // A trailing signature must match the article's independently extracted
  // author. An internal biographical sentence, quotation or heading stays.
  let tail=blocks.length-1;
  while(tail>=0&&(remove.has(tail)||separator(blocks[tail])))tail--;
  if(tail>=0&&blocks[tail][0]==='p'&&authorBio(normalise(blocks[tail][1])))discard(tail,'author-bio',['closing-position','matches-article-author','biographical-role']);
  // Strip only outer separators left around removed publishing notes, keeping
  // scene breaks between substantive article paragraphs.
  for(let i=0;i<blocks.length;i++){if(remove.has(i))continue;if(separator(blocks[i]))discard(i,'decoration',['outer-separator']);else break;}
  for(let i=blocks.length-1;i>=0;i--){if(remove.has(i))continue;if(separator(blocks[i]))discard(i,'decoration',['outer-separator']);else break;}
  return {blocks:blocks.filter((_,i)=>!remove.has(i)),removed:[...decisions.values()].sort((a,b)=>a.index-b.index)};
}

export function cleanArticleBlocks(blocks,context={}){
  return analyseArticleBlocks(blocks,context).blocks;
}
