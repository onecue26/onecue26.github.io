// 첫 화면 오른쪽 위 — 로그인 상태에 맞게 (09-26 Dan)
//
// 로그아웃: [제작 의뢰 ↗] 하나 — 고객 로그인은 푸터 (09-26 Dan: 제작사형 사이트는 행동 버튼 하나)
// 로그인  : [작업 공간 →] [계정 ▾]  — 광고주는 「내 프로젝트」(studio), 관리자는 「제작 관리」(admin)
//           계정 메뉴: 이름·이메일 · 새 제작 의뢰 · 로그아웃
// Dan: 「로그인된 상태면 현재 로그인된 사람이 뜨고 로그아웃 버튼과 작업하는 곳으로 들어가도록」
(function () {
  "use strict";
  var slot = document.getElementById("hdr");
  if (!slot || !window.supabase || !window.ONECUE) return;
  var db = window.ONECUE_DB ||
    (window.ONECUE_DB = window.supabase.createClient(window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function loggedIn(user, prof) {
    var admin = !!(prof && prof.is_admin);
    var name = (prof && prof.name) || String(user.email || "").split("@")[0];
    var work = admin ? { href: "admin.html", label: "제작 관리" } : { href: "studio.html", label: "내 프로젝트" };
    slot.innerHTML =
      '<a class="header-cta" href="' + work.href + '">' + work.label + ' <i data-lucide="arrow-right" aria-hidden="true"></i></a>' +
      '<details class="acct-menu"><summary aria-label="계정 메뉴"><span class="acct-dot" aria-hidden="true">' +
      esc(name.slice(0, 1).toUpperCase()) + '</span><span class="acct-name">' + esc(name) + "</span></summary>" +
      '<div class="acct-pop" role="menu"><div class="acct-who"><b>' + esc(name) + "</b><small>" + esc(user.email) + "</small></div>" +
      (admin ? '<a role="menuitem" href="studio.html">광고주 화면 목록</a>' : "") +
      '<a role="menuitem" href="new.html">새 제작 의뢰</a>' +
      '<button role="menuitem" type="button" id="hdrOut">로그아웃</button></div></details>';
    // 메뉴 밖을 누르면 닫는다
    document.addEventListener("click", function (e) {
      var m = slot.querySelector(".acct-menu");
      if (m && m.open && !m.contains(e.target)) m.open = false;
    });
    document.getElementById("hdrOut").addEventListener("click", function () {
      db.auth.signOut().then(function () { location.reload(); });
    });
    // 푸터 「고객 로그인」도 로그인 상태면 작업 공간으로 (09-26 — 로그인은 헤더에서 빼고 푸터로)
    var ft = document.getElementById("ftLogin");
    if (ft) { ft.href = work.href; ft.innerHTML = esc(work.label) + ' <i data-lucide="arrow-right" aria-hidden="true"></i>'; }
    if (window.lucide) window.lucide.createIcons();
  }

  db.auth.getUser().then(function (r) {
    var user = r.data && r.data.user;
    if (!user) return;                                  // 로그아웃 상태는 HTML 기본 모양 그대로
    db.from("profiles").select("is_admin,name").eq("id", user.id).maybeSingle()
      .then(function (p) { loggedIn(user, p.data); }, function () { loggedIn(user, null); });
  });
})();
