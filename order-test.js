'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = v => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 2);
  const list = v => Array.isArray(v) ? v : v ? [v] : [];
  const facts = [['category','제품 종류'],['benefit','핵심 효용'],['ingredients','성분 / 소재'],['feature','차별점'],['usage','사용 방법'],['size','용량 / 규격'],['price','가격 / 구성'],['caution','주의 / 금지 표현']];
  const kinds = {product:'제품',person:'인물',place:'장소'};
  const editable = ['title','product','brand','description','url','audience','point','product_change','hook_link','copy','tone','person','place','reaction','ending','notes','facts','selected_hook','selection_mode','order','anchor_prompts'];
  const hooks = Array.isArray(window.ORDER_HOOKS) ? window.ORDER_HOOKS.filter(h=>h.adEvidenceVerified===true&&(h.evidence||[]).length>0&&(h.evidence||[]).every(e=>{const s=window.ORDER_REFERENCE_SOURCES?.[e.url];return s?.adClassification==='confirmed_ad'&&s.catalogueIdentityMatch!==false;})) : [];
  const state = {connected:false,health:{},endpoint:'http://127.0.0.1:8767',key:'',cases:Array.from({length:4},(_,i)=>({title:`소재 ${i+1}`,facts:{},assets:[],drafts:[],productions:[],selection_mode:'recommended'})),index:0,dirty:new Set(),version:new Map(),saving:new Map(),busy:new Map(),picked:new Map(),blobs:new Map(),loadingBlobs:new Set(),page:40,ranking:[],random:[],connection:0};
  let saveTimer;
  const current = () => state.cases[state.index];
  const notice = (message, error=false) => { $('#notice').textContent=message; $('#notice').classList.toggle('error',error); };
  const message = error => error?.message || String(error);
  function urlFor(path) {
    const base = new URL(state.endpoint);
    const target = new URL(path, base);
    if(target.origin!==base.origin || !target.pathname.startsWith('/api/')) throw new Error('브리지 외부의 비공개 파일 주소는 열 수 없습니다.');
    return target.href;
  }
  async function api(path, body, method, binary=false) {
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(urlFor(path), {method:method || (body===undefined?'GET':'POST'),headers:{Authorization:`Bearer ${state.key}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit',targetAddressSpace:'loopback',redirect:'error',referrerPolicy:'no-referrer'});
      if(!response.ok) {
        let detail; try {detail=await response.json();} catch {}
        if(response.status===401) {state.connected=false; updateControls(); renderHealth();}
        throw new Error(detail?.error || `요청 실패 (HTTP ${response.status})`);
      }
      return binary ? response.blob() : response.json();
    } catch(e) {
      if(e.name==='AbortError') throw new Error('서버 응답 시간이 초과됐습니다. 연결 상태를 확인한 뒤 다시 시도하세요.');
      if(e instanceof TypeError) throw new Error('로컬 서버에 연결할 수 없습니다. 이 PC의 127.0.0.1:8767 서버 실행, 연결 주소, 브라우저의 로컬 네트워크 접근 권한을 확인하세요. HTTPS 페이지에서는 브라우저의 혼합 콘텐츠 정책으로 차단될 수 있습니다.');
      throw e;
    } finally {clearTimeout(timeout);}
  }
  function cleanBlobs() {for(const url of state.blobs.values()) URL.revokeObjectURL(url);state.blobs.clear();state.loadingBlobs.clear();}
  function renderTabs() {
    $('#case-tabs').innerHTML=state.cases.map((c,i)=>`<button type="button" data-case="${i}" class="${i===state.index?'active':''}" aria-current="${i===state.index?'page':'false'}"><b>0${i+1}</b><span>${esc(c.title||`소재 ${i+1}`)}${state.dirty.has(c.id)?' ·':''}</span></button>`).join('');
    $('#case-heading').textContent=current().title||`소재 ${state.index+1}`;
  }
  function renderHealth() {
    const h=state.health;
    $('#health').textContent=!state.connected?'● 연결 안 됨':`● 로컬 연결 · 사진용 GPT ${h.gptConnected?'브라우저 감지':'연결 필요'} · 아스트라 준비 ${h.astraDirectReady===true?'가능':'연결 필요'}`;
    $('#health').title=h.astraStatus||'제작 준비와 구방식 프롬프트 요청의 연결 상태는 별개입니다.'; $('#astra-connection-status').textContent=state.connected?(h.astraStatus||'아스트라 자동 전달 연결 확인 필요'):'로컬 연결 후 아스트라 전달 상태를 확인합니다.';
  }
  const storyFields=['product_change','hook_link'];
  const storyStorageKey=c=>`order-test-story-v1:${state.endpoint}:${c.id}`;
  function restoreLocalStory(c) {
    try {const saved=JSON.parse(localStorage.getItem(storyStorageKey(c))||'null');if(saved&&storyFields.every(k=>typeof saved[k]==='string')){for(const k of storyFields)c[k]=saved[k];c._storyLocal=true;}}catch{}
  }
  function confirmStoryStorage(c,response,payload) {
    if(!storyFields.some(k=>payload[k]!==undefined))return;
    const fallback=storyFields.some(k=>payload[k]!==undefined&&response?.[k]!==payload[k]);
    try {if(fallback)localStorage.setItem(storyStorageKey(c),JSON.stringify(Object.fromEntries(storyFields.map(k=>[k,payload[k]||'']))));else localStorage.removeItem(storyStorageKey(c));}
    catch {if(fallback)throw new Error('새 관계 입력을 보관하지 못했습니다. 작업 서버를 새 버전으로 실행한 뒤 저장하세요. 입력은 현재 화면에 유지됩니다.');}
    c._storyLocal=fallback;
  }
  function updateSaveState() {
    const c=current();
    $('#save-state').textContent=!state.connected?'연결 대기':state.saving.has(c.id)?'저장 중…':state.dirty.has(c.id)?'저장되지 않은 변경':c._storyLocal?'저장됨 · 새 관계 입력은 이 브라우저 보관':'저장됨';
  }
  function updateControls() {
    const c=current(), busy=state.busy.has(c.id), enabled=state.connected&&!!c.id;
    $('#brief-fields').disabled=!enabled;$('#facts-fields').disabled=!enabled;
    $('#order-editor').disabled=!enabled;
    $$('[data-mutate]').forEach(el=>{el.disabled=!enabled||busy;});
    $$('#anchors textarea').forEach(el=>el.disabled=!enabled||busy);
    $$('#assets select, #assets input').forEach(el=>el.disabled=!enabled||busy);
    $$('[data-select-hook]').forEach(el=>el.disabled=!enabled||busy);
    $$('[data-mode]').forEach(el=>el.disabled=!enabled||busy);
    $$('#anchors button').forEach(el=>{el.disabled=!enabled||busy||!state.health.gptConnected;el.title=state.health.gptConnected?'':'사진 생성용 GPT 브라우저 연결이 필요합니다.';});
    $('#draft').disabled=!enabled||busy||!state.health.codexAvailable;
    $('#draft').title=state.health.codexAvailable?'구방식: 문자 프롬프트만 반환하며 아스트라 직접 제작 준비와 별개입니다.':'구방식 프롬프트 연결이 필요합니다.';
    $('#astra-prepare').disabled=!enabled||busy||state.health.astraDirectReady!==true;
    $('#astra-prepare').title=state.health.astraDirectReady===true?'오더·사진을 별도 아스트라 세션으로 전달해 준비합니다. 영상 제출은 하지 않습니다.':'아스트라 제작 준비 연결이 필요합니다. 연결 확인을 다시 실행하세요.';
    $('#task-state').textContent=state.busy.get(c.id)||'';$('#task-state').classList.toggle('busy',busy);
    updateSaveState();
  }
  function changed() {
    renderOrderFrame(); const c=current(); if(!state.connected||!c.id)return;
    state.dirty.add(c.id);state.version.set(c.id,(state.version.get(c.id)||0)+1);
    updateSaveState();renderTabs();clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>save(c).catch(e=>notice(`저장 실패: ${message(e)} 입력 내용은 현재 화면에 유지됩니다. 변경 저장을 눌러 다시 시도하세요.`,true)),1100);
  }
  async function save(c=current()) {
    if(!state.connected)throw new Error('먼저 브리지를 연결하세요.');
    if(state.saving.has(c.id)) {await state.saving.get(c.id);if(state.dirty.has(c.id))return save(c);return;}
    if(!state.dirty.has(c.id))return;
    const version=state.version.get(c.id); const payload={};
    for(const key of editable)if(c[key]!==undefined)payload[key]=c[key];
    const pending=api(`/api/cases/${c.id}`,payload,'PUT');state.saving.set(c.id,pending);updateSaveState();
    try {const response=await pending;confirmStoryStorage(c,response,payload);if(version===state.version.get(c.id))state.dirty.delete(c.id);}
    finally {state.saving.delete(c.id);updateSaveState();renderTabs();}
  }
  async function refresh(c) {
    const fresh=await api(`/api/cases/${c.id}`);
    if(fresh.selected_assets){c.selected_assets=fresh.selected_assets;state.picked.delete(c.id);}
    for(const key of ['assets','drafts','productions','research','selected_assets'])c[key]=fresh[key]|| (key==='research'?null:[]);
    if(current().id===c.id){renderAssets();renderResearch();renderDrafts();renderTabs();}
  }
  function renderCase() {
    const c=current(); renderTabs();
    $$('[data-field]').forEach(el=>el.value=c[el.dataset.field]||'');
    $('#facts-fields').innerHTML=facts.map(([key,label])=>`<label>${label}<input data-fact="${key}" value="${esc(text(c.facts?.[key]))}" placeholder="확인 후 입력"></label>`).join('');
    $('#order-editor').value=c.order||'';
    renderResearch();renderAssets();renderAnchors();renderDrafts();rankHooks();renderHooks();renderOrderFrame();updateControls();
  }
  function renderResearch() {
    const r=current().research;
    if(!r){$('#research-content').textContent='아직 수집한 정보가 없습니다.';return;}
    $('#research-content').innerHTML=`<p>수집 상태: ${esc(r.status||'완료')}</p>${esc(r.text||'')}<pre>${esc(text(r.facts||{}))}</pre>${list(r.sources).map(s=>{const u=s.url||s;return safePublic(u)?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s.title||u)}</a>`:'';}).join('')}`;
  }
  function selectedAssets(c=current()) {
    if(!state.picked.has(c.id)) {
      const picks={...(c.selected_assets||{})}; for(const kind of Object.keys(kinds)) {const asset=list(c.assets).find(a=>a.kind===kind);if(asset&&!picks[kind])picks[kind]=asset.id;}
      state.picked.set(c.id,picks);
    }
    return state.picked.get(c.id);
  }
  function renderAssets() {
    const c=current(),picks=selectedAssets(c);
    for(const kind of Object.keys(kinds))if(!list(c.assets).some(a=>a.id===picks[kind]&&a.kind===kind))delete picks[kind];
    $('#assets').innerHTML=list(c.assets).length?c.assets.map(a=>`<div class="asset"><img data-asset="${esc(a.id)}" alt="${esc(a.filename||'등록 사진')}" ${state.blobs.has(a.id)?`src="${esc(state.blobs.get(a.id))}"`:''}><p title="${esc(a.filename)}">${esc(a.filename||a.id)}</p><small class="asset-quality">${a.provenance?.type==='local_ai_upscale'?'AI 확대본 · 작은 글씨 대조 필요':'원본 사진'} · ${Number(a.width)||'?'} × ${Number(a.height)||'?'} px</small>${a.kind==='product'?`<button class="quiet photo-quality-button" data-upscale="${esc(a.id)}" data-mutate>${a.provenance?.type==='local_ai_upscale'?'원본과 비교':'제품 영역 확인 · AI 2K'}</button>`:''}<select data-role="${esc(a.id)}" aria-label="${esc(a.filename)} 역할"><option value="">역할 미지정</option>${Object.entries(kinds).map(([key,label])=>`<option value="${key}" ${a.kind===key?'selected':''}>${label}</option>`).join('')}</select>${a.kind?`<label class="check"><input type="radio" name="pick-${esc(a.kind)}" data-pick="${esc(a.id)}" data-kind="${esc(a.kind)}" ${picks[a.kind]===a.id?'checked':''}>${kinds[a.kind]||'사진'} 전달 선택</label>`:''}</div>`).join(''):'<p class="empty">등록한 사진이 없습니다.<br>실제 제품사진부터 올려 주세요.</p>';
    for(const a of list(c.assets))loadAsset(a);
    updateControls();
  }
  async function loadAsset(a) {
    if(!a.url||state.blobs.has(a.id)||state.loadingBlobs.has(a.id)||!state.connected)return;
    const connection=state.connection;state.loadingBlobs.add(a.id);
    try {const blob=await api(a.url,undefined,undefined,true);if(connection!==state.connection)return;const url=URL.createObjectURL(blob);state.blobs.set(a.id,url);$$('[data-asset]').filter(el=>el.dataset.asset===a.id).forEach(el=>el.src=url);}
    catch(e){if(connection===state.connection)notice(`사진 불러오기 실패: ${message(e)}`,true);}
    finally {state.loadingBlobs.delete(a.id);}
  }
  function renderAnchors() {
    const c=current();
    $('#anchors').innerHTML=`<p class="hint">${state.health.gptConnected?'사진용 GPT 브라우저 감지 · 생성 요청 때 로그인 상태를 확인합니다.':'GPT 브라우저 연결 필요 · 사진 생성은 연결 확인 후 사용할 수 있습니다. 기존 사진 업로드와 역할 지정은 가능합니다.'}</p>`+Object.entries(kinds).map(([key,label])=>`<div class="anchor"><div class="anchor-head"><h3>${label} 앵커</h3><span>구독 GPT</span></div><label class="sr-only" for="anchor-${key}">${label} 앵커 생성 요청</label><textarea id="anchor-${key}" data-anchor="${key}" rows="3" placeholder="${label} 사진을 어떻게 만들까요?${key==='product'?' 제품 원본사진 첨부 필수':''}">${esc(c.anchor_prompts?.[key]||'')}</textarea><button data-generate="${key}" data-mutate>구독 GPT로 만들기 · ${label}</button></div>`).join('');
  }
  const safePublic = value => {try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
  function normalized(v) {return text(v).toLocaleLowerCase().normalize('NFKC');}
  function renderEvidence(e) {
    const excerpt=clipUrl(e.clip)?`<p>훅 관찰 기록: ${esc(e.observed||'미확인')}<br>첫 1초: ${e.firstSecond===true?'관찰됨':e.firstSecond===false?'효과 미관찰':'미확인'}</p><video controls playsinline preload="none" data-clip="${esc(clipUrl(e.clip))}" aria-label="${esc(e.title||'훅 발췌')}"></video>`:'';
    return window.OrderReferenceMedia.render(e,excerpt);
  }
  function renderHooks() {
    const c=current(),mode=c.selection_mode||'recommended';
    $$('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.mode===mode)));
    $('#mode-description').textContent=mode==='recommended'?'입력한 제품 단어와 재질·사용 동작을 바탕으로 정렬합니다. 연결 이유를 확인하고 선택하세요.':mode==='random'?'전체 카탈로그에서 무작위로 섞습니다. 점수와 관계없이 노출되며 낮은 점수의 훅도 포함됩니다. 실제 적합성을 검토하세요.':'이름·원리·카테고리를 검색해 직접 선택하세요. 점수는 제품 단어와 재질의 연결 정도입니다.';
    $('#refresh-hooks').textContent=mode==='random'?'전체에서 다시 섞기':'추천 점수 새로 계산';
    const query=normalized($('#hook-search').value),family=$('#family-filter').value,category=$('#category-filter').value;
    if(mode==='random'&&!state.random.length)shuffle();
    const ordered=mode==='recommended'?state.ranking.map(r=>r.h):mode==='random'?state.random:hooks;
    const found=ordered.filter(h=>(!query||normalized([h.title,h.summary,h.trigger,h.effect,...list(h.productSignals)].join(' ')).includes(query))&&(!family||h.family===family)&&(!category||list(h.categories).includes(category)));
    $('#hook-count').textContent=`${hooks.length}개 훅`;
    $('#match-count').textContent=`${found.length}개 중 ${Math.min(state.page,found.length)}개 표시`;
    const chosen=hooks.find(h=>String(h.id)===String(c.selected_hook));
    $('#selected-hook').innerHTML=chosen?`<strong>선택: ${esc(chosen.title)}</strong><br>${esc(chosen.trigger||chosen.summary||'')}<br><small>${esc(match(chosen).reason)}</small>`:(c.selected_hook?'기존 선택은 광고 근거 미확인으로 보류됐습니다. 확인된 훅을 다시 선택하세요. 저장 오더는 유지됩니다.':'선택한 훅이 없습니다. 광고 근거를 검토한 후 선택하세요.');
    window.OrderReferenceMedia.dispose($('#hooks'));
    $('#hooks').innerHTML=found.slice(0,state.page).map(h=>{
      const score=match(h), evidence=list(h.evidence),hasClip=evidence.some(e=>clipUrl(e.clip));
      return `<article class="hook-card ${String(c.selected_hook)===String(h.id)?'selected':''}"><div class="meta"><span>${esc(h.family||'미분류')} · ${h.kind==='variant'?'변형':'원리'} · 광고 근거 확인</span><span>${esc(h.difficulty||'')}</span></div><h3>${esc(h.title)}</h3><p>${esc(h.summary||'')}</p><p><b>시작</b> ${esc(h.trigger||'')}<br><b>효과</b> ${esc(h.effect||'')}<br><b>반응</b> ${esc(h.reaction||'')}</p><p class="score">${score.score}점 · ${esc(score.reason)}</p><p>${hasClip?'기존 영상 부분 관찰 · 신규 적용 성공 검증과 별도':esc(h.evidenceLabel||'광고 의뢰 근거 확인 · 본편 출처 연결')}${h.excludedEvidenceCount?` · 미확인 근거 ${h.excludedEvidenceCount}개 분리`:''}</p><p class="hint">근거 설명: ${esc(evidence[0]?.observed||'관찰 기록 없음')}<br>근거 상태: ${esc(h.evidenceStatus||'미확인')}${h.variantOf?` · 원리: ${esc(h.variantOf)}`:''}</p>${list(h.limitations).length?`<p class="hint">한계: ${esc(list(h.limitations).slice(0,2).join(' / '))}</p>`:''}<details><summary>전체 영상 · 제품 적용 예시 (${evidence.length})</summary>${(h.applications||[]).length?`<div class="hook-applications"><b>제품 적용안 · 저자 제안 / 생성 미검증</b>${h.applications.map(x=>`<p><b>${esc(x.product)}</b><br>${esc(x.application_ko)}<br><small>${esc(x.why_ko)}</small></p>`).join('')}</div>`:`<p>저자 적용 예시: ${esc(h.example||'등록되지 않음')}</p>`}${evidence.map(renderEvidence).join('')}</details><button data-select-hook="${esc(h.id)}" class="${String(c.selected_hook)===String(h.id)?'lime':'quiet'}">${String(c.selected_hook)===String(h.id)?'선택됨 ✓':'이 훅 선택'}</button></article>`;
    }).join('')||`<p class="empty">${hooks.length?'검색 조건에 맞는 훅이 없습니다.':'카탈로그를 불러오지 못했습니다. order-test-hooks.js 파일을 확인하고 새로고침하세요.'}</p>`;
    $('#more-hooks').hidden=found.length<=state.page;updateControls();
  }
  const materialTraits = [
    {pattern:/참기름|소스|오일|시럽|음료|주스|탄산|커피|샴푸|세제|향수/, words:['액체','흐름','방울','분출'],label:'액체의 흐름'},
    {pattern:/탄산|사이다|콜라|발포|스파클링/, words:['기포','폭풍','분출','팽창'],label:'탄산·발포'},
    {pattern:/참기름|소스|노즐|스퀴즈|펌프|짜서|짜는/,words:['노즐','입구','방울','줄기'],label:'입구에서 나오는 재료'},
    {pattern:/크림|젤|밤|립마스크|보습|로션|에센스/,words:['젤','리본','감싸','피부','막'],label:'젤·크림의 질감'},
    {pattern:/종이|노트|문구|수첩|책|페이지|카드/,words:['종이','접힘','페이지','펼쳐','무대'],label:'종이·접히는 면'},
    {pattern:/반려|강아지|고양이|노즈워크|펫/,words:['동물','반응','장난감','살아','놀이'],label:'반려동물의 놀이'},
    {pattern:/향|꽃|캔들|식물|허브|아로마/,words:['향','꽃','재료','자라','공간'],label:'향과 식물 재료'},
    {pattern:/과자|스낵|칩|쿠키|바삭|깨|곡물|가루/,words:['조각','증식','가루','씨앗','연쇄'],label:'작은 알갱이·조각'},
    {pattern:/옷|의류|원단|가방|천|패브릭|수건/,words:['원단','천','흐르','감싸','윤곽'],label:'움직이는 원단'},
    {pattern:/램프|조명|LED|빛|전구/,words:['빛','그림자','광점','반사'],label:'제품의 빛'},
    {pattern:/청소|정리|수납|주방|가전|기계|블렌더/,words:['연쇄','분리','골조','조립','안쪽'],label:'제품의 구조·작동'}
  ];
  function match(h) {
    const c=current();
    const input=normalized([c.product,c.brand,c.description,c.point,...['category','ingredients','feature','usage'].map(k=>text(c.facts?.[k]))].join(' '));
    const hookText=normalized([h.title,h.summary,h.trigger,h.effect,...list(h.productSignals)].join(' '));
    const stop=new Set(['있는','제품','작은','보이는','사람','같은','여러','큰다','함께','주변','자체','따라','처럼','효과','공간','판매','시점','가능','필요','발원점']);
    const tokens=[...new Set(list(h.productSignals).join(' ').split(/[\s/·,()]+/).filter(t=>t.length>=2&&!stop.has(t)))];
    const exact=tokens.filter(t=>input.includes(normalized(t)));
    const materialInput=normalized([c.product,c.facts?.category,c.facts?.feature,c.facts?.usage].map(text).join(' '));
    const related=materialTraits.filter(t=>t.pattern.test(materialInput)&&t.words.some(w=>hookText.includes(w)));
    const raw=exact.length*12+related.length*9;
    const unsupported=h.evidenceStatus==='author_proposal'?9:0;
    const difficulty=h.difficulty==='어려움'?3:0;
    const requiresCarbonation=/탄산|발포/.test(list(h.productSignals).join(' '))&&!/탄산|발포|사이다|콜라|스파클링/.test(input)?9:0;
    const score=Math.max(0,Math.min(100,raw-unsupported-difficulty-requiresCarbonation));
    const reasons=[...exact.slice(0,2).map(t=>'입력의 '+t),...related.slice(0,2).map(t=>t.label)];
    return {score,reason:(reasons.length?reasons.join(' · ')+'과 연결':'직접 연결 근거가 적음 · 선택 후 아이디어 검토')+(unsupported?' · 원작 근거 없는 제안 -9':'')+(difficulty?' · 구현 어려움 -3':'')+(requiresCarbonation?' · 탄산/발포 입력 없음 -9':'')};
  }
  function rankHooks() {state.ranking=hooks.map(h=>({h,score:match(h).score})).sort((a,b)=>b.score-a.score||String(a.h.id).localeCompare(String(b.h.id)));}
  function shuffle() {state.random=[...hooks];for(let i=state.random.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.random[i],state.random[j]]=[state.random[j],state.random[i]];}}
  function clipUrl(value) {
    if(typeof value!=='string'||!value)return '';
    try {const url=new URL(value,location.href);const root=new URL('order-test-media/',location.href);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return '';return url.href;}catch{return '';}
  }
  function renderDrafts() {
    renderProductions();
    $('#drafts').innerHTML=list(current().drafts).slice().reverse().map((d,i)=>`<article class="draft"><h3>프롬프트만 받은 기록 · 구방식 ${list(current().drafts).length-i}</h3><small>gpt-6-astra · ${esc(d.created_at||'')} ${d.session_id?`· 세션 ${esc(d.session_id)}`:''}</small><pre>${esc(text(d.prompt))}</pre>${d.rationale_ko?`<p>${esc(text(d.rationale_ko))}</p>`:''}${d.image_order?`<p>이미지 순서: ${esc(text(d.image_order))}</p>`:''}<button class="quiet" data-copy-draft="${list(current().drafts).length-1-i}">프롬프트 복사</button></article>`).join('');
  }
  function renderProductions() {
    const records=list(current().productions);
    $('#productions').innerHTML=records.slice().reverse().map((entry,i)=>{
      const result=entry?.result&&typeof entry.result==='object'?entry.result:entry;
      const prepared=result?.mode==='prepare'&&result?.status==='prepared'&&result?.submitted_count===0;
      const count=Number.isInteger(result?.submitted_count)?String(result.submitted_count):'미확인';
      return `<article class="draft"><h3>아스트라 제작 준비 ${records.length-i} · ${prepared?'준비됨':esc(result?.status||entry?.status||'상태 확인 필요')}</h3><p>${prepared?'영상 제출 0회 · 실제 유료 생성은 Dan 새 승인 필요':`기록상 제출 수: ${esc(count)} · 준비 완료 여부를 확인하세요.`}</p>${result?.prompt?`<pre>${esc(text(result.prompt))}</pre><button class="quiet" data-copy-production="${records.length-1-i}">준비 프롬프트 복사</button>`:''}${result?.rationale_ko?`<p>${esc(text(result.rationale_ko))}</p>`:''}${list(result?.storyboard).length?`<details open><summary>아스트라 연출 설계</summary>${list(result.storyboard).map(b=>`<p><b>${esc(text(b.beat))}</b> · ${esc(text(b.visual))}<br><small>${esc(text(b.purpose))} · 연결: ${esc(text(b.transition))}</small></p>`).join('')}</details>`:''}${list(result?.acceptance_criteria).length?`<details open><summary>생성 후 판단 기준 · 아직 검증 전</summary>${list(result.acceptance_criteria).map(c=>`<p><b>${esc(text(c.target))}</b><br>통과: ${esc(text(c.pass_if))}<br>실패: ${esc(text(c.fail_if))}</p>`).join('')}</details>`:''}${result?.error||entry?.error?`<p>${esc(text(result?.error||entry?.error))}</p>`:''}<details><summary>준비 기록 · 연결 정보</summary><p>세션: ${esc(text(result?.thread_id)||'미확인')}<br>턴: ${esc(text(result?.turn_id)||'미확인')}<br>모드: ${esc(text(result?.mode)||'미확인')}<br>상태: ${esc(text(result?.status)||entry?.status||'미확인')}<br>제출 수: ${esc(count)}</p><small>${esc(entry?.created_at||result?.created_at||'')}</small></details></article>`;
    }).join('')||'<p class="empty">아직 아스트라 제작 준비 기록이 없습니다. 구방식 프롬프트 기록과 별도로 보관됩니다.</p>';
  }
  function astraPreparePayload(c) {
    if(state.health.astraDirectReady!==true)throw new Error('아스트라 제작 준비 연결이 필요합니다.');
    if(!text(c.product).trim())throw new Error('제품명을 먼저 입력하세요.');
    const h=hooks.find(h=>String(h.id)===String(c.selected_hook));
    if(c.selected_hook&&!h)throw new Error('보류된 훅을 강제하지 않습니다. 선택을 해제하면 제작자가 제품에 맞춰 판단합니다.');
    if(h&&(!text(h?.trigger).trim()||!text(h?.effect).trim()))throw new Error('선택한 훅의 근거가 부족합니다. 선택을 해제하거나 확인된 훅을 사용하세요.');
    if(!text(c.order).trim())throw new Error('제작 오더를 먼저 작성하세요.');
    const usage=text(c.facts?.usage).trim();
    const picks=selectedAssets(c),asset_ids=Object.keys(kinds).map(kind=>picks[kind]);
    if(asset_ids.some((id,i)=>!id||!list(c.assets).some(a=>a.id===id&&a.kind===Object.keys(kinds)[i]))||new Set(asset_ids).size!==3)throw new Error('제품·인물·장소 사진을 한 장씩 지정하고 전달 선택하세요.');
    return {order:withDirectorRequest(c.order),asset_ids,frame:{opening:text(h?.trigger).trim(),action:[usage,c.point?`제품 포인트: ${c.point}`:'',c.product_change?`제품이 만드는 변화: ${c.product_change}`:'',c.hook_link?`훅과의 연결: ${c.hook_link}`:'',text(h?.effect).trim()].filter(Boolean).join(' / '),reaction:c.reaction,ending:c.ending}};
  }
  async function operation(label,fn,c=current()) {
    if(state.busy.has(c.id))return;
    state.busy.set(c.id,label);updateControls();
    try {await save(c);await fn(c);notice('완료했습니다. 결과를 확인하세요.');}
    catch(e){notice(`${label} 실패: ${message(e)}`,true);}
    finally {state.busy.delete(c.id);updateControls();}
  }
  async function task(c,action,payload) {
    const connection=state.connection;
    const started=await api(`/api/cases/${c.id}/${action}`,payload);
    if(!started.task_id)throw new Error('서버가 작업 ID를 반환하지 않았습니다.');
    const taskId=started.task_id;
    for(let i=0;i<1200;i++) {
      if(connection!==state.connection)throw new Error(`연결이 바뀌어 작업 확인을 중단했습니다. 작업 ID: ${taskId}`);
      const t=await api(`/api/tasks/${encodeURIComponent(taskId)}`);
      if(t.status==='failed'){if(action==='astra_prepare')try{await refresh(c);}catch{}throw new Error(t.error||'작업 실패');}
      if(t.status==='completed'){await refresh(c);return t.result;}
      if(!['queued','running'].includes(t.status))throw new Error(`알 수 없는 작업 상태: ${t.status}`);
      state.busy.set(c.id,`${action==='astra_prepare'?'아스트라 제작 준비 · 생성 없음':action==='draft'?'프롬프트만 받기 · 구방식':action==='collect'?'제품 정보 수집':action==='upscale'?'로컬 AI 2K 확대 · 영상 생성 없음':'GPT 앵커 생성'} · ${t.status==='queued'?'대기 중':'진행 중'} · ${taskId.slice(0,8)}`);updateControls();
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw new Error(`작업 확인 시간이 초과됐습니다. 중복 요청 전 서버 상태를 확인하세요. 작업 ID: ${taskId}`);
  }
  async function copy(value) {if(!value){notice('복사할 내용이 없습니다.',true);return;}try{await navigator.clipboard.writeText(value);notice('클립보드에 복사했습니다.');}catch{notice('클립보드 접근이 차단됐습니다. 텍스트를 선택해 직접 복사하세요.',true);}}
  const directorRequest = "아스트라 연출 설계 요청: 테스트는 Seedance 2.5 / 480p / draft:true이며 실제 도구 설정에 반영한다. Draft 미지원·누락·보정 시 일반 모드로 바꿔 제출하지 말고 보고한다. 위 오더의 제품 포인트·핵심 행동·변화·반응·마무리를 유지하면서 장면 구성, 카메라, 전환과 리듬을 설계하고 이유를 짧게 설명한다. 공통 컷 수나 초 배분은 고정하지 않는다. 제품 사용과 변화가 같은 행동으로 이어지도록 설계한다. 음식·상황·인물·훅·반응·마무리가 미지정이면 제품 근거와 광고 목표로 제작자가 선택하고 이유를 남긴다. 브랜드·제품과 핵심 포인트를 짧은 한국어 음성으로도 전달하고 BGM이 가리지 않게 한다. 제품을 다른 상품으로 바꿔도 그대로인 볼거리나 음식만 기억되는 기획은 다시 고친다. 제품사실과 저자 연출안을 구분하며 효능·우위·후기는 발명하지 않는다. product_strategy에 제품포인트·메시지·선택맥락·선택이유·탈락대안·훅인과·음성대사·전달채널·앵커필요를 기록한다. 영상에서 확인할 제품 정체성·사용인과·음성메시지·제품에 종속된 볼거리·외형보존의 5개 판단 기준을 각각 관찰 가능한 통과·실패 조건으로 작성한다. 미리 성공했다고 평가하지 않는다. 결과는 연출안·설계 이유·최종 모델용 프롬프트 초안·판단 기준으로 구분한다. 오더 작성·제작 준비 단계는 기획 검토만 하며 이미지·영상 생성, 업로드, 유료 실행과 발주는 하지 않는다. 실제 제작은 Dan의 별도 승인 뒤에만 진행한다.";
  const withDirectorRequest = order => text(order).includes("아스트라 연출 설계 요청:") ? order : `${order}\n\n${directorRequest}`;
  function orderSegments() {
    const c=current(),h=hooks.find(h=>String(h.id)===String(c.selected_hook));
    const f=value=>({value}),v=(label,value)=>({label,value:value||`[${label} 미지정 · 제품 근거로 제작자 판단]`});
    return [
      [f('시댄스 2.5, 15초 영상, 480p, Draft 켜기(draft:true), 9대16, 소리 포함 기준')],
      [v('브랜드·제품',[c.brand,c.product].filter(Boolean).join(' ')),f(' 15초 CF(실사) - '),v('인물',c.person),f(', '),v('장소',c.place),f(', '),v('사용 동작',text(c.facts?.usage).trim()||h?.trigger),f('.')],
      [f('제품 포인트: '),v('제품 포인트',c.point),f('.')],
      [f('제품이 만드는 변화: '),v('제품이 만드는 변화',c.product_change),f('.')],
      [f('훅과의 연결: '),v('훅과의 연결',c.hook_link),f('.')],
      [v('훅 이름',h?.title),f(': '),v('효과',h?.orderEffect||h?.effect||h?.summary),f('.')],
      [f('반응: '),v('반응',c.reaction),f('. 마무리: '),v('마무리',c.ending),f('. 광고 문법(훅→사용·효과→반응→마무리).')],
      [f('제품명: '),v('제품명',c.product),f(', 브랜드: '),v('브랜드',c.brand),f('. 톤: '),v('톤',c.tone),f('. BGM필수.')],
      [f('시트: 제품/인물/장소 (첨부 순서 동일). 제품 외형·표기 유지.')],
      [f('글자 후반 합성. '),v('카피',c.copy?`“${c.copy}”`:'지정 카피 없음 · 임의 카피 생성 금지')],
      [f(directorRequest)]
    ];
  }
  function renderOrderFrame() {
    const rows=orderSegments();
    $('#order-frame-preview').innerHTML=rows.map(row=>`<p>${row.map(part=>`<span class="frame-part ${part.label?'variable':'fixed'}"><small>${esc(part.label?'변경 · '+part.label:'고정')}</small>${esc(part.value)}</span>`).join('')}</p>`).join('');
    $('#frame-sync').textContent=current().order?'입력·훅에 따른 조립 미리보기입니다. 아래 저장 오더는 직접 편집할 수 있으며, 다시 만들기를 눌러야 새 입력이 반영됩니다.':'입력과 훅 선택이 이 자리에 반영됩니다. 오더 생성 시 아래 편집기에 같은 문장이 들어갑니다.';
  }
  function composeOrder() {
    const c=current(),h=hooks.find(h=>String(h.id)===String(c.selected_hook));
    if(!c.product?.trim())throw new Error('제품명을 먼저 입력하세요.');
    if(!h)throw new Error('사용할 훅을 먼저 선택하세요.');
    if(!text(c.point).trim()||!text(c.product_change).trim()||!text(c.hook_link).trim())throw new Error('제품 포인트, 제품이 만드는 변화, 훅과의 연결을 채워 주세요. 제품이 어떻게 사건을 만드는지 적어 주세요.');
    const lines=orderSegments().map(row=>row.map(part=>part.value).join(''));
    if(c.audience)lines.push(`타깃: ${c.audience}`);
    if(c.description)lines.push(`제품 설명: ${c.description}`);
    const known=facts.filter(([key])=>key!=='usage'&&text(c.facts?.[key]).trim()).map(([key,label])=>`${label}: ${text(c.facts[key])}`);
    if(known.length)lines.push(`확인 사실: ${known.join(' / ')}`);
    if(c.notes)lines.push(`추가 지시: ${c.notes}`);
    lines.push('미확인 효능·수치는 만들지 말 것. 실제 영상 생성·제출은 Dan의 새 승인 뒤에만 진행.');
    c.order=lines.filter(Boolean).join('\n');$('#order-editor').value=c.order;changed();
  }
  function prepareAnchors() {
    const c=current();c.anchor_prompts||={};
    const product=c.product||'첨부한 제품';
    const prompts={product:`첨부한 ${product} 원본사진을 기준으로 제품 기준 시트를 만들어 줘. 원본과 동일한 외형·비율·제품색·재질·포장·라벨을 유지하고 라벨 글자를 다시 쓰거나 디자인을 바꾸지 마. 원본에서 관찰 가능한 각도만 시트로 정리하고 미보이는 뒷면이나 구조는 발명하지 마. ${c.description?`제품 정보: ${c.description}. `:''}제품 식별이 쉬운 중립적인 빛과 배경.`};
    if(c.person?.trim())prompts.person=`${product}의 ${text(c.facts?.usage)||c.point||c.description||'실제 사용'} 맥락에 맞는 매력적인 성인 인물 기준 시트. 인물 지시: ${c.person}. ${c.audience?`타깃 맥락: ${c.audience}. `:''}의상은 입력한 인물 지시와 사용 맥락에 맞추고, 지시하지 않은 성별을 임의로 확정하지 마. ${c.place?`장소 맥락: ${c.place}. `:''}${c.tone?`톤: ${c.tone}. `:''}동일 인물·동일 의상으로 3면도 형식: 머리 없는 전신 정면 / 전신 후면 / 얼굴. 각 칸이 잘리지 않도록 정리. 오직 인물 기준 시트 3칸만, 단색 중립 배경. 광고 장면·제품·식탁·음식·액체 효과·문자·추가 패널은 넣지 마.`;
    if(c.place?.trim())prompts.place=`${product} 광고의 장소 기준 사진. 장소 지시: ${c.place}. ${c.facts?.usage?`실제 사용동작: ${text(c.facts.usage)}. `:'제품을 실제로 사용하는 동선과 놓을 자리를 확보. '}${c.person?`인물 사용 맥락: ${c.person}. `:''}${c.tone?`톤: ${c.tone}. `:''}첨부 제품 원본의 색을 기준으로 조화를 맞추고 제품색 자체는 바꾸지 마. 9:16 세로 구도, 제품과 사용동작이 들어갈 영역 및 후반 카피를 위한 빈 영역을 안정적으로 확보. 입력하지 않은 장소·설비를 임의로 기본 설정하지 마. 사람·손·제품·병·액체 효과·광고 장면 없이 빈 장소만. 흰밥 공기 등 입력한 정적 소품만 두고 동작은 묘사하지 마.`;
    let count=0;
    for(const [kind,prompt] of Object.entries(prompts))if(!c.anchor_prompts[kind]?.trim()){c.anchor_prompts[kind]=prompt;count++;const input=$(`#anchor-${kind}`);if(input)input.value=prompt;}
    if(count)changed();
    const missing=[!c.person?.trim()?'인물':'',!c.place?.trim()?'장소':''].filter(Boolean);
    notice(`${count}개 빈 앵커 요청 칸에 문장을 준비했습니다. 수정 후 각 생성 버튼을 눌러 주세요.${missing.length?` ${missing.join('·')} 입력 후 해당 앵커 문장을 준비할 수 있습니다.`:''}`);
  }
  function openSettings() {$('#bridge-url').value=state.endpoint;$('#bridge-key').value=state.key;if(!$('#settings').open)$('#settings').showModal();}
  async function connect(event) {
    event?.preventDefault();$('#connect').disabled=true;$('#connection-feedback').textContent='로컬 서버와 GPT 연결 상태를 확인 중…';
    if(state.dirty.size){$('#connection-feedback').textContent='저장되지 않은 변경이 있습니다. 설정을 닫고 현재 브리지에 저장한 뒤 연결을 변경하세요.';$('#connect').disabled=false;return;}
    try {
      const url=new URL($('#bridge-url').value.trim());
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('브리지의 기본 주소만 입력하세요. 예: http://127.0.0.1:8767');
      state.connection++;state.connected=false;state.endpoint=url.origin;state.key=$('#bridge-key').value.trim();if(!state.key)throw new Error('연결 키를 입력하세요.');
      const health=await api('/api/status');state.health=health;
      let response=await api('/api/cases');if(!Array.isArray(response.cases))throw new Error('소재 목록 응답 형식을 확인하세요.');
      const cases=response.cases.sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));cases.forEach(restoreLocalStory);
      while(cases.length<4)cases.push(await api('/api/cases',{title:`소재 ${cases.length+1}`}));
      cleanBlobs();state.picked.clear();state.cases=cases.slice(0,4);state.index=0;state.connected=true;
      let storageWarning='';try {if($('#remember').checked)localStorage.setItem('order-test-bridge',JSON.stringify({endpoint:state.endpoint,key:state.key}));else localStorage.removeItem('order-test-bridge');}catch{storageWarning=' 이 브라우저는 연결 설정 저장을 허용하지 않습니다.';}
      renderCase();renderHealth();$('#settings').close();
      notice(`이 PC의 로컬 서버에 연결했습니다. 클라우드 DB 연결 없음. ${health.gptConnected?'사진용 GPT 브라우저 감지됨.':'사진용 GPT 브라우저 연결이 필요합니다. 서버 담당자가 GPT_SUB9340 브라우저 세션에 로그인한 뒤 연결 설정에서 다시 확인하세요.'}${health.codexAvailable?'':' Codex 실행 상태도 확인이 필요합니다.'}${storageWarning}`);
    }catch(e){state.connected=false;renderHealth();updateControls();$('#connection-feedback').textContent=message(e);notice(message(e),true);}
    finally {$('#connect').disabled=false;}
  }
  $('#settings-open').addEventListener('click',openSettings);$('#settings-close').addEventListener('click',()=>$('#settings').close());$('#connection-form').addEventListener('submit',connect);
  $('#disconnect').addEventListener('click',()=>{
    if(state.dirty.size){$('#connection-feedback').textContent='저장되지 않은 변경이 있습니다. 먼저 변경 저장을 눌러 주세요.';return;}
    state.connection++;state.connected=false;state.key='';state.health={};cleanBlobs();try{localStorage.removeItem('order-test-bridge');}catch{}$('#bridge-key').value='';$('#remember').checked=false;renderHealth();updateControls();$('#connection-feedback').textContent='연결을 해제하고 저장 키를 삭제했습니다.';notice('연결이 해제됐습니다. 소재 데이터는 로컬 서버에 보관됩니다.');
  });
  $('#case-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-case]');if(!button)return;state.index=Number(button.dataset.case);renderCase();});
  $('#brief-fields').addEventListener('input',e=>{const key=e.target.dataset.field;if(!key)return;current()[key]=e.target.value;changed();});
  $('#facts-fields').addEventListener('input',e=>{const key=e.target.dataset.fact;if(!key)return;current().facts||={};current().facts[key]=e.target.value;changed();});
  $('#order-editor').addEventListener('input',e=>{current().order=e.target.value;changed();});
  $('#anchors').addEventListener('input',e=>{const kind=e.target.dataset.anchor;if(!kind)return;current().anchor_prompts||={};current().anchor_prompts[kind]=e.target.value;changed();});
  $('#save').addEventListener('click',async()=>{try{await save();notice('변경 내용을 저장했습니다.');}catch(e){notice(`저장 실패: ${message(e)}`,true);}});
  $('#collect').addEventListener('click',()=>operation('정보 수집',async c=>{if(!safePublic(c.url))throw new Error('공개 판매페이지 URL을 입력하세요.');await task(c,'collect',{url:c.url});if(current().id===c.id)$('#research-panel').open=true;}));
  $('#apply-facts').addEventListener('click',()=>{const c=current(), incoming=c.research?.facts||c.research;if(!incoming){notice('적용할 수집 사실이 없습니다.',true);return;}c.facts||={};let n=0;for(const [from,to] of [['title','product'],['description','description']]){const v=incoming[from]||c.research?.[from];if(!text(c[to]).trim()&&v){c[to]=text(v);const input=document.querySelector('[data-field="'+to+'"]');if(input)input.value=c[to];n++;}}for(const [key] of facts)if(!text(c.facts[key]).trim()&&incoming[key]!=null){c.facts[key]=text(incoming[key]);n++;}$$('[data-fact]').forEach(el=>el.value=text(c.facts[el.dataset.fact]));if(n)changed();notice(`${n}개의 빈 입력칸에 적용했습니다. 수집 근거를 검토하세요.`);});
  $('#upload-button').addEventListener('click',()=>$('#upload-input').click());
  $('#prepare-anchors').addEventListener('click',prepareAnchors);
  $('#upload-input').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;operation('사진 업로드',async c=>{let done=0;try{for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error(`${file.name}: PNG/JPEG/WebP/GIF 사진만 지원합니다.`);if(file.size>16*1024*1024)throw new Error(`${file.name}: 사진은 16MB 이하로 올려 주세요.`);const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('사진 읽기 실패'));reader.readAsDataURL(file);});await api(`/api/cases/${c.id}/upload`,{filename:file.name,data});done++;}}finally{await refresh(c);if(done)notice(`${done}장 업로드 완료. 역할을 지정하세요.`);}});});

  let photo=null;
  async function chooseAsset(c,id,kind='product') {
    await api(`/api/cases/${c.id}/select_asset`,{id,kind});
    state.picked.delete(c.id);await refresh(c);
  }
  async function photoURL(a) {
    if(state.blobs.has(a.id))return state.blobs.get(a.id);
    const connection=state.connection,blob=await api(a.url,undefined,undefined,true);
    if(connection!==state.connection)throw new Error('연결이 변경됐습니다. 사진을 다시 여세요.');
    const url=URL.createObjectURL(blob);state.blobs.set(a.id,url);return url;
  }
  function cropBox() {
    const w=photo.image.naturalWidth,h=photo.image.naturalHeight;
    const x=Math.max(0,Math.min(w-1,Math.round(Number($('#crop-x').value)||0)));
    const y=Math.max(0,Math.min(h-1,Math.round(Number($('#crop-y').value)||0)));
    const cw=Math.max(1,Math.min(w-x,Math.round(Number($('#crop-width').value)||w)));
    const ch=Math.max(1,Math.min(h-y,Math.round(Number($('#crop-height').value)||h)));
    return [x,y,x+cw,y+ch];
  }
  function setCrop(box) {
    ['x','y','width','height'].forEach((key,i)=>$('#crop-'+key).value=i<2?box[i]:box[i]-box[i-2]);
    paintCrop();
  }
  function paintCrop() {
    if(!photo)return;
    const img=photo.image,can=$('#crop-canvas'),ctx=can.getContext('2d'),scale=Math.min(1,1000/img.naturalWidth,650/img.naturalHeight);
    can.width=Math.round(img.naturalWidth*scale);can.height=Math.round(img.naturalHeight*scale);
    ctx.drawImage(img,0,0,can.width,can.height);ctx.fillStyle='rgba(16,30,22,.58)';ctx.fillRect(0,0,can.width,can.height);
    const [l,t,r,b]=cropBox();ctx.drawImage(img,l,t,r-l,b-t,l*scale,t*scale,(r-l)*scale,(b-t)*scale);
    ctx.strokeStyle='#d6f56b';ctx.lineWidth=3;ctx.strokeRect(l*scale,t*scale,(r-l)*scale,(b-t)*scale);
    const out=document.createElement('canvas'),previewScale=Math.min(1,1000/(r-l),1000/(b-t));out.width=Math.max(1,Math.round((r-l)*previewScale));out.height=Math.max(1,Math.round((b-t)*previewScale));out.getContext('2d').drawImage(img,l,t,r-l,b-t,0,0,out.width,out.height);
    $('#photo-original-preview').src=out.toDataURL('image/png');
    $('#photo-source-size').textContent=`원본 제품 영역 ${r-l} × ${b-t} px · 긴 변 ${Math.max(r-l,b-t)} px`;
    $('#photo-quality-warning').textContent=Math.min(r-l,b-t)<200||Math.max(r-l,b-t)<400?'제품 영역의 실제 픽셀이 매우 적습니다. 2K로 확대해도 라벨의 정확한 작은 글씨는 복구를 보장할 수 없습니다. 가능하면 더 큰 원본을 찾으세요.':'작은 글씨·뚜껑·제품 윤곽을 원본과 대조하세요. 2K 출력 크기와 원본의 실제 디테일은 다릅니다.';
    if(photo.result){photo.result=null;$('#photo-result-panel').hidden=true;$('#photo-use').disabled=true;}
  }
  async function showResult(a) {
    photo.result=a;$('#photo-result-preview').src=await photoURL(a);
    const p=a.provenance||{};
    $('#photo-result-size').textContent=`AI 확대본 ${a.width} × ${a.height} px · ${p.model||'RealESRGAN x4plus'} · 원본 별도 보존`;
    $('#photo-result-panel').hidden=false;$('#photo-use').disabled=false;
    $('#photo-feedback').textContent='확대본을 준비했습니다. 라벨과 제품 모양을 대조한 뒤 전달 사진으로 선택하세요. 자동 교체하지 않습니다.';
  }
  async function openPhoto(id) {
    const c=current(),a=list(c.assets).find(a=>a.id===id);if(!a)return;
    try {
      const derived=a.provenance?.type==='local_ai_upscale';
      const source=derived?list(c.assets).find(x=>x.id===a.provenance.source_asset_id):a;
      if(!source)throw new Error('비교할 원본 사진을 찾지 못했습니다.');
      const image=new Image();image.src=await photoURL(source);await image.decode();
      photo={c,source,image,result:null,running:false};
      $('#photo-result-panel').hidden=true;$('#photo-use').disabled=true;
      $('#photo-dialog').showModal();
      $('#photo-heading').textContent=derived?'원본과 AI 확대본 비교':'제품 영역 확인 · 로컬 AI 2K';
      setCrop(derived?a.provenance.crop_box:[0,0,image.naturalWidth,image.naturalHeight]);
      const ready=state.health.local_upscale?.ready===true;
      $('#photo-run').disabled=!ready;$('#photo-crop-controls').hidden=derived;$('#photo-run').hidden=derived;
      $('#photo-feedback').textContent=ready?'제품 전체와 뚜껑이 들어가도록 드래그하거나 숫자로 영역을 조절하세요. 이 PC에서 확대하며 유료 생성은 하지 않습니다.':'로컬 AI 확대기 연결을 확인해 주세요. 연결 설정에서 상태를 새로 확인할 수 있습니다.';
      if(derived)await showResult(a);
    }catch(e){notice(`사진 준비 실패: ${message(e)}`,true);}
  }
  $('#assets').addEventListener('click',e=>{const b=e.target.closest('[data-upscale]');if(b&&!b.disabled)openPhoto(b.dataset.upscale);});
  $('#photo-close').addEventListener('click',()=>{if(!photo?.running)$('#photo-dialog').close();});
  $('#photo-dialog').addEventListener('cancel',e=>{if(photo?.running)e.preventDefault();});
  $('#photo-dialog').addEventListener('close',()=>{photo=null;});
  for(const key of ['x','y','width','height'])$('#crop-'+key).addEventListener('change',paintCrop);
  $('#photo-reset').addEventListener('click',()=>setCrop([0,0,photo.image.naturalWidth,photo.image.naturalHeight]));
  const cropPoint=e=>{const rect=$('#crop-canvas').getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*photo.image.naturalWidth),Math.round(Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))*photo.image.naturalHeight)];};
  $('#crop-canvas').addEventListener('pointerdown',e=>{if(!photo||photo.running||$('#photo-crop-controls').hidden)return;e.preventDefault();photo.drag=cropPoint(e);e.target.setPointerCapture(e.pointerId);});
  $('#crop-canvas').addEventListener('pointermove',e=>{if(!photo?.drag||photo.running)return;const a=photo.drag,b=cropPoint(e);setCrop([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]);});
  for(const event of ['pointerup','pointercancel'])$('#crop-canvas').addEventListener(event,()=>{if(photo)photo.drag=null;});
  $('#photo-run').addEventListener('click',()=>{
    if(!photo||photo.running)return;const p=photo,box=cropBox();p.running=true;
    $('#photo-dialog').querySelectorAll('button,input').forEach(el=>el.disabled=true);
    $('#photo-feedback').textContent='이 PC에서 AI 확대 중입니다. 원본은 보존하며 완료 후 직접 선택할 수 있습니다.';
    operation('로컬 AI 2K 확대',async c=>{
      try{const result=await task(c,'upscale',{asset_id:p.source.id,crop_box:box});if(photo===p)await showResult(result.asset);}
      catch(e){if(photo===p)$('#photo-feedback').textContent=`확대 실패: ${message(e)} 원본과 기존 선택은 유지됩니다.`;throw e;}
      finally{p.running=false;$('#photo-dialog').querySelectorAll('button,input').forEach(el=>el.disabled=false);$('#photo-use').disabled=!p.result;}
    },p.c);
  });
  $('#photo-use').addEventListener('click',()=>{
    if(!photo?.result||photo.running)return;const p=photo;p.running=true;$('#photo-use').disabled=true;
    operation('확대본 전달 선택',async c=>{try{await chooseAsset(c,p.result.id);$('#photo-dialog').close();}finally{p.running=false;$('#photo-use').disabled=false;}},p.c);
  });

  $('#assets').addEventListener('change',e=>{
    if(e.target.dataset.role){const id=e.target.dataset.role,kind=e.target.value||null;operation('사진 역할 지정',async c=>{await api(`/api/cases/${c.id}/assign`,{id,kind});state.picked.delete(c.id);await refresh(c);});}
    if(e.target.dataset.pick){const id=e.target.dataset.pick,kind=e.target.dataset.kind;operation('전달 사진 선택',async c=>{await chooseAsset(c,id,kind);});}
  });

  $('#anchors').addEventListener('click',e=>{const button=e.target.closest('[data-generate]');if(!button)return;const kind=button.dataset.generate;operation('GPT 앵커 생성',async c=>{if(!state.health.gptConnected)throw new Error('GPT 브라우저 연결이 필요합니다.');const prompt=c.anchor_prompts?.[kind]?.trim();if(!prompt)throw new Error(`${kinds[kind]} 앵커 요청 문장을 입력하세요.`);const picks=selectedAssets(c);const attachment_ids=kind==='product'?(picks.product?[picks.product]:[]):[];if(kind==='product'&&!attachment_ids.length)throw new Error('제품 원본사진을 업로드하고 제품 역할로 지정·선택하세요.');const result=await task(c,'anchors',{kind,prompt,attachment_ids});if(result?.asset){await chooseAsset(c,result.asset.id,kind);}});});
  $('#modes').addEventListener('click',e=>{const button=e.target.closest('[data-mode]');if(!button||button.disabled)return;current().selection_mode=button.dataset.mode;if(button.dataset.mode==='random')shuffle();rankHooks();renderHooks();changed();});
  $('#hook-search').addEventListener('input',()=>{state.page=40;renderHooks();});$('#family-filter').addEventListener('change',()=>{state.page=40;renderHooks();});$('#category-filter').addEventListener('change',()=>{state.page=40;renderHooks();});
  $('#refresh-hooks').addEventListener('click',()=>{rankHooks();if(current().selection_mode==='random')shuffle();renderHooks();});$('#more-hooks').addEventListener('click',()=>{state.page+=40;renderHooks();});
  $('#hooks').addEventListener('click',e=>{const button=e.target.closest('[data-select-hook]');if(!button||button.disabled)return;current().selected_hook=button.dataset.selectHook;renderHooks();changed();});
  $('#hooks').addEventListener('toggle',e=>{if(e.target.open)e.target.querySelectorAll('video[data-clip]').forEach(v=>{if(!v.src)v.src=v.dataset.clip;});},true);
  $('#build-order').addEventListener('click',()=>{if(current().order?.trim())$('#replace-dialog').showModal();else try{composeOrder();}catch(e){notice(message(e),true);}});
  $('#replace-dialog').addEventListener('close',()=>{if($('#replace-dialog').returnValue==='replace')try{composeOrder();}catch(e){notice(message(e),true);}});
  $('#copy-order').addEventListener('click',()=>copy(current().order));
  $('#astra-prepare').addEventListener('click',()=>{
    const c=current();
    try {astraPreparePayload(c);} catch(e){notice(message(e),true);return;}
    operation('아스트라 제작 준비',async c=>{
      const result=await task(c,'astra_prepare',astraPreparePayload(c));
      if(!result||result.mode!=='prepare'||result.status!=='prepared'||result.submitted_count!==0||!result.thread_id||!result.turn_id||!text(result.prompt).trim())throw new Error('제작 준비 응답의 모드·상태·제출 수 또는 준비 내용을 확인할 수 없습니다. 준비 기록을 검토하세요.');
      // The server persists productions; use that history, adding only a missing immediate result.
      c.productions=list(c.productions);
      if(!c.productions.some(entry=>{const p=entry?.result||entry;return p?.thread_id===result.thread_id&&p?.turn_id===result.turn_id;}))c.productions.push(result);
      if(current().id===c.id)renderDrafts();
    },c);
  });
  $('#productions').addEventListener('click',e=>{const button=e.target.closest('[data-copy-production]');if(!button)return;const entry=list(current().productions)[Number(button.dataset.copyProduction)];copy(text((entry?.result||entry)?.prompt));});
  $('#draft').addEventListener('click',()=>operation('프롬프트만 받기 · 구방식',async c=>{if(!state.health.codexAvailable)throw new Error('프롬프트 초안용 Codex CLI 연결이 필요합니다.');if(!c.order?.trim())throw new Error('제작 오더를 먼저 작성하세요.');if(c.selected_hook&&!hooks.some(h=>String(h.id)===String(c.selected_hook)))throw new Error('기존에 선택한 훅은 광고 근거 확인을 통과하지 못해 분리됐습니다. 확인된 훅을 다시 선택해 주세요. 저장한 오더는 보존됩니다.');const picks=selectedAssets(c);const ids=Object.keys(kinds).map(k=>picks[k]);if(ids.some(id=>!id)||new Set(ids).size!==3)throw new Error('제품·인물·장소 사진을 한 장씩 지정하고 전달 선택하세요.');await task(c,'draft',{order:c.order,asset_ids:ids,model:'gpt-6-astra'});}));
  $('#drafts').addEventListener('click',e=>{const b=e.target.closest('[data-copy-draft]');if(b)copy(text(current().drafts[Number(b.dataset.copyDraft)]?.prompt));});
  window.addEventListener('beforeunload',e=>{if(state.dirty.size||state.busy.size){e.preventDefault();e.returnValue='';}});
  for(const [selector,key] of [['#family-filter','family'],['#category-filter','categories']]) {
    const values=[...new Set(hooks.flatMap(h=>list(h[key])))].filter(v=>typeof v==='string').sort((a,b)=>a.localeCompare(b,'ko'));
    $(selector).insertAdjacentHTML('beforeend',values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''));
  }
  let stored;
  try{stored=JSON.parse(localStorage.getItem('order-test-bridge')||'null');}catch{}
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('bridge')||fragment.has('key')) {state.endpoint=fragment.get('bridge')||state.endpoint;state.key=fragment.get('key')||'';try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
  else if(stored?.endpoint&&stored?.key){state.endpoint=stored.endpoint;state.key=stored.key;$('#remember').checked=true;}
  renderCase();renderHealth();$('#bridge-url').value=state.endpoint;$('#bridge-key').value=state.key;
  async function reconnectIfAllowed() {
    if(!state.key)return;
    let permission='prompt';
    try { permission=(await navigator.permissions.query({name:'loopback-network'})).state; } catch {}
    const onThisPC=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
    if(permission==='granted'||onThisPC)connect();
    else $('#connection-feedback').textContent=permission==='denied'
      ?'브라우저 주소창의 사이트 설정에서 루프백 네트워크 접근을 허용한 뒤 연결 확인을 눌러 주세요.'
      :'연결 확인을 누르고, 이 PC의 작업 서버 접근을 묻는 브라우저 알림에서 허용해 주세요.';
  }
  reconnectIfAllowed();
})();
