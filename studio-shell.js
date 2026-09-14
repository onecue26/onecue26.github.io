(() => {
 document.documentElement.dataset.theme='light';
 const file=location.pathname.split('/').pop()||'index.html';
 const labels={'index.html':'프로젝트','new.html':'새 프로젝트','project.html':'프로젝트 진행','login.html':'계정','admin.html':'제작 관리','board.html':'콘티·영상 검수','results.html':'제작 결과물'};
 const rail=document.createElement('aside');rail.className='studio-rail';
 rail.innerHTML=`<a class="studio-brand" href="index.html"><b>o</b>ONECUE<span>.</span></a><div class="studio-workspace"><span>O</span><div>Creative workspace<small>광고 기획 · 제작</small></div></div><div class="studio-navlabel">WORKSPACE</div><nav><a href="index.html" ${file==='index.html'?'class="on"':''}>프로젝트</a><a href="new.html" ${file==='new.html'?'class="on"':''}>새 프로젝트</a><a href="admin.html" data-studio-admin hidden ${['admin.html','board.html'].includes(file)?'class="on"':''}>제작 관리</a><a href="results.html" data-studio-admin hidden ${file==='results.html'?'class="on"':''}>결과물 · 제작 후기</a><a href="login.html" ${file==='login.html'?'class="on"':''}>계정</a></nav><div class="studio-railfoot"><a href="old/index.html">이전 사이트 ↗</a><small>ONECUE / PRODUCTION STUDIO</small></div>`;
 document.body.prepend(rail);document.body.classList.add('studio-layout');
 const mark=document.querySelector('.topbar .mark');if(mark)mark.textContent=labels[file]||'ONECUE';
 const oldNote=document.querySelector('main > .note');if(file==='admin.html'&&oldNote){const title=oldNote.previousElementSibling;if(title?.tagName==='H2')title.remove();oldNote.remove();}
 if(file==='admin.html'){const main=document.querySelector('main');const heading=document.createElement('div');heading.className='studio-heading';heading.innerHTML='<div><div class="studio-eyebrow">PRODUCTION DESK</div><h1>제작 관리</h1><p>새 의뢰부터 최종 검수까지.</p></div><a class="btn ghost" href="results.html">결과물 · 후기 →</a>';main.prepend(heading);}
 if(file==='new.html'){const h=document.querySelector('main > h2');if(h)h.outerHTML='<div class="studio-heading"><div><div class="studio-eyebrow">NEW PROJECT</div><h1>어떤 광고를 만들까요?</h1></div></div>';}
 async function access(){if(!window.supabase||!window.ONECUE)return;const db=window.ONECUE_DB||(window.ONECUE_DB=window.supabase.createClient(ONECUE.supabaseUrl,ONECUE.supabaseAnonKey));const {data:{user}}=await db.auth.getUser();if(!user)return;const {data:p}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();document.querySelectorAll('[data-studio-admin]').forEach(a=>a.hidden=!p?.is_admin);}
 access().catch(()=>{});
})();
