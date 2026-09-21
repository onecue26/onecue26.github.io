// onecue — 단계별 읽기 렌더 (관리자·광고주 공용)
//
// ★ 왜 이 파일이 생겼나
//   같은 데이터를 광고주 화면(project.js)과 관리자 화면(admin.js)이 **따로** 그리고
//   있었다. 광고주 쪽은 콘셉트 본문을 「핵심 아이디어 · 시간 흐름 · 제작 메모」로 나눠
//   읽기 좋았는데, 관리자 쪽은 범용 출력(readable)이라 배열이 한 줄에 쉼표로 이어
//   붙었다. 같은 글이 화면마다 다르게 읽히면 어느 쪽이 맞는지 알 수 없다.
//   그래서 **읽기 렌더를 한 파일로 모으고 두 화면이 같은 함수를 부른다.**
//
// ★ 규칙 (테스트가 강제한다)
//   1. 순수 함수다 — DOM 도 네트워크도 만지지 않고 문자열만 돌려준다.
//   2. 같은 데이터는 **두 역할에서 공통 구조가 글자까지 같다.** 역할로 갈리는 것은
//      「추가되는 블록」뿐이고, 그 블록은 아래 표식으로 감싸여 있다.
//        <!--onecue:extra:admin--> … <!--/onecue:extra:admin-->
//      광고주 출력에는 이 표식도, 그 안의 글도 **한 글자도 들어가지 않는다.**
//   3. 어떤 칸이 어느 역할에 보이는지는 FIELDS 한 곳에만 적는다. 렌더는 그 표를
//      보고 고른다 — 함수 안에서 칸 이름을 다시 판단하지 않는다.
//   4. 원문을 줄이거나 요약하지 않는다. **자르지 않고 구조로 나눌 뿐이다.**
//   5. 밖에서 들어온 값은 전부 esc() 를 통과한다. URL 은 이 파일이 아예 그리지 않는다.

