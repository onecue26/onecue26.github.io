// onecue — 옵션 3 새 의뢰 (6단계 · Dan 10-14 「광고주의 편함을 극적으로 살리고, 우리 사이트는 정말로 ai딸깍으로」)
//
// 저장 자리: briefs.option3 (jsonb) 한 칸 — 116.
//   status  draft(작성 중) → submitted(생성 요청)
//   제출은 onecue_option3_submit() 이 빈칸을 다시 검사한다 — 화면 버튼만 믿지 않는다.
// 옛 의뢰(new.html)와 달리 facts 작업(jobs)을 만들지 않는다 → 옛 작업기는 이 건을 집지 않고, 제출은 Head 에게 ☎ 로 간다.

(function () {
  "use strict";

  var db = null, ME = null;
  var S = { pid: null, slug: null, clientId: null, step: 1, o3: null, photos: [] };
  // 10-18 Dan — 가로·세로 둘 중 하나라도 480px 미만이면 더 좋은 사진을 요청 · 480px 이상은 받고 엔진이 1000×600 최소로 업스케일(meta.upscale)
  //   같은 제품 모양·같은 색상만 최대 3장
  var MIN_SIDE = 480, UP_LONG = 1000, UP_SHORT = 600, MAX_PHOTOS = 3, MAX_BYTES = 20 * 1024 * 1024;

  // 화면 비율 카드 — 값은 정본 reference_library/ad_specs/ad_formats/ad_formats.json 에서 그대로 옮겼다(손으로 셈하지 않는다)
  //   유튜브 = YT_INSTREAM · 세로 = UNI_9x16(쇼츠·릴스·틱톡 교집합) · 피드 = META_FEED_4x5
  var ASPECTS = [
    { v: "16:9", t: "유튜브", d: "가로 영상 · 유튜브 본편·광고", spec: "YT_INSTREAM", w: 1920, h: 1080, top: 54, bottom: 162, left: 96, right: 96 },
    { v: "9:16", t: "쇼츠 · 릴스 · 틱톡", d: "세로 영상 · 휴대폰 전체 화면", spec: "UNI_9x16", w: 1080, h: 1920, top: 288, bottom: 672, left: 120, right: 192 },
    { v: "4:5", t: "인스타그램 피드", d: "피드에서 가장 크게 보이는 세로형", spec: "META_FEED_4x5", w: 1080, h: 1350, top: 135, bottom: 135, left: 108, right: 108 },
  ];
  var MOODS = { auto: "원큐에 맡기기", bgrade: "재밌는 B급 · 병맛", pretty: "예쁜 감성", clean: "깔끔한 정보" };   // clean 은 예전 저장본 표시용(화면에서는 뺌 10-18)
  // 진행 칸 — Head 가 briefs.option3.stage 를 올린다. 남은 시간은 넉넉하게 잡고 단계가 끝날수록 줄인다
  var STAGES = [["접수", 48], ["시장 조사", 42], ["기획", 34], ["영상 생성", 20], ["검수", 6], ["완성", 0]];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function trim(s) { return String(s || "").trim(); }
  function toast(t) { var x = el("toast"); x.textContent = t; x.classList.add("on"); clearTimeout(toast.k); toast.k = setTimeout(function () { x.classList.remove("on"); }, 2600); }
  function newId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
  }
  function slugify(brand, product) {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    var stamp = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
    return stamp + "_" + (brand + "_" + product).trim().replace(/\s+/g, "_").slice(0, 40) + "_" + Math.random().toString(36).slice(2, 5);
  }
  function withScheme(s) { var v = trim(s); if (!v) return ""; return /^https?:\/\//i.test(v) ? v : "https://" + v.replace(/^\/+/, ""); }
  function blank() { return { status: "draft", step: 1, brand: "", kind: "", product: "", point: "", mood: "auto", avoid: "", ref_url: "", photos: [], url: "", url_ok: false, aspect: "" }; }

  // ── 단계별 「다 찼나」 — 다음 버튼과 5단계 생성 버튼이 같은 검사를 쓴다 ──
  function okStep(n) {
    var o = S.o3;
    if (n === 1) return !!(trim(o.brand) && trim(o.kind) && trim(o.product) && trim(o.point).length >= 5);
    if (n === 2) return !!MOODS[o.mood];
    if (n === 3) return S.photos.filter(function (p) { return p.id; }).length > 0 && !S.uploading && (!trim(o.url) || o.url_ok === true);
    if (n === 4) return ASPECTS.some(function (a) { return a.v === o.aspect; });
    if (n === 5) return okStep(1) && okStep(2) && okStep(3) && okStep(4);
    return false;
  }

  function readStep1() {
    S.o3.brand = el("brand").value; S.o3.kind = el("kind").value;
    S.o3.product = el("product").value; S.o3.point = el("point").value;
    el("pointCount").textContent = trim(S.o3.point).length + " / 200";
  }

  function paint() {
    var n = S.step;
    document.querySelectorAll(".w3-step").forEach(function (s) { s.classList.toggle("on", +s.dataset.step === n); });
    el("loading").hidden = true;
    var done = n === 6;
    el("progWrap").hidden = done; el("bar").hidden = done; el("head").hidden = done;
    var pg = el("prog"), was = paint.was || 0;   // 당구공 위치·회전 + 앞으로 넘어갈 때만 큐가 침(10-18)
    if (was && n > was && n <= 5) {
      pg.style.setProperty("--from", was);
      pg.classList.remove("shoot"); void pg.offsetWidth; pg.classList.add("shoot");
    } else if (n < was) { pg.classList.remove("shoot"); }
    paint.was = n;
    pg.style.setProperty("--n", Math.min(n, 5));
    var bars = el("prog").children, names = el("progNames").children;
    for (var i = 0; i < 5; i++) {
      var c = i + 1 < n ? "done" : i + 1 === n ? "now" : "";
      bars[i].className = c; names[i].className = c;
    }
    el("prev").classList.toggle("off", n === 1); el("prev").disabled = n === 1;
    el("next").style.visibility = n === 5 ? "hidden" : "";
    el("next").disabled = !okStep(n);
    if (n === 5) paintSummary();
    if (n === 6) paintDone();
  }

  function go(n) { S.step = n; S.o3.step = n; paint(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  // ── 저장 ── 첫 저장 때 회사·건·브리프·연락처를 만든다(옛 의뢰와 같은 사슬, 작업은 안 만든다)
  function ensureProject() {
    if (S.pid) return Promise.resolve();
    var brand = trim(S.o3.brand), product = trim(S.o3.product);
    return db.from("clients").select("id").eq("name", brand).eq("owner_id", ME.id).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        if (r.data) return r.data;
        return db.from("clients").insert({ name: brand, company: brand, owner_id: ME.id }).select("id").single()
          .then(function (x) { if (x.error) throw x.error; return x.data; });
      })
      .then(function (client) {
        var pid = newId(), slug = slugify(brand, product);
        return db.from("projects").insert({
          id: pid, client_id: client.id, slug: slug, brand: brand, product: product,
          running_sec: 15, cut_count: 12, production_track: "option3", production_track_by: "client",
          step: "brief", state: "pending",
        }).then(function (p) {
          if (p.error) throw p.error;
          S.pid = pid; S.slug = slug; S.clientId = client.id;
          return Promise.all([
            db.from("briefs").insert({ project_id: pid, raw: trim(S.o3.point), format: "15초", option3: S.o3 }),
            db.from("contacts").insert({ client_id: client.id, project_id: pid, name: (ME.user_metadata || {}).name || ME.email, email: ME.email, phone: (ME.user_metadata || {}).phone || null }),
          ]).then(function (res) {
            var bad = res.filter(function (x) { return x.error; })[0];
            if (bad) throw bad.error;
            history.replaceState(null, "", "new3.html?p=" + encodeURIComponent(slug));
          });
        });
      });
  }

  function save(quiet) {
    if (!okStep(1)) { if (!quiet) toast("1단계 네 칸을 먼저 채워 주세요"); return Promise.resolve(false); }
    S.o3.photos = S.photos.filter(function (p) { return p.id; }).map(function (p) { return p.id; });
    S.o3.saved_at = new Date().toISOString();
    return ensureProject().then(function () {
      return db.from("briefs").update({ option3: S.o3, raw: trim(S.o3.point) }).eq("project_id", S.pid);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      el("saved").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 저장됨";
      if (!quiet) toast("임시 저장했습니다 · 프로젝트 목록에 「작성 중」으로 남습니다");
      return true;
    }).catch(function (e) { toast("저장하지 못했습니다 — " + (e.message || e)); return false; });
  }

  // ── 3단계 사진 ── 고르는 즉시 크기를 재고, 작은 사진은 올리지 않는다(월드콘 148px 사진 · 10-14)
  function measure(file) {
    return new Promise(function (ok) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { ok({ w: im.naturalWidth, h: im.naturalHeight, src: u }); };
      im.onerror = function () { ok(null); };
      im.src = u;
    });
  }
  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []), bad = [];
    el("files").value = "";
    if (!files.length) return;
    var room = MAX_PHOTOS - S.photos.length;
    if (files.length > room) { bad.push("사진은 최대 " + MAX_PHOTOS + "장까지입니다 — " + (files.length - Math.max(room, 0)) + "장은 넣지 않았습니다"); files = files.slice(0, Math.max(room, 0)); }
    var ensure = S.pid ? Promise.resolve() : save(true);
    S.uploading = true; paint();
    ensure.then(function () {
      if (!S.pid) throw new Error("1단계를 먼저 저장해야 합니다");
      return files.reduce(function (chain, f) {
        return chain.then(function () {
          if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { bad.push(f.name + " — JPG·PNG·WEBP 사진만 받습니다"); return; }
          if (f.size > MAX_BYTES) { bad.push(f.name + " — 20MB 보다 큽니다"); return; }
          return measure(f).then(function (m) {
            if (!m) { bad.push(f.name + " — 사진을 열 수 없습니다"); return; }
            var lo = Math.min(m.w, m.h), hi = Math.max(m.w, m.h);
            if (lo < MIN_SIDE) {
              bad.push(f.name + " — " + m.w + "×" + m.h + "px로 너무 작습니다. 화질이 좋은 사진으로 바꾸어 주세요");
              URL.revokeObjectURL(m.src); return;
            }
            m.upscale = hi < UP_LONG || lo < UP_SHORT;   // 엔진이 생성 전에 1000×600 최소로 키운다(광고주 화면에는 안 보임)
            var item = { id: null, src: m.src, w: m.w, h: m.h, name: f.name };
            S.photos.push(item); paintThumbs();
            return upload(f, m).then(function (id) { item.id = id; paintThumbs(); },
              function (e) { S.photos.splice(S.photos.indexOf(item), 1); bad.push(f.name + " — 올리지 못했습니다(" + (e.message || e) + ")"); paintThumbs(); });
          });
        });
      }, Promise.resolve());
    }).catch(function (e) { bad.push(e.message || String(e)); })
      .then(function () {
        S.uploading = false;
        el("bad").hidden = !bad.length;
        el("bad").innerHTML = bad.map(function (b) { return "<span>· " + esc(b) + "</span>"; }).join("");
        return save(true);
      }).then(paint);
  }
  function upload(file, m) {
    var ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[file.type] || "jpg";
    var key = S.pid + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + "." + ext;
    return db.storage.from("uploads").upload(key, file, { contentType: file.type }).then(function (r) {
      if (r.error) throw r.error;
      var url = db.storage.from("uploads").getPublicUrl(key).data.publicUrl;
      var id = newId();
      return db.from("assets").insert({
        id: id, project_id: S.pid, kind: "product_ref", role: file.name, storage_path: key, url: url,
        mime: file.type, bytes: file.size, meta: { by: "client", option3: true, w: m.w, h: m.h, upscale: !!m.upscale },
      }).then(function (x) { if (x.error) throw x.error; return id; });
    });
  }
  function paintThumbs() {
    el("thumbs").innerHTML = S.photos.map(function (p, i) {
      return '<div class="th' + (p.id ? "" : " up") + '">' + (p.src ? '<img src="' + esc(p.src) + '" alt="">' : "") +
        '<span class="px">' + (p.id ? p.w + "×" + p.h : "올리는 중…") + "</span>" +
        (p.id ? '<button type="button" class="rm" data-rm="' + i + '" aria-label="이 사진 빼기">×</button>' : "") + "</div>";
    }).join("");
  }

  // ── 3단계 주소 확인 ── 브라우저에서 그 주소에 닿는지 본다(없는 주소·오타는 여기서 걸린다). 내용은 Head 가 조사 때 직접 연다
  function checkUrl() {
    var u = withScheme(el("url").value);
    if (!u) { el("urlMsg").className = "urlmsg"; el("urlMsg").textContent = ""; return; }
    el("url").value = u; S.o3.url = u; S.o3.url_ok = false;
    try { var host = new URL(u).hostname; if (host.indexOf(".") < 0) throw 0; } catch (e) { return urlResult(false); }
    el("urlMsg").className = "urlmsg"; el("urlMsg").textContent = "확인하는 중…"; el("urlCheck").disabled = true;
    var done = false, t = setTimeout(function () { if (!done) { done = true; urlResult(false); } }, 9000);
    fetch(u, { mode: "no-cors", cache: "no-store", redirect: "follow" })
      .then(function () { if (!done) { done = true; clearTimeout(t); urlResult(true); } },
            function () { if (!done) { done = true; clearTimeout(t); urlResult(false); } });
  }
  function urlResult(ok) {
    el("urlCheck").disabled = false;
    S.o3.url_ok = ok;
    el("urlMsg").className = "urlmsg " + (ok ? "ok" : "no");
    el("urlMsg").textContent = ok ? "✓ 페이지를 확인했어요" : "페이지를 찾을 수 없어요. 입력 내용을 확인해 주세요.";
    paint();
  }

  // ── 4단계 비율 카드 ──
  // 10-18 Dan — 그림을 만화풍으로: 손에 든 스마트폰만 또렷하고 뒤는 흐림(구독 GPT · aspect_art/) · 휴대폰 화면 자리(box %)에
  //   지금까지 쓰던 안전구역 그림(문구·로고 자리)을 그대로 얹는다 — 화면 비율에 맞춰 화면 안에 꽉 차게(contain)
  var ART = {"16:9": {"img": "aspect_art/art_169.webp", "box": [12.44, 30.14, 87.32, 65.08], "r": 2.231}, "9:16": {"img": "aspect_art/art_916.webp", "box": [31.26, 6.46, 68.9, 88.2], "r": 0.444}, "4:5": {"img": "aspect_art/art_45.webp", "box": [30.94, 18.82, 69.14, 65.95], "r": 0.8}};
  function frameHtml(a) {
    var T = a.top / a.h * 100, B = a.bottom / a.h * 100, L = a.left / a.w * 100, R = a.right / a.w * 100;
    var band = function (st) { return '<span class="ui" style="' + st + '"></span>'; };
    var ui = band("left:0;right:0;top:0;height:" + T + "%") + band("left:0;right:0;bottom:0;height:" + B + "%") +
      (L ? band("left:0;top:" + T + "%;bottom:" + B + "%;width:" + L + "%") : "") + (R ? band("right:0;top:" + T + "%;bottom:" + B + "%;width:" + R + "%") : "");
    var safe = '<span class="safe" style="left:' + L + "%;top:" + T + "%;right:" + R + "%;bottom:" + B + '%"><b>문구·로고<br>자리</b></span>';
    var art = ART[a.v];
    if (art) {
      var bx = art.box, wide = a.w / a.h > art.r;   // 화면보다 납작하면 폭에, 길쭉하면 높이에 맞춘다
      return '<span class="ar-stage art"><span class="ar-art" style="background-image:url(' + art.img + ')">' +
        '<span class="ar-screen" style="left:' + bx[0] + "%;top:" + bx[1] + "%;right:" + (100 - bx[2]) + "%;bottom:" + (100 - bx[3]) + '%">' +
        '<span class="ar-frame" style="aspect-ratio:' + a.w + "/" + a.h + ";" + (wide ? "width:100%" : "height:100%") + '">' + ui + safe + "</span></span></span></span>";
    }
    var H = 168, W = Math.round(H * a.w / a.h);
    if (W > 230) { W = 230; H = Math.round(W * a.h / a.w); }
    return '<span class="ar-stage"><span class="ar-frame" style="width:min(' + W + 'px,86%);aspect-ratio:' + a.w + "/" + a.h + '">' + ui + safe + "</span></span>";
  }
  function paintAspects() {
    el("aspects").innerHTML = ASPECTS.map(function (a) {
      return '<label class="pc"><input type="radio" name="aspect" value="' + a.v + '"><span class="chk"></span>' + frameHtml(a) +
        '<span class="ar-meta"><span class="t">' + esc(a.t) + '</span><span class="px">' + a.v + " · " + a.w + "×" + a.h + "</span></span>" +
        '<span class="d">' + esc(a.d) + "</span></label>";
    }).join("");
  }

  // ── 5단계 확인 표 ── 10-18 Dan
  //   위 네 줄(직접 쓴 칸)은 여기서 바로 고친다 · 아래(고른 칸)는 고치기 없이 이전 단계로 가서 고른다
  //   줄마다 확인 체크 — 다 체크해야 「영상 생성 시작」이 켜진다 · 고객이 쓴 글은 굵게·강조색
  var INLINE = { brand: ["브랜드명", 60], kind: ["제품 종류", 40], product: ["제품 이름", 80], point: ["제품 특장점", 200] };
  S.checked = {};
  function paintSummary() {
    var o = S.o3, a = ASPECTS.filter(function (x) { return x.v === o.aspect; })[0];
    function row(key, k, v, ok, opt) {
      opt = opt || {};
      var on = !!S.checked[key];
      var val = !ok ? "입력되지 않았습니다" : v;
      var body = S.editing === key
        ? '<span class="sum-edit">' + (key === "point"
            ? '<textarea id="ed_' + key + '" maxlength="' + INLINE[key][1] + '">' + esc(o[key] || "") + "</textarea>"
            : '<input type="text" id="ed_' + key + '" maxlength="' + INLINE[key][1] + '" value="' + esc(o[key] || "") + '">') +
          '<span class="sum-edit-btns"><button type="button" class="b3 hot" data-save="' + key + '">저장</button>' +
          '<button type="button" class="b3" data-cancel="1">취소</button></span></span>'
        : val;
      return '<div class="sum-row' + (on ? " ok" : "") + '">' +
        '<label class="sum-chk"><input type="checkbox" data-chk="' + key + '"' + (on ? " checked" : "") + (ok ? "" : " disabled") + ' aria-label="' + k + ' 확인"><i></i></label>' +
        "<dt>" + k + '</dt><dd class="' + (!ok ? "miss" : opt.typed ? "typed" : "") + '">' + body + "</dd>" +
        (INLINE[key] && S.editing !== key ? '<button type="button" class="ed" data-edit="' + key + '">고치기</button>' : "<span></span>") + "</div>";
    }
    var ph = S.photos.filter(function (p) { return p.id; });
    var rows = [
      ["brand", "브랜드명", esc(trim(o.brand)), !!trim(o.brand), { typed: 1 }],
      ["kind", "제품 종류", esc(trim(o.kind)), !!trim(o.kind), { typed: 1 }],
      ["product", "제품 이름", esc(trim(o.product)), !!trim(o.product), { typed: 1 }],
      ["point", "제품 특장점", esc(trim(o.point)), trim(o.point).length >= 5, { typed: 1 }],
      ["mood", "영상 분위기", esc(MOODS[o.mood] || ""), !!MOODS[o.mood]],
    ];
    if (trim(o.avoid)) rows.push(["avoid", "피하고 싶은 느낌", esc(trim(o.avoid)), true, { typed: 1 }]);
    if (trim(o.ref_url)) rows.push(["ref_url", "참고 영상", esc(trim(o.ref_url)), true, { typed: 1 }]);
    rows.push(["photos", "등록 사진", '<span class="sum-thumbs">' + ph.map(function (p) { return '<img src="' + esc(p.src) + '" alt="">'; }).join("") + "</span>", ph.length > 0]);
    rows.push(["url", "추가 정보", trim(o.url) ? (o.url_ok ? esc(o.url) + ' <span class="okmark">✓ 확인됨</span>' : esc(o.url) + " (주소 확인 필요)") : '<span class="none">입력 안 함</span>', !trim(o.url) || o.url_ok, { typed: !!trim(o.url) }]);
    rows.push(["aspect", "화면 비율", a ? esc(a.t) + " · " + a.v : "", !!a]);
    rows.push(["len", "영상 길이", "15초 · 1편", true]);
    S.sumKeys = rows.map(function (r) { return r[0]; });
    el("sum").innerHTML = rows.map(function (r) { return row(r[0], r[1], r[2], r[3], r[4]); }).join("");
    var all = S.sumKeys.every(function (k) { return S.checked[k]; });
    el("checkAll").checked = all;
    el("go").disabled = !(okStep(5) && all) || !!S.editing;
    el("missList").textContent = okStep(5) && !all ? "모든 항목을 확인해 체크해 주세요" : "";
    if (S.editing) { var f = el("ed_" + S.editing); if (f) { f.focus(); if (f.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); } }
  }
  function saveInline(key) {
    var v = el("ed_" + key).value;
    if (!trim(v) || (key === "point" && trim(v).length < 5)) { toast(key === "point" ? "특장점은 5자 이상 써 주세요" : "비워 둘 수 없습니다"); return; }
    S.o3[key] = v; el(key).value = v; readStep1();
    S.editing = null; S.checked[key] = false;   // 고친 줄은 다시 확인
    save(true).then(function () { paintSummary(); toast("고쳤습니다 · 자동 저장됨"); });
  }

  function submit() {
    if (!okStep(5)) return;
    var b = el("go"); b.disabled = true; b.textContent = "영상 제작 진행 중";
    save(true).then(function (ok) {
      if (!ok) throw new Error("저장하지 못했습니다");
      return db.rpc("onecue_option3_submit", { p_project_id: S.pid });
    }).then(function (r) {
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) {
        b.disabled = false; b.textContent = "영상 생성 시작";
        el("missList").textContent = "아직 빈칸이 있습니다 — " + (d.missing || []).join(", ");
        return;
      }
      S.o3.status = "submitted"; S.o3.submitted_at = new Date().toISOString(); S.o3.stage = 0;
      go(6);
    }).catch(function (e) {
      b.disabled = false; b.textContent = "영상 생성 시작";
      el("missList").textContent = "보내지 못했습니다 — " + (e.message || e);
    });
  }

  // ── 6단계 ──
  // 10-18 Dan — 「영상 생성 시작」을 누른 때부터 24시간이 초시계처럼 거꾸로 흐른다(시·분·초·1/100초) · 신뢰를 위해 24시간
  var ETA_MS = 24 * 3600 * 1000;
  function tick() {
    var since = new Date(S.o3.submitted_at || Date.now()).getTime();
    var left = Math.max(0, since + ETA_MS - Date.now());
    var p2 = function (n) { return String(n).padStart(2, "0"); };
    var h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), sec = Math.floor(left % 60000 / 1000), cs = Math.floor(left % 1000 / 10);
    el("etH").textContent = p2(h); el("etM").textContent = p2(m); el("etS").textContent = p2(sec); el("etC").textContent = p2(cs);
    if (!left) { el("etaNote").textContent = "마무리 확인 중입니다. 끝나는 대로 바로 알려 드려요"; return; }
    if (S.step === 6 && !el("etaBox").hidden) tick.raf = requestAnimationFrame(tick);
  }
  function paintDone() {
    cancelAnimationFrame(tick.raf); tick();
    // 완성본(관리자가 승인해 올린 final) — 있으면 영상·내려받기를 보여 준다(10-15 옵션 3 납품 경로)
    db.from("assets").select("storage_path,created_at").eq("project_id", S.pid).eq("kind", "final").eq("approved", true)
      .order("created_at", { ascending: false }).limit(1).then(function (r) {
        var a = r.data && r.data[0];
        if (!a) return;
        Promise.all([db.storage.from("uploads").createSignedUrl(a.storage_path, 3600),
                     db.storage.from("uploads").createSignedUrl(a.storage_path, 3600, { download: true })]).then(function (u) {
          if (!u[0].data) return;
          el("finalVid").src = u[0].data.signedUrl;
          el("finalDl").href = (u[1].data || u[0].data).signedUrl;
          el("finalBox").hidden = false; el("etaBox").hidden = true;
          el("doneBusy").textContent = "완성"; el("doneTitle").textContent = "영상이 완성됐어요";
        });
      });
    el("cEmail").textContent = ME.email || "—";
    db.from("contacts").select("phone").eq("project_id", S.pid).not("phone", "is", null).limit(1).then(function (r) {
      var ph = (r.data && r.data[0] && r.data[0].phone) || (ME.user_metadata || {}).phone;
      el("cPhone").textContent = ph || "가입 정보에 없습니다";
    });
  }

  // ── 불러오기(임시 저장 이어 쓰기) ──
  function load(slug) {
    return db.from("projects").select("id,slug,client_id,production_track").eq("slug", slug).maybeSingle().then(function (r) {
      if (r.error || !r.data || r.data.production_track !== "option3") throw new Error("이어 쓸 의뢰를 찾지 못했습니다");
      S.pid = r.data.id; S.slug = r.data.slug; S.clientId = r.data.client_id;
      return db.from("briefs").select("option3").eq("project_id", S.pid).maybeSingle();
    }).then(function (r) {
      S.o3 = Object.assign(blank(), (r.data && r.data.option3) || {});
      var ids = S.o3.photos || [];
      if (!ids.length) return;
      return db.from("assets").select("id,storage_path,meta").in("id", ids).then(function (a) {
        var rows = (a.data || []);
        var paths = rows.map(function (x) { return x.storage_path; });
        return db.storage.from("uploads").createSignedUrls(paths, 3600).then(function (s) {
          var urls = {}; ((s && s.data) || []).forEach(function (u) { urls[u.path] = u.signedUrl; });
          S.photos = ids.map(function (id) {
            var x = rows.filter(function (y) { return y.id === id; })[0];
            return x ? { id: id, src: urls[x.storage_path] || "", w: (x.meta || {}).w, h: (x.meta || {}).h } : null;
          }).filter(Boolean);
        });
      });
    });
  }

  function fill() {
    var o = S.o3;
    el("brand").value = o.brand || ""; el("kind").value = o.kind || ""; el("product").value = o.product || ""; el("point").value = o.point || "";
    el("pointCount").textContent = trim(o.point).length + " / 200";
    if (!o.mood) o.mood = "auto";   // 예전 임시 저장본은 빈 값 — 맡기기로
    var m = document.querySelector('input[name="mood"][value="' + o.mood + '"]'); if (m) m.checked = true;
    el("avoid").value = o.avoid || ""; el("refurl").value = o.ref_url || "";
    var a = document.querySelector('input[name="aspect"][value="' + o.aspect + '"]'); if (a) a.checked = true;
    el("url").value = o.url || "";
    if (o.url) { el("urlMsg").className = "urlmsg " + (o.url_ok ? "ok" : "no"); el("urlMsg").textContent = o.url_ok ? "✓ 페이지를 확인했어요" : "주소 확인을 눌러 주세요"; }
    paintThumbs();
  }

  function wire() {
    ["brand", "kind", "product", "point"].forEach(function (id) { el(id).addEventListener("input", function () { readStep1(); paint(); }); });
    el("moods").addEventListener("change", function (e) { S.o3.mood = e.target.value; paint(); });
    el("avoid").addEventListener("input", function (e) { S.o3.avoid = e.target.value; });
    el("refurl").addEventListener("input", function (e) { S.o3.ref_url = e.target.value; });
    el("aspects").addEventListener("change", function (e) { S.o3.aspect = e.target.value; paint(); });
    el("files").addEventListener("change", function (e) { addFiles(e.target.files); });
    var drop = el("drop");
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
    el("thumbs").addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm]"); if (!b) return;
      S.photos.splice(+b.dataset.rm, 1); paintThumbs(); save(true).then(paint);   // 목록에서만 뺀다 — 올린 원본은 지우지 않는다
    });
    el("url").addEventListener("input", function () {
      S.o3.url = trim(el("url").value); S.o3.url_ok = false;
      el("urlMsg").className = "urlmsg"; el("urlMsg").textContent = S.o3.url ? "주소 확인을 눌러 주세요" : ""; paint();
    });
    el("url").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); checkUrl(); } });
    el("urlCheck").addEventListener("click", checkUrl);
    el("prev").addEventListener("click", function () { if (S.step > 1) { if (okStep(1)) save(true); go(S.step - 1); } });   // 단계가 바뀌면 자동 저장(10-18)
    el("next").addEventListener("click", function () {
      if (!okStep(S.step)) return;
      var b = el("next"); b.disabled = true;
      save(true).then(function (ok) { if (ok) go(S.step + 1); else paint(); });
    });
    el("save").addEventListener("click", function () { save(false); });
    el("sum").addEventListener("click", function (e) {
      var b = e.target.closest("[data-edit]"); if (b) { S.editing = b.dataset.edit; paintSummary(); return; }
      b = e.target.closest("[data-save]"); if (b) { saveInline(b.dataset.save); return; }
      if (e.target.closest("[data-cancel]")) { S.editing = null; paintSummary(); }
    });
    el("sum").addEventListener("change", function (e) {
      var c = e.target.closest("[data-chk]"); if (!c) return;
      S.checked[c.dataset.chk] = c.checked; paintSummary();
    });
    el("sum").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.id && e.target.id.indexOf("ed_") === 0 && e.target.tagName === "INPUT") { e.preventDefault(); saveInline(e.target.id.slice(3)); }
      if (e.key === "Escape" && S.editing) { S.editing = null; paintSummary(); }
    });
    el("checkAll").addEventListener("change", function (e) {
      (S.sumKeys || []).forEach(function (k) { var c = document.querySelector('[data-chk="' + k + '"]'); if (c && !c.disabled) S.checked[k] = e.target.checked; });
      paintSummary();
    });
    el("go").addEventListener("click", submit);
  }

  function boot() {
    if (!window.supabase || !window.ONECUE) { el("loading").textContent = "연결 설정이 없습니다"; return; }
    db = window.ONECUE_DB || (window.ONECUE_DB = window.supabase.createClient(window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
    paintAspects(); wire();
    var slug = new URLSearchParams(location.search).get("p");
    db.auth.getUser().then(function (r) {
      ME = r.data && r.data.user;
      if (!ME) { location.replace("login.html?next=" + encodeURIComponent("new3.html" + location.search)); return; }
      return (slug ? load(slug) : Promise.resolve().then(function () { S.o3 = blank(); })).then(function () {
        fill();
        if (S.o3.status === "submitted") return go(6);
        var n = 1;
        while (n < Math.min(+S.o3.step || 1, 5) && okStep(n)) n++;   // 저장해 둔 단계로 — 앞 단계가 비었으면 그 단계에서 멈춘다
        S.step = n; paint();
      });
    }).catch(function (e) { el("loading").textContent = e.message || String(e); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
