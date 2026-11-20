'use strict';
(() => {
 const sources=window.ORDER_REFERENCE_SOURCES||{};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=v=>{if(typeof v!=='string'||!v)return '';try{const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 function render(e,excerpt=''){
  const row=sources[e.url]||{},url=safe(e.url),playable=['video','youtube','vimeo','instagram'].includes(row.type);
  if(row.adClassification!=='confirmed_ad'||row.catalogueIdentityMatch===false)return '<p class="reference-held">이 참고 영상은 광고 확인 또는 동일 작품 확인 기준을 통과하지 못해 기본 예시에서 분리했습니다. <a href="order-test.html#ad-audit">분류 근거 보기</a></p>';
  const reason=row.reason||(!playable?'이 페이지에서 전체본을 직접 연결하지 못했습니다. 원본 출처에서 확인해 주세요.':'');
  return `<div class="reference-full"><p><b>전체 영상 · ${esc(e.title||row.title||'원본 출처')}</b></p><p class="hint">${row.type==='video'?'출처에 게시된 영상 전체':playable?'출처의 원본 플레이어':'전체 영상 연결 미확인'} · 광고 출처 확인 · 새 제품 적용·생성 성공 검증과는 별도입니다.</p>${playable?`<div class="reference-player" data-full-reference="${esc(e.url)}"><button type="button" class="quiet" data-open-full="${esc(e.url)}">전체 영상 재생</button></div>`:''}${e.evidenceBasis?`<p class="hint">${e.evidenceBasis==='primary_description'?'연출 근거: 제작사·광고주 설명. 전체 모션·청취 직접 검수 아님.':e.evidenceBasis==='observed_samples'?'연출 근거: 대표 정지 표본. 전체 모션·청취 직접 검수 아님.':'연출 근거: 기존 영상 관찰 기록.'}</p>`:''}${reason?`<p class="hint">${esc(reason)}</p>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${playable?'원본 전체 영상 페이지 열기 ↗':'원본 출처에서 전체 영상 확인 ↗'}</a>`:''}${excerpt?`<details class="reference-excerpt"><summary>훅 발췌 따로 보기 · 전체 영상 아님</summary>${excerpt}</details>`:''}</div>`;
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-open-full]');if(!button)return;
  const row=sources[button.dataset.openFull];if(!row||row.adClassification!=='confirmed_ad'||row.catalogueIdentityMatch===false)return;
  const container=button.parentElement;
  if(row.type==='video'){
   const url=safe(row.videoUrl);if(!url)return;
   const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';if(/\.m3u8(?:$|\?)/.test(url)){if(window.Hls?.isSupported()){const hls=new Hls({maxBufferLength:15,maxMaxBufferLength:30});hls.loadSource(url);hls.attachMedia(video);video._referenceHls=hls;hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal){hls.destroy();const p=document.createElement('p');p.className='hint';p.textContent='이 환경에서는 직접 재생할 수 없습니다. 아래 원본 페이지에서 확인해 주세요.';container.append(p);}});}else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;}else{const p=document.createElement('p');p.textContent='원본 페이지에서 전체 영상을 확인해 주세요.';container.append(p);}}else video.src=url;video.setAttribute('aria-label','출처 전체 영상');container.replaceChildren(video);video.play().catch(()=>{});
  }else{
   const url=safe(row.embedUrl);if(!url)return;const host=new URL(url).hostname;
   if(!['www.youtube-nocookie.com','www.youtube.com','player.vimeo.com','www.instagram.com'].includes(host))return;
   const iframe=document.createElement('iframe');iframe.src=url;iframe.title='원본 전체 영상 플레이어';iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.loading='lazy';if(row.type==='instagram')iframe.className='instagram-full';container.replaceChildren(iframe);
   const hint=document.createElement('p');hint.className='hint';hint.textContent='재생 제한·로그인 안내가 나오면 아래 원본 페이지 링크로 확인하세요.';container.append(hint);
  }
 });
 window.OrderReferenceMedia={render,dispose(root){root?.querySelectorAll('video').forEach(v=>{v.pause();v._referenceHls?.destroy();});}};
 document.querySelectorAll('[data-reference-source]').forEach(el=>{el.innerHTML=render({url:el.dataset.referenceSource,title:el.dataset.referenceTitle||''},el.innerHTML);});
})();
