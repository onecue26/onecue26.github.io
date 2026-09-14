(() => {
 const box=document.getElementById('private-showcase');
 const db=window.ONECUE_DB;
 if(!box||!db)return;
 let generation=0;
 const clear=()=>{generation++;box.hidden=true;box.replaceChildren();};
 async function load(){
  clear();const version=generation;
  try {
   const {data:{user},error}=await db.auth.getUser();
   if(error||!user)return;
   const profile=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
   if(profile.error||!profile.data?.is_admin)return;
   // RLS independently enforces the archive allowlist, not just the UI profile.
   const result=await db.from('production_results').select('work_id,revision,title,preview_path,video_path,registered_at').order('registered_at',{ascending:false}).limit(100);
   if(result.error||version!==generation)return;
   const unique=new Map();
   for(const row of result.data||[])if(!unique.has(row.work_id))unique.set(row.work_id,row);
   const cards=[];
   for(const row of [...unique.values()].slice(0,3)){
    const signed=await db.storage.from('production-results').createSignedUrl(row.preview_path||row.video_path,600);
    if(version!==generation)return;
    if(signed.error||!signed.data?.signedUrl)continue;
    const card=document.createElement('article');
    const video=document.createElement('video');video.src=signed.data.signedUrl;video.controls=true;video.playsInline=true;video.preload='metadata';
    video.style.cssText='width:100%;height:200px;object-fit:contain;background:#101818;display:block';
    video.setAttribute('aria-label',row.title);
    const link=document.createElement('a');link.href='results.html';link.textContent=`${row.work_id} · ${row.title}`;
    card.append(video,link);cards.push(card);
   }
   if(!cards.length||version!==generation)return;
   const heading=document.createElement('h2');heading.textContent='최근 제작 결과물';
   const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px';grid.append(...cards);
   box.style.margin='24px 0';box.append(heading,grid);box.hidden=false;
  }catch{if(version===generation)clear();}
 }
 db.auth.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT')clear();});
 load();
})();
