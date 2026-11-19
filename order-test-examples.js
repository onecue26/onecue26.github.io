'use strict';
(() => {
  const root=document.querySelector('#representative-frames');
  if(!root)return;
  const tabs=[...root.querySelectorAll('[role="tab"]')];
  const ids=tabs.map(t=>t.dataset.example);
  function show(id,focus=false,bookmark=false) {
    if(!ids.includes(id))id=ids[0];
    for(const tab of tabs) {
      const active=tab.dataset.example===id;
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      const panel=document.getElementById(tab.getAttribute('aria-controls'));panel.hidden=!active;
      if(!active)panel.querySelectorAll('video').forEach(v=>v.pause());
      if(active&&focus)tab.focus();
    }
    try{localStorage.setItem('order-test-example',id);}catch{}
    if(bookmark)try{history.replaceState(null,'','#examples-'+id);}catch{}
  }
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>show(tab.dataset.example,false,true));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(i+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();show(tabs[next].dataset.example,true,true);}
    });
  });
  root.querySelectorAll('[data-example-link]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();show(a.dataset.exampleLink,false,true);}));
  function fromHash(){const m=location.hash.match(/^#examples-(roof|surf|fanta)$/);return m?.[1];}
  let saved;try{saved=localStorage.getItem('order-test-example');}catch{}
  show(fromHash()||saved||'roof');
  window.addEventListener('hashchange',()=>{if(fromHash())show(fromHash());});
})();
