// onecue — 상단 바의 계정 표시 (모든 화면 공통)
//
// 로그아웃 상태면 [로그인] 버튼 하나.
// 로그인 상태면 계정 이메일과 [로그아웃] 버튼, 관리자면 [관리자] 링크까지.
//
// 각 화면이 저마다 만들지 않고 여기 한 곳에서 그린다.
// 세션은 브라우저에 저장되므로 이 파일이 자기 접속을 따로 만들어도 같은 로그인을 본다.

(function () {
  "use strict";

  var slot = document.getElementById("acct");
  if (!slot || !window.supabase || !window.ONECUE) return;

  var db = window.ONECUE_DB ||
    (window.ONECUE_DB = window.supabase.createClient(
      window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function loggedOut() {
    slot.innerHTML = '<a class="btn ghost" href="login.html">로그인</a>';
  }

  function loggedIn(user, prof) {
    var isAdmin = !!(prof && prof.is_admin);
    var label = (prof && prof.name) || user.email;
    // 관리자 버튼이 있는 것 자체가 이미 관리자라는 표시다. 라벨을 또 붙이지 않는다
    slot.innerHTML =
      '<a class="acct-em" href="login.html" title="' + esc(user.email) + '">' +
      esc(label) + "</a>" +
      (isAdmin ? '<a class="btn ghost" href="admin.html">관리자</a>' : "") +
      '<button class="btn ghost" type="button" id="acctOut">로그아웃</button>';

    document.getElementById("acctOut").addEventListener("click", function () {
      db.auth.signOut().then(function () {
        // 로그인해야만 볼 수 있는 화면에 있었다면 첫 화면으로 보낸다
        var here = location.pathname.split("/").pop();
        location.href = (here === "admin.html" || here === "new.html")
          ? "index.html" : location.href;
        if (here !== "admin.html" && here !== "new.html") location.reload();
      });
    });
  }

  db.auth.getUser().then(function (r) {
    var user = r.data && r.data.user;
    if (!user) { loggedOut(); return; }
    db.from("profiles").select("is_admin,name").eq("id", user.id).maybeSingle()
      .then(function (p) { loggedIn(user, p.data); },
            function () { loggedIn(user, null); });
  }, loggedOut);
})();
