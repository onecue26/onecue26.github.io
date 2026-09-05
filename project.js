// onecue — 건 상세
//
// 광고주가 보는 화면이다. 지금 어디까지 왔는지 보여주고,
// 판단할 자리(5안 선택 · 콘티 승인)에서만 버튼을 띄운다.

(function () {
  "use strict";

  var cfg = window.ONECUE || {}, db = null, P = null;

  var STEPS = [
    ["brief", "의뢰"], ["facts", "팩트"], ["strategy", "전략"],
    ["concepts", "5안"], ["develop", "전개"], ["storyboard", "콘티"],
    ["anchors", "앵커"], ["video", "영상"], ["deliver", "납품"],
  ];
  var IDX = {}; STEPS.forEach(function (s, i) { IDX[s[0]] = i; });

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

  // 이 건을 이 브라우저에 기억해 둔다 — 주소를 잃어버려도 첫 화면에서 다시 찾도록
  function remember(p) {
    try {
      var k = "onecue.mine";
      var list = JSON.parse(localStorage.getItem(k) || "[]");
      if (list.some(function (x) { return x.slug === p.slug; })) return;
      list.unshift({ slug: p.slug, brand: p.brand, product: p.product, at: Date.now() });
      localStorage.setItem(k, JSON.stringify(list.slice(0, 30)));
    } catch (e) { /* 사생활 보호 모드 — 기억 못 해도 진행에 지장 없다 */ }
  }

  function bar(step) {
    var at = IDX[step] == null ? 0 : IDX[step];
    return '<div class="bar">' + STEPS.map(function (s, i) {
      return '<i class="' + (i < at ? "done" : i === at ? "now" : "") + '"></i>';
    }).join("") + "</div><div class=\"stepnames\">" +
      STEPS.map(function (s) { return "<span>" + esc(s[1]) + "</span>"; }).join("") + "</div>";
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
      (b.format ? "<dt>형식</dt><dd>" + esc(b.format) + "</dd>" : "") +
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
  function secFiles(assets) {
    var f = (assets || []).filter(function (a) { return a.kind === "product_ref"; });
    if (!f.length) return "";
    return "<h2>보내주신 자료 " + f.length + "</h2><div class=\"files\">" +
      f.map(function (a) {
        var img = (a.mime || "").indexOf("image/") === 0;
        return '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
          (img ? '<img src="' + esc(a.url) + '" alt="' + esc(a.role) + '" loading="lazy">'
               : '<span class="doc">PDF</span>') +
          "<em>" + esc(a.role) + "</em></a>";
      }).join("") + "</div>";
  }

  function secStrategy(s) {
    if (!s) return "";
    return "<h2>전략</h2><div class=\"panel\"><dl class=\"kv\">" +
      (s.insight ? "<dt>인사이트</dt><dd>" + nl(s.insight) + "</dd>" : "") +
      (s.usp ? "<dt>USP</dt><dd>" + nl(s.usp) + "</dd>" : "") +
      (s.one_message ? "<dt>한 줄</dt><dd><b>" + esc(s.one_message) + "</b></dd>" : "") +
      (s.tone ? "<dt>톤</dt><dd>" + esc(s.tone) + "</dd>" : "") +
      "</dl></div>";
  }

  function secConcepts(list, canPick) {
    if (!list || !list.length) return "";
    var chosen = list.filter(function (c) { return c.is_chosen; })[0];
    var head = "<h2>컨셉 5안" + (chosen ? " — " + esc(chosen.key) + "안 선택됨" : "") + "</h2>";
    var body = '<div class="concepts">' + list.map(function (c) {
      var pick = (canPick && !c.is_chosen)
        ? '<button class="btn ghost pickbtn" data-pick="' + esc(c.key) + '">이걸로 하겠습니다</button>'
        : "";
      return '<div class="cc' + (c.is_chosen ? " chosen" : "") + '">' +
        '<span class="k">' + esc(c.key) + "안 · " + esc(c.axis || "") + "</span>" +
        '<span class="t">' + esc(c.title || "") + "</span>" +
        '<span class="b">' + esc(c.body || "") + "</span>" +
        (c.hook ? '<span class="b">훅 · ' + esc(c.hook) + "</span>" : "") +
        pick + "</div>";
    }).join("") + "</div>";
    return head + body;
  }

  function secCuts(cuts, assets) {
    if (!cuts || !cuts.length) return "";
    var byCut = {};
    (assets || []).forEach(function (a) {
      if (a.kind === "anchor" && a.cut_n != null && !byCut[a.cut_n]) byCut[a.cut_n] = a;
    });
    return "<h2>콘티 " + cuts.length + "컷</h2><div class=\"cuts\">" + cuts.map(function (c) {
      var img = byCut[c.n];
      var t = (c.t_start != null ? c.t_start + "–" + c.t_end + "초" : "");
      var spec = [c.size, c.angle, c.move, c.lens].filter(Boolean)
        .map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
      return '<div class="cut' + (img ? "" : " noimg") + '">' +
        (img
          ? '<img src="' + esc(img.url) + '" alt="컷 ' + c.n + '" loading="lazy">'
          : '<div class="noimg-n">' + c.n + "</div>") +
        '<div class="body"><div class="head">' +
          '<span class="n">' + c.n + "</span>" +
          '<span class="tt">' + esc(t) + "</span>" +
          '<span class="blk">' + esc(c.block || "") + "</span></div>" +
          '<div class="what">' + esc(c.action || "") + "</div>" +
          (c.intent ? '<div class="why">' + esc(c.intent) + "</div>" : "") +
          (spec ? '<div class="spec">' + spec + "</div>" : "") +
        "</div></div>";
    }).join("") + "</div>";
  }

  // 지금 광고주가 무엇을 해야 하나
  function secGate(p, approvals) {
    var done = {}; (approvals || []).forEach(function (a) { done[a.gate] = a; });

    if (p.step === "concepts" && p.state === "ready" && !done.concepts) {
      return '<div class="gate"><div class="txt"><b>컨셉을 골라주세요</b>' +
        "<small>다섯 가지 방향을 준비했습니다. 하나를 고르시면 그 방향으로 콘티를 만듭니다.</small>" +
        "</div></div>";
    }
    if (p.step === "storyboard" && p.state === "ready" && !done.storyboard) {
      return '<div class="gate"><div class="txt"><b>콘티를 확인해주세요</b>' +
        "<small>아래 컷 구성대로 촬영·생성합니다. 승인하시면 제작에 들어갑니다.</small></div>" +
        '<button class="btn" id="approveBoard">콘티 승인</button>' +
        '<button class="btn ghost" id="reviseBoard">고쳐주세요</button></div>';
    }
    if (done.storyboard) {
      return '<div class="gate done"><div class="txt"><b>콘티 승인 완료</b>' +
        "<small>제작에 들어갑니다. 앵커 이미지와 영상이 준비되면 여기에 올라옵니다.</small>" +
        "</div></div>";
    }
    return '<div class="gate done"><div class="txt"><b>작업 중입니다</b>' +
      "<small>준비되면 이 화면에 올라옵니다. 광고주가 하실 일은 없습니다.</small></div></div>";
  }

  // ── 동작 ──────────────────────────────────────────────────────────────────
  function pickConcept(key) {
    return db.from("concepts").update({ is_chosen: false }).eq("project_id", P.id)
      .then(function () {
        return db.from("concepts").update({ is_chosen: true })
          .eq("project_id", P.id).eq("key", key);
      })
      .then(function () {
        return db.from("approvals").insert({
          project_id: P.id, gate: "concepts", decision: "ok", note: key + "안 선택",
        });
      })
      .then(function () {
        return db.from("projects").update({ step: "develop", state: "pending" })
          .eq("id", P.id);
      })
      .then(function () {
        return db.from("jobs").insert({
          project_id: P.id, step: "develop", kind: "text",
          request: { note: "선택안 전개", chosen: key },
        });
      });
  }

  function decideBoard(decision) {
    return db.from("approvals").insert({
      project_id: P.id, gate: "storyboard", decision: decision,
      note: decision === "ok" ? "콘티 승인" : "콘티 수정 요청",
    }).then(function () {
      return db.from("projects").update(
        decision === "ok"
          ? { step: "anchors", state: "pending" }
          : { step: "storyboard", state: "idle" }
      ).eq("id", P.id);
    }).then(function () {
      if (decision !== "ok") return null;
      return db.from("jobs").insert({
        project_id: P.id, step: "anchors", kind: "image",
        request: { note: "콘티 승인 — 앵커 이미지 생성" },
      });
    });
  }

  function wire() {
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true; b.textContent = "고르는 중…";
        pickConcept(b.dataset.pick).then(load).catch(function (e) {
          b.disabled = false; b.textContent = "실패 — " + e.message;
        });
      });
    });
    var ap = el("approveBoard"), rv = el("reviseBoard");
    if (ap) ap.addEventListener("click", function () {
      ap.disabled = true; ap.textContent = "처리 중…";
      decideBoard("ok").then(load).catch(function (e) {
        ap.disabled = false; ap.textContent = "실패 — " + e.message;
      });
    });
    if (rv) rv.addEventListener("click", function () {
      rv.disabled = true;
      decideBoard("revise").then(load);
    });

    var z = el("zoom"), zi = el("zoomImg");
    document.querySelectorAll(".cut img").forEach(function (i) {
      i.addEventListener("click", function () { zi.src = i.src; z.classList.add("on"); });
    });
    z.addEventListener("click", function () { z.classList.remove("on"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") z.classList.remove("on");
    });
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
    var slug = qs("slug");
    if (!slug) { el("main").innerHTML = '<div class="empty">건을 지정하지 않았습니다</div>'; return; }

    return db.from("projects").select("*").eq("slug", slug).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        if (!r.data) { el("main").innerHTML = '<div class="empty">그런 건이 없습니다</div>'; return; }
        P = r.data;
        setConn("ok", "연결됨");
        var id = P.id;
        return Promise.all([
          db.from("briefs").select("*").eq("project_id", id).maybeSingle(),
          db.from("strategies").select("*").eq("project_id", id).maybeSingle(),
          db.from("concepts").select("*").eq("project_id", id).order("key"),
          db.from("cuts").select("*").eq("project_id", id).order("n"),
          db.from("assets").select("*").eq("project_id", id),
          db.from("approvals").select("*").eq("project_id", id),
        ]).then(function (x) {
          var title = [P.brand, P.product].filter(Boolean).join(" ") || P.slug;
          el("main").innerHTML =
            '<div class="hero"><div><h1>' + esc(title) + "</h1>" +
              '<div class="sub mono">' + esc(P.slug) + " · " + P.running_sec +
              "초 · " + P.cut_count + "컷 · " +
              esc((P.aspects && P.aspects.length) ? P.aspects.join(" / ") : P.aspect) +
              ((P.channels && P.channels.length) ? " · " + esc(P.channels.join(" ")) : "") +
              "</div>" +
              bar(P.step) + "</div></div>" +
            secGate(P, x[5].data) +
            secConcepts(x[2].data, P.step === "concepts" && P.state === "ready") +
            secCuts(x[3].data, x[4].data) +
            secStrategy(x[1].data) +
            secBrief(x[0].data, canEditBrief(P)) +
            secFiles(x[4].data) +
            '<footer><span><a href="index.html">← 목록</a></span>' +
            '<span class="mono">' + new Date().toISOString().slice(0, 16).replace("T", " ") +
            "</span></footer>";
          wire();
          remember(P);
          var eb = el("editBrief");
          if (eb) eb.addEventListener("click", function () { openBriefEditor(x[0].data || {}); });
        });
      })
      .catch(function (e) {
        setConn("bad", "오류");
        el("main").innerHTML = '<div class="empty"><span class="big">불러오지 못했습니다</span>' +
          esc(e.message) + "</div>";
      });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