(function (root) {
  "use strict";

  // ── 역할별로 보이는 칸 ──────────────────────────────────────────────────────
  // common 은 두 역할이 같은 자리·같은 모양으로 본다.
  // admin 은 관리자 화면에만 **덧붙는다** — 공통 구조를 바꾸지 않는다.
  // 여기에 없는 칸은 어느 역할에서도 화면에 나가지 않는다(모르는 칸 = 안 그린다).
  var FIELDS = {
    concept: {
      common: ["key", "axis", "title", "body", "hook", "visual",
        "is_chosen", "is_recommended", "reco_reason"],
      admin: ["risk"],
    },
    development: {
      common: ["arc", "copies", "narration_tone", "slogan", "bgm"],
      admin: ["bgm_workflow"],
    },
    cut: {
      common: ["n", "t_start", "t_end", "block", "who", "action", "dialogue",
        "intent", "size", "angle", "move", "lens", "inherits", "face"],
      admin: ["note"],
    },
  };

  var EXTRA_OPEN = "<!--onecue:extra:admin-->";
  var EXTRA_CLOSE = "<!--/onecue:extra:admin-->";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isAdmin(opts) { return !!(opts && opts.role === "admin"); }

  // 관리자에게만 덧붙는 블록. 광고주 출력에서는 빈 문자열이라 표식조차 남지 않는다
  function extra(opts, html) {
    if (!isAdmin(opts) || !html) return "";
    return EXTRA_OPEN + html + EXTRA_CLOSE;
  }

  function text(v) { return String(v == null ? "" : v).trim(); }

  function has(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return true;
    if (typeof v === "number") return true;
    return String(v).trim().length > 0;
  }

  // 쉬운말 우선 · 전문용어 괄호 병기는 관리자 화면 규칙이다.
  // 광고주에게는 괄호 안의 전문용어를 떼고 쉬운 말만 남긴다 — 글자는 여기서만 만든다
  function label(pair, opts) {
    var plain = pair[0], trade = pair[1];
    if (!trade) return plain;
    return isAdmin(opts) ? plain + "(" + trade + ")" : plain;
  }

  // ── 긴 문단을 자르지 않고 나눈다 ────────────────────────────────────────────
  // 한 문단이 열 문장이면 화면에서 벽이 된다. 문장 단위로 끊어 2~4 문장씩 묶는다.
  // 글자는 하나도 버리지 않는다 — 묶음을 이어 붙이면 원문이 그대로 나온다.
  function sentences(raw) {
    var s = text(raw);
    if (!s) return [];
    var parts = s.split(/([.!?…]+["')\]]*\s+|\n+)/);
    var out = [], buf = "";
    for (var i = 0; i < parts.length; i++) {
      buf += parts[i];
      if (i % 2 === 1) { if (buf.trim()) out.push(buf.trim()); buf = ""; }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  // 2~4 문장 묶음. 남는 꼬리가 한 문장이면 앞 묶음에 붙여 고아 줄을 만들지 않는다
  function chunks(raw, size) {
    var list = sentences(raw);
    var per = size || 3;
    if (list.length <= per) return list.length ? [list.join(" ")] : [];
    var out = [];
    for (var i = 0; i < list.length; i += per) out.push(list.slice(i, i + per).join(" "));
    if (out.length > 1 && sentences(out[out.length - 1]).length === 1) {
      out[out.length - 2] += " " + out.pop();
    }
    return out;
  }

  function paragraphs(raw, cls, size) {
    return chunks(raw, size).map(function (part) {
      return '<p class="' + esc(cls || "stage-para") + '">' + esc(part) + "</p>";
    }).join("");
  }

  // ── 본문 안에 섞여 있는 시간표를 꺼낸다 ─────────────────────────────────────
  // 「0~3초 … 3~7초 …」 처럼 한 문단에 이어 붙은 글을 구간별 세로 목록으로 나눈다.
  // 나누기만 한다 — 문구는 그대로다. 「제작:」 뒤는 제작 방식으로 따로 뺀다.
  function timeline(raw) {
    var body = text(raw);
    var production = "";
    var at = body.indexOf("제작:");
    if (at >= 0) { production = body.slice(at + 3).trim(); body = body.slice(0, at).trim(); }
    var parts = body.split(/(?=\b\d+(?:~|–|-)\d+초)/).filter(Boolean);
    var lead = (parts.shift() || "").trim();
    var steps = parts.map(function (part) {
      var m = part.match(/^(\d+(?:~|–|-)\d+초)\s*([\s\S]*)$/);
      return m ? { at: m[1].trim(), what: m[2].trim() } : { at: "", what: part.trim() };
    });
    return { lead: lead, steps: steps, production: production };
  }

  function timelineList(steps) {
    if (!steps || !steps.length) return "";
    return '<ol class="concept-timeline">' + steps.map(function (s) {
      return "<li>" + (s.at ? "<b>" + esc(s.at) + "</b>" : "<b></b>") +
        "<span>" + esc(s.what) + "</span></li>";
    }).join("") + "</ol>";
  }

  // 배열 한 줄씩. 쉼표로 이어 붙이지 않는다 — 한 항목이 한 행이다
  function itemList(values, cls, numbered) {
    var list = (Array.isArray(values) ? values : (values == null ? [] : [values]))
      .map(text).filter(function (x) { return x.length > 0; });
    if (!list.length) return "";
    var tag = numbered ? "ol" : "ul";
    return "<" + tag + ' class="' + esc(cls) + '">' + list.map(function (x) {
      return "<li><span>" + esc(x) + "</span></li>";
    }).join("") + "</" + tag + ">";
  }

  function part(cls, head, body) {
    if (!body) return "";
    return '<div class="cc-part ' + esc(cls) + '"><b>' + esc(head) + "</b>" + body + "</div>";
  }

  function block(cls, head, body) {
    if (!body) return "";
    return '<section class="stage-block ' + esc(cls) + '"><h4>' + esc(head) + "</h4>" +
      body + "</section>";
  }

  // ── 콘셉트 한 장 ────────────────────────────────────────────────────────────
  // 공통 — 제목 / 핵심 아이디어 / 시간 흐름 / 제작 방식 / 첫 장면
  // 관리자 추가 — 주의점
  function concept(c, opts) {
    var row = c || {};
    var flow = timeline(row.body);
    var idea = paragraphs(flow.lead, "concept-lead");
    var production = flow.production
      ? '<div class="concept-production"><b>' + esc("제작 메모") + "</b><span>" +
        esc(flow.production) + "</span></div>"
      : "";
    var scene = has(row.visual) ? "<span>" + esc(text(row.visual)) + "</span>" : "";
    // 장면 방식(visual)이 비면 이 박스에 남는 것은 관리자 전용 제작 메모뿐이다.
    // 그대로 두면 관리자에게만 박스가 생겨 「공통 구조는 두 역할이 같다」가 깨진다.
    // 공통으로 보일 것이 없을 때는 박스째 관리자 쪽으로 넘긴다. 표식은 한 겹만
    // 씌운다 — 겹치면 commonOnly() 가 안쪽 닫힘에서 끊겨 바깥 꼬리가 남는다.
    var makeBox = scene
      ? part("make", "제작 방식", extra(opts, production) + scene)
      : extra(opts, part("make", "제작 방식", production));
    var reco = row.is_recommended
      ? '<span class="reco" tabindex="0">추천' +
        (has(row.reco_reason) ? '<span class="why">' + esc(text(row.reco_reason)) + "</span>" : "") +
        "</span>"
      : "";
    return '<article class="cc' + (row.is_chosen ? " chosen" : "") +
      (row.is_recommended ? " reco-on" : "") + '">' + reco +
      '<header class="cc-head"><span class="k">' + esc(text(row.key)) + "안" +
        (has(row.axis) ? " <em>" + esc(text(row.axis)) + "</em>" : "") + "</span>" +
        '<span class="t">' + esc(text(row.title)) + "</span></header>" +
      part("idea", "핵심 아이디어", idea || "") +
      part("flow", "시간 흐름", timelineList(flow.steps)) +
      makeBox +
      part("hook", "첫 장면", has(row.hook) ? "<span>" + esc(text(row.hook)) + "</span>" : "") +
      extra(opts, part("warn", "주의점",
        has(row.risk) ? paragraphs(row.risk, "stage-para", 2) : "")) +
      // opts.actions 는 **데이터가 아니라 그 화면의 버튼 자리**다(광고주의 「이걸로
      // 하겠습니다」 같은 것). 기록에서 온 글이 여기로 들어가는 일은 없고, 두 역할의
      // 공통 구조를 비교할 때는 양쪽 다 비워 둔다
      ((opts && opts.actions) || "") +
      "</article>";
  }

  // ── 구성·각본 ───────────────────────────────────────────────────────────────
  // 공통 — 시간 흐름(세로 목록) / 화면 글자(행마다) / 목소리 느낌 / 마지막 한 줄 / 음악
  // 관리자 추가 — 최종 편집 음악 워크플로
  function development(d, opts) {
    var row = d || {};
    var arcList = (Array.isArray(row.arc) ? row.arc : [])
      .map(text).filter(function (x) { return x.length > 0; });
    // 한 줄이 「0~3초 …」 꼴이면 시간 구간을 앞 칸으로 떼어 낸다. 아니면 그대로 한 행이다
    var arcRows = arcList.map(function (line) {
      var m = line.match(/^(\d+(?:~|–|-)\d+\s*초|\d+\s*초)\s*[·:\-]?\s*([\s\S]*)$/);
      return m && m[2] ? { at: m[1].replace(/\s+/g, ""), what: m[2].trim() }
        : { at: "", what: line };
    });
    var arcHtml = arcRows.length
      ? '<ol class="stage-seq">' + arcRows.map(function (r, i) {
        return "<li><b>" + esc(r.at || String(i + 1)) + "</b><span>" +
          esc(r.what) + "</span></li>";
      }).join("") + "</ol>"
      : "";
    var musicOn = !!row.bgm;
    return '<div class="stage-read development">' +
      block("flow", label(["시간 흐름", "전개 arc"], opts), arcHtml) +
      block("copies", label(["화면에 뜨는 글자", "카피"], opts),
        itemList(row.copies, "stage-lines")) +
      block("narration", label(["읽어 주는 목소리 느낌", "나레이션 톤"], opts),
        has(row.narration_tone) ? "<p>" + esc(text(row.narration_tone)) + "</p>" : "") +
      block("slogan", label(["마지막 한 줄", "슬로건"], opts),
        has(row.slogan) ? "<p><b>" + esc(text(row.slogan)) + "</b></p>" : "") +
      block("bgm", label(["배경음악", "BGM"], opts),
        "<p>" + esc(musicOn ? "생성할 때 함께 사용" : "넣지 않음") + "</p>") +
      extra(opts, block("bgm-next", "최종 편집 음악",
        "<p>" + esc(musicOn
          ? "생성된 음악을 확인한 뒤 유지·교체 결정"
          : "전체 영상에 맞는 한 곡을 별도로 선택해 삽입") + "</p>")) +
      "</div>";
  }

  // ── 구성·각본 · 광고주에게 나가는 것 ────────────────────────────────────────
  //
  // ★ 광고주에게는 **상태와 완료 안내만** 나간다. `arc`·`copies`·`narration_tone`·
  //   `slogan`·`bgm` 의 원문은 아직 광고주용 요약 칸도, 명시적인 공유 게이트도
  //   없으므로 내보내지 않는다(Codex 검수 2026-09-21).
  //
  // 이 함수는 **결과 줄을 인자로 받지 않는다.** 받을 수 없으니 흘릴 수도 없다 —
  // 그것이 이 함수가 따로 있는 이유다. 위의 development() 는 지우지 않았고
  // 관리자 화면이 계속 쓴다. 광고주용 요약 칸이 생기면 이 자리에 그 요약만
  // (development() 의 opts.clientSummary 로) 더하면 된다.
  var DEVELOPMENT_STATES = {
    done: ["구성·각본 준비 완료", "장면 구성과 각본을 마쳤습니다. 다음 단계로 진행 중입니다."],
    working: ["구성·각본 작업 중", "장면 구성과 각본을 만들고 있습니다."],
  };

  function developmentNotice(state) {
    var pair = DEVELOPMENT_STATES[state] || DEVELOPMENT_STATES.working;
    return '<div class="stage-read development-notice">' +
      '<section class="stage-block status"><h4>' + esc(pair[0]) + "</h4>" +
      "<p>" + esc(pair[1]) + "</p></section></div>";
  }

  // ── 컷 한 줄 ────────────────────────────────────────────────────────────────
  // 공통 — 번호·시간·장면 / 행동 / 대사 / 의도 / 카메라 / 이어지는 것
  // 관리자 추가 — 제작 메모(내부 기록)
  function cut(c, opts, media) {
    var row = c || {};
    var when = (row.t_start != null && row.t_end != null)
      ? row.t_start + "–" + row.t_end + "초"
      : (row.t_start != null ? row.t_start + "초" : "");
    var camera = [
      ["크기", row.size], ["각도", row.angle], ["움직임", row.move], ["렌즈", row.lens],
    ].filter(function (x) { return has(x[1]); });
    var cameraHtml = camera.length
      ? '<dl class="cut-spec">' + camera.map(function (x) {
        return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(text(x[1])) + "</dd>";
      }).join("") + "</dl>"
      : "";
    var cont = [];
    if (has(row.inherits)) cont.push(row.inherits + "번 컷에서 이어집니다");
    if (has(row.face)) cont.push("얼굴 기준 · " + text(row.face));
    var contHtml = cont.length ? itemList(cont, "stage-lines") : "";
    return '<div class="cut' + (media ? "" : " noimg") + '">' +
      (media || '<div class="noimg-n">' + esc(text(row.n)) + "</div>") +
      '<div class="body">' +
      '<div class="head"><span class="n">' + esc(text(row.n)) + "</span>" +
      '<span class="tt">' + esc(when) + "</span>" +
      '<span class="blk">' + esc(text(row.block)) + "</span></div>" +
      (has(row.who) ? '<div class="cut-row"><b>인물</b><span>' + esc(text(row.who)) +
        "</span></div>" : "") +
      (has(row.action) ? '<div class="cut-row what"><b>행동</b><span>' +
        esc(text(row.action)) + "</span></div>" : "") +
      (has(row.dialogue) ? '<div class="cut-row line"><b>대사</b><span>' +
        esc(text(row.dialogue)) + "</span></div>" : "") +
      (has(row.intent) ? '<div class="cut-row why"><b>의도</b><span>' +
        esc(text(row.intent)) + "</span></div>" : "") +
      (cameraHtml ? '<div class="cut-row spec"><b>카메라</b>' + cameraHtml + "</div>" : "") +
      (contHtml ? '<div class="cut-row cont"><b>이어지는 것</b>' + contHtml + "</div>" : "") +
      extra(opts, has(row.note)
        ? '<div class="cut-row memo"><b>제작 메모</b><span>' + esc(text(row.note)) +
          "</span></div>"
        : "") +
      "</div></div>";
  }

  // 컷 여러 개. media(n) 는 화면마다 다른 그림 칸을 돌려주는 선택적 함수다 —
  // 그림은 각 화면이 만든다(권한과 주소가 화면마다 다르다). 글 구조는 여기 하나뿐이다
  function cuts(list, opts, media) {
    var rows = (list || []).slice();
    if (!rows.length) return "";
    return '<div class="cuts">' + rows.map(function (c) {
      return cut(c, opts, media ? media(c) : "");
    }).join("") + "</div>";
  }

  // 전략 — 네 칸이 각각 한 구획이다. 한 줄에 이어 붙이지 않는다
  function strategy(s, opts) {
    var row = s || {};
    return '<div class="stage-read strategy">' +
      block("insight", "인사이트", paragraphs(row.insight, "stage-para", 2)) +
      block("message", "핵심 메시지",
        has(row.one_message) ? "<p><b>" + esc(text(row.one_message)) + "</b></p>" : "") +
      block("usp", label(["강점", "USP"], opts), paragraphs(row.usp, "stage-para", 2)) +
      block("tone", "톤", has(row.tone) ? "<p>" + esc(text(row.tone)) + "</p>" : "") +
      "</div>";
  }

  root.ONECUE_RENDER = {
    FIELDS: FIELDS,
    EXTRA_OPEN: EXTRA_OPEN, EXTRA_CLOSE: EXTRA_CLOSE,
    esc: esc, text: text, has: has, label: label,
    sentences: sentences, chunks: chunks, paragraphs: paragraphs,
    timeline: timeline, timelineList: timelineList, itemList: itemList,
    concept: concept, development: development, cut: cut, cuts: cuts,
    developmentNotice: developmentNotice, DEVELOPMENT_STATES: DEVELOPMENT_STATES,
    strategy: strategy,
  };
})(typeof window !== "undefined" ? window : this);
