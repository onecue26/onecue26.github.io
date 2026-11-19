'use strict';
(() => {
 const root=document.querySelector('#hook-library'),hooks=window.ORDER_HOOKS||[];
 if(!root)return;
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clip=e=>{try{const u=new URL(e.clip,location.href),base=new URL('order-test-media/',location.href);return u.origin===base.origin&&u.pathname.startsWith(base.pathname)?u.href:'';}catch{return '';}};
 const hasClip=h=>(h.evidence||[]).some(e=>clip(e));
 const principles=hooks.filter(h=>h.kind!=='variant').length,variants=hooks.filter(h=>h.kind==='variant').length,withVideo=hooks.filter(hasClip).length,clips=new Set(hooks.flatMap(h=>(h.evidence||[]).map(clip).filter(Boolean)));
 $('library-total').textContent=`${hooks.length}항목 = 기본 원리 ${principles} + 변형 ${variants} · 영상 연결 ${withVideo} · 영상 없는 후보 ${hooks.length-withVideo} · 고유 참고 클립 ${clips.size}`;
 function render(){
  const query=$('library-search').value.trim().toLocaleLowerCase(),kind=$('library-kind').value,proof=$('library-proof').value;
  const found=hooks.filter(h=>(!kind||(kind==='principle'?h.kind!=='variant':h.kind===kind))&&(!proof||(proof==='clip'?hasClip(h):!hasClip(h)))&&(!query||[h.id,h.title,h.family,h.summary,h.effect,h.example,...(h.productSignals||[])].join(' ').toLocaleLowerCase().includes(query)));
  $('library-count').textContent=`${found.length} / ${hooks.length}항목 표시 · 원본 번호 순서`;
  $('library-rows').innerHTML=found.map(h=>{const evidence=(h.evidence||[]).filter(e=>clip(e));return `<tr data-library-id="${esc(h.id)}"><th scope="row">${esc(h.id)}</th><td><b>${esc(h.title)}</b><small>${esc(h.family)} · ${h.kind==='variant'?'변형':'원리'}${h.variantOf?' / '+esc(h.variantOf):''}</small></td><td>${esc(h.summary||h.effect)}<details><summary>적용 예시${evidence.length?' · 참고영상':''}</summary><p><b>저자 적용 예시</b><br>${esc(h.example||'미등록')}</p><p>반응 제안: ${esc(h.reaction||'미등록')}</p>${evidence.map(e=>`<p>${esc(e.title||'참고 영상')}<br>관찰 기록: ${esc(e.observed||'미확인')}</p><video controls playsinline preload="none" data-library-clip="${esc(clip(e))}" aria-label="${esc(e.title||h.title)}"></video>`).join('')}${(h.limitations||[]).length?'<p class="hint">'+esc(h.limitations.join(' / '))+'</p>':''}</details></td><td>${esc((h.productSignals||[]).join(' / '))}</td><td><span class="library-proof ${evidence.length?'has':'idea'}">${evidence.length?'영상 연결':'영상 없는 후보'}</span><small>${esc(h.difficulty||'미분류')}</small></td></tr>`;}).join('')||'<tr><td colspan="5">검색 조건에 맞는 항목이 없습니다.</td></tr>';
 }
 ['library-search','library-kind','library-proof'].forEach(id=>$(id).addEventListener(id==='library-search'?'input':'change',render));
 root.addEventListener('toggle',e=>{if(e.target.open)e.target.querySelectorAll('video[data-library-clip]').forEach(v=>{if(!v.src)v.src=v.dataset.libraryClip;});else if(e.target.matches('details'))e.target.querySelectorAll('video').forEach(v=>v.pause());},true);
 render();
})();
