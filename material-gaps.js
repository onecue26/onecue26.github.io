// onecue — 받은 자료로 정직하게 만들 수 있는가
//
// 파이썬 쪽 agency_site/tools/material_gaps.py 와 **같은 판정**을 합니다.
// 두 곳이 다르게 답하면 화면이 「괜찮다」고 하고 서버가 막는 일이 생깁니다.
// tests/test_material_gaps_parity.py 가 같은 입력을 양쪽에 넣어 대조합니다.
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
    var n = (counts || {})[kind];
    n = parseInt(n, 10);
    return isNaN(n) ? 0 : n;
  }

  /**
   * 모자란 것을 모은다. 막는 것(blocking)과 알리는 것(notes)을 나눈다.
   * @param counts {Object} kind -> 개수
   * @param adType {string}
   * @param cuts {number=} 컷 수. 주면 「실재를 가리키는 자료 < 컷 수」를 따로 본다.
   */
  function gaps(counts, adType, cuts, contract) {
    contract = contract || spec();
    if (!contract) return null;
    var key = resolveType(adType, contract);
    var t = contract.types[key];
    var blocking = [];
    var notes = [];
    var i, want, have, need, least, line;

    for (i = 0; i < t.materials.length; i++) {
      want = t.materials[i];
      have = count(counts, want.kind);
      need = want.need;
      least = want.min === undefined ? 1 : parseInt(want.min, 10);
      if (need === "optional" || have >= least) continue;
      line = want.kind + " 이(가) " + least + "개 필요한데 " + have + "개입니다";
      if (want.why) line += "\n    왜 — " + want.why;
      if (want.ask) line += "\n    요청 — " + want.ask;
      (need === "required" ? blocking : notes).push(line);
    }

    // ★ 실재를 가리키는 자료가 컷 수보다 적으면 없는 각도를 지어내게 된다.
    //   개수 부족과 다른 종류의 문제라 따로 말한다 — 「있긴 한데 모자란다」.
    if (cuts) {
      for (i = 0; i < t.materials.length; i++) {
        want = t.materials[i];
        if (want.real !== "yes") continue;
        have = count(counts, want.kind);
        if (have > 0 && have < cuts) {
          notes.push(
            want.kind + " 이(가) " + have + "개인데 컷은 " + cuts +
            "개입니다 — 없는 각도를 지어내게 됩니다.\n" +
            "    고를 것 — (1) 각도를 더 받는다 (2) 있는 각도 안에서 컷을 짠다 " +
            "(3) 생성하되 연출 이미지임을 표시한다");
        }
      }
    }

    var cautions = t.cautions || [];
    for (i = 0; i < cautions.length; i++) notes.push("살필 것 — " + cautions[i]);

    return { type: key, label: t.label, blocking: blocking, notes: notes };
  }

  /** 종류를 고르게 하지 않는다 — 우리가 읽고 판단한 값을 「맞는지만」 보여 준다. */
  function typeLabel(adType) {
    var contract = spec();
    if (!contract) return adType || "";
    var t = contract.types[resolveType(adType, contract)];
    return t ? t.label : adType;
  }

  root.ONECUE_MATERIAL_GAPS = {
    gaps: gaps,
    typeLabel: typeLabel,
    resolveType: resolveType
  };
})(typeof window !== "undefined" ? window : this);
