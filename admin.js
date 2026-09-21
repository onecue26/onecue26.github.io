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

  // 단계별 실행 주체 — stage-executor.js 가 판단을 쥔다.
  // 스크립트가 없으면 예전 그대로 전부 AI 로 본다(기능이 죽어도 흐름은 안 깨진다)
  function SE() {
    return window.ONECUE_STAGE || {
      ORDER: FLOW.map(function (x) { return x.key; }),
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

  // ── 실행 주체 고르기 ───────────────────────────────────────────────────────
  // 「AI 진행」은 지금까지와 똑같이 기존 jobs 큐로 간다.
  // 「담당자 진행」은 이름을 받고, 사람이 결과를 등록할 때까지 그 단계가 멈춘다.
  // 화면 조건문은 안내일 뿐이고 실제로 큐를 막는 건 DB 트리거다(migrate_016).
  function execPicker(p, key) {
    var s = SE(), pick = s.of(p, key);
    if (!s.editable(p, key)) return "";
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
    return '<div class="exec-pick" data-exec-form' + tag + '>' +
      '<b>이 단계를 누가 맡습니까(실행 주체)</b>' +
      '<div class="exec-modes">' +
      '<label><input type="radio" name="' + esc(name) + '" data-exec-mode value="ai"' +
      (human ? "" : " checked") + '><span>AI 진행 <small>기존 작업 큐로 등록</small></span></label>' +
      '<label' + (personOk ? "" : ' class="exec-mode-off"') +
      '><input type="radio" name="' + esc(name) + '" data-exec-mode value="human"' +
      (human ? " checked" : "") + (personOk ? "" : " disabled") +
      '><span>담당자 진행 <small>' +
      (personOk ? "사람이 결과를 올릴 때까지 대기" : offLabel) + '</small></span></label>' +
      '</div>' +
      (personOk ? "" : '<small class="exec-blocked">' + esc(pickable.note) + '</small>') +
      '<label class="exec-field"><span>담당자 이름</span>' +
      '<input type="text" data-exec-name maxlength="80" value="' + esc(pick.assignee) +
      '" placeholder="담당자 진행일 때만 필요합니다"></label>' +
      '<label class="exec-field"><span>결과를 검토하는 AI(핵심 검토 AI)</span>' +
      '<input type="text" data-exec-reviewer maxlength="120" value="' + esc(pick.reviewer_model) +
      '" placeholder="예 · anthropic claude-fable-5-1"></label>' +
      '<button class="btn ghost" type="button" data-exec-save' + tag + '>누가 맡는지 저장(실행 주체)</button>' +
      '<small>비워 두면 AI 진행입니다. 이미 시작된 AI 작업이 있으면 담당자로 바꿀 수 없습니다.</small>' +
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

  function flow(p, bodies) {
    var current = FLOW.map(function (x) { return x.key; }).indexOf(p.step);
    var history = p.aiHistory || [];
    function stageAi(key) {
      return history.filter(function (h) { return h.step === key; })[0] || null;
    }
    return '<div class="flow-wrap"><div class="flow-head"><span class="lbl">전체 제작 흐름</span>' +
      '<span class="now-owner">현재 담당 <b>' + esc(currentOwner(p)) + '</b></span></div>' +
      '<div class="flow-track">' + FLOW.map(function (s, i) {
        var status = i < current ? "done" : (i === current ? "current" : "upcoming");
        var marker = i < current ? "완료" : (i === current ? "현재" : (i + 1));
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
        var badge = waitingHere ? '<em class="ai-update working">담당자 결과 대기</em>'
          : (working ? '<em class="ai-update working">AI 재작업 중</em>'
          : (updated ? '<em class="ai-update done">NEW · 업데이트 완료</em>' : ''));
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
        // 아직 오지 않은 단계도 펼칠 수 있어야 한다 — 실행 주체는 미리 정해 두는 것이다
        var detail = '<div class="flow-detail"><span>수행 · ' + esc(worker) +
          '</span><span>결과를 검토하는 AI(핵심 검토 AI) · ' + esc(reviewer) + '</span>' +
          findingText + delivered +
          execPicker(p, s.key) + deliverBox(p, s.key) +
          (status === "upcoming" ? ''
            : (bodies[s.key] || '<p class="stage-empty">저장된 상세 내용이 없습니다.</p>')) +
          '</div>';
        return '<details class="flow-step ' + status + '"' + (status === "current" ? ' open' : '') + '>' +
          '<summary class="flow-summary"><span class="flow-marker">' + marker + '</span><strong>' +
          esc(STEP_NAME[s.key]) + '</strong>' + versionBadge + personBadge + badge +
          '<small>' + esc(s.owner) + '</small></summary>' + detail + '</details>';
      }).join("") + '</div></div>';
  }

  function readable(value) {
    if (value == null || value === "") return "입력 없음";
    if (Array.isArray(value)) return value.map(readable).join(" · ");
    if (typeof value === "object") {
      return Object.keys(value).map(function (key) {
        return key + " · " + readable(value[key]);
      }).join(" / ");
    }
    return String(value);
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
    } else if (SE().waiting(p, p.step)) {
      productionAction = '<span class="progress-state wait">담당자 진행 — 결과 등록 대기</span>';
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

    var conceptReview = "";
    if (p.concepts && p.concepts.length) {
      var strategyLine = p.strategy
        ? '<div class="review-strategy"><span>전략 한 줄</span><b>' + esc(p.strategy.one_message || "") + '</b>' +
          '<small>' + esc(p.strategy.insight || "") + '</small></div>'
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
      conceptReview = '<section class="concept-review"><div class="review-head"><span>' +
        (atConceptStage ? "관리자 검토" : "선택 완료 · 보관본") + '</span>' +
        '<h3>콘셉트 5안</h3><p>' + (atConceptStage
          ? "추천은 참고값입니다. 다섯 방향의 차이와 위험을 확인한 뒤 광고주에게 보내세요."
          : "이 프로젝트에서 실제로 제안하고 선택한 콘셉트 기록입니다.") + '</p></div>' +
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

    var factsBody = p.facts
      ? '<div class="stage-content"><dl class="stage-data">' +
        '<dt>확인된 사실</dt><dd>' + esc(readable(p.facts.facts)) + '</dd>' +
        '<dt>제품 잠금</dt><dd>' + esc(readable(p.facts.product_lock)) + '</dd>' +
        '<dt>표기 문구</dt><dd>' + esc(readable(p.facts.label_text)) + '</dd>' +
        '<dt>사용 가능한 주장</dt><dd>' + esc(readable(p.facts.claims)) + '</dd>' +
        (p.facts.device_note ? '<dt>제작 메모</dt><dd>' + esc(p.facts.device_note) + '</dd>' : '') +
        '</dl>' + files + '</div>'
      : '<p class="stage-empty">제품 자료는 등록됐지만 정리된 확인 내용이 없습니다.</p>' + files;
    var strategyBody = p.strategy
      ? '<div class="stage-content"><dl class="stage-data">' +
        '<dt>인사이트</dt><dd>' + esc(readable(p.strategy.insight)) + '</dd>' +
        '<dt>핵심 메시지</dt><dd>' + esc(readable(p.strategy.one_message)) + '</dd>' +
        '<dt>USP</dt><dd>' + esc(readable(p.strategy.usp)) + '</dd>' +
        '<dt>톤</dt><dd>' + esc(readable(p.strategy.tone)) + '</dd>' +
        '</dl></div>'
      : '<p class="stage-empty">저장된 전략 설계 내용이 없습니다.</p>';

    // 구성·각본 — 결과가 들어오기 전에는 「제작 중 / 대기」를 분명히 보여 주고,
    // 들어온 뒤에는 같은 단계 안에서 구조화된 상세로 바뀐다. 별도 화면으로 빼지 않는다
    var d = p.development;
    var hasDevelopment = !!(d && ((d.arc && d.arc.length) || (d.copies && d.copies.length) ||
      d.narration_tone || d.slogan));
    var developBody = hasDevelopment
      ? '<div class="stage-content"><dl class="stage-data">' +
        '<dt>이야기 흐름(전개 arc)</dt><dd>' + esc(readable(d.arc)) + '</dd>' +
        '<dt>화면 글자(카피)</dt><dd>' + esc(readable(d.copies)) + '</dd>' +
        '<dt>읽어 주는 목소리 느낌(나레이션 톤)</dt><dd>' + esc(readable(d.narration_tone)) + '</dd>' +
        '<dt>마지막 한 줄(슬로건)</dt><dd>' + esc(readable(d.slogan)) + '</dd>' +
        '<dt>생성 단계 음악(BGM)</dt><dd>' + (d.bgm ? "생성할 때 함께 사용" : "넣지 않음") + '</dd>' +
        '<dt>최종 편집 음악</dt><dd>' + (d.bgm
          ? "생성된 음악을 확인한 뒤 유지·교체 결정"
          : "전체 영상에 맞는 한 곡을 별도로 선택해 삽입") + '</dd>' +
        '</dl></div>'
      : (p.step === "develop" ? stageWait(p, "develop", "구성·각본") : "");

    var stageBodies = {
      brief: '<div class="stage-content">' + said + requirements + '</div>',
      facts: factsBody,
      strategy: strategyBody,
      concepts: conceptReview + check,
      develop: developBody,
      storyboard: p.step === "storyboard" ? productionAction : "",
      anchors: p.step === "anchors" ? productionAction : "",
      video: p.step === "video" ? productionAction : "",
      deliver: p.step === "deliver" ? productionAction : ""
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
      '</div><div class="project-summary-side"><span class="project-stage">' +
      esc(STEP_NAME[p.step] || p.step) + '</span><span class="fold-icon" aria-hidden="true">⌄</span></div></summary>' +
      '<div class="project-body"><div class="ways project-ways">' +
      (p.n_cuts
        ? '<a class="btn ghost" href="board.html?slug=' + encodeURIComponent(p.slug) +
          '">콘티 검수</a>'
        : "") +
      '<a class="btn ghost" href="' + esc(siteUrl(p.slug)) +
      '" target="_blank" rel="noopener">광고주 화면 ↗</a></div>' +
      redo + who +
      '<div class="mailbox" id="mail-' + esc(p.slug) + '" hidden></div>' +
      flow(p, stageBodies) + "</div></details>";
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

    // 실행 주체 — 담당자를 고르면 이름 칸이 필요해진다
    document.querySelectorAll("[data-exec-form]").forEach(function (f) { syncExecForm(f); });
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
        setStageExecutor(b.dataset.slug, b.dataset.step, mode, name, rev)
          .then(load)
          .catch(function (e) {
            b.disabled = false; b.textContent = label;
            window.alert("누가 맡는지(실행 주체) 저장하지 못했습니다 — " + (e.message || e));
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

  // 1차 검수를 마쳤다 → 광고주 차례로 넘긴다. 이때 비로소 광고주 화면에 버튼이 뜬다.
  //
  // ★ 쉬운말 게이트가 여기에도 선다. AI 가 만든 글도 똑같이 본다 — 담당자 등록분만
  //   보는 게 아니다. 걸리면 보내지 않고, 통과든 차단이든 검사 사실을 기록한다.
  //   (지금은 화면이 막는다. DB 로 옮기는 안은 README §8-5 에 있다)
  function send(slug) {
    var p = ROWS.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return Promise.reject(new Error("건을 찾지 못했습니다"));
    var gate = SE().sendGate(p);
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
        .then(function () {
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
          db.from("product_facts").select("project_id,facts,label_text,claims,product_lock,device_note")
            .in("project_id", ids),
          db.from("strategies").select("project_id,insight,insight_flip,usp,one_message,tone")
            .in("project_id", ids),
          db.from("concepts").select("project_id,key,title,body,hook,visual,risk,is_recommended,reco_reason")
            .in("project_id", ids),
          db.from("jobs").select("project_id,response,finished_at").eq("state", "ok")
            .in("project_id", ids).order("finished_at", { ascending: false }),
          // 단계별 실행 주체 — 줄이 없는 단계는 예전 그대로 AI 다
          db.from("stage_executors")
            .select("project_id,step,mode,assignee,reviewer_model,reviewer_note,state," +
              "delivered_at,delivered_note,client_summary,plain_language_ok")
            .in("project_id", ids),
          // 구성·각본 결과 — 등록되면 그 단계 안에서 상세로 펼친다
          db.from("developments").select("project_id,arc,copies,narration_tone,slogan,bgm")
            .in("project_id", ids),
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
          var productFacts = out[8].data || [];
          var strategies = out[9].data || [];
          var concepts = out[10].data || [];
          var completedJobs = out[11].data || [];
          // 표가 아직 없는 서버(마이그레이션 016 이전)에서도 화면은 그대로 떠야 한다
          var stageRows = (out[12] && !out[12].error && out[12].data) || [];
          var developments = (out[13] && !out[13].error && out[13].data) || [];

          ROWS.forEach(function (p) {
            p.stageExecutors = SE().byProject(stageRows, p.id);
            p.development = developments.filter(function (x) { return x.project_id === p.id; })[0] || null;
            counts.forEach(function (t, i) {
              var d = cs[i].data || [];
              p[t[1]] = d.filter(function (x) { return x.project_id === p.id; }).length;
            });
            p.files = files.filter(function (f) { return f.project_id === p.id; });
            p.who = people.filter(function (c) { return c.project_id === p.id; })[0] || null;
            // 「새 의뢰」는 접수 단계에서 제품·자료 확인을 기다리는 건만 뜻한다.
            // 후속 단계의 재작업 job이 queued여도 새 의뢰로 되돌려 표시하지 않는다.
            p.isNew = p.step === "brief" && jobs.some(function (j) {
              return j.project_id === p.id && j.step === "facts";
            });
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
