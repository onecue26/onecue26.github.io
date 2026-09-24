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
  // ★ 볼 수는 있지만 **바꿀 수 없는** 계정이 있다 (보기 전용 관리자).
  //   DB 는 이미 막지만, 화면이 누를 수 없는 버튼을 그리면 화면이 거짓말을
  //   하는 것이다. 누르면 「권한 없음」이 뜨는 버튼은 안 그리는 게 맞다.
  var canWrite = true;

  var STEP_NAME = {
    brief: "의뢰 접수", facts: "제품·자료 확인", strategy: "전략 설계",
    concepts: "콘셉트 5안", develop: "구성·각본", storyboard: "콘티 승인",
    anchors: "제작 자료", video: "영상 제작", post: "후반 작업", deliver: "납품",
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
    { key: "post", owner: "AI · 관리자 승인" },
    { key: "deliver", owner: "관리자 → 광고주" },
  ];
  // 이 단계로 옮기면 광고주가 판단할 차례가 된다
  var GATE = { strategy: "검토", concepts: "선택", storyboard: "승인" };
  // 콘티(board.html)가 속한 단계. 이름이 이 파일에 적히는 자리는 여기 하나이고,
  // 그 단계의 본문을 등록할 때도, 콘티 검수 링크를 띄울지 판정할 때도 같은 값을 쓴다.
  // 그래서 링크가 등록된 곳과 뜨는 곳이 어긋날 수 없다.
  var BOARD_REVIEW_STAGE = "storyboard";
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
  // 그 자리의 시계로 적는다. DB 는 UTC 라 그대로 찍으면 아홉 시간 어긋나고,
  // 「00:06 에 승인」은 새벽에 승인한 것처럼 읽힌다 — 실제로는 아침 9시다.
  /** 한국 시각 「오전 10:19」. plusMin 만큼 뒤의 시각도 낸다. */
  function hhmm(ts, plusMin) {
    var d = new Date(new Date(ts).getTime() + (plusMin || 0) * 60000);
    return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul",
      hour: "numeric", minute: "2-digit" });
  }
  // ★ 한국 시각으로 못 박는다 — 브라우저 시간대에 기대면 다른 곳에서 열 때 어긋난다 (09-23)
  function when(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
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

  // 단계별 실행 주체 — stage-executor.js 가 판단을 쥔다.
  // 스크립트가 없으면 예전 그대로 전부 AI 로 본다(기능이 죽어도 흐름은 안 깨진다)
  function SE() {
    return window.ONECUE_STAGE || {
      ORDER: FLOW.map(function (x) { return x.key; }),
      index: function () { return -1; },
      of: function () { return { mode: "ai", assignee: "", reviewer_model: "", state: "planned" }; },
      isHuman: function () { return false; },
      performer: function () { return { kind: "ai", label: "기록 없음" }; },
      reviewer: function () { return "별도 검토 없음"; },
      editable: function () { return false; },
      waiting: function () { return false; },
      currentHolder: function () { return null; },
      byProject: function () { return {}; },
      nextStep: function () { return null; },
      // 계약을 못 읽은 상태다. 검사할 수 없으면 통과시키지 않는다
      contractReady: function () { return false; },
      fields: function () { return []; },
      lines: function () { return []; },
      checkForm: function () { return ["폼 계약을 불러오지 못했습니다"]; },
      checkText: function () { return ["글 계약을 불러오지 못했습니다"]; },
      humanAllowed: function () { return true; },
      // 폼 계약이 없으면 담당자로 돌릴 수 있는 단계도 없다. 메모만 받는 자리를 열지 않는다
      hasForm: function () { return false; },
      // 계약을 못 읽었으면 「고를 필요 없음」이라고 말하지 않는다. 모른다고 말한다 —
      // 그래야 화면이 저장을 막는다(닫히는 쪽으로 실패한다)
      choiceRequired: function () { return false; },
      choiceState: function () { return "contract_missing"; },
      awaitingChoice: function () { return false; },
      ranBefore: function () { return false; },
      assignable: function () {
        return { ok: false, reason: "contract_missing",
          note: "폼 계약을 불러오지 못했습니다 — 새로고침한 뒤 다시 시도해 주세요" };
      },
      // 검토 결과를 읽는 규칙도 못 읽었다. 조용히 빈칸으로 두지 않고 오류로 보이게 한다
      reviewFindings: function () {
        return { present: false, ok: false, shape: "contract_missing",
          error: "검토 결과를 읽는 규칙을 불러오지 못했습니다 — 새로고침해 주세요" };
      },
      plainFirst: function () { return ""; },
      plainGlossary: function () { return []; },
      jargon: function () { return []; },
      sendGate: function () { return { ok: false, reason: "contract_missing", hits: [], texts: [] }; },
      JARGON: [],
    };
  }

  // 읽기 렌더는 광고주 화면(project.js)과 **같은 모듈**을 쓴다.
  // 같은 데이터를 화면마다 따로 그리던 것을 없앤다 — 역할만 다르다.
  // 모듈이 없으면 예전처럼 평범한 글로 떨어진다(화면이 비지 않는다)
  function R() {
    return window.ONECUE_RENDER || {
      concept: function (c) {
        return '<article class="cc"><header class="cc-head"><span class="k">' +
          esc((c && c.key) || "") + '안</span><span class="t">' +
          esc((c && c.title) || "") + "</span></header></article>";
      },
      development: function (d) {
        return '<div class="stage-read development"><p>' +
          esc(readable(d && d.slogan)) + "</p></div>";
      },
      cuts: function () { return ""; },
      strategy: function (s) {
        return '<div class="stage-read strategy"><p>' +
          esc(readable(s && s.one_message)) + "</p></div>";
      },
    };
  }
  // 관리자 역할 — 공통 구조에 내부 메모·위험 메모·제작 워크플로가 **덧붙는다**
  var ADMIN = { role: "admin" };

  function currentOwner(p) {
    if (p.step === "brief") {
      if (p.productionEnrolled) return "AI 제작 세션";
      if (p.enrollRequested) return "AI 연결 시스템";
      return "관리자";
    }
    if (GATE[p.step] && p.state === "ready") return "광고주";
    var held = SE().currentHolder(p);
    if (held) {
      return "담당자 " + (held.assignee || "미지정") +
        (held.state === "waiting" ? " · 결과 등록 대기" : "");
    }
    if (GATE[p.step]) return "관리자";
    if (p.job && p.job.step === p.step) return "AI 제작 세션";
    if (p.step === "anchors" || p.step === "video") return "제작 관리자";
    if (p.step === "deliver") return "관리자";
    return "AI 또는 지정 담당자";
  }

  // ── ★ 실행 주체 선택 게이트 (migrate_017) ──────────────────────────────────
  //
  // 예전에는 stage_executors 에 줄이 없으면 AI 로 보고 **묻지 않고** 작업 큐에
  // 올렸다. 이제 고르기 전에는 아무것도 만들지 않는다. 그래서 이 블록이 그 단계
  // 상세의 **맨 위**에 오고, 답하기 전까지는 다른 것이 눈에 먼저 들어오지 않는다.
  //
  // 이 블록은 관리자 화면에만 있다. 광고주 화면(project.js)은 stage_executors 를
  // 읽지도 않고, 표 자체가 관리자만 읽을 수 있게 막혀 있다(migrate_016 RLS).
  function choiceGate(p, key) {
    var s = SE();
    var state = s.choiceState(p, key);
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    if (state === "legacy_ai") {
      // 이 기능이 생기기 전에 끝난 단계다. 되돌리지도 다시 돌리지도 않는다 —
      // 무엇이 있었는지만 적는다
      return '<div class="choice-note done"' + tag + '>' +
        '<b>AI 진행 완료(기존 작업)</b>' +
        '<small>실행 주체를 고르는 기능이 생기기 전에 진행된 단계입니다. ' +
        '결과는 그대로 두고 수행 기록만 표시합니다.</small></div>';
    }
    if (state !== "awaiting") return "";
    // 이미 지나간 단계에는 묻지 않는다. 기록이 남지 않은 옛 건이라도 되돌리지 않는다
    if (s.index(key) >= 0 && s.index(key) < s.index(p.step)) return "";
    var current = p.step === key && p.state === "pending";
    var pickable = s.assignable(key);
    if (!current) {
      // 아직 오지 않은 단계다. 미리 정해 둘 수는 있지만 재촉하지 않는다
      return '<div class="choice-note ahead"' + tag + '>' +
        '<b>실행 주체 미정</b><small>이 단계에 들어오면 그때 고르셔도 됩니다. ' +
        '미리 정해 두면 들어오는 순간 그대로 시작합니다.</small></div>';
    }
    return simpleChoose(p, key);
    /* 옛 선택 양식(담당자 이름·검토 AI 를 한꺼번에 받던 것) — 쓰지 않는다 */
    return '<div class="choice-gate" data-choice-form' + tag + '>' +
      '<b>이 단계를 누가 진행할지 먼저 골라 주세요(실행 주체)</b>' +
      '<small>고르기 전까지 AI 작업 큐에 아무것도 올라가지 않습니다. ' +
      '이 선택은 관리자만 보며, 광고주 화면에는 나타나지 않습니다.</small>' +
      '<label class="exec-field"><span>담당자 이름</span>' +
      '<input type="text" data-choice-name maxlength="80" ' +
      'placeholder="담당자 진행일 때만 필요합니다"></label>' +
      '<label class="exec-field"><span>결과를 검토하는 AI(핵심 검토 AI)</span>' +
      '<input type="text" data-choice-reviewer maxlength="120" ' +
      'placeholder="예 · anthropic claude-fable-5-1"></label>' +
      '<div class="choice-actions">' +
      '<button class="btn" type="button" data-choice="ai"' + tag +
      '>AI 진행으로 시작</button>' +
      '<button class="btn ghost" type="button" data-choice="human"' + tag +
      (pickable.ok ? "" : " disabled") + '>담당자 진행으로 지정</button>' +
      '</div>' +
      (pickable.ok ? "" : '<small class="exec-blocked">' + esc(pickable.note) + '</small>') +
      '<div class="choice-problem" data-choice-problem hidden></div></div>';
  }

  // ── 실행 주체 고르기 ───────────────────────────────────────────────────────
  // 「AI 진행」은 지금까지와 똑같이 기존 jobs 큐로 간다.
  // 「담당자 진행」은 이름을 받고, 사람이 결과를 등록할 때까지 그 단계가 멈춘다.
  // 화면 조건문은 안내일 뿐이고 실제로 큐를 막는 건 DB 트리거다(migrate_016).
  function execPicker(p, key) {
    var s = SE(), pick = s.of(p, key);
    if (!s.editable(p, key)) return "";
    // ★ **AI 냐 사람이냐는 모든 단계에서 고를 수 있어야 한다** (Dan 지시).
    //   한 번 이걸 brief 에서 치웠다가 되돌렸다. 치운 이유는 「눌러도 아무
    //   일이 안 난다」였는데, **고르기가 잘못이 아니라 그 옆에 다음으로
    //   보내는 버튼이 없던 것이 잘못**이었다. 증상을 보고 엉뚱한 것을 뺐다.
    //   고르기는 「누가 맡나」를 정하는 것이고, 앞으로 보내는 것은
    //   「AI 제작 시작」이다. 둘 다 있어야 한다.
    var human = pick.mode === "human";
    var name = "exec-" + p.slug + "-" + key;
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    // 담당자로 돌릴 수 있는 단계인지는 계약이 정한다. 고르는 것 자체를 막고
    // 왜 막았는지 화면에 적는다 — 서버(onecue_stage_executor_set)도 같은 이유로 거절한다.
    // 막히는 이유는 두 가지다 — 제품·자료 확인(의뢰가 막힌다), 그리고 아직 결과를 받을
    // 칸이 정해지지 않은 단계(이번 범위 아님 · 메모만 남는 자리를 만들지 않는다)
    var pickable = SE().assignable(key);
    // assignable() 이 이미 같은 판단을 하지만 humanBlocked 목록을 한 번 더 본다 —
    // 계약이 바뀌어도 제품·자료 확인은 두 겹으로 닫혀 있어야 한다
    var personOk = pickable.ok && SE().humanAllowed(key);
    var offLabel = pickable.reason === "out_of_scope"
      ? "이번 범위 아님 · 아직 고를 수 없습니다"
      : "권장하지 않음 · 이번 버전에서는 고를 수 없습니다";
    // 고를 것은 둘 중 하나뿐인데 화면에는 라디오 둘 · 못 누르는 항목 · 그 이유 ·
    // 이름 칸 · 검토 AI 칸 · 저장 단추 · 안내문이 한꺼번에 서 있었다. 정작 지금
    // 할 일(둘 중 하나 누르고 저장)이 그 사이에 묻힌다.
    // 그래서 **지금 누를 수 있는 것만** 위에 두고, 못 고르는 항목과 그 이유,
    // 자주 안 건드리는 칸은 접는다. 입력 칸은 DOM 에서 빼지 않는다 — 저장
    // 처리기가 data-exec-* 로 그대로 찾아 쓴다.
    var modes = '<label><input type="radio" name="' + esc(name) + '" data-exec-mode value="ai"' +
      (human ? "" : " checked") + '><span>AI 진행</span></label>' +
      (personOk
        ? '<label><input type="radio" name="' + esc(name) + '" data-exec-mode value="human"' +
          (human ? " checked" : "") + '><span>담당자 진행</span></label>'
        : "");
    var nameField = '<label class="exec-field"><span>담당자 이름</span>' +
      '<input type="text" data-exec-name maxlength="80" value="' + esc(pick.assignee) +
      '" placeholder="담당자 진행일 때만 필요합니다"></label>';
    var reviewerField = '<label class="exec-field"><span>결과를 검토하는 AI(핵심 검토 AI)</span>' +
      '<input type="text" data-exec-reviewer maxlength="120" value="' + esc(pick.reviewer_model) +
      '" placeholder="예 · anthropic claude-fable-5-1"></label>';
    var folded = (personOk ? "" :
        '<p class="exec-blocked"><b>담당자 진행 — ' + esc(offLabel) + '</b>' +
        '<span>' + esc(pickable.note) + '</span></p>') +
      (personOk ? nameField : "") + reviewerField +
      '<small>비워 두면 AI 진행입니다. 이미 시작된 AI 작업이 있으면 담당자로 바꿀 수 없습니다.</small>' +
      (personOk ? "" : nameField);
    return '<div class="exec-pick" data-exec-form' + tag + '>' +
      '<div class="exec-line">' +
      '<b>누가 맡습니까</b>' +
      '<div class="exec-modes">' + modes +
      // ★ 고를 것이 하나뿐이면 **왜 하나뿐인지 그 자리에서** 말한다.
      //   전에는 이 설명이 「검토 AI · 담당자 설정」 접힌 칸 안에 있었다.
      //   그래서 화면에는 「AI 진행」 하나만 서 있고 이유는 안 보였다
      //   (Dan 2026-09-22: 「선택이 ai진행 뿐이야」).
      (personOk ? "" : '<span class="exec-only">담당자 진행은 아직 고를 수 ' +
        "없습니다 — " + esc(pickable.note || offLabel) + "</span>") +
      "</div>" +
      '<button class="btn ghost" type="button" data-exec-save' + tag + '>저장</button>' +
      '</div>' +
      '<details class="exec-more"><summary>검토 AI · 담당자 설정</summary>' +
      folded + '</details>' +
      '</div>';
  }

  // 구조화 폼 — AI 가 만드는 결과와 칸이 똑같다. 계약이 칸도 규칙도 쥐고 있고
  // 이 함수는 그 계약을 그리기만 한다. 칸 이름을 여기서 새로 짓지 않는다
  function formFields(key) {
    var list = SE().fields(key);
    if (!list.length) return "";
    return '<div class="stage-form">' + list.map(function (f) {
      var id = ' data-form-field="' + esc(f.key) + '"';
      var head = '<span>' + esc(f.label) +
        (f.required ? ' <em class="req">필수</em>' : '') + '</span>' +
        '<small>' + esc(f.help || "") + '</small>';
      if (f.type === "boolean") {
        return '<label class="exec-field form-bool">' + head +
          '<select' + id + '><option value="false">' + esc(f.false_label || "사용 안 함") +
          '</option><option value="true">' + esc(f.true_label || "사용") +
          '</option></select></label>';
      }
      if (f.type === "list") {
        return '<label class="exec-field">' + head +
          '<textarea' + id + ' rows="4" placeholder="' + esc(f.placeholder || "") +
          '"></textarea><small class="form-hint">한 줄에 하나씩 · ' +
          f.min_items + '~' + f.max_items + '줄 · 한 줄 ' + f.max_length + '자까지</small></label>';
      }
      return '<label class="exec-field">' + head +
        '<input type="text"' + id + ' maxlength="' + f.max_length +
        '" placeholder="' + esc(f.placeholder || "") + '">' +
        '<small class="form-hint">' + f.min_length + '~' + f.max_length + '자</small></label>';
    }).join("") + '</div>';
  }

  // 사람이 끝냈다는 것을 등록한다. 계약이 있는 단계(develop)는 결과물 자체를
  // 여기서 구조화된 칸으로 받아 한 번에 저장한다 — 메모만 남고 산출물이 안 생기던
  // 자리가 이 자리였다.
  //
  // ★ 계약에 칸이 없는 단계에는 등록 폼을 아예 그리지 않는다. 예전에는 그 자리에
  //   메모만 받는 폼이 떴는데, 그게 바로 「메모형」 구조다. 이번 범위가 아니므로
  //   폼 대신 왜 안 열렸는지만 적는다. 애초에 담당자 지정 자체가 막혀 있어서
  //   여기까지 오지 않지만, 옛 데이터로 이 상태가 되더라도 메모 폼은 뜨지 않는다.
  function deliverBox(p, key) {
    var s = SE();
    if (!s.waiting(p, key)) return "";
    var pick = s.of(p, key);
    var structured = s.fields(key).length > 0;
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    if (!structured) {
      return '<div class="deliver-box out-of-scope"' + tag + '>' +
        '<b>담당자 ' + esc(pick.assignee || "미지정") + ' 지정됨 — 등록 폼 없음</b>' +
        '<small>이번 범위 아님 — 이 단계는 결과를 받을 칸이 아직 정해지지 않았습니다. ' +
        '메모만 받는 등록은 결과물을 만들지 못해 열지 않았습니다. ' +
        '이 단계를 다시 AI 진행으로 돌려 주세요.</small></div>';
    }
    return '<div class="deliver-box structured" data-deliver-form' + tag +
      ' data-deliver-structured>' +
      '<b>담당자 ' + esc(pick.assignee || "미지정") + ' 진행 중 — 결과 등록 대기</b>' +
      '<small>이 단계는 AI 작업 큐에 올라가지 않습니다. 아래 칸은 AI 가 만들 때와 같은 칸입니다' +
      ' — 채워서 등록하면 그대로 결과물이 됩니다.</small>' +
      formFields(key) +
      // 광고주가 읽을 말과 내부 제작 명세는 칸을 나눈다. 같은 칸에 섞으면
      // 내부 용어가 섞인 글이 그대로 광고주에게 나간다
      '<label class="exec-field plain"><span>광고주용 설명 <em>쉬운 일상어</em></span>' +
      '<textarea data-deliver-summary rows="3" maxlength="4000" ' +
      'placeholder="예 · 자몽을 조각내 붉은 사선으로 놓고, 화면 가장자리에 여백을 둡니다"></textarea>' +
      // 쉬운 말을 앞에 쓰고 전문용어는 괄호에 넣는다 — 「쉬운 말(전문용어)」 꼴이다.
      // 전문용어를 감추지 않는다. 광고주용 설명에는 괄호 안의 말만 빼면 된다.
      // 용어 자체는 계약에서만 온다 — 여기 예로 적으면 그게 곧 사본이 된다
      '<small class="jargon-help">이렇게 씁니다 — ' +
      SE().plainGlossary(6).map(esc).join(" · ") + '</small>' +
      '<small class="jargon-help warn">광고주용 설명에 이런 말은 쓰지 마세요 — ' +
      SE().JARGON.slice(0, 6).map(function (x) { return esc(x[0]); }).join(" · ") +
      '</small></label>' +
      '<label class="exec-field"><span>내부 제작 명세 <em>전문용어 가능</em></span>' +
      '<textarea data-deliver-note rows="3" maxlength="10000" ' +
      'placeholder="컷 사양·저장 위치 등 내부 기록. 광고주 화면에는 나가지 않습니다"></textarea></label>' +
      '<label class="exec-adv plain-check"><input type="checkbox" data-deliver-plain>' +
      '<span>게시 전 검수 — <b>비전문가가 바로 이해할 수 있는 말인지</b> 확인했습니다</span></label>' +
      // 등록은 단계를 옮기지 않는다. 전진은 관리자 검수 뒤 기존 경로로만 일어난다
      '<small class="deliver-note-advance">등록해도 단계는 움직이지 않습니다. ' +
      '다음 단계로 넘기는 것은 검수를 마친 뒤 기존 경로로만 합니다.</small>' +
      '<div class="deliver-problems" data-deliver-problems hidden></div>' +
      '<button class="btn" type="button" data-deliver-save' + tag + '>담당자 결과 등록</button>' +
      '</div>';
  }

  // 결과가 아직 없는 현재 단계 — 왜 비어 있는지 화면에서 바로 읽히게 한다.
  // 「저장된 상세 내용이 없습니다」만 뜨면 고장인지 대기인지 구분이 안 된다
  function stageWait(p, key, label) {
    var st = SE().status(p, key, false);
    var head, body, cls = "stage-wait";
    if (st.kind === "human_wait") {
      head = "제작 중 · 담당자 결과 대기";
      body = "담당자 " + (st.assignee || "미지정") + " 가 진행 중입니다. 결과가 등록되면 이 자리에 " +
        label + " 상세가 그대로 표시됩니다.";
    } else if (st.kind === "empty") {
      head = "등록 완료 · 내용 없음";
      body = "담당자가 완료를 등록했지만 " + label + " 내용이 아직 저장되지 않았습니다. 확인이 필요합니다.";
      cls += " alert";
    } else if (st.kind === "ai_working") {
      head = "제작 중 · AI 작업";
      body = "AI 작업 큐에서 만들고 있습니다. 끝나면 이 자리에 " + label + " 상세가 표시됩니다.";
    } else {
      head = "대기 중";
      body = "아직 " + label + " 결과가 등록되지 않았습니다.";
    }
    return '<div class="' + cls + '"><b>' + esc(head) + '</b><span>' + esc(body) + '</span></div>';
  }

  // ── 무엇이 모자란가 ───────────────────────────────────────────────────────
  //
  // 광고주 화면과 **같은 모듈·같은 계약**으로 센다(material-gaps.js). 두 화면이
  // 다른 답을 하면 관리자는 「다 왔다」고 보고 광고주는 「더 달라」를 본다.
  //
  // 종류는 광고주에게 고르라고 하지 않는다. 의뢰 글을 읽고 우리가 판단하고,
  // 여기서 **맞는지만** 확인한다. ai: 로 남은 것은 짐작이고 human: 은 확인된 것이다.
  function needsPanel(p) {
    var G = window.ONECUE_MATERIAL_GAPS, spec = window.ONECUE_AD_TYPE_MATERIALS;
    if (!G || !spec) return "";
    var counts = {};
    (p.files || []).forEach(function (f) {
      var k = spec.kinds && spec.kinds[f.kind];
      if (!k || (k.by !== "client" && k.by !== "both")) return;
      counts[f.kind] = (counts[f.kind] || 0) + 1;
    });
    var guessed = String(p.ad_type_by || "").indexOf("ai:") === 0;
    // 보기 전용에는 **무엇으로 보고 있는지만** 보여 준다. 고르는 칸과 누르는
    // 것을 주면 눌러도 안 되는 것을 준 셈이고, 그게 화면을 못 믿게 만든다.
    // 아래 「필요한 자료」 계산은 그대로 돈다 — 그건 읽는 것이라 막을 이유가 없다.
    var picker = !canWrite
      ? '<div class="need-pick ro"><label>광고 종류</label><b>' +
        esc((p.ad_type && spec.types[p.ad_type] && spec.types[p.ad_type].label)
            || "아직 정하지 않음") + "</b>" +
        (guessed ? '<em class="need-guess">AI 짐작입니다 — 관리자 계정에서 확인합니다</em>'
                 : "") + "</div>"
      : '<div class="need-pick"><label>광고 종류</label><select data-adtype="' +
      esc(p.slug) + '">' +
      (p.ad_type ? "" : '<option value="">— 아직 정하지 않음 —</option>') +
      Object.keys(spec.types).map(function (k) {
        return '<option value="' + esc(k) + '"' + (k === p.ad_type ? " selected" : "") +
          ">" + esc(spec.types[k].label) + "</option>";
      }).join("") + '</select>' +
      '<button class="btn ghost" data-adtype-save="' + esc(p.slug) + '">' +
      (guessed ? "이걸로 확정" : "저장") + "</button>" +
      (guessed ? '<em class="need-guess">AI 짐작입니다 — 확인해 주십시오</em>' : "") +
      '<span class="msg" data-adtype-msg="' + esc(p.slug) + '"></span></div>';

    if (!p.ad_type) {
      return '<div class="needs need-admin"><h4>자료 확인</h4>' + picker +
        '<p class="need-type">종류를 정해야 무엇이 모자란지 셀 수 있습니다.</p></div>';
    }
    // ★ 자료 칸은 「광고주에게 무엇을 더 달라고 할까」가 아니라 「있는 것으로 어떻게 만들까」다 (Dan 09-24 · 광고주는 가볍게).
    //   광고주에게 가는 것은 **없으면 정직하게 만들 수 없는 것(required)** 하나뿐이다 — 그때만 메시지 한 번.
    //   나머지는 우리가 메운다. 컷 수와 견주지 않는다 — 컷 수는 광고주가 준 값이 아니다(길이로 자동 계산).
    //   판정(gaps)은 파이썬과 같은 한 벌을 그대로 쓰고, 여기서는 읽는 자리만 바꾼다.
    var out = G.gaps(counts, p.ad_type, 0);
    if (!out) return "";
    var t = spec.types[out.type] || { materials: [] };
    var nameOf = function (it) { return (it.say && it.say.label) || (spec.kinds[it.kind] && spec.kinds[it.kind].label) || it.kind; };
    var FILL = {
      logo: "제품 사진에 보이는 로고를 잘라 씁니다. 그것도 없으면 로고를 얹지 않습니다 — 비슷한 로고를 그리지 않습니다.",
    };
    var got = t.materials.filter(function (m) { return (counts[m.kind] || 0) > 0; }).map(function (m) {
      var n = counts[m.kind];
      return "<li>" + esc(nameOf(m) + " " + n + "개") +
        (m.real === "yes" ? '<span class="need-why">가진 각도·모양 그대로 씁니다 — 없는 각도는 지어내지 않습니다</span>' : "") + "</li>";
    });
    var fill = out.notes.filter(function (it) { return it.mode === "missing"; }).map(function (it) {
      return "<li>" + esc(nameOf(it) + " 없음") + '<span class="need-why">' +
        esc(FILL[it.kind] || ("있는 자료 안에서 메웁니다 — " + it.why)) + "</span></li>";
    });
    var watch = out.notes.filter(function (it) { return it.mode === "caution"; }).map(function (it) {
      return "<li>" + esc(String(it.text || "").replace(/^살필 것 — /, "")) + "</li>";
    });
    var block = out.blocking.map(function (it) {
      return "<li>" + esc(nameOf(it) + " 없음") + '<span class="need-why">' + esc(it.why) + "</span>" +
        '<span class="need-why">광고주에게 한 번 요청 — ' + esc((it.say && it.say.ask) || it.ask) + "</span></li>";
    });
    return '<div class="needs need-admin"><h4>자료 확인</h4>' + picker +
      (block.length ? '<h4>이게 없으면 정직하게 만들 수 없습니다 — 광고주에게 요청</h4><ul class="need-block">' + block.join("") + "</ul>"
                    : '<p class="need-ok">광고주에게 더 요청할 것 없음 — 있는 자료로 만듭니다.</p>') +
      (got.length ? '<h4>받은 자료</h4><ul class="need-note">' + got.join("") + "</ul>" : "") +
      (fill.length ? '<h4>우리가 메울 것</h4><ul class="need-note">' + fill.join("") + "</ul>" : "") +
      (watch.length ? '<h4>살필 것</h4><ul class="need-note">' + watch.join("") + "</ul>" : "") +
      "</div>";
  }

  function flow(p, bodies) {
    var current = FLOW.map(function (x) { return x.key; }).indexOf(p.step);
    var history = p.aiHistory || [];
    function stageAi(key) {
      return history.filter(function (h) { return h.step === key; })[0] || null;
    }
    return '<div class="flow-wrap"><div class="flow-head"><span class="lbl">전체 제작 흐름</span>' +
      '<span class="now-owner">현재 담당 <b>' + esc(currentOwner(p)) + '</b></span></div>' +
      '<div class="flow-track">' + FLOW.map(function (s, i) {
        // 프로젝트를 닫으면(068) 마지막 납품 단계까지 「완료」다
        var closed = p.state === "done";
        var status = (i < current || closed) ? "done" : (i === current ? "current" : "upcoming");
        var marker = (i < current || closed) ? "완료" : (i === current ? "현재" : (i + 1));
        var h = stageAi(s.key), ai = h && h.executor ? h.executor : null;
        var version = (p.aiVersions && p.aiVersions[s.key]) || (h ? 1 : 0);
        // 수행자와 핵심 검토 AI — 관리자가 지정한 실행 주체가 먼저고, 없으면 AI 실행 기록이다
        var pick = SE().of(p, s.key);
        var who = SE().performer(p, s.key);
        var worker = (who.kind === "human" ? "담당자 · " : "AI · ") + who.label;
        var reviewer = SE().reviewer(p, s.key);
        // 검토 결과는 계약이 아는 모양일 때만 숫자로 그린다. 모르는 모양이면
        // 조용히 빈칸이 되지 않고 무엇이 잘못됐는지 그 자리에 뜬다
        var fr = SE().reviewFindings(ai);
        var findingText = !fr.present ? ''
          : (fr.ok
            ? '<span>검토 결과 · 치명 ' + fr.critical + ' / 참고 ' + fr.advisory +
              (fr.shape === "count" ? '' : ' · ' + esc(fr.shape_label)) + '</span>'
            : '<span class="findings-bad">검토 결과를 읽지 못했습니다 · ' +
              esc(fr.error) + '</span>');
        var waitingHere = SE().waiting(p, s.key);
        var working = i === current && p.job && p.job.step === s.key;
        var updated = i === current && p.aiNeedsReview && h;
        // 구성·각본(내 단계)은 두 갈래 선택 칸이 대신한다 — 옛 상태 기계의 배지·바·선택 양식을 띄우지 않는다 (077)
        var devTwo = s.key === "develop" && p.step === "develop" && !(p.development && ((p.development.arc || []).length || (p.development.copies || []).length));
        var needsPick = !devTwo && SE().awaitingChoice(p, s.key);
        // ★ 콘티는 그림이 나와야 끝난 것이다. 컷 표가 등록됐다고 「업데이트 완료」를
        //   달면, 바로 아래 본문의 「시각 콘티 미제작」과 정면으로 어긋난다. 머리와
        //   본문이 서로 다른 말을 하면 둘 다 못 믿게 된다 — 머리를 본문에 맞춘다.
        var boardMissing = s.key === BOARD_REVIEW_STAGE &&
          !(p.files || []).some(function (f) { return boardCurrent(p, f); });
        // 콘티 칸 머리는 콘티 자리를 그대로 말한다 — 수정 요청 뒤 옛 「업데이트 완료」가 남아 있었다 (09-24)
        var bph = (s.key === BOARD_REVIEW_STAGE && i === current) ? SE().boardActions(p, p.boardCounts).phase : "";
        // ★ 돈이 드는 단계(제작 자료·영상)는 작업이 큐에 걸려 있어도 **아무도
        //   집지 않는다.** 유료 생성은 사람이 누르는 자리라서다.
        //   ⚠ 배지는 summary 안에 있어서 **누르면 단계가 접힌다.** 그래서
        //   여기에 「눌러야 시작합니다」라고 적으면 안 된다 — 누르면 반대로
        //   동작한다. 누를 것은 본문 안에 버튼으로 둔다.
        var paidStage = s.key === "anchors" || s.key === "video";
        // ★ 유료 단계 배지는 **자리(phase)를 그대로 말한다.** 앵커가 올라와
        //   본문이 「검수해 주세요」인데 머리가 「유료 생성 대기」였다 —
        //   머리와 본문이 다른 말을 하면 둘 다 못 믿게 된다.
        // ★ act 는 이 아래에서 만들어진다. 배지가 그것을 보려 했으니 늘 빈값이라
        //   자리를 모르는 채 「유료 생성 대기」로 굳었다. 자리만 여기서 따로 구한다 —
        //   act 를 위로 끌어올리면 그 위의 판단들이 순서에 얽힌다.
        var paidAt = (paidStage && i === current)
          ? SE().phase(p, s.key, !!(p.stageResults && p.stageResults[s.key]))
          : "";
        var paidBadge = paidAt === "review"
            ? '<em class="ai-update done">생성 완료 · 검수 대기</em>'
          : paidAt === "working"
            ? '<em class="ai-update working">만드는 중</em>'
          : paidAt === "approved"
            ? '<em class="ai-update done">승인 완료</em>'
          : (paidAt === "start" || paidAt === "choose")
            ? '<em class="ai-update choice">유료 생성 대기</em>'
          : "";
        var badge = bph === "board.make" ? '<em class="ai-update choice">' + (boardRedoAt(p) ? "콘티 다시 그릴 차례" : "콘티 뽑기 차례") + "</em>"
          : bph === "board.working" ? '<em class="ai-update working">AI 작업 중 · 콘티 그림</em>'
          : paidBadge ? paidBadge
          : needsPick ? '<em class="ai-update choice">실행 주체 선택 대기</em>'
          : (waitingHere ? '<em class="ai-update working">담당자 결과 대기</em>'
          : (working && paidStage
            ? '<em class="ai-update choice">유료 생성 대기</em>'
          : (working ? '<em class="ai-update working">AI 작업 중</em>'
          : (updated && !(s.key === "concepts" && !(p.concepts && p.concepts.length))
            ? (boardMissing
              ? '<em class="ai-update working">콘티 준비 중</em>'
              : '<em class="ai-update done">NEW · 업데이트 완료</em>')
            : ''))));
        var personBadge = pick.mode === "human"
          ? '<em class="stage-person">담당자 ' + esc(pick.assignee || "미지정") +
            (pick.state === "delivered" ? " · 등록 완료" : "") + '</em>' : '';
        var versionBadge = version ? '<em class="stage-version">v' + version + '</em>' : '';
        // 등록된 뒤에는 광고주용 설명과 내부 명세를 따로 보여 준다 — 섞어 놓지 않는다
        var delivered = pick.state === "delivered"
          ? '<span>담당자 결과 등록 완료' + (pick.delivered_at ? ' · ' + esc(ago(pick.delivered_at)) : '') +
            (pick.plain_language_ok ? ' · 쉬운 말 검수 확인' : '') + '</span>' +
            (pick.client_summary
              ? '<div class="stage-content delivered-text"><dl class="stage-data">' +
                '<dt>광고주용 설명</dt><dd>' + esc(pick.client_summary) + '</dd>' +
                (pick.delivered_note
                  ? '<dt>내부 제작 명세</dt><dd>' + esc(pick.delivered_note) + '</dd>' : '') +
                '</dl></div>'
              : (pick.delivered_note
                ? '<div class="stage-content delivered-text"><dl class="stage-data">' +
                  '<dt>내부 제작 명세</dt><dd>' + esc(pick.delivered_note) + '</dd></dl></div>' : ''))
          : '';
        // 아직 오지 않은 단계도 펼칠 수 있어야 한다 — 실행 주체는 미리 정해 두는 것이다.
        // ★ 답을 기다리는 단계에서는 선택 블록이 **맨 위**에 온다. 수행·검토 줄보다
        //   먼저 눈에 들어와야 무엇을 해야 하는지가 바로 읽힌다
        // ── 지금 이 단계에서 할 일 하나 ─────────────────────────────────────
        // 자리(phase)가 무엇을 보여 줄지 혼자 정한다. 화면은 그 표를 그리기만
        // 한다 — 여기서 조건을 다시 판단하지 않는다. 구성·각본 한 단계에만
        // 먼저 건다. 되는 것을 보고 나서 콘티로 옮긴다.
        // 제작 자료·영상 제작도 같은 길을 쓴다. 029 로 DB 함수가 세 단계를
        // 받게 됐으니 화면도 같이 넓힌다 — 한쪽만 넓히면 버튼이 눌리고 튕긴다.
        var act = (!devTwo && (s.key === LIFECYCLE_STEP || s.key === "post" || SE().isPaid(s.key)) && i === current)
          ? SE().actions(p, s.key, !!(p.stageResults && p.stageResults[s.key]))
          : null;
        // 콘티는 두 겹이라 판단이 다르다 — 전용 상태기계를 쓴다
        var bact = (s.key === BOARD_REVIEW_STAGE && i === current)
          ? SE().boardActions(p, p.boardCounts) : null;
        var detail = '<div class="flow-detail">' +
          // ★ 유료 단계는 본문 쪽 버튼 하나만 쓴다. 기존 바를 같이 띄우면
          //   「AI 작업 시작」과 「제작 자료 만들기」가 나란히 뜨고, 둘 다 같은
          //   함수를 부르는데 한쪽만 비용을 말한다. 값을 안 말하는 버튼을
          //   누르면 얼마인지 모른 채 돈이 나간다.
          (bact ? boardBar(p, bact)
            : (act && !SE().isPaid(s.key)) ? lifecycleBar(p, s.key, act)
            : SE().isPaid(s.key) ? ""
            : devTwo ? "" : choiceGate(p, s.key)) +
          // ★ 기록이 없으면 이 줄을 띄우지 않는다 — 모든 단계에 「기록 없음 · 별도 검토
          //   없음」이 떠서 끝난 단계까지 안 한 것처럼 보였다 (09-23 화면 점검).
          // 누가 했는지만 — 모델 이름·「별도 검토 없음」은 관리자 판단에 쓰이지 않는다 (09-24 검수)
          (s.key === "strategy" && p.strategy
            ? '<span>수행 · ' + (p.strategy.written_by === "human" ? "사람이 씀" : "AI가 씀") + "</span>"
            : who.label === "기록 없음" ? "" :
            '<span>수행 · ' + (who.kind === "human" ? "사람 · " + esc(who.label) : "AI") + "</span>" +
            (reviewer === "별도 검토 없음" ? "" : '<span>검토 · ' + (/claude|anthropic|gpt|openai|gemini|ai:/i.test(reviewer) ? "AI" : esc(reviewer)) + "</span>")) +
          findingText + delivered +
          // 유료 단계는 고르기를 묻지 않으므로 선택 폼도 띄우지 않는다 —
          // 띄우면 「사람이 직접 진행」이 보이고, 그 길은 없다.
          // ★ 간단한 「누가 맡습니까」가 떠 있으면 옛 선택 양식은 띄우지 않는다 —
          //   두 개가 떴다 (Dan 09-23: 「아래쪽이 더맘에드는데 … 심플하게 나오니깐」)
          // 아직 오지 않은 단계에도 옛 선택 양식이 떴다 — 고르기는 그 단계에 들어와서
          (bact || act || devTwo || SE().isPaid(s.key) || status === "upcoming" || s.key === "deliver" || s.key === "brief" || s.key === "facts" || s.key === "strategy" || s.key === "concepts" ? "" : execPicker(p, s.key)) +
          deliverBox(p, s.key) +
          (s.key === "facts" ? needsPanel(p) : "") +
          (status === "upcoming" ? ''
            : (bodies[s.key] || '<p class="stage-empty">저장된 상세 내용이 없습니다.</p>')) +
          '</div>';
        return '<details class="flow-step ' + status + '"' + (status === "current" ? ' open' : '') + '>' +
          '<summary class="flow-summary"><span class="flow-marker">' + marker + '</span><strong>' +
          esc(STEP_NAME[s.key]) + '</strong>' + versionBadge + personBadge + badge +
          '<small>' + esc(s.owner) + '</small>' + costChip(p, s.key) + signoff(p, s.key) + '</summary>' + detail + '</details>';
      }).join("") + '</div></div>';
  }

  // ── 돈 ────────────────────────────────────────────────────────────────────
  //
  // 원화는 **단가가 정해졌을 때만** 붙인다. 공개 가격표를 넣어 두면 Dan 이
  // 실제 내는 금액과 다를 수 있고(연간 할인·보너스), 틀린 원가로 서비스 가격을
  // 정하는 것은 원가를 모르는 것보다 나쁘다. 단가는 db/credit_rates.json 에 있다.
  function krwPerCredit() {
    var r = window.ONECUE_CREDIT_RATES;
    var v = r && r.krw_per_credit;
    return (typeof v === "number" && v > 0) ? v : null;
  }

  // ★ 확정 단가(krw_per_credit)가 없으면 공개 요금으로 잡은 추정 단가를 「약 · 추정」으로 보인다.
  //   Dan 09-23: 「크레딧별 가격 파악해서 원화로 환산한 대략적 가격까지」. 근거는 credit_rates.json estimate_basis
  function krwEstimate() {
    var r = window.ONECUE_CREDIT_RATES, v = r && r.krw_per_credit_estimate;
    return (typeof v === "number" && v > 0) ? v : null;
  }
  function won(credits) {
    if (!credits) return "";
    var rate = krwPerCredit();
    if (rate) return " · ₩" + Math.round(credits * rate).toLocaleString();
    var est = krwEstimate();
    return est ? " · 약 ₩" + Math.round(credits * est).toLocaleString() : "";
  }
  /** 단계 제목 줄에 붙는 크레딧 — 돈이 나간 단계에만, 모든 단계 같은 자리 (Dan 09-23 「일관되게」) */
  function costChip(p, step) {
    var rows = (p.spends || []).filter(function (x) { return spendStage(x) === step; });
    if (!rows.length) return "";
    var all = 0, gone = 0;
    rows.forEach(function (x) { var c = Number(x.credits) || 0; all += c; if (x.outcome === "discarded") gone += c; });
    return '<small class="cost-chip">' + all + "cr" + (gone ? " · 버린 판 " + gone : "") + "</small>";
  }

  /** 이 단계에서 실제로 나간 크레딧. */
  // ★ 기록은 「돈이 나간 때의 단계」로 남는다. 영상 단계 중에 만든 소품 앵커(이미지)가
  //   영상 몫으로 잡혀 제작 자료 3cr · 영상 263cr 로 보였다(실제 5 · 261). **무엇을
  //   만들었나**로 나눈다 — 영상 엔진이면 영상, 이미지면 제작 자료 (Dan 09-23 지적).
  function spendStage(x) {
    if (x.step !== "video" && x.step !== "anchors") return x.step;
    return /seedance|kling|veo|video|hailuo|wan/i.test(x.engine || "") ? "video" : "anchors";
  }
  function spentOn(p, step) {
    return (p.spends || []).filter(function (x) { return spendStage(x) === step; })
      .reduce(function (a, x) { return a + (Number(x.credits) || 0); }, 0);
  }

  function spentAll(p) {
    return (p.spends || []).reduce(function (a, x) {
      return a + (Number(x.credits) || 0);
    }, 0);
  }

  /** 단계 이름 옆에 붙는 한 줄. 쓴 것이 없으면 예상을 보여 준다. */
  function costLine(p, step) {
    var used = spentOn(p, step);
    var plan = SE().isPaid(step) ? SE().planFor(p, step) : null;
    var est = plan ? plan.credits : 0;
    if (!used && !est) return "";
    var rows = (p.spends || []).filter(function (x) { return spendStage(x) === step; });
    // 기록 원문(건 이름·메모)을 이어 붙이면 읽을 수 없다 — 합계 한 줄, 내역은 접는다
    function tidy(x) {
      var w = String(x.what || x.engine || "").split("★")[0];
      w = w.replace(/^[0-9A-Za-z_]+ · (video|anchors|storyboard) · /, "").trim();
      return w.length > 40 ? w.slice(0, 40) + "…" : w;
    }
    return '<div class="cost-line">' +
      (used
        ? '<b>' + used + " 크레딧" + won(used) + "</b>" +
          '<span class="cost-what">생성 ' + rows.length + "번</span>" +
          '<details class="cost-list"><summary>내역</summary><ol>' + rows.map(function (x) {
            return "<li>" + esc(hhmm(x.spent_at)) + " · " + esc(tidy(x)) + " · <b>" +
              Number(x.credits) + "cr</b>" + (x.outcome === "discarded" ? ' <em class="gone">버린 판</em>'
              : x.outcome === "used" ? ' <em class="kept">채택</em>' : "") + "</li>";
          }).join("") + "</ol></details>"
        : '<b class="est">예상 ' + est + " 크레딧" + won(est) + "</b>") +
      "</div>";
  }

  // ── 돈이 나가는 단계의 본문 ───────────────────────────────────────────────
  //
  // 버튼은 **본문 안에** 둔다. summary 안에 두면 누르는 순간 단계가 접힌다 —
  // 실제로 그렇게 만들어 놨었고, Dan 이 눌렀을 때 접혔다.
  //
  // 그리고 누르기 전에 **얼마인지** 적는다. 계획(render_plan)에 적힌 값을
  // 읽을 뿐이고 화면이 값을 지어내지 않는다 — 계획이 없으면 값도 없고,
  // 그때는 「계획이 먼저」라고 말한다.
  /** 고쳐 달라고 하신 뒤에 **계획이 실제로 손봐졌는가.** */
  function planReady(p, s) {
    var pick = SE().of(p, s) || {};
    if (!pick.revision_at) return true;      // 처음 뽑는 자리는 해당 없음
    var at = p.render_mode_at;
    return !!(at && new Date(at) > new Date(pick.revision_at));
  }

  /** ★ 적어 주신 의견이 **답을 받고 정해졌는가.**
   *
   *  절차를 칸에 그려 놓기만 하면 건너뛸 수 있고, 건너뛸 수 있는 절차는
   *  없는 것과 같다. 그래서 순서가 곧 잠금이다 — 의견이 있는데 답변이
   *  없거나, 답변을 보시고 아직 안 정하셨으면 **다시 뽑기가 안 눌린다.**
   *  (Dan 2026-09-22: 「결정 난다음 재생성하는 단계가있으면 좋겟음」)
   *
   *  보는 것은 **지금 판**뿐이다. 지난 판에 적어 두신 말은 이미 지나갔다. */
  // 이 단계가 내놓는 것이 무엇인가. 앵커에 적어 주신 말이 영상을 잠그면
  // 안 된다 — 잠그는 이유와 잠기는 대상이 어긋나면 풀 길을 못 찾는다.
  function stageKinds(s) {
    // 단계마다 내놓는 것 — 제작 자료=앵커, 영상=클립, 후반=완성본(final)
    return s === "anchors" ? ["anchor"] : s === "post" ? ["final"] : ["clip"];
  }
  /** 자리(covers_call)마다 **가장 새 판**. 다시 뽑기의 잠금은 이것을 본다. */
  function newestTakes(p, s) {
    var kinds = stageKinds(s);
    var all = (p.files || []).filter(function (f) { return kinds.indexOf(f.kind) >= 0 && !((f.meta || {}).material); });   // 제작 재료는 판이 아니다
    return all.filter(function (f) {
      var call = (f.meta || {}).covers_call || "";
      return !all.some(function (g) {
        return g.id !== f.id && ((g.meta || {}).covers_call || "") === call &&
          String(g.created_at || "") > String(f.created_at || "");
      });
    });
  }
  /** 가장 새 판에 **사장님 의견이 걸려 있는가** — 걸려 있으면 그 판은 승인하지 않는다.
   *  순서: 결과 → (괜찮으면) 승인 / (고칠 게 있으면) 의견 → 답변 → 정하기 → 새 판 → 다시 여기.
   *  위에 「승인」, 아래에 「이 답변대로 갑니다」가 같이 떠서 무엇부터인지 몰랐다
   *  (Dan 09-23: 「순서와 절차에 맞게 알아서 쫙훑어보고 니가 순서 정해서 짜면안되냐?」).
   *  고치기로 한 판을 승인할 이유가 없다 — 새 판이 나오면 그 판에 승인이 다시 뜬다. */
  function takeOpen(p, s) {
    return newestTakes(p, s).some(function (f) { return !!(f.meta || {}).dan_take; });
  }
  var TAKE_OPEN_NOTE = '<span class="lc-msg">의견을 처리하는 중입니다 — 아래 판의 <b>제작 쪽 답변</b>을 ' +
    "보고 「이 답변대로 갑니다」를 누르시면 다시 만듭니다. 새 판이 나오면 여기서 승인합니다.</span>";

  /** 새 판이 나왔는데 아직 **검수가 안 붙었거나 사장님이 안 보신** 것.
   *
   *  Dan 2026-09-23: 「v5는 너의 피드백과 함께 내가 그다음 수정요청할지
   *  여부를 쓰게 나와야하는데, 지금은 그냥 아무것도 안써있고 하물며
   *  다시뽑기 버튼은 활성화 되어있음」
   *  전에는 **의견을 적으신 판만** 잠갔다. 그래서 막 나온 v5 — 검수도 없고
   *  의견도 아직 없는 판 — 은 잠글 이유가 없는 것으로 보였다. 거꾸로다.
   *  아무도 안 본 판이야말로 다시 뽑으면 안 되는 판이다. */
  function unseenTake(p, s) {
    if (s === "anchors") return null;
    return newestTakes(p, s).filter(function (f) {
      var m = f.meta || {};
      return !m.review || m.review === "pending" || !m.dan_take;
    })[0] || null;
  }
  function openTakes(p, s) {
    var kinds = stageKinds(s);
    return (p.files || []).filter(function (f) {
      return kinds.indexOf(f.kind) >= 0 && !superseded(p, s, f) &&
        ((f.meta || {}).dan_take || "");
    });
  }

  function takeSettled(p, s) {
    if (unseenTake(p, s)) return false;
    var live = openTakes(p, s);
    if (!live.length) return true;         // 적으신 것이 없으면 해당 없음
    return live.every(function (f) {
      var at = (f.meta || {}).settled_at;
      if (!at) return false;               // 아직 안 정하셨다
      // ★ **정했다고 곧바로 열리지 않는다.**
      //   「이 답변대로 갑니다」는 합의일 뿐이고, 그 합의를 프롬프트 문장으로
      //   옮기는 일이 남는다. 그 사이에 누르면 **합의 이전 문장으로** 값이
      //   나간다 — 실제로 그럴 뻔했다 (작업기가 죽어 있어 안 나갔을 뿐이다).
      //   Dan 2026-09-22: 「이 답변대로합니다 하면 프롬프트 변경되는거잖아.
      //   그렇게 설계해야지. 그다음에 다시 뽑기 누르기가 활성화되야지」
      return !!(p.render_mode_at &&
        new Date(p.render_mode_at) > new Date(at));
    });
  }

  /** 잠긴 이유를 한 줄로. 버튼과 **같은 판단**을 쓴다. */
  function takeWaiting(p, s) {
    if (takeSettled(p, s)) return "";
    var u = unseenTake(p, s);
    if (u) {
      var um = u.meta || {};
      return (!um.review || um.review === "pending")
        ? '<div class="plan-same"><b>새 판이 ' + esc(hhmm(u.created_at)) +
          "에 나왔습니다 — " + esc(hhmm(u.created_at, 20)) +
          // 지난 시각을 「쯤 올라옵니다」라고 계속 말하면 거짓말이 된다
          (Date.now() > new Date(u.created_at).getTime() + 20 * 60000
            ? " 예정이었는데 늦어지고 있습니다. 검수가 끝나는 대로 올라옵니다</b><span>"
            : "쯤 검수와 함께 올라옵니다</b><span>") +
          "잘게 끊어 보고 소리를 확인한 뒤 페이블이 판정합니다. <b>검수가 붙은 뒤에 " +
          "영상·의견·적으실 칸이 한꺼번에</b> 여기에 올라옵니다. 그때까지 다시 " +
          "뽑기는 잠겨 있습니다.</span></div>"
        : '<div class="plan-same"><b>보시고 정하실 차례입니다</b><span>' +
          "결과물 아래 칸에 <b>다음 판에서 고칠 것</b>을 적어 주시면 답을 달고, " +
          "정하시면 프롬프트에 옮긴 뒤 다시 뽑기가 열립니다. 이대로 좋으시면 " +
          "승인하시면 됩니다.</span></div>";
    }
    var f = openTakes(p, s).filter(function (x) {
      return !(x.meta || {}).settled_at;
    })[0];
    var m = (f && f.meta) || {};
    // ★ 정하신 뒤 — 합의를 프롬프트로 옮기는 중이다
    if (m.settled_at) {
      return '<div class="plan-same"><b>프롬프트에 반영하는 중입니다</b><span>' +
        "정해 주신 대로 제작 문장을 고치고 있습니다. 끝나면 <b>무엇이 어떻게 " +
        "바뀌었는지</b> 보여 드리고 그때 다시 뽑기가 열립니다. " +
        "지금 누르면 <b>정하기 전 문장</b>으로 값이 나갑니다.</span></div>";
    }
    return m.our_reply
      ? '<div class="plan-same"><b>답변을 보시고 정하실 차례입니다</b><span>' +
        "적어 주신 것에 답을 달아 두었습니다. 결과물 아래에서 " +
        "<b>「이 답변대로 갑니다」</b>를 누르시면 제작 문장을 고치기 시작합니다." +
        "</span></div>"
      : '<div class="plan-same"><b>답변을 준비하고 있습니다</b><span>' +
        "적어 주신 것을 보고, 무엇에 동의하고 무엇을 어떻게 고칠지 " +
        "결과물 아래에 답을 답니다. <b>그때까지 다시 뽑기는 잠겨 있습니다</b> — " +
        "답 없이 뽑으면 적어 주신 말이 반영될 자리가 없습니다.</span></div>";
  }

  /** 그 사실을 한 줄로. 다시 뽑기 버튼이 눌리는지와 같은 판단을 쓴다 —
   *  두 곳이 따로 판단하면 버튼은 눌리는데 글은 「아직」이라고 말한다. */
  /** 요청사항(060)이 들어왔는데 아직 계획에 반영되지 않았는가 — 그동안 「시작」을 잠근다.
   *  반영 전에 누르면 요청사항 없는 문장으로 값이 나간다. 영상·제작 자료·후반만 해당. */
  function directionsPending(p, s) {
    var pick = SE().of(p, s) || {};
    if (!pick.directions_at || ["anchors", "video", "post"].indexOf(s) < 0) return false;
    return !p.render_mode_at || new Date(p.render_mode_at) < new Date(pick.directions_at);
  }
  var DIR_WAIT = '<span class="lc-msg">적어 주신 요청사항을 계획에 반영하는 중입니다 — ' +
    "끝나면 이 버튼이 열립니다.</span>";

  /** 그 시각 **뒤에** 만든 판이 있는가 — 있으면 그 시각의 소식은 이미 쓰였다. */
  function usedAfter(p, s, at) {
    if (!at) return false;
    return newestTakes(p, s).some(function (f) {
      return new Date(f.created_at) > new Date(at);
    });
  }

  function planChanged(p, s) {
    var pick = SE().of(p, s) || {};
    if (!pick.revision_at) return "";
    // ★ 이미 **그 바뀐 문장으로 뽑은 판이 있으면** 지난 소식이다. v5 가 나온
    //   뒤에도 「수정사항 적용 완료 — 이제 바뀐 문장으로 뽑습니다」가 남아
    //   지금 상황처럼 읽혔다 (Dan 2026-09-23: 「현재 상황이면 실시간에 따라
    //   바뀌어야지 … 쓸대없는건 빼던가」).
    if (usedAfter(p, s, p.render_mode_at)) return "";
    if (planReady(p, s)) {
      var at = p.render_mode_at;
      return '<div class="plan-new"><b>수정사항 적용 완료</b>' +
        "<span>" + esc(when(at)) + " · " + esc(ago(at)) +
        " — 고쳐 달라고 하신 것을 제작 계획에 넣었습니다. " +
        "이제 <b>바뀐 문장으로</b> 뽑습니다. 누르시면 값이 나갑니다.</span></div>";
    }
    return '<div class="plan-same"><b>수정사항 반영 중입니다</b>' +
      "<span>적으신 글은 기록에 남았습니다. 아직 <b>제작 계획에는 안 들어갔습니다</b> — " +
      "지금 뽑으면 같은 문장으로 같은 값이 또 나갑니다. " +
      "그래서 <b>다시 뽑기를 잠가 두었습니다.</b> 계획에 들어가면 " +
      "「수정사항 적용 완료」가 뜨고 그때 눌리십니다.</span></div>";
  }

  function paidBody(p, s, act) {
    if (!canWrite) {
      var pl = act && act.plan;
      return readOnlyRow("돈이 나가는 생성은 관리자 계정에서만 누릅니다" +
        (pl && pl.credits ? " (이 단계 " + pl.credits + " 크레딧)" : "") + ".");
    }
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(s) + '"';
    var plan = act.plan;
    var money = function (n) {
      return n ? '<b class="cost">' + n + ' 크레딧</b>' : '<b class="cost free">비용 없음</b>';
    };
    var head = function (what, why) {
      return '<div class="lc-head"><b>' + esc(what) + "</b>" +
        (why ? "<span>" + why + "</span>" : "") + "</div>";
    };
    // ★ act.phase 를 직접 본다. 예전에는 act.review / act.choose 같은 이름을
    //   보았는데 그 필드가 없어서(실제 이름은 approve) 모든 분기가 빗나갔다.
    //   앵커가 올라왔는데 버튼이 하나도 없던 이유가 이것이다.
    var at = act.phase;

    // 계획이 없으면 무엇을 몇 장 만들지 알 수 없다. 그때 뽑으면 그때그때
    // 달라지고, 달라진 것을 아무도 기록하지 않는다.
    if (!plan || !plan.calls.length) {
      return '<div class="lc lc-start"' + tag + ">" +
        head("제작 계획이 먼저 필요합니다",
             "한 판으로 뽑을지 컷별로 뽑을지에 따라 만들 것이 달라집니다") +
        '<span class="lc-msg err">구성·각본 단계에서 제작 방식을 정해야 합니다.</span></div>';
    }

    // 무엇을 왜 만드는지 — 만들기 전에는 계획이, 만든 뒤에는 자산의 설명이 말한다.
    var needs = plan.needs.length
      ? '<ul class="need-list">' + plan.needs.map(function (n) {
        return "<li><b>" + esc(n.what || n.kind) + "</b>" +
          (n.credits_estimate ? '<em class="c">' + n.credits_estimate + " 크레딧</em>" : "") +
          (n.why ? '<span class="why">' + esc(n.why) + "</span>" : "") + "</li>";
      }).join("") + "</ul>"
      : "";

    // 누가 맡는지부터 — 고르는 칸은 다른 단계와 같은 것을 쓴다
    if (at === "choose") return lifecycleBar(p, s, act);
    if (at === "start") {
      // 수정 요청을 받고 아직 다시 안 누른 자리인가. 그렇다면 이 버튼은
      // **처음 뽑기가 아니라 다시 뽑기**이고, 값이 또 나갑니다. 같은 문구를
      // 쓰면 이미 나간 돈을 잊게 됩니다.
      var again = !!(SE().of(p, s) || {}).revision_at;
      var note = (SE().of(p, s) || {}).revision_note || "";
      // ★ 제목은 **지금 상태**를 말한다 — 「영상을 다시 뽑습니다」는 버튼 칸의
      //   고정 제목이었는데 지금 일어나는 일처럼 읽혔다 (Dan 2026-09-23).
      var locked = again && (!planReady(p, s) || !takeSettled(p, s));
      // 고쳐 달라고 적으신 글도 **그 뒤에 이미 뽑았으면** 지난 이야기다
      if (usedAfter(p, s, (SE().of(p, s) || {}).revision_at)) note = "";
      return '<div class="lc lc-start"' + tag + ">" +
        head(again
              ? (s === "anchors" ? "다시 만들기" : "다시 뽑기") +
                (locked ? " · 잠겨 있습니다" : " · 누르실 수 있습니다")
              : (s === "anchors" ? "제작 자료를 만듭니다" : "영상을 뽑습니다"),
             (again ? "누르면 <b>또</b> " : "예상 ") + money(plan.credits) +
             (plan.mode ? " · 방식 " + esc(plan.mode) : "")) +
        ((SE().of(p, s) || {}).directions
          ? '<div class="redo-note"><b>사장님 요청사항 — 이대로 만듭니다</b><span>' +
            esc((SE().of(p, s) || {}).directions) + "</span></div>" : "") +
        (again && note
          ? '<div class="redo-note"><b>고쳐 달라고 적으신 것</b>' +
            "<span>" + esc(note) + "</span></div>" : "") +
        // ★ 수정 요청 글은 **프롬프트를 바꾸지 않는다.** 생성은 계획에 적힌
        //   문장을 그대로 돌린다(035). 계획을 안 고치고 다시 누르면 **같은
        //   문장으로 같은 값이 또 나간다.**
        //
        //   그렇다고 막지는 않는다 — 굴림이 나빠서 한 번 더 던지는 것은
        //   정당하다. 대신 **어느 쪽인지 말한다.** 말해 주지 않으면 사장님은
        //   적은 대로 바뀐 줄 아시고 누르게 된다.
        (again ? planChanged(p, s) + takeWaiting(p, s) : "") +
        (again && !locked
          ? '<span class="lc-msg">아래 만든 것은 <b>그대로 남아 있습니다.</b> ' +
            '누르시면 그 위에 새로 뽑습니다 — 누르지 않으면 돈이 나가지 않습니다.</span>'
          : "") +
        // 준비물 설명은 **처음 뽑을 때만.** 다시 뽑을 때는 이미 만들어져 있다
        (again ? "" : needs) +
        '<div class="lc-row">' +
        // ★ 고쳐 달라고 하신 것이 계획에 반영되기 전에는 **못 누르게** 한다.
        //   누르면 같은 문장으로 같은 값이 또 나간다. 버튼을 없애지는 않는다 —
        //   없으면 「어디 갔지」가 되고, 회색으로 있으면 「아직」이 보인다.
        // ★ 052 — 적어 주신 의견이 답을 받고 정해지기 전에도 못 누르게 한다.
        //   계획이 바뀌었는지(planReady)와 **따로** 본다 — 계획은 내가 고칠 수
        //   있지만 정하는 것은 사장님 몫이라, 둘은 다른 물음이다.
        '<button class="btn" type="button" data-lc="start"' + tag +
        ((again && (!planReady(p, s) || !takeSettled(p, s))) || directionsPending(p, s)
          ? " disabled" : "") + ">" +
        (again ? (s === "anchors" ? "다시 만들기" : "다시 뽑기")
               : (s === "anchors" ? "제작 자료 만들기" : "영상 뽑기")) + "</button>" +
        // ★ 검수가 붙은 새 판이 있으면 **이대로 승인**도 여기서 누른다.
        //   한 번 뽑고 멈추면 화면이 「다시 뽑기」 자리로만 돌아와서 승인 버튼이
        //   없었다 — 의견 저장 말고는 누를 것이 없었다 (Dan 2026-09-23:
        //   「의견 저장 말고는 버튼이없다 승인버튼이」). 승인은 돈을 쓰지 않으므로
        //   의견 절차 잠금과 무관하게 연다.
        (again && !takeOpen(p, s) && newestTakes(p, s).some(function (f) {
          var rv = (f.meta || {}).review;
          return rv && rv !== "pending";
        })
          ? '<button class="btn ghost" type="button" data-lc="approve"' + tag +
            ">이대로 승인</button>"
          : "") +
        // 시작 전이면 AI ↔ 사람(요청사항)을 서로 바꿀 수 있다
        switchChoice(p, s) +
        "</div>" +
        (locked ? "" : '<span class="lc-msg">누르면 크레딧이 나갑니다. 만들어지면 여기에 올라오고, ' +
        '보신 뒤 승인하거나 고칠 곳을 적으실 수 있습니다.</span>') +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (at === "working") {
      var began = (SE().of(p, s) || {}).started_at;
      return '<div class="lc lc-working"' + tag + ">" +
        head(s === "anchors" ? "제작 자료를 만드는 중" : "영상을 뽑는 중",
             (began ? esc(when(began)) + " 에 시작 · " : "") +
             "끝나면 이 자리에 올라옵니다") +
        // ★ 돌고 있는 동안에는 **누를 것을 두지 않는다.** 버튼이 남아 있으면
        //   또 눌리고, 그때마다 크레딧이 나간다. 잠긴 버튼조차 두지 않는다 —
        //   여기서는 기다리는 것 말고 할 일이 없다.
        '<span class="lc-msg">지금 돌고 있습니다. <b>여기서 하실 일은 없습니다</b> — ' +
        '끝나면 이 자리에 결과와 함께 승인·수정 요청이 뜹니다. ' +
        '이 단계에서는 다시 뽑기 버튼을 두지 않습니다 (두 번 나가는 것을 막습니다).</span>' +
        "</div>";
    }
    if (at === "review") {
      return '<div class="lc lc-review"' + tag + ">" +
        head(s === "anchors" ? "제작 자료를 검수해 주세요" : "영상을 검수해 주세요",
             s === "video"
               ? "수정 요청은 <b>다시 뽑기</b>입니다 — " + money(plan.credits) + "이 또 나갑니다"
               : "고칠 곳을 적으시면 그것만 다시 만듭니다. 승인하면 다음 단계로 갑니다") +
        '<textarea class="lc-note" data-lc-note placeholder="' +
        esc("수정 요청은 무엇을 고칠지 적어야 보냅니다") + '"></textarea>' +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="approve"' + tag + ">승인</button>" +
        '<button class="btn ghost" type="button" data-lc="revise"' + tag + ">수정 요청</button>" +
        "</div>" +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (at === "approved") {
      return '<div class="lc lc-approved"' + tag + ">" +
        head("승인 완료", "다음 단계로 넘길 수 있습니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="next"' + tag + ">다음 단계로</button>" +
        "</div>" +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    return "";
  }

  // 제품 사실의 내부 상태 코드 → 우리말 (09-24 검수: client_stated_not_verified 가 그대로 보였다)
  var CLAIM_STATUS = {
    client_stated_not_verified: "광고주 말 · 확인 전", label_read_low_confidence_image: "라벨에서 읽음 · 흐림",
    creative_positioning_not_measured: "표현 · 측정 아님", undefined_do_not_assert: "근거 없음 · 말하지 않음",
    not_authorized_do_not_imply: "권한 없음 · 암시하지 않음", verified: "확인됨",
  };
  function readable(value) {
    if (value == null || value === "") return "입력 없음";
    if (Array.isArray(value)) return value.map(readable).join(" · ");
    if (typeof value === "object") {
      if (value.claim) return value.claim + (value.status ? " (" + (CLAIM_STATUS[value.status] || value.status) + ")" : "");
      return Object.keys(value).map(function (key) {
        return key + " · " + readable(value[key]);
      }).join(" / ");
    }
    return String(value).replace(/\*\*/g, "");
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

  // 이번 판에서 새 흐름을 타는 단계. 하나씩 옮긴다 (Codex seq227).
  var LIFECYCLE_STEP = "develop";

  // 누르는 동안 잠근다. 잠그지 않으면 같은 버튼이 두 번 눌려 작업이 둘 생긴다.
  function lock(b) {
    b.disabled = true;
    b.dataset.label = b.textContent;
    b.textContent = "처리 중…";
  }
  function fail(b, msg) {
    return function (e) {
      b.disabled = false;
      if (b.dataset.label) b.textContent = b.dataset.label;
      var why = (e && (e.message || e.error_description)) || String(e);
      if (msg) { msg.className = "lc-msg err"; msg.textContent = why; }
      else window.alert(why);
    };
  }

  function bySlug(slug) {
    return ROWS.filter(function (x) { return x.slug === slug; })[0] || null;
  }
  function rpcOk(r) {
    if (r.error) throw r.error;
    return r.data;
  }
  function rpc(slug, name, args) {
    var p = bySlug(slug);
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    var body = { p_project_id: p.id };
    Object.keys(args || {}).forEach(function (k) { body[k] = args[k]; });
    return db.rpc(name, body).then(rpcOk);
  }

  // 사장님이 결과물에 적어 주신 말. **건 단위가 아니라 자산 단위**라서
  // rpc() 를 못 쓴다 — rpc() 는 p_project_id 를 끼워 넣는데 이 함수는 그 인자를
  // 받지 않아 PostgREST 가 못 찾는다고 한다. 그래서 직접 부른다.
  function assetDanTake(assetId, take) {
    return db.rpc("onecue_asset_dan_take", { p_asset_id: assetId, p_take: take })
      .then(rpcOk);
  }
  // 「이 답변대로 갑니다」 — 이때부터 다시 뽑기가 열린다 (052)
  function assetSettle(assetId) {
    return db.rpc("onecue_asset_settle",
      { p_asset_id: assetId, p_by: "dan" }).then(rpcOk);
  }

  function stageStart(slug, step) { return rpc(slug, "onecue_stage_start", { p_step: step }); }
  function stageApprove(slug, step) { return rpc(slug, "onecue_stage_approve", { p_step: step }); }
  function stageRevise(slug, step, note) {
    return rpc(slug, "onecue_stage_revise", { p_step: step, p_note: note });
  }
  // 016 은 「결과 등록이 단계를 옮기지 않는다」를 일부러 막아 두었다. 그래서
  // 앞으로 가는 일은 **사람이 누르는 한 동작**이다. 승인 뒤에만 눌린다.
  function stageNext(slug, step) { return rpc(slug, "onecue_stage_next", { p_step: step }); }
  // 컷마다·겹마다 낸 판단. 덮어쓰지 않고 쌓는다 — 왜 고쳤는지가 남아야 한다.
  function stageReview(slug, step, layer, cut, decision, note) {
    return rpc(slug, "onecue_stage_review", {
      p_step: step, p_layer: layer, p_cut_n: cut,
      p_decision: decision, p_note: note || "",
    });
  }
  // 담당을 다시 고르는 것은 「아직 시작 전」일 때만 뜻이 있다. 시작한 뒤에는
  // 버튼 자체가 없다(상태표가 그렇게 정한다). 서버도 같은 이유로 거절한다.
  function clearStageChoice(slug, step) {
    return chooseStageExecutor(slug, step, "ai", "", "").then(function () {
      return db.from("stage_executors").update({ chosen_at: null })
        .eq("project_id", bySlug(slug).id).eq("step", step).then(rpcOk);
    });
  }

  // 자리마다 **할 일 하나**를 띄운다. 여러 개를 동시에 펼치지 않는다 —
  // 선택·실행·결과·검수·이동이 한꺼번에 서 있으면 무엇부터인지 알 수 없다.
  /** 보기 전용이면 누를 것 대신 한 줄. 왜 없는지 말해 준다 —
   *  버튼이 그냥 사라지면 「고장났나」가 된다. */
  function readOnlyRow(what) {
    return '<div class="ro-row"><b>보기 전용 계정입니다</b>' +
      "<span>" + esc(what || "여기서 누르는 것은 바꿀 수 있는 계정에서만 됩니다.") +
      "</span></div>";
  }

  /** 「누가 맡습니까」 — 모든 단계가 이 하나를 쓴다.
   *  Dan 2026-09-23: 「모든 작업은 ai or 사람 둘중 선택하는 창부터」 「아래쪽이 더맘에드는데
   *  심플하게 나오니깐 … 기능은 거기에 맞게구현하고」. 사람을 못 고르는 단계는 버튼 대신
   *  이유 한 줄을 둔다(버튼이 그냥 없으면 「고장났나」가 된다). */
  /** 고른 뒤, 시작 전까지 **서로 바꾸는** 칸 (Dan 09-23: 「둘다 서로 선택햇다가 되돌아갈수잇게」) */
  /** ②·③ 에서 ① 로 — 고른 것과 요청사항을 풀고 처음 고르는 화면으로 (062).
   *  단계: ①고르기 전 → ②AI / ③사람(요청) → ④시작 후(바꾸기 없음) → ⑤결과.
   *  Dan 09-23: 「취소하면 ai가 맡습니다가아니라 ai에게 맡기기가 떠야」 「단계를 정확히」 */
  function switchChoice(p, key) {
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    return '<button class="btn ghost" type="button" data-lc="unchoose"' + tag + ">다시 고르기</button>";
  }
  function directForm(tag, label) {
    return '<details class="lc-direct"><summary class="btn ghost">' + esc(label) + "</summary>" +
      '<textarea class="lc-note" data-lc-note rows="3" placeholder="' +
      esc("요청사항을 적어 주십시오 — 적으신 대로 반영해서 만듭니다") + '"></textarea>' +
      '<button class="btn" type="button" data-lc="direct"' + tag + ">이 요청대로 진행</button> " +
      '<button class="btn ghost" type="button" data-lc="direct-cancel">취소</button>' +
      "</details>";
  }

  function simpleChoose(p, key) {
    // Dan 2026-09-23: 「ai한테 맡기기랑 사람이 하는거 2개로 나뉘라고햇는데 … 과정은 동일하되
    //   사람이 하는것도 같은 폼으로 … 사람이 요청사항을 넣거나 하면 니가 그걸로 작업하는거고」
    //   → 두 버튼은 **항상** 있다. 사람 쪽은 요청사항 칸이 열리고, 그 뒤 절차는 AI 와 같다.
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    return '<div class="lc lc-choose"' + tag + ">" +
      '<div class="lc-head"><b>누가 맡습니까</b><span>고르기만 해서는 작업이 시작되지 않습니다</span></div>' +
      '<div class="lc-row">' +
      '<button class="btn" type="button" data-lc="choose-ai"' + tag + ">AI에게 맡기기</button>" +
      directForm(tag, "사람이 직접 진행") + "</div>" +
      '<span class="lc-msg" data-lc-msg></span></div>';
  }

  function lifecycleBar(p, key, act) {
    if (!canWrite) return readOnlyRow("승인·수정 요청은 관리자 계정에서 합니다.");
    // 부르는 쪽이 상태를 빠뜨려도 화면 전체가 죽지 않게 여기서 채운다
    act = act || SE().actions(p, key, !!(p.stageResults && p.stageResults[key]));
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="' + esc(key) + '"';
    var pick = SE().of(p, key);
    var head = function (what, why) {
      return '<div class="lc-head"><b>' + esc(what) + "</b>" +
        (why ? "<span>" + esc(why) + "</span>" : "") + "</div>";
    };
    if (act.phase === "choose") return simpleChoose(p, key);
    if (act.phase === "start") {
      return '<div class="lc lc-start"' + tag + ">" +
        head(pick.directions ? "사장님 요청대로 진행합니다"
               : pick.mode === "human" ? "담당자 · " + (pick.assignee || "미지정") : "AI가 맡습니다",
             "시작을 눌러야 실제로 진행됩니다") +
        (pick.directions ? '<div class="redo-note"><b>요청사항</b><span>' +
          esc(pick.directions) + "</span></div>" : "") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="start"' + tag +
        (directionsPending(p, key) ? " disabled" : "") + ">" +
        (pick.directions ? "요청대로 시작" : pick.mode === "human" ? "작성 시작" : "AI 작업 시작") + "</button>" +
        switchChoice(p, key) + "</div>" +
        (directionsPending(p, key) ? DIR_WAIT : "") + "</div>";
    }
    if (act.phase === "working") {
      return '<div class="lc lc-working"' + tag + ">" +
        head(pick.mode === "human"
          ? "담당자가 작성 중 · " + (pick.assignee || "미지정")
          : "AI가 작업 중",
          pick.started_at ? "시작 " + ago(pick.started_at) : "") + "</div>";
    }
    // ★ 결과물 카드에 「의견 → 답변 → 정하기」 칸이 있는 단계(후반)는 **고칠 점을 거기에만** 적는다.
    //   위에 「수정 요청」, 아래에 「의견 적기」가 같이 있어 어디에 쓰라는 건지 몰랐다
    //   (Dan 09-23: 「위에 수정요청있고 아래는 의견넣는거잇고 … 하나만하는게맞지않냐?」)
    if (act.phase === "review" && key === "post") {
      if (takeOpen(p, key)) {
        return '<div class="lc lc-review"' + tag + ">" +
          head("고칠 점을 처리하는 중입니다", "승인은 새 판이 나온 뒤에") + TAKE_OPEN_NOTE +
          '<span class="lc-msg" data-lc-msg></span></div>';
      }
      return '<div class="lc lc-review"' + tag + ">" +
        head("결과를 검토해 주세요", "괜찮으면 승인 · 고칠 점은 아래 완성본의 의견 칸에") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="approve"' + tag + ">승인</button>" +
        "</div>" + '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (act.phase === "review") {
      return '<div class="lc lc-review"' + tag + ">" +
        head("결과를 검토해 주세요", "승인해야 다음 단계로 넘어갑니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="approve"' + tag + ">승인</button>" +
        '<button class="btn ghost" type="button" data-lc="revise"' + tag + ">수정 요청</button>" +
        "</div>" +
        '<textarea class="lc-note" data-lc-note placeholder="' +
        esc("수정 요청은 무엇을 고칠지 적어야 보냅니다") + '"></textarea>' +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (act.phase === "approved") {
      return '<div class="lc lc-approved"' + tag + ">" +
        head("승인 완료", pick.approved_at ? esc(ago(pick.approved_at)) : "") +
        (act.next
          ? '<div class="lc-row"><button class="btn" type="button" data-lc="next"' + tag +
            ">다음 단계로 이동</button></div>"
          : "") + "</div>";
    }
    return "";
  }

  // 컷 하나에 대한 의견. 그 컷 옆에 붙는다 — 전체 의견 칸과 섞지 않는다.
  // 이미 낸 판단이 있으면 그것부터 보여 준다. 무엇을 요청했는지 모른 채로
  // 다시 판단하게 하면 같은 말을 반복하거나 앞말을 잊는다.
  function cutReviewBox(p, layer, n) {
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="storyboard"' +
      ' data-layer="' + esc(layer) + '" data-cut="' + esc(String(n)) + '"';
    var last = SE().lastReview(p, layer, n);
    var said = last
      ? '<span class="cut-said ' + (last.decision === "ok" ? "ok" : "revise") + '">' +
        esc(last.decision === "ok" ? "승인함" : "수정 요청함") +
        (last.note ? " · " + esc(last.note) : "") + "</span>"
      : "";
    return '<div class="cut-review"' + tag + ">" + said +
      '<textarea class="lc-note" data-lc-note rows="2" placeholder="' +
      esc(n + "번 컷만 고칠 점") + '"></textarea>' +
      '<div class="lc-row">' +
      '<button class="btn ghost" type="button" data-lc="review-ok"' + tag + ">이 컷 승인</button>" +
      '<button class="btn ghost" type="button" data-lc="review-revise"' + tag +
      ">이 컷 수정</button></div>" +
      '<span class="lc-msg" data-lc-msg></span></div>';
  }

  // ── 콘티 단계 — 한 자리에 할 일 하나 ──────────────────────────────────────
  //
  // 절차 정본: agency_site/db/stage_storyboard_flow.md (Dan 지시 2026-09-21)
  // Dan 이 옛 화면을 보고 한 말: "저렇게 한방에 다나오는게 아니라",
  // "지금은 뒤죽박죽으로 나열해놧는데 뭐 어쩌란거야?"
  // 자리(boardPhase)가 무엇을 띄울지 혼자 정한다. 여기서 조건을 다시 판단하지 않는다.
  function boardBar(p, act) {
    var tag = ' data-slug="' + esc(p.slug) + '" data-step="storyboard"';
    var pick = SE().of(p, "storyboard");
    var n = p.boardCounts || {};
    var head = function (what, why) {
      return '<div class="lc-head"><b>' + esc(what) + "</b>" +
        (why ? "<span>" + esc(why) + "</span>" : "") + "</div>";
    };
    // 검수 칸 — 겹 전체에 대한 의견과 승인·수정. 컷마다는 컷 옆에 따로 붙는다.
    var reviewBox = function (layer, what, why, extra) {
      return '<div class="lc lc-review"' + tag + ' data-layer="' + esc(layer) + '">' +
        head(what, why) +
        '<textarea class="lc-note" data-lc-note placeholder="' +
        esc("수정 요청은 무엇을 고칠지 적어야 보냅니다") + '"></textarea>' +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="review-ok" data-layer="' + esc(layer) +
        '"' + tag + ">승인</button>" +
        '<button class="btn ghost" type="button" data-lc="review-revise" data-layer="' +
        esc(layer) + '"' + tag + ">수정 요청</button>" +
        (extra || "") + "</div>" +
        '<span class="lc-msg" data-lc-msg></span></div>';
    };

    if (act.phase === "design.choose") {
      return '<div class="lc lc-choose"' + tag + ">" +
        head("컷 설계를 누가 씁니까", "고르기만 해서는 시작되지 않습니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="choose-ai"' + tag + ">AI에게 맡기기</button>" +
        (act.chooseHuman
          ? '<button class="btn ghost" type="button" data-lc="choose-human"' + tag +
            ">작업자가 직접 쓰기</button>" : "") +
        "</div></div>";
    }
    if (act.phase === "design.start") {
      return '<div class="lc lc-start"' + tag + ">" +
        head(pick.mode === "human" ? "작업자 · " + (pick.assignee || "미지정") : "AI가 씁니다",
             "시작을 눌러야 실제로 진행됩니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="start"' + tag + ">" +
        (pick.mode === "human" ? "작성 시작" : "AI 작업 시작") + "</button>" +
        '<button class="btn ghost" type="button" data-lc="rechoose"' + tag +
        ">담당 다시 고르기</button></div></div>";
    }
    if (act.phase === "design.working") {
      return '<div class="lc lc-working"' + tag + ">" +
        head(pick.mode === "human"
          ? "작업자가 컷 설계를 쓰는 중 · " + (pick.assignee || "미지정")
          : "AI가 컷 설계를 쓰는 중",
          pick.started_at ? "시작 " + ago(pick.started_at) : "") + "</div>";
    }
    if (act.phase === "design.review") {
      return reviewBox("design", "컷 설계를 검수해 주세요",
        "컷 " + (n.cuts || 0) + "개 · 승인해야 그림을 뽑습니다. 컷마다 따로 요청하려면 아래 컷에서 적으세요");
    }
    if (act.phase === "board.make") {
      // ★ 승인된 제품 기준 이미지가 없으면 뽑지 않는다. 기준 없이 여섯 컷을 뽑으면
      //   컷마다 캔 모양·색·사선 위치가 달라지고, 그건 고쳐 쓸 수 있는 문제가 아니라
      //   전부 다시 뽑아야 하는 문제다. 그래서 할 일을 「승인」으로 바꿔 보여 준다 —
      //   못 누르는 버튼을 띄워 놓고 이유를 옆에 적는 것보다, 할 수 있는 일을 준다.
      var ref = (p.files || []).filter(function (f) {
        return f.kind === "product_ref" || f.kind === "anchor";
      });
      var okRef = ref.filter(function (f) { return f.approved; });
      if (!okRef.length) {
        return '<div class="lc lc-start"' + tag + ">" +
          head("제품 기준 이미지를 먼저 승인해 주세요",
               "기준 없이 뽑으면 컷마다 제품 모양이 달라집니다") +
          (ref.length
            ? '<div class="lc-row">' +
              '<a class="btn ghost" href="' + esc(ref[0].url) +
              '" target="_blank" rel="noopener">이미지 보기</a>' +
              '<button class="btn" type="button" data-lc="approve-anchor" data-asset="' +
              esc(ref[0].id || "") + '"' + tag + ">이 이미지를 기준으로 승인</button></div>"
            : '<span class="lc-msg err">등록된 제품 이미지가 없습니다 — 광고주 자료를 먼저 받아야 합니다</span>') +
          '<span class="lc-msg" data-lc-msg></span></div>';
      }
      return '<div class="lc lc-start"' + tag + ">" +
        head("콘티 그림을 뽑습니다", "승인된 컷 설계 " + (n.cuts || 0) + "개를 기준으로 한 판 뽑아 컷마다 잘라 넣습니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="make-board"' + tag + ">콘티 뽑기</button>" +
        "</div>" +
        '<span class="lc-msg">유료 생성(약 2cr) — 누르면 바로 한 판 그리고 컷마다 잘라 붙인 뒤 멈춥니다</span>' +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (act.phase === "board.working") {
      return '<div class="lc lc-working"' + tag + ">" +
        head("콘티 그림을 뽑는 중", "끝나면 컷마다 붙습니다") + "</div>";
    }
    // 콘티 시트(한 판) — 검수 칸 맨 위에 크게. 컷별 그림이 없을 때 보이는 자리가 없었다 (09-24 환타)
    var sheets = (p.files || []).filter(function (f) { return f.cut_n == null && f.url && boardCurrent(p, f); })
      .sort(function (x, y) { return String(y.created_at).localeCompare(String(x.created_at)); });
    var sheetHtml = sheets.length
      ? '<div class="board-sheet"><img src="' + esc(sheets[0].url) + '" data-big="' + esc(sheets[0].url) +
        '" data-kind="img" alt="콘티 시트"><span>' + esc(sheets[0].role || "콘티 시트") + " · " + esc(when(sheets[0].created_at)) +
        (sheets.length > 1 ? " · 이전 판 " + (sheets.length - 1) + "장" : "") + "</span></div>"
      : "";
    if (act.phase === "board.review") {
      return sheetHtml + reviewBox("board", "콘티 그림을 검수해 주세요",
        "콘티 시트 " + (n.board || 0) + "장 · 수정 요청하면 시트 전체를 다시 그립니다(유료 · 다시 「콘티 뽑기」)");
    }
    if (act.phase === "final.review") {
      return sheetHtml + reviewBox("final", "완성 콘티를 확인해 주세요",
        "승인하면 광고주에게 보낼 수 있습니다",
        '<button class="btn ghost" type="button" data-lc="back"' + tag +
        ">취소 · 전 단계로</button>");
    }
    if (act.phase === "final.done") {
      return '<div class="lc lc-approved"' + tag + ">" +
        head("광고주에게 보냈습니다", "광고주 화면에 콘티가 떠 있습니다") +
        '<div class="lc-row">' +
        '<button class="btn ghost" type="button" data-lc="back"' + tag +
        ">내리고 다시 고치기</button></div>" +
        '<span class="lc-msg" data-lc-msg></span></div>';
    }
    if (act.phase === "final.sent") {
      return '<div class="lc lc-approved"' + tag + ">" +
        head("완성 콘티 승인됨", "이제 광고주에게 보낼 수 있습니다") +
        '<div class="lc-row">' +
        '<button class="btn" type="button" data-lc="send-client"' + tag + ">콘티 전송</button>" +
        '<button class="btn ghost" type="button" data-lc="back"' + tag +
        ">취소 · 전 단계로</button></div>" +
        '<span class="lc-msg">광고주 발송은 Dan 승인 사항입니다</span></div>';
    }
    return "";
  }

  // ── 목록 ──────────────────────────────────────────────────────────────────
  function card(p) {
    var isNew = p.isNew;
    var productionAction = "";
    if (p.step === "brief" && p.state === "pending" && p.job && p.job.step === "facts" && !(p.job.request && p.job.request.plan)) {
      if (p.productionEnrolled) {
        productionAction = '<span class="progress-state ok">AI 제작 등록 완료 · 제품·자료 확인 준비 중</span>';
      } else if (p.enrollRequested) {
        productionAction = '<span class="progress-state wait">등록 요청됨 · 로컬 처리 대기</span>';
      } else {
        productionAction = canWrite
          ? '<button class="btn production-start" type="button" data-enroll="' +
            esc(p.slug) + '">AI 제작 시작</button>'
          : '<span class="progress-state">제작 시작은 관리자 계정에서 누릅니다</span>';
      }
    } else if (SE().awaitingChoice(p, p.step) && ["facts", "strategy", "concepts", "develop"].indexOf(p.step) < 0) {   // 기획 단계는 아래 두 갈래 선택이 대신한다
      // 고르기 전에는 작업이 하나도 만들어지지 않았다. 카드 맨 위에서 바로 보이게 한다
      productionAction = '<span class="progress-state pick">실행 주체 선택 대기 — ' +
        '누가 진행할지 고르기 전까지 작업이 시작되지 않습니다</span>';
    } else if (SE().waiting(p, p.step) && ["facts", "strategy", "concepts", "develop"].indexOf(p.step) < 0) {
      productionAction = '<span class="progress-state wait">담당자 진행 — 결과 등록 대기</span>';
    } else if (p.job && p.job.request && p.job.request.plan) {
      // AI 가 기획을 쓰는 중 (074 · plan_writer.py) — 무엇을 쓰는지 갈래대로 말한다
      var rq = p.job.request;
      productionAction = '<span class="progress-state working st-run">' + (p.job.step === "develop"
        ? "AI가 구성·각본을 쓰는 중 — 고른 콘셉트 그대로 · 골·필수·비트 · 끝나면 콘티 확인 단계로 넘어갑니다"
        : rq.strategy_only
        ? "AI가 전략 설계를 쓰는 중 — 끝나면 콘셉트 5안을 누가 쓸지 고릅니다"
        : rq.keep_strategy
          ? "AI가 콘셉트 5안을 쓰는 중 — 정해진 전략 그대로 · 끝나면 콘셉트 검토로 넘어갑니다"
          : "AI가 전략 + 콘셉트 5안을 쓰는 중 — 끝나면 콘셉트 검토로 넘어갑니다") + "</span>";
    } else if ((p.step === "brief" || p.step === "facts") && p.productionEnrolled && p.n_facts) {
      // 의뢰 확정 → 전략 설계 (074). 전략·콘셉트 각각 AI / 사람을 고른다 (Dan 09-24 두 갈래)
      productionAction = canWrite
        ? '<div class="plan-start"><b>의뢰 확정</b>' +
          '<button class="btn" type="button" data-brief-confirm="' + esc(p.id) + '">의뢰 확정 → 전략 설계로</button>' +
          '<span>다음 칸에서 전략을 AI가 쓸지 사람이 쓸지 고릅니다</span></div>'
        : '<span class="progress-state wait">의뢰 확정 대기</span>';
    } else if (p.step === "strategy" && p.state !== "running") {
      productionAction = canWrite
        ? '<div class="plan-start"><b>전략 설계 — 누가 맡습니까</b>' +
          '<div class="lc-row"><button class="btn" type="button" data-plan-start="' + esc(p.id) + '" data-plan-what="strategy">AI에게 맡기기</button>' +
          '<button class="btn ghost" type="button" data-toggle-form="ms-' + esc(p.id) + '">사람이 직접 쓰기</button></div>' +
          '<span>AI: 광고주 답 조건을 반영해 전략만 씁니다 · 사람: 아래 양식 — 어느 쪽이든 다음 칸에서 콘셉트 5안을 누가 쓸지 다시 고릅니다</span></div>' +
          manualStrategyForm(p)
        : '<span class="progress-state wait">전략 설계 담당 선택 대기</span>';
    } else if (p.step === "concepts" && !(p.concepts && p.concepts.length)) {
      productionAction = canWrite
        ? strategySummary(p) +
          '<div class="plan-start"><b>콘셉트 5안 — 누가 맡습니까</b>' +
          '<div class="lc-row"><button class="btn" type="button" data-plan-start="' + esc(p.id) + '" data-plan-what="concepts">AI에게 맡기기</button>' +
          '<button class="btn ghost" type="button" data-toggle-form="mc-' + esc(p.id) + '">사람이 직접 쓰기</button>' +
          '<button class="btn ghost" type="button" data-back-strategy="' + esc(p.id) + '">전략부터 다시</button></div>' +
          '<span>AI: 위 전략을 그대로 받아 5안을 씁니다 · 사람: 아래 양식으로 씁니다</span></div>' +
          manualConceptForm(p)
        : '<span class="progress-state wait">콘셉트 담당 선택 대기</span>';
    } else if (p.step === "develop" && !(p.development && ((p.development.arc || []).length || (p.development.copies || []).length))) {
      var picked = (p.concepts || []).filter(function (c) { return c.is_chosen; })[0];
      productionAction = canWrite
        ? (picked ? '<div class="ms-summary"><div class="ms-by">광고주가 고른 콘셉트</div><span><b>' + esc(picked.key + "안 · " + picked.title) +
            "</b> " + esc(picked.client_one_line || "") + "</span></div>" : "") +
          '<div class="plan-start"><b>구성·각본 — 누가 맡습니까</b>' +
          '<div class="lc-row"><button class="btn" type="button" data-plan-start="' + esc(p.id) + '" data-plan-what="develop">AI에게 맡기기</button>' +
          '<button class="btn ghost" type="button" data-toggle-form="dv-' + esc(p.id) + '">사람이 직접 쓰기</button></div>' +
          '<span>AI: 고른 콘셉트·전략 그대로 골·필수·비트 4~6개를 씁니다 · 사람: 아래 양식 — 어느 쪽이든 콘티 확인 단계로 넘어갑니다</span></div>' +
          manualDevelopForm(p)
        : '<span class="progress-state wait">구성·각본 담당 선택 대기</span>';
    } else {
      productionAction = '<span class="progress-state">' + esc((STEP_NAME[p.step] || p.step)) + ' 진행 중</span>';
    }

    // ★ 광고주가 정한 것 — 우리에게 보낸 유일한 말이다. 조용히 단계만 넘어가면
    //   무슨 일이 있었는지 알려면 DB 를 봐야 한다.
    var GATE_NAME = { concepts: "콘셉트", storyboard: "콘티", video: "영상", strategy: "방향" };
    var decided = (p.approvals || []).slice().sort(function (a, b) {
      return String(b.decided_at).localeCompare(String(a.decided_at));
    })[0];
    var clientSaid = decided
      ? '<div class="client-said ' + (decided.decision === "ok" ? "ok" : "revise") + '">' +
        '<b>광고주가 ' + esc(GATE_NAME[decided.gate] || decided.gate) +
        (decided.decision === "ok" ? "를 승인했습니다" : " 수정을 요청했습니다") + "</b>" +
        '<span class="at">' + esc(when(decided.decided_at)) +
        " · " + esc(ago(decided.decided_at)) + "</span>" +
        (decided.note ? '<span class="said">“' + esc(decided.note) + '”</span>' : "") +
        "</div>"
      : "";

    // 이제 p.files 에 우리가 만든 것(콘티·앵커·영상)도 들어 있다. 카드의 이 줄은
    // **광고주가 보낸 것**만 세는 자리라, 여기서 골라야 한다. 안 그러면
    // 콘티를 뽑을 때마다 「광고주가 올린 것」 숫자가 같이 늘어난다.
    var sent = (p.files || []).filter(function (f) {
      var spec = window.ONECUE_AD_TYPE_MATERIALS;
      var k = spec && spec.kinds && spec.kinds[f.kind];
      return k ? (k.by === "client" || k.by === "both") : f.kind === "product_ref";
    });
    var files = sent.length
      ? '<div class="files"><span class="lbl">광고주가 올린 것 ' + sent.length + "</span>" +
        sent.map(function (f) {
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
      // ★ 홈페이지 — 만들기 전에 브랜드 톤을 보러 가는 자리다.
      //   새 창으로 연다. 같은 창에서 열면 보던 화면을 잃는다.
      (p.who.homepage
        ? ' · <a href="' + esc(p.who.homepage) + '" target="_blank" ' +
          'rel="noopener noreferrer">홈페이지 ↗</a>'
        : "") +
      '<button class="btn ghost mailbtn" type="button" data-mail="' + esc(p.slug) +
      '">회신 문구</button></div>' : "";

    // 의뢰 원문 — 관리자가 제일 먼저 읽어야 할 것이라 카드 안에 그대로 편다
    var said = p.brief_raw
      ? '<div class="said"><span class="lbl">광고주가 쓴 것</span>' +
        esc(p.brief_raw) + "</div>"   // 목표·대상은 아래 「의뢰 조건」에만 (09-23 두 번 보였다)
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
      '</span>' + digestConditions(p).map(function (c) {
        return '<span class="sub added">광고주 답 · ' + esc(c) + '</span>';   // 071 — 답이 오면 바로 여기 붙는다
      }).join("") + '</div>';

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
          // 같은 판단을 한 곳에서 한다 — 모르는 모양이면 숫자를 지어내지 않고 드러낸다
          var fr = SE().reviewFindings(ai);
          var findingText = !fr.present ? ""
            : (fr.ok
              ? " · 치명 " + fr.critical + " / 참고 " + fr.advisory +
                (fr.shape === "count" ? "" : " · " + fr.shape_label)
              : " · 검토 결과를 읽지 못했습니다(" + fr.error + ")");
          return '<div class="executor-step"><span>' + esc(AI_STAGE[h.step] || h.step || "단계 미상") +
            '</span><b>수행 ' + esc(worker) + '</b><b>검토 ' + esc(reviewer + findingText) + '</b></div>';
        }).join("") + '</div>'
      : '<div class="executor-history empty"><strong>단계별 AI 작업 기록</strong><span>아직 모델 기록이 없습니다.</span></div>';

    // 다섯 안을 늘 나란히 세우면 카드 하나가 좁아져 글이 세로로 길게 흐른다.
    // 고른 안이 있으면 그 하나를 가로 전체로 펼치고 나머지는 접는다 — 광고주 화면이
    // 이미 쓰는 방식이고, 관리자가 볼 것도 결국 "무엇을 골랐나" 하나다.
    function conceptList(list) {
      var rows = list.slice().sort(function (a, b) { return a.key.localeCompare(b.key); });
      var card = function (c) { return R().concept(c, ADMIN); };
      var chosen = rows.filter(function (c) { return c.is_chosen; })[0];
      if (!chosen) return '<div class="concepts">' + rows.map(card).join("") + '</div>';
      var others = rows.filter(function (c) { return !c.is_chosen; });
      return '<div class="chosen-summary"><span class="chosen-label">선택한 방향</span>' +
        card(chosen) + '</div>' +
        (others.length
          ? '<details class="other-concepts"><summary>다른 제안 ' + others.length +
            '개 다시 보기</summary><div class="concepts">' + others.map(card).join("") +
            '</div></details>'
          : "");
    }

    var conceptReview = "";
    if (p.concepts && p.concepts.length) {
      var strategyLine = p.strategy
        ? '<div class="review-strategy"><span>전략 한 줄 · ' + (p.strategy.written_by === "human" ? "사람이 씀" : "AI가 씀") +
          '</span><b>' + esc(p.strategy.one_message || "") + '</b></div>'
        : "";
      var atConceptStage = p.step === "concepts";
      var replanBusy = atConceptStage && p.job && p.job.step === "concepts";
      // 재기획 범위 — 전부 다시 만들지, 아쉬운 안만 다시 만들지 고른다.
      // 고르지 않은 안은 손대지 않는다(서버에서도 강제한다).
      var conceptKeys = p.concepts.map(function (c) { return c.key; })
        .sort(function (a, b) { return a.localeCompare(b); });
      var pickBoxes = conceptKeys.map(function (k) {
        return '<label class="replan-pick"><input type="checkbox" data-replan-key="' + esc(p.slug) +
          '" value="' + esc(k) + '"><span>' + esc(k) + '</span></label>';
      }).join("");
      var replanBox = atConceptStage && p.state === "pending"
        ? (replanBusy
          ? '<div class="replan-box busy"><b>새 콘셉트를 만드는 중입니다</b><span>완료되면 이 화면에 자동으로 교체됩니다.</span></div>'
          : '<div class="replan-box" id="rp-' + esc(p.slug) + '" data-replan-form="' + esc(p.slug) + '" hidden>' +
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
            '<label for="replan-' + esc(p.slug) + '">어떤 점이 아쉬운지 (선택)</label>' +
            '<textarea id="replan-' + esc(p.slug) + '" data-replan-note="' + esc(p.slug) +
            '" rows="3" placeholder="비워 두면 지금 5안과 겹치지 않는 새 발상으로 다시 씁니다. 예: 인물 없는 방향을 늘려 주세요."></textarea>' +
            '<button class="btn ghost" type="button" data-replan="' + esc(p.slug) +
            '">5안 전체 다시 만들기</button><small>지금 5안은 관리자용 백업으로 남기고 새 안으로 바꿉니다. 전략은 그대로 둡니다.</small></div>')
        : "";
      // ★ 콘셉트 카드는 광고주 화면과 **같은 공용 렌더**가 그린다.
      // 예전에는 본문 한 문단이 통째로 <p> 하나였고 후킹·화면·위험이 한 줄씩
      // 붙어 있었다 — 같은 글이 광고주 화면에서는 시간 흐름까지 나뉘어 보이는데
      // 관리자 화면에서만 벽으로 보였다. 이제 구조가 같고, 관리자에는 주의점이
      // **덧붙을** 뿐이다(role: admin).
      conceptReview = '<section class="concept-review"><div class="review-head"><span>' +
        (atConceptStage ? "관리자 검토" : "선택 완료 · 보관본") + '</span>' +
        '<h3>콘셉트 5안</h3><p>' + (atConceptStage
          ? "추천은 참고값입니다. 다섯 방향의 차이와 위험을 확인한 뒤 광고주에게 보내세요."
          : "이 프로젝트에서 실제로 제안하고 선택한 콘셉트 기록입니다.") + '</p></div>' +
        strategyLine + conceptList(p.concepts) + reviewActions(p, atConceptStage, replanBusy) + replanBox + '</section>';
    }

    /** 콘셉트 검토의 할 일을 한 줄에 순서대로 (Dan 09-24 「버튼은 한곳에 순서대로」)
     *  전략부터 다시 → 5안 다시 만들기(양식은 눌러야 열림) → 광고주에게 보내기 */
    function reviewActions(p, here, busy) {
      if (!here || p.state !== "pending" || !canWrite || busy) return "";
      var chosen = (p.concepts || []).some(function (c) { return c.is_chosen; });
      var back = p.redo && p.redo.gate === "concepts" && p.redo.decision === "revise" && !p.redoDone;
      return '<div class="review-actions"><div class="txt"><b>' +
        (back ? "광고주가 되돌려보냈습니다 — 고쳐서 다시 보내세요" : "검토 후 할 일") + "</b>" +
        "<span>광고주에게 보내기 전까지 광고주 쪽에는 버튼이 없습니다.</span></div>" +
        '<div class="ra-row">' +
        (chosen ? "" : '<button class="btn ghost" type="button" data-back-strategy="' + esc(p.id) + '">① 전략부터 다시</button>') +
        '<button class="btn ghost" type="button" data-toggle-form="rp-' + esc(p.slug) + '">② 5안 다시 만들기</button>' +
        '<button class="btn" type="button" data-send="' + esc(p.slug) + '">③ 광고주에게 보내기</button>' +
        "</div></div>";
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
        // 콘티 검수 링크는 여기 없다. 이 블록은 콘셉트 5안 아래에 그려지므로
        // 그 자리에 두면 「콘티 승인」이 콘셉트 단계의 일처럼 읽힌다.
        // 링크는 콘티 승인 단계 본문 안에만 있다(boardLink 참고).
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

    function factList(v) {
      var arr = Array.isArray(v) ? v : [v];
      return '<ul class="fact-list">' + arr.map(function (x) { return "<li>" + esc(readable(x)) + "</li>"; }).join("") + "</ul>";
    }
    var factsBody = p.facts
      ? '<div class="stage-content"><dl class="stage-data">' +
        '<dt>확인된 사실</dt><dd>' + factList(p.facts.facts) + '</dd>' +
        '<dt>제품 잠금</dt><dd>' + esc(readable(p.facts.product_lock)) + '</dd>' +
        '<dt>표기 문구</dt><dd>' + esc(readable(p.facts.label_text)) + '</dd>' +
        '<dt>주장별 근거</dt><dd>' + factList(p.facts.claims) + '</dd>' +
        (p.facts.device_note ? '<dt>제작 메모</dt><dd class="pre">' + esc(readable(p.facts.device_note)) + '</dd>' : '') +
        '</dl>' + files + '</div>'
      : '<p class="stage-empty">제품 자료는 등록됐지만 정리된 확인 내용이 없습니다.</p>' + files;
    // 전략도 공용 렌더다 — 네 칸이 각각 한 구획이고, 긴 문단은 문장 단위로 나뉜다
    // ★ 전략 칸은 「한눈에 보기」가 먼저다 (Dan 09-24 「아 이런 느낌으로 하려는 거구나」가 바로 읽히게)
    //   광고주 화면의 「공통 기획 방향」과 같은 글 — 광고주가 이걸 고쳐 달라면 전략을 바꿔 달라는 뜻이다.
    //   인사이트·강점·톤 전문은 아래에 접어 둔다.
    var sg = p.strategy || {};
    var glance = (sg.client_who || sg.client_what || sg.client_why || sg.client_feel)
      ? '<div class="ms-summary glance"><div class="ms-by">한눈에 보기 · 광고주 화면의 「공통 기획 방향」</div>' +
        [["누구에게", sg.client_who], ["무슨 말을", sg.client_what], ["왜 이 방향인가", sg.client_why], ["어떤 느낌으로", sg.client_feel]]
          .filter(function (r) { return r[1]; })
          .map(function (r) { return "<span><b>" + r[0] + "</b> " + esc(r[1]) + "</span>"; }).join("") + "</div>"
      : (sg.one_message ? '<div class="ms-summary glance"><div class="ms-by">한눈에 보기</div><span><b>핵심 메시지</b> ' +
          esc(sg.one_message) + "</span><span class=\"ms-more\">광고주용 「공통 기획 방향」이 아직 없습니다</span></div>" : "");
    var strategyBody = p.strategy
      ? '<div class="stage-content">' + glance +
        '<details class="strategy-full"><summary>전략 전문 — 인사이트 · 강점 · 톤</summary>' + R().strategy(p.strategy, ADMIN) + "</details></div>"
      : '<p class="stage-empty">저장된 전략 설계 내용이 없습니다.</p>';

    // 구성·각본 — 결과가 들어오기 전에는 「제작 중 / 대기」를 분명히 보여 주고,
    // 들어온 뒤에는 같은 단계 안에서 구조화된 상세로 바뀐다. 별도 화면으로 빼지 않는다
    var d = p.development;
    var hasDevelopment = !!(d && ((d.arc && d.arc.length) || (d.copies && d.copies.length) ||
      d.narration_tone || d.slogan));
    // ★ 배열을 한 줄에 쉼표로 이어 붙이던 자리다. 이제 공용 렌더가
    // 전개는 시간 구간별 세로 목록으로, 카피는 한 문구 한 행으로,
    // 나레이션·슬로건·음악은 각각 별도 구획으로 그린다.
    // 「최종 편집 음악」(Codex 가 나눈 음악 워크플로)은 관리자에만 덧붙는다.
    // ★ 구성·각본에는 **컷 전문이 들어가야 한다.**
    //
    //   여태 이 단계는 카피·톤·슬로건·음악만 보여 줬다. 그런데 각본의 본문은
    //   컷이다 — 무슨 일이 일어나고, 무엇이 화면에 있고, 왜 그런가. 컷은
    //   콘티 단계에만 그려져서, 구성·각본을 펼치면 껍데기만 보였다
    //   (Dan 2026-09-22: 「구성 각본도 저게 전부인가 … 관리자쪽에선
    //   다보이게해야지」).
    //
    //   광고주 화면은 그대로 둔다 — 여기에 붙는 것은 ADMIN 으로 그리므로
    //   카메라 사양 같은 내부 말이 광고주에게 새지 않는다.
    var scriptCuts = (p.cuts || []).length
      ? '<div class="script-cuts">' +
        '<span class="sc-lbl">컷 ' + (p.cuts || []).length + '개 · 각본 본문</span>' +
        R().cuts(p.cuts, { role: "admin", textOnly: true }) + "</div>"
      : "";
    var developBody = hasDevelopment
      ? '<div class="stage-content">' + R().development({
          arc: d.arc, copies: d.copies, narration_tone: d.narration_tone,
          slogan: d.slogan, bgm: d.bgm,
        }, ADMIN) + scriptCuts + '</div>'
      : (p.step === "develop"
          ? scriptCuts : scriptCuts);   // 기다리는 동안은 위 두 갈래 선택 칸이 말한다 — 「대기 중」을 또 적지 않는다

    // 콘티 — 이 단계의 주인공은 **그림**이다. 글로 된 컷 사양은 그림을 대조하는
    // 보조 검사기이지 콘티 자체가 아니다. 그래서 맨 위에 「지금 어디까지 와 있나」
    // 한 줄을 두고, 컷 전문은 접어 둔다. 그림이 없는데 「완료」라고 적지 않는다 —
    // 컷 설계가 끝난 것과 시각 콘티가 나온 것은 다른 일이다.
    var cutRows = p.cuts || [];
    var boardFiles = (p.files || []).filter(function (f) { return f.kind === "board"; });
    var boardSheet = boardFiles.filter(function (f) { return f.cut_n == null; }).length;
    var boardPanels = boardFiles.filter(function (f) { return f.cut_n != null; }).length;
    var boardState = boardSheet
      ? "콘티 시트 등록됨"
      : (boardPanels ? "컷 그림 " + boardPanels + "장 등록됨" : "컷 설계 완료 · 시각 콘티 미제작");
    var storyboardHead = cutRows.length
      ? '<div class="board-state' + (boardSheet || boardPanels ? " ready" : "") + '">' +
        '<span class="bs-what">' + esc(boardState) + '</span>' +
        '<span class="bs-n">' + cutRows.length + '컷</span>' +
        '</div>'
      : "";
    // 새 흐름이 도는 동안에는 옛 상태바·링크를 띄우지 않는다. 검수 칸이 같은 말을
    // 이미 하고 있고, 두 번 말하면 어느 쪽을 봐야 할지 모르게 된다.
    var boardFlow = (p.step === BOARD_REVIEW_STAGE)
      ? SE().boardActions(p, p.boardCounts) : null;
    if (boardFlow) storyboardHead = "";
    // 언제 띄울지는 상태기계가 정한다(boardActions.showCuts). 여기서 다시
    // 판단하지 않는다 — 두 곳이 판단하면 두 곳이 갈린다.
    //
    // 여태 perCut 으로 갈음했더니 **그림 뽑는 자리에서 컷 글이 사라졌다.**
    // 컷 글은 그림의 출처인데, 정작 그림을 만들 때 안 보이면 대조할 것이 없다.
    var showCuts = !boardFlow || boardFlow.showCuts;
    // 컷마다 그 컷 그림. 콘티 시트를 잘라 넣은 조각이 cut_n 을 달고 올라온다.
    // 없으면 빈 칸을 렌더러가 알아서 그린다("그림 준비 전") — 여기서 지어내지 않는다.
    var panelBy = {};
    boardFiles.forEach(function (f) {
      if (f.cut_n == null || !f.url || !boardCurrent(p, f)) return;   // 수정 요청 전·교체된 조각은 안 붙인다
      if (!panelBy[f.cut_n]) panelBy[f.cut_n] = f;
    });
    var panelCount = Object.keys(panelBy).length;
    var hasSheet = boardFiles.some(function (f) { return f.cut_n == null && f.url && boardCurrent(p, f); });
    function boardPanel(c) {
      var f = panelBy[c && c.n];
      // 컷별 조각이 없고 시트 한 판만 있으면 「그림 준비 전」 대신 시트의 몇 번 칸인지 알린다 (09-24)
      if (!f) return hasSheet ? '<div class="cut-empty"><span>위 콘티 시트 ' + esc(String(c && c.n)) + '번 칸</span></div>' : "";
      return '<img class="cut-panel" src="' + esc(f.url) + '" alt="컷 ' + esc(String(c.n)) +
        ' 콘티" loading="lazy" data-big="' + esc(f.url) + '" data-kind="img">';
    }
    var storyboardBody = storyboardHead + ((cutRows.length && showCuts)
      ? '<details class="stage-cuts"' +
        ((boardFlow && boardFlow.perCut) ? " open" : "") + ">" +
        '<summary>' + (panelCount
          ? '콘티 확인하기 · ' + panelCount + '컷'
          : '컷 사양 ' + cutRows.length + '개 — 글로 확인하기') + '</summary>' +
        R().cuts(cutRows, {
          role: "admin", compact: true,
          // 검수하는 자리에서만 컷마다 의견 칸이 붙는다. 볼 것이 없는 자리에
          // 입력 칸을 두면 누를 수 없는 버튼이 생긴다.
          // 콘티 그림 단계에서 컷별 조각이 없으면(시트 한 판) 컷마다 승인·수정은 할 일이 없다 — 숨긴다 (09-24)
          cutActions: (boardFlow && boardFlow.perCut && !(boardFlow.phase === "board.review" && !panelCount))
            ? function (n) { return cutReviewBox(p, boardFlow.layer, n); }
            : null,
        }, boardPanel) + '</details>'
      : ((p.n_cuts && showCuts) ? '<p class="stage-empty">콘티 ' + p.n_cuts +
          '컷이 있습니다. 컷 내용을 불러오지 못했습니다.</p>' : ""));

    // ★ 콘티 검수 링크 — **콘티 승인 단계 본문 안에서만** 뜬다.
    //   조건 두 가지뿐이다: 콘티가 실제로 있는가(데이터), 그리고 지금 그 단계인가.
    //   단계 이름을 여기서 새로 짓지 않는다 — stageBodies 가 그 본문을 등록하는
    //   바로 그 키(BOARD_REVIEW_STAGE)를 판정에도 그대로 쓴다. 과거 단계·다른
    //   단계에서는 아무것도 나오지 않는다.
    function boardLink(key) {
      if (p.step !== key) return "";
      if (!(p.cuts && p.cuts.length) && !p.n_cuts) return "";
      // 그림이 없는데 「콘티 검수」라고 적으면 눌러 본 사람이 컷 표만 만난다.
      // 검수할 것이 아직 없으면 이름도 그렇게 적는다.
      var label = (boardSheet || boardPanels) ? "콘티 검수" : "컷 설계 보기";
      return '<div class="ways stage-ways"><a class="btn ghost" href="board.html?slug=' +
        encodeURIComponent(p.slug) + '">' + label + '</a></div>';
    }

    /** 납품 — 관리자가 승인해야 광고주에게 나간다. 광고주는 그 뒤에 확인·승인한다 (065).
     *  Dan 09-23: 「납품 단계에서 관리자가 승인을 해야 납품이 되는거고 서로 다르게 시간차를 두고봐야함」
     *  pending = 아직 안 보냄 · ready = 보냄, 광고주 확인 대기 · idle = 광고주가 승인 */
    function deliverBody(p) {
      var last = (p.approvals || []).filter(function (a) { return a.gate === "deliver"; })[0];
      if (p.state === "ready") {
        return '<div class="lc-box"><b>광고주 확인 기다리는 중</b>' +
          '<span class="lc-msg">납품 ' + esc(p.sentAt ? hhmm(p.sentAt) : "") +
          ' · 광고주 화면에 「납품되었습니다 · 확인 및 승인」이 떠 있습니다</span></div>';
      }
      if (p.state === "done") {
        return '<div class="close-box done"><b>프로젝트 완료</b>' +
          '<span>' + esc(personName(p.closed_by)) + " · " + esc(when(p.closed_at)) + " · 총 원가 " + spentAll(p) +
          "cr" + won(spentAll(p)) + "</span></div>";
      }
      if (p.state === "idle" && last && last.decision === "ok") {
        // ★ 광고주 승인으로 끝나지 않는다 — 관리자가 닫아야 한 건이 끝난다 (068 · Dan 09-23)
        return '<div class="close-box"><b>광고주가 납품본을 승인했습니다</b>' +
          '<span>' + esc(personName(last.decided_by)) + " · " + esc(when(last.decided_at)) +
          (last.note ? " · 「" + esc(last.note) + "」" : "") + "</span>" +
          '<p>남은 일이 없으면 프로젝트를 닫습니다. 닫으면 목록 아래 「완료된 프로젝트」로 내려가고, ' +
          "이 건의 원가·판 수가 제작 기록에 남습니다.</p>" +
          (canWrite ? '<button class="btn" type="button" data-close-project="' + esc(p.id) + '">프로젝트 완료</button>' : "") +
          "</div>" + backBox(p);
      }
      if (!canWrite) return "";
      // 보내기 전에 한 번 더 본다 — 승인 버튼 바로 위 (Dan 09-23)
      var fin = (p.files || []).filter(function (x) { return x.kind === "final" && x.url; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
      return (fin ? '<div class="deliver-final"><video src="' + esc(fin.url) +
          '" controls playsinline preload="metadata"></video><small>보낼 완성본 · ' +
          esc(hhmm(fin.created_at)) + ' 판</small></div>' : "") +
        '<div class="lc-box"><b>완성본을 광고주에게 보냅니다</b>' +
        '<span class="lc-msg">누르면 가장 새 완성본 한 편이 광고주 화면에 뜨고, 광고주가 확인·승인합니다. ' +
        '보내기 전까지 광고주에게는 「영상 제작 완료 · 납품을 준비하고 있습니다」로 보입니다.</span>' +
        '<div class="lc-row"><button class="btn" type="button" data-final-send="' + esc(p.id) +
        '">승인하고 광고주에게 납품</button></div></div>' + backBox(p);
    }

    /** 앞 단계로 되돌리기 — 마지막 검수에서도 고칠 수 있게 (067 · Dan 09-23).
     *  만든 것은 지우지 않는다. 사유는 되돌아간 단계의 「고칠 점」으로 남는다. */
    function backBox(p) {
      if (!canWrite) return "";
      var order = ["anchors", "video", "post"];
      var now = FLOW.map(function (x) { return x.key; }).indexOf(p.step);
      var opts = order.filter(function (k) {
        return FLOW.map(function (x) { return x.key; }).indexOf(k) < now;
      });
      if (!opts.length) return "";
      return '<details class="back-box"><summary>이전 단계로 되돌리기</summary>' +
        '<div class="lc-row"><select data-back-to>' + opts.slice().reverse().map(function (k) {
          return '<option value="' + k + '">' + esc(STEP_NAME[k]) + "</option>";
        }).join("") + '</select>' +
        '<input data-back-note maxlength="2000" placeholder="왜 되돌리나요 — 그 단계의 고칠 점으로 남습니다">' +
        '<button class="btn ghost" type="button" data-back="' + esc(p.id) + '">되돌리기</button></div>' +
        (p.step === "deliver" && p.state === "ready"
          ? '<small>광고주에게 보낸 완성본은 거둬들입니다.</small>' : "") + "</details>";
    }

    /** 납품 칸의 원가 명세서 — **실패한 것까지** 결제 한 건 한 건, 단계별 소계, 총계.
     *  Dan 09-23: 「그게 바로 원가거든」 「명세서처럼 제대로 읽히도록 세세하게」.
     *  합계는 힉스필드 결제 내역과 같아야 한다(RUSH 271cr 대조 완료). 원화는 확정 단가가 없으면 추정. */
    /** 광고주가 올린 자료를 그림으로 — 글자(「제품 사진 1개」)만 보여서 무엇이 왔는지 몰랐다 (09-23 환타).
     *  누르면 크게(data-big). 어떤 종류가 광고주 몫인지는 계약(ad-type-materials.js)이 정한다. */
    /** 광고주가 메시지로 보낸 답 — 의뢰 내용에 붙는다 (Dan 09-23 「의뢰 접수 부분에 내용이 업데이트되야지」) */
    /** 정해진 전략 — 콘셉트를 누가 쓰든 이걸 받아 쓴다 (074) */
    function strategySummary(p) {
      var st = p.strategy;
      if (!st) return "";
      var row = function (k, v) { return v ? '<span><b>' + k + '</b> ' + esc(v) + '</span>' : ""; };
      return '<div class="ms-summary"><div class="ms-by">전략 설계 · ' + (st.written_by === "human" ? "사람이 씀" : "AI가 씀") + '</div>' +
        row("핵심 메시지", st.one_message) + row("그 외 필요한 사항", st.direction) +
        '<span class="ms-more">인사이트·강점·톤 전문은 위 「전략 설계」 칸</span></div>';
    }

    /** 사람이 전략을 쓰는 양식 (074). 있던 전략이 있으면 채워 둔다 — 고쳐 쓰기 쉽게. */
    function manualStrategyForm(p) {
      var st = p.strategy || {};
      var f = function (k, label, ph, rows) {
        return '<label class="ms-field"><span>' + esc(label) + "</span>" + (rows
          ? '<textarea data-ms="' + k + '" rows="' + rows + '" placeholder="' + esc(ph) + '">' + esc(st[k] || "") + "</textarea>"
          : '<input data-ms="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(st[k] || "") + '">') + "</label>";
      };
      return '<div class="mc-form" id="ms-' + esc(p.id) + '" hidden>' +
        '<div class="mc-guide"><b>쓰는 법</b>' +
        "<span>· 콘셉트 5안이 이걸 그대로 받아 씁니다 — AI가 쓰든 사람이 쓰든</span>" +
        "<span>· 핵심 메시지·인사이트·그 외 필요한 사항 중 하나는 꼭. 나머지는 비워도 됩니다</span>" +
        "<span>· 가진 자료 안에서 — 광고주에게 새 자료를 요구하는 방향은 쓰지 않습니다</span></div>" +
        f("one_message", "핵심 메시지", "이 광고가 남길 한마디", 2) +
        f("insight", "인사이트", "누구의 어떤 순간을 건드리나", 3) +
        f("usp", "강점(USP)", "이 제품만 줄 수 있는 것", 2) +
        f("tone", "톤", "예: 유쾌하고 시원한, 과장된 코믹", 2) +
        f("direction", "그 외 필요한 사항", "꼭 넣을 것, 피할 것, 참고할 결", 3) +
        '<div class="mc-guide"><b>광고주에게 보이는 「공통 기획 방향」</b><span>· 콘셉트 5안 위에 뜹니다. 항목마다 한두 문장, 쉬운 말로 — 인사이트·USP 같은 우리 말 없이</span></div>' +
        f("client_who", "누구에게", "예: 20~50대 남성 — 어떤 순간에 있는 사람인지까지", 2) +
        f("client_what", "무슨 말을", "예: 밋밋한 순간, 한 모금으로 톡 깨어난다 — 무엇을 약속하는지까지", 2) +
        f("client_why", "왜 이 방향인가", "예: 이 제품의 가장 큰 무기가 무엇이라 이 방향인지", 2) +
        f("client_feel", "어떤 느낌으로", "예: 밝고 시원하게, 유쾌한 과장으로 — 어떤 장면이 먼저 오는지까지", 2) +
        '<button class="btn" type="button" data-ms-save="' + esc(p.id) + '">전략 올리기 → 콘셉트 5안</button></div>';
    }

    /** 사람이 구성·각본을 쓰는 양식 (077) — AI 와 같은 칸: 골 · 필수 · 흐름 · 카피 · 비트 */
    function manualDevelopForm(p) {
      var sec = Number(p.running_sec) || 15;
      var fld = function (k, label, ph, rows) {
        return '<label class="ms-field"><span>' + esc(label) + '</span><textarea data-dv="' + k + '" rows="' + (rows || 2) +
          '" placeholder="' + esc(ph) + '"></textarea></label>';
      };
      var beat = function (i) {
        return '<fieldset class="mc-one dv-beat"><legend>비트 ' + (i + 1) + '</legend>' +
          '<div class="dv-time"><label class="ms-field"><span>시작(초)</span><input data-bt="t_start" inputmode="decimal"' + (i === 0 ? ' value="0"' : "") + '></label>' +
          '<label class="ms-field"><span>끝(초)</span><input data-bt="t_end" inputmode="decimal"></label></div>' +
          '<label class="ms-field"><span>무슨 일이 벌어지나</span><input data-bt="action" placeholder="한 장으로 보이는 순간"></label>' +
          '<label class="ms-field"><span>왜 (의도)</span><input data-bt="intent" placeholder="이 순간이 하는 일"></label>' +
          '<label class="ms-field"><span>자막·대사 (선택)</span><input data-bt="dialogue"></label></fieldset>';
      };
      return '<div class="mc-form" id="dv-' + esc(p.id) + '" hidden>' +
        '<div class="mc-guide"><b>쓰는 법</b>' +
        "<span>· 영상은 " + sec + "초 한 통으로 뽑고 컷·앵글은 영상 엔진이 설계합니다 — 여기서는 골과 꼭 지나갈 순간만</span>" +
        "<span>· 비트는 한 장으로 보이는 순간으로. 시간은 0초부터 빈틈없이 이어지고 마지막이 " + sec + "초</span>" +
        "<span>· 쓴 비트만 올라갑니다(빈 비트는 건너뜀)</span></div>" +
        fld("goal", "골", "이 " + sec + "초 동안 무슨 일이 벌어지고 무엇으로 끝나나") +
        fld("must", "필수", "반드시 들어갈 연출 — 예: 병이 화면에서 명확히 보인다") +
        fld("flow", "흐름 (선택)", "한 줄에 하나씩", 3) +
        fld("copies", "화면 자막·카피 (선택)", "한 줄에 하나씩", 2) +
        '<label class="ms-field"><span>슬로건 (선택)</span><input data-dv="slogan"></label>' +
        [0, 1, 2, 3, 4, 5].map(beat).join("") +
        '<button class="btn" type="button" data-dv-save="' + esc(p.id) + '">구성·각본 올리기 → 콘티 확인</button></div>';
    }

    /** 사람이 콘셉트를 쓰는 양식 (073). 쓰는 법 안내를 같이 둔다. */
    function manualConceptForm(p) {
      var mf = function (k, label, ph, rows) {
        return '<label class="ms-field"><span>' + esc(label) + "</span>" + (rows
          ? '<textarea data-mc="' + k + '" rows="' + rows + '" placeholder="' + esc(ph) + '"></textarea>'
          : '<input data-mc="' + k + '" placeholder="' + esc(ph) + '">') + "</label>";
      };
      var one = function (i) {
        var k = "ABCDE"[i];
        return '<fieldset class="mc-one"><legend>' + k + '안</legend>' +
          mf("title", "제목", "발상을 한 마디로") +
          mf("client_one_line", "한 줄 설명 (필수)", "광고주가 읽는 말") +
          mf("client_explain", "어떤 광고인가", "쉬운 말로 두세 줄", 2) +
          mf("client_appeal", "매력", "왜 기억에 남나") +
          mf("client_mood", "분위기", "예: 유쾌하고 시원한") +
          mf("client_difference", "다른 안과 다른 점", "") +
          '<label class="mc-reco"><input type="radio" name="mc-reco-' + esc(p.id) + '" value="' + i + '"' + (i === 0 ? " checked" : "") + '> 추천안</label>' +
          "</fieldset>";
      };
      return '<div class="mc-form" id="mc-' + esc(p.id) + '" hidden>' +
        '<div class="mc-guide"><b>쓰는 법</b>' +
        "<span>· 다섯 안은 서로 다른 「보는 재미」 하나씩 — 반전·과장·리듬·웃음·감각 중 하나를 분명히</span>" +
        "<span>· 광고주가 읽는 칸은 쉬운 말로, 포인트만 — 초·컷·카메라·전환·BGM·엔딩 같은 제작 용어는 쓰지 않는다(올릴 때 막힌다)</span>" +
        "<span>· 가진 자료 안에서 되는 발상만 — 광고주에게 새 자료를 요구하지 않는다</span>" +
        "<span>· 한 안만 써도 된다. 빈 안은 올라가지 않는다. 추천안은 하나</span></div>" +
        '<label class="ms-field"><span>이 광고가 남길 한마디 (선택)</span><input class="mc-msg" data-mc-msg placeholder="예: 톡 쏘면, 오늘이 다시 켜진다"></label>' +
        [0, 1, 2, 3, 4].map(one).join("") +
        '<button class="btn" type="button" data-mc-save="' + esc(p.id) + '">콘셉트 올리기 → 검토</button></div>';
    }

    function clientReplies(p) {
      var r = (p.messages || []).filter(function (m) { return m.author === "client"; });
      if (!r.length) return "";
      return '<div class="said"><span class="lbl">광고주 추가 답변 ' + r.length + "건</span>" + r.map(function (m) {
        return '<span class="sub">' + esc(when(m.sent_at)) + " · " + esc(m.body) + "</span>";
      }).join("") + "</div>";
    }

    function clientFiles(p) {
      var spec = window.ONECUE_AD_TYPE_MATERIALS || {};
      var mine = (p.files || []).filter(function (f) {
        var k = spec.kinds && spec.kinds[f.kind];
        return f.url && (!k || k.by === "client" || k.by === "both") &&
          ["product_ref", "logo", "brand_guide", "mood_ref", "place_ref", "char_ref", "screen_ref", "legal_text", "doc"].indexOf(f.kind) >= 0;
      });
      if (!mine.length) return '<div class="said"><span class="lbl">광고주가 올린 자료</span><span class="sub">없음</span></div>';
      return '<div class="said"><span class="lbl">광고주가 올린 자료 ' + mine.length + '개</span><div class="client-files">' +
        mine.map(function (f) {
          var img = /^image\//.test(f.mime || "") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(f.url);
          return '<figure>' + (img
            ? '<img src="' + esc(f.url) + '" loading="lazy" data-big="' + esc(f.url) + '" data-kind="img" alt="">'
            : '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">파일 열기</a>') +
            '<figcaption>' + esc(f.role || f.kind) + '</figcaption></figure>';
        }).join("") + "</div></div>";
    }

    function totalLine(p) {
      var all = spentAll(p);
      if (!all) return "";
      var rows = (p.spends || []).slice().sort(function (a, b) { return a.spent_at < b.spent_at ? -1 : 1; });
      var used = 0, gone = 0, open = 0, groups = [], byKey = {};
      rows.forEach(function (x) {
        var c = Number(x.credits) || 0, k = spendStage(x);
        if (!byKey[k]) { byKey[k] = { key: k, rows: [], all: 0, used: 0, gone: 0 }; groups.push(byKey[k]); }
        var g = byKey[k]; g.rows.push(x); g.all += c;
        if (x.outcome === "used") { used += c; g.used += c; }
        else if (x.outcome === "discarded") { gone += c; g.gone += c; }
        else open += c;
      });
      var est = !krwPerCredit() && krwEstimate();
      var basis = (window.ONECUE_CREDIT_RATES || {}).estimate_basis || {};
      function krw(c) { return esc(won(c).replace(/^ · /, "")) || "—"; }
      function item(x) {
        var w = String(x.what || "").split("★")[0]
          .replace(/^[0-9A-Za-z_]+ · (video|anchors|storyboard) · /, "").trim();
        return w || x.engine || "";
      }
      function mark(x) {
        return x.outcome === "discarded" ? '<span class="st gone">버린 판</span>'
          : x.outcome === "used" ? '<span class="st kept">채택</span>' : '<span class="st">—</span>';
      }
      var body = groups.map(function (g) {
        return '<tr class="grp"><th colspan="6">' + esc(STEP_NAME[g.key] || g.key) + "</th></tr>" +
          g.rows.map(function (x, i) {
            var c = Number(x.credits) || 0;
            // 영상은 판 번호로 — 「C1 · 15초(C1)」가 여섯 줄 똑같아 몇 번째 판인지 안 보였다
            var vid = /seedance|kling|veo|hailuo|wan/i.test(x.engine || "");
            var nth = vid ? g.rows.slice(0, i + 1).filter(function (y) {
              return /seedance|kling|veo|hailuo|wan/i.test(y.engine || ""); }).length : 0;
            return '<tr class="' + (x.outcome || "") + '"><td class="n">' + (i + 1) + "</td><td>" +
              (vid ? "<b>영상 " + nth + "판</b> · " : "") + esc(item(x)) + '<div class="sub">' + esc(x.engine || "") + " · " + esc(when(x.spent_at)) +
              "</div></td><td>" + mark(x) + '</td><td class="num">' + c + '</td><td class="num">' + krw(c) +
              "</td></tr>";
          }).join("") +
          '<tr class="subtotal"><td></td><td>' + esc(STEP_NAME[g.key] || g.key) + " 소계" +
          (g.gone ? ' <span class="sub">(채택 ' + g.used + " · 버린 판 " + g.gone + ")</span>" : "") +
          '</td><td></td><td class="num">' + g.all + '</td><td class="num">' + krw(g.all) + "</td></tr>";
      }).join("");
      var rb = (window.ONECUE_CREDIT_RATES || {}).rate_basis || {};
      // 오른쪽 위 — 환율과 1크레딧 단가 (Dan 09-23 「명세서 맨위 오른쪽에 환율이랑 credit당 얼마인지」)
      var head = krwPerCredit()
        ? '<div class="stmt-rate"><div>환율 $1 = ₩' + Number(rb.krw_per_usd || 0).toLocaleString() +
          ' <span>(' + esc(String(rb.krw_source || "").slice(0, 16)) + ")</span></div>" +
          "<div><b>1크레딧 ≈ ₩" + krwPerCredit() + "</b> <span>(" + esc(rb.plan || "") + " 정가 $" +
          esc(String(rb.usd_list || "")) + " + VAT 10% ÷ " + Number(rb.credits || 0).toLocaleString() + "cr)</span></div></div>"
        : "";
      // 기본은 접어 둔다 — 제목 줄에 총 원가만, 누르면 명세가 펼쳐진다 (Dan 09-23)
      return '<details class="cost-statement"><summary class="stmt-head"><h4>제작 원가 명세 <span class="stmt-sum">총 ' +
        all + "cr" + won(all) + (gone ? " · 버린 판 " + gone + "cr" : "") + "</span></h4>" + head + "</summary>" +
        '<table class="stmt"><thead><tr><th class="n">#</th><th>항목 · 엔진 · 시각</th><th>결과</th>' +
        '<th class="num">크레딧</th><th class="num">원화</th></tr></thead><tbody>' + body + "</tbody></table>" +
        '<table class="stmt total"><tbody>' +
        '<tr><td>채택 (완성본에 들어간 것)</td><td class="num">' + used + '</td><td class="num">' + krw(used) + "</td></tr>" +
        '<tr class="discarded"><td>버린 판 (만들었지만 쓰지 않은 것 — 돈은 나갔다)</td><td class="num">' + gone +
        '</td><td class="num">' + krw(gone) + "</td></tr>" +
        (open ? '<tr><td>아직 안 가름</td><td class="num">' + open + '</td><td class="num">' + krw(open) + "</td></tr>" : "") +
        '<tr class="grand"><td>총 원가 · 결제 ' + rows.length + '건</td><td class="num">' + all +
        ' cr</td><td class="num">' + krw(all) + "</td></tr></tbody></table>" +
        '<p class="stmt-note">' +
        (krwPerCredit() ? "원화 = 크레딧 × ₩" + krwPerCredit() + " · " + esc(rb.calc || "") + " · 근거: " + esc(rb.krw_source || "") + "."
          : (est ? "원화는 추정 — 1크레딧 ≈ ₩" + est + "." : "원화 단가가 없습니다 — db/credit_rates.json")) +
        " 영상 생성 외 비용(그록 구독 · AI 사용료)은 포함하지 않았습니다.</p></details>";
    }



    // ★ 만든 것은 **단계가 지나가도 남는다.**
    //
    //   전에는 이 함수가 `p.step !== step` 이면 통째로 빈 문자열을 돌려줬다.
    //   그래서 승인을 누르는 순간 다음 단계로 넘어가고, 앵커가 화면에서
    //   **사라졌다** (Dan 2026-09-22: 「승인 눌렀더니 제작 자료에 있던 내용이
    //   안보여 콘티처럼 보여야지」). 승인한 것을 다시 볼 수 없으면 무엇을
    //   승인했는지 확인할 길이 없다.
    //
    //   콘티(storyboard)는 원래 이렇게 돈다 — 본문은 언제나 그리고, 누를 것만
    //   현재 단계일 때 붙인다. 같은 방식으로 맞춘다.
    //
    //   갈라야 하는 이유: 누를 것까지 계속 두면 지나간 단계에 「유료 생성
    //   시작」이나 「승인」이 살아 있게 된다.
    // 후반 작업 — 뽑은 뒤 보내기 전에 사람이 하는 일. 돈은 안 나간다.
    // 계획(render_plan.post)에 적힌 것을 그대로 세운다 — 화면이 목록을
    // 따로 들고 있으면 계획과 갈린다.
    function postFor(p) {
      var pick = SE().of(p, "post") || {};
      if (!pick.chosen_at) return "<span></span>";
      if (!pick.directions) return postBody(p, "후반에서 입힐 것 — AI 계획");
      var applied = p.render_mode_at && pick.directions_at &&
        new Date(p.render_mode_at) > new Date(pick.directions_at);
      return applied ? postBody(p, "요청사항대로 입힐 것") : "<span></span>";
    }

    function postBody(p, title) {
      var raw = (p.render_plan || {}).post;
      // 자막·엔드카드 계획(auto_post 가 읽는 모양)이면 그대로 보여 준다
      if (raw && !Array.isArray(raw) && (raw.captions || raw.endcard)) {
        var caps = (raw.captions || []).map(function (c) {
          return "<li><b>" + esc(c.from) + "~" + esc(c.to) + "초 자막</b> — <span>" + esc(c.text) + "</span></li>";
        }).join("");
        var ec = raw.endcard || {};
        var end = (ec.lines || []).length ? "<li><b>" + esc(ec.from) + "초부터 엔드카드</b> — <span>" +
          (ec.lines || []).map(esc).join(" / ") + "</span></li>" : "";
        return '<div class="stage-content post-work"><div class="pw-head"><b>' + esc(title || "후반에서 입힐 것") + '</b>' +
          (raw.source ? "<span>영상 " + esc(raw.source) + " 에</span>" : "") + "</div>" +
          '<ol class="pw-list">' + caps + end + "</ol>" +
          (raw.why ? '<p class="none">' + esc(raw.why) + "</p>" : "") + "</div>";
      }
      var list = Array.isArray(raw) ? raw : [];
      if (!list.length) {
        return '<div class="stage-content"><p class="none">' +
          '후반에 할 일이 계획에 아직 없습니다 — 구성·각본 단계에서 정합니다.</p></div>';
      }
      var left = list.filter(function (x) { return x.unresolved; });
      return '<div class="stage-content post-work">' +
        '<div class="pw-head"><b>뽑은 뒤 보내기 전에 하는 일 ' + list.length + '가지</b>' +
        '<span>전부 사람 손입니다 · 크레딧 0</span></div>' +
        (left.length
          ? '<div class="pw-open"><b>아직 안 정해진 것 ' + left.length + '건</b>' +
            left.map(function (x) {
              return "<span>" + esc(x.what) + " — " + esc(x.unresolved) + "</span>";
            }).join("") + "</div>"
          : "") +
        '<ol class="pw-list">' + list.map(function (x) {
          return "<li><b>" + esc(x.what) + "</b>" +
            '<em class="who">' + esc(x.who === "human" ? "사람 손"
              : x.who === "ai" ? "AI" : "AI + 사람") + "</em>" +
            (x.how ? '<span class="how">' + esc(x.how) + "</span>" : "") +
            (x.why ? '<span class="why">' + esc(x.why) + "</span>" : "") +
            (x.unresolved ? '<span class="open">★ 안 정해짐 — ' +
              esc(x.unresolved) + "</span>" : "") + "</li>";
        }).join("") + "</ol>" +
        // 후반 단계의 「누가 맡습니까」는 단계 머리(execPicker 자리)가 이미 그린다 — 여기서
        //   또 그리면 두 번 뜬다 (Dan 09-23: 「맨위랑 맨아래 두개가 뜬다」).
        "</div>";
    }

    function materialList(p) {
      var m = (p.files || []).filter(isMaterial);
      if (!m.length) return "";
      return '<div class="said"><span class="lbl">제작 재료 ' + m.length + '개 — 광고주 자료를 우리가 가공한 것</span><div class="client-files">' +
        m.map(function (f) {
          return '<figure>' + (f.url ? '<img src="' + esc(f.url) + '" loading="lazy" data-big="' + esc(f.url) + '" data-kind="img" alt="">' : "") +
            '<figcaption>' + esc(f.role || "") + (f.approved ? " · 승인됨" : "") + '</figcaption>' +
            (!f.approved && canWrite
              ? '<div class="lc"><button class="btn" type="button" data-lc="approve-anchor" data-asset="' + esc(f.id) +
                '" data-slug="' + esc(p.slug) + '" data-step="' + esc(p.step) + '">제품 기준으로 승인</button><span class="lc-msg" data-lc-msg></span></div>'
              : "") + '</figure>';
        }).join("") + "</div></div>";
    }

    function paidStageBody(p, step) {
      var here = p.step === step;
      var buttons = "";
      if (here) {
        var act = SE().actions(p, step, !!(p.stageResults && p.stageResults[step]));
        buttons = paidBody(p, step, act);
      }
      return buttons + readyNote(p, step) + doneNote(p, step) + askNote(p, step) +
        blockedNote(p, step) + assetList(p, step);
    }

    // ★ 준비물이 나오면 **화면이 말한다.** 내가 말해 드리는 게 아니다
    //   (Dan 2026-09-22: 「앵커나오면 보고가아니라 화면이 바뀌어야하는거아냐?」).
    //
    //   영상보다 먼저 만드는 것(소품 앵커 같은 것)이 있다. 그게 나오면 작업기는
    //   거기서 멈추는데, 화면이 그 사실을 말하지 않으면 사장님은 무엇을 보고
    //   무엇을 눌러야 하는지 알 수 없다. 그림을 그 자리에 세우고, 다음에
    //   무엇이 일어나는지 값과 함께 적는다.
    function readyNote(p, step) {
      if (step !== "video") return "";
      var pick = SE().of(p, step) || {};
      var mark = pick.approved_at || pick.revision_at;
      // 이 단계가 쓰는 준비물 = 계획의 needs 중 우리가 뽑은 것(anchor)
      var plan = (p.render_plan || {}).calls || [];
      var wants = 0;
      plan.forEach(function (c) {
        (c.needs || []).forEach(function (n) { if (n.kind === "anchor") wants += 1; });
      });
      if (!wants) return "";
      var got = (p.files || []).filter(function (f) {
        if (f.kind !== "anchor" || !f.url || isMaterial(f)) return false;
        var made = f.created_at || (f.meta || {}).made_at;
        return !!made && (!mark || String(made) > String(mark));
      }).sort(function (x, y) {
        return String(x.created_at) < String(y.created_at) ? 1 : -1;
      });
      if (!got.length) return "";
      var f = got[0];
      var m = f.meta || {};
      // ★ 그 준비물로 **이미 영상을 뽑았으면** 지난 소식이다. 09-22 에 나온
      //   소품 앵커 알림이 v3·v4·v5 를 뽑은 뒤에도 영상 단계에 계속 떠 있었다
      //   (Dan 2026-09-23: 「이게 영상 제작세션에 계속떠잇을이유가잇나?」).
      if (usedAfter(p, step, f.created_at)) return "";
      return '<div class="ready"><b>영상에 물릴 준비물이 나왔습니다</b>' +
        '<span class="when">' + esc(when(f.created_at)) + " · " + esc(ago(f.created_at)) +
        (m.credits ? " · " + m.credits + " 크레딧" : "") + "</span>" +
        '<img src="' + esc(f.url) + '" alt="' + esc(f.role || "준비물") +
        '" loading="lazy" data-big="' + esc(f.url) + '">' +
        '<span class="what"><b>' + esc(f.role || "준비물") + "</b>" +
        (m.why ? " — " + esc(m.why) : "") + "</span>" +
        '<span class="next">이것을 보시고 괜찮으면 <b>다시 뽑기</b>를 눌러 영상을 뽑습니다. ' +
        "여기서 걸리는 게 있으면 눌러서 크게 보시고 말씀해 주십시오 — " +
        "영상을 뽑은 뒤에는 이 물건을 못 바꿉니다.</span></div>";
    }

    // 지나간 유료 단계 — 언제 승인했는지 한 줄. 이게 없으면 그림만 남아서
    // 「이거 승인한 건가」를 다시 헷갈린다.
    function doneNote(p, step) {
      if (p.step === step) return "";
      var at = (SE().of(p, step) || {}).approved_at;
      if (!at) return "";
      var want = stageKinds(step);
      var more = (p.files || []).filter(function (f) {
        var made = f.created_at || (f.meta || {}).made_at;
        return want.indexOf(f.kind) >= 0 && made && String(made) > String(at);
      }).length;
      return '<div class="done-note"><b>승인 완료</b>' +
        '<span class="at">' + esc(when(at)) + " · " + esc(ago(at)) + "</span>" +
        (more ? '<span class="at more">그 뒤 보충 ' + more +
          "장 — 모자란 것을 더했습니다. 승인은 그대로입니다</span>" : "") +
        "</div>";
    }

    // 물어볼 것이 남아 있다 — **누가 정할 것인지가 먼저다.**
    //
    // 제작 판단은 우리 것이다 (Dan: 「이런건 나한테 묻는게아니라 ai 니네가
    // 한거니까 니네가 맞춰서 하는거지」). 그래서 ASK 는 기본이 우리 몫이고,
    // 화면에는 **그 사실만** 알린다. Dan 이 눌러야 하는 것은 광고주의 사실
    // 관계(제품 진실·의무 표기·브랜드)일 때뿐이다.
    //
    // ASK 가 열려 있으면 다음 유료 생성이 DB 에서 막힌다 (034). 화면이 조용히
    // 있으면 「왜 안 나가지」가 되므로 멈춘 이유를 여기 적는다.
    function askNote(p, step) {
      // ★ **가장 새 판만** 본다. 그리고 영상은 판 카드에 검수가 이미 나오므로
      //   우리 몫이면 위에 또 띄우지 않는다 — v5 검수가 두 번 떴다
      //   (Dan 2026-09-23: 「이거 2개는 왜 계속 떠잇는거냐」).
      var asked = newestTakes(p, step).filter(function (f) {
        return ((f.meta || {}).review || "") === "ask";
      });
      if (!asked.length) return "";
      var m = asked[0].meta || {};
      var who = m.ask_who || "us";
      var mine = who === "us";
      if (mine && step !== "anchors") return "";
      return '<div class="ask-note' + (mine ? " ours" : "") + '">' +
        "<b>" + (mine ? "정해야 할 것이 있어 멈춰 있습니다"
                      : "정해 주셔야 다음으로 갑니다") + "</b>" +
        (m.asks ? '<span class="n">' + m.asks + "건</span>" : "") +
        (m.why ? '<span class="why">' + esc(m.why) + "</span>" : "") +
        '<span class="who">검토 · ' + esc(m.reviewer || "독립 검토") +
        (mine ? " · 제작 쪽에서 정합니다" : " · 사장님께서 정하실 부분입니다") +
        "</span>" +
        (mine ? "" :
          '<div class="ask-form"><textarea data-ask-note="' + esc(p.slug) +
          '" rows="2" placeholder="무엇으로 정하는지 적어 주십시오 — 다음 판정의 근거가 됩니다"></textarea>' +
          '<button class="btn" type="button" data-ask-answer="' + esc(p.slug) +
          '">이렇게 정합니다</button>' +
          '<span class="msg" data-ask-msg="' + esc(p.slug) + '"></span></div>') +
        "</div>";
    }

    // 검수에서 걸려 다시 만드는 중이라는 것은 **숨기지 않는다.** 숨기면
    // 화면이 비어 보이고, 비어 보이면 「멈췄나」가 된다.
    function blockedNote(p, step) {
      // ★ **가장 새 판만** 본다. 전에는 모든 판에서 찾아서, v5 가 나온 뒤에도
      //   v4 의 옛 판정이 「다시 만들고 있습니다」로 떠 있었다 — 사실도 아니었다.
      //   영상은 판 카드에 판정이 나오므로 위에 또 띄우지 않는다.
      if (step !== "anchors") return "";
      var bad = newestTakes(p, step).filter(function (f) {
        return ((f.meta || {}).review || "") === "blocked";
      });
      if (!bad.length) return "";
      var m = bad[0].meta || {};
      return '<div class="blocked-note"><b>검수에서 걸려 다시 만들고 있습니다</b>' +
        (m.critical ? '<span class="n">치명 ' + m.critical + "건</span>" : "") +
        (m.why ? '<span class="why">' + esc(m.why) + "</span>" : "") +
        '<span class="who">검토 · ' + esc(m.reviewer || "독립 검토") + "</span></div>";
    }

    // 만든 것 — 승인은 **보고** 하는 것이다. 볼 것이 없으면 승인이 형식이 된다.
    //
    // 세 가지를 지킨다:
    //   · 순서대로 — 컷 번호 순. 번호가 없는 것(시트 같은 것)은 뒤로.
    //   · 눌러서 크게 — 앵커는 라벨 글자와 그림자를 보고 판정하는 물건이라
    //     작은 칸에서는 판정이 안 된다.
    //   · 각각 설명 — 무엇이고 왜 만들었는지. 그게 없으면 보고도 판단이 안 된다.
    /** 같은 자리를 덮는 더 새 판이 있는가. 있으면 이건 지난 판이다. */
    function replacedLater(p, want, f) {
      var call = (f.meta || {}).covers_call || "";
      if (!call) return false;           // 어느 자리인지 모르면 건드리지 않는다
      return (p.files || []).some(function (g) {
        return g.id !== f.id && want.indexOf(g.kind) >= 0 &&
          ((g.meta || {}).covers_call || "") === call &&
          String(g.created_at || "") > String(f.created_at || "");
      });
    }

    function assetList(p, step) {
      var want = stageKinds(step);
      // ★ 판을 **버전으로 쌓는다.** 「이전 판 1개」가 아니라 v1·v2·v3… 이다 —
      //   앞으로 더 나올 것이고, 무엇이 언제 왜 나왔는지 다 남아야 견줄 수 있다
      //   (Dan 2026-09-22: 「버전을 붙여서 예전것들은 계속 쌓여서 볼수잇게」).
      //   만든 차례가 곧 버전이다. 지우지 않으므로 번호가 비지 않는다.
      var verOf = {};
      (p.files || []).filter(function (f) { return want.indexOf(f.kind) >= 0; })
        .sort(function (x, y) {
          return String(x.created_at || "") < String(y.created_at || "") ? -1 : 1;
        })
        .forEach(function (f, i) { verOf[f.id] = i + 1; });

      // ★ 자리(covers_call)마다 **새 것부터 몇 번째인가.** 0 = 지금 판, 1 = 직전 판.
      //
      //   Dan 2026-09-23: 「v5가 v4 위로 (아래서부터 순서대로니까) 나오고,
      //   v4제외한 나머지는 저절로 지난버전으로 가야하고」
      //   펼쳐 두는 것은 **지금 판과 그 직전 판** 둘이다 — 무엇이 나아졌는지
      //   견주는 데 필요한 것이 그 둘이다. 그 아래는 사장님 말씀이 붙어
      //   있어도 접는다(접어도 지우지 않는다 — 펼치면 그대로 있다).
      var rank = {};
      var byCall = {};
      (p.files || []).filter(function (f) {
        return want.indexOf(f.kind) >= 0 && (f.meta || {}).covers_call;
      }).forEach(function (f) {
        var c = f.meta.covers_call;
        (byCall[c] = byCall[c] || []).push(f);
      });
      Object.keys(byCall).forEach(function (c) {
        byCall[c].sort(function (x, y) {
          return String(x.created_at || "") > String(y.created_at || "") ? -1 : 1;
        }).forEach(function (f, i) { rank[f.id] = i; });
      });
      /** 정할 것을 줄 판인가. 지금 판이라도 다시 뽑기를 누르신 뒤면 지난 판이다. */
      function unreviewed(f) {
        var m = f.meta || {};
        return step !== "anchors" && rank[f.id] === 0 &&
          (!m.review || m.review === "pending");
      }
      function isPast(f) {
        // ★ 단계를 승인했거나 이미 넘어갔으면 이 단계의 판은 전부 기록이다.
        //   승인 뒤에도 v6 에 의견 저장이 살아 있었다 (Dan 2026-09-23).
        if (p.step !== step || (SE().of(p, step) || {}).approved_at) return true;
        if (rank[f.id] != null && rank[f.id] > 0) return true;
        return superseded(p, step, f);
      }

      // 지금 영상 계획이 참고 이미지로 쓰는 것 — Image 번호까지
      var inPlan = {};
      ((p.render_plan || {}).calls || []).forEach(function (c) {
        (c.image_reference_paths || []).forEach(function (path, k) { inPlan[path] = "Image " + (k + 1); });
      });
      var anyInPlan = Object.keys(inPlan).length > 0;

      var older = [];
      var mine = (p.files || []).filter(function (f) {
        if (want.indexOf(f.kind) < 0) return false;
        // ★ 제작 자료는 **지금 계획에 들어가 있는가**가 기준이다. 빠진 것은 지난 버전.
        //   v1 시작 프레임이 「12초 한 판의 출발점」이라는 옛 설명으로만 떠서 지난 판처럼
        //   보였는데, 실제로는 지금 계획의 Image 1(세트 기준)이다 (09-23).
        if (step === "anchors" && anyInPlan) {
          if (inPlan[f.storage_path]) return true;
          older.push(f);
          return false;
        }
        if (rank[f.id] != null) {
          // ★ 2026-09-23 두 번째 — **새 판 하나만 펼친다.** 나머지는 전부 지난 버전.
          //   Dan: 「새로운 버전 올라오면, 나중 버전은 저절로 지난버전으로 가게
          //   만들고 새로운 버전 하나만 니 의견과 함께 뜨고 의견란뜨는」
          // ★ 그리고 **검수가 붙기 전에는 올리지 않는다.** 영상만 먼저 뜨고
          //   「검수하고 있습니다」가 붙으면 언제까지 기다리란 건지 모른다.
          //   Dan: 「검수결과가 나오고 한꺼번에 올라와야지」
          //   그동안은 버튼 옆에 「몇 시에 나왔고 언제쯤 올라온다」만 적는다.
          if (unreviewed(f)) return false;
          if (rank[f.id] === 0) return true;
          older.push(f);
          return false;
        }
        // ★ **사장님이 말씀을 남긴 판은 접지 않는다.**
        //
        //   v4 가 나오자 v3 가 지난 판으로 접혔다. 그런데 v3 에는 사장님
        //   의견과 그에 대한 답변이 붙어 있다 — 그 대화가 곧 v4 를 만든
        //   근거다. 접으면 **무엇과 견주어 나아졌는지**를 볼 수가 없다.
        //   그리고 둘 다 이미 45크레딧씩 나간 결과물이다. 나간 것은 나란히
        //   보여야 한다 (Dan 2026-09-22: 「v3랑 v4둘다 올려야지」).
        //   → 09-23 부터는 위의 rank 가 맡는다: 지금 판과 직전 판을 펼친다.
        // ★ 고쳐 달라고 하기 전에 만든 것은 접어 둔다. 지우지 않는다 —
        //   무엇이 나아졌는지 견주려면 옛것이 남아 있어야 한다.
        if (superseded(p, step, f)) { older.push(f); return false; }
        // ★ **같은 자리를 덮는 새 판이 있으면 옛 판이다.**
        //   앵커는 영상 단계에서 만들어진다. 그래서 「제작 자료」 단계의
        //   누름 시각으로는 갈리지 않아, 버리고 다시 뽑은 앵커까지 나란히
        //   펼쳐져 있었다 (Dan: 「다 늘어져잇잖아」).
        //   덮는 자리(covers_call)가 같고 더 나중에 만든 것이 있으면 접는다.
        if (replacedLater(p, want, f)) { older.push(f); return false; }
        // ★ 검수에서 걸린 것도 **올린다.** 전에는 감췄는데, 감추면 사장님께는
        //   「치명 1건」이라는 말만 남고 정할 것이 없어진다.
        //   검수는 찾아서 설명하는 일이고 **결정은 사장님이** 하신다
        //   (Dan 2026-09-22: 「업로드 후 검수사항을 명시하고 내가 본다음
        //   결정하게해야지」). 무엇이 걸렸는지는 그 그림 바로 밑에 적는다.
        return true;
      }).sort(function (x, y) {
        var a1 = x.cut_n == null ? 9999 : Number(x.cut_n);
        var b1 = y.cut_n == null ? 9999 : Number(y.cut_n);
        if (a1 !== b1) return a1 - b1;
        // 같은 컷이면 **새 판이 위.** 전에는 여기서 순서가 정해지지 않아
        // v5 가 v4 아래로 갔다.
        return String(x.created_at || "") > String(y.created_at || "") ? -1 : 1;
      });
      older.sort(function (x, y) {
        return String(x.created_at || "") > String(y.created_at || "") ? -1 : 1;
      });
      function oldBox() {
        if (!older.length) return "";
        var why = (SE().of(p, step) || {}).revision_note || "";
        var names = older.map(function (f) { return "v" + verOf[f.id]; }).join(" · ");
        return '<details class="made-old"><summary>지난 버전 ' + names +
          " — 눌러서 펼치면 그대로 보실 수 있습니다</summary>" +
          (why ? '<div class="old-why"><b>고쳐 달라고 적으신 것</b><span>' +
            esc(why) + "</span></div>" : "") +
          // ★ 지난 판에는 **정할 것을 주지 않는다** (아래 draw 의 셋째 인자).
          //   ★★ `.map(one)` 으로 넘기면 안 된다 — map 은 셋째 인자로 **배열**을
          //      주고, 배열은 참이라 지금 판까지 지난 판으로 그려진다.
          '<div class="made" data-made-step="' + esc(step) + '" data-made-old="1">' + older.map(function (f, i) {
            return one(f, i, true);
          }).join("") + "</div></details>";
      }
      if (!mine.length) return oldBox();
      return '<div class="made" data-made-step="' + esc(step) + '"><span class="made-lbl">만든 것 ' + mine.length +
        " (지금 v" + Math.max.apply(null, mine.map(function (f) { return verOf[f.id] || 0; })) +
        ") · 눌러서 크게 · 영상은 두 번 누르십시오</span>" +
        mine.map(function (f, i) { return one(f, i, isPast(f)); }).join("") +
        "</div>" + oldBox();

      // 한 장을 그리는 법. 지금 것과 이전 판이 **같은 함수**를 쓴다 —
      // 두 벌로 두면 한쪽만 고치고 다른 쪽은 그대로 남는다.
      function one(f, i, isOld) {
          var m = f.meta || {};
          var vid = (f.mime || "").indexOf("video/") === 0;
          var facts = [];
          if (m.engine) facts.push(esc(m.engine));
          if (m.credits) facts.push(m.credits + " 크레딧");
          if (m.covers_cuts && m.covers_cuts.length) {
            facts.push("컷 " + m.covers_cuts.join("·") + " 에 쓰입니다");
          }
          var checks = m.checks
            ? '<dl class="made-checks">' + Object.keys(m.checks).map(function (k) {
              return "<dt>" + esc(k) + "</dt><dd>" + esc(m.checks[k]) + "</dd>";
            }).join("") + "</dl>"
            : "";
          return '<figure class="made-one">' +
            '<span class="made-n">v' + (verOf[f.id] || (i + 1)) + "</span>" +
            (f.url
              ? (vid
                ? '<video src="' + esc(f.url) + '" controls preload="metadata" ' +
                  'data-big="' + esc(f.url) + '" data-vid="1"></video>'
                : '<img src="' + esc(f.url) + '" alt="' + esc(f.role || f.kind) +
                  '" loading="lazy" data-big="' + esc(f.url) + '">')
              : '<div class="none">파일을 불러오지 못했습니다</div>') +
            '<figcaption><b>' + esc(f.role || f.kind) +
            (f.cut_n != null ? " · 컷" + f.cut_n : "") + "</b>" +
            // 검수 칸이 같은 문장(m.why)을 이미 보여 주면 여기서는 뺀다 — 두 번 나왔다
            (m.why && !(m.review === "blocked" || m.review === "ask" ||
                        (!isOld && m.review && m.review !== "pending"))
              ? '<span class="why">' + esc(m.why) + "</span>" : "") +
            (inPlan[f.storage_path] ? '<span class="ok">지금 영상에 ' + esc(inPlan[f.storage_path]) +
              " 로 쓰는 중</span>" : "") +
            (m.camera_lock ? '<span class="lock">카메라 고정 — ' +
              esc(m.camera_lock) + "</span>" : "") +
            (facts.length ? '<span class="facts">' + facts.join(" · ") + "</span>" : "") +
            checks +
            (f.approved ? '<span class="ok">승인됨</span>' : "") +
            (m.made_why ? '<span class="madewhy">' + esc(m.made_why) + "</span>" : "") +
            addedLater(p, step, f) +
            verdictOf(f, isOld) +
            "</figcaption></figure>";
      }

      /** ★ 승인 **뒤에** 들어온 자료는 「보충」이라고 말한다.
       *
       *  단계를 되돌리지 않고 자료만 더할 때가 있다. 있던 것이 틀린 게 아니라
       *  **모자랐을 때**다 (Dan 2026-09-22 규칙: 「바꾸는 것이면 되돌아가고,
       *  더하는 것이면 보충한다」). 그때 뒷 단계 승인은 풀지 않는다 — 더한다고
       *  앞 것이 틀려지지 않기 때문이다.
       *
       *  대신 **여기 쌓인다.** 그러지 않으면 이 단계가 「완료」라고 말하면서
       *  실제로는 계속 늘어나는 거짓말을 한다. 그리고 왜 승인 뒤에 한 장이 더
       *  있는지 아무도 모르게 된다. */
      function addedLater(p, step, f) {
        var at = (SE().of(p, step) || {}).approved_at;
        if (!at) return "";
        var made = f.created_at || (f.meta || {}).made_at;
        if (!made || String(made) <= String(at)) return "";
        return '<span class="added"><b>보충</b> — 이 단계를 승인하신 뒤에 ' +
          "모자란 것이 있어 더한 것입니다. 있던 것이 틀린 게 아니라서 " +
          "승인은 그대로 둡니다 · " + esc(when(made)) + "</span>";
      }

      /** 검수에서 걸린 것·물어볼 것이 있는 것에 **무엇이 걸렸는지**를 붙인다. */
      function verdictOf(f, isOld) {
        var m = f.meta || {};
        var v = m.review || "";
        // ★ **지금 판은 검수 결과가 무엇이든 칸을 낸다.**
        //   전에는 「걸렸다·물어볼 것」일 때만 칸을 냈다. 그래서 막 나온 v5
        //   (검수 전 = pending)는 의견도, 적을 칸도 없이 영상만 떴다
        //   (Dan 2026-09-23: 「지금은 그냥 아무것도 안써있고」).
        //   지난 판은 전처럼 걸린 것만 기록으로 남긴다.
        if (v !== "blocked" && v !== "ask" && (isOld || !f.kind || f.kind === "anchor")) return "";
        var head = v === "blocked"
          ? "검수에서 걸렸습니다 · 치명 " + (m.critical || 0) + "건"
          : v === "ask" ? "정해야 할 것 " + (m.asks || 0) + "건"
          : (!v || v === "pending") ? "검수하고 있습니다 — 끝나면 여기에 검수와 제작 쪽 의견이 붙습니다"
          : "검수 통과 — 치명적인 것은 없습니다";
        return '<div class="verdict v-' + esc(v || "pending") + '">' +
          "<b>" + head + "</b>" +
          (m.why ? '<span class="what">' + esc(m.why) + "</span>" : "") +
          (m.dropped ? '<details class="kept"><summary>안 잡은 것과 그 이유</summary>' +
            "<span>" + esc(m.dropped) + "</span></details>" : "") +
          '<span class="who">검토 · ' + esc(m.reviewer || "독립 검토") + "</span>" +
          // ★ 검수는 「무엇이 걸렸나」까지다. 그다음 「그래서 어떻게 하는 게
          //   좋겠나」는 만드는 쪽이 말해야 한다 (Dan 2026-09-22: 「검수사항 및
          //   너의의견 … 같이 써놓고」). 판정만 있고 의견이 없으면 사장님이
          //   혼자 값을 저울질하시게 된다.
          (m.my_take
            ? '<div class="mytake"><b>제작 쪽 의견</b><span>' +
              esc(m.my_take) + "</span></div>"
            : "") +
          // 사장님이 보시고 적어 주신 것도 같은 자리에 남긴다 — 다음 판을
          // 만들 때 이 말이 근거가 된다
          (m.dan_take
            ? '<div class="mytake dan"><b>사장님 의견</b><span>' +
              esc(m.dan_take) + "</span></div>"
            : "") +
          /* ★ **적을 자리가 있어야 적으신다.**
           *
           *  사장님 의견을 보여 주는 칸은 만들어 놓고 **쓰는 칸을 안 만들었다.**
           *  그래서 「다시 뽑기 누르기전에 의견쓰는부분이 없네 두군데
           *  지적하려고햇는데」가 나왔다 (2026-09-22).
           *
           *  누르기 **전에** 적을 수 있어야 한다. 적어 주신 말이 다음 판의
           *  근거가 되는데, 뽑은 뒤에 적으면 이미 그 말 없이 뽑힌 것이다.
           *  저장은 생성과 완전히 따로 돈다 — 이 버튼은 돈을 쓰지 않는다. */
          /* ★ 지난 판에는 **정할 것을 주지 않는다.**
           *
           *  판정과 그때 적어 주신 말은 남긴다 — 왜 이 판을 버렸는지가
           *  다음 판의 근거이기 때문이다. 하지만 **쓰는 칸과 「보시고
           *  정하십시오」는 뺀다.** 이미 지나간 판을 두고 정할 것은 없다.
           *
           *  Dan 2026-09-22: 「v2가 아래로 내려가긴햇는데 의견 쓰는부분이
           *  여전히 잇고 버튼도 동작해」 — 접어 두기만 하고 그 안의 것을
           *  그대로 둔 것이 잘못이다. 접힌 것은 **기록**이지 할 일이 아니다. */
          // ★ 승인한 판을 「버린 판」이라고 적고 있었다 (09-23 화면 점검 — v6).
          (isOld && (SE().of(p, step) || {}).approved_at && rank[f.id] === 0
            ? '<span class="call gone">승인한 판입니다 — 이 판으로 다음 단계를 진행합니다.</span></div>'
            : isOld
            ? '<span class="call gone">지난 판입니다 — 여기서 정하실 것은 ' +
              "없습니다. 왜 이 판을 버렸는지 남겨 둔 것입니다.</span></div>"
            : danTakeBox(f, m) +
              // 의견이 걸린 판은 아래 「정하기」까지가 할 일이다 — 「승인 또는 …」 안내를 또 붙이지 않는다
              (m.dan_take ? "</div>" :
              f.kind === "final"
                // 후반 완성본은 다시 만들어도 크레딧이 안 든다 (ffmpeg)
                ? '<span class="call">괜찮으면 위의 <b>승인</b> · 고칠 점은 이 <b>의견 칸</b>에 — ' +
                  "답을 달고, 정하시면 다시 만듭니다(크레딧 없음).</span></div>"
                : '<span class="call">보시고 정하십시오 — <b>다시 뽑기</b>' +
                  "(값이 또 나갑니다) 또는 <b>이대로 승인</b>.</span></div>"));
      }

      /** 의견 → 답변 → 결정. **이 순서가 곧 잠금이다.**
       *
       *  Dan 2026-09-22: 「그냥 일방적으로 내가 말한거 그대로 하는게 아니라
       *  의견에 대한 너의 답변을 피드백 달고 뭔가 결정 난다음 재생성하는
       *  단계가있으면 좋겟음 그 절차를 칸안에 넣어주라」
       *
       *  전에는 셋이 각각 다른 곳에 있었다 — 의견은 화면에, 답변은 채팅에,
       *  계획 변경은 DB 에. 나중에 「그때 왜 그렇게 정했나」를 되짚으려면
       *  세 군데를 맞춰 봐야 했다. 한 칸에 모은다. */
      function danTakeBox(f, m) {
        if (!canWrite) return "";
        var take = m.dan_take || "";
        var reply = m.our_reply || "";
        var settled = !!m.settled_at;

        // ① 아직 아무 말씀도 없을 때 — 적는 칸만
        if (!take) return writeBox(f, m, false);

        // ② 적으셨는데 답변이 아직일 때 — 다시 뽑기는 잠겨 있다
        if (!reply) {
          return '<div class="thread">' + threadStep(1, "사장님 의견", "done") +
            arrow() + threadStep(2, "제작 쪽 답변", "now") + arrow() +
            threadStep(3, "정하기", "wait") +
            // ★ 시작 시각과 끝날 때쯤을 적는다 — 없으니 「안 돌고 있다」로 보였다(09-23 Dan)
            '<p class="thread-now"><b>답변 쓰는 중' +
            (m.dan_take_at ? " · " + esc(hhmm(m.dan_take_at)) + " 시작 · " +
              esc(hhmm(m.dan_take_at, 6)) + " 쯤 붙습니다" : "") + '</b>' +
            "<span>끝나면 이 화면에 저절로 뜹니다(새로고침 필요 없음). " +
            "그때까지 다시 뽑기는 잠겨 있습니다.</span></p>" +
            writeBox(f, m, true) + "</div>";
        }

        // ③ 답변이 붙었고 아직 안 정하셨을 때 — 여기서 정하신다
        if (!settled) {
          return '<div class="thread">' + threadStep(1, "사장님 의견", "done") +
            arrow() + threadStep(2, "제작 쪽 답변", "done") + arrow() +
            threadStep(3, "정하기", "now") +
            '<div class="mytake reply"><b>제작 쪽 답변' +
            (m.our_reply_at ? " · " + esc(when(m.our_reply_at)) : "") +
            "</b><span>" + esc(reply) + "</span></div>" +
            '<p class="thread-now"><b>이 답변대로 가시겠습니까.</b>' +
            "<span>괜찮으시면 아래를 누르십시오. 그때 다시 뽑기가 열립니다. " +
            "아니면 의견을 더 적어 주십시오 — 다시 답을 답니다.</span></p>" +
            '<button class="btn" data-take-settle="' + esc(f.id) + '">' +
            "이 답변대로 갑니다</button>" + writeBox(f, m, true) + "</div>";
        }

        // ④ 정해졌다 — 이제 다시 뽑기가 열린다
        return '<div class="thread settled">' + threadStep(1, "사장님 의견", "done") +
          arrow() + threadStep(2, "제작 쪽 답변", "done") + arrow() +
          threadStep(3, "정하기", "done") +
          '<div class="mytake reply"><b>제작 쪽 답변</b><span>' +
          esc(reply) + "</span></div>" +
          (planAfter(p, m)
            ? '<p class="thread-ok"><b>반영 완료 · ' +
              esc(when(p.render_mode_at)) + "</b><span>정해 주신 대로 제작 " +
              "문장을 고쳤습니다. 이제 <b>다시 뽑기</b>를 누르시면 바뀐 문장으로 " +
              "뽑습니다. 누르시면 값이 나갑니다.</span></p>"
            : '<p class="thread-now"><b>프롬프트에 반영하는 중입니다</b><span>' +
              "정하신 것은 " + esc(when(m.settled_at)) + " 에 기록했습니다. " +
              "지금 제작 문장을 고치고 있고, 끝나면 여기에 <b>무엇이 어떻게 " +
              "바뀌었는지</b> 적습니다. 그때까지 다시 뽑기는 잠급니다.</span></p>") +
          writeBox(f, m, true) + "</div>";
      }

      // ★★ 이름을 threadStep 으로 둔다. 처음에 `step` 이라고 지었다가
      //   **감싸는 assetList(p, step) 의 매개변수를 가려 버렸다.**
      //   함수 선언은 같은 스코프의 매개변수를 덮어쓴다. 그래서 step 이
      //   "video" 대신 이 함수가 됐고, 그 순간
      //     · superseded(p, step, f) 가 늘 거짓 → 지난 판이 되살아나고
      //     · want = step === "anchors" 가 늘 거짓 → 제작 자료 칸에 영상이 떴다
      //   화면은 멀쩡해 보였고 시험 210개도 다 통과했다. 코드를 읽어서는 못
      //   찾았고, 화면에 「이 목록을 그린 step 이 무엇이냐」를 박아 물어보고서야
      //   나왔다 (checks/where_boxes.cjs).
      /** 정하신 **뒤에** 계획이 고쳐졌는가. 두 곳이 같은 판단을 써야 한다. */
      function planAfter(p, m) {
        return !!(m.settled_at && p.render_mode_at &&
          new Date(p.render_mode_at) > new Date(m.settled_at));
      }

      function threadStep(n, label, state) {
        return '<span class="thread-step s-' + state + '"><b>' + n + "</b>" +
          esc(label) + "</span>";
      }
      function arrow() { return '<span class="thread-arrow">→</span>'; }

      /** 적는 칸. 답변이 오간 뒤에는 「더 적기」로 접어 둔다. */
      function writeBox(f, m, folded) {
        var has = !!m.dan_take;
        var inner = '<div class="takebox" data-take-form>' +
          (folded ? "" : "<b>의견 적기 — <i>적고 저장하신 뒤에 누르십시오. " +
            "저장만으로는 값이 나가지 않습니다</i></b>") +
          '<textarea data-take-text rows="3" placeholder="' +
          "무엇이 잘못됐는지, 어떻게 했으면 하는지 적어 주십시오. " +
          '여러 건이면 줄을 나눠 적으셔도 됩니다.">' +
          esc(m.dan_take || "") + "</textarea>" +
          '<button class="ghost" data-take-save="' + esc(f.id) + '">' +
          (has ? "고쳐 저장" : "의견 저장") + "</button></div>";
        if (!folded) return inner;
        // ★ 고쳐 저장하면 답변과 결정이 풀린다 — DB 가 그렇게 한다(052).
        //   여기서도 그 사실을 미리 말해 둔다.
        return '<details class="take-more"><summary>의견 더 적기 · 고쳐 쓰기' +
          " — 고쳐 저장하면 답변과 결정이 풀리고 다시 답을 답니다</summary>" +
          inner + "</details>";
      }
    }

    var stageBodies = {
      // ★ 「AI 제작 시작」을 여기 놓는다.
      //
      //   productionAction 은 brief 를 위해 계산되는데(1188~1199줄), 실제로
      //   그려지는 자리는 **콘티와 납품 두 곳뿐**이었다. 그래서 새 의뢰가
      //   들어오면 의뢰 접수 칸에 「누가 맡습니까 · 저장」만 보이고, 그걸
      //   누르면 담당만 적히고 **아무 일도 안 일어났다.**
      //
      //   Dan 2026-09-22: 「환타 광고 새의뢰 들어와서 의뢰접수 AI진행 저장
      //   눌럿는데 버튼만 눌리고 아무일도없어」 — 누를 것이 그것뿐이었으니
      //   그걸 누르신 것이 맞다. 없던 것은 다음으로 보내는 버튼이다.
      brief: '<div class="stage-content">' + said + requirements + clientReplies(p) + clientFiles(p) +
        (p.step === "brief" ? productionAction : "") + '</div>',
      // 기획 두 갈래(074) — 전략·콘셉트 칸에도 「누가 맡습니까」를 그 칸 안에 그린다
      // 광고주 자료를 우리가 정리한 기준(제작 재료)도 여기서 본다 — 기획·콘티·영상이 이걸 기준으로 쓴다 (Dan 09-24)
      facts: factsBody + materialList(p) + (p.step === "facts" ? '<div class="plan-wrap">' + productionAction + "</div>" : ""),
      strategy: strategyBody + (p.step === "strategy" ? '<div class="plan-wrap">' + productionAction + "</div>" : ""),
      concepts: (p.step === "concepts" && !(p.concepts && p.concepts.length) ? '<div class="plan-wrap">' + productionAction + "</div>" : "") + conceptReview +
        (p.step === "concepts" && p.state === "pending" && (!(p.concepts && p.concepts.length) || canWrite) ? "" : check),
      develop: (p.step === "develop" ? '<div class="plan-wrap">' + productionAction + "</div>" : "") + developBody,
      // 새 흐름이 도는 동안에는 「컷 설계 보기」 링크를 띄우지 않는다 —
      // 검수할 컷 목록이 바로 아래 펼쳐져 있는데 같은 곳으로 가는 링크가 또 있으면
      // 어느 쪽이 본 자리인지 모르게 된다.
      storyboard: costLine(p, "storyboard") +
        (boardFlow ? "" : boardLink(BOARD_REVIEW_STAGE)) + storyboardBody +
        (p.step === BOARD_REVIEW_STAGE ? productionAction : ""),
      // 제작 자료는 **돈이 나가는 첫 자리**다. 무엇을 근거로 시작하는지를
      // 그 자리에 적는다 — 광고주 승인이 그 근거다.
      // 유료 단계는 자기 본문을 갖는다. 「현재 절차에 따라 진행 중입니다」는
      // 아무것도 말해 주지 않는 문장이었고, 그 아래엔 누를 것이 없었다.
      // 조건을 뺐다 — paidStageBody 가 안에서 「누를 것」만 가린다.
      // 여기서 통째로 가리면 승인한 뒤 만든 것이 사라진다.
      anchors: costLine(p, "anchors") + materialList(p) + paidStageBody(p, "anchors"),
      video: costLine(p, "video") + paidStageBody(p, "video") + (p.step === "video" ? backBox(p) : ""),
      // ★ 납품에는 **이 건 원가 합계**를 둔다. 광고 한 편에 얼마가 드는지
      //   모르면 서비스 가격을 정할 수 없다.
      // 후반 — 계획에 적힌 할 일을 그대로 세운다. 여기서 지어내지 않는다.
      // 후반 계획은 AI 에게 맡긴 뒤에 보인다 — 고르기 전에 떠 있으면 이미 정해진 것처럼 읽힌다
      //   (Dan 09-23: 「후반에서 입힐것은 ai한테 맞겻을때 하는건데 아래 계속떠잇네?」)
      // 후반 계획은 **AI 로 진행할 때의 계획**이다. 사람(요청사항)이면 요청이 반영된 뒤에만
      //   「요청사항대로 입힐 것」으로 보인다 (Dan 09-23: 「후반에서 입힐 것은 ai가 할경우에만
      //   해당되는거아냐?」). 고르기 전에는 아무것도 안 보인다.
      // 후반은 계획 아래에 **올라온 완성본**(검수·의견 칸 포함)을 붙인다 — 전에는 승인
      //   버튼만 있고 영상이 없었다 (09-23 15:26)
      post: postFor(p) + (p.step === "post" || (SE().of(p, "post") || {}).approved_at
        ? assetList(p, "post") : "") + (p.step === "post" ? backBox(p) : ""),
      // 한 칸으로 묶어 위에서 아래로 쌓는다 — 원가 → 완성본 → 보내기 → 되돌리기 (격자 두 칸에 흩어져 나란히 섰다)
      deliver: '<div class="deliver-wrap">' + totalLine(p) + (p.step === "deliver" ? deliverBody(p) : "") + "</div>"
    };

    var openProject = isNew || p.aiNeedsReview || !!p.job || (p.state !== "done" && p.step !== "deliver");
    return '<details class="wrk project-fold' + (isNew ? " fresh" : "") + '"' +
      (openProject ? " open" : "") + '>' +
      '<summary class="project-summary"><div>' +
      '<div class="name">' + (isNew ? '<span class="new">NEW</span>' : "") +
      (p.brand && p.product ? '<span class="brand-name"><em>브랜드</em>' + esc(p.brand) + '</span>' : "") +
      '<strong class="product-name">' + esc(p.product || p.brand || p.slug) + '</strong></div>' +
      '<div class="meta">' + esc(p.slug) + " · " + p.running_sec + "초 · " +
      esc((p.aspects || []).join("/")) +
      (p.created_at ? " · " + ago(p.created_at) : "") + "</div>" +
      '</div><div class="project-summary-side"><span class="project-stage ' + (p.state === "done" ? "closed st-done" : p.state === "ready" ? "st-fix" : "st-run") + '">' +
      (p.state === "done" ? "완료 · " + esc(p.closed_at ? new Date(p.closed_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10).slice(5).replace("-", "/") : "") +
        " · " + spentAll(p) + "cr" + won(spentAll(p)) : esc(STEP_NAME[p.step] || p.step)) + '</span><span class="fold-icon" aria-hidden="true">⌄</span></div></summary>' +
      // ★ 카드 맨 위에는 단계와 무관한 것만 둔다. 「콘티 검수」가 여기 있으면
      //   어느 단계의 일인지 알 수 없고, 바로 아래에 콘셉트 5안이 오므로 그
      //   단계의 버튼처럼 읽혔다. 링크는 콘티 승인 단계 본문 안으로 옮겼다.
      '<div class="project-body"><div class="ways project-ways">' +
      '<a class="btn ghost" href="' + esc(siteUrl(p.slug)) +
      '" target="_blank" rel="noopener">광고주 화면 ↗</a></div>' +
      // ★ 광고주가 무엇을 언제 정했는지는 **카드를 열자마자** 보여야 한다.
      //   단계 안에 숨겨 두면 흐름을 펼쳐야 보이고, 그때는 이미 늦다.
      clientSaid + stoppedLine(p) + freshLine(p) + redo + who +
      '<div class="mailbox" id="mail-' + esc(p.slug) + '" hidden></div>' + messageBox(p) +
      flow(p, stageBodies) + "</div></details>";
  }

  // ── 새로 올라온 것을 알아차리게 한다 ────────────────────────────────────
  //
  // 두 겹이다. 하나만으로는 각자 새는 데가 있다 —
  //   · 30초마다 다시 읽기: 화면을 열어 둔 동안 저절로 바뀐다.
  //     닫아 뒀던 동안은 못 본다.
  //   · 「안 본 것」 표시: 닫아 뒀다 열어도 무엇이 새로 생겼는지 보인다.
  //     열어 둔 채로는 갱신되지 않는다.
  // 브라우저 팝업은 쓰지 않는다 — 권한을 물어야 하고, 탭이 살아 있어야 하고,
  // 한 번 거절하면 조용히 안 온다. 화면 안에서 보이는 것이 확실하다.
  var SEEN_KEY = "onecue.admin.seen";

  // 아직 관리자에게 「결과」로 올릴 수 없는 것 — 검수에서 걸렸거나(blocked),
  // 정해야 할 것이 남았거나(ask). 판단이 한 곳에만 있어야 화면 여러 군데가
  // 서로 다른 말을 하지 않는다.
  //
  // ★ 여기가 **바깥 자리**여야 한다. 처음엔 card() 안에 두고 load() 에서
  //   불렀는데, 범위가 달라서 render 가 ReferenceError 로 죽었다. 그런데
  //   그 오류가 load() 의 catch 로 떨어져 화면에는 「불러오지 못했습니다」만
  //   떴다 — 조회가 실패한 것처럼 보였다. 아래 catch 도 같이 고쳤다.
  // ★ 수정 요청 **전에** 만든 것은 「지금 것」이 아니다.
  //
  //   다시 뽑기를 누른 뒤에도 옛 영상이 결과로 세어져서, 화면이 바로
  //   「영상을 검수해 주세요 · 승인」을 내밀었다. 그걸 누르면 **고쳐 달라고
  //   한 그 영상을 승인**하게 된다 (Dan 2026-09-22: 「예전 자료로 승인되면
  //   안되니까」). 작업기도 같은 이유로 「이미 있다」고 보고 다시 안 뽑았다.
  //
  //   지우지는 않는다 — 비교할 것이 있어야 하므로 「이전 판」으로 접어 둔다.
  //   칸을 새로 만들지 않고 **만든 시각과 수정 요청 시각을 견준다.**
  //   따로 적어 두는 칸은 적기를 잊으면 틀리는데, 시각은 늘 맞다.
  function superseded(p, step, f) {
    var pick = SE().of(p, step) || {};
    // ★ 기준선은 **가장 최근에 누르신 시각**이다.
    //
    //   전에는 수정 요청 시각만 봤다. 그래서 다시 뽑기를 누르신 뒤에도
    //   직전 판(수정 요청 **뒤에** 만든 것)이 여전히 「지금 것」으로 남았고,
    //   화면이 곧바로 「검수해 주세요 · 승인」을 다시 내밀었다.
    //   그걸 누르면 **다시 뽑아 달라고 하신 바로 그 판을 승인**하게 된다
    //   (Dan 2026-09-22: 「다시 뽑기 눌럿어. 근데 여전히 승인 버튼이 바로뜬다」).
    //
    //   누르신 것 자체가 「이것 말고 새 것」이라는 뜻이므로, 누른 시각보다
    //   먼저 만든 것은 전부 지난 버전이다. 시작 기록이 없을 때만 수정 요청
    //   시각으로 돌아간다.
    //   ★ 051 — 기준선은 **pressed_at** 이다. started_at 은 일이 끝나면
    //     지워지므로(046 의 stage_pause), 그것만 보면 화면을 놓아 드리는
    //     순간 기준선이 옛 수정 요청 시각까지 밀린다. 그러면 그 사이에 만든
    //     **지난 판들이 전부 「지금 판」으로 되살아난다.** 실제로 그랬다 —
    //     2판(14:29, 걸림)과 3판(16:16)이 나란히 떠서 어느 것이 지금 것인지
    //     알 수 없었다 (Dan 2026-09-22).
    var at = pick.pressed_at || pick.started_at || pick.revision_at;
    if (!at) return false;
    var made = f.created_at || (f.meta || {}).made_at;
    return !!made && String(made) < String(at);
  }

  // ★ 걸린 것도 **결과다.** 결과로 안 세면 승인 버튼이 아예 안 떠서,
  //   사장님께 남는 선택이 「다시 뽑기」뿐이 된다. 그건 검수가 결정까지
  //   하는 것이다. 검수는 찾아서 설명하고, **고르는 것은 사장님**이다.
  //   무엇이 걸렸는지는 그림 바로 밑에 크게 적으므로 모르고 누르실 일은 없다.
  /** 우리가 광고주 자료를 가공해 만든 제작 재료(meta.material) — 광고주 자료로도, 이 단계의 판으로도 세지 않는다 (Dan 09-24) */
  function isMaterial(f) {
    return !!(f && f.meta && f.meta.material);
  }

  function held(f) {
    return false;
  }

  function lastSeen() {
    try { return localStorage.getItem(SEEN_KEY) || ""; } catch (e) { return ""; }
  }
  function markSeen(when) {
    try { if (when) localStorage.setItem(SEEN_KEY, when); } catch (e) { /* 사생활 모드 */ }
  }

  /** 마지막으로 본 뒤에 올라온 것. 내가 만든 것도 포함한다 — 그게 알릴 것이다. */
  function freshFiles(p) {
    var since = lastSeen();
    return (p.files || []).filter(function (f) {
      if (((f.meta || {}).review || "") === "blocked") return false;
      var at = f.created_at || (f.meta || {}).made_at;
      return !!at && (!since || String(at) > since);
    });
  }

  function newestStamp() {
    var top = "";
    ROWS.forEach(function (p) {
      (p.files || []).forEach(function (f) {
        var at = f.created_at || "";
        if (at > top) top = at;
      });
    });
    return top;
  }

  /** 카드 맨 위 한 줄 — 마지막으로 본 뒤에 무엇이 올라왔는지. */
  /** 작업기가 멈췄다 — 어디서 · 왜 · 무엇을 누르면 다시 도는지 (Dan 09-24 「너한테 말 안 걸고 자동으로」) */
  var WORKER_NAME = { facts_writer: "제품·자료 확인", board_maker: "콘티 그림", order_writer: "영상 오더 작성",
    plan_writer: "기획 초안" };
  function stoppedLine(p) {
    var e = p.stopped;
    if (!e) return "";
    var pl = e.payload || {};
    return '<div class="client-said revise worker-stop"><b>작업기가 멈췄습니다 — ' +
      esc(WORKER_NAME[pl.worker] || pl.worker || "작업기") + "</b>" +
      '<span class="at">' + esc(when(e.ts)) + "</span>" +
      '<span class="said">' + esc(pl.why || "") + "</span>" +
      (pl.job && canWrite
        ? '<button class="btn ghost" type="button" data-retry-job="' + esc(pl.job) + '" data-retry-pid="' + esc(p.id) +
          '" data-retry-worker="' + esc(pl.worker || "") + '">다시 돌리기</button>'
        : '<span class="said">' + (pl.worker === "order_writer" ? "비트가 바뀌면 다시 씁니다 — 세 번 실패하면 멈춥니다" : "") + "</span>") +
      "</div>";
  }

  /** 콘티 그림에 「수정 요청」(그림·완성 콘티)을 한 시각 — 그 전에 그린 시트·조각은 지난 판이다 (09-24) */
  function boardRedoAt(p) {
    return (p.reviews || []).filter(function (r) {
      return r.step === "storyboard" && (r.layer === "board" || r.layer === "final") && r.decision === "revise" && r.cut_n == null;
    }).map(function (r) { return String(r.decided_at || ""); }).sort().pop() || "";
  }
  function boardCurrent(p, f) {
    var at = boardRedoAt(p);
    return f.kind === "board" && !(f.meta || {}).superseded && (f.approved || !at || String(f.created_at || "") > at);
  }

  function freshLine(p) {
    var got = freshFiles(p).filter(function (f) { return !((f.meta || {}).material); });
    if (!got.length) return "";
    var what = {};
    got.forEach(function (f) {
      var name = KIND_NAME[f.kind] || f.kind;
      what[name] = (what[name] || 0) + 1;
    });
    return '<div class="client-said fresh"><b>새로 올라왔습니다</b>' +
      '<span class="at">' + Object.keys(what).map(function (k) {
        return esc(k) + " " + what[k] + "개";
      }).join(" · ") + "</span>" +
      '<span class="said">마지막으로 보신 뒤에 만들어진 것입니다. ' +
      '화면을 새로 읽으면 이 표시는 사라집니다.</span></div>';
  }

  // 자산 종류를 사람 말로. 계약(ad-type-materials.js)이 들고 있는 것을 쓰고,
  // 없는 것만 여기서 채운다 — 같은 이름을 두 곳에 적지 않는다.
  var KIND_NAME_EXTRA = { anchor: "제작 자료", board: "콘티", clip: "영상", final: "완성본" };
  var KIND_NAME = (function () {
    var out = {};
    var spec = window.ONECUE_AD_TYPE_MATERIALS;
    if (spec && spec.kinds) {
      Object.keys(spec.kinds).forEach(function (k) { out[k] = spec.kinds[k].label; });
    }
    Object.keys(KIND_NAME_EXTRA).forEach(function (k) {
      if (!out[k]) out[k] = KIND_NAME_EXTRA[k];
    });
    return out;
  })();

  // ── 접어 놓은 것은 접힌 채로 둔다 ──────────────────────────────────────────
  //
  // 접힘 여부는 원래 데이터에서 계산했다(진행 중이면 펼침). 그래서 알로하캔디
  // 처럼 끝난 건을 접어 놔도 새로 읽으면 다시 펼쳐졌다
  // (Dan 2026-09-22: 「접어놓은거 그대로 유지되게 하면좋을듯」).
  //
  // **사람이 직접 접거나 펼친 것은 계산보다 세다.** 손으로 정한 것을 계산이
  // 덮으면, 화면이 사람 말을 안 듣는 것이 된다.
  //
  // 이 브라우저에만 남는다(localStorage). 다른 기기·다른 사람과 섞이지 않고,
  // 사생활 모드나 저장이 막힌 경우엔 조용히 계산값으로 돌아간다.
  var FOLD_KEY = "onecue.admin.folds";

  function foldsRead() {
    try { return JSON.parse(localStorage.getItem(FOLD_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function foldsWrite(map) {
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(map)); }
    catch (e) { /* 사생활 모드 — 이번 화면에서만 기억된다 */ }
  }

  /** 상자마다 흔들리지 않는 이름. 자리(순서)로 하면 카드가 늘면 어긋난다. */
  function foldKey(d) {
    var card = d.closest('[id^="c-"]');
    var who = card ? card.id : "?";
    if (d.classList.contains("project-fold")) return who;      // 프로젝트 전체
    var head = d.querySelector("summary");
    return who + "|" + ((head && head.textContent) || "").trim().slice(0, 60);
  }

  /** 저장해 둔 것을 화면에 씌운다. 저장된 것이 없는 상자는 계산값을 둔다. */
  function applyFolds() {
    var saved = foldsRead();
    document.querySelectorAll("#work details").forEach(function (d) {
      var k = foldKey(d);
      if (Object.prototype.hasOwnProperty.call(saved, k)) d.open = !!saved[k];
      if (d.dataset.foldWired) return;
      d.dataset.foldWired = "1";
      d.addEventListener("toggle", function () {
        var map = foldsRead();
        map[foldKey(d)] = d.open;
        foldsWrite(map);
      });
    });
  }

  // 마지막으로 그린 것. 같으면 다시 그리지 않는다 — 스크롤이 튀지 않게.
  var LAST_HTML = "";
  // 다시 그리기 전에 보던 자리. 접힘을 되살린 **뒤에** 돌려놓는다.
  var SCROLL_BACK = null;

  // 30초마다 다시 읽는다. 화면을 열어 둔 동안 새로 올라온 것이 저절로 뜬다.
  // 무언가 입력하고 있는 중에는 다시 읽지 않는다 — 쓰던 글이 사라진다.
  var RELOAD_EVERY = 30000;
  // ★ 저절로 다시 그리지 않는다.
  //
  //   30초마다 load() 를 불렀더니 화면이 통째로 갈리면서 보시던 자리가 튀었다.
  //   스크롤을 되돌려 막아 보려 했지만, 그림이 실리면서 높이가 변해 끝까지
  //   깔끔하지 않았다 (Dan: 「계속 refresh되면서 팅기는 문제」).
  //
  //   그래서 방향을 바꾼다 — **새 것이 있는지만 조용히 묻고, 알리기만 한다.**
  //   다시 그리는 것은 사람이 누를 때만이다. 화면은 누르기 전까지 안 움직인다.
  //   묻는 값도 가볍다: 가장 최근 기록 한 줄의 번호만 본다.
  var LAST_SEEN_EVENT = null;
  // ★ 2026-09-23 다시 **저절로 다시 읽는다** — 이번엔 신호가 올 때만.
  //   Dan: 「refresh안해도 뭔가 니가해서 업데이트하면 자동으로 보이는 기능을 넣어라」
  //   작업기가 답변을 달아도 화면은 새로고침 전까지 그대로라 「안 돌고 있다」로 보였다.
  //   · events 표를 실시간 구독(063) — 한 줄 들어오는 순간 다시 읽는다(타이머 아님).
  //   · 튀던 문제는 render() 가 이미 막는다: 바뀐 게 없으면 손대지 않고, 바뀌면 보던 자리로 돌려놓는다.
  //   · 글을 쓰는 중이면 다시 읽지 않는다 — 쓰던 글이 사라진다. 그때만 알림 막대를 띄운다.
  //   · 실시간이 끊겨도 30초마다 가장 최근 번호를 한 번 물어 같은 일을 한다(안전망).
  function typing() {
    var a = document.activeElement;
    return !!(a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && (a.value || "").trim());
  }
  var RELOAD_SOON = null;
  function freshen() {
    if (!authorized) return;
    if (typing()) { var bar = el("newsbar"); if (bar) bar.hidden = false; return; }
    clearTimeout(RELOAD_SOON);
    RELOAD_SOON = setTimeout(function () {       // 한꺼번에 여러 줄이 오면 한 번만 읽는다
      var bar = el("newsbar"); if (bar) bar.hidden = true;
      load();
    }, 600);
  }
  function autoReload() {
    try {
      db.channel("onecue-events")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" },
            function (msg) {
              if (msg && msg.new && msg.new.id) LAST_SEEN_EVENT = msg.new.id;
              freshen();
            })
        .subscribe();
    } catch (e) { /* 실시간이 없으면 아래 안전망만 */ }
    setInterval(function () {
      if (!authorized || document.hidden) return;
      db.from("events").select("id").order("id", { ascending: false }).limit(1)
        .then(function (r) {
          if (r.error || !r.data || !r.data.length) return;
          var top = r.data[0].id;
          if (LAST_SEEN_EVENT == null) { LAST_SEEN_EVENT = top; return; }
          if (top === LAST_SEEN_EVENT) return;
          LAST_SEEN_EVENT = top;
          freshen();
        });
    }, RELOAD_EVERY);
    // 다른 탭에 있다 돌아오면 바로 한 번 맞춘다
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) freshen();
    });
  }

  function render() {
    var fresh = ROWS.filter(function (r) { return r.isNew; });
    var updates = ROWS.filter(function (r) { return r.aiNeedsReview && !(r.job && r.job.step === r.step); });
    var notices = '';
    if (updates.length) {
      notices += '<div class="newbar updatebar"><b>검토할 업데이트 ' + updates.length + '건</b>' +
        updates.map(function (r) {
          return '<a href="#c-' + esc(r.slug) + '">' +
            esc([r.brand, r.product, STEP_NAME[r.step]].filter(Boolean).join(" · ")) + '</a>';
        }).join("") + '</div>';
    }
    if (fresh.length) {
      notices += '<div class="newbar"><b>새 의뢰 ' + fresh.length + "건</b>" +
        fresh.map(function (r) {
          return '<a href="#c-' + esc(r.slug) + '">' +
            esc([r.brand, r.product].filter(Boolean).join(" ")) + "</a>";
        }).join("") + "</div>";
    }
    el("alert").innerHTML = notices;

    // 닫은 프로젝트는 아래로 모은다 (068) — 진행 중인 건이 위에 남는다
    var live = ROWS.filter(function (p) { return p.state !== "done"; });
    var closedRows = ROWS.filter(function (p) { return p.state === "done"; });
    function cards(list) {
      return list.map(function (p) { return '<div id="c-' + esc(p.slug) + '">' + card(p) + "</div>"; }).join("");
    }
    var html = ROWS.length
      ? cards(live) + (closedRows.length
          ? '<h3 class="closed-head">완료된 프로젝트 ' + closedRows.length + "건</h3>" + cards(closedRows) : "")
      : '<div class="empty"><span class="big">아직 들어온 의뢰가 없습니다</span>' +
        "광고주가 의뢰하면 여기에 뜹니다.</div>";

    // ★ 바뀐 것이 없으면 **화면에 손을 대지 않는다.**
    //
    //   30초마다 다시 읽게 만들어 놨더니, 읽을 때마다 화면 전체를 갈아 끼워서
    //   보고 있는 자리가 위로 튀었다 (Dan 2026-09-22: 「왜 저절로 내가 보는
    //   창 스크롤 올라가면서 움직이지」). 대부분의 30초는 아무것도 안 바뀐다 —
    //   그때는 다시 그릴 이유가 없다.
    // ★ 「11분 전」 같은 시간 글자는 **매번 바뀐다.** 그대로 비교하면 30초마다
    //   바뀐 걸로 읽혀 화면을 통째로 다시 그리고, 그때마다 보시던 자리가
    //   튄다. 내용이 같은지를 보려면 **시간 글자를 뺀 채로** 비교해야 한다.
    //   (Dan 2026-09-22: 「관리자 페이지 튀는거 여전한듯하고」)
    var same = html.replace(/\d+(초|분|시간|일|주|개월)\s*전/g, "~");
    if (same === LAST_HTML) {
      applyFolds();               // 접힘만 맞춰 두고 끝낸다
      return;
    }
    LAST_HTML = same;

    // 바뀐 것이 있어 다시 그릴 때도, 보던 자리는 지킨다.
    // ★ 스크롤은 **다 그리고 접힘까지 되살린 뒤에** 돌려놔야 한다.
    //   여기서 바로 돌려놨더니 소용이 없었다 — 그 순간엔 접힌 상자들이
    //   아직 펼쳐지지 않아 문서가 짧고, 브라우저가 스크롤을 그 짧은 높이에
    //   맞춰 깎는다. 그 뒤에 펼쳐져서 문서가 길어져도 스크롤은 깎인 채 남는다.
    //   그래서 Dan 이 영상 뽑기를 눌렀을 때 화면이 맨 위로 튀었고, 바뀐 자리가
    //   눈에서 벗어나 「반응이 없다」로 보였다. 실제로는 돌고 있었다.
    SCROLL_BACK = window.scrollY || document.documentElement.scrollTop || 0;
    el("work").innerHTML = html;

    var ngo = el("newsgo");
    if (ngo && !ngo.dataset.wired) {
      ngo.dataset.wired = "1";
      ngo.addEventListener("click", function () { load(); });
    }
    document.querySelectorAll("[data-enroll]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "등록 요청 중…";
        requestEnrollment(b.dataset.enroll).then(load).catch(function (e) {
          b.disabled = false; b.textContent = "AI 제작 시작";
          window.alert("등록하지 못했습니다 — " + (e.message || e));
        });
      });
    });
    // 광고 종류 확정 — 짐작(ai:)을 사람이 확인하면 human: 으로 바뀐다.
    // 둘을 한 칸에 섞으면 「누가 정한 건지」를 영영 알 수 없게 된다.
    document.querySelectorAll("[data-adtype-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var slug = b.dataset.adtypeSave;
        var sel = document.querySelector('[data-adtype="' + slug + '"]');
        var msg = document.querySelector('[data-adtype-msg="' + slug + '"]');
        var row = ROWS.filter(function (x) { return x.slug === slug; })[0];
        if (!sel || !row) return;
        if (!sel.value) { msg.className = "msg err"; msg.textContent = "종류를 고르십시오."; return; }
        var label = b.textContent;
        b.disabled = true; b.textContent = "저장 중…";
        msg.className = "msg"; msg.textContent = "";
        db.rpc("onecue_set_ad_type", { p_project_id: row.id, p_type: sel.value })
          .then(function (r) {
            if (r.error) {
              b.disabled = false; b.textContent = label;
              msg.className = "msg err";
              msg.textContent = "저장 실패 — " + r.error.message;
              return;
            }
            load();
          });
      });
    });
    // 눌러서 크게 — 여태 data-big 만 붙여 놓고 받는 쪽이 없었다.
    // 앵커는 라벨 글자·그림자를 보고 판정하는 물건이라 작은 칸으로는 못 본다.
    // ★ 영상도 받는다. 「눌러서 크게 보실 수 있습니다」라고 써 놓고 그림만
    //   받고 있었다 — 영상을 누르면 아무 일도 안 났다 (Dan 2026-09-22).
    //   영상은 재생 단추를 눌러야 하므로 **두 번 누르기**로 크게 연다.
    document.querySelectorAll("[data-big]").forEach(function (img) {
      var isVid = img.dataset.vid === "1";
      img.addEventListener(isVid ? "dblclick" : "click", function () {
        var box = document.createElement("div");
        box.className = "bigview";
        box.innerHTML = isVid
          ? '<video src="' + img.dataset.big + '" controls autoplay></video>'
          : '<img src="' + img.dataset.big + '" alt="크게 보기">';
        function close() {
          box.remove();
          document.removeEventListener("keydown", onKey);
        }
        function onKey(e) { if (e.key === "Escape") close(); }
        box.addEventListener("click", close);
        document.addEventListener("keydown", onKey);
        document.body.appendChild(box);
      });
    });
    // ASK 에 답한다 — 답을 적어야 받는다. 무엇으로 정했는지가 판례다.
    document.querySelectorAll("[data-ask-answer]").forEach(function (b) {
      b.addEventListener("click", function () {
        var slug = b.dataset.askAnswer;
        var box = document.querySelector('[data-ask-note="' + slug + '"]');
        var msg = document.querySelector('[data-ask-msg="' + slug + '"]');
        var row = ROWS.filter(function (x) { return x.slug === slug; })[0];
        if (!box || !row) return;
        if (!box.value.trim()) {
          msg.className = "msg err";
          msg.textContent = "무엇으로 정하는지 적어 주십시오.";
          return;
        }
        var label = b.textContent;
        b.disabled = true; b.textContent = "적는 중…";
        db.rpc("onecue_ask_answered",
               { p_project_id: row.id, p_answer: box.value.trim() })
          .then(function (r) {
            if (r.error) {
              b.disabled = false; b.textContent = label;
              msg.className = "msg err";
              msg.textContent = "적지 못했습니다 — " + r.error.message;
              return;
            }
            load();
          });
      });
    });
    document.querySelectorAll("[data-mail]").forEach(function (b) {
      b.addEventListener("click", function () { toggleMail(b.dataset.mail); });
    });
    document.querySelectorAll("[data-send]").forEach(function (b) {
      b.addEventListener("click", function () {
        var label = b.textContent;
        b.disabled = true; b.textContent = "보내는 중…";
        // 쉬운말 게이트에 걸리면 보내지 않는다. 왜 막혔는지 그 자리에서 말해 준다
        send(b.dataset.send).then(load, function (e) {
          b.disabled = false; b.textContent = label;
          window.alert(e.message || String(e));
        });
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

    // ★ 실행 주체 선택 게이트 — 답하기 전에는 아무 작업도 만들어지지 않는다.
    // 한 번 눌리면 그 블록의 두 버튼이 같이 잠긴다(같은 건에 두 요청을 못 보낸다).
    // 그래도 중복 0 을 지키는 것은 서버다 — 여기서는 사람이 덜 헷갈리게 할 뿐이다
    document.querySelectorAll("[data-choice]").forEach(function (b) {
      b.addEventListener("click", function () {
        var box = b.closest("[data-choice-form]");
        var buttons = box ? box.querySelectorAll("[data-choice]") : [b];
        var problem = box && box.querySelector("[data-choice-problem]");
        var nameField = box && box.querySelector("[data-choice-name]");
        var revField = box && box.querySelector("[data-choice-reviewer]");
        var mode = b.dataset.choice;
        var name = nameField ? (nameField.value || "").trim() : "";
        var reviewer = revField ? (revField.value || "").trim() : "";
        function fail(message) {
          if (!problem) { window.alert(message); return; }
          problem.hidden = false;
          problem.textContent = message;
        }
        if (mode === "human" && !name) {
          fail("담당자 이름을 적어 주세요.");
          if (nameField) nameField.focus();
          return;
        }
        if (problem) { problem.hidden = true; problem.textContent = ""; }
        var labels = [];
        buttons.forEach(function (x) { labels.push(x.textContent); x.disabled = true; });
        b.textContent = "처리 중…";
        chooseStageExecutor(b.dataset.slug, b.dataset.step, mode, name, reviewer)
          .then(load)
          .catch(function (e) {
            buttons.forEach(function (x, i) { x.disabled = false; x.textContent = labels[i]; });
            fail("실행 주체를 정하지 못했습니다 — " + (e.message || e));
          });
      });
    });

    // 실행 주체 — 담당자를 고르면 이름 칸이 필요해진다
    // ── 단계 상태 버튼 ────────────────────────────────────────────────────
    // 한 곳에서 받는다. 어느 버튼이든 하는 일은 같다 — RPC 하나 부르고 다시 읽기.
    // 누르는 동안 잠가서 두 번 눌리지 않게 한다(두 번 누르면 작업이 둘 생긴다).
    document.querySelectorAll("[data-back]").forEach(function (b) {
      b.addEventListener("click", function () {
        var box = b.closest(".back-box");
        var to = box.querySelector("[data-back-to]").value;
        var note = (box.querySelector("[data-back-note]").value || "").trim();
        if (!note) { window.alert("왜 되돌리는지 적어 주십시오 — 그 단계의 고칠 점으로 남습니다."); return; }
        if (!window.confirm(STEP_NAME[to] + " 단계로 되돌립니다. 그 뒤 단계의 승인은 풀립니다.")) return;
        b.disabled = true; b.textContent = "되돌리는 중…";
        db.rpc("onecue_stage_back", { p_project_id: b.dataset.back, p_to: to, p_note: note })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) {
            b.disabled = false; b.textContent = "되돌리기";
            window.alert("되돌리지 못했습니다 — " + (e.message || e));
          });
      });
    });
    document.querySelectorAll("[data-msg-draft]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.msgDraft;
        var body = (document.querySelector('[data-msg-body="' + id + '"]').value || "").trim();
        var kind = document.querySelector('[data-msg-kind="' + id + '"]').value;
        if (!body) { window.alert("보낼 말을 적어 주십시오."); return; }
        b.disabled = true;
        db.rpc("onecue_message_draft", { p_project_id: id, p_kind: kind, p_body: body })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; window.alert("저장하지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-msg-send]").forEach(function (b) {
      b.addEventListener("click", function () {
        var owner = ROWS.filter(function (x) { return (x.messages || []).some(function (m) { return m.id === b.dataset.msgSend; }); })[0];
        var msg = owner && owner.messages.filter(function (m) { return m.id === b.dataset.msgSend; })[0];
        var others = owner && msg ? otherNameHits(owner, [msg.body]) : [];
        if (others.length) { window.alert("메시지에 다른 건 이름이 있습니다 — " + others.join(", ") + "\n고친 뒤에 보내 주세요."); return; }
        if (!window.confirm("이 메시지를 광고주에게 보냅니다. 광고주 화면에 바로 뜹니다.")) return;
        b.disabled = true; b.textContent = "보내는 중…";
        db.rpc("onecue_message_send", { p_message_id: b.dataset.msgSend })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "광고주에게 보내기"; window.alert("보내지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-retry-job]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "다시 돌리는 중…";
        db.from("jobs").update({ state: "queued", error: null, claimed_by: null, claimed_at: null, finished_at: null })
          .eq("id", b.dataset.retryJob)
          .then(function (r) {
            if (r.error) throw r.error;
            return db.from("events").insert({ project_id: b.dataset.retryPid, kind: "worker_retry",
              payload: { by: "admin", worker: b.dataset.retryWorker, job: b.dataset.retryJob } });
          })
          .then(function (r) { if (r && r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "다시 돌리기"; window.alert("다시 돌리지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-brief-confirm]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "넘기는 중…";
        db.rpc("onecue_brief_confirm", { p_project_id: b.dataset.briefConfirm })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "의뢰 확정 → 전략 설계로"; window.alert("넘기지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-plan-start]").forEach(function (b) {
      b.addEventListener("click", function () {
        var what = b.dataset.planWhat === "develop" ? "고른 콘셉트 그대로 구성·각본(골·필수·비트)을"
          : b.dataset.planWhat === "concepts" ? "위 전략을 그대로 받아 콘셉트 5안을" : "전략 설계를";
        if (!window.confirm("AI가 " + what + " 씁니다. 광고주 답에서 정리한 조건이 함께 넘어갑니다.")) return;
        b.disabled = true; b.textContent = "시작하는 중…";
        db.rpc("onecue_plan_start", { p_project_id: b.dataset.planStart })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "AI에게 맡기기"; window.alert("시작하지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-toggle-form]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = document.getElementById(b.dataset.toggleForm);
        if (f) f.hidden = !f.hidden;
      });
    });
    document.querySelectorAll("[data-back-strategy]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("전략 설계로 돌아갑니다. 전략을 새로 올리면 지금 콘셉트는 지워집니다.")) return;
        b.disabled = true;
        db.rpc("onecue_back_to_strategy", { p_project_id: b.dataset.backStrategy })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; window.alert("돌아가지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-dv-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.dvSave, form = document.getElementById("dv-" + id), v = {};
        form.querySelectorAll("[data-dv]").forEach(function (x) { v[x.dataset.dv] = (x.value || "").trim(); });
        var lines = function (t) { return (t || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); };
        var beats = [];
        form.querySelectorAll(".dv-beat").forEach(function (fs) {
          var o = {};
          fs.querySelectorAll("[data-bt]").forEach(function (x) { o[x.dataset.bt] = (x.value || "").trim(); });
          if (!o.action && !o.t_end) return;          // 빈 비트는 건너뛴다
          o.t_start = Number(o.t_start); o.t_end = Number(o.t_end);
          beats.push(o);
        });
        if (!v.goal) { window.alert("골을 한 줄 써 주십시오."); return; }
        if (!beats.length) { window.alert("비트를 하나 이상 써 주십시오."); return; }
        var arc = ["골: " + v.goal].concat(v.must ? ["필수: " + v.must] : []).concat(lines(v.flow));
        b.disabled = true; b.textContent = "올리는 중…";
        db.rpc("onecue_develop_manual", { p_project_id: id,
          p_development: { arc: arc, copies: lines(v.copies), slogan: v.slogan || "", narration_tone: "" }, p_beats: beats })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "구성·각본 올리기 → 콘티 확인"; window.alert("올리지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-ms-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.msSave, form = document.getElementById("ms-" + id), v = {};
        form.querySelectorAll("[data-ms]").forEach(function (x) { v[x.dataset.ms] = (x.value || "").trim(); });
        if (!v.one_message && !v.insight && !v.direction) { window.alert("핵심 메시지·인사이트·그 외 필요한 사항 중 하나는 써 주십시오."); return; }
        b.disabled = true; b.textContent = "올리는 중…";
        db.rpc("onecue_strategy_manual", { p_project_id: id, p_insight: v.insight, p_one_message: v.one_message,
          p_usp: v.usp, p_tone: v.tone, p_direction: v.direction,
          p_client_who: v.client_who || "", p_client_what: v.client_what || "", p_client_feel: v.client_feel || "",
          p_client_why: v.client_why || "" })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "전략 올리기 → 콘셉트 5안"; window.alert("올리지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-mc-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.mcSave, form = document.getElementById("mc-" + id);
        var reco = (form.querySelector('input[type=radio]:checked') || {}).value;
        var list = [];
        form.querySelectorAll(".mc-one").forEach(function (fs, i) {
          var c = {};
          fs.querySelectorAll("[data-mc]").forEach(function (x) { c[x.dataset.mc] = (x.value || "").trim(); });
          if (!c.title && !c.client_one_line) return;          // 빈 안은 건너뛴다
          c.is_recommended = String(i) === reco;
          list.push(c);
        });
        if (!list.length) { window.alert("한 안 이상 써 주십시오 (제목과 한 줄 설명)."); return; }
        if (!list.some(function (c) { return c.is_recommended; })) list[0].is_recommended = true;
        b.disabled = true; b.textContent = "올리는 중…";
        db.rpc("onecue_concepts_manual", { p_project_id: id, p_concepts: list,
          p_one_message: (form.querySelector("[data-mc-msg]").value || "").trim() })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) { b.disabled = false; b.textContent = "콘셉트 올리기 → 검토"; window.alert("올리지 못했습니다 — " + (e.message || e)); });
      });
    });
    document.querySelectorAll("[data-close-project]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("이 프로젝트를 완료로 닫습니다.")) return;
        b.disabled = true; b.textContent = "닫는 중…";
        db.rpc("onecue_project_close", { p_project_id: b.dataset.closeProject })
          .then(function (r) { if (r.error) throw r.error; return load(); })
          .catch(function (e) {
            b.disabled = false; b.textContent = "프로젝트 완료";
            window.alert("닫지 못했습니다 — " + (e.message || e));
          });
      });
    });
    // 납품 — 광고주 발송. 되돌릴 수 없으니 한 번 더 묻는다
    document.querySelectorAll("[data-final-send]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("완성본을 광고주에게 납품합니다. 광고주 화면에 바로 뜹니다.")) return;
        b.disabled = true; b.textContent = "보내는 중…";
        db.rpc("onecue_final_send", { p_project_id: b.dataset.finalSend }).then(function (r) {
          if (r.error) throw r.error;
          return load();
        }).catch(function (e) {
          b.disabled = false; b.textContent = "승인하고 광고주에게 납품";
          window.alert("보내지 못했습니다 — " + (e.message || e));
        });
      });
    });
    // ★ 수정 요청은 무엇을 고칠지 적어야 눌린다 — 빈칸이면 버튼을 잠근다 (Dan 09-24 「아무것도 안 쓰면 활성화 안 돼야」)
    //   전에는 눌리고 안내만 떠서, 눌렀는데 아무 일도 없는 것처럼 보였다.
    document.querySelectorAll("[data-lc-note]").forEach(function (t) {
      var wrap = t.closest(".cut-review, .lc");
      var btns = wrap ? Array.prototype.filter.call(wrap.querySelectorAll('[data-lc="revise"],[data-lc="review-revise"]'),
        function (x) { return x.closest(".cut-review, .lc") === wrap; }) : [];
      function sync() {
        var empty = !(t.value || "").trim();
        Array.prototype.forEach.call(btns, function (x) {
          x.disabled = empty;
          x.title = empty ? "무엇을 고칠지 적으면 눌립니다" : "";
        });
      }
      t.addEventListener("input", sync);
      sync();
    });
    document.querySelectorAll("[data-lc]").forEach(function (b) {
      b.addEventListener("click", function () {
        var what = b.dataset.lc;
        var slug = b.dataset.slug, step = b.dataset.step;
        // 컷 칸(.cut-review)이 가장 가까운 칸이다 — 전에는 바깥 .lc 로 올라가 컷에 적은 글 대신 윗칸 글을 읽었다
        var wrap = b.closest(".cut-review, .lc");
        var msg = wrap && (wrap.querySelector("[data-lc-msg]") || (b.closest(".lc") || {}).querySelector && b.closest(".lc").querySelector("[data-lc-msg]"));
        var note = wrap && wrap.querySelector("[data-lc-note]");
        var text = note ? (note.value || "").trim() : "";
        if (what === "revise" && !text) {
          if (msg) { msg.className = "lc-msg err"; msg.textContent = "무엇을 고칠지 적어 주세요."; }
          if (note) note.focus();
          return;
        }
        // 잘못 눌렀으면 칸만 접는다 — 아무것도 저장하지 않는다
        if (what === "direct-cancel") {
          var d = b.closest("details"); if (d) d.open = false;
          return;
        }
        // 062 — 다시 고르기: ②·③ → ① (시작 전까지)
        if (what === "unchoose") {
          lock(b);
          return rpc(slug, "onecue_stage_unchoose", { p_step: step })
            .then(function (r) {
              if (r && r.ok === false) throw new Error(r.why || "되돌리지 못했습니다");
            }).then(load).catch(fail(b, msg));
        }
        // 061 — 사람 → AI 로 되돌린다 (시작 전까지)
        if (what === "undirect") {
          lock(b);
          return rpc(slug, "onecue_stage_directions_clear", { p_step: step })
            .then(function (r) {
              if (r && r.ok === false) throw new Error(r.why || "바꾸지 못했습니다");
            }).then(load).catch(fail(b, msg));
        }
        // 060 — 「사람이 직접 진행」: 요청사항을 적고 그대로 진행한다
        if (what === "direct") {
          if (!text) {
            if (msg) { msg.className = "lc-msg err"; msg.textContent = "요청사항을 적어 주십시오."; }
            if (note) note.focus();
            return;
          }
          lock(b);
          return rpc(slug, "onecue_stage_directions", { p_step: step, p_text: text })
            .then(function (r) {
              if (r && r.ok === false) throw new Error(r.why || "저장하지 못했습니다");
            }).then(load).catch(fail(b, msg));
        }
        if (what === "choose-human") {
          var who = (window.prompt("담당자 이름을 적어 주세요.") || "").trim();
          if (!who) return;
          lock(b);
          return chooseStageExecutor(slug, step, "human", who, "").then(load).catch(fail(b, msg));
        }
        lock(b);
        // 검수는 겹과 컷 번호를 같이 보낸다. 컷 번호가 없으면 그 겹 전체다.
        if (what === "review-ok" || what === "review-revise") {
          var layer = b.dataset.layer;
          var cut = b.dataset.cut ? Number(b.dataset.cut) : null;
          lock(b);
          return stageReview(slug, step, layer, cut,
            what === "review-ok" ? "ok" : "revise", text).then(load).catch(fail(b, msg));
        }
        if (what === "approve-anchor") {
          lock(b);
          return rpc(slug, "onecue_asset_approve",
            { p_asset_id: b.dataset.asset, p_approved: true })
            .then(load).catch(fail(b, msg));
        }
        // 전송은 되돌릴 수 있는 일이 아니다 — 누르는 순간 광고주 화면에 뜬다.
        // 그래서 한 번 묻는다. 「취소」는 반대로 내리는 일이라 묻지 않는다.
        if (what === "send") {
          if (!window.confirm("콘티를 광고주에게 보냅니다. 보내면 광고주 화면에 바로 뜹니다.")) {
            b.disabled = false;
            return;
          }
          return rpc(slug, "onecue_board_send", {}).then(load).catch(fail(b, msg));
        }
        if (what === "back") {
          // 전 단계로 돌아가는 일은 **내리는 일까지**가 한 벌이다. 보낸 뒤에
          // 고치기로 해 놓고 옛 콘티가 광고주 화면에 남아 있으면, 광고주는
          // 이미 없는 것을 보고 말한다.
          return rpc(slug, "onecue_board_unsend", {})
            .then(function () { return stageRevise(slug, step, text || "완성 콘티를 다시 봅니다"); })
            .then(load).catch(fail(b, msg));
        }
        var call = what === "choose-ai" ? chooseStageExecutor(slug, step, "ai", "", "")
          : what === "rechoose" ? clearStageChoice(slug, step)
          : what === "start" ? stageStart(slug, step)
          : what === "approve" ? stageApprove(slug, step)
          : what === "revise" ? stageRevise(slug, step, text)
          : what === "next" ? stageNext(slug, step)
          : what === "make-board" ? rpc(slug, "onecue_board_request", {})
          : null;
        if (!call) { b.disabled = false; return; }
        return call.then(load).catch(fail(b, msg));
      });
    });

    document.querySelectorAll("[data-exec-form]").forEach(function (f) { syncExecForm(f); });

    var nb = el("newsbar");
    if (nb) nb.hidden = true;           // 방금 그렸으니 최신이다

    // 사람이 접어 둔 것을 되살린다. 그린 **뒤에** 해야 한다 —
    // 상자가 아직 없을 때 하면 아무것도 못 찾는다.
    applyFolds();

    // 접힘까지 되살려 문서 높이가 제자리로 온 뒤에 스크롤을 돌려놓는다.
    //
    // ★ 한 번으로는 모자란다. 그림이 아직 안 실려서 문서가 짧을 수 있고,
    //   그러면 브라우저가 스크롤을 그 짧은 높이에 맞춰 깎는다. 실리는 대로
    //   문서가 길어지므로, 다음 프레임과 잠깐 뒤에 한 번씩 더 돌려놓는다.
    //   되돌리는 도중에 직접 스크롤하시면 **그 순간 그만둔다** — 사람이 움직인
    //   것을 기계가 덮으면 그게 더 나쁘다.
    if (SCROLL_BACK != null) {
      var back = SCROLL_BACK;
      SCROLL_BACK = null;
      var give = false;
      var stop = function () { give = true; };
      window.addEventListener("wheel", stop, { once: true, passive: true });
      window.addEventListener("touchstart", stop, { once: true, passive: true });
      var put = function () {
        if (give) return;
        if (Math.abs((window.scrollY || 0) - back) > 2) window.scrollTo(0, back);
      };
      put();
      requestAnimationFrame(put);
      setTimeout(put, 120);
      setTimeout(function () {
        put();
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
      }, 600);
    }

    // ★ 그림을 다 그린 **뒤에** 「봤다」로 적는다. 그리기 전에 적으면
    //   이번에 새로 올라온 것이 표시되지 않은 채 사라진다.
    markSeen(newestStamp());
    document.querySelectorAll("[data-exec-mode]").forEach(function (r) {
      r.addEventListener("change", function () {
        syncExecForm(r.closest("[data-exec-form]"));
      });
    });
    document.querySelectorAll("[data-exec-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.closest("[data-exec-form]");
        var mode = f.querySelector("[data-exec-mode]:checked");
        var name = (f.querySelector("[data-exec-name]").value || "").trim();
        var rev = (f.querySelector("[data-exec-reviewer]").value || "").trim();
        mode = mode ? mode.value : "ai";
        if (mode === "human" && !name) {
          window.alert("담당자 이름을 적어 주세요.");
          f.querySelector("[data-exec-name]").focus();
          return;
        }
        var label = b.textContent;
        b.disabled = true; b.textContent = "저장 중…";
        // 실행 주체를 묻는 단계는 선택 RPC 로 간다 — AI 를 고르면 그 호출 안에서
        // 작업이 만들어진다. 묻지 않는 단계는 예전 경로 그대로(검토 AI 지정 등)
        var save = SE().choiceRequired(b.dataset.step)
          ? chooseStageExecutor(b.dataset.slug, b.dataset.step, mode, name, rev)
          : setStageExecutor(b.dataset.slug, b.dataset.step, mode, name, rev);
        save
          .then(load)
          .catch(function (e) {
            b.disabled = false; b.textContent = label;
            window.alert("누가 맡는지(실행 주체) 저장하지 못했습니다 — " + (e.message || e));
          });
      });
    });
    // 의견 저장 — **돈이 안 나가는 버튼이다.** 생성과 완전히 따로 돈다.
    // ★ 지난 버전은 **언제나 접힌 채로 시작한다.**
    //
    //   마크업에 open 을 안 줬는데도 새로고침하면 펼쳐져 있었다. 크롬이
    //   details 의 열림 상태를 되살려 주기 때문이다. 한 번 펼쳐 보면
    //   그다음부터 계속 펼쳐진 채로 떠서 화면이 길어진다
    //   (Dan 2026-09-22: 「지난 버전 default값을 접혀잇게해」).
    //
    //   지난 판은 **기록**이다. 찾아볼 때만 펼치면 된다. 그릴 때마다 닫는다.
    document.querySelectorAll("details.made-old[open]").forEach(function (d) {
      d.open = false;
    });

    // 「이 답변대로 갑니다」 — 돈은 안 나간다. 다시 뽑기를 **열어 줄 뿐**이다.
    document.querySelectorAll("[data-take-settle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var label = b.textContent;
        b.disabled = true; b.textContent = "정하는 중…";
        assetSettle(b.dataset.takeSettle)
          .then(load)
          .catch(function (e) {
            b.disabled = false; b.textContent = label;
            window.alert("정하지 못했습니다 — " + (e.message || e));
          });
      });
    });

    // ★ **적기 시작하면 다시 뽑기를 잠근다.**
    //
    //   「이 답변대로 갑니다」를 누르면 버튼이 열린다. 그런데 그 뒤에 의견을
    //   더 적으시는 동안에는 아직 저장 전이라 DB 는 「정해짐」 그대로고,
    //   버튼도 열려 있었다. 그 상태로 누르면 **방금 적으신 글이 반영되지
    //   않은 채 45크레딧이 나간다.**
    //   (Dan 2026-09-22: 「의견 더 적기 … 누르니까 다시 쓰는칸이 나오긴하는데
    //   다시 뽑기 버튼이 안잠기네」)
    //
    //   저장 여부는 서버만 아는 것이 아니다 — **칸에 손을 댔는지**는 화면이
    //   안다. textarea.defaultValue 가 저장된 값이므로 그것과 다르면 아직
    //   저장 안 된 것이다.
    document.querySelectorAll("[data-take-text]").forEach(function (t) {
      var stage = t.closest("details.flow-step");
      if (!stage) return;
      var btn = stage.querySelector('[data-lc="start"]');
      if (!btn) return;
      // 원래 잠금 상태를 기억해 둔다. 손을 뗐을 때 함부로 열어 주지 않는다 —
      // 계획 미반영·미결정 같은 다른 이유로 잠겨 있을 수 있다.
      if (btn.dataset.lockBase == null) btn.dataset.lockBase = btn.disabled ? "1" : "";
      var msg = stage.querySelector("[data-lc-msg]");
      t.addEventListener("input", function () {
        var dirty = false;
        stage.querySelectorAll("[data-take-text]").forEach(function (x) {
          if (x.value !== x.defaultValue) dirty = true;
        });
        btn.disabled = !!btn.dataset.lockBase || dirty;
        if (msg) {
          msg.textContent = dirty
            ? "적으신 것이 아직 저장되지 않았습니다 — 「고쳐 저장」을 누르시면 "
              + "답변을 다시 답니다. 그때까지 다시 뽑기는 잠급니다."
            : "";
          msg.classList.toggle("warn", dirty);
        }
      });
    });

    document.querySelectorAll("[data-take-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.closest("[data-take-form]");
        var t = (f.querySelector("[data-take-text]").value || "").trim();
        if (!t) {
          window.alert("적으신 내용이 없습니다.");
          f.querySelector("[data-take-text]").focus();
          return;
        }
        var label = b.textContent;
        b.disabled = true; b.textContent = "저장 중…";
        assetDanTake(b.dataset.takeSave, t)
          .then(load)
          .catch(function (e) {
            b.disabled = false; b.textContent = label;
            window.alert("의견을 저장하지 못했습니다 — " + (e.message || e));
          });
      });
    });

    document.querySelectorAll("[data-deliver-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.closest("[data-deliver-form]");
        var note = (f.querySelector("[data-deliver-note]").value || "").trim();
        var summary = (f.querySelector("[data-deliver-summary]").value || "").trim();
        var plain = f.querySelector("[data-deliver-plain]");
        var box = f.querySelector("[data-deliver-problems]");
        function show(problems) {
          if (!box) return;
          box.hidden = !problems.length;
          box.innerHTML = problems.length
            ? "<b>고쳐야 할 것 " + problems.length + "가지</b><ul>" +
              problems.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"
            : "";
        }
        if (!plain || !plain.checked) {
          show(["게시 전 검수 — 비전문가가 바로 이해할 수 있는 말인지 확인하고 체크해 주세요"]);
          if (plain) plain.focus();
          return;
        }
        var structured = f.hasAttribute("data-deliver-structured");
        var values = null;
        var problems = SE().checkText("client_summary", summary)
          .concat(SE().checkText("delivered_note", note));
        if (structured) {
          values = readForm(f, b.dataset.step);
          problems = SE().checkForm(b.dataset.step, values).concat(problems);
        }
        // 규칙을 외우게 하지 않는다. 걸리는 것이 있으면 그 자리에 전부 적어 준다.
        // 예전처럼 확인창으로 넘겨 통과시키지 않는다 — 서버도 같은 계약으로 거절한다
        if (problems.length) { show(problems); return; }
        show([]);
        var label = b.textContent;
        b.disabled = true; b.textContent = "등록 중…";
        var done = structured
          ? developSet(b.dataset.slug, values, summary, note)
          : deliverStage(b.dataset.slug, b.dataset.step, note, summary, true);
        done.then(load).catch(function (e) {
          b.disabled = false; b.textContent = label;
          show([(e.message || String(e))]);
        });
      });
    });
  }

  // 폼에 적힌 것을 계약이 말하는 모양으로 바꾼다 — 목록은 줄 단위, 참/거짓은 불리언
  function readForm(f, step) {
    var out = {};
    SE().fields(step).forEach(function (field) {
      var node = f.querySelector('[data-form-field="' + field.key + '"]');
      if (!node) return;
      if (field.type === "boolean") { out[field.key] = node.value === "true"; return; }
      if (field.type === "list") { out[field.key] = SE().lines(node.value); return; }
      out[field.key] = (node.value || "").trim();
    });
    return out;
  }

  function syncExecForm(f) {
    if (!f) return;
    var mode = f.querySelector("[data-exec-mode]:checked");
    var human = !!mode && mode.value === "human";
    var name = f.querySelector("[data-exec-name]");
    if (name) {
      name.required = human;
      name.placeholder = human ? "담당자 이름" : "담당자 진행일 때만 필요합니다";
    }
  }

  // 실행 주체는 RPC 로만 바꾼다. 브라우저에는 stage_executors 쓰기 권한이 없다
  function setStageExecutor(slug, step, mode, assignee, reviewer) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    if (!SE().editable(p, step)) {
      return Promise.reject(new Error("지금은 이 단계를 누가 맡는지(실행 주체) 바꿀 수 없습니다"));
    }
    // 담당자로 돌릴 수 없는 단계는 버튼이 눌려도 보내지 않는다. 서버도 거절하지만
    // 여기서 막아야 왜 안 되는지가 그대로 화면에 뜬다
    if (mode === "human") {
      var pickable = SE().assignable(step);
      if (!pickable.ok) return Promise.reject(new Error(pickable.note));
    }
    return db.rpc("onecue_stage_executor_set", {
      p_project_id: p.id, p_step: step, p_mode: mode,
      p_assignee: assignee || "", p_reviewer_model: reviewer || "", p_reviewer_note: "",
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  // ★ 실행 주체 선택 — 한 번의 호출이 한 트랜잭션이다 (migrate_017).
  //
  // AI 를 고르면 그 안에서 **작업 한 건만** 만들어진다. 화면이 jobs 에 직접 쓰지
  // 않는다 — 브라우저가 작업을 만들면 두 번 눌렀을 때 두 건이 생기는 것을 막을
  // 방법이 없다. 서버가 프로젝트 줄을 잠그고, 이미 만든 작업이 있으면 다시 만들지
  // 않는다. 화면의 버튼 잠금은 그 위에 얹는 편의일 뿐 보장이 아니다.
  function chooseStageExecutor(slug, step, mode, assignee, reviewer) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    if (SE().choiceState(p, step) === "contract_missing") {
      return Promise.reject(new Error(
        "폼 계약을 불러오지 못해 누가 맡는지 정할 수 없습니다 — 새로고침한 뒤 다시 시도해 주세요"));
    }
    // ★ AI 로 맡기는 것은 **어느 단계든** 된다. 「사람 양식이 있는 단계만 고를 수 있다」는
    //   검사가 AI 까지 막아서, 후반 단계에서 「AI에게 맡기기」가 요청도 안 보내고 조용히
    //   멈췄다 (Dan 09-23: 「ai에게 맡기기 눌럿는데 반응없는데」). 양식 검사는 담당자가
    //   결과를 직접 올리는 옛 방식(mode=human)에만 건다.
    if (mode === "human" && !SE().choiceRequired(step)) {
      return Promise.reject(new Error("이 단계는 담당자 양식이 없습니다 — 「사람이 직접 진행」(요청사항)을 쓰십시오"));
    }
    if (mode === "human") {
      var pickable = SE().assignable(step);
      if (!pickable.ok) return Promise.reject(new Error(pickable.note));
      if (!assignee) return Promise.reject(new Error("담당자 이름을 적어 주세요"));
    }
    return db.rpc("onecue_stage_executor_choose", {
      p_project_id: p.id, p_step: step, p_mode: mode,
      p_assignee: assignee || "", p_reviewer_model: reviewer || "", p_reviewer_note: "",
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  // 등록은 단계를 옮기지 않는다. p_advance 는 계약에 남아 있지만 항상 false 로 보내고,
  // 서버는 true 가 오면 거절한다 — 옛 화면이 조용히 단계를 밀어 버리지 않게 하려는 것이다
  function deliverStage(slug, step, note, summary, plainOk) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    if (!SE().canDeliver(p, step)) {
      return Promise.reject(new Error("지금은 결과를 등록할 수 있는 단계가 아닙니다"));
    }
    // 쉬운 말 검수 확인 없이는 서버가 거절한다. 화면에서도 한 번 더 막는다
    if (!plainOk) {
      return Promise.reject(new Error("게시 전 검수 확인이 필요합니다"));
    }
    return db.rpc("onecue_stage_deliver", {
      p_project_id: p.id, p_step: step, p_note: note || "", p_advance: false,
      p_client_summary: summary || "", p_plain_language_ok: true,
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  // 구성·각본 — 결과물과 등록 기록이 한 호출 안에서 같이 저장된다.
  // 반쪽만 남는 경우가 없도록 developments 쓰기를 화면에서 따로 하지 않는다
  function developSet(slug, values, summary, note) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    if (!SE().canDeliver(p, "develop")) {
      return Promise.reject(new Error("지금은 결과를 등록할 수 있는 단계가 아닙니다"));
    }
    var problems = SE().checkForm("develop", values);
    if (problems.length) return Promise.reject(new Error(problems[0]));
    return db.rpc("onecue_stage_develop_set", {
      p_project_id: p.id, p_fields: values, p_client_summary: summary || "",
      p_note: note || "", p_plain_language_ok: true,
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
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
          note: "관리자 재기획 요청", direction: note, plan: true, keep_strategy: true,
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

  /** 광고주에게 나가는 글에 **다른 건(다른 광고주·다른 작품)의 이름**이 있는가 (Dan 09-24 「다른 작품을 예시로 하면 안 됨」)
   *  이름은 지금 목록(ROWS)에서 읽는다 — 손으로 적은 목록은 새 건이 생기면 샌다. 제품 이름은 3자 이상만. */
  function otherNames(p) {
    var mine = [p.brand, p.product].map(function (x) { return String(x || "").trim(); });
    var out = {};
    ROWS.forEach(function (r) {
      if (r.id === p.id) return;
      [["brand", 2], ["product", 3]].forEach(function (k) {
        var n = String(r[k[0]] || "").trim();
        if (n.length >= k[1] && mine.indexOf(n) < 0) out[n] = true;
      });
    });
    return Object.keys(out);
  }
  function otherNameHits(p, texts) {
    var all = (texts || []).join("\n").toLowerCase();
    return otherNames(p).filter(function (n) { return all.indexOf(n.toLowerCase()) >= 0; });
  }

  // 1차 검수를 마쳤다 → 광고주 차례로 넘긴다. 이때 비로소 광고주 화면에 버튼이 뜬다.
  //
  // ★ 쉬운말 게이트가 여기에도 선다. AI 가 만든 글도 똑같이 본다 — 담당자 등록분만
  //   보는 게 아니다. 걸리면 보내지 않고, 통과든 차단이든 검사 사실을 기록한다.
  //   (지금은 화면이 막는다. DB 로 옮기는 안은 README §8-5 에 있다)
  function send(slug) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    // ★ 순서 — 콘셉트는 5안이 올라오고 AI 작업이 끝난 뒤에만 보낸다 (Dan 09-24). DB(075)도 같은 것을 막는다
    if (p.step === "concepts" && !(p.concepts && p.concepts.length)) {
      return Promise.reject(new Error("콘셉트가 아직 없습니다 — 5안이 올라온 뒤에 보낼 수 있습니다"));
    }
    if (p.job && p.job.request && p.job.request.plan) {
      return Promise.reject(new Error("AI가 쓰는 중입니다 — 끝난 뒤에 보낼 수 있습니다"));
    }
    var gate = SE().sendGate(p);
    var others = otherNameHits(p, gate.texts);
    if (others.length) {
      return Promise.reject(new Error("광고주에게 나갈 글에 다른 건 이름이 있습니다 — " + others.join(", ") + "\n\n고친 뒤에 다시 눌러 주세요."));
    }
    return recordPlainReview(p, gate).then(function () {
      if (!gate.ok) {
        throw new Error(gate.reason === "contract_missing"
          ? "쉬운말 검사 목록을 불러오지 못했습니다 — 새로고침한 뒤 다시 보내세요"
          : "광고주에게 나갈 글에 내부 용어가 남아 있어 보내지 않았습니다.\n\n" +
            gate.hits.map(function (x) { return x.term + " → " + x.plain; }).join("\n") +
            "\n\n고친 뒤에 다시 눌러 주세요.");
      }
      return db.from("projects").update({ state: "ready", updated_at: new Date() })
        .eq("slug", slug)
        .then(function (u) {
          // DB 가 거절하면 「보냈음」 기록을 남기지 않는다 — 전에는 거절을 안 보고 넘어갔다
          if (u && u.error) throw u.error;
          return db.from("projects").select("id,step").eq("slug", slug).single();
        })
        .then(function (r) {
          return db.from("events").insert({
            project_id: r.data.id, kind: "sent", to_step: r.data.step,
            payload: { by: "admin", note: "1차 검수 완료 — 광고주에게 넘김" },
          });
        });
    });
  }

  // 검사 사실을 남긴다. 기록이 실패해도 보내기 판단 자체는 바뀌지 않는다 —
  // 통과했는데 기록이 안 됐다고 막으면 기존 흐름이 기록 장애로 멈춘다
  function recordPlainReview(p, gate) {
    return db.rpc("onecue_stage_plain_review", {
      p_project_id: p.id, p_step: p.step, p_texts: gate.texts || [], p_source: "send",
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    }).catch(function () {
      // RPC 가 아직 없는 서버(마이그레이션 016 이전)에서도 화면은 그대로 돈다
      return db.from("events").insert({
        project_id: p.id, kind: "plain_language_check",
        from_step: p.step, to_step: p.step,
        payload: {
          by: "admin_ui", source: "send", step: p.step,
          result: gate.ok ? "pass" : "blocked",
          terms: (gate.hits || []).map(function (x) { return x.term; }),
          checked: (gate.texts || []).length,
        },
      }).then(function () { return null; }, function () { return null; });
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

  /** 단계마다 누가 승인·납품했나 (Dan 09-23: 「승인자 아이디가 단계별로 보이도록」) */
  // ── 광고주 메시지 (070) — 요청 조정 제안 · 자료 요청 · 설명, 광고주 답 ──
  //   Dan 09-23: 「의뢰인에게 메시지로 변경이나 다른 자료를 요청하거나 설명하는 기능은없어?」
  //   관리자 글은 초안으로 먼저 남고, 「보내기」를 눌러야 광고주 화면에 뜬다(광고주 발송 = Dan 승인 경계).
  var MSG_KIND = { change: "요청 조정 제안", materials: "자료 요청", explain: "설명", reply: "광고주 답" };
  function loadMessages() {
    var ids = ROWS.map(function (p) { return p.id; });
    if (!ids.length) return Promise.resolve();
    return db.from("project_messages").select("id,project_id,author,kind,body,created_at,sent_at,read_at,digest,digest_at")
      .in("project_id", ids).order("created_at").then(function (r) {
        var all = r.data || [];
        ROWS.forEach(function (p) { p.messages = all.filter(function (m) { return m.project_id === p.id; }); });
      });
  }
  // 광고주 답을 작업기가 정리한 것 (071) — 없으면 「정리 중」
  function digestView(m) {
    var d = m.digest;
    if (!d) return '<div class="msg-digest wait">반영 중 — 작업기가 답을 조건으로 정리하고 있습니다</div>';
    function li(title, arr) {
      return arr && arr.length ? "<b>" + title + "</b>" + arr.map(function (x) { return "<span>· " + esc(x) + "</span>"; }).join("") : "";
    }
    // 재확인 칸은 두지 않는다 — 모든 조건을 다 맞출 수는 없다 (Dan 09-24)
    return '<div class="msg-digest">' + li("반영된 조건", d.conditions) + li("결정", d.decisions) + "</div>";
  }
  /** 모든 광고주 답의 반영 조건 — 의뢰 조건 칸에 붙인다. 기획이 이것까지 읽는다 */
  function digestConditions(p) {
    var out = [];
    (p.messages || []).forEach(function (m) {
      if (m.author === "client" && m.digest) out = out.concat(m.digest.conditions || [], m.digest.decisions || []);
    });
    return out;
  }

  function messageBox(p) {
    var list = p.messages || [];
    var sentAdmin = list.filter(function (m) { return m.author === "admin" && m.sent_at; });
    var replies = list.filter(function (m) { return m.author === "client"; });
    var lastSent = sentAdmin[sentAdmin.length - 1];
    var lastReply = replies[replies.length - 1];
    // 상태 한 줄 — 보냈는데 답이 없으면 「답변 대기 중」, 오면 「답변 도착」 (Dan 09-23)
    var status = !lastSent ? ""
      : (lastReply && lastReply.sent_at > lastSent.sent_at)
        ? '<span class="msg-state got">광고주 답변 도착 · ' + esc(when(lastReply.sent_at)) + "</span>"
        : '<span class="msg-state wait">답변 대기 중 · ' + esc(when(lastSent.sent_at)) + " 보냄</span>";
    var thread = list.map(function (m) {
      var mine = m.author === "admin";
      if (mine && !m.sent_at) {
        return '<div class="msg out draft"><div class="msg-head"><b>' + esc(MSG_KIND[m.kind] || m.kind) +
          "</b> · 초안 — 아직 광고주에게 안 보임</div>" +
          '<div class="msg-body">' + esc(m.body) + "</div>" +
          (canWrite ? '<button class="btn" type="button" data-msg-send="' + esc(m.id) + '">광고주에게 보내기</button>' : "") +
          "</div>";
      }
      return '<div class="msg ' + (mine ? "out sent" : "in") + '"><div class="msg-head"><b>' +
        esc(mine ? (MSG_KIND[m.kind] || m.kind) : "광고주 답") + "</b> · " +
        (mine ? "보냄 " : "") + esc(when(m.sent_at)) +
        (mine ? (m.read_at ? " · 읽음" : "") : "") + "</div>" +
        '<div class="msg-body">' + esc(m.body) + "</div>" + (mine ? "" : digestView(m)) + "</div>";
    }).join("");
    // 새 메시지 칸은 접어 둔다 — 늘 열려 있으니 방금 보낸 것이 안 보낸 것처럼 보였다
    var form = canWrite
      ? '<details class="msg-new"><summary>+ 새 메시지</summary><div class="msg-form">' +
        '<select data-msg-kind="' + esc(p.id) + '">' +
        '<option value="change">요청 조정 제안</option><option value="materials">자료 요청</option>' +
        '<option value="explain">질문·설명</option></select>' +
        '<textarea data-msg-body="' + esc(p.id) + '" rows="3" maxlength="4000" ' +
        'placeholder="광고주에게 보낼 말 — 초안으로 먼저 저장됩니다"></textarea>' +
        '<button class="btn ghost" type="button" data-msg-draft="' + esc(p.id) + '">초안 저장</button></div></details>'
      : "";
    var drafts = list.filter(function (m) { return m.author === "admin" && !m.sent_at; }).length;
    return '<details class="msgbox"' + (list.length ? " open" : "") + '><summary>광고주 메시지' +
      (drafts ? " · 초안 " + drafts : "") + " " + status + "</summary>" + thread + form + "</details>";
  }


  var PEOPLE = {};
  function loadPeople() {
    var ids = {};
    ROWS.forEach(function (p) {
      (p.approvals || []).forEach(function (a) { if (a.decided_by) ids[a.decided_by] = 1; });
      if (p.closed_by) ids[p.closed_by] = 1;
      (p.sents || []).forEach(function (e) { var u = e.payload && e.payload.by_uid; if (u) ids[u] = 1; });
      FLOW.forEach(function (st) {
        var r = SE().of(p, st.key); if (r && r.approved_by) ids[r.approved_by] = 1;
      });
    });
    var list = Object.keys(ids).filter(function (k) { return !PEOPLE[k]; });
    if (!list.length) return Promise.resolve();
    return db.rpc("onecue_people", { p_ids: list }).then(function (r) {
      (r.data || []).forEach(function (x) { PEOPLE[x.id] = x.email; });
    });
  }
  // ★ 이름을 personName 으로 — `who` 는 card() 안의 변수 이름이라 그 안에서 부르면 가려졌다(09-23 화면 깨짐)
  function personName(uid) {
    if (!uid) return "기록 없음";
    var e = PEOPLE[uid];
    return e ? e.split("@")[0] : String(uid).slice(0, 8);
  }
  function signoff(p, key) {
    var out = [];
    var r = SE().of(p, key);
    if (r && r.approved_at) out.push("승인 " + personName(r.approved_by) + " · " + hhmm(r.approved_at));
    var gate = (p.approvals || []).filter(function (a) { return a.gate === key; })[0];
    if (gate) out.push("광고주 " + (gate.decision === "ok" ? "승인" : "수정 요청") + " " +
      personName(gate.decided_by) + " · " + hhmm(gate.decided_at));
    if (key === "deliver") {
      var sent = (p.sents || []).filter(function (e) {
        return e.payload && e.payload.what === "final";
      })[0];
      if (sent) out.unshift("납품 " + personName(sent.payload.by_uid) + " · " + hhmm(sent.ts));
      if (p.closed_at) out.push("마감 " + personName(p.closed_by) + " · " + hhmm(p.closed_at));
    }
    return out.length ? '<small class="signoff">' + esc(out.join("  /  ")) + "</small>" : "";
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
    if (!authorized) return Promise.resolve();
    el("stamp").textContent = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);

    return db.from("projects")
      .select("id,slug,brand,product,step,state,running_sec,cut_count,aspects,created_at,ad_type,ad_type_by,render_mode,render_plan,render_mode_by,render_mode_at,closed_at,closed_by,channels")
      // ★ render_mode_at 을 안 읽어 오면 「수정사항 적용 완료」가 영원히
      //   안 뜬다 — 계획이 언제 손봐졌는지를 모르니 늘 「아직」이 되고,
      //   다시 뽑기 버튼이 계속 잠긴 채로 남는다. 화면이 쓰는 칸은
      //   반드시 조회에 있어야 한다.
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
          // kind·cut_n 을 같이 읽는다 — 콘티 단계가 「시각 콘티가 실제로 있는가」를
          // 데이터로 답해야 한다. 없는데 「완료」라고 적으면 그게 거짓 보고다
          // ★ 여기에 .eq("kind","product_ref") 가 박혀 있었다. 그래서 관리자 화면은
          //   **콘티 그림을 한 번도 불러온 적이 없다.** 증상이 셋으로 갈려 나왔는데
          //   원인은 이 한 줄이었다 —
          //     · 컷 글 옆 그림 자리가 늘 「그림 준비 전」이었고,
          //     · boardCounts.board 가 늘 0 이라 그림을 올려도 다음 자리로 안 갔고,
          //     · 「필요한 자료」가 제품 사진 말고는 아무것도 못 셌다.
          //   관리자는 그 건의 모든 자료를 보는 자리다. 종류로 미리 거르지 않는다.
          db.from("assets").select("id,project_id,role,kind,cut_n,url,storage_path,mime,meta,approved,created_at")
            .in("project_id", ids),
          db.from("contacts")
            // ★ 화면이 쓰는 칸은 반드시 조회에 있어야 한다 — 빠뜨리면
            //   값이 늘 undefined 라 링크가 조용히 안 뜬다
            .select("project_id,name,email,phone,title,homepage")
            .in("project_id", ids),
          db.from("jobs").select("project_id,step,kind,request").in("state", ["queued", "claimed"])   // kind — 콘티 그림(image)이 도는 중인지 화면이 알아야 버튼을 잠근다 (09-24)   // 작업기가 가져간(claimed) 작업도 「쓰는 중」이다
            .in("project_id", ids),
          db.from("briefs").select("project_id,raw,goal,target,format").in("project_id", ids),
          // 승인하면서 남긴 말도 놓치면 안 된다. 반려만 보면 반쪽이다
          db.from("approvals").select("project_id,gate,decision,note,decided_at,decided_by")
            .in("project_id", ids).order("decided_at", { ascending: false }),
          // 우리가 마지막으로 넘긴 시각 — 광고주 말을 처리했는지 가르는 기준
          db.from("events").select("project_id,ts,payload").eq("kind", "sent")
            .in("project_id", ids).order("ts", { ascending: false }),
          db.from("events").select("project_id,kind,to_step,ts,payload")
            .in("kind", ["production_enroll_requested", "production_enrolled", "astra_draft",
              // 작업기가 멈췄다 / 다시 돌았다 — 화면에 「어디서 왜 멈췄나」를 띄운다 (09-24)
              "worker_stopped", "worker_retry", "facts_written", "board_made", "order_written", "anchors_skipped"])
            .in("project_id", ids).order("ts", { ascending: false }),
          // 실제로 나간 크레딧. 예상은 계획에 있고, 이건 쓴 것이다.
          db.from("credit_spend").select("project_id,step,engine,credits,what,spent_at,outcome")
            .in("project_id", ids).order("spent_at"),
          db.from("product_facts").select("project_id,facts,label_text,claims,product_lock,device_note")
            .in("project_id", ids),
          db.from("strategies").select("project_id,insight,insight_flip,usp,one_message,tone,direction,written_by,client_who,client_what,client_why,client_feel")
            .in("project_id", ids),
          // axis·payoff·is_chosen 이 빠져 있었다. 그래서 고른 안을 전체폭으로 펼치는
          // 배치가 한 번도 걸리지 않았고(is_chosen 이 늘 undefined), 카드의 「이렇게
          // 끝난다」도 비어 있었다. 화면이 쓰는 칸은 화면이 읽어 와야 한다.
          db.from("concepts")
            .select("project_id,key,title,client_one_line,client_explain," +
              "client_appeal,client_mood,client_difference," +
              "axis,body,hook,visual,payoff,risk," +
              "is_recommended,reco_reason,is_chosen")
            .in("project_id", ids),
          db.from("jobs").select("project_id,response,finished_at").eq("state", "ok")
            .in("project_id", ids).order("finished_at", { ascending: false }),
          // 단계별 실행 주체 — 줄이 없는 단계는 예전 그대로 AI 다
          db.from("stage_executors")
            .select("project_id,step,mode,assignee,reviewer_model,reviewer_note,state," +
              "delivered_at,delivered_note,client_summary,plain_language_ok," +
              // 상태기계가 보는 네 시각. 이것이 없으면 phase() 는 늘 「고르세요」로
              // 판정한다 — 골랐다는 사실도, 시작했다는 사실도 화면에 없기 때문이다.
              // ★ ai_job_id 가 「지금 돌고 있다」의 증거다. 이걸 안 읽어 오면
              //   화면이 돌고 있는 줄을 모르고 **다시 뽑기 버튼을 또 내민다** —
              //   누르면 크레딧이 두 번 나간다 (Dan 2026-09-22 지적).
              //   화면이 판단에 쓰는 칸은 반드시 조회에 있어야 한다.
              //   ★ pressed_at 은 **지워지지 않는 누름 기록**이다 (051).
              //     started_at 은 「지금 돌고 있다」는 뜻도 같이 져서, 일이 끝나
              //     화면을 놓아 줄 때 지워진다. 그걸 기준선으로 쓰다가 기준이
              //     옛 수정 요청 시각까지 밀렸고, **이미 죽은 2판이 「지금 판」으로
              //     되살아났다** (Dan: 「V2랑 V3 둘다 아래쪽에 잇어서 몰랏네」).
              "chosen_at,started_at,pressed_at,approved_at,approved_by,directions,directions_at," +
              "revision_at,revision_note,ai_job_id")
            .in("project_id", ids),
          // 구성·각본 결과 — 등록되면 그 단계 안에서 상세로 펼친다
          db.from("developments").select("project_id,arc,copies,narration_tone,slogan,bgm")
            .in("project_id", ids),
          // 콘티 컷 — 광고주 화면과 같은 공용 렌더로 같은 구조로 편다.
          // admin_cuts 는 board.js 가 이미 쓰는 관리자용 보기다
          db.from("admin_cuts")
            .select("project_id,n,t_start,t_end,block,who,action,dialogue,intent," +
              "size,angle,move,lens,inherits,face,note")
            .in("project_id", ids).order("n"),
          // ★ 017 이 더한 칸은 **따로** 읽는다. 위 줄에 섞으면 017 적용 전 서버에서
          // 「없는 칸」 때문에 실행 주체 조회 전체가 실패해 화면에서 기능이 통째로 사라진다.
          // 따로 읽으면 017 전에는 이 칸만 비고 나머지는 예전 그대로 뜬다
          db.from("stage_executors").select("project_id,step,ai_job_id,chosen_at,started_at")
            .in("project_id", ids),
          // 컷마다·겹마다 낸 판단. 기록은 쌓이므로 최신 한 줄이 지금 상태다.
          db.from("stage_reviews")
            .select("project_id,step,layer,cut_n,decision,note,decided_at")
            .in("project_id", ids).order("decided_at"),
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
          var spends = out[8].data || [];
          var productFacts = out[9].data || [];
          var strategies = out[10].data || [];
          var concepts = out[11].data || [];
          var completedJobs = out[12].data || [];
          // ★ 번호로 꺼내면 반드시 어긋난다. 실제로 어긋나 있었다 (2026-09-22):
          //   jobLinks 가 **컷 목록**을, reviewRows 가 **실행기 목록**을 받고
          //   있었다. 그래서 「지금 돌고 있다」를 못 읽어 다시 뽑기 버튼이 또
          //   떴고(누르면 45 크레딧이 두 번), 검수 기록도 못 읽었다.
          //
          //   조회를 하나 끼워 넣을 때마다 그 아래 번호가 전부 밀리는데,
          //   밀린 것을 눈으로 세어 고치는 일은 언젠가 틀린다. **이름으로
          //   꺼낸다** — 순서가 바뀌어도 이름은 안 바뀐다.
          function pick(name, n) {
            var r = out[n];
            if (!r || r.error) return [];   // 그 표가 아직 없는 서버도 있다
            return r.data || [];
          }
          var stageRows = pick("stage_executors", 13);
          var developments = pick("developments", 14);
          var cutRows = pick("admin_cuts", 15);
          var jobLinks = pick("stage_executors(ai_job_id)", 16);
          var reviewRows = pick("stage_reviews", 17);
          jobLinks.forEach(function (link) {
            stageRows.forEach(function (row) {
              if (row.project_id === link.project_id && row.step === link.step) {
                row.ai_job_id = link.ai_job_id;
              }
            });
          });

          ROWS.forEach(function (p) {
            p.stageExecutors = SE().byProject(stageRows, p.id);
            p.development = developments.filter(function (x) { return x.project_id === p.id; })[0] || null;
            p.cuts = cutRows.filter(function (x) { return x.project_id === p.id; });
            // 이 단계에 이미 결과가 있는가 — 기능이 생기기 전에 끝난 건을
            // 「선택 대기」로 되돌리지 않기 위한 증거다. 아무것도 되돌리지 않는다
            p.reviews = reviewRows.filter(function (x) { return x.project_id === p.id; });
            // ★ p.files 는 아래에서 채워졌는데 여기서 먼저 세고 있었다. 그래서
            //   board 는 **항상 0** 이었다 — 그림이 다 올라와 있어도 화면은
            //   「아직 그림이 없다」고 판단했다. 세려면 먼저 채운다.
            p.files = files.filter(function (f) { return f.project_id === p.id; });
            p.boardCounts = {
              cuts: p.cuts.length,
              // ★ 콘티 그림에 「수정 요청」을 했으면 그 전에 그린 시트는 세지 않는다 — 세면 검수 칸에서 멈추고
              //   「콘티 뽑기」가 다시 안 뜬다 (09-24). 광고주에게 이미 보낸(approved) 것은 그대로 센다.
              board: p.files.filter(function (f) { return boardCurrent(p, f); }).length,
              // 보냈는가. approved 가 광고주 노출 스위치라, 콘티가 하나라도
              // 켜져 있으면 광고주는 이미 보고 있다.
              boardSent: p.files.some(function (f) {
                return f.kind === "board" && f.approved;
              }),
              boardRunning: !!(p.job && p.job.step === "storyboard" && p.job.kind === "image"),
            };
            p.stageResults = {
              develop: !!p.development,
              // 후반: 완성본(final)이 올라왔고 검수가 붙었으면 결과다
              post: p.files.some(function (f) {
                var rv = (f.meta || {}).review || "";
                return f.kind === "final" && f.url && !held(f) && rv && rv !== "pending";
              }),
              storyboard: p.cuts.length > 0,
              // ★ 유료 단계도 「결과가 왔는가」를 봐야 승인 자리가 뜬다.
              //   이게 없어서 앵커를 올려도 화면은 계속 「시작하세요」였다.
              // ★ 독립 검수에서 걸린 것은 **결과가 아니다.** 이것을 결과로 세면
              //   검수가 막아 둔 것에 승인 버튼이 뜬다 — 실제로 그랬다.
              //   관리자는 걸린 것을 승인할 수 있어서는 안 된다.
              // ★ 걸린 것(blocked)과 **물어볼 것이 남은 것(ask)** 은 결과가 아니다.
              //   결과로 세면 승인 버튼이 뜨고, 관리자가 아직 안 정해진 것을
              //   승인하게 된다. ASK 는 답하기 전까지 다음이 없다.
              anchors: p.files.some(function (f) {
                return f.kind === "anchor" && !isMaterial(f) && !held(f) && !superseded(p, "anchors", f);
              }),
              video: p.files.some(function (f) {
                return (f.kind === "clip" || f.kind === "final") && !held(f) &&
                  !superseded(p, "video", f);
              }),
            };
            counts.forEach(function (t, i) {
              var d = cs[i].data || [];
              p[t[1]] = d.filter(function (x) { return x.project_id === p.id; }).length;
            });
            p.who = people.filter(function (c) { return c.project_id === p.id; })[0] || null;
            // 「새 의뢰」는 접수 단계에서 제품·자료 확인을 기다리는 건만 뜻한다.
            // 후속 단계의 재작업 job이 queued여도 새 의뢰로 되돌려 표시하지 않는다.
            p.isNew = p.step === "brief" && jobs.some(function (j) {
              return j.project_id === p.id && j.step === "facts";
            });
            p.job = jobs.filter(function (j) { return j.project_id === p.id; })[0] || null;
            // 광고주가 내린 판단 전부. 「말을 남겼는가」와 「무엇을 정했는가」는
            // 다른 물음이라 따로 둔다 — 아래 p.redo 는 말이 있는 것만 고른다.
            p.approvals = revises.filter(function (a) { return a.project_id === p.id; });
            // 단계마다 얼마 썼나. 합계는 화면이 더한다 — 더하는 값은 칼럼이라야
            // 빠진 값과 0 을 구별할 수 있다.
            p.spends = spends.filter(function (x) { return x.project_id === p.id; });
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
            // 가장 최근 작업기 소식이 「멈춤」이면 그 이유를 카드 맨 위에 띄운다. 그 뒤에 다른 소식(성공·다시 돌림)이 있으면 지난 일이다
            p.stopped = (function () {
              var mine = enrollEvents.filter(function (e) {
                return e.project_id === p.id && ["worker_stopped", "worker_retry", "facts_written", "board_made",
                  "order_written", "anchors_skipped", "astra_draft"].indexOf(e.kind) >= 0;
              });
              return mine.length && mine[0].kind === "worker_stopped" ? mine[0] : null;
            })();
            p.productionEnrolled = enrollEvents.filter(function (e) {
              return e.project_id === p.id && e.kind === "production_enrolled";
            })[0] || null;
            p.facts = productFacts.filter(function (f) { return f.project_id === p.id; })[0] || null;
            p.strategy = strategies.filter(function (s) { return s.project_id === p.id; })[0] || null;
            p.concepts = concepts.filter(function (c) { return c.project_id === p.id; });
            p.aiVersions = {};
            enrollEvents.forEach(function (e) {
              if (e.project_id !== p.id || e.kind !== "astra_draft" || !e.payload || !e.payload.executor) return;
              var versionStep = e.to_step || e.payload.target || "unknown";
              p.aiVersions[versionStep] = (p.aiVersions[versionStep] || 0) + 1;
            });
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
            p.aiNeedsReview = !!(p.latestAiAt && p.state === "pending" &&
              (!p.sentAt || new Date(p.latestAiAt) > new Date(p.sentAt)));
            var b = briefs.filter(function (x) { return x.project_id === p.id; })[0];
            if (b) {
              p.brief_raw = b.raw; p.brief_goal = b.goal;
              p.brief_target = b.target; p.brief_format = b.format;
            }
          });
          ROWS.forEach(function (p) {
            p.sents = sents.filter(function (e) { return e.project_id === p.id; });
          });
          setConn("ok", "새 의뢰 " + ROWS.filter(function (x) { return x.isNew; }).length);
          // 승인·납품한 사람 아이디 — 번호를 이메일로 (066). 실패해도 화면은 그린다
          return Promise.all([loadPeople(), loadMessages()]).then(render, render);
        });
      }).catch(function (e) {
        // ★ 이유를 삼키지 않는다. 이 catch 는 조회 실패만 잡는 게 아니라
        //   **그리는 중에 난 오류까지** 잡는다. 실제로 render 안의
        //   ReferenceError 가 여기로 떨어져 화면에는 「불러오지 못했습니다」만
        //   떴고, 조회가 죽은 것처럼 보였다. 이유를 못 보면 엉뚱한 데를 판다.
        if (window.console) console.error("admin load/render 실패", e);
        accessNotice('불러오지 못했습니다',
          '잠시 후 새로고침해 주세요. (' + String((e && e.message) || e) + ')', false);
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
      // ★ 「프로젝트로 돌아가기」가 index.html(메인)으로 가서 보던 건으로 못
      //   돌아왔다 (Dan 2026-09-23). 보던 화면을 그대로 다시 부르고, 관리자
      //   목록으로 가는 길을 따로 둔다.
      (login ? '<a class="btn" href="index.html">처음 화면</a>'
             : '<a class="btn" href="' + esc(location.href) + '">다시 불러오기</a>' +
               '<a class="btn ghost" href="admin.html">관리자 목록</a>') +
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
      return db.from("profiles").select("is_admin,admin_can_write")
        .eq("id", user.id).maybeSingle()
        .then(function (p) {
          if (p.error) throw p.error;
          if (!p.data || !p.data.is_admin) {
            accessNotice('관리자 전용 화면입니다', '현재 로그인한 계정은 관리자가 아닙니다. 의뢰와 진행 상황은 프로젝트 화면에서 확인해 주세요.', false);
            return false;
          }
          authorized = true;
          canWrite = p.data.admin_can_write !== false;
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
    // ★ 스스로 다시 읽기를 컴다. 이것을 안 부르면 함수만 있고 도지 않는다 —
    //   실제로 한 번 그랬다.
    autoReload();
    db.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') accessNotice('로그인이 필요합니다', '관리자 계정으로 로그인해 주세요.', true);
    });
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
