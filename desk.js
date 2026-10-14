// onecue — 제작 관리 (옵션 3 새 의뢰만 · Dan 10-14 「예전 것과 아예 분리해서 보려고」)
//
// 옛 건(옵션 1·2)은 admin.html(제작 관리 · old) 에 그대로 있다. 여기는 production_track = option3 만 읽는다.
// 진행 칸(stage)을 올리면 광고주 6단계 화면의 예상 시간·진행 막대가 따라 바뀐다(briefs.option3.stage).

(function () {
  "use strict";

  var db = null, CAN = false, rows = [], filter = "all";
  var MOODS = { bgrade: "재밌는 B급 · 병맛", pretty: "예쁜 감성", clean: "깔끔한 정보" };
  var ASPECT = { "16:9": "유튜브 · 16:9", "9:16": "쇼츠·릴스·틱톡 · 9:16", "4:5": "인스타그램 피드 · 4:5" };
  var STAGES = ["접수", "시장 조사", "기획", "영상 생성", "검수", "완성"];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(t) { return t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
  function hideTest() { try { return localStorage.getItem("desk_hide_test") === "1"; } catch (e) { return false; } }

  function status(r) { var o = r.o3 || {}; return o.status === "submitted" ? (+o.stage >= 5 ? "done" : "submitted") : "draft"; }

  function card(r) {
    var o = r.o3 || {}, st = status(r), stage = Math.max(0, +o.stage || 0);
    var badge = st === "draft" ? '<span class="bd draft">작성 중 · ' + (o.step || 1) + "단계</span>"
      : st === "done" ? '<span class="bd">완성</span>' : '<span class="bd sub">생성 요청 · ' + STAGES[stage] + "</span>";
    function kv(k, v) { return "<dt>" + k + "</dt><dd" + (v ? "" : ' class="miss"') + ">" + (v || "비어 있음") + "</dd>"; }
    var photos = (r.photos || []).map(function (p) {
      return '<a href="' + esc(p.url || "#") + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(p.url || "") + '" alt=""><span>' + (p.w || "?") + "×" + (p.h || "?") + "</span></a>";
    }).join("");
    var stg = STAGES.map(function (s, i) {
      return '<button type="button" data-stage="' + i + '" data-pid="' + r.id + '" class="' + (st === "draft" ? "" : i < stage ? "done" : i === stage ? "now" : "") + '"' + (CAN && st !== "draft" ? "" : " disabled") + ">" + s + "</button>";
    }).join("");
    return '<details class="card' + (st === "submitted" ? " sub" : "") + '"' + (st === "submitted" ? " open" : "") + "><summary>" +
      '<div class="nm"><b>' + esc(o.brand || r.brand) + "</b> · " + esc(o.product || r.product) + "<small>" + esc(r.slug) + " · 만든 때 " + when(r.created_at) + (o.submitted_at ? " · 요청 " + when(o.submitted_at) : "") + "</small></div>" +
      '<div class="badges">' + badge + (r.test_label ? '<span class="bd test">' + esc(r.test_label) + "</span>" : "") + "</div></summary>" +
      '<div class="body"><div class="grid2"><dl class="kv">' +
      kv("상호·브랜드", esc(o.brand)) + kv("제품 종류", esc(o.kind)) + kv("제품 이름", esc(o.product)) + kv("특장점", esc(o.point)) +
      kv("영상 분위기", esc(MOODS[o.mood] || "")) + kv("화면 비율", esc(ASPECT[o.aspect] || "")) + kv("영상 길이", "15초 · 1편") +
      kv("추가 정보", o.url ? '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + esc(o.url) + "</a>" + (o.url_ok ? " ✓" : " (확인 안 됨)") : "") +
      "<dt>사진</dt><dd>" + (photos ? '<div class="ph">' + photos + "</div>" : '<span class="miss">없음</span>') + "</dd>" +
      '</dl><div style="display:grid;gap:12px;align-content:start">' +
      '<div class="box"><h4>진행 단계 — 누르면 광고주 화면의 예상 시간이 바뀝니다</h4><div class="stg">' + stg + "</div>" +
      (o.stage_at ? '<div class="msg">' + when(o.stage_at) + " 변경</div>" : "") + "</div>" +
      '<div class="box"><h4>Head 조사·기획 보고 페이지</h4><div class="row"><input type="url" data-report="' + r.id + '" value="' + esc(o.report_url || "") + '" placeholder="보고 페이지 주소"' + (CAN ? "" : " disabled") + '><button type="button" class="btn3" data-save-report="' + r.id + '"' + (CAN ? "" : " disabled") + ">저장</button></div>" +
      (o.report_url ? '<a class="btn3 hot" href="' + esc(o.report_url) + '" target="_blank" rel="noopener">보고 열기 ↗</a>' : '<div class="msg">생성 요청이 오면 Head 가 시장 조사·기획·프롬프트 초안을 만들어 여기에 붙입니다.</div>') +
      '<div class="msg" data-msg="' + r.id + '"></div></div>' +
      '<div class="links"><a class="btn3" href="new3.html?p=' + encodeURIComponent(r.slug) + '" target="_blank" rel="noopener">광고주 화면 보기 ↗</a></div>' +
      "</div></div></div></details>";
  }

  function render() {
    var ht = hideTest();
    var base = rows.filter(function (r) { return !(ht && r.test_label); });
    el("sAll").textContent = base.length;
    el("sSub").textContent = base.filter(function (r) { return status(r) === "submitted"; }).length;
    el("sDraft").textContent = base.filter(function (r) { return status(r) === "draft"; }).length;
    el("sDone").textContent = base.filter(function (r) { return status(r) === "done"; }).length;
    var show = base.filter(function (r) { return filter === "all" || status(r) === filter; });
    el("list").innerHTML = show.length ? '<div style="display:grid;gap:10px">' + show.map(card).join("") + "</div>"
      : '<div class="empty">표시할 의뢰가 없습니다.</div>';
  }

  function patch(pid, add) {
    var r = rows.filter(function (x) { return x.id === pid; })[0]; if (!r) return Promise.resolve();
    var next = Object.assign({}, r.o3 || {}, add);
    return db.from("briefs").update({ option3: next }).eq("project_id", pid).then(function (x) {
      if (x.error) throw x.error;
      r.o3 = next; render();
    });
  }

  // 사진 — 서명 주소는 한 번 받아 쓴다(전송량 · 09-29)
  function photos(list) {
    var ids = [], byId = {};
    list.forEach(function (r) { ((r.o3 || {}).photos || []).forEach(function (id) { ids.push(id); }); });
    if (!ids.length) return Promise.resolve();
    return db.from("assets").select("id,storage_path,meta").in("id", ids).then(function (a) {
      var rs = a.data || [];
      rs.forEach(function (x) { byId[x.id] = x; });
      return db.storage.from("uploads").createSignedUrls(rs.map(function (x) { return x.storage_path; }), 6 * 3600);
    }).then(function (s) {
      var u = {}; ((s && s.data) || []).forEach(function (x) { u[x.path] = x.signedUrl; });
      list.forEach(function (r) {
        r.photos = ((r.o3 || {}).photos || []).map(function (id) { var x = byId[id]; return x ? { url: u[x.storage_path], w: (x.meta || {}).w, h: (x.meta || {}).h } : null; }).filter(Boolean);
      });
    });
  }

  function load() {
    return db.from("projects").select("id,slug,brand,product,created_at,updated_at,test_label").eq("production_track", "option3").order("created_at", { ascending: false })
      .then(function (r) {
        if (r.error) throw r.error;
        rows = r.data || [];
        if (!rows.length) return;
        return db.from("briefs").select("project_id,option3").in("project_id", rows.map(function (x) { return x.id; })).then(function (b) {
          var m = {}; (b.data || []).forEach(function (x) { m[x.project_id] = x.option3 || {}; });
          rows.forEach(function (x) { x.o3 = m[x.id] || {}; });
          rows.sort(function (a, b) { return (b.o3.submitted_at || b.created_at) > (a.o3.submitted_at || a.created_at) ? 1 : -1; });
          return photos(rows);
        });
      }).then(render);
  }

  function wire() {
    el("tools").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return;
      filter = b.dataset.f;
      el("tools").querySelectorAll("[data-f]").forEach(function (x) { x.classList.toggle("on", x === b); });
      render();
    });
    el("hideTest").checked = hideTest();
    el("hideTest").addEventListener("change", function () { try { localStorage.setItem("desk_hide_test", el("hideTest").checked ? "1" : "0"); } catch (e) {} render(); });
    el("list").addEventListener("click", function (e) {
      var s = e.target.closest("[data-stage]");
      if (s && !s.disabled) { e.preventDefault(); patch(s.dataset.pid, { stage: +s.dataset.stage, stage_at: new Date().toISOString() }).catch(function (x) { alert(x.message || x); }); return; }
      var v = e.target.closest("[data-save-report]");
      if (v) {
        var pid = v.dataset.saveReport, inp = el("list").querySelector('[data-report="' + pid + '"]');
        patch(pid, { report_url: (inp.value || "").trim() }).then(function () {
          var m = el("list").querySelector('[data-msg="' + pid + '"]'); if (m) m.textContent = "저장했습니다";
        }, function (x) { var m = el("list").querySelector('[data-msg="' + pid + '"]'); if (m) m.textContent = "저장 못 함 — " + (x.message || x); });
      }
    });
  }

  function boot() {
    db = window.ONECUE_DB || (window.ONECUE_DB = window.supabase.createClient(window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
    db.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      if (!u) { location.replace("login.html?next=desk.html"); return; }
      return db.from("profiles").select("is_admin,admin_can_write").eq("id", u.id).maybeSingle().then(function (p) {
        if (!p.data || !p.data.is_admin) { el("list").innerHTML = '<div class="empty">관리자만 볼 수 있습니다.</div>'; return; }
        CAN = !!p.data.admin_can_write;
        wire();
        return load();
      });
    }).catch(function (e) { el("list").innerHTML = '<div class="empty">불러오지 못했습니다 — ' + esc(e.message || e) + "</div>"; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
