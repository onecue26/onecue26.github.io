'use strict';
(() => {
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>v===null||v===undefined?'':typeof v==='string'?v:Array.isArray(v)?v.map(fmt).join('\n'):typeof v==='object'?JSON.stringify(v,null,2):String(v);
 const arr=v=>Array.isArray(v)?v:[];
 const safe=v=>{try{const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const link=v=>safe(v)?'<a href="'+esc(safe(v))+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">'+esc(v)+'</a>':esc(fmt(v));
 const extra=arr(window.ORDER_TEST_EXTRA_INPUTS?.entries).map(r=>({...r,source:'additional_five',briefRows:[],contactRows:[],attachments:[],systemExtras:[]}));
 const state={site:[],all:extra,loaded:false,loading:false,db:null,photoAssets:new Map(),urlCache:new Map(),observer:null};
 const labelMap={brand:'브랜드',product:'제품명',kind:'제품 종류',point:'광고주 핵심 포인트',mood:'연출 분위기',avoid:'피할 표현',ref_url:'참고 영상',url:'제품·홈페이지',aspect:'화면 비율',raw:'입력 원문',goal:'광고 목표',target:'타깃',format:'요청 형식',name:'이름',email:'이메일',phone:'전화번호',title:'직함',homepage:'홈페이지',company:'업체',message:'요청 내용',note:'메모',duration:'영상 길이',channels:'게재 채널'};
 const ignored=new Set(['id','project_id','client_id','created_at','updated_at','photos','status','step','stage','stage_at','stage_started_at','submitted_at','archived_at','engine_version','production_track']);
 const moods={auto:'원큐에게 맡기기',pretty:'기발하고 유쾌하게',bgrade:'크고 시원하게',clean:'깔끔한 정보'};
 function status(text,error=false,login=false){const el=$('#status');el.classList.toggle('error',error);el.textContent=text;if(login){const a=document.createElement('a');a.href='login.html';a.target='_blank';a.rel='noopener noreferrer';a.textContent='원큐 로그인 열기';el.append(a);}}
 async function readAll(table,columns,ids,assetFilter=false){
  const result=[];let offset=0;
  while(true){
   let q=state.db.from(table).select(columns,{count:'exact'}).order(table==='projects'?'created_at':'project_id',{ascending:true}).range(offset,offset+199);
   if(ids)q=q.in('project_id',ids);
   if(assetFilter)q=q.or('kind.eq.product_ref,meta->>by.eq.client');
   const r=await q;if(r.error)throw new Error(r.error.message||table+' 조회 실패');
   const rows=arr(r.data);result.push(...rows);
   if(rows.length<200 || (Number.isInteger(r.count)&&result.length>=r.count))break;
   offset+=200;if(offset>=20000)throw new Error('한 번에 읽을 자료가 너무 많습니다. 전체 조회를 완료하지 못했습니다.');
  }return result;
 }
 function byProject(rows){const map=new Map();for(const r of rows){const id=r.project_id;if(!map.has(id))map.set(id,[]);map.get(id).push(r);}return map;}
 function normalize(project,briefRows,contactRows,assets){
  const b=briefRows.at(-1)||{},o=b.option3&&typeof b.option3==='object'?b.option3:{},c=contactRows.at(-1)||{};
  const photoIds=new Set(briefRows.flatMap(b=>arr(b.option3?.photos).map(x=>typeof x==='string'?x:x?.id).filter(Boolean)));
  const attachments=assets.filter(a=>photoIds.has(a.id)||a.meta?.by==='client'||(a.kind==='product_ref'&&!a.meta?.by));
  for(const a of attachments)state.photoAssets.set(project.id+':'+a.id,a);
  const knownO=new Set(['brand','product','kind','point','mood','avoid','ref_url','ref_ok','url','url_ok','aspect','target']);
  const knownB=new Set(['raw','goal','target','format','option3']);
  const unknown=[];
  for(const row of briefRows){
   if(row.option3&&typeof row.option3==='object'){
    for(const [key,value] of Object.entries(row.option3))if(!knownO.has(key)&&!ignored.has(key)&&fmt(value)!=='')unknown.push([labelMap[key]||key,value]);
   }
   for(const [key,value] of Object.entries(row))if(!knownB.has(key)&&!ignored.has(key)&&fmt(value)!=='')unknown.push([labelMap[key]||key,value]);
  }
  if(project.option2_brief&&typeof project.option2_brief==='object')for(const [key,value] of Object.entries(project.option2_brief))if(!ignored.has(key)&&fmt(value)!=='')unknown.push([labelMap[key]||key,value]);
  return {id:project.id,source:'site',brand:o.brand??project.brand??'',product:o.product??project.product??'',category:o.kind??'',point:o.point??'',description:b.raw??'',goal:b.goal??'',target:o.target??b.target??'',mood:o.mood??'',avoid:o.avoid??'',reference_url:o.ref_url??'',url:o.url??c.homepage??'',aspect:o.aspect??project.aspect??arr(project.aspects).join(' / '),duration:project.running_sec??'',format:b.format??'',channels:arr(project.channels).join(' / '),contact_name:c.name??'',contact_email:c.email??'',contact_phone:c.phone??'',created_at:project.created_at??'',briefRows,contactRows,attachments,available_photos:[],systemExtras:unknown,savedProject:project};
 }
 function date(s){if(!s)return '';const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});}
 function row(label,value,wide=false,isLink=false){return '<div class="field'+(wide?' wide':'')+'"><dt>'+esc(label)+'</dt><dd'+(fmt(value)===''?' aria-label="빈칸"':'')+'>'+(isLink?link(value):esc(fmt(value)))+'</dd></div>';}
 function knownFields(e){
  return row('브랜드',e.brand)+row('제품명',e.product)+row('제품 종류',e.category)+row('제품·홈페이지',e.url,false,true)+row('제품 설명·요청 원문',e.description,true)+row('광고주 핵심 포인트',e.point,true)+row('광고 목표',e.goal,true)+row('타깃',e.target)+row('연출 분위기',e.mood?((moods[e.mood]||e.mood)+(moods[e.mood]?' ('+e.mood+')':'')):'')+row('피할 표현',e.avoid,true)+row('참고 광고·영상',e.reference_url,true,true)+row('요청 형식 원문',e.format,true)+row('저장된 영상 길이',e.duration)+row('저장된 화면 비율',e.aspect)+row('저장된 게재 채널',e.channels)+row('입력일',date(e.created_at))+row('입력자',e.contact_name)+row('이메일',e.contact_email)+row('전화번호',e.contact_phone);
 }
 function photoHtml(e,a,index,available=false){
  const id=available?'extra:'+e.id+':'+index:e.id+':'+a.id;
  const title=available?a.label:(a.role||'첨부 '+(index+1));
  const src=available?safe(a.url):'';
  const attrs=available?' src="'+esc(src)+'"':' data-photo-id="'+esc(id)+'"';
  const source=available?'사이트 수집·보완한 보유 사진':(a.meta?.by==='client'?'광고주 첨부 사진':'저장된 제품 참조 사진');
  const mime=a.mime||'';
  if(!available&&mime&&!mime.startsWith('image/'))return '<figure class="photo-card"><button class="file-open" type="button" data-file-id="'+esc(id)+'">'+esc(title)+'</button><figcaption>'+esc(source)+'</figcaption></figure>';
  return '<figure class="photo-card"><button class="photo-button" type="button" data-photo-open="'+esc(id)+'"><img'+attrs+' alt="'+esc(title)+'" loading="lazy"></button><figcaption>'+esc(title)+'<br>'+esc(source)+'</figcaption></figure>';
 }
 function extraStored(e){
  const notes=[];
  if(e.briefRows.length>1)notes.push('<details class="subsection"><summary>다른 입력 기록 '+(e.briefRows.length-1)+'개</summary><div>'+e.briefRows.slice(0,-1).map((r,i)=>'<h4>입력 기록 '+(i+1)+'</h4><dl class="fields">'+Object.entries(r).filter(([k])=>!ignored.has(k)).map(([k,v])=>row(labelMap[k]||k,fmt(v),true)).join('')+'</dl>').join('')+'</div></details>');
  if(e.contactRows.length)notes.push('<details class="subsection"><summary>저장된 연락·홈페이지 정보 전체</summary><dl class="fields">'+e.contactRows.flatMap(c=>Object.entries(c).filter(([k])=>!ignored.has(k)).map(([k,v])=>row(labelMap[k]||k,v,true,k==='homepage'))).join('')+'</dl></details>');
  if(e.systemExtras.length)notes.push('<details class="subsection"><summary>추가 저장 항목</summary><dl class="fields">'+e.systemExtras.map(([k,v])=>row(k,v,true)).join('')+'</dl></details>');
  if(e.collected_info)notes.push('<details class="subsection"><summary>기존 수집 정보 · 광고주 입력과 구분</summary><dl class="fields">'+row('수집된 상품명',e.collected_info.product,true)+row('수집된 브랜드',e.collected_info.brand)+row('판매자 자료에서 수집한 내용',e.collected_info.facts,true)+'</dl></details>');
  return notes.join('');
 }
 function card(e,index){
  const first=e.attachments.find(a=>!a.mime||a.mime.startsWith('image/'));
  const cover=first?'<img class="cover" data-photo-id="'+esc(e.id+':'+first.id)+'" alt="'+esc(e.product)+'" loading="lazy">':e.available_photos?.length?'<img class="cover" src="'+esc(safe(e.available_photos[0].url))+'" alt="'+esc(e.product)+'" loading="lazy">':'<div class="cover-blank" aria-label="대표 사진 빈칸"></div>';
  const current=e.source==='site'?'기존 원큐 의뢰':'이번 5개 · 보유자료';
  const point=e.point||e.goal||'';
  return '<article class="entry" id="record-'+esc(e.id)+'">'+
   '<div class="entry-head">'+cover+'<div><div class="entry-top"><span class="number">'+String(index+1).padStart(3,'0')+'</span><span class="badge'+(e.source==='site'?'':' extra')+'">'+current+'</span><span>'+esc(date(e.created_at))+'</span><span>'+esc(e.contact_name)+'</span></div><h2>'+esc(e.product||e.brand||'')+'</h2><p class="summary-point">'+esc(point)+'</p><div class="entry-actions">'+(e.url?'<a href="'+esc(safe(e.url))+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">제품·홈페이지</a>':'')+'<button type="button" class="copy" data-copy="'+esc(e.id)+'">입력 자료 복사</button></div></div></div>'+
   '<details><summary>입력 자료 전체 보기 · 첨부 '+e.attachments.length+'개'+(e.available_photos?.length?' · 보유 사진 '+e.available_photos.length+'개':'')+'</summary><div class="detail-body"><dl class="fields">'+knownFields(e)+'</dl><h3 class="section-title">광고주 첨부·저장 자료</h3><div class="photo-grid">'+e.attachments.map((a,i)=>photoHtml(e,a,i)).join('')+'</div>'+
   (e.available_photos?.length?'<h3 class="section-title">현재 보유한 수집·보완 사진</h3><p class="group-note">광고주가 직접 첨부한 사진과 구분합니다.</p><div class="photo-grid">'+e.available_photos.map((a,i)=>photoHtml(e,a,i,true)).join('')+'</div>':'')+extraStored(e)+'</div></details></article>';
 }
 async function resolvePhoto(id){
  if(state.urlCache.has(id))return state.urlCache.get(id);
  const task=(async()=>{
   const asset=state.photoAssets.get(id);if(!asset)return '';
   if(/(^|[\\/])(?:archive|_archive|owned_productions_archive)([\\/]|$)/i.test(asset.storage_path||''))return '';
   if(!state.db)return '';
   const [copy]=await window.ONECUE_ASSETS.resolve(state.db,[asset]);return safe(copy?.url||'');
  })().catch(()=> '');state.urlCache.set(id,task);return task;
 }
 function observePhotos(){
  state.observer?.disconnect();
  state.observer=new IntersectionObserver(entries=>{for(const item of entries)if(item.isIntersecting){const img=item.target;state.observer.unobserve(img);resolvePhoto(img.dataset.photoId).then(url=>{if(url)img.src=url;else{img.alt+=' · 원본 파일 접근을 확인할 수 없습니다';img.dataset.accessError='true';}});}}, {rootMargin:'150px'});
  document.querySelectorAll('img[data-photo-id]').forEach(img=>state.observer.observe(img));
 }
 function render(){
  state.all=[...state.site,...extra];
  const query=$('#search').value.trim().toLowerCase(),source=$('#source').value;
  const filtered=state.all.map((e,i)=>({e,i})).filter(({e})=>(source==='all'||e.source===source)&&(!query||JSON.stringify(e).toLowerCase().includes(query)));
  $('#list').innerHTML=filtered.map(({e,i})=>card(e,i)).join('');
  $('#count-site').textContent=state.loaded?'기존 원큐 · '+state.site.length+'개':'기존 원큐 · 로그인 후 조회';
  $('#count-extra').textContent='이번 추가 · '+extra.length+'개';
  $('#count-visible').textContent='현재 '+filtered.length+'개 표시';
  $('#empty').hidden=filtered.length>0;observePhotos();
 }
 async function load(){
  if(state.loading)return;state.loading=true;$('#reload').disabled=true;
  try{
   if(!window.supabase||!window.ONECUE)throw new Error('원큐 연결 파일을 불러오지 못했습니다.');
   state.db=window.ONECUE_DB||(window.ONECUE_DB=window.supabase.createClient(window.ONECUE.supabaseUrl,window.ONECUE.supabaseAnonKey));
   const session=await state.db.auth.getSession();
   if(session.error)throw session.error;
   const user=session.data?.session?.user;
   if(!user){state.site=[];state.loaded=false;$('#account').textContent='';status('기존 의뢰는 원큐에 로그인한 브라우저에서 불러옵니다. 이번 5개 제품은 아래에서 먼저 볼 수 있습니다.',false,true);return;}
   $('#account').textContent=user.email||'원큐 로그인됨';
   status('저장된 의뢰와 입력 원문·첨부 자료를 읽고 있습니다.');
   const projects=await readAll('projects','id,client_id,slug,brand,product,production_track,created_at,closed_at,test_label,running_sec,aspect,aspects,channels,visual_style,ad_type,ad_type_by,option2_brief');
   const allBriefs=[],allContacts=[],allAssets=[],warnings=[];
   for(let start=0;start<projects.length;start+=50){
    const ids=projects.slice(start,start+50).map(p=>p.id);
    const results=await Promise.allSettled([readAll('briefs','*',ids),readAll('contacts','*',ids),readAll('assets','id,project_id,kind,role,storage_path,url,mime,bytes,meta',ids,true)]);
    for(let n=0;n<3;n++){const r=results[n];if(r.status==='fulfilled')[allBriefs,allContacts,allAssets][n].push(...r.value);else warnings.push(['입력 내용','연락·홈페이지 정보','첨부 자료'][n]+' 조회: '+r.reason.message);}
   }
   const b=byProject(allBriefs),c=byProject(allContacts),a=byProject(allAssets);
   state.site=projects.map(p=>normalize(p,b.get(p.id)||[],c.get(p.id)||[],a.get(p.id)||[]));state.loaded=true;
   status(warnings.length?'의뢰 '+projects.length+'개를 표시했습니다. 일부 항목을 읽지 못했습니다: '+[...new Set(warnings)].join(' / '):'기존 의뢰 '+projects.length+'개와 이번 5개를 읽었습니다. 같은 제품도 의뢰별로 유지하며 빈값은 채우지 않습니다.',warnings.length>0);
  }catch(e){state.loaded=false;status('기존 자료를 불러오지 못했습니다. '+(e.message||e)+' 이번 5개는 계속 볼 수 있습니다.',true,true);}
  finally{state.loading=false;$('#reload').disabled=false;render();}
 }
 function copyEntry(e){
  const lines=[e.product||'',e.brand||''];
  const fields=[['제품 종류',e.category],['제품·홈페이지',e.url],['제품 설명·요청 원문',e.description],['핵심 포인트',e.point],['광고 목표',e.goal],['타깃',e.target],['분위기',e.mood],['피할 표현',e.avoid],['참고 영상',e.reference_url],['형식',e.format],['화면 비율',e.aspect],['게재 채널',e.channels]];
  for(const [k,v] of fields)lines.push(k+': '+fmt(v));
  for(const a of e.available_photos||[])lines.push(a.label+': '+safe(a.url));
  return navigator.clipboard.writeText(lines.join('\n'));
 }
 document.addEventListener('click',async event=>{
  const copy=event.target.closest('[data-copy]');if(copy){const e=state.all.find(x=>x.id===copy.dataset.copy);try{await copyEntry(e);copy.textContent='복사됨';}catch{copy.textContent='복사 권한을 확인해 주세요';}return;}
  const photo=event.target.closest('[data-photo-open]');const file=event.target.closest('[data-file-id]');
  if(!photo&&!file)return;
  const id=photo?.dataset.photoOpen||file.dataset.fileId;let url='',caption='';
  if(id.startsWith('extra:')){const [,eid,n]=id.split(':');const e=extra.find(x=>x.id===eid);const a=e?.available_photos[Number(n)];url=safe(a?.url||'');caption=a?.label||'';}
  else{url=await resolvePhoto(id);caption=state.photoAssets.get(id)?.role||'';}
  if(!url)return;
  if(file){window.open(url,'_blank','noopener,noreferrer');return;}
  $('#photo-large').src=url;$('#photo-large').alt=caption;$('#photo-caption').textContent=caption;$('#photo-view').showModal();
 });
 $('#close-photo').addEventListener('click',()=>$('#photo-view').close());
 $('#photo-view').addEventListener('click',e=>{if(e.target===$('#photo-view'))$('#photo-view').close();});
 $('#search').addEventListener('input',render);$('#source').addEventListener('change',render);$('#reload').addEventListener('click',load);
 render();load();
})();