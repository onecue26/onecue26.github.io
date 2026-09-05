// onecue — 로그인
//
// 이메일 주소가 곧 아이디다. 별도 아이디를 만들지 않는다.
// 「이메일 확인」을 꺼뒀기 때문에 가입하면 확인 메일 없이 바로 로그인된다
// (Supabase 기본 메일은 시간당 2통이라 확인 메일을 쓰면 금방 막힌다).

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null, mode = "in";

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
  function say(kind, text) {
    el("msg").className = "msg" + (kind ? " " + kind : "");
    el("msg").textContent = text;
  }

  function setMode(m) {
    mode = m;
    el("tabIn").className = m === "in" ? "on" : "";
    el("tabUp").className = m === "up" ? "on" : "";
    el("go").textContent = m === "in" ? "로그인" : "가입하고 시작하기";
    el("pw").setAttribute("autocomplete", m === "in" ? "current-password" : "new-password");
    // 닉네임은 가입할 때만 묻는다. 이메일은 길어서 화면에 그대로 띄우기 나쁘다
    el("nickWrap").hidden = (m !== "up");
    el("nick").required = (m === "up");
    say("", "");
  }

  // 로그인 뒤에 어디로 돌려보낼지 — ?next=admin.html 처럼 넘어온다
  function nextUrl() {
    var n = new URLSearchParams(location.search).get("next");
    return (n && /^[a-z0-9_.\-]+\.html/i.test(n)) ? n : null;
  }

  function showWho(user) {
    el("form").style.display = "none";
    el("who").classList.add("on");
    el("whoEmail").textContent = user.email;

    db.from("profiles").select("is_admin,name").eq("id", user.id).maybeSingle()
      .then(function (r) {
        var admin = r.data && r.data.is_admin;
        var nick = (r.data && r.data.name) || "";
        el("whoNick").textContent = nick || user.email;
        el("nick2").value = nick;
        el("whoRole").textContent = admin ? "관리자" : "광고주";
        el("goAdmin").hidden = !admin;
        var n = nextUrl();
        if (n && (admin || n !== "admin.html")) location.replace(n);
      });

    el("saveNick").addEventListener("click", function () {
      var v = el("nick2").value.trim();
      if (!v) {
        el("nickMsg").className = "msg err";
        el("nickMsg").textContent = "닉네임을 비울 수는 없습니다";
        return;
      }
      el("nickMsg").className = "msg";
      el("nickMsg").textContent = "저장 중…";
      db.from("profiles").update({ name: v }).eq("id", user.id).then(function (r) {
        if (r.error) {
          el("nickMsg").className = "msg err";
          el("nickMsg").textContent = "저장 실패 — " + r.error.message;
          return;
        }
        el("nickMsg").className = "msg ok";
        el("nickMsg").textContent = "바꿨습니다";
        el("whoNick").textContent = v;
      });
    });
  }

  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");

    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = shared();
    setConn("ok", "연결됨");

    el("tabIn").addEventListener("click", function () { setMode("in"); });
    el("tabUp").addEventListener("click", function () { setMode("up"); });

    el("logout").addEventListener("click", function () {
      db.auth.signOut().then(function () { location.reload(); });
    });

    db.auth.getUser().then(function (r) {
      if (r.data && r.data.user) showWho(r.data.user);
    });

    el("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = el("email").value.trim(), pw = el("pw").value;
      var nick = el("nick").value.trim();
      if (mode === "up" && !nick) { say("err", "닉네임을 넣어주세요."); return; }

      el("go").disabled = true;
      say("", mode === "in" ? "확인 중…" : "만드는 중…");

      var p = mode === "in"
        ? db.auth.signInWithPassword({ email: email, password: pw })
        : db.auth.signUp({ email: email, password: pw });

      p.then(function (r) {
        el("go").disabled = false;
        if (r.error) {
          say("err", translate(r.error.message));
          return;
        }
        if (!r.data.session) {
          // 확인 메일이 켜져 있으면 여기로 온다
          say("ok", "메일함을 확인해 주세요. 확인 링크를 눌러야 로그인됩니다.");
          return;
        }
        var user = r.data.user;
        var after = function () { say("ok", "됐습니다."); showWho(user); };
        if (mode === "up") {
          // 가입 직후엔 트리거가 방금 만든 profiles 행에 닉네임을 얹는다
          db.from("profiles").update({ name: nick }).eq("id", user.id).then(after, after);
        } else {
          after();
        }
      });
    });

    setMode("in");
  }

  // Supabase 오류 문구가 영어라 자주 나오는 것만 우리말로 바꾼다
  function translate(m) {
    if (/Invalid login credentials/i.test(m)) return "이메일이나 비밀번호가 맞지 않습니다.";
    if (/already registered|already been registered/i.test(m))
      return "이미 가입된 이메일입니다. 위의 「로그인」으로 들어오세요.";
    if (/Password should be at least/i.test(m)) return "비밀번호는 6자 이상이어야 합니다.";
    if (/rate limit|too many/i.test(m)) return "잠시 뒤에 다시 시도해 주세요.";
    return m;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
