'use strict';
const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
let rows=[],selected='',revision=0,section='record',db;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=document.querySelector('#status');
function script(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(Error('연결 스크립트를 불러오지 못했습니다.'));document.head.append(s);});}
async function load(){try{
 status.textContent='목록을 확인하고 있습니다.';
 if(local){document.querySelector('#back').href='index.html';const r=await fetch('results-data.json',{cache:'no-store'});if(!r.ok)throw Error('로컬 결과물 목록이 아직 없습니다.');rows=await r.json();}
 else {
  if(!window.ONECUE)await script('config.js');
  if(!window.ONECUE?.supabaseUrl||window.ONECUE.supabaseUrl.includes('YOUR-'))throw Error('Supabase 연결 설정이 필요합니다.');
  if(!window.supabase)await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  db ||= window.supabase.createClient(window.ONECUE.supabaseUrl,window.ONECUE.supabaseAnonKey);
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user){document.querySelector('#detail').innerHTML='<div class="empty">관리자 로그인이 필요합니다. <a href="login.html">로그인</a></div>';status.textContent='로그인 대기';return;}
  const {data:profile,error:profileError}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
  if(profileError||!profile?.is_admin)throw Error('관리자 계정만 볼 수 있습니다.');
  rows=[];let start=0;
  while(true){const {data,error}=await db.from('production_results').select('*').order('work_id').order('revision').range(start,start+499);if(error)throw Error('결과물 조회에 실패했습니다. 테이블과 접근 권한을 확인해 주세요.');rows.push(...data);if(data.length<500)break;start+=500;}
 }
 if(!Array.isArray(rows))throw Error('목록 형식이 올바르지 않습니다.');
 status.textContent=`${new Set(rows.map(r=>r.work_id)).size}개 작품 · ${rows.length}개 버전${local?' · 로컬 관리자 미리보기':''}`;
 if(!selected&&rows.length)selected=rows[0].work_id;list();await detail();
}catch(e){rows=[];document.querySelector('#list').innerHTML='';status.textContent=e.message;document.querySelector('#detail').innerHTML='<div class="empty">연결을 확인한 뒤 새로고침해 주세요.</div>';}}
function list(){const query=document.querySelector('#search').value.toLowerCase();const latest=new Map();for(const row of rows){if(!latest.has(row.work_id)||latest.get(row.work_id).revision<row.revision)latest.set(row.work_id,row);}document.querySelector('#list').innerHTML=[...latest.values()].filter(r=>`${r.work_id} ${r.title}`.toLowerCase().includes(query)).map(r=>`<button class="work ${r.work_id===selected?'active':''}" data-id="${esc(r.work_id)}"><small>${esc(r.work_id)} / r${String(r.revision).padStart(3,'0')}</small><strong>${esc(r.title)}</strong><span>${r.kind==='test'?'테스트':r.kind==='experiment'?'실험':'납품'} · ${r.analyst_review?'후기 검토됨':'후기 검토 대기'}</span></button>`).join('')||'<p class="empty">일치하는 작품이 없습니다.</p>';}
function prose(text){if(!text)return '<p class="empty">아직 기록이 없습니다.</p>';return text.split('\n').map(line=>{if(line.startsWith('## '))return `<h4>${esc(line.slice(3))}</h4>`;if(line.startsWith('# '))return `<h3>${esc(line.slice(2))}</h3>`;if(line.startsWith('- '))return `<p class="bullet">${esc(line.slice(2))}</p>`;return line.trim()?`<p>${esc(line)}</p>`:'';}).join('');}
let requestVersion=0;
async function detail(){const request=++requestVersion;const group=rows.filter(r=>r.work_id===selected).sort((a,b)=>b.revision-a.revision);const r=group.find(r=>r.revision===revision)||group[0];if(!r){document.querySelector('#detail').innerHTML='<div class="empty">등록된 완성작이 없습니다.</div>';return;}
 revision=r.revision;
 let src=r.video_url;
 let original;
 if(!local){const signed=await db.storage.from('production-results').createSignedUrl(r.preview_path||r.video_path,3600);if(request!==requestVersion)return;if(signed.error){src='';}else src=signed.data.signedUrl;
 const download=await db.storage.from('production-results').createSignedUrl(r.video_path,3600,{download:true});if(request!==requestVersion)return;original=download.data?.signedUrl;
 }
 if(src){const parsed=new URL(src,location.href);if(!['http:','https:'].includes(parsed.protocol))src='';}
 document.querySelector('#detail').innerHTML=`<div class="result-head"><div><h2>${esc(r.title)}</h2><div class="tags"><span class="tag">${esc(r.work_id)}</span><span class="tag">${esc(r.kind)}</span><span class="tag pending">${({unreviewed:'영상 감상 미검수',reviewed:'영상 검수 완료',approved:'사용자 승인'})[r.review]||esc(r.review)}</span></div></div><label><select id="revision" aria-label="수정본 선택">${group.map(g=>`<option value="${g.revision}" ${g.revision===r.revision?'selected':''}>r${String(g.revision).padStart(3,'0')}</option>`).join('')}</select></label></div>${src?`<div class="media"><video src="${esc(src)}" controls playsinline preload="metadata"></video></div><a class="download" href="${esc(src)}" download>영상 다운로드</a>`:'<p class="error">영상 접근에 실패했습니다. 새로고침해 주세요.</p>'}<div class="review-tabs">${[['record','아스트라 제작 후기'],['analyst','시스템 담당 검토'],['info','제작 정보']].map(([v,t])=>`<button data-section="${v}" class="${section===v?'active':''}">${t}</button>`).join('')}</div><div id="review-body"></div>`;
 showReview(r);
 if(original)document.querySelector('.download').href=original;
 if(local && r.video_preview_url){
  const video=document.querySelector('#detail video');
  const preview=new URL(r.video_preview_url,location.href);
  if(video && preview.origin===location.origin){video.src=preview.href;video.load();}
 }
}
function showReview(r){document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===section));document.querySelector('#review-body').innerHTML=section==='info'?`<div class="facts"><span>등록 일시<strong>${esc(new Date(r.registered_at).toLocaleString('ko-KR'))}</strong></span><span>버전<strong>${esc(r.work_id)} / r${String(r.revision).padStart(3,'0')}</strong></span><span>분류<strong>${esc(r.kind)}</strong></span><span>시스템 후기 검토<strong>${r.analyst_review?'기록 있음':'대기'}</strong></span></div>`:`<article class="prose">${prose(section==='record'?r.production_record:r.analyst_review)}</article>`;}
document.querySelector('#list').onclick=e=>{const b=e.target.closest('[data-id]');if(b){selected=b.dataset.id;revision=0;list();detail();}};
document.querySelector('#detail').onclick=e=>{const b=e.target.closest('[data-section]');if(b){section=b.dataset.section;const r=rows.find(r=>r.work_id===selected&&r.revision===revision);if(r)showReview(r);}};
document.querySelector('#detail').onchange=e=>{if(e.target.id==='revision'){revision=Number(e.target.value);detail();}};
document.querySelector('#search').oninput=list;document.querySelector('#reload').onclick=load;load();
