/*!
 * onecue-effects.js — ONECUE 홈 화면 전환 효과 (의존성 없음, ES2017)
 * 29CM about 페이지(https://www.29cm.co.kr/content/about/2026) 실측 모션을 ONECUE 섹션에 대응시킨 것.
 * 수치 근거: docs/MOTION_SPEC.md
 *
 * 사용: OnecueEffects.init({ mediaBase, works }) → { destroy() }
 *   React/Next: useEffect(() => { const fx = OnecueEffects.init(opts); return () => fx.destroy(); }, [])
 *
 * 효과 목록 (MOTION_SPEC 번호와 같음)
 *  E1 히어로 타이핑 루프      E2 헤더 숨김/표시 + 현재 섹션 표시
 *  E3 히어로 필름 clip 열림    E4 원칙 스택 카드(진행선·라벨 타이핑·페이드업·덮임)
 *  E5 웍스 sticky 패널 전환    E6 숫자 카운트업·차트    E7 FAQ 아코디언    E8 공통 등장
 */
(function (global) {
  'use strict';

  var clamp = function (v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.min(b, Math.max(a, v)); };
  var easeOutCubic = function (k) { return 1 - Math.pow(1 - k, 3); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // 튜닝 상수. 29CM 실측값은 [29CM], 원안 값은 [원안], 그 외는 이식하며 정한 값.
  var T = {
    desktopMin: 820,          // [원안] 이 폭 미만은 모바일 레이아웃
    typeMs: 140,              // [원안] 한 글자 타이핑 간격
    eraseMs: 60,              // 지우는 속도
    holdMs: 2400,             // 다 쓴 뒤 머무는 시간
    gapMs: 400,               // 다 지운 뒤 다시 쓰기까지
    headerSolidAt: 40,        // [원안] 이만큼 내려가면 헤더 흰 배경
    filmInsetMax: 8,          // [원안 84%→100% 폭 = 좌우 8%] clip inset 최대 %
    filmRadiusMax: 16,        // [원안] 모서리 px
    stack: 96,                // [29CM] 카드 sticky top 간격 px
    stackMinVh: 700,          // 화면 높이가 이보다 낮으면 스택 끔
    fadeRange: 0.28,          // [29CM] 페이드업 구간 = 화면 높이의 28% (900px 화면에서 약 250px)
    coverRange: 0.45,         // [29CM] 다음 카드가 다가오는 동안 이전 카드 본문이 사라지는 구간
    worksStepVh: 60,          // [29CM 750px/작품 ≈ 화면 0.8배] 작품 하나당 스크롤 길이(vh)
    countMs: 1100,            // [원안] 카운트업 시간
    numTrigger: 0.78,         // [원안] 행 top 이 화면 78% 위로 오면 카운트 시작
    numFallbackMs: 8000       // [원안] 스크롤 없이도 8초 뒤 카운트
  };

  function init(opts) {
    opts = opts || {};
    var works = opts.works || [];
    var mediaBase = opts.mediaBase || 'assets/media/works/';
    var root = document.documentElement;
    var reduce = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    var timers = [], observers = [], offs = [];
    var on = function (el, ev, fn, o) { el.addEventListener(ev, fn, o); offs.push(function () { el.removeEventListener(ev, fn, o); }); };
    var later = function (fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; };
    var vh = function () { return global.innerHeight; };
    var isDesk = function () { return global.innerWidth >= T.desktopMin; };
    var hdrH = function () { var h = $('[data-hdr]'); return h ? h.offsetHeight : 80; };

    root.classList.add('js');
    if (reduce) root.classList.add('reduce-motion');

    /* ---------------- E1 히어로 타이핑 루프 ---------------- */
    (function hero() {
      var h1 = $('[data-type]'); if (!h1) return;
      var t1 = $('[data-t1]', h1), t2 = $('[data-t2]', h1), c1 = $('[data-c1]', h1), c2 = $('[data-c2]', h1);
      var L1 = h1.getAttribute('data-l1'), L2 = h1.getAttribute('data-l2');
      if (reduce) { t1.textContent = L1; t2.textContent = L2; c1.hidden = true; return; }
      t1.textContent = ''; t2.textContent = ''; c1.hidden = false; c2.hidden = true;
      var i = 0;
      function type1() {
        if (i < L1.length) { t1.textContent = L1.slice(0, ++i); return later(type1, T.typeMs); }
        c1.hidden = true; c2.hidden = false; i = 0; later(type2, T.typeMs);
      }
      function type2() {
        if (i < L2.length) { t2.textContent = L2.slice(0, ++i); return later(type2, T.typeMs); }
        later(erase2, T.holdMs);
      }
      function erase2() {
        if (document.hidden) return later(erase2, 1000);          // 탭이 숨으면 쉬기
        if (i > 0) { t2.textContent = L2.slice(0, --i); return later(erase2, T.eraseMs); }
        later(type2, T.gapMs);
      }
      later(type1, 300);
    })();

    /* ---------------- E2 헤더 ---------------- */
    var hdr = $('[data-hdr]');
    var navLinks = $$('.nav a[href^="#"]');
    var lastY = global.scrollY;
    function updateHeader() {
      if (!hdr) return;
      var y = global.scrollY, dy = y - lastY; lastY = y;
      hdr.classList.toggle('is-scrolled', y > T.headerSolidAt);
      if (!reduce) {
        if (y > vh() * 0.8 && dy > 4) hdr.classList.add('is-hidden');
        else if (dy < -4 || y <= vh() * 0.8) hdr.classList.remove('is-hidden');
      }
      var cur = null;
      navLinks.forEach(function (a) {
        var s = document.getElementById(a.getAttribute('href').slice(1));
        if (s && s.getBoundingClientRect().top < vh() * 0.4) cur = a;
      });
      navLinks.forEach(function (a) { a.classList.toggle('is-active', a === cur); });
    }
    on(hdr || document, 'focusin', function () { hdr && hdr.classList.remove('is-hidden'); });

    /* ---------------- E3 히어로 필름 ---------------- */
    var film = $('[data-film]');
    var filmVideo = film && $('video', film);
    function updateFilm() {
      if (!film || reduce) return;
      if (!isDesk()) { film.style.removeProperty('--film-x'); film.style.removeProperty('--film-r'); return; }
      var r = film.getBoundingClientRect(), H = vh();
      var open = clamp((H - r.top) / (H * 0.9));              // [원안] sc 공식
      var close = clamp((H * 0.5 - r.bottom) / (H * 0.5));    // [29CM] 나갈 때 다시 닫힘
      var k = Math.max(1 - open, close);
      film.style.setProperty('--film-x', (k * T.filmInsetMax).toFixed(3) + '%');
      film.style.setProperty('--film-r', (k * T.filmRadiusMax).toFixed(2) + 'px');
    }
    if (filmVideo && 'IntersectionObserver' in global) {
      var fio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { var p = filmVideo.play(); p && p.catch && p.catch(function () {}); } else filmVideo.pause(); });
      }, { threshold: 0.05 });
      fio.observe(filmVideo); observers.push(fio);
    }

    /* ---------------- E4 원칙 스택 카드 ---------------- */
    var cardsWrap = $('[data-cards]');
    var cards = $$('[data-card]');
    var stackOn = false;
    function layoutCards() {
      if (!cardsWrap) return;
      stackOn = !reduce && isDesk() && vh() >= T.stackMinVh;
      cardsWrap.classList.toggle('is-stack', stackOn);
      cards.forEach(function (c, i) {
        c.classList.remove('no-stick');
        // 카드가 화면에 다 안 들어가면 sticky 로 붙이면 아랫부분이 영영 안 보임 → 그 카드는 스택 해제
        if (stackOn && c.offsetHeight + hdrH() + i * T.stack > vh()) c.classList.add('no-stick');
      });
    }
    function updateCards() {
      if (!cards.length) return;
      var H = vh(), hh = hdrH(), act = -1;
      var wrapR = cardsWrap.getBoundingClientRect();
      cards.forEach(function (c, i) {
        var r = c.getBoundingClientRect();
        var target = stackOn ? hh + i * T.stack : H * 0.35;
        if (!reduce) {
          var p = clamp((H * 0.9 - r.top) / Math.max(1, H * 0.9 - target));     // [29CM] 진행선 scaleX 0→1
          var t = clamp((H * 0.88 - r.top) / (H * 0.12));                       // [29CM] 라벨 폭이 열리며 타이핑
          var f = clamp((H * 0.82 - r.top) / (H * T.fadeRange));                // [29CM] 번호 translateY 24→0, opacity 0→1
          var f2 = clamp((H * 0.78 - r.top) / (H * T.fadeRange));               // [29CM] 본문은 번호보다 약간 늦게
          var cover = 1;
          var next = cards[i + 1];
          if (stackOn && next && !c.classList.contains('no-stick')) {
            var nt = next.getBoundingClientRect().top - (hh + (i + 1) * T.stack);
            cover = clamp(nt / (H * T.coverRange));                             // [29CM] 다음 카드가 덮으면 본문 opacity 1→0
          }
          c.style.setProperty('--p', p.toFixed(4));
          c.style.setProperty('--t', t.toFixed(4));
          $('.card-num', c).style.setProperty('--f', f.toFixed(4));
          var rest = $('.card-rest', c);
          rest.style.setProperty('--f', f2.toFixed(4));
          rest.style.setProperty('--cover', cover.toFixed(4));
          rest.style.pointerEvents = cover < 0.2 ? 'none' : '';
        }
        if (r.top < H * 0.62 && r.bottom > H * 0.3) act = i;                     // [원안] 활성 카드
      });
      if (wrapR.bottom < H * 0.3 || wrapR.top > H * 0.62) act = -1;
      cards.forEach(function (c, i) { c.classList.toggle('is-active', i === act); });
    }

    /* ---------------- E5 웍스 sticky 패널 ---------------- */
    var W = $('[data-works]');
    var wi = 0, wMode = '', wVisible = false;
    var va = W && $('[data-va]', W), vb = W && $('[data-vb]', W), front = va, back = vb;
    var thumbsBox = W && $('[data-thumbs]', W), ticksBox = W && $('[data-ticks]', W);
    var src = function (i, ext) { return mediaBase + works[i][0] + ext; };
    if (W && works.length) {
      W.style.setProperty('--n', works.length);
      thumbsBox.innerHTML = ''; ticksBox.innerHTML = '';   // init 이 두 번 불려도(React StrictMode) 중복 생성 안 됨
      works.forEach(function (w, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'thumb'; b.title = w[1]; b.setAttribute('aria-label', w[1] + ' 영상 보기');
        b.innerHTML = '<img loading="lazy" alt="" src="' + src(i, '.jpg') + '">';
        on(b, 'click', function () { goWork(i); });
        thumbsBox.appendChild(b);
        ticksBox.appendChild(document.createElement('i'));
      });
      on($('[data-wprev]', W), 'click', function () { goWork((wi - 1 + works.length) % works.length); });
      on($('[data-wnext]', W), 'click', function () { goWork((wi + 1) % works.length); });
      [va, vb].forEach(function (v) {
        v.muted = true; v.playsInline = true;
        on(v, 'timeupdate', function () { if (v === front && v.duration) $('[data-vbar]', W).style.setProperty('--vp', (v.currentTime / v.duration).toFixed(4)); });
        on(v, 'ended', function () { if (v === front && wMode === 'player') showWork((wi + 1) % works.length); });  // [원안] 끝나면 다음
      });
      if ('IntersectionObserver' in global) {
        var wio = new IntersectionObserver(function (es) {
          es.forEach(function (e) { wVisible = e.isIntersecting; if (wVisible) playFront(); else front.pause(); });
        }, { threshold: 0.15 });
        wio.observe($('[data-player]', W)); observers.push(wio);
      } else wVisible = true;
      showWork(0, true);
    }
    function playFront() { if (!wVisible) return; var p = front.play(); p && p.catch && p.catch(function () {}); }
    function layoutWorks() {
      if (!W) return;
      var mode = (!reduce && isDesk() && vh() >= 640) ? 'scroll' : 'player';
      if (mode === wMode) return;
      wMode = mode;
      W.classList.toggle('is-scroll', mode === 'scroll');
      [va, vb].forEach(function (v) { v.loop = mode === 'scroll'; });              // [29CM] 스크롤 모드는 작품 영상 반복
    }
    function goWork(i) {
      if (wMode === 'scroll') {
        var top = W.getBoundingClientRect().top + global.scrollY;
        var total = W.offsetHeight - vh();
        global.scrollTo({ top: top + total * (i + 0.5) / works.length, behavior: reduce ? 'auto' : 'smooth' });
      } else showWork(i);
    }
    function showWork(i, first) {
      if (!W) return;
      if (i === wi && !first) return;
      wi = i;
      var w = works[i];
      var sw = $('[data-wswap]', W);
      var apply = function () {
        $('[data-wbrand]', W).textContent = w[1];
        $('[data-wproduct]', W).textContent = w[2];
        $('[data-wmeta]', W).textContent = w[3];
        sw.classList.remove('is-out');
      };
      if (first || reduce) apply(); else { sw.classList.add('is-out'); later(apply, 180); }   // [29CM] opacity .18s 후 교체
      $$('.thumb', thumbsBox).forEach(function (b, k) { b.classList.toggle('is-on', k === i); b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      $$('i', ticksBox).forEach(function (t, k) { t.classList.toggle('is-on', k === i); });  // [29CM] 활성 틱 색·폭
      $('[data-wcount]', W).textContent = (i + 1) + ' / ' + works.length;
      $('[data-vbar]', W).style.setProperty('--vp', 0);
      if (first) { front.src = src(i, '.mp4'); front.poster = src(i, '.jpg'); playFront(); return; }
      // 두 video 를 번갈아 쓰며 크로스페이드
      back.src = src(i, '.mp4'); back.poster = src(i, '.jpg'); back.preload = 'auto';
      var swap = function () {
        back.removeEventListener('loadeddata', swap);
        back.currentTime = 0;
        back.classList.remove('is-back'); front.classList.add('is-back');
        front.pause();
        var tmp = front; front = back; back = tmp;
        playFront();
      };
      if (back.readyState >= 2) swap(); else back.addEventListener('loadeddata', swap);
    }
    function updateWorks() {
      if (!W || wMode !== 'scroll' || !works.length) return;
      var r = W.getBoundingClientRect();
      var total = Math.max(1, W.offsetHeight - vh());
      var prog = clamp(-r.top / total);
      var idx = Math.min(works.length - 1, Math.floor(prog * works.length));
      if (idx !== wi) showWork(idx);
    }

    /* ---------------- E6 숫자 ---------------- */
    var rows = $$('[data-num]');
    var bars = $('[data-bars]');
    if (bars) bars.innerHTML = '';
    if (bars) for (var b = 0; b < 15; b++) {
      var s = document.createElement('span');
      s.style.setProperty('--h', (18 + b * 5.6) + '%');                          // [원안] 막대 높이
      s.style.transitionDelay = (b * 0.05) + 's';                               // [원안] 0.05s 간격
      bars.appendChild(s);
    }
    function countTo(el, target, ms, onTick) {
      if (reduce) { el.textContent = target; onTick && onTick(target); return; }
      var t0 = performance.now();
      (function step(now) {
        var k = clamp((now - t0) / ms), v = Math.round(target * easeOutCubic(k));
        el.textContent = v; onTick && onTick(v);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }
    var clock = $('[data-clock]');
    rows.forEach(function (row) { var c = $('[data-count]', row); if (c && !reduce) c.textContent = '0'; });
    function fireRow(row) {
      if (row._done) return; row._done = true;
      row.classList.add('is-on');
      var target = +row.getAttribute('data-num');
      countTo($('[data-count]', row), target, T.countMs, target === 24 && clock ? function (v) { clock.style.setProperty('--sweep', (v / 24 * 360) + 'deg'); } : null);
    }
    function updateNums() { rows.forEach(function (row) { if (!row._done && row.getBoundingClientRect().top < vh() * T.numTrigger) fireRow(row); }); }
    later(function () { rows.forEach(fireRow); }, T.numFallbackMs);
    var stats = $$('[data-stat]');
    stats.forEach(function (el) { if (!reduce) el.textContent = '0'; });

    /* ---------------- E7 FAQ ---------------- */
    $$('[data-faq] .qa').forEach(function (qa) {
      var q = $('.qa-q', qa);
      on(q, 'click', function () {
        var open = !qa.classList.contains('is-open');
        qa.classList.toggle('is-open', open);
        q.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    /* ---------------- E8 공통 등장 ---------------- */
    var rvs = $$('.rv');
    if ('IntersectionObserver' in global && !reduce) {
      var rio = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in'); rio.unobserve(e.target);
          if (e.target.querySelector('[data-stat]')) $$('[data-stat]', e.target).forEach(function (el) { countTo(el, +el.getAttribute('data-stat'), 800); });
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
      rvs.forEach(function (el) { rio.observe(el); }); observers.push(rio);
    } else {
      rvs.forEach(function (el) { el.classList.add('is-in'); });
      stats.forEach(function (el) { el.textContent = el.getAttribute('data-stat'); });
    }

    /* ---------------- 스크롤 루프 ---------------- */
    var raf = 0;
    function frame() {
      raf = 0;
      updateHeader(); updateFilm(); updateCards(); updateWorks(); updateNums();
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(frame); }
    function onResize() { layoutCards(); layoutWorks(); onScroll(); }
    on(global, 'scroll', onScroll, { passive: true });
    on(global, 'resize', onResize);
    on(global, 'load', onResize);                       // 폰트·이미지 로드 후 카드 높이 재측정
    layoutCards(); layoutWorks(); frame();

    return {
      destroy: function () {
        timers.forEach(clearTimeout); observers.forEach(function (o) { o.disconnect(); });
        offs.forEach(function (f) { f(); }); if (raf) cancelAnimationFrame(raf);
        root.classList.remove('js', 'reduce-motion');
        if (thumbsBox) thumbsBox.innerHTML = ''; if (ticksBox) ticksBox.innerHTML = ''; if (bars) bars.innerHTML = '';
      },
      tuning: T
    };
  }

  global.OnecueEffects = { init: init, tuning: T };
})(window);
