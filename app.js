// onecue — 목록 화면
//
// 진행 중인 건을 불러와 「지금 어느 단계인지 · 누가 움직일 차례인지」를 보여준다.
// 파이프라인 그림만 있고 데이터가 없으면 전시물이지 도구가 아니다.

(function () {
  "use strict";

  var cfg = window.ONECUE || {};
  var db = null;

  var STEPS = [
    ["brief", "브리프 접수"], ["facts", "제품 팩트"], ["strategy", "전략"],
    ["concepts", "컨셉 5안"], ["develop", "전개·연출"], ["storyboard", "콘티"],
    ["anchors", "앵커 이미지"], ["video", "영상"], ["deliver", "수선·납품"],
  ];
  var STEP_IDX = {};
  STEPS.forEach(function (s, i) { STEP_IDX[s[0]] = i; });
  var STEP_NAME = {};
  STEPS.forEach(function (s) { STEP_NAME[s[0]] = s[1]; });

  // 사람이 반드시 개입하는 자리
  var GATES = { strategy: "전략 검토", concepts: "5안 선택", storyboard: "콘티 승인" };

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function setConn(kind, text) {
    var p = el("conn");
    p.className = "pill" + (kind ? " " + kind : "");
    p.innerHTML = '<span class="dot"></span>' + esc(text);
  }

  // 진행 막대 — 9칸 중 몇 칸까지 왔나
  function bar(step) {
    var at = STEP_IDX[step] == null ? 0 : STEP_IDX[step];
    return '<span class="bar">' + STEPS.map(function (s, i) {
      var cls = i < at ? "done" : (i === at ? "now" : "");
      return '<i class="' + cls + '" title="' + esc(s[1]) + '"></i>';
    }).join("") + "</span>";
  }

  function card(r) {
    var title = [r.brand, r.product].filter(Boolean).join(" ") || r.slug;
    var waiting = r.state === "ready" && GATES[r.step];
    var badge = waiting
      ? '<span class="tag hold">' + esc(GATES[r.step]) + " 대기</span>"
      : '<span class="tag calm">' + esc(STEP_NAME[r.step] || r.step) + "</span>";
    var asp = (r.aspects && r.aspects.length) ? r.aspects.join(" / ") : (r.aspect || "");
    var meta = [
      (r.running_sec || 0) + "초",
      (r.cut_count || 0) + "컷",
      asp,
    ].filter(Boolean).join(" · ");

    return '<a class="proj" href="project.html?slug=' + encodeURIComponent(r.slug) + '">' +
      '<div class="proj-main"><div class="name">' + esc(title) + "</div>" +
      '<div class="meta mono">' + esc(meta) + "</div>" +
      bar(r.step) + "</div>" +
      '<div class="proj-side">' + badge + '<span class="go">열기 →</span></div></a>';
  }

  // 이 브라우저에서 넣은 의뢰를 되찾아 준다.
  // 로그인이 없어서, 주소를 잃어버리면 다시 못 들어가는 문제를 이걸로 막는다
  function renderMine() {
    var list = [];
    try { list = JSON.parse(localStorage.getItem("onecue.mine") || "[]"); } catch (e) { list = []; }
    if (!list.length) return;
    el("mineWrap").hidden = false;
    el("mine").innerHTML = list.map(function (m) {
      var when = new Date(m.at || Date.now());
      return '<a class="proj" href="project.html?slug=' + encodeURIComponent(m.slug) + '">' +
        '<div class="proj-main"><div class="name">' +
        esc([m.brand, m.product].filter(Boolean).join(" ")) + "</div>" +
        '<div class="meta mono">' + esc(when.toISOString().slice(0, 10)) + " 접수</div></div>" +
        '<div class="proj-side"><span class="go">진행 상황 →</span></div></a>';
    }).join("");
  }

  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");
    renderMine();

    if (!cfg.supabaseUrl || !window.supabase) {
      setConn("bad", "연결 설정 없음");
      return;
    }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    window.ONECUE_DB = db;

    db.from("projects")
      .select("slug,brand,product,step,state,running_sec,cut_count,aspect,aspects")
      .order("updated_at", { ascending: false })
      .then(function (res) {
        var box = el("projects");
        if (res.error) {
          setConn("bad", "연결 실패");
          box.innerHTML = '<div class="empty"><span class="big">불러오지 못했습니다</span>' +
            esc(res.error.message) + "</div>";
          return;
        }
        setConn("ok", "연결됨");
        if (!res.data.length) {
          box.innerHTML = '<div class="empty"><span class="big">아직 등록된 건이 없습니다</span>' +
            "광고주 요청이 들어오면 <b>새 건 등록</b>으로 시작하세요.</div>";
          return;
        }
        box.innerHTML = res.data.map(card).join("");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
