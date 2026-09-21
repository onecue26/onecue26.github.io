// onecue — 관리자 화면
//
// 광고주가 「의뢰하기」를 누르면 이메일이 아니라 여기로 들어온다.
// 하는 일은 셋 — ①새로 들어온 걸 안다 ②다음 제작 절차를 승인한다 ③회신 문구를 가져간다.
//
// 목록은 하나뿐이다. 예전엔 「새 의뢰」와 「진행 중」을 따로 뒀는데
// 갓 들어온 건이 양쪽에 똑같이 나와서 같은 걸 두 번 보게 됐다.
// 지금은 한 목록에 「새 의뢰」 표시만 붙인다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null, ROWS = [], authorized = false;

  var STEP_NAME = {
    brief: "의뢰 접수", facts: "제품·자료 확인", strategy: "전략 설계",
    concepts: "콘셉트 5안", develop: "구성·각본", storyboard: "콘티 승인",
    anchors: "제작 자료", video: "영상 제작", deliver: "납품",
  };
  var FLOW = [
    { key: "brief", owner: "광고주 → 관리자" },
    { key: "facts", owner: "AI · 관리자 검수" },
    { key: "strategy", owner: "AI · 관리자 검수" },
    { key: "concepts", owner: "AI · 관리자 · 광고주" },
    { key: "develop", owner: "AI 또는 담당자" },
    { key: "storyboard", owner: "AI/담당자 · 관리자" },
    { key: "anchors", owner: "AI · 제작 관리자" },
    { key: "video", owner: "AI · 제작 관리자" },
    { key: "deliver", owner: "관리자 → 광고주" },
  ];
  // 이 단계로 옮기면 광고주가 판단할 차례가 된다
  var GATE = { strategy: "검토", concepts: "선택", storyboard: "승인" };
  var CHANNEL_NAME = {
    youtube: "유튜브", meta: "인스타·페북", tiktok: "틱톡",
    tv: "TV·CTV", web: "웹사이트", ooh: "옥외·매장",
  };
  var PLACEMENT_NAME = {
    youtube_instream: "유튜브 인스트림", youtube_video: "유튜브 일반 영상",
    youtube_shorts: "유튜브 쇼츠", meta_feed: "인스타·페북 피드",
    meta_reels: "릴스·스토리", tiktok_feed: "틱톡 추천 피드",
    tv_spot: "방송 광고", ctv_spot: "스마트TV",
    web_hero: "웹사이트 메인", web_product: "제품 페이지",
    ooh_screen: "일반 전광판", store_signage: "매장 사이니지",
  };

  // 단계별로 회신 문구가 다르다
  var MAIL = {
    brief: ["의뢰를 받았습니다", "보내주신 내용을 확인했습니다. 전략과 컨셉을 준비해 연락드리겠습니다."],
    facts: ["의뢰를 받았습니다", "보내주신 내용을 확인했습니다. 전략과 컨셉을 준비해 연락드리겠습니다."],
    strategy: ["전략 방향을 보내드립니다", "정리한 전략을 아래에서 확인해 주세요."],
    concepts: ["콘셉트 5안이 준비됐습니다", "다섯 가지 방향을 준비했습니다. 아래에서 보시고 하나를 골라 주세요."],
    develop: ["선택하신 방향으로 전개 중입니다", "고르신 콘셉트로 카피와 구성을 만들고 있습니다."],
    storyboard: ["콘티가 준비됐습니다", "컷 구성을 아래에서 확인하시고 승인해 주세요."],
    anchors: ["제작에 들어갑니다", "승인해 주신 콘티대로 제작을 시작했습니다."],
    video: ["영상을 만들고 있습니다", "완성되면 바로 보내드리겠습니다."],
    deliver: ["완성본을 보내드립니다", "작업이 끝났습니다. 아래에서 확인해 주세요."],
  };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function setConn(k, t) {
    var p = el("conn"); p.className = "pill" + (k ? " " + k : "");
    p.innerHTML = '<span class="dot"></span>' + esc(t);
  }
  function ago(ts) {
    var m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return "방금";
    if (m < 60) return m + "분 전";
    if (m < 1440) return Math.floor(m / 60) + "시간 전";
    return Math.floor(m / 1440) + "일 전";
  }
  function siteUrl(slug) {
    return location.href.replace(/admin\.html.*$/, "") +
      "project.html?slug=" + encodeURIComponent(slug);
  }

  function currentOwner(p) {
    if (p.step === "brief") {
      if (p.productionEnrolled) return "AI 제작 세션";
      if (p.enrollRequested) return "AI 연결 시스템";
      return "관리자";
    }
    if (GATE[p.step]) return p.state === "ready" ? "광고주" : "관리자";
    if (p.job && p.job.step === p.step) return "AI 제작 세션";
    if (p.step === "anchors" || p.step === "video") return "제작 관리자";
    if (p.step === "deliver") return "관리자";
    return "AI 또는 지정 담당자";
  }

  function flow(p) {
    var current = FLOW.map(function (x) { return x.key; }).indexOf(p.step);
    return '<div class="flow-wrap"><div class="flow-head"><span class="lbl">전체 제작 흐름</span>' +
      '<span class="now-owner">현재 담당 <b>' + esc(currentOwner(p)) + '</b></span></div>' +
      '<div class="flow-track">' + FLOW.map(function (s, i) {
        var status = i < current ? "done" : (i === current ? "current" : "upcoming");
        var marker = i < current ? "완료" : (i === current ? "현재" : (i + 1));
        return '<div class="flow-step ' + status + '"><span class="flow-marker">' + marker + '</span>' +
          '<strong>' + esc(STEP_NAME[s.key]) + '</strong><small>' + esc(s.owner) + '</small></div>';
      }).join("") + '</div></div>';
  }

  // ── 회신 문구 ─────────────────────────────────────────────────────────────
  // mailto: 는 기본 메일 앱이 없으면 아무 일도 안 일어난다.
  // 그래서 문구를 화면에 펼쳐 보여주고 복사할 수 있게 한다 — 메일 앱은 곁들이는 선택지다
  function mailText(p) {
    var m = MAIL[p.step] || ["진행 상황을 알려드립니다", "아래에서 확인하실 수 있습니다."];
    var name = [p.brand, p.product].filter(Boolean).join(" ");
    return {
      subject: "[onecue] " + name + " — " + m[0],
      body: [
        (p.who && p.who.name ? p.who.name + "님, " : "") + "안녕하세요. onecue 입니다.",
        "",
        "「" + name + "」 " + m[1],
        "",
        siteUrl(p.slug),
        "",
        "확인하시고 회신 주시면 이어서 진행하겠습니다.",
        "감사합니다.",
      ].join("\n"),
    };
  }

  // 아래 MAIL 은 초안일 뿐이다. 건마다 할 말이 다르므로 화면에서 고쳐 쓴다.
  // 고친 내용은 이 브라우저에 남는다 — 새로고침해도 방금 쓴 문구가 그대로 있다
  function draftKey(slug, p) { return "onecue.mail." + slug + "." + p.step; }

  function toggleMail(slug) {
    var box = el("mail-" + slug);
    if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    var t = mailText(p);
    var key = draftKey(slug, p);
    try {
      var saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && saved.subject) t = saved;
    } catch (e) { /* 저장된 게 깨졌으면 초안으로 간다 */ }

    box.hidden = false;
    box.innerHTML =
      '<div class="mail-h">받는 사람</div>' +
      '<div class="mail-v">' + esc((p.who && p.who.email) || "연락처 없음") + "</div>" +
      '<div class="mail-h">제목 — 고쳐 쓰셔도 됩니다</div>' +
      '<input class="mail-i" id="ms-' + esc(slug) + '" value="' + esc(t.subject) + '">' +
      '<div class="mail-h">본문 — 고쳐 쓰셔도 됩니다</div>' +
      '<textarea class="mail-b" id="mb-' + esc(slug) + '" rows="10">' + esc(t.body) + "</textarea>" +
      '<div class="mail-act">' +
      '<button class="btn" type="button" data-copy="' + esc(slug) + '">본문 복사</button>' +
      (p.who && p.who.email
        ? '<button class="btn ghost" type="button" data-open="' + esc(slug) + '">메일 앱으로 열기</button>'
        : "") +
      '<button class="btn ghost" type="button" data-reset="' + esc(slug) + '">기본 문구로</button>' +
      '<span class="msg" id="mailmsg-' + esc(slug) + '"></span></div>';

    var subEl = el("ms-" + slug), bodyEl = el("mb-" + slug), msg = el("mailmsg-" + slug);

    function now() { return { subject: subEl.value, body: bodyEl.value }; }
    function keep() {
      try { localStorage.setItem(key, JSON.stringify(now())); } catch (e) { /* 꽉 찼으면 그냥 넘어간다 */ }
      msg.className = "msg"; msg.textContent = "";
    }
    subEl.addEventListener("input", keep);
    bodyEl.addEventListener("input", keep);

    // 본문이 길어지면 칸도 같이 늘린다
    function grow() { bodyEl.style.height = "auto"; bodyEl.style.height = bodyEl.scrollHeight + "px"; }
    bodyEl.addEventListener("input", grow);
    grow();

    box.querySelector("[data-copy]").addEventListener("click", function () {
      var v = now(), text = v.subject + "\n\n" + v.body;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { msg.className = "msg ok"; msg.textContent = "복사했습니다"; },
          function () { msg.className = "msg err"; msg.textContent = "복사가 안 됩니다 — 직접 선택하세요"; });
      } else {
        msg.className = "msg err"; msg.textContent = "이 브라우저에서는 직접 선택해 주세요";
      }
    });

    var openBtn = box.querySelector("[data-open]");
    if (openBtn) openBtn.addEventListener("click", function () {
      // 고친 내용으로 열어야 하므로 누르는 순간에 주소를 만든다
      var v = now();
      location.href = "mailto:" + encodeURIComponent(p.who.email) +
        "?subject=" + encodeURIComponent(v.subject) +
        "&body=" + encodeURIComponent(v.body);
    });

    box.querySelector("[data-reset]").addEventListener("click", function () {
      try { localStorage.removeItem(key); } catch (e) { /* 없으면 그만이다 */ }
      box.hidden = false; box.innerHTML = ""; box.hidden = true;
      toggleMail(slug);
    });
  }

  // ── 목록 ──────────────────────────────────────────────────────────────────
  function card(p) {
    var isNew = p.isNew;
    var aiWorking = !!(p.job && p.job.step === "concepts");
    var aiNeedsReview = !!(p.latestAiAt && p.state === "pending" &&
      (!p.sentAt || new Date(p.latestAiAt) > new Date(p.sentAt)) && !aiWorking);
    var aiBadge = aiWorking
      ? '<span class="ai-update working">AI 재작업 중</span>'
      : (aiNeedsReview ? '<span class="ai-update done">NEW · 업데이트 완료</span>' : '');
    var productionAction = "";
    if (p.step === "brief" && p.state === "pending" && p.job && p.job.step === "facts") {
      if (p.productionEnrolled) {
        productionAction = '<span class="progress-state ok">AI 제작 등록 완료 · 제품·자료 확인 준비 중</span>';
      } else if (p.enrollRequested) {
        productionAction = '<span class="progress-state wait">등록 요청됨 · 로컬 처리 대기</span>';
      } else {
        productionAction = '<button class="btn production-start" type="button" data-enroll="' +
          esc(p.slug) + '">AI 제작 시작</button>';
      }
    } else {
      productionAction = '<span class="progress-state">현재 절차에 따라 진행 중입니다</span>';
    }

    var files = (p.files || []).length
      ? '<div class="files"><span class="lbl">광고주가 올린 것 ' + p.files.length + "</span>" +
        p.files.map(function (f) {
          var img = (f.mime || "").indexOf("image/") === 0;
          return '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" download>' +
            (img ? '<img src="' + esc(f.url) + '" alt="' + esc(f.role) + '">'
                 : '<span class="doc">PDF</span>') +
            "<em>" + esc(f.role) + "</em></a>";
        }).join("") + "</div>"
      : "";

    var who = p.who ? '<div class="who">' +
      "<b>" + esc(p.who.name) + "</b> " + esc(p.who.title || "") +
      ' · <a href="mailto:' + esc(p.who.email) + '">' + esc(p.who.email) + "</a>" +
      (p.who.phone ? " · " + esc(p.who.phone) : "") +
      '<button class="btn ghost mailbtn" type="button" data-mail="' + esc(p.slug) +
      '">회신 문구</button></div>' : "";

    // 의뢰 원문 — 관리자가 제일 먼저 읽어야 할 것이라 카드 안에 그대로 편다
    var said = p.brief_raw
      ? '<div class="said"><span class="lbl">광고주가 쓴 것</span>' +
        esc(p.brief_raw) +
        (p.brief_goal ? '<span class="sub">목표 · ' + esc(p.brief_goal) + "</span>" : "") +
        (p.brief_target ? '<span class="sub">대상 · ' + esc(p.brief_target) + "</span>" : "") +
        "</div>"
      : "";

    var request = (p.job && p.job.request) || {};
    var placements = request.placements || [];
    if (!placements.length && p.brief_format) {
      var parts = p.brief_format.split("·");
      if (parts.length > 2) placements = parts[2].split(",").map(function (x) { return x.trim(); });
    }
    var requirements = '<div class="said"><span class="lbl">의뢰 조건</span>' +
      '<span class="sub">목표 · ' + esc(p.brief_goal || "입력 안 함") + '</span>' +
      '<span class="sub">대상 · ' + esc(p.brief_target || "입력 안 함") + '</span>' +
      '<span class="sub">매체 · ' + esc((p.channels || []).map(function (x) {
        return CHANNEL_NAME[x] || x;
      }).join(" / ") || "입력 안 함") + '</span>' +
      '<span class="sub">노출 위치 · ' + esc(placements.map(function (x) {
        return PLACEMENT_NAME[x] || x;
      }).join(" / ") || "입력 안 함") + '</span>' +
      '<span class="sub">영상 · ' + esc(p.running_sec + "초 · " + (p.aspects || []).join(" / ")) +
      '</span></div>';

    var AI_STAGE = {
      facts: "제품·자료 확인", strategy: "전략 설계", concepts: "콘셉트 5안",
      develop: "구성·각본·연출", storyboard: "콘티", asset: "제작 자료",
      prompt: "프롬프트", render: "영상 제작", review: "영상 검수", post: "후처리"
    };
    var aiHistory = p.aiHistory || [];
    var latestAiUpdate = aiHistory.length && aiHistory[0].ts ? ago(aiHistory[0].ts) : "";
    var aiLine = aiHistory.length
      ? '<div class="executor-history"><strong>단계별 AI 작업 기록' +
        (latestAiUpdate ? ' · 마지막 업데이트 ' + esc(latestAiUpdate) : '') + '</strong>' + aiHistory.map(function (h) {
          var ai = h.executor || {};
          var worker = [ai.executor_provider, ai.executor_model].filter(Boolean).join(" · ") || "기록 없음";
          var reviewer = ai.reviewer_model && ai.reviewer_model !== ai.executor_model
            ? [ai.reviewer_provider, ai.reviewer_model].filter(Boolean).join(" · ")
            : (ai.reviewer_model ? "동일 AI 자체 검토" : "별도 검토 없음");
          var findings = ai.review_findings || {};
          var findingText = typeof findings.critical === "number"
            ? " · 치명 " + findings.critical + " / 참고 " + (findings.advisory || 0) : "";
          return '<div class="executor-step"><span>' + esc(AI_STAGE[h.step] || h.step || "단계 미상") +
            '</span><b>수행 ' + esc(worker) + '</b><b>검토 ' + esc(reviewer + findingText) + '</b></div>';
        }).join("") + '</div>'
      : '<div class="executor-history empty"><strong>단계별 AI 작업 기록</strong><span>아직 모델 기록이 없습니다.</span></div>';

    var conceptReview = "";
    if (p.step === "concepts" && p.concepts && p.concepts.length) {
      var strategyLine = p.strategy
        ? '<div class="review-strategy"><span>전략 한 줄</span><b>' + esc(p.strategy.one_message || "") + '</b>' +
          '<small>' + esc(p.strategy.insight || "") + '</small></div>'
        : "";
      var replanBusy = p.job && p.job.step === "concepts";
      // 재기획 범위 — 전부 다시 만들지, 아쉬운 안만 다시 만들지 고른다.
      // 고르지 않은 안은 손대지 않는다(서버에서도 강제한다).
      var conceptKeys = p.concepts.map(function (c) { return c.key; })
        .sort(function (a, b) { return a.localeCompare(b); });
      var pickBoxes = conceptKeys.map(function (k) {
        return '<label class="replan-pick"><input type="checkbox" data-replan-key="' + esc(p.slug) +
          '" value="' + esc(k) + '"><span>' + esc(k) + '</span></label>';
      }).join("");
      var replanBox = p.state === "pending"
        ? (replanBusy
          ? '<div class="replan-box busy"><b>새 콘셉트를 만드는 중입니다</b><span>완료되면 이 화면에 자동으로 교체됩니다.</span></div>'
          : '<div class="replan-box" data-replan-form="' + esc(p.slug) + '">' +
            '<b>다시 만들 범위</b>' +
            '<div class="replan-scope">' +
            '<label><input type="radio" name="replan-scope-' + esc(p.slug) + '" data-replan-scope="' +
            esc(p.slug) + '" value="all" checked><span>전체 5안 다시 만들기</span></label>' +
            '<label><input type="radio" name="replan-scope-' + esc(p.slug) + '" data-replan-scope="' +
            esc(p.slug) + '" value="selected"><span>선택한 안만 다시 만들기</span></label>' +
            '</div>' +
            '<div class="replan-keys" data-replan-keys="' + esc(p.slug) + '" hidden>' +
            '<span class="replan-keys-label">다시 만들 안</span>' + pickBoxes +
            '<small>선택하지 않은 안은 그대로 둡니다.</small></div>' +
            '<label for="replan-' + esc(p.slug) + '">어떤 점이 아쉬운지</label>' +
            '<textarea id="replan-' + esc(p.slug) + '" data-replan-note="' + esc(p.slug) +
            '" rows="3" placeholder="예: 제품 맛이 더 잘 느껴지고, 인물 없는 방향을 늘려 주세요."></textarea>' +
            '<button class="btn ghost" type="button" data-replan="' + esc(p.slug) +
            '">5안 전체 다시 만들기</button><small>이전 5안은 비교 기록으로 보존됩니다.</small></div>')
        : "";
      conceptReview = '<section class="concept-review"><div class="review-head"><span>관리자 검토</span>' +
        '<h3>콘셉트 5안</h3><p>추천은 참고값입니다. 다섯 방향의 차이와 위험을 확인한 뒤 광고주에게 보내세요.</p></div>' +
        strategyLine + p.concepts.slice().sort(function (a, b) { return a.key.localeCompare(b.key); })
          .map(function (c) {
            return '<article class="concept-row' + (c.is_recommended ? ' recommended' : '') + '">' +
              '<div class="concept-key">' + esc(c.key) + (c.is_recommended ? '<em>추천</em>' : '') + '</div>' +
              '<div class="concept-copy"><h4>' + esc(c.title) + '</h4><p>' + esc(c.body) + '</p>' +
              '<dl><dt>후킹</dt><dd>' + esc(c.hook) + '</dd><dt>화면</dt><dd>' + esc(c.visual) +
              '</dd><dt>위험</dt><dd>' + esc(c.risk) + '</dd></dl>' +
              (c.is_recommended && c.reco_reason ? '<small>추천 이유 · ' + esc(c.reco_reason) + '</small>' : '') +
              '</div></article>';
          }).join("") + replanBox + '</section>';
    }

    // 1차 검수 — 정지점에 와 있으면 우리가 먼저 보고 광고주에게 넘긴다.
    // 이 버튼을 누르기 전까지 광고주 화면에는 판단 버튼이 안 뜬다
    var g = GATE[p.step];
    var check = "";
    // 광고주가 되돌려보낸 건인가 — 그러면 「아직 안 보낸 것」과 다른 말을 해야 한다
    var back = p.redo && p.redo.gate === p.step && p.redo.decision === "revise" &&
      !p.redoDone;
    if (g && p.state === "pending") {
      check = '<div class="check' + (back ? " back" : "") + '"><div class="txt"><b>' +
        (back ? "광고주가 되돌려보냈습니다 — 고쳐서 다시 보내세요"
              : "1차 검수 — " + esc(g) + " 요청 전") +
        "</b><span>" +
        (back ? "아래 남긴 말을 보고 고친 뒤에 다시 넘기세요."
              : "광고주에게 보이는 화면에서 내용을 확인하신 뒤 넘기세요.") +
        " 지금은 광고주 쪽에 버튼이 없습니다.</span></div>" +
        (p.n_cuts
          ? '<a class="btn" href="board.html?slug=' + encodeURIComponent(p.slug) +
            '">콘티 검수 →</a>'
          : "") +
        '<button class="btn ghost" type="button" data-send="' + esc(p.slug) +
        '">광고주에게 보내기</button></div>';
    } else if (g && p.state === "ready") {
      check = '<div class="check sent"><div class="txt"><b>광고주 ' + esc(g) +
        " 대기 중</b><span>넘겼습니다. 광고주가 누르면 다음 단계로 넘어갑니다.</span>" +
        "</div></div>";
    }

    // 「다시 만들어 주세요」 — 제일 위에 둔다. 못 보고 지나가면 안 되는 것이다
    var GNAME = { strategy: "전략 설계", concepts: "콘셉트 5안", storyboard: "콘티 승인" };
    var redo = p.redo
      ? '<div class="said redo' + (p.redoDone ? " ok" : "") + '"><span class="lbl">' +
        esc(GNAME[p.redo.gate] || p.redo.gate) + " — 광고주가 남긴 말 · " +
        ago(p.redo.decided_at) +
        (p.redoDone ? " · 처리 완료 (" + ago(p.sentAt) + " 다시 보냄)" : " · 처리 전") +
        "</span>" + esc(p.redo.note || "") + "</div>"
      : "";

    return '<div class="wrk' + (isNew ? " fresh" : "") + '">' +
      '<div class="top"><div>' +
      '<div class="name">' + (isNew ? '<span class="new">NEW</span>' : "") + aiBadge +
      (p.brand && p.product ? '<span class="brand-name"><em>브랜드</em>' + esc(p.brand) + '</span>' : "") +
      '<strong class="product-name">' + esc(p.product || p.brand || p.slug) + '</strong></div>' +
      '<div class="meta">' + esc(p.slug) + " · " + p.running_sec + "초 · " +
      esc((p.aspects || []).join("/")) +
      (p.created_at ? " · " + ago(p.created_at) : "") + "</div>" +
      '</div>' +
      '<div class="ways">' +
      (p.n_cuts
        ? '<a class="btn ghost" href="board.html?slug=' + encodeURIComponent(p.slug) +
          '">콘티 검수</a>'
        : "") +
      '<a class="btn ghost" href="' + esc(siteUrl(p.slug)) +
      '" target="_blank" rel="noopener">광고주 화면 ↗</a></div></div>' +
      aiLine + redo + said + requirements + conceptReview + check + who +
      '<div class="mailbox" id="mail-' + esc(p.slug) + '" hidden></div>' +
      files +
      flow(p) +
      '<div class="steps production-progress"><span class="lbl">제작 진행</span>' +
      '<strong class="current-step">' + esc(STEP_NAME[p.step] || p.step) + '</strong>' +
      productionAction + "</div></div>";
  }

  function render() {
    var fresh = ROWS.filter(function (r) { return r.isNew; });
    el("alert").innerHTML = fresh.length
      ? '<div class="newbar"><b>새 의뢰 ' + fresh.length + "건</b>" +
        fresh.map(function (r) {
          return '<a href="#c-' + esc(r.slug) + '">' +
            esc([r.brand, r.product].filter(Boolean).join(" ")) + "</a>";
        }).join("") + "</div>"
      : "";

    el("work").innerHTML = ROWS.length
      ? ROWS.map(function (p) {
          return '<div id="c-' + esc(p.slug) + '">' + card(p) + "</div>";
        }).join("")
      : '<div class="empty"><span class="big">아직 들어온 의뢰가 없습니다</span>' +
        "광고주가 의뢰하면 여기에 뜹니다.</div>";

    document.querySelectorAll("[data-enroll]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "등록 요청 중…";
        requestEnrollment(b.dataset.enroll).then(load).catch(function (e) {
          b.disabled = false; b.textContent = "AI 제작 시작";
          window.alert("등록하지 못했습니다 — " + (e.message || e));
        });
      });
    });
    document.querySelectorAll("[data-mail]").forEach(function (b) {
      b.addEventListener("click", function () { toggleMail(b.dataset.mail); });
    });
    document.querySelectorAll("[data-send]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "보내는 중…";
        send(b.dataset.send).then(load);
      });
    });
    // 범위를 바꾸면 체크박스를 열고 닫고, 버튼 문구도 선택 상태를 따라간다
    document.querySelectorAll("[data-replan-scope]").forEach(function (r) {
      r.addEventListener("change", function () { syncReplanForm(r.dataset.replanScope); });
    });
    document.querySelectorAll("[data-replan-key]").forEach(function (k) {
      k.addEventListener("change", function () { syncReplanForm(k.dataset.replanKey); });
    });
    document.querySelectorAll("[data-replan]").forEach(function (b) {
      b.addEventListener("click", function () {
        var slug = b.dataset.replan;
        var field = document.querySelector('[data-replan-note="' + CSS.escape(slug) + '"]');
        var note = field ? field.value.trim() : "";
        var scope = replanScopeOf(slug);
        var keys = replanKeysOf(slug);
        if (scope === "selected" && !keys.length) {
          window.alert("다시 만들 안을 하나 이상 골라 주세요.");
          return;
        }
        if (!note) {
          window.alert("어떤 점을 바꿀지 한 줄만 적어 주세요.");
          if (field) field.focus();
          return;
        }
        var label = b.textContent;
        b.disabled = true; b.textContent = "재기획 요청 중…";
        requestReplan(slug, note, scope, keys).then(load).catch(function (e) {
          b.disabled = false; b.textContent = label;
          window.alert("재기획을 요청하지 못했습니다 — " + (e.message || e));
        });
      });
    });
    document.querySelectorAll("[data-replan-form]").forEach(function (f) {
      syncReplanForm(f.dataset.replanForm);
    });
  }

  function replanScopeOf(slug) {
    var picked = document.querySelector('[data-replan-scope="' + CSS.escape(slug) + '"]:checked');
    return picked && picked.value === "selected" ? "selected" : "all";
  }

  function replanKeysOf(slug) {
    return Array.prototype.slice
      .call(document.querySelectorAll('[data-replan-key="' + CSS.escape(slug) + '"]:checked'))
      .map(function (x) { return x.value; })
      .sort(function (a, b) { return a.localeCompare(b); });
  }

  // 화면 상태를 한 곳에서 맞춘다 — 체크박스 노출과 버튼 문구
  function syncReplanForm(slug) {
    var scope = replanScopeOf(slug);
    var keys = replanKeysOf(slug);
    var box = document.querySelector('[data-replan-keys="' + CSS.escape(slug) + '"]');
    if (box) box.hidden = scope !== "selected";
    var btn = document.querySelector('[data-replan="' + CSS.escape(slug) + '"]');
    if (!btn || btn.disabled) return;
    btn.textContent = scope === "selected"
      ? (keys.length ? "선택한 " + keys.length + "개 다시 만들기" : "다시 만들 안을 고르세요")
      : "5안 전체 다시 만들기";
  }

  function requestReplan(slug, note, scope, keys) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p || p.step !== "concepts" || p.state !== "pending") {
      return Promise.reject(new Error("지금은 콘셉트를 다시 만들 수 있는 단계가 아닙니다"));
    }
    if (p.job && p.job.step === "concepts") {
      return Promise.reject(new Error("이미 새 콘셉트를 만들고 있습니다"));
    }
    var allKeys = (p.concepts || []).map(function (c) { return c.key; })
      .sort(function (a, b) { return a.localeCompare(b); });
    var selected = scope === "selected";
    var replanKeys = selected ? (keys || []).slice() : allKeys.slice();
    if (selected && !replanKeys.length) {
      return Promise.reject(new Error("다시 만들 안을 하나 이상 골라 주세요"));
    }
    var unknown = replanKeys.filter(function (k) { return allKeys.indexOf(k) < 0; });
    if (unknown.length) {
      return Promise.reject(new Error("없는 콘셉트를 골랐습니다 — " + unknown.join(", ")));
    }
    var preserveKeys = allKeys.filter(function (k) { return replanKeys.indexOf(k) < 0; });
    return Promise.all([
      db.from("jobs").insert({
        project_id: p.id, step: "concepts", kind: "text", state: "queued",
        request: {
          note: "관리자 재기획 요청", direction: note,
          replan_scope: selected ? "selected" : "all",
          replan_keys: replanKeys,
          preserve_keys: preserveKeys,
          supersedes_current_concepts: !selected,
          preserve_previous_for_comparison: true,
        },
      }),
      db.from("events").insert({
        project_id: p.id, kind: "admin_replan_requested",
        from_step: "concepts", to_step: "concepts",
        payload: {
          by: "admin_ui", note: note,
          replan_scope: selected ? "selected" : "all",
          replan_keys: replanKeys, preserve_keys: preserveKeys,
        },
      }),
    ]).then(function (results) {
      var failed = results.filter(function (x) { return x.error; })[0];
      if (failed) throw failed.error;
    });
  }

  // 1차 검수를 마쳤다 → 광고주 차례로 넘긴다. 이때 비로소 광고주 화면에 버튼이 뜬다
  function send(slug) {
    return db.from("projects").update({ state: "ready", updated_at: new Date() })
      .eq("slug", slug)
      .then(function () {
        return db.from("projects").select("id,step").eq("slug", slug).single();
      })
      .then(function (r) {
        return db.from("events").insert({
          project_id: r.data.id, kind: "sent", to_step: r.data.step,
          payload: { by: "admin", note: "1차 검수 완료 — 광고주에게 넘김" },
        });
      });
  }

  // 관리자가 승인한 사실만 기록한다. PC의 로컬 처리기가 이 요청을 검증한 뒤
  // 실제 제작 등록을 수행하므로 웹 화면이 임의로 단계를 건너뛸 수 없다.
  function requestEnrollment(slug) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p || p.step !== "brief" || p.state !== "pending" || !p.job || p.job.step !== "facts") {
      return Promise.reject(new Error("지금 시작할 수 있는 의뢰가 아닙니다"));
    }
    if (p.enrollRequested || p.productionEnrolled) return Promise.resolve();
    return db.from("events").insert({
      project_id: p.id,
      kind: "production_enroll_requested",
      from_step: p.step,
      to_step: p.step,
      payload: {
        by: "admin_ui",
        action: "onecue_astra_enroll",
        requested_at: new Date().toISOString(),
      },
    }).then(function (r) {
      if (r.error) throw r.error;
    });
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
    if (!authorized) return Promise.resolve();
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");

    return db.from("projects")
      .select("id,slug,brand,product,step,state,running_sec,cut_count,aspects,created_at")
      .order("created_at", { ascending: false })
      .then(function (r) {
        if (r.error) { setConn("bad", "불러오기 실패"); return; }
        ROWS = r.data;
        if (!ROWS.length) { setConn("ok", "연결됨"); render(); return; }

        var ids = ROWS.map(function (x) { return x.id; });
        var counts = [
          ["briefs", "n_brief"], ["product_facts", "n_facts"], ["strategies", "n_strategy"],
          ["concepts", "n_concepts"], ["cuts", "n_cuts"], ["assets", "n_assets"],
        ];
        return Promise.all([
          Promise.all(counts.map(function (t) {
            return db.from(t[0]).select("project_id").in("project_id", ids);
          })),
          db.from("assets").select("project_id,role,url,storage_path,mime,meta")
            .eq("kind", "product_ref").in("project_id", ids),
          db.from("contacts").select("project_id,name,email,phone,title").in("project_id", ids),
          db.from("jobs").select("project_id,step,request").eq("state", "queued")
            .in("project_id", ids),
          db.from("briefs").select("project_id,raw,goal,target,format").in("project_id", ids),
          // 승인하면서 남긴 말도 놓치면 안 된다. 반려만 보면 반쪽이다
          db.from("approvals").select("project_id,gate,decision,note,decided_at")
            .in("project_id", ids).order("decided_at", { ascending: false }),
          // 우리가 마지막으로 넘긴 시각 — 광고주 말을 처리했는지 가르는 기준
          db.from("events").select("project_id,ts").eq("kind", "sent")
            .in("project_id", ids).order("ts", { ascending: false }),
          db.from("events").select("project_id,kind,to_step,ts,payload")
            .in("kind", ["production_enroll_requested", "production_enrolled", "astra_draft"])
            .in("project_id", ids).order("ts", { ascending: false }),
          db.from("strategies").select("project_id,insight,one_message").in("project_id", ids),
          db.from("concepts").select("project_id,key,title,body,hook,visual,risk,is_recommended,reco_reason")
            .in("project_id", ids),
          db.from("jobs").select("project_id,response,finished_at").eq("state", "ok")
            .in("project_id", ids).order("finished_at", { ascending: false }),
        ]).then(function (out) {
          if (out[1].error) throw out[1].error;
          return window.ONECUE_ASSETS.resolve(db, out[1].data || []).then(function (assets) {
            out[1].data = assets;
            return out;
          });
        }).then(function (out) {
          var cs = out[0], files = out[1].data || [], people = out[2].data || [];
          var jobs = out[3].data || [];
          var queued = jobs.map(function (j) { return j.project_id; });
          var briefs = out[4].data || [];
          var revises = out[5].data || [];
          var sents = out[6].data || [];
          var enrollEvents = out[7].data || [];
          var strategies = out[8].data || [];
          var concepts = out[9].data || [];
          var completedJobs = out[10].data || [];

          ROWS.forEach(function (p) {
            counts.forEach(function (t, i) {
              var d = cs[i].data || [];
              p[t[1]] = d.filter(function (x) { return x.project_id === p.id; }).length;
            });
            p.files = files.filter(function (f) { return f.project_id === p.id; });
            p.who = people.filter(function (c) { return c.project_id === p.id; })[0] || null;
            // 「새 의뢰」 = 아직 우리가 손대지 않은 것. 처리하면 표시가 사라진다
            p.isNew = queued.indexOf(p.id) >= 0;
            p.job = jobs.filter(function (j) { return j.project_id === p.id; })[0] || null;
            // 광고주가 실제로 남긴 말 중 가장 최근 것.
            // 자동으로 채워 넣은 문구(「…선택」·「남기신 말씀 없음」)는 말이 아니다
            p.redo = revises.filter(function (a) {
              if (a.project_id !== p.id) return false;
              var n = a.note || "";
              return n && !/없음|안 선택$/.test(n);
            })[0] || null;
            // 그 말이 온 뒤에 우리가 다시 넘겼으면 처리된 것이다.
            // 처리해도 계속 빨갛게 떠 있으면 무엇이 남았는지 알 수 없다
            var last = sents.filter(function (e) { return e.project_id === p.id; })[0];
            p.sentAt = last ? last.ts : null;
            p.redoDone = !!(p.redo && p.sentAt &&
              new Date(p.sentAt) > new Date(p.redo.decided_at));
            p.enrollRequested = enrollEvents.filter(function (e) {
              return e.project_id === p.id && e.kind === "production_enroll_requested";
            })[0] || null;
            p.productionEnrolled = enrollEvents.filter(function (e) {
              return e.project_id === p.id && e.kind === "production_enrolled";
            })[0] || null;
            p.strategy = strategies.filter(function (s) { return s.project_id === p.id; })[0] || null;
            p.concepts = concepts.filter(function (c) { return c.project_id === p.id; });
            var seenAiSteps = {};
            p.aiHistory = enrollEvents.filter(function (e) {
              if (e.project_id !== p.id || e.kind !== "astra_draft" ||
                  !e.payload || !e.payload.executor) return false;
              var step = e.to_step || e.payload.target || "unknown";
              if (seenAiSteps[step]) return false;
              seenAiSteps[step] = true;
              return true;
            }).map(function (e) {
              return { step: e.to_step || e.payload.target || "unknown",
                executor: e.payload.executor, ts: e.ts };
            });
            p.latestAiAt = p.aiHistory.length ? p.aiHistory[0].ts : null;
            var b = briefs.filter(function (x) { return x.project_id === p.id; })[0];
            if (b) {
              p.brief_raw = b.raw; p.brief_goal = b.goal;
              p.brief_target = b.target; p.brief_format = b.format;
            }
          });
          setConn("ok", "새 의뢰 " + ROWS.filter(function (x) { return x.isNew; }).length);
          render();
        });
      }).catch(function () {
        accessNotice('불러오지 못했습니다', '잠시 후 새로고침해 주세요.', false);
      });
  }

  // 이 화면은 관리자만 본다
  function accessNotice(title, message, login) {
    authorized = false;
    ROWS = [];
    el('reload').disabled = true;
    document.querySelector('main').innerHTML = '<section role="status" style="max-width:560px;margin:48px auto;overflow-wrap:anywhere">' +
      '<h1 style="font-size:24px">' + esc(title) + '</h1><p>' + esc(message) + '</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">' +
      '<a class="btn" href="index.html">프로젝트로 돌아가기</a>' +
      '<a class="btn ghost" href="login.html' + (login ? '?next=admin.html' : '') + '">' +
      (login ? '로그인' : '계정 확인') + '</a></div></section>';
    setConn('bad', title);
  }
  function gate() {
    authorized = false;
    return db.auth.getUser().then(function (r) {
      if (r.error && r.error.name !== 'AuthSessionMissingError') throw r.error;
      var user = r.data && r.data.user;
      if (!user) { accessNotice('로그인이 필요합니다', '관리자 계정으로 로그인해 주세요.', true); return false; }
      return db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
        .then(function (p) {
          if (p.error) throw p.error;
          if (!p.data || !p.data.is_admin) {
            accessNotice('관리자 전용 화면입니다', '현재 로그인한 계정은 관리자가 아닙니다. 의뢰와 진행 상황은 프로젝트 화면에서 확인해 주세요.', false);
            return false;
          }
          authorized = true;
          return true;
        });
    });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { accessNotice('연결을 확인해 주세요', '로그인 서비스를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', false); return; }
    db = shared();
    function refresh() {
      el('reload').disabled = true;
      return gate().then(function (ok) { if (ok) return load(); })
        .catch(function () { accessNotice('권한을 확인하지 못했습니다', '잠시 후 새로고침해 주세요.', false); })
        .finally(function () { el('reload').disabled = !authorized; });
    }
    el("reload").addEventListener("click", refresh);
    db.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') accessNotice('로그인이 필요합니다', '관리자 계정으로 로그인해 주세요.', true);
    });
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
