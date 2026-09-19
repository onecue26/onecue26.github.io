(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const hero = $('hero-video'), dialog = $('film-dialog'), player = $('film-player');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let works = [], selected = 'all', userPaused = false, lastTrigger = null;
  const icons = () => window.lucide?.createIcons();
  const icon = name => { const i = document.createElement('i'); i.dataset.lucide = name; i.setAttribute('aria-hidden','true'); return i; };
  // Only explicitly published local derivatives belong in the public portfolio.
  function mediaPath(value) { return typeof value === 'string' && /^portfolio-media\/[a-z0-9][a-z0-9._-]*\.(?:mp4|webm|jpg|png|webp)$/.test(value) ? value : null; }
  function setHeroControl() {
    const paused = hero.paused;
    $('hero-toggle').replaceChildren(icon(paused ? 'play' : 'pause'));
    $('hero-toggle').setAttribute('aria-label', paused ? '배경 영상 재생' : '배경 영상 일시정지');
    $('hero-toggle').title = paused ? '배경 영상 재생' : '배경 영상 일시정지'; icons();
  }
  function playHero() { if(!motion.matches && !userPaused && !document.hidden && !dialog.open) hero.play().catch(setHeroControl); }
  hero.addEventListener('play',setHeroControl); hero.addEventListener('pause',setHeroControl);
  $('hero-toggle').addEventListener('click', () => { userPaused = !hero.paused; if(userPaused) hero.pause(); else hero.play().catch(setHeroControl); });
  document.addEventListener('visibilitychange', () => document.hidden ? hero.pause() : playHero());
  motion.addEventListener('change', () => motion.matches ? hero.pause() : playHero());
  function openFilm(work, trigger) {
    lastTrigger = trigger; hero.pause(); $('film-title').textContent = work.title;
    $('film-type').textContent = work.label; $('film-description').textContent = work.description || '';
    $('film-error').hidden = true; player.replaceChildren(); player.poster = work.poster;
    for(const format of ['webm','mp4']) if(mediaPath(work[format])) { const source = document.createElement('source'); source.src = work[format]; source.type = 'video/'+format; player.append(source); }
    player.load(); dialog.showModal(); document.body.classList.add('modal-open'); player.play().catch(()=>{});
  }
  $('close-film').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click', e => {if(e.target === dialog) {const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close();}});
  dialog.addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.replaceChildren();player.load();document.body.classList.remove('modal-open');lastTrigger?.focus();playHero();});
  player.addEventListener('error',()=>{$('film-error').hidden=false;});
  function render() {
    const list = works.filter(w=>selected==='all'||w.category===selected); const grid=$('works'); grid.replaceChildren();
    if(!list.length){const p=document.createElement('p');p.className='loading';p.textContent='새로운 작품을 준비하고 있습니다.';grid.append(p);return;}
    for(const work of list){
      const article=document.createElement('article');article.className='work-item';
      const button=document.createElement('button');button.type='button';button.className='work-play';button.setAttribute('aria-label',work.title+' 영상 보기');
      const img=document.createElement('img');img.alt=work.title;img.loading='lazy';img.width=1280;img.height=720;
      const fit=()=>{if(img.naturalHeight>img.naturalWidth){img.style.objectFit='contain';button.style.aspectRatio='4 / 5';}};
      img.addEventListener('load',fit);img.src=work.poster;if(img.complete)fit();
      const play=document.createElement('span');play.className='play-symbol';play.append(icon('play'));button.append(img,play);button.addEventListener('click',()=>openFilm(work,button));
      const caption=document.createElement('div');caption.className='work-caption';const copy=document.createElement('div');const title=document.createElement('h3');title.textContent=work.title;const label=document.createElement('p');label.textContent=work.label;copy.append(title,label);
      const year=document.createElement('span');year.className='work-year';year.textContent=work.year;caption.append(copy,year);article.append(button,caption);grid.append(article);
    } icons();
  }
  document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.category;document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
  $('hero-open').disabled=true;
  fetch('portfolio.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(data=>{
    works=data.works.filter(w=>w.published===true&&mediaPath(w.poster)&&(mediaPath(w.webm)||mediaPath(w.mp4)));
    document.querySelectorAll('[data-category]').forEach(b=>{b.hidden=b.dataset.category!=='all'&&!works.some(w=>w.category===b.dataset.category);});
    render();const featured=works.find(w=>w.id===data.hero)||works[0];
    if(featured){
      hero.pause();hero.replaceChildren();hero.poster=featured.poster;hero.setAttribute('aria-label',featured.title);
      for(const format of ['webm','mp4']) {const path=mediaPath(featured['hero_'+format])||mediaPath(featured[format]);if(path){const s=document.createElement('source');s.src=path;s.type='video/'+format;hero.append(s);}}
      hero.load();playHero();$('hero-open').querySelector('b').textContent=featured.title;$('hero-open').querySelector('small').textContent=featured.label;
      $('hero-open').disabled=false;$('hero-open').addEventListener('click',()=>openFilm(featured,$('hero-open')));
    }
  }).catch(()=>{$('works').textContent='작품 목록을 불러오지 못했습니다. 잠시 후 다시 방문해 주세요.';});
  icons();
})();
