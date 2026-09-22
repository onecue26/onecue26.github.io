// onecue — 광고 의뢰 화면
//
// 광고주는 「아이템과 설명」만 넣는다. 전략·컨셉·콘티는 우리가 만든다.
// 그래서 이 화면은 전문용어를 쓰지 않는다 — 컷 수·아크·앵글 같은 건 묻지 않는다.

(function () {
  "use strict";

  // 접속은 한 페이지에 하나만 만든다. 두 개면 로그인 상태를 서로 다르게 본다
  function shared() {
    return window.ONECUE_DB ||
      (window.ONECUE_DB = window.supabase.createClient(
        window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
  }

  var cfg = window.ONECUE || {}, db = null, ME = null;

  // DB 호환용 임시 컷 수. 광고주의 입력값이나 확정 설계가 아니다.
  // 실제 컷 구성은 컨셉과 연출 방식이 정해진 뒤 제작 단계에서 다시 결정한다.
  function cutsFor(sec) {
    if (sec <= 6) return 5;
    if (sec <= 10) return 9;
    if (sec <= 15) return 12;
    if (sec <= 20) return 14;
    if (sec <= 30) return 16;
    if (sec <= 45) return 20;
    return 26;
  }

  function el(id) { return document.getElementById(id); }
  function val(id) { return el(id).value.trim(); }

  /** 주소에 https:// 를 붙여 준다.
   *
   *  사람은 보통 `example.co.kr` 이라고 적는다. 그런데 input[type=url] 은
   *  체계(scheme)가 없으면 아예 제출을 막고, 저장해 둬도 링크로 눌렀을 때
   *  우리 사이트 안의 경로로 잘못 간다.
   *  적으신 대로 받고 우리가 앞을 채운다 — 사람에게 형식을 배우게 하지 않는다. */
  function withScheme(s) {
    var v = (s || "").trim();
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : "https://" + v.replace(/^\/+/, "");
  }
  function checked(boxId) {
    return Array.prototype.slice
      .call(el(boxId).querySelectorAll("input:checked"))
      .map(function (i) { return i.value; });
  }
  function runtime() {
    var r = document.querySelector('input[name="rt"]:checked');
    if (!r || r.value === "auto") return recommendedRuntime();
    if (r.value === "custom") {
      var custom = parseInt(el("runtimeCustom").value, 10);
      return custom >= 3 && custom <= 300 ? custom : 0;
    }
    return parseInt(r.value, 10);
  }

  function placements() { return checked("placements"); }

  function recommendedRuntime() {
    var picked = el("placements").querySelectorAll("input:checked"), values = [];
    picked.forEach(function (p) { values.push(parseInt(p.dataset.runtime || "15", 10)); });
    if (!values.length) return 15;
    return Math.max.apply(null, values);
  }

  function setConn(k, t) {
    var p = el("conn"); p.className = "pill" + (k ? " " + k : "");
    p.innerHTML = '<span class="dot"></span>' + t;
  }

  function syncPlacements() {
    var active = {};
    checked("channels").forEach(function (c) { active[c] = true; });
    el("placements").querySelectorAll(".placement-group").forEach(function (group) {
      var on = !!active[group.dataset.channel];
      group.classList.toggle("on", on);
      if (!on) group.querySelectorAll("input").forEach(function (p) { p.checked = false; });
    });
    el("placementNote").textContent = Object.keys(active).length ?
      "실제로 노출할 위치를 하나 이상 선택해 주세요." : "먼저 게시할 매체를 선택해 주세요.";
    syncRecommendations();
  }

  // 노출 위치를 기준으로 규격과 길이를 추천한다. 자동 추천은 언제든 해제할 수 있다
  function syncAspects() {
    var need = {};
    el("placements").querySelectorAll("input:checked").forEach(function (p) {
      (p.dataset.aspects || "").split(",").forEach(function (a) {
        if (a) need[a] = true;
      });
    });
    el("aspects").querySelectorAll("input").forEach(function (a) {
      a.disabled = el("autoAspect").checked;
      if (el("autoAspect").checked) a.checked = !!need[a.value];
    });
    showDerived();
  }

  function syncRecommendations() {
    syncAspects();
    var r = document.querySelector('input[name="rt"]:checked');
    el("runtimeCustom").classList.toggle("on", !!r && r.value === "custom");
    showDerived();
  }

  // 광고주가 정하지 않는 값 — 길이에서 도출된다는 걸 눈에 보이게 한다
  function showDerived() {
    var sec = runtime(), as = checked("aspects");
    var ps = placements();
    if (!sec) {
      el("derived").innerHTML = "직접 입력 길이는 <b>3~300초</b>로 적어주세요.";
      return;
    }
    el("derived").innerHTML =
      (ps.length ? "선택 위치 <b>" + ps.length + "개</b> · " : "노출 위치 <b>미선택</b> · ") +
      "권장 <b>" + sec + "초</b> · 컷 구성은 <b>컨셉과 연출 방식에 따라 제안</b>" +
      "   ·   규격 <b>" + (as.length ? as.join(" / ") : "미선택") + "</b>" +
      (as.length > 1 ? "   ·   " + as.length + "개 버전으로 만듭니다" : "");
  }

  // 내가 넣은 의뢰를 이 브라우저에 기억해 둔다 — 첫 화면에서 다시 찾아 들어갈 수 있게
  function remember(entry) {
    try {
      var k = "onecue.mine";
      var list = JSON.parse(localStorage.getItem(k) || "[]");
      list = list.filter(function (x) { return x.slug !== entry.slug; });
      list.unshift(entry);
      localStorage.setItem(k, JSON.stringify(list.slice(0, 30)));
    } catch (e) { /* 사생활 보호 모드 등 — 기억 못 해도 진행에는 지장 없다 */ }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  // ── 파일 ──────────────────────────────────────────────────────────────────
  // 제품 실물 사진이 팩트를 교정한다 — PADO 에서 캔에 적힌 「무가당」을 읽고
  // USP 가 추측에서 사실로 바뀌었다. 텍스트 브리프만으로는 못 잡던 것이다.
  function previewFiles() {
    var box = el("picked"), files = el("files").files;
    box.innerHTML = "";
    Array.prototype.forEach.call(files, function (f) {
      var fig = document.createElement("figure");
      var img = document.createElement("img");
      if (f.type.indexOf("image/") === 0) {
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
      }
      var cap = document.createElement("figcaption");
      cap.textContent = f.name;
      fig.appendChild(img); fig.appendChild(cap); box.appendChild(fig);
    });
  }

  // Access is enforced by project ownership; filenames are not authorization.
  function upload(projectId, file) {
    var ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    var key = projectId + "/" + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10) + "." + ext;
    return db.storage.from("uploads").upload(key, file, { contentType: file.type })
      .then(function (r) {
        if (r.error) throw r.error;
        var url = db.storage.from("uploads").getPublicUrl(key).data.publicUrl;
        return db.from("assets").insert({
          project_id: projectId, kind: "product_ref", role: file.name,
          storage_path: key, url: url, mime: file.type, bytes: file.size,
          meta: { by: "client" },
        }).then(function (saved) { if (saved.error) throw saved.error; return saved; });
      });
  }

  function uploadAll(projectId) {
    var files = Array.prototype.slice.call(el("files").files);
    if (!files.length) return Promise.resolve(0);
    var okCount = 0;
    return files.reduce(function (chain, f, i) {
      return chain.then(function () {
        el("msg").textContent = "사진 올리는 중… (" + (i + 1) + "/" + files.length + ")";
        return upload(projectId, f).then(function () { okCount++; });
      });
    }, Promise.resolve()).then(function () { return okCount; });
  }

  function slugify(brand, product) {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    var stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
    var name = (brand + "_" + product).trim().replace(/\s+/g, "_").slice(0, 40);
    return stamp + "_" + name + "_" + Math.random().toString(36).slice(2, 5);
  }

  function newId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 3 | 8);
      return v.toString(16);
    });
  }

  // 의뢰는 단발성 문의가 아니다. 광고주는 5안을 고르고 콘티를 승인하러 반드시 돌아온다.
  // 그래서 로그인을 먼저 받는다 — 대신 계정 이메일이 곧 연락처라 폼이 짧아진다
  function gate() {
    return db.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) {
        location.replace("login.html?next=new.html");
        return null;
      }
      var f = el("email");
      f.value = user.email;
      f.readOnly = true;
      f.title = "로그인한 계정의 이메일입니다";
      el("emailHint").textContent = "로그인한 계정 — 여기로 결과를 보냅니다";
      setConn("ok", user.email);
      return user;
    });
  }

  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");
    syncPlacements();

    el("files").addEventListener("change", previewFiles);
    el("channels").addEventListener("change", syncPlacements);
    el("placements").addEventListener("change", syncRecommendations);
    el("runtimes").addEventListener("change", syncRecommendations);
    el("runtimeCustom").addEventListener("input", showDerived);
    el("autoAspect").addEventListener("change", syncAspects);
    el("aspects").addEventListener("change", showDerived);

    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = shared();
    setConn("ok", "확인 중");

    gate().then(function (user) {
      if (!user) return;
      ME = user;
      el("form").addEventListener("submit", submit);
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!db) return;
    db.auth.getUser().then(function (r) {
      var current = r.data && r.data.user;
      if (!current) {
        location.replace("login.html?next=new.html");
        return;
      }
      // 다른 탭에서 계정을 바꿔도 처음 열었을 때의 사용자를 저장하지 않는다.
      ME = current;
      el("email").value = current.email;
      return submitForUser();
    }).catch(function (err) {
      el("msg").className = "msg err";
      el("msg").textContent = "현재 로그인 계정을 확인하지 못했습니다 — " + (err.message || err);
    });
  }

  function submitForUser() {

    var aspects = checked("aspects");
    var chosenChannels = checked("channels"), chosenPlacements = placements();
    if (!chosenChannels.length || !chosenPlacements.length) {
      el("msg").className = "msg err";
      el("msg").textContent = "게시할 매체와 실제 노출 위치를 하나 이상 골라주세요";
      return;
    }
    if (!aspects.length) {
      el("msg").className = "msg err";
      el("msg").textContent = "화면 규격을 하나 이상 골라주세요";
      return;
    }

    var brand = val("brand") || val("product"), product = val("product"), company = val("company");
    var sec = runtime();
    if (!sec) {
      el("msg").className = "msg err";
      el("msg").textContent = "영상 길이를 3~300초 사이로 입력해 주세요";
      return;
    }
    var slug = slugify(brand, product);

    el("go").disabled = true;
    el("msg").className = "msg";
    el("msg").textContent = "보내는 중…";

    // 회사(clients) → 건(projects) → 의뢰 내용(briefs) → 연락처(contacts) → 작업(jobs)
    db.from("clients").select("id").eq("name", company).eq("owner_id", ME.id).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        if (r.data) return r.data;
        return db.from("clients")
          .insert({ name: company, company: company, owner_id: ME ? ME.id : null })
          .select("id").single().then(function (x) { if (x.error) throw x.error; return x.data; });
      })
      .then(function (client) {
        var projectId = newId();
        return db.from("projects").insert({
          id: projectId,
          client_id: client.id, slug: slug, brand: brand, product: product,
          running_sec: sec, cut_count: cutsFor(sec),
          aspect: aspects[0], aspects: aspects, channels: chosenChannels,
          step: "brief", state: "pending",
        }).then(function (p) {
          if (p.error) throw p.error;
          // projects의 INSERT 정책은 통과하지만 같은 문장의 RETURNING은
          // owner_read가 새 행을 다시 조회하며 RLS에 막힌다. 이미 만든 UUID를 쓴다.
          return { client: client, project: { id: projectId, slug: slug } };
        });
      })
      .then(function (ctx) {
        var pid = ctx.project.id;
        return Promise.all([
          db.from("briefs").insert({
            project_id: pid, raw: val("item"),
            goal: val("goal") || null, target: val("target") || null,
            format: sec + "초 · " + aspects.join("/") + " · " + chosenPlacements.join(","),
          }),
          db.from("contacts").insert({
            client_id: ctx.client.id, project_id: pid,
            name: val("cname"), email: val("email"),
            phone: val("phone") || null, title: val("title") || null,
            // 홈페이지 — 브랜드 톤을 보러 갈 링크. 주소만 적어 주셔도
            // 되게 앞에 https:// 를 붙여 둔다 (type="url" 은 없으면 막는다)
            homepage: withScheme(val("homepage")),
          }),
          db.from("jobs").insert({
            project_id: pid, step: "facts", kind: "text",
            request: {
              note: "새 의뢰", brand: brand, product: product,
              item: val("item"), runtime: sec, aspects: aspects,
              channels: chosenChannels, placements: chosenPlacements,
            },
          }),
        ]).then(function (res) {
          var bad = res.filter(function (r) { return r.error; })[0];
          if (bad) throw bad.error;
          // 사진은 마지막에. 실패해도 의뢰 자체는 이미 접수된 상태로 둔다
          return uploadAll(pid).then(function () { return ctx.project.slug; },
                                     function () { return ctx.project.slug; });
        });
      })
      .then(function (slug) {
        // 뒤로 가거나 창을 닫아도 다시 찾을 수 있어야 한다.
        // 이 브라우저에만 남는 기록이라 완전하진 않지만, 계정 없이 되는 최선이다
        remember({ slug: slug, brand: brand, product: product, at: Date.now() });

        var url = location.href.replace(/new\.html.*$/, "") +
          "project.html?slug=" + encodeURIComponent(slug);
        el("form").style.display = "none";
        el("after").classList.add("on");
        el("afterLink").href = url;
        el("myurl").textContent = url;
        el("copyLink").addEventListener("click", function () {
          copy(url).then(function (ok) {
            el("copied").className = "msg" + (ok ? "" : " err");
            el("copied").textContent = ok ? "복사했습니다" : "복사가 안 됩니다 — 위 주소를 직접 선택하세요";
          });
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        el("go").disabled = false;
        el("msg").className = "msg err";
        el("msg").textContent = "보내지 못했습니다 — " + (err.message || err);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
