// liquidGL is loaded only when a dictionary opens. The lens contains no text:
// native DOM content stays selectable and interactive above it.
(() => {
 'use strict';
 let loading=null,session=null,generation=0;
 const preferences=['(prefers-reduced-transparency: reduce)','(forced-colors: active)','(prefers-reduced-motion: reduce)','print'].map(query=>matchMedia(query));
 const disabled=()=>preferences.some(query=>query.matches);
 function load(){
  if(window.liquidGL)return Promise.resolve();
  if(!loading)loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/scripts/liquidGL.js';
   script.onload=()=>window.liquidGL?resolve():reject(Error('Glass renderer unavailable'));
   script.onerror=()=>{script.remove();reject(Error('Glass renderer could not load'));};
   document.head.append(script);
  }).catch(error=>{loading=null;throw error;});
  return loading;
 }
 function hide(){
  generation++;
  if(!session)return;
  const current=session;session=null;
  clearTimeout(current.deadline);
  current.lens?.destroy();current.pane.remove();current.scene.remove();
  delete current.popup.dataset.glass;
 }
 function update(popup){
  if(!session||session.popup!==popup)return;
  const rect=popup.getBoundingClientRect();
  Object.assign(session.pane.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
 }
 function snapshot(copyBackground){
  // Snapshot just the viewport, avoiding a texture scaled down to fit a long
  // article. The clipped child prevents article overflow enlarging the texture.
  const scene=document.createElement('div');scene.id='dictionary-glass-scene';
  scene.setAttribute('aria-hidden','true');scene.inert=true;
  scene.style.cssText='position:fixed;inset:0;z-index:-2;pointer-events:none;contain:strict;overflow:hidden;background:var(--ambient-base)';
  const clip=document.createElement('div');clip.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none';
  scene.append(clip);
  const background=document.createElement('canvas');background.style.cssText='position:absolute;inset:0;width:100%;height:100%';
  if(copyBackground?.(background))clip.append(background);
  else{
   const ambient=document.querySelector('.ambient-background')?.cloneNode(true);
   if(ambient){delete ambient.dataset.renderer;ambient.querySelectorAll('canvas').forEach(node=>node.remove());clip.append(ambient);}
  }
  const article=document.querySelector('#reader > .article');
  if(article){
   const rect=article.getBoundingClientRect(),clone=article.cloneNode(true);
   clone.querySelectorAll('.line-numbers,.concreteness-curve').forEach(node=>node.remove());
   for(const element of [clone,...clone.querySelectorAll('[id]')])element.removeAttribute('id');
   Object.assign(clone.style,{position:'absolute',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',margin:'0',pointerEvents:'none'});
   clip.append(clone);
  }
  document.body.append(scene);return scene;
 }
 async function show(popup,copyBackground){
  hide();if(disabled()||document.hidden||popup.hidden)return;
  const ticket=generation;
  try{
   await load();
   if(ticket!==generation||popup.hidden||disabled()||document.hidden)return;
   const scene=snapshot(copyBackground),pane=document.createElement('div');
   pane.id='dictionary-glass-pane';pane.setAttribute('aria-hidden','true');pane.setAttribute('data-liquid-ignore','');
   pane.style.cssText='position:fixed;z-index:29;border-radius:22px;pointer-events:none;background:transparent';
   document.body.append(pane);session={popup,pane,scene,lens:null,deadline:null};update(popup);
   const current=session;
   // An async GPU/snapshot failure must leave the ordinary popup available.
   current.deadline=setTimeout(()=>{if(session===current&&!popup.dataset.glass)hide();},5000);
   current.lens=window.liquidGL({target:'#dictionary-glass-pane',snapshot:'#dictionary-glass-scene',content:false,
    resolution:Math.min(2,window.devicePixelRatio||1),engine:'auto',zIndex:29,
    refraction:.003,bevelDepth:.035,bevelWidth:.13,frost:4,aberration:0,
    shadow:false,specular:true,reveal:'none',tilt:false,draggable:false,interaction:'none',magnify:1,
    tint:getComputedStyle(document.body).getPropertyValue('--dictionary-lens-tint').trim(),
    on:{init(){if(session===current&&!popup.hidden){clearTimeout(current.deadline);popup.dataset.glass='gpu';}}}
   });
  }catch(error){if(ticket===generation)hide();console.warn('other lives glass fallback',error.message);}
 }
 for(const preference of preferences)preference.addEventListener('change',()=>{if(disabled())hide();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
 window.addEventListener('pagehide',hide);
 window.otherLivesDictionaryGlass={show,hide,update};
})();
