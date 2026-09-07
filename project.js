// onecue — 건 상세
//
// 광고주가 보는 화면이다. 지금 어디까지 왔는지 보여주고,
// 판단할 자리(5안 선택 · 콘티 승인)에서만 버튼을 띄운다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  // MINE — 이 건을 넣은 광고주 본인인가.
  // 판단하는 자리(5안 선택·콘티 승인)는 광고주의 것이다. 관리자가 대신 누르면 안 된다
  var cfg = window.ONECUE || {}, db = null, P = null, MINE = false, LOGGED_IN = false;

  var STEPS = [
    ["brief", "의뢰"], ["facts", "팩트"], ["strategy", "전략"],
    ["concepts", "5안"], ["develop", "전개"], ["storyboard", "콘티"],
    ["anchors", "앵커"], ["video", "영상"], ["deliver", "납품"],
  ];
  var IDX = {}; STEPS.forEach(function (s, i) { IDX[s[0]] = i; });
  // 광고주가 판단하는 자리 — 여기서만 버튼이 뜬다
  var GATES = { strategy: "검토", concepts: "선택", storyboard: "승인" };

  // ★ 광고주는 자기에게 넘어온 것까지만 본다.
  //   전에는 DB 에 있는 걸 그냥 다 그렸다. 그래서 우리가 아직 검수도 안 한 콘티가
  //   광고주 화면에 떴다 — 1차 검수를 넣은 의미가 없어진다.
  //   지나간 단계는 보이고, 지금 단계는 「광고주에게 보내기」를 눌러야 보인다.
  function shown(step) {
    if (!P) return false;
    if (IDX[P.step] > IDX[step]) return true;      // 이미 지나간 단계
    if (P.step !== step) return false;             // 아직 오지 않은 단계
    return P.state === "ready";                    // 지금 단계 — 넘겼는가
  }

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

  // 이 건을 이 브라우저에 기억해 둔다 — 주소를 잃어버려도 첫 화면에서 다시 찾도록.
  // 단 내 건일 때만. 남의 건을 열어봤다고 「내가 넣은 의뢰」에 쌓이면 안 된다
  function remember(p) {
    if (!MINE && LOGGED_IN) return;
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
      // 추천은 의견이지 결정이 아니다. 그래서 이유를 같이 달아둔다 —
      // 올려놓거나(마우스) 눌러야(폰) 펼쳐지므로 카드를 어지럽히지 않는다
      var reco = c.is_recommended
        ? '<span class="reco" tabindex="0">추천' +
          (c.reco_reason ? '<span class="why">' + esc(c.reco_reason) + "</span>" : "") +
          "</span>"
        : "";
      return '<div class="cc' + (c.is_chosen ? " chosen" : "") +
        (c.is_recommended ? " reco-on" : "") + '">' + reco +
        '<span class="k">' + esc(c.key) + "안 · " + esc(c.axis || "") + "</span>" +
        '<span class="t">' + esc(c.title || "") + "</span>" +
        '<span class="b">' + esc(c.body || "") + "</span>" +
        (c.hook ? '<span class="b">훅 · ' + esc(c.hook) + "</span>" : "") +
        pick + "</div>";
    }).join("") + redoCard(canPick) + "</div>";
    return head + body;
  }

  // 여섯 번째 카드 — 다섯 개가 다 아닐 수 있다.
  // 골라야만 넘어가는 화면은 마음에 안 드는 안을 억지로 고르게 만든다.
  // 메모는 비워도 된다. 비면 우리가 축을 바꿔 다시 잡는다
  function redoCard(canPick) {
    if (!canPick) return "";
    return '<div class="cc redo">' +
      '<span class="k">다시</span>' +
      '<span class="t">다섯 개 다 아니면</span>' +
      '<span class="b">억지로 고르지 않으셔도 됩니다. 다른 다섯 가지를 새로 만들어 드립니다.</span>' +
      '<textarea id="redoNote" maxlength="500" ' +
      'placeholder="원하시는 방향이 있으면 적어주세요 — 안 적으셔도 됩니다&#10;&#10;예 · 아이가 나오는 건 피하고 싶습니다&#10;예 · 하와이를 더 보여주면 좋겠습니다&#10;예 · B안 방향은 좋은데 더 밝았으면"></textarea>' +
      '<span class="hint">비워두시면 저희가 축을 바꿔 다시 잡습니다.</span>' +
      '<button class="btn ghost" id="redoBtn">다시 부탁드립니다</button>' +
      '<span class="hint" id="redoMsg"></span>' +
      "</div>";
  }

  function askRedo(note) {
    return db.from("approvals").insert({
      project_id: P.id, gate: "concepts", decision: "revise",
      note: note || "방향 지정 없음 — 축을 바꿔 다시",
    }).then(function () {
      // 광고주 차례가 끝났다. 다시 우리 차례라 pending 으로 내린다
      return db.from("projects").update({ step: "concepts", state: "pending" }).eq("id", P.id);
    }).then(function () {
      return db.from("jobs").insert({
        project_id: P.id, step: "concepts", kind: "text",
        request: { note: "5안 재요청", direction: note || null },
      });
    });
  }

  // 만든 영상 — 제일 위에 둔다. 이걸 보려고 들어오는 것이다
  function secClips(assets) {
    var v = (assets || []).filter(function (a) { return a.kind === "clip"; });
    if (!v.length) return "";
    return "<h2>영상 " + v.length + "판</h2><div class=\"clips\">" + v.map(function (c) {
      return '<figure class="clip"><video src="' + esc(c.url) +
        '" controls playsinline preload="metadata"></video>' +
        "<figcaption>" + esc(c.role || "") +
        ' · <a href="' + esc(c.url) + '" target="_blank" rel="noopener">새 창</a>' +
        "</figcaption></figure>";
    }).join("") + "</div>";
  }

  // 콘티 시트 한 장 — 컷을 하나씩 보기 전에 전체를 먼저 본다
  function secBoard(assets) {
    var sheet = (assets || []).filter(function (a) {
      return a.kind === "board" && a.cut_n == null;
    })[0];
    if (!sheet) return "";
    return "<h2>콘티 시트</h2>" +
      '<div class="board"><img src="' + esc(sheet.url) + '" alt="콘티 시트" loading="lazy">' +
      "<p>이 시트는 <b>컷 순서와 구도를 정하는 자료</b>입니다. " +
      "실제 영상은 승인 후 컷마다 다시 만들기 때문에 그림이 이것과 똑같지는 않습니다.</p></div>";
  }

  // 컷 하나에 그림이 둘이다 — 왼쪽은 콘티에서 자른 칸, 오른쪽은 실제로 만든 컷.
  // 갈아 끼우면 원래 무엇을 하려던 컷인지가 사라진다. 나란히 둬야 비교가 된다
  function shots(n, board, anchor) {
    var b = board[n], a = anchor[n];
    if (!b && !a) return '<div class="noimg-n">' + n + "</div>";
    // 비어 있는데 「완성」이라 적으면 다 된 것처럼 읽힌다. 채워질 때 바뀐다
    function one(label, x, cls) {
      return '<figure class="' + cls + (x ? " on" : "") + '">' +
        (x ? '<img src="' + esc(x.url) + '" alt="컷 ' + n + " " + label + '" loading="lazy">'
           : '<div class="none">—</div>') +
        "<figcaption>" + (x ? label : "대기") + "</figcaption></figure>";
    }
    return '<div class="shots">' + one("콘티", b, "plan") + one("완성", a, "made") + "</div>";
  }

  function secCuts(cuts, assets) {
    if (!cuts || !cuts.length) return "";
    var board = {}, anchor = {};
    (assets || []).forEach(function (a) {
      if (a.cut_n == null) return;
      if (a.kind === "board" && !board[a.cut_n]) board[a.cut_n] = a;
      if (a.kind === "anchor" && !anchor[a.cut_n]) anchor[a.cut_n] = a;
    });
    var made = Object.keys(anchor).length;
    return "<h2>콘티 " + cuts.length + "컷" +
      (made ? " — 만든 컷 " + made + "개" : "") + "</h2>" +
      "<div class=\"cuts\">" + cuts.map(function (c) {
      var has = board[c.n] || anchor[c.n];
      var t = (c.t_start != null ? c.t_start + "–" + c.t_end + "초" : "");
      var spec = [c.size, c.angle, c.move, c.lens].filter(Boolean)
        .map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("");
      return '<div class="cut' + (has ? "" : " noimg") + '">' +
        shots(c.n, board, anchor) +
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
    // 「고쳐주세요」도 approvals 에 남는다. 그걸 통과로 세면
    // 다시 만들어 올린 뒤에도 「승인 완료」라고 뜬다 — 통과는 ok 만이다
    var done = {};
    (approvals || []).forEach(function (a) { if (a.decision === "ok") done[a.gate] = a; });

    // 다시 만들어 달라고 하셨으면, 그 말이 접수됐다는 걸 보여준다.
    // 버튼을 눌렀는데 화면이 그대로면 눌린 건지 알 수 없다
    var redos = (approvals || []).filter(function (a) {
      return a.gate === p.step && a.decision === "revise";
    });
    if (redos.length && GATES[p.step] && p.state !== "ready") {
      var last = redos[redos.length - 1];
      var said = last.note || "";
      var blank = said.indexOf("방향 지정 없음") === 0 || said.indexOf("내용 없음") >= 0;
      return '<div class="gate"><div class="txt"><b>다시 만들고 있습니다</b>' +
        "<small>" + (p.step === "concepts"
          ? "새 다섯 가지가" : "고친 콘티가") + " 준비되면 이 화면에 올라옵니다." +
        (blank ? "" : "<br>주신 말씀 · " + esc(said)) +
        "</small></div></div>";
    }

    // 광고주 본인이 아니면 버튼을 주지 않는다. 판단은 대신 눌러 줄 수 없다
    var look = '<div class="gate look"><div class="txt"><b>광고주가 판단할 차례입니다</b>' +
      "<small>이 자리의 버튼은 의뢰하신 분에게만 보입니다. 관리자는 내용만 확인합니다." +
      "</small></div></div>";

    if (p.step === "concepts" && p.state === "ready" && !done.concepts) {
      if (!MINE) return look;
      return '<div class="gate"><div class="txt"><b>컨셉을 골라주세요</b>' +
        "<small>다섯 가지 방향을 준비했습니다. 하나를 고르시면 그 방향으로 콘티를 만듭니다.</small>" +
        "</div></div>";
    }
    // 콘티에 「고쳐주세요」만 있고 무엇을 고칠지 적을 데가 없었다.
    // 승인이냐 반려냐만 받으면 우리는 어디가 틀렸는지 모른 채 다시 짜게 된다
    if (p.step === "storyboard" && p.state === "ready" && !done.storyboard) {
      if (!MINE) return look;
      var rev = (approvals || []).filter(function (a) {
        return a.gate === "storyboard" && a.decision === "revise";
      });
      return '<div class="gate col"><div class="txt"><b>콘티를 확인해주세요</b>' +
        "<small>아래 컷 구성대로 만듭니다. 승인하시면 제작에 들어갑니다." +
        (rev.length ? " 앞서 주신 말씀은 반영해서 다시 올렸습니다." : "") +
        "</small></div>" +
        '<textarea id="boardNote" maxlength="1000" ' +
        'placeholder="고치실 곳이나 하고 싶은 말씀을 적어주세요 — 안 적으셔도 됩니다&#10;&#10;' +
        '예 · 4번 컷 봉지 글자가 이상합니다&#10;' +
        '예 · 아이 얼굴이 나왔으면 좋겠습니다&#10;' +
        '예 · 마지막 자막을 「이름 그대로」로 줄여주세요"></textarea>' +
        '<div class="acts">' +
        '<button class="btn" id="approveBoard">콘티 승인</button>' +
        '<button class="btn ghost" id="reviseBoard">고쳐주세요</button>' +
        '<span class="hint">적으신 내용은 승인하실 때도 같이 전달됩니다.</span>' +
        "</div></div>";
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
    var box = el("boardNote");
    var note = box ? (box.value || "").trim() : "";
    return db.from("approvals").insert({
      project_id: P.id, gate: "storyboard", decision: decision,
      note: note || (decision === "ok" ? "콘티 승인 (남기신 말씀 없음)" : "콘티 수정 요청 (내용 없음)"),
    }).then(function () {
      // 반려도 pending 이다 — 「우리 차례」라는 뜻이고,
      // idle 로 두면 관리자 화면에 1차 검수 칸이 안 돌아온다
      return db.from("projects").update(
        decision === "ok"
          ? { step: "anchors", state: "pending" }
          : { step: "storyboard", state: "pending" }
      ).eq("id", P.id);
    }).then(function () {
      // 반려도 할 일이다. 작업을 안 만들면 우리가 온 줄을 모른다
      return db.from("jobs").insert(
        decision === "ok"
          ? { project_id: P.id, step: "anchors", kind: "image",
              request: { note: "콘티 승인 — 앵커 이미지 생성", said: note || null } }
          : { project_id: P.id, step: "storyboard", kind: "text",
              request: { note: "콘티 수정 요청", said: note || null } }
      );
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
    var rd = el("redoBtn");
    if (rd) rd.addEventListener("click", function () {
      var note = (el("redoNote").value || "").trim();
      rd.disabled = true; rd.textContent = "보내는 중…";
      askRedo(note).then(load).catch(function (e) {
        rd.disabled = false; rd.textContent = "다시 부탁드립니다";
        var m = el("redoMsg"); if (m) m.textContent = "실패 — " + e.message;
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
    document.querySelectorAll(".cut img, .board img").forEach(function (i) {
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
          // 판단하는 자리는 광고주의 것이다. 이 건을 넣은 사람인지 확인한다
          db.from("contacts").select("email").eq("project_id", id),
          db.auth.getUser(),
        ]).then(function (x) {
          var me = (x[7].data && x[7].data.user) || null;
          var owners = (x[6].data || []).map(function (c) {
            return (c.email || "").trim().toLowerCase();
          });
          LOGGED_IN = !!me;
          MINE = !!(me && owners.indexOf((me.email || "").toLowerCase()) >= 0);
          // 로그인 전이라면 이 브라우저에 남긴 기록으로 본인 여부를 대신한다
          if (!me) {
            try {
              MINE = JSON.parse(localStorage.getItem("onecue.mine") || "[]")
                .some(function (x) { return x.slug === P.slug; });
            } catch (e) { MINE = false; }
          }
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
            secClips(x[4].data) +
            (shown("concepts")
              ? secConcepts(x[2].data, MINE && P.step === "concepts" && P.state === "ready")
              : "") +
            (shown("storyboard") ? secBoard(x[4].data) + secCuts(x[3].data, x[4].data) : "") +
            (shown("strategy") ? secStrategy(x[1].data) : "") +
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
    db = shared();
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
