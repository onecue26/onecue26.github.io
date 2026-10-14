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
  function hideTest() { try { return localStorage.getItem("desk_hide_test") !== "0"; } catch (e) { return true; } }   // 시험 건은 기본으로 숨김(10-14 Dan 「실험 11개나 올려놓은 이유」)

  function status(r) { var o = r.o3 || {}; return o.status === "submitted" ? (+o.stage >= 5 ? "done" : "submitted") : "draft"; }


  // ── 480p 드래프트 규칙 (Dan 10-14 「480p 드래프트로 만들고, 만든 시점 기준 5일 안에 확정해 주면 1080p로 업그레이드」) ──
  var DRAFT_DAYS = 5;
  function draftBox(o) {
    var at = o.draft_at ? new Date(o.draft_at) : null, line = "아직 만들지 않았습니다";
    if (at) {
      var due = new Date(at.getTime() + DRAFT_DAYS * 864e5), left = due - Date.now();
      line = "만든 때 " + when(at) + " · 확정 기한 " + when(due) + " · " +
        (o.confirmed_at ? "확정됨(" + when(o.confirmed_at) + ") → 1080p 업그레이드" : left > 0 ? "남은 시간 " + Math.floor(left / 864e5) + "일 " + Math.floor(left % 864e5 / 36e5) + "시간" : "기한 지남 — 480p로 남습니다");
    }
    return '<div class="box"><h4>영상 생성 방식</h4><div style="font-size:13.5px;line-height:1.6"><b>480p 드래프트</b>로 만듭니다. 만든 시점부터 <b>5일 안에 확정</b>되면 <b>1080p로 업그레이드</b>합니다.</div><div class="msg">' + line + "</div></div>";
  }

  // ── Head 가 백단에서 한 것 전부 (option3_reports · 관리자 전용) — 항목마다 접었다 편다 ──
  function secHtml(x, i) {
    var pts = (x.points || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var tb = x.table && x.table.rows ? '<div class="tbw"><table><thead><tr>' + (x.table.head || []).map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      x.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" : "";
    var code = x.code ? "<pre>" + esc(x.code) + "</pre>" : "";
    var src = (x.sources || []).map(function (u) { return '<li><a href="' + esc(u.u) + '" target="_blank" rel="noopener">' + esc(u.t || u.u) + "</a></li>"; }).join("");
    var media = (x.media || []).map(function (m) { return /\.mp4|\.webm/i.test(m.u) ? '<video src="' + esc(m.u) + '" controls preload="none"></video>' : '<a href="' + esc(m.u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(m.u) + '" alt=""></a>'; }).join("");
    return '<details class="rsec"' + (i === 0 ? " open" : "") + "><summary><b>" + esc(x.title) + "</b>" + (x.summary ? "<span>" + esc(x.summary) + "</span>" : "") + "</summary><div class=\"rbody\">" +
      (x.body ? "<p>" + esc(x.body).replace(/\n/g, "<br>") + "</p>" : "") + (pts ? "<ul>" + pts + "</ul>" : "") + tb + code +
      (media ? '<div class="rmedia">' + media + "</div>" : "") + (src ? '<div class="rsrc"><b>출처</b><ul>' + src + "</ul></div>" : "") + "</div></details>";
  }
  function reportHtml(r) {
    var o = r.o3 || {}, rp = r.report;
    if (o.status !== "submitted") return "";
    if (!rp || !(rp.sections || []).length) return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3></div><div class="msg">생성 요청을 받았습니다 — Head가 시장 조사부터 시작합니다. 준비되는 대로 여기에 올라옵니다.</div></div>';
    var log = (rp.log || []).map(function (l) { return "<tr><td>" + esc(when(l.at)) + "</td><td>" + esc(l.by || "Head") + "</td><td>" + esc(l.what) + "</td></tr>"; }).join("");
    var secs = rp.sections.slice();
    if (log) secs.push({ title: "작업 기록", summary: (rp.log || []).length + "건", _log: log });
    return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3><span class="msg">' + (rp.made_at ? "갱신 " + esc(when(rp.made_at)) : "") + '</span><button type="button" class="btn3" data-allopen>모두 펼치기</button><button type="button" class="btn3" data-allclose>모두 접기</button></div>' +
      secs.map(function (x, i) { return x._log ? '<details class="rsec"><summary><b>작업 기록</b><span>' + esc(x.summary) + '</span></summary><div class="rbody tbw"><table><thead><tr><th>언제</th><th>누가</th><th>무엇을</th></tr></thead><tbody>' + x._log + "</tbody></table></div></details>" : secHtml(x, i); }).join("") + "</div>";
  }

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
    return '<details class="card' + (st === "submitted" ? " sub" : "") + '" data-slug="' + esc(r.slug) + '"><summary>' +
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
      draftBox(o) +
      '<div class="links"><a class="btn3" href="new3.html?p=' + encodeURIComponent(r.slug) + '" target="_blank" rel="noopener">광고주 화면 보기 ↗</a></div>' +
      "</div></div>" + reportHtml(r) + "</div></details>";
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
          return db.from("option3_reports").select("project_id,report").in("project_id", rows.map(function (x) { return x.id; }));
        }).then(function (rr) {
          var m2 = {}; ((rr && rr.data) || []).forEach(function (x) { m2[x.project_id] = x.report; });
          rows.forEach(function (x) { x.report = m2[x.id] || null; });
          rows.sort(function (a, b) { return (b.o3.submitted_at || b.created_at) > (a.o3.submitted_at || a.created_at) ? 1 : -1; });
          return photos(rows);
        });
      }).then(function () {
        render();
        // 텔레그램 링크(desk.html?p=건) — 그 건만 펼치고 그 자리로
        var want = new URLSearchParams(location.search).get("p");
        if (want) {
          var c = el("list").querySelector('[data-slug="' + want.replace(/"/g, "") + '"]');
          if (!c && rows.some(function (x) { return x.slug === want && x.test_label; })) { el("hideTest").checked = false; try { localStorage.setItem("desk_hide_test", "0"); } catch (e) {} render(); c = el("list").querySelector('[data-slug="' + want.replace(/"/g, "") + '"]'); }
          if (c) { c.open = true; c.scrollIntoView({ block: "start" }); }
        }
      });
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
      var ao = e.target.closest("[data-allopen],[data-allclose]");
      if (ao) { var open = ao.hasAttribute("data-allopen"); ao.closest(".rep").querySelectorAll(".rsec").forEach(function (d) { d.open = open; }); return; }
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
