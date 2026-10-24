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
  // 휴대폰 번호 — 숫자만 남겨 010·011·016~019 로 시작하는 10~11자리만 받는다(서버 onecue_norm_phone 과 같은 규칙)
  function normPhone(v) { var d = String(v || "").replace(/\D/g, ""); return /^01[016789]\d{7,8}$/.test(d) ? d : ""; }
  function showPhone(d) { return d.length === 11 ? d.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3") : d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"); }
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
    el("phoneWrap").hidden = (m !== "up");   // 10-19 Dan 「가입할 때 연락처 필수로」
    say("", "");
  }

  // 로그인 뒤에 어디로 돌려보낼지 — ?next=admin.html 처럼 넘어온다
  function nextUrl() {
    var n = new URLSearchParams(location.search).get("next");
    if (!n) return null;
    try {
      var target = new URL(n, location.href);
      if (target.origin !== location.origin || target.username || target.password ||
          !/^\/[a-z0-9_\-]+\.html$/i.test(target.pathname)) return null;
      return target.pathname + target.search + target.hash;
    } catch (_) { return null; }
  }

  function returnProjectUrl() {
    var n = new URLSearchParams(location.search).get("return");
    if (!n || /^[\\/]{2}|^\\/.test(n)) return null;
    try {
      var target = new URL(n, location.href), slug = target.searchParams.get("p");
      if (target.origin !== location.origin || target.username || target.password ||
          target.pathname !== "/new3.html" || target.hash || !slug || slug.length > 200 || /[<>\s/?#:\\]/.test(slug)) return null;
      return target.pathname + "?p=" + encodeURIComponent(slug);
    } catch (_) { return null; }
  }

  function showWho(user) {
    el("form").style.display = "none";
    el("who").classList.add("on");
    el("whoEmail").textContent = user.email;

    db.from("profiles").select("is_admin,name,phone").eq("id", user.id).maybeSingle()
      .then(function (r) {
        var admin = r.data && r.data.is_admin;
        var nick = (r.data && r.data.name) || "";
        var ph = (r.data && r.data.phone) || normPhone((user.user_metadata || {}).phone);
        el("phone2").value = ph ? showPhone(ph) : "";
        if (!ph) {   // 연락처 없는 기존 회원 — 눈에 띄게
          el("phone2").classList.add("need");
          el("phoneMsg").className = "msg err"; el("phoneMsg").textContent = "연락처가 없습니다. 휴대폰 번호를 입력하고 저장해 주세요.";
        }
        if (new URLSearchParams(location.search).get("focus") === "phone") { el("phone2").focus(); el("phoneBox").scrollIntoView({ block: "center" }); }
        el("whoNick").textContent = nick || user.email;
        el("nick2").value = nick;
        el("whoRole").textContent = admin ? "관리자" : "광고주";
        el("goAdmin").hidden = !admin;
        var n = nextUrl();
        if (n && (admin || new URL(n, location.href).pathname.toLowerCase() !== "/admin.html")) location.replace(n);
      });

    el("savePhone").addEventListener("click", function () {
      var v = normPhone(el("phone2").value);
      if (!v) { el("phoneMsg").className = "msg err"; el("phoneMsg").textContent = "휴대폰 번호 형식이 아닙니다(예 · 010-1234-5678)"; return; }
      el("phoneMsg").className = "msg"; el("phoneMsg").textContent = "저장 중…";
      db.rpc("onecue_set_my_phone", { p_phone: v }).then(function (r) {
        if (r.error || !(r.data || {}).ok) {
          el("phoneMsg").className = "msg err";
          el("phoneMsg").textContent = "저장하지 못했습니다 — " + ((r.error && r.error.message) || (r.data || {}).error || "");
          return;
        }
        el("phone2").value = showPhone(v); el("phone2").classList.remove("need");
        el("phoneMsg").className = "msg ok"; el("phoneMsg").textContent = "연락처를 저장했습니다";
        var backUrl = returnProjectUrl();
        if (backUrl) {
          var back = el("returnProject");
          if (!back) {
            back = document.createElement("a"); back.id = "returnProject"; back.className = "btn ghost";
            back.textContent = "원래 프로젝트로 돌아가기";
            el("phoneMsg").insertAdjacentElement("afterend", back);
          }
          back.href = backUrl;
        }
      });
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
    el("stamp").textContent = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);

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
        setTimeout(function () { location.replace("studio.html"); }, 900);
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

    // 아이디만 치셔도 들어가게 한다. 로그인 칸은 메일 주소를 받는데,
    // 안에서 쓰는 계정은 「psw」처럼 아이디로 부른다 — 사람이 쓰는 이름과
    // 시스템이 쓰는 주소가 다르면 사람 쪽을 받아 준다.
    // @ 가 있으면 그대로 둔다. 바깥 메일로 만든 계정이 대부분이다.
    var HOUSE = "onecue.kr";
    function asEmail(v) {
      var s = String(v || "").trim();
      if (!s || s.indexOf("@") >= 0) return s;
      return s + "@" + HOUSE;
    }

    el("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = asEmail(el("email").value), pw = el("pw").value;
      var nick = el("nick").value.trim();
      var phone = normPhone(el("phone").value);
      if (mode === "up" && !phone) { say("err", "연락처(휴대폰 번호)를 입력해 주세요 — 예 · 010-1234-5678"); el("phone").focus(); return; }
      el("go").disabled = true;
      say("", mode === "in" ? "확인 중…" : "만드는 중…");

      var p = mode === "in"
        ? db.auth.signInWithPassword({ email: email, password: pw })
        : db.auth.signUp({ email: email, password: pw, options: { data: { phone: phone } } });   // 트리거가 profiles.phone 으로 옮김

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
