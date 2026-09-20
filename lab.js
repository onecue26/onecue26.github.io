'use strict';
let labRows=[],selected='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const access=document.querySelector('#access');
const conn=document.querySelector('#conn');
const lab=document.querySelector('#lab');

function inline(text){return esc(text).replace(/`([^`]+)`/g,'<code>$1</code>');}
function markdown(text){
 const lines=String(text||'').split(/\r?\n/),out=[];let list='';
 const close=()=>{if(list){out.push(`</${list}>`);list='';}};
 for(const raw of lines){const line=raw.trim();
  if(!line){close();continue;}
  if(line.startsWith('# ')){close();out.push(`<h1>${inline(line.slice(2))}</h1>`);continue;}
  if(line.startsWith('## ')){close();out.push(`<h2>${inline(line.slice(3))}</h2>`);continue;}
  if(/^[-*] /.test(line)){if(list!=='ul'){close();list='ul';out.push('<ul>');}out.push(`<li>${inline(line.slice(2))}</li>`);continue;}
  if(/^\d+\. /.test(line)){if(list!=='ol'){close();list='ol';out.push('<ol>');}out.push(`<li>${inline(line.replace(/^\d+\. /,''))}</li>`);continue;}
  close();out.push(`<p>${inline(line)}</p>`);
 }close();return out.join('');
}
function render(){
 document.querySelector('#lab-index').innerHTML=labRows.map(r=>`<button data-slug="${esc(r.slug)}" class="${r.slug===selected?'on':''}">${esc(r.title)}<small>${esc(r.category)}</small></button>`).join('');
 const row=labRows.find(r=>r.slug===selected)||labRows[0];
 document.querySelector('#lab-document').innerHTML=row?markdown(row.body):'<div class="lab-empty">등록된 LAB 문서가 없습니다.</div>';
 document.querySelector('#updated').textContent=row?.updated_at?`UPDATED ${new Date(row.updated_at).toLocaleString('ko-KR')}`:'';
}
async function load(){try{
 conn.innerHTML='<span class="dot"></span>권한 확인 중';access.innerHTML='';lab.hidden=true;
 const db=window.ONECUE_DB||(window.ONECUE_DB=window.supabase.createClient(ONECUE.supabaseUrl,ONECUE.supabaseAnonKey));
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user){access.innerHTML='<div class="lab-empty">관리자 로그인이 필요합니다. <a class="btn ghost" href="login.html?next=lab.html">로그인</a></div>';conn.textContent='로그인 필요';return;}
 const {data:profile,error:profileError}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();
 if(profileError||!profile?.is_admin){access.innerHTML='<div class="lab-empty">관리자만 볼 수 있는 운영실입니다.</div>';conn.textContent='접근 제한';return;}
 const {data,error}=await db.from('admin_lab_documents').select('slug,title,summary,category,body,sort_order,updated_at').order('sort_order');
 if(error)throw error;labRows=data||[];selected=labRows.some(r=>r.slug===selected)?selected:(labRows[0]?.slug||'');
 document.querySelectorAll('[data-studio-admin]').forEach(a=>a.hidden=false);lab.hidden=false;render();conn.innerHTML='<span class="dot"></span>관리자 연결';document.querySelector('#reload').disabled=false;
 }catch(error){access.innerHTML=`<div class="lab-empty">LAB을 불러오지 못했습니다. ${esc(error.message)}</div>`;conn.textContent='연결 오류';}}
document.querySelector('#lab-index').onclick=e=>{const b=e.target.closest('[data-slug]');if(b){selected=b.dataset.slug;render();}};
document.querySelector('#reload').onclick=load;
load();
