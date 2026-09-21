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
      // visual(제작 방식)에는 안전 여백 같은 제작 사양이 들어가므로 관리자 칸이다.
      // payoff(착지)는 광고주가 「어떻게 끝나나」를 알아야 고를 수 있어 공통이다.
      common: ["key", "axis", "title", "body", "hook", "payoff",
        "is_chosen", "is_recommended", "reco_reason"],
      admin: ["visual", "risk"],
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
    // 시간은 소수로도 적힌다 — "0.5~3초", "1.5~3초", "4.5~7초".
    // \b\d+ 로 자르면 점 뒤의 숫자부터 잡아서 "0." 이 앞 문단 끝에 남고 "5~3초" 라는
    // 없는 시간이 생긴다. 실제로 A·C·D안이 그렇게 깨져 있었다.
    // 경계는 lookbehind 대신 표시를 심어 나눈다 — 구형 브라우저에서도 같게 돈다.
    var MARK = "\u0000";
    var RANGE = /\d+(?:\.\d+)?(?:~|–|-)\d+(?:\.\d+)?초/g;
    var parts = body.replace(RANGE, MARK + "$&").split(MARK).filter(Boolean);
    var lead = (parts.shift() || "").trim();
    // 앞머리의 「15초 · 6컷.」 은 핵심 아이디어가 아니라 사양이다. 게다가 초·컷수는
    // 콘셉트 단계가 정하는 값이 아니라 다음 단계(구성·각본)가 정하는 값이다.
    // 그대로 두면 다섯 카드의 첫 줄이 전부 같은 꼴의 숫자로 시작해 비교가 안 된다.
    // 줄 전체가 사양이면 통째로, 뒤에 본문이 이어지면 사양만 떼어 낸다.
    lead = lead.replace(/^\d+(?:\.\d+)?\s*초\s*[·,]?\s*\d+\s*컷\s*[.·,]?\s*/, "");
    var steps = parts.map(function (part) {
      var m = part.match(/^(\d+(?:\.\d+)?(?:~|–|-)\d+(?:\.\d+)?초)\s*([\s\S]*)$/);
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

  // ── 콘셉트 단계는 「초」를 말하지 않는다 ────────────────────────────────────
  // 콘셉트는 다섯 방향 중 하나를 고르는 단계다. 정확한 초·컷수·카메라는 다음
  // 단계(구성·각본)가 정하는 것이고, 여기서 미리 못을 박으면 두 단계가 같은 말을
  // 두 번 하면서 서로 어긋난다. 그래서 고를 때 필요한 만큼만 — 처음·가운데·끝
  // 세 덩이로 묶어 시간 없이 보여 준다. 원문은 지우지 않고 아래 접힘에 남긴다.
  // ── 제작 지시가 섞인 문장인가 ───────────────────────────────────────────────
  // RUSH 콘셉트 본문에는 "카메라는 한 번도 움직이지 않고", "0.4초 정지 비트를 둬
  // 480p에서 형태가 읽히게 한다" 같은 문장이 섞여 있다. 콘셉트 단계가 말하면 안
  // 되는 것들인데(단계 계약 v1 §4), 이미 쓰인 글이라 지울 수 없다.
  //
  // 낱말만 지우면 문장이 부서져 **우리가 쓰지 않은 말**이 된다. 그래서 고치지
  // 않고 **내보내지 않는다.** 광고주에게는 안전한 칸만 남기고, 관리자 화면에는
  // 원문이 그대로 있다. 원문을 광고주용으로 다시 쓰는 것은 사람이 할 일이다.
  var PRODUCTION_WORDS =
    /(카메라|렌즈|화각|컷|프레임|합성|팩샷|와이프|비트|480p|720p|해상도|생성|모델|전환)/;
  function isProductionTalk(s) {
    var t = text(s);
    return PRODUCTION_WORDS.test(t) || /\d+(?:\.\d+)?\s*초/.test(t);
  }

  // 안전하면 공통 칸으로, 제작 지시가 섞였으면 관리자 블록으로. 같은 html 이
  // 어느 쪽에 놓이느냐만 달라진다 — 글자는 한 자도 고치지 않는다.
  function guard(cls, head, html, source, opts) {
    if (!html) return "";
    return isProductionTalk(source) ? extra(opts, part(cls, head, html))
                                    : part(cls, head, html);
  }

  function coarseFlow(steps) {
    if (!steps || !steps.length) return "";
    var names = ["처음", "가운데", "끝"];
    var n = steps.length;
    var groups = [[], [], []];
    for (var i = 0; i < n; i++) groups[Math.min(2, Math.floor(i * 3 / n))].push(steps[i].what);
    var rows = groups.map(function (g, i) {
      return g.length ? { at: names[i], what: g.join(" ") } : null;
    }).filter(Boolean);
    if (!rows.length) return "";
    return '<ol class="concept-timeline coarse">' + rows.map(function (r) {
      return "<li><b>" + esc(r.at) + "</b><span>" + esc(r.what) + "</span></li>";
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
    var admin = isAdmin(opts);
    var flow = timeline(row.body);
    var idea = paragraphs(flow.lead, "concept-lead");
    var production = flow.production
      ? '<div class="concept-production"><b>' + esc("제작 메모") + "</b><span>" +
        esc(flow.production) + "</span></div>"
      : "";
    var scene = has(row.visual) ? "<span>" + esc(text(row.visual)) + "</span>" : "";
    // 제작 방식(visual + 제작 메모)은 통째로 관리자 것이다. 화면 가장자리 안전
    // 여백 같은 제작 사양이 여기 들어가는데, 콘셉트는 「어느 방향으로 갈까」를
    // 고르는 자리라 광고주가 판단할 거리가 아니다.
    // 표식은 한 겹만 씌운다 — 겹치면 commonOnly() 가 안쪽 닫힘에서 끊긴다.
    // 그래서 여기서는 감싸지 않고, 아래 cc-more 한 겹으로 한 번에 감싼다.
    var makeBox = part("make", "제작 방식", production + scene);
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
      // 제작 지시가 섞인 칸은 **관리자 쪽으로 옮긴다.** 지우거나 낱말만 도려내면
      // 우리가 쓰지 않은 문장이 되고, 광고주 화면에서만 빼면 「관리자 = 광고주 +
      // 덧붙임」이라는 이 파일의 전제가 깨진다. 옮기면 둘 다 지켜진다 —
      // 표식을 벗기면 광고주 출력이 그대로 나온다.
      guard("idea", "핵심 아이디어", idea, flow.lead, opts) +
      guard("flow", "대략의 흐름", coarseFlow(flow.steps),
        flow.steps.map(function (s) { return s.what; }).join(" "), opts) +
      guard("hook", "첫 장면",
        has(row.hook) ? "<span>" + esc(text(row.hook)) + "</span>" : "", row.hook, opts) +
      guard("pay", "이렇게 끝난다",
        has(row.payoff) ? "<span>" + esc(text(row.payoff)) + "</span>" : "", row.payoff, opts) +
      // 옮겨진 칸이 있으면 왜 비어 있는지 적는다. 빈 자리는 「아직 안 만들었다」로
      // 읽히지만 실제로는 「광고주가 읽을 말로 다시 써야 한다」이다. 두 역할이
      // 같이 본다 — 관리자도 이 카드가 손봐야 할 카드임을 알아야 한다.
      (isProductionTalk(row.body)
        ? '<div class="cc-part pending"><b>정리 중</b><span>' +
          esc("이 방향의 설명에 제작 지시가 섞여 있어, 보시기 좋은 말로 다시 정리하고 있습니다.") +
          "</span></div>"
        : "") +
      // 위 넷(발상·흐름·첫 장면·착지)이 고를 때 쓰는 값이다. 아래 접힘은 하나를
      // 정하고 나서 파고드는 값이라 **관리자만** 본다 — 제작 사양·위험·초 단위
      // 원문이 들어간다. 콘셉트 단계에서 초와 컷수는 아직 정해진 값도 아니다.
      // 지우는 게 아니라 역할을 나누는 것이다. 관리자 화면에는 그대로 있다.
      extra(opts, (makeBox || has(row.risk) || flow.steps.length)
        ? '<details class="cc-more"><summary>자세히</summary>' +
          makeBox +
          part("warn", "주의점",
            has(row.risk) ? paragraphs(row.risk, "stage-para", 2) : "") +
          (flow.steps.length
            ? part("full", "기존 상세 기록 (초 단위)", timelineList(flow.steps)) : "") +
          "</details>"
        : "") +
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
    // 한 줄이 「0~3초 …」 꼴이면 시간 구간을 앞 칸으로 떼어 낸다. 아니면 그대로 한 행이다.
    // ★ 시간은 소수로 적힌다 — 실제 데이터가 "0.0–1.6초: …" 다. \d+ 만 받으면
    //   한 줄도 안 맞아 시간 칸이 비고, 본문이 "0.0–1.6초: …" 째로 오른쪽 칸에
    //   밀려 들어간다. 그러면 앞 칸에는 순번 1·2·3 만 남아 시간표가 아니게 된다.
    //   timeline() 이 콘셉트 본문에서 쓰는 것과 같은 꼴을 쓴다.
    var arcRows = arcList.map(function (line) {
      var m = line.match(
        /^(\d+(?:\.\d+)?(?:~|–|-)\d+(?:\.\d+)?\s*초|\d+(?:\.\d+)?\s*초)\s*[·:\-]?\s*([\s\S]*)$/);
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
    // 「인물」이라고 부르면 사물 광고에서 말이 안 된다 — RUSH 컷1의 who 는
    // "삼각형 자몽 조각, 뒤쪽의 RUSH 캔" 이다. 화면에 나오는 것 전부를 가리킨다.
    var rows =
      (has(row.dialogue) ? '<div class="cut-row line"><b>대사</b><span>' +
        esc(text(row.dialogue)) + "</span></div>" : "") +
      (has(row.intent) ? '<div class="cut-row why"><b>의도</b><span>' +
        esc(text(row.intent)) + "</span></div>" : "") +
      (has(row.who) ? '<div class="cut-row"><b>등장 요소</b><span>' + esc(text(row.who)) +
        "</span></div>" : "") +
      (cameraHtml ? '<div class="cut-row spec"><b>카메라</b>' + cameraHtml + "</div>" : "") +
      (contHtml ? '<div class="cut-row cont"><b>이어지는 것</b>' + contHtml + "</div>" : "") +
      extra(opts, has(row.note)
        ? '<div class="cut-row memo"><b>제작 메모</b><span>' + esc(text(row.note)) +
          "</span></div>"
        : "");

    // ── 압축 칸 (opts.compact) ────────────────────────────────────────────────
    // 그림이 아직 없는 관리자 콘티는 컷 여섯 개가 글로만 세로로 늘어서서, 한
    // 화면에 두 컷밖에 안 들어온다. 콘티를 보는 일은 컷 하나를 정독하는 게
    // 아니라 **앞뒤가 맞나**를 훑는 것이라 이웃 컷이 같이 보여야 한다. 그래서
    // 한 칸은 번호·묶음 / 무슨 일이 일어나나 / 움직임·길이 세 줄만 두고 나머지는
    // 접는다. 접은 것은 버리는 게 아니라 `자세히` 안에 그대로 있다.
    // ★ 광고주 화면은 이 길로 오지 않는다 — 거기는 콘티 그림과 완성 영상을
    //   나란히 놓는 넓은 칸이라 지금 배치가 맞다. 멀쩡한 쪽을 같이 바꾸지 않는다.
    if (opts && opts.compact) {
      var beat = [text(row.move), when].filter(Boolean).join(" · ");
      return '<figure class="cut panel' + (media ? "" : " noimg") + '">' +
        (media || '<div class="cut-empty"><span>그림 준비 전</span></div>') +
        '<figcaption class="body">' +
        '<div class="head"><span class="n">' + esc(text(row.n)) + "</span>" +
        (has(row.block) ? '<span class="blk">' + esc(text(row.block)) + "</span>" : "") +
        "</div>" +
        (has(row.action) ? '<p class="what">' + esc(text(row.action)) + "</p>" : "") +
        (beat ? '<p class="beat">' + esc(beat) + "</p>" : "") +
        (rows ? '<details class="cut-more"><summary>자세히</summary>' + rows + "</details>" : "") +
        "</figcaption></figure>";
    }

    return '<div class="cut' + (media ? "" : " noimg") + '">' +
      (media || '<div class="noimg-n">' + esc(text(row.n)) + "</div>") +
      '<div class="body">' +
      '<div class="head"><span class="n">' + esc(text(row.n)) + "</span>" +
      '<span class="tt">' + esc(when) + "</span>" +
      '<span class="blk">' + esc(text(row.block)) + "</span></div>" +
      (has(row.action) ? '<div class="cut-row what"><b>행동</b><span>' +
        esc(text(row.action)) + "</span></div>" : "") +
      rows +
      "</div></div>";
  }

  // 컷 여러 개. media(n) 는 화면마다 다른 그림 칸을 돌려주는 선택적 함수다 —
  // 그림은 각 화면이 만든다(권한과 주소가 화면마다 다르다). 글 구조는 여기 하나뿐이다
  function cuts(list, opts, media) {
    var rows = (list || []).slice();
    if (!rows.length) return "";
    return '<div class="cuts' + (opts && opts.compact ? " compact" : "") + '">' +
      rows.map(function (c) {
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
