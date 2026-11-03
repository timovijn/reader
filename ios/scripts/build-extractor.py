#!/usr/bin/env python3
"""Builds Shared/Extractor.js from the web reader's browser clipper, so the app,
the Safari share extension and the website extract articles identically.
Run after changing extraction code in folio/worker/page.html:
    python3 ios/scripts/build-extractor.py
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
page = (root.parent / 'folio/worker/page.html').read_text()
names = ['resolveArticleAuthor', 'cleanArticleExcerpt', 'analyseArticleBlocks', 'cleanArticleBlocks', 'isMediaCaption', 'articleTitleMetadata', 'cleanArticleTitle']

def module_function(name, file):
    source = (root.parent / file).read_text()
    start = source.index(f'export function {name}(') + len('export ')
    # These module exports are top-level function declarations, each followed
    # by another export or EOF. Avoid counting braces inside strings/regexes.
    end = re.search(r'^export function ', source[start:], re.M)
    return source[start:start + end.start()].rstrip() if end else source[start:].rstrip()


def function_source(name):
    start = page.find(f'function {name}(')
    if start < 0:
        raise SystemExit(f'Missing {name} in page.html')
    # Find the end of the function by balancing braces from the body's opening '{'.
    depth, i = 0, page.index('){', start) + 1
    while i < len(page):
        if page[i] == '{':
            depth += 1
        elif page[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    return page[start:i + 1]


ENTRY = r'''
// Mirrors browserClipper() in page.html, but returns the clip instead of copying it, and keeps
// hidden="until-found" sections, which mobile sites such as Wikipedia collapse but can expand.
// Every value is a string or array of strings, as Safari's share preprocessing requires.
function otherLivesExtract(){
 const tidy=value=>String(value||'').replace(/\s+/g,' ').trim();
 const meta=name=>tidy(document.querySelector('meta[property="'+name+'"],meta[name="'+name+'"]')?.content);
 const authorCandidate=resolveArticleAuthor([meta('author'),meta('article:author')],[...document.querySelectorAll('script[type="application/ld+json"]')].map(node=>node.textContent),[meta('parsely-author'),document.querySelector('[rel="author"],[itemprop="author"]')?.textContent],location.href);
 const metadata=articleTitleMetadata(tidy(meta('og:title')||document.querySelector('h1')?.textContent||document.title),[meta('og:site_name'),location.hostname.replace(/^www\./,'').replace(/\.[^.]+$/,'')],{headlines:[...document.querySelectorAll('h1')].filter(node=>!node.closest('[hidden],[aria-hidden="true"],nav,aside,footer')).map(node=>node.textContent),author:authorCandidate});
 const title=metadata.title,author=metadata.author;
 const published=tidy(document.querySelector('meta[property="article:published_time"],meta[name="datePublished"]')?.content||document.querySelector('time[itemprop="datePublished"]')?.getAttribute('datetime'));
 const excerpt=[meta('description'),meta('og:description')].map(cleanArticleExcerpt).find(Boolean)||'';
 // Read publisher data before removing scripts. These helpers are copied
 // directly from the website engine and only parse data; no publisher JS runs.
 const publisherBlocks=nytArticleBlocks([...document.querySelectorAll('script')].map(node=>({tagName:'script',childNodes:[{value:node.textContent}]})),location.href);
 const doc=document.cloneNode(true);
 doc.querySelectorAll('[class],[id],[itemprop]').forEach(node=>{if(isMediaCaption(node.getAttribute('class')+' '+node.id,node.getAttribute('itemprop')||''))node.remove();});
 doc.querySelectorAll('script,style,nav,footer,aside,form,button,input,iframe,svg,noscript,dialog,template,img,picture,source,figcaption,[role="tooltip"],[class*="tooltip-content"],[id*="tooltip-content"],[class*="letter-cta"],[class*="contact-cta"],[hidden]:not([hidden="until-found"]),[aria-hidden="true"],[role="navigation"],[role="dialog"],.related-posts,.newsletter,.comments').forEach(node=>node.remove());
 const score=node=>[...node.querySelectorAll('p')].reduce((sum,p)=>sum+Math.max(0,(p.textContent||'').length-[...p.querySelectorAll('a')].reduce((n,a)=>n+a.textContent.length,0)*2),0);
 const candidates=[...doc.querySelectorAll('.entry-content,.post-content,.article-body,[itemprop="articleBody"],article,main,[role="main"]')];
 const root=candidates.sort((a,b)=>score(b)-score(a))[0]||doc.body;
 const blocks=[];
 for(const node of root.querySelectorAll('h2,h3,p,blockquote,pre,li')){
  if(node.parentElement?.closest('blockquote,pre,li'))continue;
  const text=tidy(node.textContent);if(!text||text===title)continue;
  blocks.push([node.tagName==='LI'?'p':node.tagName.toLowerCase(),node.tagName==='LI'?'• '+text:text]);
 }
 const cleanUrl=new URL(location.href);cleanUrl.search='';cleanUrl.hash='';cleanUrl.username='';cleanUrl.password='';
 const extractionCandidates=[{method:'html',blocks:cleanArticleBlocks(blocks,{author})}];
 if(publisherBlocks.length)extractionCandidates.push({method:'publisher-data',blocks:cleanArticleBlocks(publisherBlocks,{author})});
 const selected=chooseArticleCandidate(extractionCandidates);
 // The native clip format uses plain [tag,text] pairs, keeping it compatible
 // with the App Group inbox and Safari's property-list preprocessing.
 return {format:'folio-browser-clip',version:'1',title,author,published,excerpt,siteName:meta('og:site_name'),url:cleanUrl.href,body:selected.blocks.map(block=>block.slice(0,2))};
}

// Safari share-sheet entry point (NSExtensionJavaScriptPreprocessingFile).
var ExtensionPreprocessingJS={run(args){let clip;try{clip=otherLivesExtract();}catch(error){clip={url:location.href,error:String(error)};}args.completionFunction(clip);},finalize(){}};
'''

source = '\n\n'.join(function_source(name) for name in names)
source += '\n\n' + module_function('assignedData', 'folio/lib/nyt-extractor.js')
source += '\n\n' + module_function('nytArticleBlocks', 'folio/lib/nyt-extractor.js')
source += '\n\n' + module_function('chooseArticleCandidate', 'folio/lib/embedded-articles.js')
(root / 'Shared/Extractor.js').write_text(
    '// Generated by ios/scripts/build-extractor.py from folio/worker/page.html. Do not edit.\n\n' + source + '\n' + ENTRY)
print('Wrote ios/Shared/Extractor.js')
(root / 'Shared/PublisherProfiles.json').write_text((root.parent / 'folio/lib/publisher-profiles.json').read_text())
print('Wrote ios/Shared/PublisherProfiles.json')
