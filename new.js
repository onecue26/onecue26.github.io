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

  function slugify(brand, product) {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    var stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
    var name = (brand + "_" + product).trim().replace(/\s+/g, "_").slice(0, 40);
    return stamp + "_" + name + "_" + Math.random().toString(36).slice(2, 5);
  }

  function boot() {
    el("stamp").textContent = new Date().toISOString().slice(0, 16).replace("T", " ");
    showDerived();

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
          return ctx.project.slug;
        });
      })
      .then(function (slug) {
        el("form").style.display = "none";
        el("after").classList.add("on");
        el("afterLink").href = "project.html?slug=" + encodeURIComponent(slug);
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
