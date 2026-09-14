// onecue — 로그인
//
// 이메일 주소가 곧 아이디다. 별도 아이디를 만들지 않는다.
// 메일 요청 접수와 실제 수신은 구분한다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null, mode = "in";
  var callback = new URLSearchParams(location.hash.slice(1));
  var recoveryLink = callback.get('type') === 'recovery' && !!callback.get('access_token');
  var callbackError = callback.has('error') || callback.has('error_code');
  var recoveryActive = false, resendTimer = null;

  function cooldown() {
    var until = Date.now() + 60000;
    try { sessionStorage.setItem('onecue-reset-until', String(until)); } catch (_) {}
    updateCooldown();
  }
  function updateCooldown() {
    clearTimeout(resendTimer);
    var until = 0;
    try { until = Number(sessionStorage.getItem('onecue-reset-until')) || 0; } catch (_) {}
    var seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    el('forgot').disabled = seconds > 0;
    el('forgot').textContent = seconds ? seconds + '초 후 다시 요청' : '비밀번호를 잊으셨나요?';
    if (seconds) resendTimer = setTimeout(updateCooldown, 1000);
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
  function say(kind, text) {
    el("msg").className = "msg" + (kind ? " " + kind : "");
    el("msg").textContent = text;
  }

  function resetSay(kind, text) {
    el("resetMsg").className = "msg" + (kind ? " " + kind : "");
    el("resetMsg").textContent = text;
  }

  function showReset() {
    recoveryActive = true;
    history.replaceState(null, '', location.pathname + '?mode=recovery');
    el("form").hidden = true;
    el("form").style.display = "none";
    el("who").classList.remove("on");
    el("resetForm").hidden = false;
    el("newPw").focus();
  }

  function setMode(m) {
    mode = m;
    el("tabIn").className = m === "in" ? "on" : "";
    el("tabUp").className = m === "up" ? "on" : "";
    el("go").textContent = m === "in" ? "로그인" : "가입하고 시작하기";
    el("pw").setAttribute("autocomplete", m === "in" ? "current-password" : "new-password");
    // 닉네임은 선택이다. 안 정하면 이메일이 그대로 뜬다
    el("nickWrap").hidden = (m !== "up");
    say("", "");
  }

  // 로그인 뒤에 어디로 돌려보낼지 — ?next=admin.html 처럼 넘어온다
  function nextUrl() {
    var n = new URLSearchParams(location.search).get("next");
    return (n && /^[a-z0-9_\-]+\.html$/i.test(n)) ? n : null;
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

    el("forgot").addEventListener("click", function () {
      var email = el("email").value.trim();
      if (!email || !el("email").checkValidity()) {
        say("err", "먼저 광고주 계정 이메일을 입력해 주세요.");
        el("email").focus();
        return;
      }
      el("forgot").disabled = true;
      say("", "재설정 메일을 보내고 있습니다…");
      var redirect = 'https://onecue26.github.io/login.html?mode=recovery';
      db.auth.resetPasswordForEmail(email, { redirectTo: redirect }).then(function (r) {
        if (r.error) {
          if (r.error.status === 429) cooldown();
          say("err", translate(r.error.message)); return;
        }
        cooldown();
        say("ok", "재설정 요청을 접수했습니다. 등록된 이메일의 받은편지함과 스팸함을 확인해 주세요. 수신까지 시간이 걸릴 수 있습니다.");
      }).catch(function () {
        say('err', '서버 응답을 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.');
      }).finally(function () {
        updateCooldown();
      });
    });

    db.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") showReset();
    });

    el("resetForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!recoveryActive) { resetSay('err', '메일의 재설정 링크를 다시 열어 주세요.'); return; }
      var first = el("newPw").value, second = el("newPw2").value;
      if (first !== second) { resetSay("err", "새 비밀번호가 서로 다릅니다."); return; }
      el("savePw").disabled = true;
      resetSay("", "변경하고 있습니다…");
      db.auth.updateUser({ password: first }).then(function (r) {
        el("savePw").disabled = false;
        if (r.error) { resetSay("err", translate(r.error.message)); return; }
        el('newPw').value = ''; el('newPw2').value = '';
        el('savePw').disabled = true;
        resetSay("ok", "비밀번호를 변경했습니다. 잠시 후 프로젝트 화면으로 이동합니다.");
        setTimeout(function () { location.replace("index.html"); }, 900);
      }).catch(function () {
        el('savePw').disabled = false;
        resetSay('err', '변경 결과를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.');
      });
    });

    db.auth.getUser().then(function (r) {
      if (recoveryActive) return;
      if (callbackError || recoveryLink || new URLSearchParams(location.search).get("mode") === "recovery") {
        if (!callbackError && recoveryLink && !r.error && r.data && r.data.user) showReset();
        else {
          history.replaceState(null, '', location.pathname);
          say("err", "유효한 재설정 링크를 확인하지 못했습니다. 이메일을 입력하고 다시 요청해 주세요.");
        }
        return;
      }
      if (r.data && r.data.user) showWho(r.data.user);
    }).catch(function () {
      say('err', '로그인 상태를 확인하지 못했습니다. 새로고침해 주세요.');
    });

    el("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = el("email").value.trim(), pw = el("pw").value;
      var nick = el("nick").value.trim();
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
        if (mode === "up" && nick) {
          // 가입 직후엔 트리거가 방금 만든 profiles 행에 닉네임을 얹는다
          db.from("profiles").update({ name: nick }).eq("id", user.id).then(after, after);
        } else {
          after();
        }
      }).catch(function () {
        el('go').disabled = false;
        say('err', '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      });
    });

    setMode("in");
    updateCooldown();
  }

  // Supabase 오류 문구가 영어라 자주 나오는 것만 우리말로 바꾼다
  function translate(m) {
    if (/Invalid login credentials/i.test(m)) return "이메일이나 비밀번호가 맞지 않습니다.";
    if (/already registered|already been registered/i.test(m))
      return "이미 가입된 이메일입니다. 위의 「로그인」으로 들어오세요.";
    if (/Password should be at least/i.test(m)) return "비밀번호는 6자 이상이어야 합니다.";
    if (/rate limit|too many/i.test(m)) return "요청 또는 메일 발송 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
    if (/email.*not authorized|error sending.*email|smtp/i.test(m)) return "메일 발송 서비스에서 요청을 처리하지 못했습니다. 사이트 관리자에게 문의해 주세요.";
    if (/expired|invalid.*token|session.*missing/i.test(m)) return "인증이 만료됐습니다. 최신 재설정 메일을 다시 열어 주세요.";
    return m;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
