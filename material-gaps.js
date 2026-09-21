// onecue — 받은 자료로 정직하게 만들 수 있는가
//
// 파이썬 쪽 agency_site/tools/material_gaps.py 와 **같은 판정**을 합니다.
// 두 곳이 다르게 답하면 화면이 「괜찮다」고 하고 서버가 막는 일이 생깁니다.
// tests/test_material_gaps_parity.py 가 같은 입력을 양쪽에 넣어 대조합니다.
//
// ★ 판정은 한 벌이고 **문장은 두 벌**입니다.
//   전에는 한 벌로 써서 양쪽에 같이 썼고, 그래서 우리끼리 하는 말이 그대로
//   광고주 화면에 나갔습니다 — 「logo 이(가) 1개 필요한데」, 「생성에 맡기면」,
//   「컷은 6개입니다」. 내부 이름도 우리 단위도 광고주가 쓰는 말이 아닙니다.
//   gaps() 는 판정만 돌려주고, line() 이 읽는 사람에 맞춰 글로 옮깁니다.
//
// 계약은 여기 없습니다 — ad-type-materials.js(정본 db/ad_type_materials.json)를 읽습니다.
(function (root) {
  "use strict";

  function spec() {
    return root.ONECUE_AD_TYPE_MATERIALS || null;
  }

  // 모르는 종류는 other 로 받습니다. 거절하지 않습니다 — 종류는 늘려 가는 것이고,
  // 표에 없다는 이유로 의뢰를 막으면 표를 늘릴 기회 자체가 없어집니다.
  function resolveType(adType, contract) {
    var types = (contract || {}).types || {};
    return Object.prototype.hasOwnProperty.call(types, adType) ? adType : "other";
  }

  function count(counts, kind) {
    var n = parseInt((counts || {})[kind], 10);
    return isNaN(n) ? 0 : n;
  }

  function item(want, have, mode) {
    return {
      kind: want.kind, need: want.need, have: have,
      want: want.min === undefined ? 1 : parseInt(want.min, 10),
      mode: mode, angles: want.angles || "one",
      why: want.why || "", ask: want.ask || "", say: want.say || {},
    };
  }

  /** 항목 하나를 글로. who 가 문장을 고른다. */
  function line(it, who) {
    var say = it.say || {};
    var client = who === "client";
    var name = (client && say.label) || it.kind;
    var head;
    if (it.mode === "missing") {
      head = name + " 이(가) " + it.want + "개 필요한데 " + it.have + "개입니다";
    } else if (it.mode === "short") {
      head = client
        ? name + " 이(가) " + it.have + "장인데 장면은 " + it.cuts +
          "개입니다 — 없는 각도를 지어내게 됩니다."
        : name + " 이(가) " + it.have + "개인데 컷은 " + it.cuts +
          "개입니다 — 없는 각도를 지어내게 됩니다.";
    } else if (it.mode === "one_angle") {
      head = client
        ? name + " 이(가) " + it.have + "장이고 장면은 " + it.cuts +
          "개입니다 — 모자란 것은 아닙니다."
        : name + " 이(가) " + it.have + "개이고 컷은 " + it.cuts +
          "개입니다 — 모자란 것이 아닙니다.";
    } else {
      return it.text || "";
    }
    var body = [];
    if (client) {
      if (say.why) body.push(say.why);
      if (it.mode === "missing" && say.ask) body.push(say.ask);
      if ((it.mode === "short" || it.mode === "one_angle") && it.angles_say) {
        body.push(it.angles_say);
      }
    } else {
      if (it.why) body.push("왜 — " + it.why);
      if (it.mode === "missing" && it.ask) body.push("요청 — " + it.ask);
      if (it.mode === "short") {
        body.push("고를 것 — (1) 각도를 더 받는다 (2) 있는 각도 안에서 컷을 짠다 " +
          "(3) 생성하되 연출 이미지임을 표시한다");
      }
      if (it.mode === "one_angle") {
        body.push("정할 것 — 가진 각도에 맞춰 컷을 짭니다. 그림(콘티)은 아무 각도로나 " +
          "그려도 되지만, 실제 화면을 만들 때는 가진 각도로 맞추거나 " +
          "각도를 더 받아야 합니다.");
      }
    }
    return head + body.map(function (b) { return "\n    " + b; }).join("");
  }

  /**
   * 모자란 것을 모은다. 막는 것(blocking)과 알리는 것(notes)을 나눈다.
   * 돌려주는 것은 **항목(판정)**이지 문장이 아니다.
   */
  function gaps(counts, adType, cuts, contract) {
    contract = contract || spec();
    if (!contract) return null;
    var key = resolveType(adType, contract);
    var t = contract.types[key];
    var sayAngles = contract.angles_say || {};
    var blocking = [];
    var notes = [];
    var i, want, have, least, it;

    for (i = 0; i < t.materials.length; i++) {
      want = t.materials[i];
      have = count(counts, want.kind);
      least = want.min === undefined ? 1 : parseInt(want.min, 10);
      if (want.need === "optional" || have >= least) continue;
      it = item(want, have, "missing");
      (want.need === "required" ? blocking : notes).push(it);
    }

    // ★ 장면마다 다른 것을 보여 주는 자료(angles='each')만 컷 수와 견준다.
    //   캔은 하나의 단단한 물건이라 한 각도면 그 각도에 맞춰 컷을 짜면 된다.
    if (cuts) {
      for (i = 0; i < t.materials.length; i++) {
        want = t.materials[i];
        if (want.real !== "yes") continue;
        have = count(counts, want.kind);
        if (!(have > 0 && have < cuts)) continue;
        it = item(want, have, (want.angles || "one") === "each" ? "short" : "one_angle");
        it.cuts = cuts;
        it.angles_say = sayAngles[it.angles] || "";
        notes.push(it);
      }
    }

    var cautions = t.cautions || [];
    for (i = 0; i < cautions.length; i++) {
      // 살필 것은 우리끼리 보는 메모다. 광고주에게는 나가지 않는다.
      notes.push({ kind: null, mode: "caution", need: "note",
        text: "살필 것 — " + cautions[i], say: {} });
    }
    return { type: key, label: t.label, blocking: blocking, notes: notes };
  }

  /** 판정 묶음을 그 사람에게 할 말로 옮긴다. */
  function text(out, who) {
    if (!out) return null;
    function keep(it) { return who !== "client" || it.mode !== "caution"; }
    return {
      type: out.type, label: out.label,
      blocking: out.blocking.filter(keep).map(function (x) { return line(x, who); }),
      notes: out.notes.filter(keep).map(function (x) { return line(x, who); }),
    };
  }

  /** 종류를 고르게 하지 않는다 — 우리가 읽고 판단한 값을 「맞는지만」 보여 준다. */
  function typeLabel(adType) {
    var contract = spec();
    if (!contract) return adType || "";
    var t = contract.types[resolveType(adType, contract)];
    return t ? t.label : adType;
  }

  root.ONECUE_MATERIAL_GAPS = {
    gaps: gaps, text: text, line: line,
    typeLabel: typeLabel, resolveType: resolveType,
  };
})(typeof window !== "undefined" ? window : this);
