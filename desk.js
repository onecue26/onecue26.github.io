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
  // ── 버전 비교 (Dan 10-16 「v1·v2·v3 진행 상황과 결과를 관리자 화면에서」) — report.variants 를 판마다 나란히 ──
  var VST = { prep: "준비 중", wait: "Dan 확인 대기", gen: "생성 중", done: "완료", fail: "실패" };
  function variantsHtml(rp) {
    var vs = (rp && rp.variants) || [];
    if (!vs.length) return "";
    var cells = vs.map(function (v) {
      var vid = (v.media || []).filter(function (m) { return /\.mp4|\.webm/i.test(m.u); })[0];
      var ins = (v.inputs || []).map(function (m) { return '<a href="' + esc(m.u) + '" target="_blank" rel="noopener" title="' + esc(m.t || "") + '"><img loading="lazy" src="' + esc(m.u) + '" alt="' + esc(m.t || "") + '" style="width:64px;height:64px;object-fit:cover;border-radius:6px"></a>'; }).join(" ");
      var blk = (v.blocks || []).map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
      return '<div style="border:1px solid #d9dedb;border-radius:10px;padding:12px;min-width:0;background:#fff;color:#1d2321">' +
        '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:16px">' + esc(v.v) + '</b><span class="bd' + (v.status === "done" ? "" : " sub") + '">' + esc(VST[v.status] || v.status || "") + "</span>" +
        '<span style="color:#5f6a66;font-size:13px">' + esc(v.aspect || "") + (v.credits != null ? " · " + esc(v.credits) + "cr" : "") + "</span></div>" +
        '<div style="font-size:13.5px;margin:6px 0">' + esc(v.method || "") + "</div>" +
        (vid ? '<video src="' + esc(vid.u) + '" controls preload="none" style="width:100%;border-radius:8px;background:#000"></video>' : '<div style="color:#5f6a66">영상 없음</div>') +
        (ins ? '<div style="margin-top:8px"><div style="color:#5f6a66;font-size:12.5px">넣은 그림</div>' + ins + "</div>" : "") +
        (v.note ? '<div style="font-size:13px;margin-top:8px;line-height:1.5">' + esc(v.note) + "</div>" : "") +
        (blk ? '<div style="margin-top:6px"><div style="color:#5f6a66;font-size:12.5px">꼭 막을 것 5개</div><ul style="margin:2px 0 0 16px;padding:0;font-size:12.5px">' + blk + "</ul></div>" : "") +
        (v.prompt ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px;color:#1f6f5c">프롬프트 원문</summary><pre style="white-space:pre-wrap;font-size:12px;background:#f3f4f2;color:#1d2321;padding:8px;border-radius:6px">' + esc(v.prompt) + "</pre></details>" : "") +
        "</div>";
    }).join("");
    return '<div class="rep"><div class="rep-h"><h3>버전 비교</h3><span class="msg">같은 제품 · 방식별 실험</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">' + cells + "</div>" +
      (rp.variants_verdict ? '<div class="msg" style="margin-top:10px">' + esc(rp.variants_verdict) + "</div>" : "") + "</div>";
  }
  function reportHtml(r) {
    var o = r.o3 || {}, rp = r.report;
    if (o.status !== "submitted") return "";
    var vh = variantsHtml(rp);
    if (vh) return vh + reportHtmlInner(r);
    return reportHtmlInner(r);
  }
  function reportHtmlInner(r) {
    var o = r.o3 || {}, rp = r.report;
    if (!rp || !(rp.sections || []).length) return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3></div><div class="msg">생성 요청을 받았습니다 — Head가 시장 조사부터 시작합니다. 준비되는 대로 여기에 올라옵니다.</div></div>';
    var log = (rp.log || []).map(function (l) { return "<tr><td>" + esc(when(l.at)) + "</td><td>" + esc(l.by || "Head") + "</td><td>" + esc(l.what) + "</td></tr>"; }).join("");
    var secs = rp.sections.slice();
    if (log) secs.push({ title: "작업 기록", summary: (rp.log || []).length + "건", _log: log });
    return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3><span class="msg">' + (rp.made_at ? "갱신 " + esc(when(rp.made_at)) : "") + '</span><button type="button" class="btn3" data-allopen>모두 펼치기</button><button type="button" class="btn3" data-allclose>모두 접기</button></div>' +
      secs.map(function (x, i) { return x._log ? '<details class="rsec"><summary><b>작업 기록</b><span>' + esc(x.summary) + '</span></summary><div class="rbody tbw"><table><thead><tr><th>언제</th><th>누가</th><th>무엇을</th></tr></thead><tbody>' + x._log + "</tbody></table></div></details>" : secHtml(x, i); }).join("") + "</div>";
  }

  // 10-19 Dan 「펼쳤을 때 납품 전에 검수받는 영상이 뜨면 맨 위로 — 내려서 메뉴 찾아 보기 힘들게 하지 말고」
  //   report.review_request {video, note, at} 가 있으면 그것, 없으면 분석 항목 중 가장 최근 영상(mp4)을 카드 맨 위에
  function reviewTop(r) {
    var rp = r.report || {}, rq = rp.review_request, v = rq && rq.video, note = rq && rq.note;
    if (!v) {
      (rp.sections || []).forEach(function (x) { (x.media || []).forEach(function (m) { if (/\.mp4|\.webm/i.test(m.u)) v = m.u; }); });
      if (!v) return "";
      note = "분석 기록에 올라온 가장 최근 영상";
    }
    return '<div class="box" style="border:2px solid #d4ff3a;margin-bottom:12px"><h4>납품 전 확인 요청' + (rq && rq.at ? " · " + esc(when(rq.at)) : "") + '</h4>' +
      '<video src="' + esc(v) + '" controls playsinline preload="metadata" style="width:100%;max-height:70vh;background:#000;border-radius:8px"></video>' +
      (note ? '<div class="msg" style="margin-top:6px">' + esc(note) + "</div>" : "") + endcardPick(r) + "</div>";
  }

  // 10-20 Dan 「후작업 6개 사진을 올려서, 그중에 선택 누르고 수정하면 다시 주는」 — 엔진이 그려 둔 엔드컷 후보 · 고르면 코드가 바로 바꿈
  function endcardPick(r) {
    var ec = (r.report || {}).endcard, os = (ec && ec.options) || [];
    if (!os.length) return "";
    var cells = os.map(function (o) {
      var on = o.n === ec.pick;
      return '<div style="border:2px solid ' + (on ? "#d4ff3a" : "transparent") + ';border-radius:8px;padding:4px;min-width:0">' +
        '<a href="' + esc(o.video) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(o.img) + '" alt="" style="width:100%;border-radius:6px;display:block"></a>' +
        '<div style="font-size:12.5px;margin:4px 0">' + o.n + ". " + esc(o.name) + (on ? " · <b>지금 판</b>" : "") + "</div>" +
        (on ? "" : '<button type="button" class="btn3" data-ec-pick="' + o.n + '" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") + ">이 안으로</button>") + "</div>";
    }).join("");
    return '<details style="margin-top:10px"' + (ec.by === "관리자" ? "" : " open") + '><summary style="cursor:pointer;font-weight:700">엔드컷 후보 ' + os.length + "개 — " + (ec.by === "관리자" ? "관리자가 " : "엔진이 ") + ec.pick + "번 선택</summary>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px">' + cells + "</div>" +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input data-ec-note="' + r.id + '" placeholder="수정 요청 (예: 로고 조금 작게)" style="flex:1;min-width:200px">' +
      '<button type="button" class="btn3" data-ec-fix="' + r.id + '"' + (CAN ? "" : " disabled") + ">수정 요청</button></div>" +
      '<div class="msg" data-ec-msg="' + r.id + '"></div></details>';
  }

  // 10-20 Dan 「예전 것은 old 로 해서 밑에서 접어서 내리고」 — 다시 만든 건의 지난 판(확인 요청)을 카드 맨 아래 접는 칸으로
  function oldRuns(r) {
    var h = (r.report || {}).history || [];
    if (!h.length) return "";
    return '<details class="box" style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">이전 판 ' + h.length + "개 — 펼치기</summary>" +
      h.slice().reverse().map(function (x) {
        return '<div style="margin-top:10px"><div class="msg">' + esc(x.label || "") + (x.at ? " · " + esc(when(x.at)) : "") + "</div>" +
          (x.video ? '<video src="' + esc(x.video) + '" controls playsinline preload="none" style="width:100%;max-height:50vh;background:#000;border-radius:8px"></video>' : "") +
          (x.note ? '<div class="msg" style="margin-top:4px">' + esc(x.note) + "</div>" : "") + "</div>";
      }).join("") + "</details>";
  }

  // 10-20 Dan 「건 하나 누르면 항목이 너무 많다 — 결과물 포함 관리자가 보는 필수만 남기고 나머지는 묶어서 접어」
  //   펼치면: 결과 영상 · 의도 · 문제 · 크레딧 · 확정 기한 — 나머지(의뢰서·진행 단계·분석 전부·버전 비교)는 「세부」 하나에
  function essHtml(r, o) {
    var rp = r.report || {}, e = rp.essentials || {}, secs = rp.sections || [];
    var find = function (re) { var x = secs.filter(function (s) { return re.test(s.title || ""); }).pop(); return x ? (x.summary || "") : ""; };
    var idea = e.idea || find(/기획|아이디어/), prob = e.problem || find(/검수|문제/), cr = e.credits || find(/크레딧|비용/);
    var due = "";
    if (o.confirmed_at) due = "확정됨 → 1080p";
    else if (o.draft_at) { var left = new Date(o.draft_at).getTime() + DRAFT_DAYS * 864e5 - Date.now(); due = left > 0 ? Math.floor(left / 864e5) + "일 " + Math.floor(left % 864e5 / 36e5) + "시간 남음" : "기한 지남(480p)"; }
    var row = function (k, v) { return "<dt>" + k + "</dt><dd" + (v ? "" : ' class="miss"') + ">" + (v ? esc(v) : "없음") + "</dd>"; };
    return '<dl class="kv" style="margin-bottom:12px">' + row("의도", idea) + row("문제", prob) + row("크레딧", cr) + row("확정 기한", due) + "</dl>";
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
      '<div class="nm"><b>' + esc(o.brand || r.brand) + "</b> · " + esc(o.product || r.product) + "<small>" + (r.who ? "의뢰인 " + esc(r.who.name || "") + (r.who.email ? " (" + esc(r.who.email) + ")" : "") + " · " : "") + esc(r.slug) + " · 만든 때 " + when(r.created_at) + (o.submitted_at ? " · 요청 " + when(o.submitted_at) : "") + "</small></div>" +
      '<div class="badges">' + badge + (r.test_label ? '<span class="bd test">' + esc(r.test_label) + "</span>" : "") + "</div></summary>" +
      '<div class="body">' + reviewTop(r) + essHtml(r, o) +
      '<details class="box rsec" style="max-width:none"><summary style="cursor:pointer"><b>세부</b><span class="msg"> 의뢰서·진행 단계·조사·기획·프롬프트·작업 기록</span></summary><div class="grid2"><dl class="kv">' +
      kv("상호·브랜드", esc(o.brand)) + kv("제품 종류", esc(o.kind)) + kv("제품 이름", esc(o.product)) + kv("특장점", esc(o.point)) +
      kv("영상 분위기", esc(MOODS[o.mood] || "")) + kv("화면 비율", esc(ASPECT[o.aspect] || "")) + kv("영상 길이", "15초 · 1편") +
      kv("추가 정보", o.url ? '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + esc(o.url) + "</a>" + (o.url_ok ? " ✓" : " (확인 안 됨)") : "") +
      "<dt>사진</dt><dd>" + (photos ? '<div class="ph">' + photos + "</div>" : '<span class="miss">없음</span>') + "</dd>" +
      '</dl><div style="display:grid;gap:12px;align-content:start">' +
      '<div class="box"><h4>진행 단계 — 누르면 광고주 화면의 예상 시간이 바뀝니다</h4><div class="stg">' + stg + "</div>" +
      (o.stage_at ? '<div class="msg">' + when(o.stage_at) + " 변경</div>" : "") + "</div>" +
      draftBox(o) +
      '<div class="links"><a class="btn3" href="new3.html?p=' + encodeURIComponent(r.slug) + '" target="_blank" rel="noopener">광고주 화면 보기 ↗</a></div>' +
      "</div></div>" + reportHtml(r) + "</details>" + oldRuns(r) + "</div></details>";
  }

  function render() {
    var ht = hideTest();
    var base = rows.filter(function (r) { return !(ht && r.test_label); });
    el("sAll").textContent = base.length;
    el("sSub").textContent = base.filter(function (r) { return status(r) === "submitted"; }).length;
    el("sDraft").textContent = base.filter(function (r) { return status(r) === "draft"; }).length;
    el("sDone").textContent = base.filter(function (r) { return status(r) === "done"; }).length;
    var show = base.filter(function (r) { return filter === "all" || status(r) === filter; });
    // 10-15 Dan 「새로고침 꼭 해야 해?」 — 30초마다 다시 그려도 펼쳐 둔 카드·항목은 그대로
    var openCards = {}, openSecs = {};
    el("list").querySelectorAll("details.card[open]").forEach(function (d) { openCards[d.dataset.slug] = 1; });
    el("list").querySelectorAll("details.card .rsec").forEach(function (d) { var c = d.closest("details.card"); openSecs[c.dataset.slug + "|" + d.querySelector("summary b").textContent] = d.open; });
    var restore = function () {
      el("list").querySelectorAll("details.card").forEach(function (d) {
        if (openCards[d.dataset.slug]) d.open = true;
        d.querySelectorAll(".rsec").forEach(function (x) { var k = d.dataset.slug + "|" + x.querySelector("summary b").textContent; if (k in openSecs) x.open = openSecs[k]; });
      });
    };
    setTimeout(restore, 0);
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
  var PH = {};   // 사진 id → {url,w,h} — 한 번 받은 서명 주소는 다시 받지 않는다(30초 갱신 · 전송량)
  function photos(list) {
    var ids = [], byId = {};
    var put = function () { list.forEach(function (r) { r.photos = ((r.o3 || {}).photos || []).map(function (id) { return PH[id] || null; }).filter(Boolean); }); };
    list.forEach(function (r) { ((r.o3 || {}).photos || []).forEach(function (id) { if (!PH[id]) ids.push(id); }); });
    if (!ids.length) { put(); return Promise.resolve(); }
    return db.from("assets").select("id,storage_path,meta").in("id", ids).then(function (a) {
      var rs = a.data || [];
      rs.forEach(function (x) { byId[x.id] = x; });
      return db.storage.from("uploads").createSignedUrls(rs.map(function (x) { return x.storage_path; }), 6 * 3600);
    }).then(function (s) {
      var u = {}; ((s && s.data) || []).forEach(function (x) { u[x.path] = x.signedUrl; });
      Object.keys(byId).forEach(function (id) { var x = byId[id]; PH[id] = { url: u[x.storage_path], w: (x.meta || {}).w, h: (x.meta || {}).h }; });
      put();
    });
  }

  var SIG = "";
  function load(first) {
    return db.from("projects").select("id,slug,brand,product,created_at,updated_at,test_label,client_id").eq("production_track", "option3").order("created_at", { ascending: false })
      .then(function (r) {
        if (r.error) throw r.error;
        rows = r.data || [];
        if (!rows.length) return;
        return db.from("briefs").select("project_id,option3").in("project_id", rows.map(function (x) { return x.id; })).then(function (b) {
          var m = {}; (b.data || []).forEach(function (x) { m[x.project_id] = x.option3 || {}; });
          rows.forEach(function (x) { x.o3 = m[x.id] || {}; });
          return db.from("option3_reports").select("project_id,report").in("project_id", rows.map(function (x) { return x.id; }));
        }).then(function (rr) {
          // 10-19 Dan 「관리 페이지 프로젝트에 의뢰인 이름이 나오면 좋겠어」 — 건 → 의뢰 회사(clients) → 그 계정(profiles)
          var cids = rows.map(function (x) { return x.client_id; }).filter(Boolean);
          return db.from("clients").select("id,owner_id").in("id", cids).then(function (c) {
            var own = {}; (c.data || []).forEach(function (x) { own[x.id] = x.owner_id; });
            var uids = Object.keys(own).map(function (k) { return own[k]; }).filter(Boolean);
            return db.from("profiles").select("id,name,email").in("id", uids).then(function (pf) {
              var who = {}; (pf.data || []).forEach(function (x) { who[x.id] = x; });
              rows.forEach(function (x) { x.who = who[own[x.client_id]] || null; });
              return rr;
            });
          });
        }).then(function (rr) {
          var m2 = {}; ((rr && rr.data) || []).forEach(function (x) { m2[x.project_id] = x.report; });
          rows.forEach(function (x) { x.report = m2[x.id] || null; });
          rows.sort(function (a, b) { return (b.o3.submitted_at || b.created_at) > (a.o3.submitted_at || a.created_at) ? 1 : -1; });
          return photos(rows);
        });
      }).then(function () {
        var sig = JSON.stringify(rows.map(function (x) { return [x.id, x.test_label, x.o3, x.report]; }));
        if (sig === SIG) return;
        SIG = sig;
        render();
        if (!first) return;
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
      var ep = e.target.closest("[data-ec-pick],[data-ec-fix]");
      if (ep && !ep.disabled) {
        var pid = ep.dataset.pid || ep.dataset.ecFix, inp = el("list").querySelector('[data-ec-note="' + pid + '"]'), nt = inp ? (inp.value || "").trim() : "";
        var pk = ep.dataset.ecPick ? +ep.dataset.ecPick : null, m = el("list").querySelector('[data-ec-msg="' + pid + '"]');
        if (!pk && !nt) { if (m) m.textContent = "수정할 내용을 적어 주세요"; return; }
        ep.disabled = true;
        db.rpc("onecue_option3_endcard", { p_project_id: pid, p_pick: pk, p_note: nt || null }).then(function (x) {
          if (x.error) throw x.error;
          if (m) m.textContent = pk ? "바꾸는 중입니다 — 1분 안에 위 영상이 바뀝니다" : "수정 요청을 보냈습니다 — 고쳐서 다시 올립니다";
          setTimeout(function () { load(false).catch(function () {}); }, 20000);
        }).catch(function (x) { ep.disabled = false; if (m) m.textContent = "보내지 못했습니다 — " + (x.message || x); });
        return;
      }
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
        // 화면에 보이는 동안 30초마다 새 의뢰·분석을 다시 불러온다
        setInterval(function () { if (document.visibilityState === "visible") load(false).catch(function () {}); }, 30000);
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(false).catch(function () {}); });
        return load(true);
      });
    }).catch(function (e) { el("list").innerHTML = '<div class="empty">불러오지 못했습니다 — ' + esc(e.message || e) + "</div>"; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
