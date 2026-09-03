// onecue — 첫 화면
//
// 하는 일은 셋뿐이다.
//   1. Supabase 에 실제로 붙는지 확인해서 상단에 표시한다
//   2. 진행 중인 건(projects)을 불러와 보여준다
//   3. 표 12개가 살아 있는지 하나씩 찔러보고 표시한다
//
// 빌드 도구를 쓰지 않는다. 이 파일이 그대로 브라우저에서 돈다.

(function () {
  "use strict";

  var cfg = window.ONECUE || {};
  var db = null;

  // 스키마에 있는 표. 순서는 파이프라인이 흐르는 순서에 맞췄다
  var TABLES = [
    "clients", "projects", "briefs", "product_facts", "strategies",
    "concepts", "developments", "cuts", "assets", "jobs",
    "approvals", "events",
  ];

  var STEP_LABEL = {
    brief: "브리프 접수", facts: "제품 팩트", strategy: "전략",
    concepts: "컨셉 5안", develop: "전개·연출", storyboard: "콘티",
    anchors: "앵커 이미지", video: "영상", deliver: "수선·납품",
  };
  var STATE_LABEL = {
    idle: "대기", pending: "진행 중", ready: "검토 대기",
    timeout: "시간 초과", error: "오류",
  };

  function el(id) { return document.getElementById(id); }

  function setConn(kind, text) {
    var p = el("conn");
    p.className = "pill" + (kind ? " " + kind : "");
    p.innerHTML = '<span class="dot"></span>' + text;
  }

  // ── 진행 중인 건 ────────────────────────────────────────────────────────
  function renderProjects(rows) {
    var box = el("projects");
    if (!rows || !rows.length) {
      box.innerHTML =
        '<div class="empty"><span class="big">아직 등록된 건이 없습니다</span>' +
        "브리프가 들어오면 여기에 쌓입니다.</div>";
      return;
    }
    box.innerHTML = rows.map(function (r) {
      var title = [r.brand, r.product].filter(Boolean).join(" ") || r.slug;
      var meta = [
        STEP_LABEL[r.step] || r.step,
        STATE_LABEL[r.state] || r.state,
        (r.running_sec || 0) + "초",
        (r.cut_count || 0) + "컷",
      ].join(" · ");
      return '<div class="proj"><div><div class="name">' + esc(title) +
        '</div><div class="meta mono">' + esc(meta) +
        '</div></div><span class="pill">' + esc(r.aspect || "") + "</span></div>";
    }).join("");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ── 표가 살아 있는지 ────────────────────────────────────────────────────
  // RLS 로 막힌 표는 빈 배열이 오고, 없는 표는 오류가 온다. 그래서 존재 확인용으로만 쓴다
  function renderTables(results) {
    el("tables").innerHTML = results.map(function (r) {
      return '<span class="tbl ' + (r.ok ? "ok" : "bad") + '">' + esc(r.name) +
        (r.ok ? "" : " ✕") + "</span>";
    }).join("");
  }

  function probe(name) {
    return db.from(name).select("*", { count: "exact", head: true })
      .then(function (res) { return { name: name, ok: !res.error }; })
      .catch(function () { return { name: name, ok: false }; });
  }

  // ── 시작 ────────────────────────────────────────────────────────────────
  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      setConn("bad", "설정 없음");
      renderProjects([]);
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      setConn("bad", "라이브러리 로드 실패");
      renderProjects([]);
      return;
    }

    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    db.from("projects")
      .select("slug,brand,product,step,state,running_sec,cut_count,aspect")
      .order("updated_at", { ascending: false })
      .then(function (res) {
        if (res.error) {
          setConn("bad", "연결 실패");
          el("projects").innerHTML =
            '<div class="empty"><span class="big">불러오지 못했습니다</span>' +
            esc(res.error.message) + "</div>";
          return;
        }
        setConn("ok", "연결됨 · " + res.data.length + "건");
        renderProjects(res.data);
      });

    Promise.all(TABLES.map(probe)).then(renderTables);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
