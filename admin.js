// onecue — 관리자 화면
//
// 광고주가 「의뢰하기」를 누르면 이메일이 아니라 여기로 들어온다.
// 하는 일은 셋 — ①새로 들어온 걸 안다 ②단계를 옮긴다 ③회신 문구를 가져간다.
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

  var cfg = window.ONECUE || {}, db = null, ROWS = [];

  var STEPS = [
    ["brief", "의뢰"], ["facts", "팩트"], ["strategy", "전략"],
    ["concepts", "5안"], ["develop", "전개"], ["storyboard", "콘티"],
    ["anchors", "앵커"], ["video", "영상"], ["deliver", "납품"],
  ];
  // 이 단계로 옮기면 광고주가 판단할 차례가 된다
  var GATE = { strategy: "검토", concepts: "선택", storyboard: "승인" };

  // 단계별로 회신 문구가 다르다
  var MAIL = {
    brief: ["의뢰를 받았습니다", "보내주신 내용을 확인했습니다. 전략과 컨셉을 준비해 연락드리겠습니다."],
    facts: ["의뢰를 받았습니다", "보내주신 내용을 확인했습니다. 전략과 컨셉을 준비해 연락드리겠습니다."],
    strategy: ["전략 방향을 보내드립니다", "정리한 전략을 아래에서 확인해 주세요."],
    concepts: ["컨셉 5안이 준비됐습니다", "다섯 가지 방향을 준비했습니다. 아래에서 보시고 하나를 골라 주세요."],
    develop: ["선택하신 방향으로 전개 중입니다", "고르신 컨셉으로 카피와 구성을 만들고 있습니다."],
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

    return '<div class="wrk' + (isNew ? " fresh" : "") + '">' +
      '<div class="top"><div>' +
      '<div class="name">' + (isNew ? '<span class="new">NEW</span>' : "") +
      esc([p.brand, p.product].filter(Boolean).join(" ")) + "</div>" +
      '<div class="meta">' + esc(p.slug) + " · " + p.running_sec + "초 · " +
      esc((p.aspects || []).join("/")) +
      (p.created_at ? " · " + ago(p.created_at) : "") + "</div>" +
      '<div class="have">' + have + "</div></div>" +
      '<a class="btn ghost" href="' + esc(siteUrl(p.slug)) +
      '" target="_blank" rel="noopener">광고주에게 보이는 화면 ↗</a></div>' +
      said + who +
      '<div class="mailbox" id="mail-' + esc(p.slug) + '" hidden></div>' +
      files +
      '<div class="steps"><span class="lbl">단계를 옮긴다</span>' + buttons + "</div></div>";
  }

  function render() {
    var fresh = ROWS.filter(function (r) { return r.isNew; });
    el("alert").innerHTML = fresh.length
      ? '<div class="newbar"><b>새 의뢰 ' + fresh.length + "건</b>" +
        fresh.map(function (r) {
          return '<a href="#c-' + esc(r.slug) + '">' +
            esc([r.brand, r.product].filter(Boolean).join(" ")) + "</a>";
        }).join("") + "</div>"
      : "";

    el("work").innerHTML = ROWS.length
      ? ROWS.map(function (p) {
          return '<div id="c-' + esc(p.slug) + '">' + card(p) + "</div>";
        }).join("")
      : '<div class="empty"><span class="big">아직 들어온 의뢰가 없습니다</span>' +
        "광고주가 의뢰하면 여기에 뜹니다.</div>";

    document.querySelectorAll(".steps button").forEach(function (b) {
      b.addEventListener("click", function () {
        b.disabled = true;
        move(b.dataset.slug, b.dataset.step).then(load);
      });
    });
    document.querySelectorAll("[data-mail]").forEach(function (b) {
      b.addEventListener("click", function () { toggleMail(b.dataset.mail); });
    });
  }

  // 정지점으로 옮기면 state=ready (광고주가 판단할 차례), 그 밖에는 pending
  function move(slug, step) {
    var state = GATE[step] ? "ready" : "pending";
    return db.from("projects").update({ step: step, state: state, updated_at: new Date() })
      .eq("slug", slug)
      .then(function () {
        return db.from("projects").select("id").eq("slug", slug).single();
      })
      .then(function (r) {
        // 단계를 옮겼으면 그 건의 대기 작업은 처리된 것으로 본다
        db.from("jobs").update({ state: "ok", finished_at: new Date() })
          .eq("project_id", r.data.id).eq("state", "queued");
        return db.from("events").insert({
          project_id: r.data.id, kind: "step", to_step: step, payload: { by: "admin" },
        });
      });
  }

  // ── 불러오기 ──────────────────────────────────────────────────────────────
  function load() {
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
          db.from("assets").select("project_id,role,url,mime")
            .eq("kind", "product_ref").in("project_id", ids),
          db.from("contacts").select("project_id,name,email,phone,title").in("project_id", ids),
          db.from("jobs").select("project_id").eq("state", "queued").in("project_id", ids),
          db.from("briefs").select("project_id,raw,goal,target").in("project_id", ids),
        ]).then(function (out) {
          var cs = out[0], files = out[1].data || [], people = out[2].data || [];
          var queued = (out[3].data || []).map(function (j) { return j.project_id; });
          var briefs = out[4].data || [];

          ROWS.forEach(function (p) {
            counts.forEach(function (t, i) {
              var d = cs[i].data || [];
              p[t[1]] = d.filter(function (x) { return x.project_id === p.id; }).length;
            });
            p.files = files.filter(function (f) { return f.project_id === p.id; });
            p.who = people.filter(function (c) { return c.project_id === p.id; })[0] || null;
            // 「새 의뢰」 = 아직 우리가 손대지 않은 것. 처리하면 표시가 사라진다
            p.isNew = queued.indexOf(p.id) >= 0;
            var b = briefs.filter(function (x) { return x.project_id === p.id; })[0];
            if (b) { p.brief_raw = b.raw; p.brief_goal = b.goal; p.brief_target = b.target; }
          });
          setConn("ok", "새 의뢰 " + ROWS.filter(function (x) { return x.isNew; }).length);
          render();
        });
      });
  }

  // 이 화면은 관리자만 본다
  function gate() {
    return db.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) { location.replace("login.html?next=admin.html"); return false; }
      return db.from("profiles").select("is_admin,email").eq("id", user.id).maybeSingle()
        .then(function (p) {
          if (!p.data || !p.data.is_admin) {
            document.querySelector("main").innerHTML =
              '<div class="empty"><span class="big">관리자만 볼 수 있는 화면입니다</span>' +
              esc(user.email) + " 계정에는 권한이 없습니다.<br><br>" +
              '<a class="btn ghost" href="index.html">첫 화면으로</a> ' +
              '<a class="btn ghost" href="login.html">다른 계정으로 로그인</a></div>';
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
    el("reload").addEventListener("click", load);
    gate().then(function (ok) { if (ok) load(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
