// onecue — 콘티 검수 (관리자 전용)
//
// 광고주 화면과 같은 그림을 보되, 고칠 데를 그 자리에서 적는다.
// 콘티를 보다가 「4번 컷은 이렇게」가 떠올랐을 때 적어둘 자리가 없으면
// 대화창으로 흘러가고, 그러면 콘티 옆에 안 남는다.
//
// 광고주 메모(approvals.note)와 다른 칸이다 — 광고주는 승인할 때 한 번 말하고,
// 관리자는 만드는 내내 적는다. 섞으면 누가 한 말인지 사라진다.

(function () {
  "use strict";

  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null, P = null, CUTS = [], ASSETS = [];
  var DIRTY = {};          // 바뀐 컷만 저장한다. 12개를 매번 다 쓰지 않는다
  var WHOLE_DIRTY = false;
  var ONLY_MARKED = false;

  function el(id) { return document.getElementById(id); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function setConn(k, t) {
    var p = el("conn"); p.className = "pill" + (k ? " " + k : "");
    p.innerHTML = '<span class="dot"></span>' + esc(t);
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────
  function clips() {
    var v = ASSETS.filter(function (a) { return a.kind === "clip"; });
    if (!v.length) return "";
    return "<h2>영상 " + v.length + "판</h2><div class=\"clips\">" + v.map(function (c) {
      return '<figure class="clip"><video src="' + esc(c.url) +
        '" controls playsinline preload="metadata"></video>' +
        "<figcaption>" + esc(c.role || "") +
        ' · <a href="' + esc(c.url) + '" target="_blank" rel="noopener">새 창</a>' +
        "</figcaption></figure>";
    }).join("") + "</div>";
  }

  // ★완성본 검수 — 여기서 넘겨야 광고주 화면에 뜬다.
  // 만들자마자 광고주에게 보이던 것을 막았다 (Dan 2026-09-08)
  function finals() {
    var v = ASSETS.filter(function (a) { return a.kind === "final"; });
    if (!v.length) return "";
    return "<h2>완성본 " + v.length + "개 — 검수</h2>" +
      '<p class="hint">여기서 <b>넘기기</b>를 눌러야 광고주 화면에 뜹니다. ' +
      "누르기 전에는 광고주에게 안 보입니다.</p>" +
      '<div class="clips">' + v.map(function (c) {
        return '<figure class="clip"><video src="' + esc(c.url) +
          '" controls playsinline preload="metadata"></video>' +
          "<figcaption>" + esc(c.role || "") +
          ' · <a href="' + esc(c.url) + '" target="_blank" rel="noopener">새 창</a>' +
          '<br><button type="button" class="btn' + (c.approved ? " ghost" : "") +
          '" data-final="' + esc(c.id) + '" data-to="' + (c.approved ? "0" : "1") + '">' +
          (c.approved ? "광고주 화면에서 내리기" : "★ 광고주에게 넘기기") + "</button>" +
          '<span class="st">' + (c.approved ? "광고주에게 보이는 중" : "아직 안 넘김") +
          "</span></figcaption></figure>";
      }).join("") + "</div>";
  }

  function board() {
    var sheet = ASSETS.filter(function (a) {
      return a.kind === "board" && a.cut_n == null;
    })[0];
    if (!sheet) return "";
    return "<h2>콘티 시트</h2><div class=\"board\"><img src=\"" + esc(sheet.url) +
      '" alt="콘티 시트" loading="lazy"></div>';
  }

  // 컷 한 줄에 그림 셋 — 콘티(계획) · 완성(이미지) · 영상(움직임)
  function shots(n) {
    function pick(kind) {
      return ASSETS.filter(function (a) {
        return a.kind === kind && a.cut_n === n;
      })[0] || null;
    }
    var b = pick("board"), a = pick("anchor");
    var v = ASSETS.filter(function (c) {
      if (c.kind !== "clip") return false;
      var m = (c.meta && c.meta.cuts) || [];
      return m.indexOf(n) >= 0;
    })[0];
    if (!b && !a && !v) return '<div class="noimg-n">' + n + "</div>";
    function pic(label, x, cls) {
      return '<figure class="' + cls + (x ? " on" : "") + '">' +
        (x ? '<img src="' + esc(x.url) + '" alt="컷 ' + n + '" loading="lazy">'
           : '<div class="none">—</div>') +
        "<figcaption>" + (x ? label : "대기") + "</figcaption></figure>";
    }
    function vid(x) {
      return '<figure class="made' + (x ? " on" : "") + '">' +
        (x ? '<video src="' + esc(x.url) + '" controls playsinline preload="metadata"></video>'
           : '<div class="none">—</div>') +
        "<figcaption>" + (x ? "영상" : "대기") + "</figcaption></figure>";
    }
    return '<div class="shots three">' + pic("콘티", b, "plan") +
      pic("완성", a, "made") + vid(v) + "</div>";
  }

  function cutCard(c) {
    var img = true;
    var t = (c.t_start != null ? c.t_start + "–" + c.t_end + "초" : "");
    var spec = [c.size, c.angle, c.move, c.lens].filter(Boolean)
      .map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
    var note = c.note || "";

    return '<div class="cut' + (img ? "" : " noimg") + (note ? " marked" : "") +
      '" data-cut="' + c.n + '">' +
      shots(c.n) +
      '<div class="body"><div class="head">' +
        '<span class="n">' + c.n + "</span>" +
        '<span class="tt">' + esc(t) + "</span>" +
        '<span class="blk">' + esc(c.block || "") + "</span></div>" +
        '<div class="what">' + esc(c.action || "") + "</div>" +
        (c.intent ? '<div class="why">' + esc(c.intent) + "</div>" : "") +
        (c.dialogue ? '<div class="why">대사 · ' + esc(c.dialogue) + "</div>" : "") +
        (spec ? '<div class="spec">' + spec + "</div>" : "") +
        '<div class="memo"><span class="lbl">이 컷 고칠 것</span>' +
        '<textarea data-note="' + c.n + '" maxlength="600" class="' +
        (note ? "has" : "") + '" placeholder="예 · 봉지 글자가 깨졌다. 재생성">' +
        esc(note) + "</textarea></div>" +
      "</div></div>";
  }

  function render() {
    var marked = CUTS.filter(function (c) { return (c.note || "").trim(); }).length;
    var list = ONLY_MARKED
      ? CUTS.filter(function (c) { return (c.note || "").trim(); })
      : CUTS;

    var title = [P.brand, P.product].filter(Boolean).join(" ") || P.slug;
    el("main").innerHTML =
      '<div class="hero"><div><h1>' + esc(title) + "</h1>" +
        '<div class="sub mono">' + esc(P.slug) + " · " + P.running_sec + "초 · " +
        CUTS.length + "컷 · " + esc(P.step) + "/" + esc(P.state) + "</div></div>" +
        '<a class="btn ghost" href="project.html?slug=' + encodeURIComponent(P.slug) +
        '" target="_blank" rel="noopener">광고주에게 보이는 화면 ↗</a></div>' +

      '<div class="whole"><h3>이 건 전체에 하고 싶은 말</h3>' +
      "<p>판을 뒤집는 말은 여기 적습니다. 컷 하나가 아니라 방향에 대한 것.</p>" +
      '<textarea id="whole" maxlength="2000" placeholder="예 · 아이 얼굴이 나오는 쪽으로 다시 짜자&#10;예 · 슬로건 컷을 하나 더 넣자">' +
      esc(P.admin_note || "") + "</textarea></div>" +

      finals() +
      clips() +
      board() +

      "<h2>컷 " + CUTS.length + "개" +
      (marked ? " — 메모 " + marked + "개" : "") + "</h2>" +
      '<div class="filt"><button type="button" id="fAll"' +
      (ONLY_MARKED ? "" : ' class="on"') + ">전체</button>" +
      '<button type="button" id="fMark"' + (ONLY_MARKED ? ' class="on"' : "") +
      ">메모 있는 것만</button>" +
      (marked ? "" : "<span>아직 적은 메모가 없습니다.</span>") + "</div>" +

      '<div class="cuts">' + list.map(cutCard).join("") + "</div>" +

      '<div class="dock">' +
      '<button class="btn" type="button" id="save">저장</button>' +
      '<button class="btn ghost" type="button" id="send">저장하고 광고주에게 보내기</button>' +
      '<span class="spacer"></span><span class="msg" id="msg"></span></div>';

    wire();
  }

  // ── 동작 ──────────────────────────────────────────────────────────────────
  function wire() {
    // 완성본 넘기기/내리기 — 누르는 즉시 광고주 화면이 바뀐다
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-final]"), function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-final"), to = b.getAttribute("data-to") === "1";
          b.disabled = true;
          db.from("assets").update({ approved: to }).eq("id", id)
            .then(function (r) {
              if (r.error) throw r.error;
              say("ok", to ? "광고주 화면에 올렸습니다" : "광고주 화면에서 내렸습니다");
              return load();
            })
            .catch(function (e) { b.disabled = false; fail(e); });
        });
      });
    el("fAll").addEventListener("click", function () {
      if (!ONLY_MARKED) return;
      pull(); ONLY_MARKED = false; render();
    });
    el("fMark").addEventListener("click", function () {
      if (ONLY_MARKED) return;
      pull(); ONLY_MARKED = true; render();
    });

    document.querySelectorAll("[data-note]").forEach(function (t) {
      t.addEventListener("input", function () {
        var n = +t.dataset.note;
        var c = CUTS.filter(function (x) { return x.n === n; })[0];
        if (!c) return;
        c.note = t.value;
        DIRTY[n] = true;
        t.className = t.value.trim() ? "has" : "";
        say("", "저장 안 됨 — 아래 「저장」을 누르세요");
      });
    });

    el("whole").addEventListener("input", function () {
      P.admin_note = el("whole").value;
      WHOLE_DIRTY = true;
      say("", "저장 안 됨 — 아래 「저장」을 누르세요");
    });

    el("save").addEventListener("click", function () { save().then(done, fail); });
    el("send").addEventListener("click", function () {
      save().then(send).then(function () {
        say("ok", "저장하고 광고주에게 보냈습니다");
        return load();
      }, fail);
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

  // 화면을 다시 그리기 전에 지금 칸에 적힌 것을 메모리로 걷어 온다.
  // 안 그러면 필터를 누르는 순간 방금 쓴 글이 날아간다
  function pull() {
    document.querySelectorAll("[data-note]").forEach(function (t) {
      var n = +t.dataset.note;
      var c = CUTS.filter(function (x) { return x.n === n; })[0];
      if (c && c.note !== t.value) { c.note = t.value; DIRTY[n] = true; }
    });
    var w = el("whole");
    if (w && P.admin_note !== w.value) { P.admin_note = w.value; WHOLE_DIRTY = true; }
  }

  function say(kind, text) {
    var m = el("msg");
    if (!m) return;
    m.className = "msg" + (kind ? " " + kind : "");
    m.textContent = text;
  }
  function done() { say("ok", "저장했습니다"); }
  function fail(e) { say("err", "저장 실패 — " + (e && e.message ? e.message : e)); }

  function save() {
    pull();
    say("", "저장 중…");
    var jobs = Object.keys(DIRTY).map(function (n) {
      var c = CUTS.filter(function (x) { return x.n === +n; })[0];
      return db.from("cuts").update({ note: (c.note || "").trim() || null })
        .eq("project_id", P.id).eq("n", +n);
    });
    if (WHOLE_DIRTY) {
      jobs.push(db.from("projects")
        .update({ admin_note: (P.admin_note || "").trim() || null,
                  updated_at: new Date() })
        .eq("id", P.id));
    }
    return Promise.all(jobs).then(function (rs) {
      var bad = rs.filter(function (r) { return r && r.error; })[0];
      if (bad) throw bad.error;
      DIRTY = {}; WHOLE_DIRTY = false;
    });
  }

  // 1차 검수를 마쳤다 → 광고주 차례로 넘긴다
  function send() {
    return db.from("projects").update({ state: "ready", updated_at: new Date() })
      .eq("id", P.id)
      .then(function () {
        return db.from("events").insert({
          project_id: P.id, kind: "sent", to_step: P.step,
          payload: { by: "admin", note: "콘티 검수 완료 — 광고주에게 넘김" },
        });
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
        return Promise.all([
          db.from("cuts").select("*").eq("project_id", P.id).order("n"),
          db.from("assets").select("*").eq("project_id", P.id),
        ]).then(function (x) {
          CUTS = x[0].data || [];
          ASSETS = x[1].data || [];
          if (!CUTS.length) {
            el("main").innerHTML =
              '<div class="empty"><span class="big">아직 콘티가 없습니다</span>' +
              "컷이 만들어지면 여기서 검수합니다.<br><br>" +
              '<a class="btn ghost" href="admin.html">← 목록</a></div>';
            return;
          }
          render();
        });
      })
      .catch(function (e) { setConn("bad", "불러오기 실패"); fail(e); });
  }

  // 이 화면은 관리자만 본다
  function gate() {
    return db.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) {
        location.replace("login.html?next=board.html" + location.search.replace("?", "&"));
        return false;
      }
      return db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
        .then(function (p) {
          if (!p.data || !p.data.is_admin) {
            el("main").innerHTML =
              '<div class="empty"><span class="big">관리자만 볼 수 있는 화면입니다</span>' +
              esc(user.email) + " 계정에는 권한이 없습니다.<br><br>" +
              '<a class="btn ghost" href="index.html">첫 화면으로</a></div>';
            setConn("bad", "권한 없음");
            return false;
          }
          return true;
        });
    });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = shared();
    gate().then(function (ok) { if (ok) load(); });

    // 적다 만 걸 들고 나가지 않게 막는다
    window.addEventListener("beforeunload", function (e) {
      if (Object.keys(DIRTY).length || WHOLE_DIRTY) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
