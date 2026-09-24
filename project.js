// onecue — 건 상세
//
// 광고주가 보는 화면이다. 지금 어디까지 왔는지 보여주고,
// 판단할 자리(5안 선택 · 콘티 승인)에서만 버튼을 띄운다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  // MINE — 이 건을 넣은 광고주 본인인가.
  // 판단하는 자리(5안 선택·콘티 승인)는 광고주의 것이다. 관리자가 대신 누르면 안 된다
  var cfg = window.ONECUE || {}, db = null, P = null, MINE = false, LOGGED_IN = false;

  // 내부 단계 순서. **이름은 우리 것이라 화면에 쓰지 않는다** — 순서를 비교하는
  // 데만 쓴다(IDX). 광고주가 보는 이름과 칸은 아래 CLIENT_FLOW 가 정한다.
  var STEPS = [
    ["brief", "의뢰 접수"], ["facts", "제품·자료 확인"], ["strategy", "전략 설계"],
    ["concepts", "콘셉트 5안"], ["develop", "구성·각본"], ["storyboard", "콘티 승인"],
    ["anchors", "제작 자료"], ["video", "영상 제작"], ["post", "후반 작업"],
    ["deliver", "납품"],
  ];
  // ★ 후반(post)이 빠져 있었다 — 후반으로 넘어간 건이 처음이라 몰랐다. 순서표에 없으면
  //   IDX 가 비어 「0번 = 의뢰 접수」로 돌아가고 아래 칸이 전부 사라졌다 (Dan 09-23:
  //   「광고주 화면 다 박살나잇는데? 진행상황안맞고」).
  var IDX = {}; STEPS.forEach(function (s, i) { IDX[s[0]] = i; });
  // 광고주가 판단하는 자리 — 여기서만 버튼이 뜬다
  var GATES = { strategy: "검토", concepts: "선택", storyboard: "승인", video: "승인" };
  var HAS_FINAL = false;
  // 콘티 그림이 실제로 올라와 있는가. 그림 없이 콘티 승인을 묻지 않기 위한 값이다
  var BOARD_READY = false;

  // ★ 광고주는 자기에게 넘어온 것까지만 본다.
  //   전에는 DB 에 있는 걸 그냥 다 그렸다. 그래서 우리가 아직 검수도 안 한 콘티가
  //   광고주 화면에 떴다 — 1차 검수를 넣은 의미가 없어진다.
  //   지나간 단계는 보이고, 지금 단계는 「광고주에게 보내기」를 눌러야 보인다.
  function shown(step) {
    if (!P) return false;
    if (IDX[P.step] > IDX[step]) return true;      // 이미 지나간 단계
    if (P.step !== step) return false;             // 아직 오지 않은 단계
    return P.state === "ready";                    // 지금 단계 — 넘겼는가
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  function setConn(k, t) {
    var p = el("conn"); p.className = "pill" + (k ? " " + k : "");
    p.innerHTML = '<span class="dot"></span>' + esc(t);
  }
  function qs(k) {
    return new URLSearchParams(location.search).get(k);
  }

  // 이 건을 이 브라우저에 기억해 둔다 — 주소를 잃어버려도 첫 화면에서 다시 찾도록.
  // 단 내 건일 때만. 남의 건을 열어봤다고 「내가 넣은 의뢰」에 쌓이면 안 된다
  function remember(p) {
    if (!MINE && LOGGED_IN) return;
    try {
      var k = "onecue.mine";
      var list = JSON.parse(localStorage.getItem(k) || "[]");
      if (list.some(function (x) { return x.slug === p.slug; })) return;
      list.unshift({ slug: p.slug, brand: p.brand, product: p.product, at: Date.now() });
      localStorage.setItem(k, JSON.stringify(list.slice(0, 30)));
    } catch (e) { /* 사생활 보호 모드 — 기억 못 해도 진행에 지장 없다 */ }
  }

  // ── 광고주가 보는 흐름은 여섯 칸 ──────────────────────────────────────────
  // 내부 아홉 단계를 그대로 보여 주면 「전략 설계」·「구성·각본」·「제작 자료」
  // 같은 우리 말이 광고주 화면에 그대로 뜬다. 그건 광고주가 겪는 일이 아니라
  // 우리가 일하는 순서다. 광고주가 실제로 지나는 여섯 칸으로 옮긴다.
  // 막대와 아래 상자가 **같은 표**를 본다 — 둘이 다른 말을 하면 안 된다.
  var CLIENT_FLOW = [
    { key: "ask",    name: "의뢰 접수",   from: ["brief", "facts"] },
    { key: "pick",   name: "콘셉트 선택", from: ["strategy", "concepts"] },
    { key: "design", name: "제작 설계",   from: ["develop"] },
    { key: "board",  name: "콘티 확인",   from: ["storyboard"] },
    { key: "making", name: "영상 제작",   from: ["anchors", "video", "post"] },
    { key: "done",   name: "납품",        from: ["deliver"] },
  ];

  function clientAt(step) {
    for (var i = 0; i < CLIENT_FLOW.length; i++) {
      if (CLIENT_FLOW[i].from.indexOf(step) >= 0) return i;
    }
    return 0;
  }

  // 막대가 가리키는 칸과 열려 있는 상자는 **같아야 한다.**
  // 내부 단계가 storyboard 여도 콘티 그림이 아직 없으면 광고주가 볼 것은
  // 「제작 설계 진행 중」뿐이다. 그때 막대만 「콘티 확인」으로 가 있으면
  // 「확인하라면서 볼 게 없다」가 된다. 막대를 볼 것에 맞춘다.
  function clientNow() {
    // 프로젝트를 닫으면(068) 막대 전부 「완료」 — 마지막 칸이 빨갛게 남아 진행 중처럼 보였다
    if (P && P.state === "done") return CLIENT_FLOW.length;
    var i = clientAt(P ? P.step : "brief");
    var board = CLIENT_FLOW.findIndex
      ? CLIENT_FLOW.findIndex(function (s) { return s.key === "board"; })
      : 3;
    if (i === board && !BOARD_READY) return board - 1;
    return i;
  }

  function bar(step) {
    var at = clientNow();
    void step;
    return '<div class="progress-scroll"><div class="bar">' + CLIENT_FLOW.map(function (s, i) {
      return '<i class="' + (i < at ? "done" : i === at ? "now" : "") + '"></i>';
    }).join("") + "</div><div class=\"stepnames\">" +
      CLIENT_FLOW.map(function (s, i) {
        return '<span class="' + (i < at ? "done" : i === at ? "now" : "") + '">' +
          esc(s.name) + "</span>";
      }).join("") +
      "</div></div>";
  }

  // ── 각 구역 ───────────────────────────────────────────────────────────────
  // 아직 작업을 시작하기 전이면 광고주가 스스로 고칠 수 있어야 한다.
  // 전략을 짜기 시작한 뒤에 내용이 바뀌면 앞뒤가 어긋나므로 그때는 잠근다
  function canEditBrief(p) {
    return p.step === "brief" || p.step === "facts";
  }

  function secBrief(b, editable) {
    if (!b) return "";
    var head = "<h2>의뢰 내용" + (editable
      ? ' <button class="btn ghost" id="editBrief" style="margin-left:auto">고치기</button>'
      : "") + "</h2>";
    return head + '<div class="panel" id="briefPanel"><dl class="kv">' +
      (b.raw ? "<dt>제품 설명</dt><dd>" + nl(b.raw) + "</dd>" : "") +
      (b.goal ? "<dt>목표</dt><dd>" + esc(b.goal) + "</dd>" : "") +
      (b.target ? "<dt>대상</dt><dd>" + esc(b.target) + "</dd>" : "") +
      (b.format ? "<dt>형식</dt><dd>" + esc(String(b.format).split(/(\s*·\s*)/).map(korName).join("")) + "</dd>" : "") +
      "</dl></div>";
  }

  function openBriefEditor(b) {
    el("briefPanel").innerHTML =
      '<label class="ed-l">제품 설명</label>' +
      '<textarea id="edRaw" class="ed-t">' + esc(b.raw || "") + "</textarea>" +
      '<label class="ed-l">목표</label>' +
      '<input id="edGoal" class="ed-i" value="' + esc(b.goal || "") + '">' +
      '<label class="ed-l">대상</label>' +
      '<input id="edTarget" class="ed-i" value="' + esc(b.target || "") + '">' +
      '<div class="actions" style="margin-top:14px">' +
      '<button class="btn" id="saveBrief">저장</button>' +
      '<button class="btn ghost" id="cancelBrief">취소</button>' +
      '<span class="msg" id="edMsg"></span></div>';

    el("cancelBrief").addEventListener("click", load);
    el("saveBrief").addEventListener("click", function () {
      el("saveBrief").disabled = true;
      el("edMsg").textContent = "저장 중…";
      db.from("briefs").update({
        raw: el("edRaw").value.trim(),
        goal: el("edGoal").value.trim() || null,
        target: el("edTarget").value.trim() || null,
      }).eq("project_id", P.id).then(function (r) {
        if (r.error) {
          el("saveBrief").disabled = false;
          el("edMsg").className = "msg err";
          el("edMsg").textContent = "저장 실패 — " + r.error.message;
          return;
        }
        db.from("events").insert({
          project_id: P.id, kind: "brief_edit", payload: { by: "client" },
        }).then(load);
      });
    });
  }

  // 광고주가 보낸 자료 — 잘 도착했는지 본인이 확인할 수 있어야 한다
  // 완성본 — ★관리자가 검수해 넘긴 것만 뜬다 (approved).
  // 여태 만들자마자 이 화면에 올라갔다. 순서가 거꾸로였다 (Dan 2026-09-08)
  function secFinal(assets) {
    var v = (assets || []).filter(function (a) {
      return a.kind === "final" && a.approved;
    });
    if (!v.length) return "";
    return "<h2>완성본</h2><div class=\"clips\">" + v.map(function (c) {
      return '<figure class="clip"><video src="' + esc(c.url) +
        '" controls playsinline preload="metadata" data-big="' + esc(c.url) +
        '" data-kind="vid"></video><figcaption>' + esc(c.role || "완성본") +
        "</figcaption></figure>";
    }).join("") + "</div>";
  }

  // 광고주가 보낸 것만 고른다. 시스템이 만든 앵커·콘티·영상은 여기가 아니다.
  // 누가 올린 것인지는 계약(ad-type-materials.js)이 kinds[].by 로 들고 있다 —
  // 여기서 목록을 또 적으면 종류를 늘릴 때 한 곳을 빠뜨린다.
  function clientKinds() {
    var spec = window.ONECUE_AD_TYPE_MATERIALS;
    if (!spec || !spec.kinds) return { product_ref: 1 };
    var out = {};
    Object.keys(spec.kinds).forEach(function (k) {
      var by = spec.kinds[k].by;
      if (by === "client" || by === "both") out[k] = 1;
    });
    return out;
  }

  function kindLabel(kind) {
    var spec = window.ONECUE_AD_TYPE_MATERIALS;
    var k = spec && spec.kinds && spec.kinds[kind];
    return (k && k.label) || kind;
  }

  /** 종류별로 몇 개나 받았나. 모자란 것을 세는 쪽과 보여주는 쪽이 같은 수를 본다. */
  function clientCounts(assets) {
    var mine = clientKinds();
    var counts = {};
    (assets || []).forEach(function (a) {
      if (!mine[a.kind]) return;
      counts[a.kind] = (counts[a.kind] || 0) + 1;
    });
    return counts;
  }

  function secFiles(assets) {
    var mine = clientKinds();
    var f = (assets || []).filter(function (a) { return !!mine[a.kind]; });
    if (!f.length) return "";
    return "<h2>보내주신 자료 " + f.length + "</h2><div class=\"files\">" +
      f.map(function (a) {
        var img = (a.mime || "").indexOf("image/") === 0;
        var name = a.role || kindLabel(a.kind);
        return '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
          (img ? '<img src="' + esc(a.url) + '" alt="' + esc(name) + '" loading="lazy">'
               : '<span class="doc">' + esc(kindLabel(a.kind)) + "</span>") +
          "<em>" + esc(name) + "</em></a>";
      }).join("") + "</div>";
  }

  // ── 무엇이 더 필요한가 ────────────────────────────────────────────────────
  //
  // 자료가 모자라도 여태 아무도 말하지 않았다. 그냥 지어내고 넘어갔다.
  // 요가학원 사진이 두 장인데 컷이 여섯이면 없는 각도 네 개를 만들어 낸다 —
  // 그러면 손님이 찾아갔을 때 다른 곳이다. 모자란 것을 말하는 일은 거절이
  // 아니라 **더 받으면 제대로 만들 수 있다**는 말이고, 그 말을 할 자리가
  // 여태 없었다.
  //
  // 종류를 광고주에게 고르라고 하지 않는다. 우리가 의뢰 글을 읽고 판단한
  // 값을 보여 주고, 틀렸으면 말해 달라고만 한다.
  function secNeeds(assets, cuts) {
    var G = window.ONECUE_MATERIAL_GAPS;
    if (!G || !P.ad_type) return "";
    // ★ 광고주 말투로 받는다. 우리끼리 쓰는 이름(product_ref)과 말(생성·컷)은
    //   이 화면에 나오면 안 된다 — 실제로 그대로 나갔었다 (Dan 2026-09-22).
    var out = G.text(G.gaps(clientCounts(assets), P.ad_type,
                     (cuts && cuts.length) || P.cut_count || 0), "client");
    if (!out) return "";
    var guessed = String(P.ad_type_by || "").indexOf("ai:") === 0;
    var head = '<h2>필요한 자료</h2><div class="panel needs">' +
      '<p class="need-type">이 의뢰를 <b>' + esc(out.label) + "</b>로 보고 있습니다." +
      (guessed ? " 다르면 알려주시면 바꿉니다." : "") + "</p>";
    if (!out.blocking.length && !out.notes.length) {
      return head + '<p class="need-ok">필요한 자료가 다 도착했습니다.</p></div>';
    }
    function list(items, cls) {
      return '<ul class="' + cls + '">' + items.map(function (t) {
        var lines = t.split(/\r?\n/).map(function (x) { return x.trim(); });
        return "<li>" + esc(lines[0]) +
          lines.slice(1).map(function (x) {
            return '<span class="need-why">' + esc(x) + "</span>";
          }).join("") + "</li>";
      }).join("") + "</ul>";
    }
    return head +
      (out.blocking.length
        ? "<h4>이게 있어야 정직하게 만들 수 있습니다</h4>" + list(out.blocking, "need-block")
        : "") +
      (out.notes.length ? "<h4>알려드립니다</h4>" + list(out.notes, "need-note") : "") +
      "</div>";
  }

  // ── 읽기 렌더는 관리자 화면과 **같은 모듈**을 쓴다 ─────────────────────────
  // 같은 데이터가 화면마다 다르게 보이던 것을 없앤다. 역할만 다르다 —
  // 광고주에게는 내부 메모·AI 기록·위험 메모가 애초에 만들어지지 않는다.
  // 모듈이 없으면 예전처럼 평범한 글로 떨어진다(화면이 비지는 않는다).
  function R() {
    return window.ONECUE_RENDER || {
      strategy: function (s) {
        return '<div class="stage-read strategy"><p>' +
          esc([s && s.one_message, s && s.insight].filter(Boolean).join(" ")) + "</p></div>";
      },
      concept: function (c) {
        return '<article class="cc"><header class="cc-head"><span class="k">' +
          esc((c && c.key) || "") + "안</span><span class=\"t\">" +
          esc((c && c.title) || "") + "</span></header></article>";
      },
      development: function () { return ""; },
      cuts: function () { return ""; },
    };
  }
  var CLIENT = { role: "client" };

  // 매체·형식 코드를 광고주가 읽는 말로 (09-24 검수: 「youtube tv ooh」 「youtube_shorts」가 그대로 보였다)
  var KOR = {
    youtube: "유튜브", meta: "인스타·페북", tiktok: "틱톡", tv: "TV", web: "웹사이트", ooh: "매장·옥외",
    youtube_instream: "유튜브 인스트림", youtube_video: "유튜브 일반 영상", youtube_shorts: "유튜브 쇼츠",
    meta_feed: "인스타·페북 피드", meta_reels: "릴스·스토리", tiktok_feed: "틱톡 피드",
    tv_spot: "방송 광고", ctv_spot: "스마트TV", web_hero: "웹사이트 메인", web_product: "제품 페이지",
    ooh_screen: "전광판", store_signage: "매장 화면",
  };
  function korName(x) { return KOR[String(x).trim()] || x; }

  // ★ 전략은 내부 문서다. 인사이트·강점·톤은 우리가 어떻게 판단했는지를 적은
  //   것이지 광고주가 결정할 자리가 아니다(단계 계약 v1 §3 — 공개: 관리자 전용).
  //   함수는 남겨 둔다. 부르는 곳이 없어야 새지 않는다 — 지우면 되살아날 뿐이다.
  function secStrategy(s) {
    if (!s) return "";
    return "<h2>전략</h2><div class=\"panel\">" + R().strategy(s, CLIENT) + "</div>";
  }

  // ★ 광고주에게는 **상태와 완료 안내만** 나간다.
  //   전개·카피·나레이션 톤·슬로건·BGM 의 원문은 내보내지 않는다 — 광고주용
  //   요약 칸도 명시적인 공유 게이트도 아직 없기 때문이다(Codex 검수 2026-09-21).
  //   그래서 이 화면은 결과 줄을 **조회하지도 않고** 인자로 받지도 않는다.
  //   받을 수 없으니 흘릴 수도 없다. 공용 모듈의 development() 는 지우지 않았고
  //   관리자 화면이 계속 쓴다 — 광고주용 요약이 생기면 그때 이 자리에 더한다.
  function secDevelop(done) {
    return "<h2>구성·각본</h2><div class=\"panel\">" +
      R().developmentNotice(done ? "done" : "working") + "</div>";
  }

  // ── 콘셉트 선택 뒤부터 시각 콘티 발송 전까지는 한 구간이다 ──────────────────
  // 광고주 화면을 내부 9단계와 1:1 로 맞추지 않는다. 구성·각본을 짜는 일과
  // 콘티를 준비하는 일은 광고주가 판단할 자리가 없는 내부 작업이라, 둘을
  // 쪼개 보여 주면 「구성·각본 준비 완료」 같은 내부 진행만 늘어놓게 된다.
  // 볼 것이 생기기 전까지는 상태 한 줄이다.
  function secDesigning() {
    return '<h2>제작 설계</h2><div class="panel">' +
      '<div class="stage-read development-notice">' +
      '<section class="stage-block status"><h4>제작 설계 진행 중입니다</h4>' +
      "<p>고르신 방향으로 장면 구성과 콘티를 준비하고 있습니다. " +
      "보실 것이 준비되면 이 화면에 올라옵니다.</p></section></div></div>";
  }

  // ── 광고주가 보는 흐름은 여섯 칸이다 ──────────────────────────────────────
  //
  // 내부 제작 단계는 아홉이지만 광고주가 판단할 자리는 그중 셋뿐이다. 나머지는
  // 「지금 이걸 하고 있다」는 상태다. 그래서 내부 단계와 1:1 로 맞추지 않고,
  // 광고주가 실제로 겪는 여섯 칸으로 묶는다 (Codex seq198).
  //
  // 그리고 **접는다.** 지금까지는 의뢰 내용·콘셉트·제작 설계·보내주신 자료가
  // 한 줄로 죽 늘어서 있어서, 지금 볼 것이 무엇인지가 그 속에 묻혔다.
  // 지금 칸만 열려 있고 지난 칸은 한 줄로 접힌다 — 눌러서 언제든 다시 본다.
  // 상자에 이미 제목이 있는데 안쪽 구역이 또 제목을 달면 같은 말이 두 번 나온다.
  // 구역 함수들은 상자 밖에서도 쓰이므로 제목을 지우지 않고, 상자에 넣을 때만 뗀다.
  function stripHead(html) {
    return String(html || "").replace(/^\s*<h2>[\s\S]*?<\/h2>/, "");
  }

  // 상태 색 — 빨강: 광고주가 할 일 · 파랑: 진행 중 · 초록: 끝남 · 주황: 수정 중 (brand.css · 09-23)
  function stClass(t) {
    return /차례|부탁|확인하실/.test(t) ? "st-act" : /완료|접수됨/.test(t) ? "st-done"
      : /수정|다시/.test(t) ? "st-fix" : "st-run";
  }

  function box(key, title, state, body, open) {
    body = stripHead(body);
    if (!body.trim()) return "";
    // 닫은 프로젝트(068)의 납품 칸은 펼쳐 두되 「지금 할 일」 강조(빨강)는 빼다
    var closedOpen = key === "done" && P && P.state === "done";
    if (closedOpen) open = false;
    return '<details class="cstep' + (open ? " now" : "") + '"' + (open || closedOpen ? " open" : "") +
      ' data-step="' + esc(key) + '">' +
      '<summary class="cstep-head"><span class="cstep-t">' + esc(title) + "</span>" +
      (state ? '<span class="cstep-s ' + stClass(state) + '">' + esc(state) + "</span>" : "") +
      '<span class="cstep-x" aria-hidden="true"></span></summary>' +
      '<div class="cstep-body">' + body + "</div></details>";
  }

  // 여섯 칸을 순서대로 세운다. 각 칸은 **볼 것이 있을 때만** 나온다 —
  // 빈 상자는 「아직 안 했다」가 아니라 「무엇인지 모르겠다」로 읽힌다.
  // 지금 칸 하나만 열려 있다. 그 판단은 여기 한 곳에서만 한다.
  function flow(x) {
    var brief = x[0].data, concepts = x[2].data, cuts = x[3].data, assets = x[4].data, strat = x[1].data, approvals = x[5].data;
    var at = IDX[P.step] == null ? 0 : IDX[P.step];
    var boardOpen = BOARD_READY && shown("storyboard");
    // 광고주 칸 → 그 칸이 「지금」인 내부 단계
    var now = {
      ask: P.step === "brief",
      pick: P.step === "concepts" || P.step === "strategy" || P.step === "facts",   // 기획 시작 뒤엔 콘셉트 칸이 지금 칸
      design: P.step === "develop" || (P.step === "storyboard" && !boardOpen),
      board: P.step === "storyboard" && boardOpen,
      making: P.step === "anchors" || P.step === "video" || P.step === "post",
      done: P.step === "deliver" || HAS_FINAL,
    };
    return [
      box("ask", "의뢰 내용", P.step === "brief" ? "접수됨" : "확정",
        // 「필요한 자료」는 광고주에게 보이지 않는다 — 가진 자료 안에서 만든다 (Dan 09-24). 관리자 화면에만 참고로
        secBrief(brief, MINE && canEditBrief(P)) + secFiles(assets), now.ask),
      // 콘셉트 — 보내기 전(준비 중)·보낸 뒤(고르실 차례)·고른 뒤(선택 완료) (09-24)
      box("pick", "콘셉트 선택",
        (concepts || []).some(function (c) { return c.is_chosen; }) ? "선택 완료"
          : (P.step === "concepts" && P.state === "ready") ? "고르실 차례" : "준비 중",
        shown("concepts")
          ? secDirection(strat) + secConcepts(concepts, MINE && P.step === "concepts" && P.state === "ready")
          : (P.step === "concepts" || P.step === "strategy" || P.step === "facts"
            ? '<div class="stage-read development-notice"><section class="stage-block status"><h4>콘셉트를 준비하고 있습니다</h4>' +
              "<p>보내 주신 내용과 답을 반영해 다섯 가지 안을 만들고 있습니다. 준비되면 여기서 고르실 수 있습니다.</p></section></div>"
            : ""),
        now.pick),
      // ★ 상태 글자를 박아 두지 않는다. 「진행 중」으로 고정돼 있어서 영상
      //   제작 중인 건에도 제작 설계가 「진행 중」이라고 떴다 (Dan 2026-09-23).
      box("design", "제작 설계", now.design ? "진행 중" : "완료",
        // 지난 뒤에도 칸은 남긴다 — 콘티가 뜨자 이 칸이 통째로 사라졌다
        now.design ? secDesigning()
          : (shown("develop") ? '<p class="muted">제작 설계를 마쳤습니다. ' +
            "설계한 컷은 아래 콘티에서 보실 수 있습니다.</p>" : ""), now.design),
      box("board", "콘티 확인", now.board ? "확인하실 차례" : "확인 완료",
        boardOpen ? secCuts(cuts, assets) + boardAsk(P, approvals) : "", now.board),
      // ★ 지나간 뒤에도 칸은 남긴다 — 납품 단계로 넘어가자 「영상 제작」 칸이 통째로 사라졌다(09-23).
      //   펼친 내용은 한 줄이면 된다 (Dan 09-23: 「너무 디테일하게 알려줄 필요없는」)
      box("making", "영상 제작", now.making ? "진행 중" : "완료",
        (now.making || at >= IDX.deliver)
          ? '<div class="stage-read development-notice"><section class="stage-block status">' +
            (now.making
              ? "<h4>영상 제작 중입니다</h4><p>완성되면 이 화면에서 바로 보실 수 있습니다.</p>"
              : "<h4>영상 제작을 마쳤습니다</h4>") + "</section></div>"
          : "",
        now.making),
      // 납품 — 관리자가 보내기 전(준비 중) · 보낸 뒤(확인하실 차례) · 승인 뒤(완료)가 다르게 보인다 (065)
      box("done", "납품",
        P.state === "ready" ? "확인하실 차례" : (P.state === "done" ? "완료" : (P.state === "idle" ? "승인 완료" : "준비 중")),
        P.step !== "deliver" ? ""
          : P.state === "ready" && HAS_FINAL
            ? secFinal(assets) + deliverForm()
          : (P.state === "idle" || P.state === "done")
            ? secFinal(assets) + '<p class="muted">승인해 주셔서 감사합니다. 완성본은 이 화면에서 언제든 받으실 수 있습니다.</p>'
          : '<div class="stage-read development-notice"><section class="stage-block status">' +
            "<h4>납품을 준비하고 있습니다</h4><p>납품되면 이 화면에서 확인하실 수 있습니다.</p></section></div>",
        now.done),
    ].join("");
  }

  // ── onecue 에서 온 메시지 (070) — 요청 조정 제안 · 자료 요청 · 설명. 그 자리에서 답한다 ──
  var MSG_KIND = { change: "요청 조정 제안", materials: "자료 요청", explain: "안내", reply: "보내신 답" };
  function secMessages(list) {
    list = list || [];
    if (!list.length) return "";
    var last = list[list.length - 1];
    var open = last.author === "admin";            // 우리 말이 마지막이면 답을 기다리는 중
    // 답할 차례일 때만 펼친다 — 계속 떠 있으면 다음 단계가 안 보인다 (Dan 09-24 「계속 메시지창이뜨게하지말고」)
    return '<details class="msgs"' + (open ? " open" : "") + '><summary><h2>' +
      (open ? "onecue 에서 온 메시지 — 답을 기다립니다" : "주고받은 메시지 " + list.length + "건") + "</h2></summary>" + list.map(function (m) {
      return '<div class="msg ' + (m.author === "admin" ? "in" : "out") + '"><div class="msg-head"><b>' +
        esc(MSG_KIND[m.kind] || m.kind) + "</b> · " + esc(m.sent_at ? new Date(m.sent_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16) : "") +
        '</div><div class="msg-body">' + esc(m.body) + "</div>" +
        (m.author === "client"
          ? '<div class="msg-done">' + (m.digest && m.digest.summary
              ? "반영했습니다 · " + esc(m.digest.summary)
              : "보내 주신 답을 반영하고 있습니다") + "</div>" : "") + "</div>";
    }).join("") +
      (MINE ? '<div class="msg-reply"><textarea id="msgReply" rows="3" maxlength="4000" placeholder="' +
        (open ? "답을 적어 주세요" : "더 하실 말씀이 있으면 적어 주세요") + '"></textarea>' +
        // 첨부 — 자료를 요청받으면 답하면서 바로 올린다 (Dan 09-23 「첨부자료도 추가하도록」)
        '<div class="msg-attach"><select id="msgFileKind"><option value="product_ref">제품 사진</option>' +
        '<option value="mood_ref">참고 이미지·영상</option><option value="doc">문서·기타</option></select>' +
        '<input type="file" id="msgFiles" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.zip"></div>' +
        '<button class="btn" id="msgSend" data-reply-to="' + esc(last.id) + '">보내기</button>' +
        '<span class="hint" id="msgMsg" role="status" aria-live="polite"></span></div>' : "") + "</details>";
  }

  function deliverForm() {
    if (!MINE) return "";
    return '<div class="gate col"><div class="txt"><b>납품되었습니다</b>' +
      '<small>완성본을 확인하시고 승인해 주세요. 고칠 곳이 있으면 적어 주세요.</small></div>' +
      '<label for="finalNote">남기실 말씀</label>' +
      '<textarea id="finalNote" maxlength="1000" placeholder="고칠 곳이 있으면 적어 주세요"></textarea>' +
      '<div class="acts"><button class="btn" id="approveFinal">확인했습니다 · 승인</button>' +
      '<button class="btn ghost" id="reviseFinal">고쳐주세요</button></div>' +
      '<span class="hint" id="finalMsg" role="status" aria-live="polite"></span></div>';
  }

  /** 「공통 기획 방향」 — 5안이 모두 이 방향 위에서 나왔다. 고른 뒤에도 남긴다 (Dan 09-24)
   *  내부 전략(인사이트·강점·톤 문단)은 보여 주지 않는다 — 쉬운 말 세 줄만 */
  function secDirection(s) {
    if (!s || !(s.client_who || s.client_what || s.client_why || s.client_feel)) return "";
    var row = function (k, v) { return v ? "<li><b>" + k + "</b><span>" + esc(v) + "</span></li>" : ""; };
    return '<div class="direction"><h3>공통 기획 방향</h3><p class="dir-sub">다섯 가지 안 모두 이 방향 위에서 만들었습니다.</p><ul>' +
      row("누구에게", s.client_who) + row("무슨 말을", s.client_what) + row("왜 이 방향인가", s.client_why) +
      row("어떤 느낌으로", s.client_feel) + "</ul>" +
      "</div>";
  }

  function secConcepts(list, canPick) {
    if (!list || !list.length) return "";
    var chosen = list.filter(function (c) { return c.is_chosen; })[0];
    function card(c) {
      // 「이걸로 하겠습니다」는 데이터가 아니라 이 화면의 버튼이다.
      // 공용 렌더에는 actions 로 넘긴다 — 기록에서 온 글은 여기로 들어가지 않는다
      var pick = (canPick && !c.is_chosen)
        ? '<button class="btn ghost pickbtn" data-pick="' + esc(c.key) + '">이걸로 하겠습니다</button>'
        : "";
      return R().concept(c, { role: "client", actions: pick });
    }
    var head = "<h2>컨셉 5안" + (chosen ? " — 선택 완료" : "") + "</h2>";
    if (chosen) {
      var others = list.filter(function (c) { return !c.is_chosen; });
      return head + '<div class="chosen-summary"><span class="chosen-label">선택한 방향</span>' +
        card(chosen) + "</div>" +
        (others.length ? '<details class="other-concepts"><summary>다른 제안 ' + others.length +
          '개 다시 보기</summary><div class="concepts">' + others.map(card).join("") + "</div></details>" : "");
    }
    return head + '<p class="section-guide">제목을 먼저 보고, 관심 가는 안의 핵심 아이디어와 첫 장면을 비교해 주세요.</p>' +
      '<div class="concepts">' + list.map(card).join("") + redoCard(canPick) + "</div>";
  }

  // 여섯 번째 카드 — 다섯 개가 다 아닐 수 있다.
  // 골라야만 넘어가는 화면은 마음에 안 드는 안을 억지로 고르게 만든다.
  // 메모는 비워도 된다. 비면 우리가 축을 바꿔 다시 잡는다
  function redoCard(canPick) {
    if (!canPick) return "";
    return '<div class="cc redo">' +
      '<span class="k">재요청</span>' +
      '<span class="t">원하는 방향이 없나요?</span>' +
      '<span class="b">억지로 고르지 않으셔도 됩니다. 의견을 주시면 다섯 가지를 새로 만들어 드립니다.</span>' +
      '<textarea id="redoNote" maxlength="500" ' +
      'placeholder="원하시는 방향이 있으면 적어주세요 — 안 적으셔도 됩니다&#10;&#10;예 · 아이가 나오는 건 피하고 싶습니다&#10;예 · 하와이를 더 보여주면 좋겠습니다&#10;예 · B안 방향은 좋은데 더 밝았으면"></textarea>' +
      '<span class="hint">비워두시면 저희가 축을 바꿔 다시 잡습니다.</span>' +
      '<button class="btn ghost" id="redoBtn">의견과 함께 5안 다시 요청</button>' +
      '<span class="hint" id="redoMsg"></span>' +
      "</div>";
  }

  function askRedo(note) {
    return decide("concepts", "revise", note);
  }

  // ⚠️ 영상을 맨 위에 따로 나열하던 절은 **없앴다** (Dan 2026-09-08).
  //    컷 줄에도 같은 영상이 붙으므로 같은 것이 두 번 보였고,
  //    판이 늘수록 위쪽이 이름만 잔뜩 늘어선 목록이 되어 알아볼 수 없었다.
  //    영상은 **컷 줄에서만** 본다. 크게 보려면 눌러서 연다(openBig).

  // 콘티 시트 한 장 — 컷을 하나씩 보기 전에 전체를 먼저 본다
  function secBoard(assets) {
    var sheet = (assets || []).filter(function (a) {
      return a.kind === "board" && a.cut_n == null;
    })[0];
    if (!sheet) return "";
    return "<h2>콘티 시트</h2>" +
      '<div class="board"><img src="' + esc(sheet.url) + '" alt="콘티 시트" loading="lazy">' +
      "<p>이 시트는 <b>컷 순서와 구도를 정하는 자료</b>입니다. " +
      "실제 영상은 승인 후 컷마다 다시 만들기 때문에 그림이 이것과 똑같지는 않습니다.</p></div>";
  }

  // 컷 한 줄에 그림 셋 — 콘티(계획) · 완성(이미지) · 영상(움직임).
  // 영상 한 판은 컷 여러 개를 덮으므로 meta.cuts 로 어느 줄에 붙을지 정한다
  function shots(n, board, anchor, clips) {
    var b = board[n], a = anchor[n];
    // ⚠️ 한 컷이 **여러 조각**으로 나뉠 수 있다 — 자른 앞·뒤가 둘 다 쓸 것이면 둘 다 보여야 한다.
    //    예전에는 [0] 하나만 그려서 나머지가 화면에서 사라졌다 (Dan 2026-09-08)
    var vs = (clips || []).filter(function (c) {
      var m = (c.meta && c.meta.cuts) || [];
      return m.indexOf(n) >= 0;
    });
    if (!b && !a && !vs.length) return '<div class="noimg-n">' + n + "</div>";
    // ★ 빈 칸을 자리까지 만들어 「대기」라고 적어 두지 않는다. 그건 우리 공정의
    //   자리표시다. 광고주 화면에서는 「뭔가 비어 있다」로만 읽히고, 아직 하지
    //   않은 일을 못 한 일처럼 보이게 한다. 없는 것은 안 보이는 게 맞다.
    function pic(label, x, cls) {
      if (!x) return "";
      return '<figure class="' + cls + ' on">' +
        '<img src="' + esc(x.url) + '" alt="컷 ' + n + '" loading="lazy"' +
        ' data-big="' + esc(x.url) + '" data-kind="img">' +
        "<figcaption>" + label + "</figcaption></figure>";
    }
    // 영상 칸 — 조각이 여럿이면 세로로 쌓는다. 이름(role)을 밑에 적어야 무엇인지 안다
    function vids() {
      if (!vs.length) return "";
      return vs.map(function (x) {
        return '<figure class="made on"><video src="' + esc(x.url) +
          '" controls playsinline preload="metadata" data-big="' + esc(x.url) +
          '" data-kind="vid"></video><figcaption>' +
          esc(x.role || "영상") + "</figcaption></figure>";
      }).join("");
    }
    // 칸 수는 **있는 것**이 정한다. 셋으로 고정해 두면 없는 둘이 빈칸으로 남는다.
    var v = vids();
    var shown = [pic("콘티", b, "plan"), pic("완성", a, "made"),
                 v ? '<div class="vidcol">' + v + "</div>" : ""].filter(Boolean);
    return '<div class="shots' + (shown.length > 1 ? " three" : " one") + '">' +
      shown.join("") + "</div>";
  }

  // 눌러서 크게 보기 — 작은 칸에서는 판정이 안 된다.
  // 화면 전체를 덮고, 아무 데나 누르거나 ESC 로 닫는다
  function openBig(url, kind) {
    var w = document.createElement("div");
    w.className = "big";
    w.innerHTML = kind === "vid"
      ? '<video src="' + esc(url) + '" controls autoplay playsinline></video>'
      : '<img src="' + esc(url) + '" alt="크게 보기">';
    function close() {
      w.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    w.addEventListener("click", function (e) {
      // 영상 조작(재생·탐색)은 닫지 않는다 — 바깥을 눌러야 닫힌다
      if (e.target === w) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(w);
  }

  // 컷 줄은 다시 그려지므로 개별 요소가 아니라 문서에 한 번만 건다
  document.addEventListener("dblclick", function (e) {
    var t = e.target.closest && e.target.closest("[data-big]");
    if (t) { e.preventDefault(); openBig(t.getAttribute("data-big"), t.getAttribute("data-kind")); }
  });
  document.addEventListener("click", function (e) {
    // 그림은 한 번 눌러 연다. 영상은 재생 버튼과 겹치므로 두 번 눌러 연다
    var t = e.target.closest && e.target.closest('img[data-big]');
    if (t) openBig(t.getAttribute("data-big"), "img");
  });

  function secCuts(cuts, assets) {
    if (!cuts || !cuts.length) return "";
    var board = {}, anchor = {}, clips = [];
    (assets || []).forEach(function (a) {
      if (a.kind === "clip") { clips.push(a); return; }
      if (a.cut_n == null) return;
      if (a.kind === "board" && !board[a.cut_n]) board[a.cut_n] = a;
      if (a.kind === "anchor" && !anchor[a.cut_n]) anchor[a.cut_n] = a;
    });
    var made = Object.keys(anchor).length;
    // ★ 콘티 시트(한 장)가 있으면 광고주에게는 그 한 장만 보인다 — 흐름이 한눈에 읽히게 (Dan 09-24)
    //   컷별로 잘라 둔 그림은 관리자 검수용이다. 시트가 없던 옛 건(RUSH)은 아래 컷별 보기 그대로.
    // 광고주 쪽 자료 조회에는 만든 시각 칸이 없다(권한 칸을 늘리면 조회 전체가 깨질 수 있다) — 마지막으로 온 것을 쓴다
    var sheets = (assets || []).filter(function (a) { return a.kind === "board" && a.cut_n == null && a.url; });
    var sheet = sheets[sheets.length - 1];
    if (sheet) {
      return "<h2>콘티</h2>" +
        '<p class="board-note">콘티는 광고의 <b>흐름</b>을 보여 드리는 밑그림입니다. 실제 영상의 화면 구성·각도·인물·배경은 ' +
        '제작하면서 더 좋게 달라질 수 있고, 제품의 모양과 색은 보내 주신 사진 그대로 지킵니다.</p>' +
        '<div class="board-sheet-client"><img src="' + esc(sheet.url) + '" data-big="' + esc(sheet.url) +
        '" alt="콘티 — ' + cuts.length + '개 장면"></div>';
    }
    // 글 구조는 공용 렌더가 만든다. 그림 칸만 이 화면이 만든다 —
    // 주소와 권한이 화면마다 다르기 때문이다(공용 모듈은 URL 을 그리지 않는다)
    return "<h2>콘티 " + cuts.length + "컷" +
      (made ? " — 만든 컷 " + made + "개" : "") + "</h2>" +
      // 콘티는 흐름을 보여 주는 밑그림이다 — 그대로 영상이 되는 것이 아니라는 것을 알린다 (Dan 09-24)
      '<p class="board-note">콘티는 광고의 <b>흐름</b>을 보여 드리는 밑그림입니다. 실제 영상의 화면 구성·각도·인물·배경은 ' +
      '제작하면서 더 좋게 달라질 수 있고, 제품의 모양과 색은 보내 주신 사진 그대로 지킵니다.</p>' +
      R().cuts(cuts, CLIENT, function (c) { return shots(c.n, board, anchor, clips); });
  }

  // 지금 광고주가 무엇을 해야 하나
  /** 콘티 승인 칸 — 콘티 확인 칸 안, 시트 바로 아래 (09-24) */
  function boardAsk(p, approvals) {
    var done = {};
    (approvals || []).forEach(function (a) { if (a.decision === "ok") done[a.gate] = a; });
    if (p.step === "storyboard" && p.state === "ready" && !done.storyboard && BOARD_READY) {
      if (!MINE) return "";
      var rev = (approvals || []).filter(function (a) {
        return a.gate === "storyboard" && a.decision === "revise";
      });
      return '<div class="gate col"><div class="txt"><b>콘티를 확인해주세요</b>' +
        "<small>위 콘티 흐름대로 만듭니다. 승인하시면 제작에 들어갑니다." +
        (rev.length ? " 앞서 주신 말씀은 반영해서 다시 올렸습니다." : "") +
        "</small></div>" +
        '<textarea id="boardNote" maxlength="1000" ' +
        'placeholder="고치실 곳이나 하고 싶은 말씀을 적어주세요 — 안 적으셔도 됩니다&#10;&#10;' +
        '예 · 4번 컷 봉지 글자가 이상합니다&#10;' +
        '예 · 아이 얼굴이 나왔으면 좋겠습니다&#10;' +
        '예 · 마지막 자막을 「이름 그대로」로 줄여주세요"></textarea>' +
        '<div class="acts">' +
        '<button class="btn" id="approveBoard">콘티 승인</button>' +
        '<button class="btn ghost" id="reviseBoard">고쳐주세요</button>' +
        '<span class="hint">적으신 내용은 승인하실 때도 같이 전달됩니다.</span>' +
        "</div></div>";
    }
    return "";
  }

  function secGate(p, approvals) {
    // 「고쳐주세요」도 approvals 에 남는다. 그걸 통과로 세면
    // 다시 만들어 올린 뒤에도 「승인 완료」라고 뜬다 — 통과는 ok 만이다
    var done = {};
    (approvals || []).forEach(function (a) { if (a.decision === "ok") done[a.gate] = a; });

    // 다시 만들어 달라고 하셨으면, 그 말이 접수됐다는 걸 보여준다.
    // 버튼을 눌렀는데 화면이 그대로면 눌린 건지 알 수 없다
    var redos = (approvals || []).filter(function (a) {
      return a.gate === p.step && a.decision === "revise";
    });
    if (redos.length && GATES[p.step] && p.state !== "ready") {
      var last = redos[redos.length - 1];
      var said = last.note || "";
      var blank = said.indexOf("방향 지정 없음") === 0 || said.indexOf("내용 없음") >= 0;
      return '<div class="gate"><div class="txt"><b>다시 만들고 있습니다</b>' +
        "<small>" + (p.step === "concepts"
          ? "새 다섯 가지가" : p.step === "video" ? "고친 영상이" : "고친 콘티가") + " 준비되면 이 화면에 올라옵니다." +
        (blank ? "" : "<br>주신 말씀 · " + esc(said)) +
        "</small></div></div>";
    }

    // 광고주 본인이 아니면 버튼을 주지 않는다. 판단은 대신 눌러 줄 수 없다
    var look = '<div class="gate look"><div class="txt"><b>광고주가 판단할 차례입니다</b>' +
      "<small>이 자리의 버튼은 의뢰하신 분에게만 보입니다. 관리자는 내용만 확인합니다." +
      "</small></div></div>";

    if (p.step === "concepts" && p.state === "ready" && !done.concepts) {
      if (!MINE) return look;
      return '<div class="gate"><div class="txt"><b>컨셉을 골라주세요</b>' +
        "<small>다섯 가지 방향을 준비했습니다. 하나를 고르시면 그 방향으로 콘티를 만듭니다.</small>" +
        "</div></div>";
    }
    // 콘티에 「고쳐주세요」만 있고 무엇을 고칠지 적을 데가 없었다.
    // 승인이냐 반려냐만 받으면 우리는 어디가 틀렸는지 모른 채 다시 짜게 된다
    // 그림이 없으면 승인을 묻지 않는다. 컷 표만 놓고 「승인하시면 제작에
    // 들어갑니다」라고 하면, 광고주는 보지도 못한 화면을 승인하는 셈이 된다.
    // 콘티 승인 칸은 맨 위가 아니라 콘티 확인 칸 안에 있다 — boardAsk() (Dan 09-24 「따로 놀고 있어」)
    //   맨 위에는 차례만 짧게 알린다 — 비워 두면 「작업 중입니다 · 하실 일 없음」이 떨어져 거꾸로 말했다
    if (p.step === "storyboard" && p.state === "ready" && !done.storyboard && BOARD_READY) {
      if (!MINE) return look;
      return '<div class="gate"><div class="txt"><b>콘티를 확인해 주실 차례입니다</b>' +
        "<small>아래 「콘티 확인」 칸에서 보시고 승인하시거나 고칠 곳을 적어 주세요.</small></div></div>";
    }
    if (p.step === "video" && p.state === "ready" && HAS_FINAL) {
      if (!MINE) return look;
      return '<div class="gate col"><div class="txt"><b>완성본을 확인해주세요</b>' +
        '<small>승인하시면 납품을 준비합니다.</small></div>' +
        '<label for="videoNote">남기실 말씀</label>' +
        '<textarea id="videoNote" maxlength="1000" placeholder="수정 요청 시 고칠 내용을 적어주세요"></textarea>' +
        '<div class="acts"><button class="btn" id="approveVideo">영상 승인</button>' +
        '<button class="btn ghost" id="reviseVideo">고쳐주세요</button></div>' +
        '<span class="hint" id="videoMsg" role="status" aria-live="polite"></span></div>';
    }
    // ★ 제작·납품은 맨 위에 띄우지 않는다 — 목록 칸(영상 제작 → 납품)에서 순서대로 보인다.
    //   맨 위에 「영상 제작 완료」를 따로 띄웠다가 Dan: 「맨위에 쌩뚱맞게」 「순서대로 가야할꺼아냐」 (09-23)
    if (p.step === "anchors" || p.step === "video" || p.step === "post" || p.step === "deliver") return "";
    if (done.storyboard) {
      return '<div class="gate done"><div class="txt"><b>콘티 승인 완료</b>' +
        "<small>제작에 들어갑니다. 영상이 준비되면 여기에 올라옵니다.</small>" +
        "</div></div>";
    }
    if (p.step === "develop" && done.concepts) {
      var chosenKey = String(done.concepts.note || "").match(/^([A-Z])안/);
      return '<div class="gate done"><div class="txt"><b>' +
        (chosenKey ? chosenKey[1] + "안 선택 완료" : "컨셉 선택 완료") + '</b>' +
        '<small>선택하신 방향으로 구성과 각본을 만들고 있습니다. 다음 확인 단계가 준비되면 이 화면이 바뀝니다.</small>' +
        '</div></div>';
    }
    return '<div class="gate done"><div class="txt"><b>작업 중입니다</b>' +
      "<small>준비되면 이 화면에 올라옵니다. 광고주가 하실 일은 없습니다.</small></div></div>";
  }

  // ── 동작 ──────────────────────────────────────────────────────────────────
  function pickConcept(key) {
    return decide("concepts", "ok", key + "안 선택", key);
  }

  function decide(gate, decision, note, key) {
    return db.rpc("onecue_decide", {
      p_project_id: P.id, p_gate: gate, p_decision: decision,
      p_note: note || "", p_concept_key: key || null,
    }).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  function decideBoard(decision) {
    var box = el("boardNote");
    var note = box ? (box.value || "").trim() : "";
    return decide("storyboard", decision, note);
  }

  function wire() {
    var av = el("approveVideo"), vr = el("reviseVideo");
    function videoDecision(decision) {
      if (!MINE || !HAS_FINAL || P.step !== "video" || P.state !== "ready" || av.disabled) return;
      var note = el("videoNote").value.trim();
      if (decision === "revise" && !note) {
        el("videoMsg").textContent = "고칠 내용을 적어주세요.";
        el("videoNote").focus();
        return;
      }
      av.disabled = vr.disabled = true;
      el("videoMsg").textContent = "처리 중…";
      decide("video", decision, note).then(load).catch(function () {
        av.disabled = vr.disabled = false;
        el("videoMsg").textContent = "저장하지 못했습니다. 진행 상태를 확인한 뒤 다시 시도해주세요.";
      });
    }
    var ms = el("msgSend");
    if (ms) ms.addEventListener("click", function () {
      var body = (el("msgReply").value || "").trim();
      var files = el("msgFiles") ? Array.prototype.slice.call(el("msgFiles").files || []) : [];
      var kind = el("msgFileKind") ? el("msgFileKind").value : "product_ref";
      if (!body && !files.length) { el("msgMsg").textContent = "보낼 말을 적거나 파일을 골라 주세요."; return; }
      ms.disabled = true; el("msgMsg").textContent = files.length ? "파일을 올리는 중…" : "보내는 중…";
      // 파일을 먼저 올리고(의뢰 때와 같은 방식 · 광고주가 올린 자료 칸에 붙는다) 답에 첨부 목록을 적는다
      Promise.all(files.map(function (file) {
        var ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
        var key = P.id + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + "." + ext;
        return db.storage.from("uploads").upload(key, file, { contentType: file.type }).then(function (r) {
          if (r.error) throw r.error;
          var url = db.storage.from("uploads").getPublicUrl(key).data.publicUrl;
          return db.from("assets").insert({ project_id: P.id, kind: kind, role: file.name, storage_path: key,
            url: url, mime: file.type, bytes: file.size, meta: { by: "client", via: "message" } })
            .then(function (saved) { if (saved.error) throw saved.error; return file.name; });
        });
      })).then(function (names) {
        var text = (body || "(자료를 보냅니다)") + (names.length ? "\n\n[첨부 " + names.length + "개] " + names.join(", ") : "");
        return db.rpc("onecue_message_reply", { p_project_id: P.id, p_body: text, p_reply_to: ms.dataset.replyTo || null });
      })
        .then(function (r) { if (r.error) throw r.error; return load(); })
        .catch(function () { ms.disabled = false; el("msgMsg").textContent = "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요."; });
    });
    var fa = el("approveFinal"), fr = el("reviseFinal");
    function finalDecision(decision) {
      if (!MINE || !HAS_FINAL || P.step !== "deliver" || P.state !== "ready" || fa.disabled) return;
      var note = el("finalNote").value.trim();
      if (decision === "revise" && !note) {
        el("finalMsg").textContent = "고칠 내용을 적어주세요.";
        el("finalNote").focus();
        return;
      }
      fa.disabled = fr.disabled = true;
      el("finalMsg").textContent = "처리 중…";
      db.rpc("onecue_final_decide", { p_project_id: P.id, p_decision: decision, p_note: note })
        .then(function (r) { if (r.error) throw r.error; return load(); })
        .catch(function () {
          fa.disabled = fr.disabled = false;
          el("finalMsg").textContent = "저장하지 못했습니다. 진행 상태를 확인한 뒤 다시 시도해주세요.";
        });
    }
    if (fa) fa.addEventListener("click", function () { finalDecision("ok"); });
    if (fr) fr.addEventListener("click", function () { finalDecision("revise"); });
    if (av) av.addEventListener("click", function () { videoDecision("ok"); });
    if (vr) vr.addEventListener("click", function () { videoDecision("revise"); });
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "고르는 중…";
        pickConcept(b.dataset.pick).then(load).catch(function (e) {
          b.disabled = false; b.textContent = "실패 — " + e.message;
        });
      });
    });
    var rd = el("redoBtn");
    if (rd) rd.addEventListener("click", function () {
      var note = (el("redoNote").value || "").trim();
      rd.disabled = true; rd.textContent = "보내는 중…";
      askRedo(note).then(load).catch(function (e) {
        rd.disabled = false; rd.textContent = "다시 부탁드립니다";
        var m = el("redoMsg"); if (m) m.textContent = "실패 — " + e.message;
      });
    });

    var ap = el("approveBoard"), rv = el("reviseBoard");
    if (ap) ap.addEventListener("click", function () {
      ap.disabled = true; ap.textContent = "처리 중…";
      decideBoard("ok").then(load).catch(function (e) {
        ap.disabled = false; ap.textContent = "실패 — " + e.message;
      });
    });
    // 「고쳐주세요」는 무엇을 고칠지 적어야 눌린다 — 빈칸이면 우리가 어디를 고칠지 모른다 (09-24)
    var bn = el("boardNote");
    if (rv && bn) {
      var syncRv = function () { rv.disabled = !(bn.value || "").trim(); rv.title = rv.disabled ? "고칠 곳을 적으시면 눌립니다" : ""; };
      bn.addEventListener("input", syncRv);
      syncRv();
    }
    if (rv) rv.addEventListener("click", function () {
      if (bn && !(bn.value || "").trim()) return;
      rv.disabled = true;
      decideBoard("revise").then(load).catch(function (e) {
        rv.disabled = false; rv.textContent = "실패 — " + e.message;
      });
    });

    var z = el("zoom"), zi = el("zoomImg");
    document.querySelectorAll(".cut img, .board img").forEach(function (i) {
      i.addEventListener("click", function () { zi.src = i.src; z.classList.add("on"); });
    });
    z.addEventListener("click", function () { z.classList.remove("on"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") z.classList.remove("on");
    });
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
    P = null; MINE = false; HAS_FINAL = false; BOARD_READY = false;
    var slug = qs("slug");
    if (!slug) { el("main").innerHTML = '<div class="empty">건을 지정하지 않았습니다</div>'; return; }

    var user;
    function denied() {
      setConn("", "접근 제한");
      el("main").innerHTML = '<div class="empty"><span class="big">볼 수 없는 건입니다</span>' +
        '<p>의뢰하신 계정으로 로그인했는지 확인해주세요.</p><a class="btn ghost" href="index.html">목록으로</a></div>';
    }
    return db.auth.getUser().then(function (auth) {
      user = auth.data && auth.data.user;
      if (!user) {
        location.replace("login.html?next=" + encodeURIComponent("project.html" + location.search));
        return null;
      }
      if (auth.error) throw auth.error;
      LOGGED_IN = true;
      return db.from("projects").select("id,client_id,slug,brand,product,running_sec,cut_count,aspect,aspects,channels,step,state,ad_type,ad_type_by,closed_at").eq("slug", slug).maybeSingle();
    })
      .then(function (r) {
        if (!r) return;
        if (r.error) throw r.error;
        if (!r.data) { denied(); return; }
        P = r.data;
        return Promise.all([
          db.from("clients").select("owner_id").eq("id", P.client_id).maybeSingle(),
          db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
        ]).then(function (access) {
        access.forEach(function (r) { if (r.error) throw r.error; });
        var admin = !!(access[1].data && access[1].data.is_admin);
        // ★ 자기가 넣은 의뢰면 광고주로 행동한다 — 관리자 표시가 있어도 (2026-09-23 Dan)
        //   읽기 전용 계정(관리자 표시 O · 쓰기 X)은 관리자 쪽은 보기만, 광고주 쪽은 광고주가 되어 전부 해 본다.
        //   전에는 관리자 표시만 있으면 광고주 버튼을 다 숨겨서, 자기 의뢰에서도 아무것도 못 눌렀다.
        MINE = !!(access[0].data && access[0].data.owner_id === user.id);
        if (!MINE && !admin) { P = null; denied(); return; }
        setConn("ok", "연결됨");
        var id = P.id;
        return Promise.all([
          db.from("briefs").select("raw,goal,target,format").eq("project_id", id).maybeSingle(),
          db.from("strategies").select("insight,usp,one_message,tone,client_who,client_what,client_why,client_feel").eq("project_id", id).maybeSingle(),
          // visual 은 관리자 칸이다(제작 사양). 화면에 안 그리는 것으로는 부족하고
          // 애초에 읽어 오지 않는다 — 받아 두면 언젠가 그려진다
          db.from("concepts").select("key,title,client_one_line,client_explain,client_appeal,client_mood,client_difference,is_chosen,is_recommended,reco_reason").eq("project_id", id).order("key"),
          db.from("cuts").select("n,t_start,t_end,block,size,angle,move,lens,action,intent").eq("project_id", id).order("n"),
          db.from("assets").select("kind,approved,url,storage_path,role,mime,cut_n,meta").eq("project_id", id).or("kind.neq.final,approved.eq.true"),
          db.from("approvals").select("gate,decision,note,decided_at").eq("project_id", id).order("decided_at"),
          // onecue 에서 보낸 메시지와 광고주 답 (070) — 초안은 서버가 안 내준다
          // ★ 보낸 것만 — 관리자·읽기 전용 계정으로 볼 때 초안까지 떠서 광고주가 보는 것과 달랐다(09-23)
          db.from("project_messages").select("id,author,kind,body,sent_at,digest").eq("project_id", id).not("sent_at", "is", null).order("created_at"),
        ]).then(function (x) {
          x.forEach(function (r) { if (r.error) throw r.error; });
          if (!window.ONECUE_ASSETS) throw new Error("자료 접근 설정을 불러오지 못했습니다.");
          return window.ONECUE_ASSETS.resolve(db, x[4].data || []).then(function (assets) {
          x[4].data = assets;
          HAS_FINAL = (x[4].data || []).some(function (a) { return a.kind === "final" && a.approved === true && a.url; });
          // 콘티 그림이 한 장이라도 있는가. 이 한 값이 콘티 구간 전체(승인 요청 ·
          // 시트 · 컷)를 연다. 컷 표만 있는 상태는 「콘티」가 아니라 컷 설계다.
          // ★ 「있는가」가 아니라 「보내졌는가」다. 전에는 board 자산이 있기만 하면
          //   열렸다. 그래서 승인도 전송도 안 한 콘티가 광고주 화면에 떴다.
          //   이제 서버(RLS)가 승인 안 된 board 를 아예 안 내주지만, 화면도
          //   같은 조건으로 판단한다 — 한 곳만 믿으면 그 한 곳이 틀리는 날 샌다.
          BOARD_READY = (x[4].data || []).some(function (a) {
            return a.kind === "board" && a.approved === true;
          });
          var title = P.product || P.brand || P.slug;
          var brand = P.brand && P.product
            ? '<div class="brand-name"><span>브랜드</span>' + esc(P.brand) + '</div>'
            : "";
          el("main").innerHTML =
            '<div class="hero"><div>' + brand + '<h1>' + esc(title) + "</h1>" +
              '<div class="sub mono">' + esc(P.slug) + " · " + P.running_sec +
              "초 · " +   // 컷 수는 광고주가 준 값이 아니다(길이로 자동 계산) — 머리줄에서 뺀다 (Dan 09-24)
              esc((P.aspects && P.aspects.length) ? P.aspects.join(" / ") : P.aspect) +
              ((P.channels && P.channels.length) ? " · " + esc(P.channels.map(korName).join(" · ")) : "") +
              "</div>" +
              bar(P.step) + "</div></div>" +
            (P.state === "done"
              ? '<div class="gate done"><div class="txt"><b>프로젝트가 완료되었습니다</b><small>' +
                esc(P.closed_at ? new Date(P.closed_at).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10) : "") + " · 함께해 주셔서 감사합니다. 완성본은 아래 납품 칸에서 언제든 받으실 수 있습니다.</small></div></div>"
              : secGate(P, x[5].data)) + secMessages(x[6].data) + flow(x) +
            '<footer><span><a href="index.html">← 목록</a></span>' +
            '<span class="mono">' + new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16) +
            "</span></footer>";
          wire();
          remember(P);
          var eb = el("editBrief");
          if (eb) eb.addEventListener("click", function () { openBriefEditor(x[0].data || {}); });
          });
        });
        });
      })
      .catch(function (e) {
        setConn("bad", "오류");
        el("main").innerHTML = '<div class="empty"><span class="big">불러오지 못했습니다</span>' +
          esc(e.message) + "</div>";
      });
  }

  // ★ 새로고침 없이 따라간다 (Dan 09-24 「콘티 전송되면 새로고침 안 해도 떠야 되는 거 아냐?」)
  //   관리자가 보내거나 단계가 넘어가면 projects 의 상태·갱신 시각이 바뀐다. 20초마다 그것만 가볍게 보고,
  //   바뀌었으면 다시 그린다. 광고주가 뭔가 적고 있는 중이면 적은 것이 날아가지 않게 기다린다.
  var SIG = "";
  function watch() {
    if (document.hidden || !P) return;
    db.from("projects").select("step,state,updated_at").eq("id", P.id).maybeSingle().then(function (r) {
      var d = r && r.data;
      if (!d) return;
      var sig = d.step + "|" + d.state + "|" + d.updated_at;
      if (!SIG) { SIG = sig; return; }
      if (sig === SIG) return;
      var typing = Array.prototype.some.call(document.querySelectorAll("textarea, input[type=text]"), function (t) {
        return (t.value || "").trim();
      });
      if (typing) return;
      SIG = sig;
      load();
    });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = shared();
    load();
    setInterval(watch, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) watch(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
