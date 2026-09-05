// onecue — 광고 의뢰 화면
//
// 광고주는 「아이템과 설명」만 넣는다. 전략·컨셉·콘티는 우리가 만든다.
// 그래서 이 화면은 전문용어를 쓰지 않는다 — 컷 수·아크·앵글 같은 건 묻지 않는다.

(function () {
  "use strict";

  var cfg = window.ONECUE || {}, db = null;

  // 길이 → 컷 수. ad-playbook _LENGTH_MAP (MONF 11편 실측) 에서 가져온 값이라
  // 임의로 정하지 않는다. DB 의 cuts_for() 함수와 같은 규칙이다
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
  function checked(boxId) {
    return Array.prototype.slice
      .call(el(boxId).querySelectorAll("input:checked"))
      .map(function (i) { return i.value; });
  }
  function runtime() {
    var r = document.querySelector('input[name="rt"]:checked');
    return r ? parseInt(r.value, 10) : 15;
  }

  function setConn(k, t) {
    var p = el("conn"); p.className = "pill" + (k ? " " + k : "");
    p.innerHTML = '<span class="dot"></span>' + t;
  }

  // 매체를 고르면 필요한 규격을 자동으로 켠다. 끄는 건 사람이 판단한다
  function syncAspects() {
    var need = {};
    el("channels").querySelectorAll("input:checked").forEach(function (c) {
      (c.dataset.aspects || "").split(",").forEach(function (a) {
        if (a) need[a] = true;
      });
    });
    if (!Object.keys(need).length) return;
    el("aspects").querySelectorAll("input").forEach(function (a) {
      if (need[a.value]) a.checked = true;
    });
    showDerived();
  }

  // 광고주가 정하지 않는 값 — 길이에서 도출된다는 걸 눈에 보이게 한다
  function showDerived() {
    var sec = runtime(), as = checked("aspects");
    el("derived").innerHTML =
      "<b>" + sec + "초</b> → 컷 <b>" + cutsFor(sec) + "개</b>" +
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

  // 파일 이름은 추측 못 하게 무작위로 짓는다. 버킷이 공개라 이름이 곧 자물쇠다
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
        });
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

  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");
    showDerived();

    el("files").addEventListener("change", previewFiles);
    el("channels").addEventListener("change", syncAspects);
    el("runtimes").addEventListener("change", showDerived);
    el("aspects").addEventListener("change", showDerived);

    if (!window.supabase || !cfg.supabaseUrl) { setConn("bad", "연결 설정 없음"); return; }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    setConn("ok", "연결됨");

    el("form").addEventListener("submit", submit);
  }

  function submit(e) {
    e.preventDefault();
    if (!db) return;

    var aspects = checked("aspects");
    if (!aspects.length) {
      el("msg").className = "msg err";
      el("msg").textContent = "화면 규격을 하나 이상 골라주세요";
      return;
    }

    var brand = val("brand"), product = val("product"), company = val("company");
    var sec = runtime(), slug = slugify(brand, product);

    el("go").disabled = true;
    el("msg").className = "msg";
    el("msg").textContent = "보내는 중…";

    // 회사(clients) → 건(projects) → 의뢰 내용(briefs) → 연락처(contacts) → 작업(jobs)
    db.from("clients").select("id").eq("name", company).maybeSingle()
      .then(function (r) {
        if (r.data) return r.data;
        return db.from("clients").insert({ name: company, company: company })
          .select("id").single().then(function (x) { return x.data; });
      })
      .then(function (client) {
        return db.from("projects").insert({
          client_id: client.id, slug: slug, brand: brand, product: product,
          running_sec: sec, cut_count: cutsFor(sec),
          aspect: aspects[0], aspects: aspects, channels: checked("channels"),
          step: "brief", state: "pending",
        }).select("id,slug").single().then(function (p) {
          if (p.error) throw p.error;
          return { client: client, project: p.data };
        });
      })
      .then(function (ctx) {
        var pid = ctx.project.id;
        return Promise.all([
          db.from("briefs").insert({
            project_id: pid, raw: val("item"),
            goal: val("goal") || null, target: val("target") || null,
            format: sec + "초 · " + aspects.join("/"),
          }),
          db.from("contacts").insert({
            client_id: ctx.client.id, project_id: pid,
            name: val("cname"), email: val("email"),
            phone: val("phone") || null, title: val("title") || null,
          }),
          db.from("jobs").insert({
            project_id: pid, step: "facts", kind: "text",
            request: {
              note: "새 의뢰", brand: brand, product: product,
              item: val("item"), runtime: sec, aspects: aspects,
              channels: checked("channels"),
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
