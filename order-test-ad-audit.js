'use strict';
(() => {
 const root=document.getElementById('ad-audit'),audit=window.ORDER_AD_AUDIT;
 if(!root||!audit)return;
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=r=>r.catalogueIdentityMatch===false?'광고 확인 · 연결 보류':({confirmed_ad:'광고 확인',spec_or_demo:'가상광고·기술 데모',other_promotional:'기타 브랜드 홍보물',own_reference:'자체 제작 참고',unverified:'출처 미확인'}[r.classification]||'미확인');
 const safe=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const usable=r=>r.classification==='confirmed_ad'&&r.catalogueIdentityMatch!==false;
 const summary=audit.counts;
 $('audit-summary').textContent=`누적 검토 ${summary.originalCards}개 중 광고 근거 확인 ${summary.eligibleCards}개를 기본 목록에 실었습니다. 이번에 ${summary.expansionAdded||0}개를 추가했습니다. ${summary.excludedCards}개는 제외·보류 목록으로 분리했습니다. 출처 ${summary.sourceCount}건의 판정 근거를 아래에서 확인할 수 있습니다.`;
 function render(){
  const filter=$('audit-filter').value,q=$('audit-search').value.trim().toLocaleLowerCase();
  const rows=audit.sources.filter(r=>(!filter||(filter==='usable'?usable(r):filter==='excluded'?['spec_or_demo','other_promotional'].includes(r.classification):!usable(r)&&!['spec_or_demo','other_promotional'].includes(r.classification)))&&(!q||[r.title,r.advertiser,r.creator,r.reason_ko,r.sourceUrl].join(' ').toLocaleLowerCase().includes(q)));
  $('audit-source-count').textContent=`${rows.length} / ${audit.sources.length}출처 · ${audit.checkedAt} 확인`;
  $('audit-source-rows').innerHTML=rows.map(r=>`<tr><td><b>${esc(r.title||r.sourceUrl)}</b><small>${esc(r.advertiser||'광고주 미확인')}<br>${esc(r.creator||'제작사 미확인')}</small></td><td><span class="audit-badge ${usable(r)?'passed':'held'}">${esc(label(r))}</span></td><td>${esc(r.reason_ko)}<p>${(r.verificationUrls||[]).filter(safe).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">확인 출처 ${i+1} ↗</a>`).join(' · ')}</p></td></tr>`).join('')||'<tr><td colspan="3">해당 조건의 자료가 없습니다.</td></tr>';
 }
 $('audit-held-hooks').innerHTML=audit.excludedCards.map(c=>`<p class="audit-held-card"><b>${esc(c.id)} · ${esc(c.title)}</b><br>${esc(c.reason_ko)}</p>`).join('')||'<p>분리된 항목이 없습니다.</p>';
 $('audit-filter').addEventListener('change',render);$('audit-search').addEventListener('input',render);render();
})();
