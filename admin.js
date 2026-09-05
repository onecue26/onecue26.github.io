// onecue — 관리자 화면
//
// 광고주가 「의뢰하기」를 누르면 이메일이 아니라 여기로 들어온다.
// 하는 일은 둘 — ①새 의뢰를 본다 ②건의 단계를 옮긴다.
// 단계를 옮기면 광고주 화면이 바로 그에 맞춰 바뀐다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null;

  var STEPS = [
    ["brief", "의뢰"], ["facts", "팩트"], ["strategy", "전략"],
    ["concepts", "5안"], ["develop", "전개"], ["storyboard", "콘티"],
    ["anchors", "앵커"], ["video", "영상"], ["deliver", "납품"],
  ];
  // 이 단계로 옮기면 광고주가 판단할 차례가 된다
  var GATE = { strategy: "검토", concepts: "선택", storyboard: "승인" };

  // 단계별로 회신 메일 문구가 다르다. 지금은 자동 발송이 없어 초안만 열어준다
  var MAIL = {
    strategy: ["전략 방향을 보내드립니다", "정리한 전략을 아래에서 확인해 주세요."],
    concepts: ["컨셉 5안이 준비됐습니다", "다섯 가지 방향을 준비했습니다. 아래에서 보시고 하나를 골라 주세요."],
    storyboard: ["콘티가 준비됐습니다", "컷 구성을 아래에서 확인하시고 승인해 주세요."],
    anchors: ["제작에 들어갑니다", "승인해 주신 콘티대로 제작을 시작했습니다."],
    deliver: ["완성본을 보내드립니다", "작업이 끝났습니다. 아래에서 확인해 주세요."],
  };

  function mailto(p, link) {
    var m = MAIL[p.step] || ["진행 상황을 알려드립니다", "아래에서 확인하실 수 있습니다."];
    var name = [p.brand, p.product].filter(Boolean).join(" ");
    var body = [
      (p.who ? p.who.name + "님, " : "") + "안녕하세요. onecue 입니다.",
      "",
      "「" + name + "」 " + m[1],
      "",
      link,
      "",
      "확인하시고 회신 주시면 이어서 진행하겠습니다.",
      "감사합니다.",
    ].join("\n");
    return "mailto:" + encodeURIComponent(p.who ? p.who.email : "") +
      "?subject=" + encodeURIComponent("[onecue] " + name + " — " + m[0]) +
      "&body=" + encodeURIComponent(body);
  }

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

      var files = (p.files || []).length
        ? '<div class="files"><span class="lbl">광고주가 올린 것 ' + p.files.length + "</span>" +
          p.files.map(function (f) {
            var img = (f.mime || "").indexOf("image/") === 0;
            return '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" download>' +
              (img ? '<img src="' + esc(f.url) + '" alt="' + esc(f.role) + '">'
                   : '<span class="doc">PDF</span>') +
              '<em>' + esc(f.role) + "</em></a>";
          }).join("") + "</div>"
        : "";

      // 회신은 아직 자동이 아니다 — 누르면 메일 앱이 제목·본문까지 채워진 채로 열린다
      var link = location.href.replace(/admin\.html.*$/, "") +
        "project.html?slug=" + encodeURIComponent(p.slug);
      var who = p.who ? '<div class="who">' +
        "<b>" + esc(p.who.name) + "</b> " + esc(p.who.title || "") +
        ' · <a href="mailto:' + esc(p.who.email) + '">' + esc(p.who.email) + "</a>" +
        (p.who.phone ? " · " + esc(p.who.phone) : "") +
        ' <a class="btn ghost mailbtn" href="' + mailto(p, link) + '">회신 메일 쓰기</a>' +
        "</div>" : "";

      return '<div class="wrk"><div class="top"><div>' +
        '<div class="name">' + esc([p.brand, p.product].filter(Boolean).join(" ")) + "</div>" +
        '<div class="meta">' + esc(p.slug) + " · " + p.running_sec + "초 · " +
        p.cut_count + "컷 · " + esc((p.aspects || []).join("/")) + "</div>" +
        '<div class="have">' + have + "</div></div>" +
        '<a class="btn ghost" href="project.html?slug=' + encodeURIComponent(p.slug) +
        '">광고주 화면 →</a></div>' + who + files +
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
      return Promise.all([
        Promise.all(tables.map(function (t) {
          return db.from(t[0]).select("project_id").in("project_id", ids);
        })),
        // 광고주가 올린 파일은 개수만이 아니라 실물을 봐야 한다
        db.from("assets").select("project_id,role,url,mime,bytes")
          .eq("kind", "product_ref").in("project_id", ids),
        // 회신을 보내려면 연락처가 보여야 한다. 로그인한 관리자만 읽힌다
        db.from("contacts").select("project_id,name,email,phone,title")
          .in("project_id", ids),
      ]).then(function (out) {
        var counts = out[0], files = out[1].data || [], people = out[2].data || [];
        rows.forEach(function (r) {
          tables.forEach(function (t, i) {
            var d = counts[i].data || [];
            r[t[1]] = d.filter(function (x) { return x.project_id === r.id; }).length;
          });
          r.files = files.filter(function (f) { return f.project_id === r.id; });
          r.who = people.filter(function (c) { return c.project_id === r.id; })[0] || null;
        });
        renderWork(rows);
      });
    });
  }

  // 이 화면은 관리자만 본다. 주소만 알면 아무나 단계를 바꿀 수 있으면 안 된다
  function gate() {
    return db.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) {
        location.replace("login.html?next=admin.html");
        return false;
      }
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
          setConn("ok", esc(p.data.email));
          return true;
        });
    });
  }

  function boot() {
    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = shared();
    // 로그아웃은 상단 바(auth.js)가 그린다. 여기서 또 붙잡지 않는다
    el("reload").addEventListener("click", load);
    gate().then(function (ok) { if (ok) load(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
