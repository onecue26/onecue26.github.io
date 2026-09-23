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
  if(authError||!user){document.querySelector('#rows').innerHTML='<div class="empty">관리자 로그인이 필요합니다. <a href="login.html">로그인</a></div>';status.textContent='로그인 대기';return;}
  const {data:profile,error:profileError}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
  if(profileError||!profile?.is_admin)throw Error('관리자 계정만 볼 수 있습니다.');
  document.querySelectorAll('[data-studio-admin]').forEach(a=>a.hidden=false);
  rows=[];let start=0;
  while(true){const {data,error}=await db.from('production_results').select('*').order('work_id').order('revision').range(start,start+499);if(error)throw Error('결과물 조회에 실패했습니다. 테이블과 접근 권한을 확인해 주세요.');rows.push(...data);if(data.length<500)break;start+=500;}
 }
 if(!Array.isArray(rows))throw Error('목록 형식이 올바르지 않습니다.');
 status.textContent=`${new Set(rows.map(r=>r.work_id)).size}개 작품 · ${rows.length}개 버전${local?' · 로컬 관리자 미리보기':''}`;
 render();
}catch(e){rows=[];document.querySelector('#rows').innerHTML='';status.textContent=e.message;document.querySelector('#rows').innerHTML='<div class="empty">연결을 확인한 뒤 새로고침해 주세요.</div>';}}
// ★ 2026-09-23 — 가로로 긴 줄(제작 단계 목록과 같은 모양)로 바꿨다. 누르면 결과물 · 제작 후기 · 개선점.
//   Dan: 「파도에 이어서 순서대로 … 가로로 긴 탭으로 해서 열면 결과물과 후기가 잇는걸로. 그리고 개선점을 넣고」
//   순서는 작품 번호순(P0001 파도 → P0002 → P0003 …). 완료된 원큐 프로젝트는 작업기가 닫는 순간 이어서 붙인다.
const KIND={test:'자체 제작 테스트',experiment:'실험',delivery:'광고주 납품'};
const open=new Map();   // work_id → 보고 있는 판·칸
function latestOf(id){return rows.filter(r=>r.work_id===id).sort((a,b)=>b.revision-a.revision);}
function prose(text){if(!text)return '<p class="empty">기록 없음</p>';
 return text.split('\n').map(line=>{if(line.startsWith('## '))return `<h4>${esc(line.slice(3))}</h4>`;
  if(line.startsWith('# '))return `<h3>${esc(line.slice(2))}</h3>`;
  if(line.startsWith('- '))return `<p class="bullet">${esc(line.slice(2))}</p>`;
  if(/^(결론|잘된 점|문제와 원인|제작 정보)/.test(line))return `<h4>${esc(line)}</h4>`;
  return line.trim()?`<p>${esc(line)}</p>`:'';}).join('');}
function won(n){return n?'₩'+Number(n).toLocaleString():'';}
function render(){
 const q=(document.querySelector('#search').value||'').toLowerCase();
 const ids=[...new Set(rows.map(r=>r.work_id))].sort();
 const html=ids.map(id=>{const g=latestOf(id),r=g[0];
  if(!`${r.work_id} ${r.title}`.toLowerCase().includes(q))return '';
  const ts=r.delivered_at||r.registered_at; const day=ts?new Date(ts).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,10):'';   // 한국 날짜
  const cost=r.cost_credits?`${Number(r.cost_credits)}cr ${won(r.cost_krw)}`:'';
  return `<details class="work-row" data-id="${esc(id)}"${open.has(id)?' open':''}><summary>
   <span class="w-id">${esc(id)}</span><strong class="w-title">${esc(r.title)}</strong>
   <span class="w-kind ${esc(r.kind)}">${esc(KIND[r.kind]||r.kind)}</span>
   <span class="w-meta">${esc(day)}${g.length>1?' · '+g.length+'판':''}${cost?' · '+esc(cost):''}</span></summary>
   <div class="w-body" data-body="${esc(id)}"></div></details>`;}).join('');
 document.querySelector('#rows').innerHTML=html||'<div class="empty">등록된 결과물이 없습니다.</div>';
 document.querySelectorAll('details.work-row[open]').forEach(d=>body(d.dataset.id));
}
async function body(id){
 const st=open.get(id)||{rev:0,tab:'review'};open.set(id,st);
 const g=latestOf(id),r=g.find(x=>x.revision===st.rev)||g[0];st.rev=r.revision;
 const box=document.querySelector(`[data-body="${CSS.escape(id)}"]`);if(!box)return;
 let src='',dl='';
 if(!local){const b=r.bucket||'production-results';
  const s1=await db.storage.from(b).createSignedUrl(r.preview_path||r.video_path,3600);if(!s1.error)src=s1.data.signedUrl;
  const s2=await db.storage.from(b).createSignedUrl(r.video_path,3600,{download:true});dl=s2.data?.signedUrl||'';}
 else src=r.video_url||'';
 // 옛 기록(파도)은 후기가 production_record 에, 시스템 검토가 analyst_review 에 있다
 const fresh=r.improvements!=null;
 const tabs={review:['제작 후기',fresh?r.analyst_review:r.production_record],
  improve:['개선점',fresh?r.improvements:(r.analyst_review?'(옛 기록 — 개선점 칸이 없던 때라 시스템 검토로 대신)\n'+r.analyst_review:'')],
  info:['제작 정보',fresh?r.production_record:`제작 정보\n- 등록 ${new Date(r.registered_at).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,10)}\n- 분류 ${KIND[r.kind]||r.kind}`]};
 box.innerHTML=`<div class="w-grid"><div class="w-video">${src?`<video src="${esc(src)}#t=0.3" controls playsinline preload="metadata"></video>`:'<div class="empty">영상을 불러오지 못했습니다</div>'}
   ${g.length>1?`<label class="w-rev">판 <select data-rev="${esc(id)}">${g.map(x=>`<option value="${x.revision}"${x.revision===r.revision?' selected':''}>r${String(x.revision).padStart(3,'0')}</option>`).join('')}</select></label>`:''}
   ${dl?`<a class="w-dl" href="${esc(dl)}">영상 다운로드</a>`:''}</div>
  <div class="w-text"><nav class="w-tabs">${Object.entries(tabs).map(([k,[n]])=>`<button data-tab="${k}" data-for="${esc(id)}" class="${k===st.tab?'active':''}">${n}</button>`).join('')}</nav>
   <div class="w-prose">${prose(tabs[st.tab][1])}</div></div></div>`;
}
document.querySelector('#rows').addEventListener('toggle',e=>{const d=e.target;if(!d.matches||!d.matches('details.work-row'))return;
 if(d.open){if(!open.has(d.dataset.id))open.set(d.dataset.id,{rev:0,tab:'review'});body(d.dataset.id);}else open.delete(d.dataset.id);},true);
document.querySelector('#rows').onclick=e=>{const b=e.target.closest('[data-tab]');if(b){open.get(b.dataset.for).tab=b.dataset.tab;body(b.dataset.for);}};
document.querySelector('#rows').onchange=e=>{if(e.target.dataset.rev){open.get(e.target.dataset.rev).rev=Number(e.target.value);body(e.target.dataset.rev);}};
document.querySelector('#search').oninput=render;
document.querySelector('#reload').onclick=load;
load();
