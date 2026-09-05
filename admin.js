// onecue — 관리자 화면
//
// 광고주가 「의뢰하기」를 누르면 이메일이 아니라 여기로 들어온다.
// 하는 일은 둘 — ①새 의뢰를 본다 ②건의 단계를 옮긴다.
// 단계를 옮기면 광고주 화면이 바로 그에 맞춰 바뀐다.

(function () {
  "use strict";

  var cfg = window.ONECUE || {}, db = null;

  var STEPS = [
    ["brief", "의뢰"], ["facts", "팩트"], ["strategy", "전략"],
    ["concepts", "5안"], ["develop", "전개"], ["storyboard", "콘티"],
    ["anchors", "앵커"], ["video", "영상"], ["deliver", "납품"],
  ];
  // 이 단계로 옮기면 광고주가 판단할 차례가 된다
  var GATE = { strategy: "검토", concepts: "선택", storyboard: "승인" };

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

  // ── 새 의뢰 ───────────────────────────────────────────────────────────────
  function renderInbox(jobs) {
    var box = el("inbox");
    if (!jobs.length) {
      box.innerHTML = '<div class="empty"><span class="big">새 의뢰가 없습니다</span>' +
        "광고주가 의뢰하면 여기에 뜹니다.</div>";
      return;
    }
    box.innerHTML = jobs.map(function (j) {
      var r = j.request || {};
      var who = [r.brand, r.product].filter(Boolean).join(" ") || j.projects.slug;
      var spec = [
        r.runtime ? r.runtime + "초" : "",
        (r.aspects || []).join("/"),
        (r.channels || []).join(" "),
      ].filter(Boolean).join(" · ");
      return '<div class="job"><div>' +
        '<div class="who">' + esc(who) + "</div>" +
        '<div class="say">' + esc(r.item || r.note || "") + "</div>" +
        '<div class="when">' + esc(spec) + "   ·   " + ago(j.created_at) + "</div>" +
        "</div>" +
        '<a class="btn ghost" href="project.html?slug=' +
        encodeURIComponent(j.projects.slug) + '">열기 →</a></div>';
    }).join("");
  }

  // ── 진행 중 ───────────────────────────────────────────────────────────────
  function renderWork(rows) {
    el("work").innerHTML = rows.map(function (p) {
      var have = [
        ["의뢰", p.n_brief], ["팩트", p.n_facts], ["전략", p.n_strategy],
        ["컨셉", p.n_concepts], ["콘티", p.n_cuts], ["파일", p.n_assets],
      ].map(function (h) {
        return '<span class="' + (h[1] ? "on" : "") + '">' + h[0] +
          (h[1] > 1 ? " " + h[1] : "") + "</span>";
      }).join("");

      var buttons = STEPS.map(function (s) {
        var at = s[0] === p.step;
        var g = GATE[s[0]] ? " ★" + GATE[s[0]] : "";
        return '<button data-slug="' + esc(p.slug) + '" data-step="' + s[0] + '"' +
          (at ? ' class="at" disabled' : "") + ">" + s[1] + g + "</button>";
      }).join("");

      return '<div class="wrk"><div class="top"><div>' +
        '<div class="name">' + esc([p.brand, p.product].filter(Boolean).join(" ")) + "</div>" +
        '<div class="meta">' + esc(p.slug) + " · " + p.running_sec + "초 · " +
        p.cut_count + "컷 · " + esc((p.aspects || []).join("/")) + "</div>" +
        '<div class="have">' + have + "</div></div>" +
        '<a class="btn ghost" href="project.html?slug=' + encodeURIComponent(p.slug) +
        '">광고주 화면 →</a></div>' +
        '<div class="steps"><span class="lbl">단계를 옮긴다</span>' + buttons + "</div></div>";
    }).join("") || '<div class="empty">진행 중인 건이 없습니다</div>';

    document.querySelectorAll(".steps button").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        move(b.dataset.slug, b.dataset.step).then(load);
      });
    });
  }

  // 정지점으로 옮기면 state=ready (광고주가 판단할 차례),
  // 그 밖에는 pending (우리가 작업 중)
  function move(slug, step) {
    var state = GATE[step] ? "ready" : "pending";
    return db.from("projects").update({ step: step, state: state, updated_at: new Date() })
      .eq("slug", slug)
      .then(function () {
        return db.from("projects").select("id").eq("slug", slug).single();
      })
      .then(function (r) {
        return db.from("events").insert({
          project_id: r.data.id, kind: "step", to_step: step,
          payload: { by: "admin" },
        });
      });
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");

    var a = db.from("jobs")
      .select("id,created_at,request,projects(slug)")
      .eq("state", "queued").order("created_at", { ascending: false });

    var b = db.from("projects")
      .select("id,slug,brand,product,step,state,running_sec,cut_count,aspects")
      .order("updated_at", { ascending: false });

    return Promise.all([a, b]).then(function (res) {
      if (res[0].error || res[1].error) {
        setConn("bad", "불러오기 실패");
        return;
      }
      setConn("ok", "연결됨 · 새 의뢰 " + res[0].data.length);
      renderInbox(res[0].data);

      // 각 건이 어디까지 채워졌는지 — 표마다 개수를 센다
      var rows = res[1].data;
      var ids = rows.map(function (r) { return r.id; });
      if (!ids.length) { renderWork([]); return; }

      var tables = [
        ["briefs", "n_brief"], ["product_facts", "n_facts"], ["strategies", "n_strategy"],
        ["concepts", "n_concepts"], ["cuts", "n_cuts"], ["assets", "n_assets"],
      ];
      return Promise.all(tables.map(function (t) {
        return db.from(t[0]).select("project_id").in("project_id", ids);
      })).then(function (counts) {
        rows.forEach(function (r) {
          tables.forEach(function (t, i) {
            var d = counts[i].data || [];
            r[t[1]] = d.filter(function (x) { return x.project_id === r.id; }).length;
          });
        });
        renderWork(rows);
      });
    });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    el("reload").addEventListener("click", load);
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
