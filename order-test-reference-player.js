'use strict';
(() => {
 const sources=window.ORDER_REFERENCE_SOURCES||{};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=v=>{try{const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 function render(e,excerpt=''){
  const row=sources[e.url]||{},url=safe(e.url),playable=['video','youtube','vimeo','instagram'].includes(row.type);
  const reason=row.reason||(!playable?'이 페이지에서 전체본을 직접 연결하지 못했습니다. 원본 출처에서 확인해 주세요.':'');
  return `<div class="reference-full"><p><b>전체 영상 · ${esc(e.title||row.title||'원본 출처')}</b></p><p class="hint">${row.type==='video'?'출처에 게시된 영상 전체':playable?'출처의 원본 플레이어':'전체 영상 연결 미확인'} · 광고 여부·해당 효과의 근거 확인은 별도입니다.</p>${playable?`<div class="reference-player" data-full-reference="${esc(e.url)}"><button type="button" class="quiet" data-open-full="${esc(e.url)}">전체 영상 재생</button></div>`:''}${reason?`<p class="hint">${esc(reason)}</p>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${playable?'원본 전체 영상 페이지 열기 ↗':'원본 출처에서 전체 영상 확인 ↗'}</a>`:''}${excerpt?`<details class="reference-excerpt"><summary>훅 발췌 따로 보기 · 전체 영상 아님</summary>${excerpt}</details>`:''}</div>`;
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-open-full]');if(!button)return;
  const row=sources[button.dataset.openFull];if(!row)return;
  const container=button.parentElement;
  if(row.type==='video'){
   const url=safe(row.videoUrl);if(!url)return;
   const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=url;video.setAttribute('aria-label','출처 전체 영상');container.replaceChildren(video);video.play().catch(()=>{});
  }else{
   const url=safe(row.embedUrl);if(!url)return;const host=new URL(url).hostname;
   if(!['www.youtube-nocookie.com','www.youtube.com','player.vimeo.com','www.instagram.com'].includes(host))return;
   const iframe=document.createElement('iframe');iframe.src=url;iframe.title='원본 전체 영상 플레이어';iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.loading='lazy';if(row.type==='instagram')iframe.className='instagram-full';container.replaceChildren(iframe);
   const hint=document.createElement('p');hint.className='hint';hint.textContent='재생 제한·로그인 안내가 나오면 아래 원본 페이지 링크로 확인하세요.';container.append(hint);
  }
 });
 window.OrderReferenceMedia={render};
 document.querySelectorAll('[data-reference-source]').forEach(el=>{el.innerHTML=render({url:el.dataset.referenceSource,title:el.dataset.referenceTitle||''},el.innerHTML);});
})();
