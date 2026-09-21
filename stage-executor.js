// onecue — 단계별 실행 주체
//
// 제작 단계마다 「AI 진행」인지 「담당자 진행」인지는 관리자가 고른다.
// 고른 결과는 DB 의 stage_executors 한 줄이고, 없으면 예전 그대로 AI 다.
// 그래서 지금 돌고 있는 건들은 이 파일이 생겨도 동작이 바뀌지 않는다.
//
// 여기엔 화면을 그리지 않는 판단만 모은다 — admin.js 가 쓰고, 테스트가 그대로 부른다.

(function (root) {
  "use strict";

  var ORDER = ["brief", "facts", "strategy", "concepts", "develop",
    "storyboard", "anchors", "video", "deliver"];

  var DEFAULT = { mode: "ai", assignee: "", reviewer_model: "", reviewer_note: "", state: "planned" };

  function index(step) { return ORDER.indexOf(step); }

  function nextStep(step) {
    var i = index(step);
    return i < 0 || i >= ORDER.length - 1 ? null : ORDER[i + 1];
  }

  // 관리자가 아무것도 고르지 않은 단계는 예전 흐름 그대로 AI 다
  function of(project, step) {
    var map = (project && project.stageExecutors) || {};
    var row = map[step];
    if (!row) {
      return { mode: "ai", assignee: "", reviewer_model: "", reviewer_note: "",
        state: "planned", delivered_at: null, delivered_note: "",
        client_summary: "", plain_language_ok: false };
    }
    return {
      mode: row.mode === "human" ? "human" : "ai",
      assignee: row.assignee || "",
      reviewer_model: row.reviewer_model || "",
      reviewer_note: row.reviewer_note || "",
      state: row.state || "planned",
      delivered_at: row.delivered_at || null,
      // 광고주가 읽을 말과 내부 제작 명세는 끝까지 다른 칸에 있다
      delivered_note: row.delivered_note || "",
      client_summary: row.client_summary || "",
      plain_language_ok: !!row.plain_language_ok,
    };
  }

  function isHuman(project, step) { return of(project, step).mode === "human"; }

  // AI 가 실제로 돌린 기록 — events.payload.executor 에 남는다
  function aiRecord(project, step) {
    var history = (project && project.aiHistory) || [];
    for (var i = 0; i < history.length; i++) {
      if (history[i].step === step && history[i].executor) return history[i].executor;
    }
    return null;
  }

  function join(a, b) {
    return [a, b].filter(function (x) { return x; }).join(" · ");
  }

  // 수행자 — 사람이면 이름, AI 면 실제로 돌린 모델, 아직이면 계획만
  function performer(project, step) {
    var pick = of(project, step);
    if (pick.mode === "human") {
      return { kind: "human", label: pick.assignee || "담당자 미지정" };
    }
    var ran = aiRecord(project, step);
    var label = ran ? join(ran.executor_provider, ran.executor_model) : "";
    return { kind: "ai", label: label || "기록 없음" };
  }

  // 핵심 검토 AI — 관리자가 지정한 값이 먼저다. 담당자 단계에는 AI 실행 기록이
  // 아예 없으므로 지정값이 없으면 그대로 「지정 없음」이다
  function reviewer(project, step) {
    var pick = of(project, step);
    if (pick.reviewer_model) return pick.reviewer_model;
    var ran = aiRecord(project, step);
    if (!ran || !ran.reviewer_model) return "별도 검토 없음";
    if (ran.reviewer_model === ran.executor_model) return "동일 AI 자체 검토";
    return join(ran.reviewer_provider, ran.reviewer_model);
  }

  // 지나간 단계와 이미 결과가 등록된 단계는 더 고르지 않는다.
  // 진행 중인 AI 작업이 있으면 담당자로 돌려서 작업을 붕 뜨게 만들지 않는다 — DB 도 같은 이유로 막는다
  function editable(project, step) {
    if (!project || index(step) < 0) return false;
    if (index(step) < index(project.step)) return false;
    if (of(project, step).state === "delivered") return false;
    if (project.job && project.job.step === step) return false;
    return true;
  }

  // 지금 이 단계에서 사람이 결과를 올려주기를 기다리는 중인가
  function waiting(project, step) {
    if (!project) return false;
    var pick = of(project, step);
    return pick.mode === "human" && pick.state !== "delivered" &&
      project.step === step && project.state === "pending";
  }

  function canDeliver(project, step) { return waiting(project, step); }

  // 이 단계의 작업이 기존 jobs 큐로 갈 것인가 — 담당자 단계면 절대 아니다
  function queuesAi(project, step) { return !isHuman(project, step); }

  // 현재 단계를 누가 쥐고 있는가 — 목록 요약에 쓴다
  function currentHolder(project) {
    if (!project) return null;
    if (!isHuman(project, project.step)) return null;
    var pick = of(project, project.step);
    return {
      assignee: pick.assignee,
      state: waiting(project, project.step) ? "waiting" : pick.state,
    };
  }

  // 단계의 지금 상태 — 결과가 들어와 있나, 없으면 누가 왜 붙들고 있나.
  // 화면은 이 판단만 보고 「제작 중 / 대기」와 상세 표시를 가른다
  function status(project, step, hasResult) {
    if (hasResult) return { kind: "done", assignee: of(project, step).assignee };
    var pick = of(project, step);
    if (pick.mode === "human") {
      // 등록은 했는데 내용이 안 들어온 상태도 숨기지 않는다
      return { kind: pick.state === "delivered" ? "empty" : "human_wait", assignee: pick.assignee };
    }
    if (project && project.job && project.job.step === step) {
      return { kind: "ai_working", assignee: "" };
    }
    return { kind: "idle", assignee: "" };
  }

  // ── 광고주가 읽을 말 ───────────────────────────────────────────────────────
  // 내부 미술·도형·제작 용어를 광고주 화면 문구에 그대로 쓰지 않는다.
  // 관리자가 규칙을 외우게 하지 않고, 쓰는 순간 화면이 바로 짚어 준다.
  // 긴 말이 먼저다 — 두 낱말짜리 용어가 잡히면 그 안의 한 낱말은 다시 세지 않는다.
  //
  // ★ 목록도 규칙도 여기 없다. 정본은 db/stage_form_contract.json 한 곳뿐이고
  //   stage-form-contract.js 가 그 글자를 그대로 실어 온다. 이 파일은 읽기만 한다.
  function contract() {
    return (root && root.ONECUE_FORM_CONTRACT) || null;
  }

  // 계약을 못 불러왔으면 빈 목록이다. 그 경우 화면은 「막힘」으로 간다 —
  // 검사를 못 하는 상태에서 조용히 통과시키지 않는다(contractReady 참고)
  function bannedTerms() {
    var c = contract();
    return (c && c.banned_terms) || [];
  }

  function contractReady() { return bannedTerms().length > 0; }

  function fields(step) {
    var c = contract();
    var spec = c && c.steps && c.steps[step];
    return (spec && spec.fields) || [];
  }

  function textRule(kind) {
    var c = contract();
    return (c && c.delivery_texts && c.delivery_texts[kind]) || null;
  }

  // 이번 MVP 에서 담당자로 돌릴 수 없는 단계. DB 도 같은 이유로 거절한다
  var HUMAN_BLOCKED = ["facts"];
  function humanAllowed(step) { return HUMAN_BLOCKED.indexOf(step) < 0; }

  // 계약에 구조화 폼이 있는 단계인가. 있으면 사람이 채운 것이 AI 결과와 같은 줄이 된다
  function hasForm(step) { return fields(step).length > 0; }

  // ★ 이번 범위는 「develop 구조화 사람 폼」까지다.
  // 폼이 없는 단계를 담당자로 돌리면 그 단계는 메모만 받는 자리가 된다 —
  // 결과물은 안 생기고 기록만 남는, 바로 그 구조다. 그 확장은 이번 범위가 아니므로
  // 고르는 것 자체를 막는다. 계약에 steps 항목이 생기면 그 단계가 저절로 열린다.
  // 서버(onecue_stage_executor_set)도 같은 계약을 보고 같은 이유로 거절한다.
  function assignable(step) {
    if (!contractReady()) {
      return { ok: false, reason: "contract_missing",
        note: "폼 계약을 불러오지 못했습니다 — 새로고침한 뒤 다시 시도해 주세요" };
    }
    if (!humanAllowed(step)) {
      return { ok: false, reason: "blocked",
        note: "제품·자료 확인은 광고주가 의뢰를 다시 내는 순간 작업이 자동으로 만들어지는 " +
          "단계라, 담당자로 돌려 두면 그 의뢰가 막힙니다. 제품 고정정보 전용 안전 폼이 " +
          "준비되면 그때 열립니다." };
    }
    if (!hasForm(step)) {
      return { ok: false, reason: "out_of_scope",
        note: "이번 범위 아님 — 이 단계는 아직 결과를 받을 칸이 정해지지 않았습니다. " +
          "지금 담당자로 돌리면 결과물 없이 메모만 남게 되므로 열지 않았습니다. " +
          "칸이 정해지면 그때 열립니다." };
    }
    return { ok: true, reason: "", note: "" };
  }

  // ── 검토 결과(review_findings) 의 모양 ──────────────────────────────────────
  // ★ 두 가지 모양이 실제로 관측된다.
  //   (a) 목록  {critical: [...], advisory: [...]}   ← Codex 가 지정한 모양
  //   (b) 개수  {critical: 0, advisory: 8}           ← 지금 산출물에 들어 있는 모양
  // 어느 쪽이 맞는지는 여기서 정하지 않는다. 계약의 accepted_shapes 가 정하고,
  // 이 함수는 둘 다 받아들이되 **어느 모양이었는지 남긴다**.
  // 둘 중 어느 것도 아니면 조용히 빈칸이 되지 않고 ok:false + error 로 드러난다.
  function findingsRule() {
    var c = contract();
    var spec = c && c.executor_report && c.executor_report.review_findings;
    return spec || null;
  }

  function isCount(v) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0;
  }

  // 한 칸의 모양과 개수. 모르는 모양이면 shape 가 "bad" 다
  function findingSlot(v) {
    if (v === undefined || v === null) return { shape: "none", count: 0 };
    if (Array.isArray(v)) return { shape: "list", count: v.length, items: v };
    if (isCount(v)) return { shape: "count", count: v };
    return { shape: "bad", count: 0, seen: typeof v };
  }

  function reviewFindings(executor) {
    var rule = findingsRule();
    function keyLabel(k) { return (rule.key_labels && rule.key_labels[k]) || k; }
    if (!rule) {
      return { present: false, ok: false, shape: "contract_missing",
        error: "검토 결과를 읽는 규칙을 불러오지 못했습니다 — 새로고침해 주세요" };
    }
    var raw = executor && executor.review_findings;
    if (raw === undefined || raw === null) {
      return { present: false, ok: true, shape: "none", critical: 0, advisory: 0 };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { present: true, ok: false, shape: "unknown",
        error: "검토 결과의 모양을 알 수 없습니다 — " +
          rule.keys.map(keyLabel).join(" · ") + " 칸이 있는 묶음이어야 합니다" };
    }
    var accepted = rule.accepted_shapes || [];
    var counts = {}, shapes = [], bad = [];
    rule.keys.forEach(function (k) {
      var slot = findingSlot(raw[k]);
      counts[k] = slot.count;
      if (slot.shape === "bad") { bad.push(keyLabel(k)); return; }
      if (slot.shape === "none") return;
      if (accepted.indexOf(slot.shape) < 0) { bad.push(keyLabel(k)); return; }
      if (shapes.indexOf(slot.shape) < 0) shapes.push(slot.shape);
    });
    if (bad.length) {
      return { present: true, ok: false, shape: "unknown", counts: counts,
        error: bad.join(" · ") + " 칸의 모양이 규칙에 없습니다 — " +
          "허용된 모양은 " + accepted.map(function (s) {
            return (rule.shape_labels && rule.shape_labels[s]) || s;
          }).join(" 또는 ") + " 입니다" };
    }
    if (!shapes.length) {
      return { present: true, ok: false, shape: "empty", counts: counts,
        error: rule.keys.map(keyLabel).join(" · ") + " 값이 하나도 들어 있지 않습니다" };
    }
    var shape = shapes.length > 1 ? "mixed" : shapes[0];
    var out = { present: true, ok: true, shape: shape, shapes: shapes, counts: counts,
      label: rule.label,
      shape_label: (rule.shape_labels && rule.shape_labels[shape]) || shape };
    rule.keys.forEach(function (k) { out[k] = counts[k]; });
    return out;
  }

  // ── 쉬운말 우선, 전문용어는 괄호 병기 ──────────────────────────────────────
  // 관리자 화면에서 전문용어를 없애는 것이 아니다. 쉬운 말을 앞에 쓰고 전문용어를
  // 괄호에 넣는다 — 「쉬운 말(전문용어)」 꼴이다.
  // 글자는 계약에서 온다. 이 파일에도 admin.js 에도 사본이 없다 —
  // 예를 들어 적어 두면 그 예가 곧 목록의 사본이 되므로 적지 않는다.
  function plainFirst(pair) {
    if (!pair || !pair.length) return "";
    return pair[1] ? pair[1] + "(" + pair[0] + ")" : pair[0];
  }

  function plainGlossary(limit) {
    var list = bannedTerms();
    if (limit != null) list = list.slice(0, limit);
    return list.map(plainFirst);
  }

  function lines(text) {
    return String(text == null ? "" : text).split(/\r?\n/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 0; });
  }

  // 사람이 채운 구조화 폼을 계약대로 검사한다. 서버가 같은 계약으로 한 번 더 본다.
  // 돌려주는 것은 사람이 읽을 수 있는 문제 목록이다 — 비어 있으면 통과다
  function checkForm(step, values) {
    var problems = [];
    var list = fields(step);
    if (!list.length) return ["폼 계약을 불러오지 못했습니다 — 새로고침해 주세요"];
    list.forEach(function (f) {
      var v = values ? values[f.key] : undefined;
      if (f.type === "boolean") return;
      var texts;
      if (f.type === "list") {
        texts = Array.isArray(v) ? v.slice() : lines(v);
        if (f.required && texts.length < (f.min_items || 1)) {
          problems.push(f.label + " 은(는) " + (f.min_items || 1) + "줄 이상 적어 주세요");
          return;
        }
        if (texts.length > f.max_items) {
          problems.push(f.label + " 은(는) " + f.max_items + "줄까지만 적을 수 있습니다");
          return;
        }
      } else {
        texts = [String(v == null ? "" : v).trim()];
        if (f.required && !texts[0]) { problems.push(f.label + " 칸을 채워 주세요"); return; }
        if (!texts[0]) return;
      }
      texts.forEach(function (s) {
        if (f.min_length != null && s.length < f.min_length) {
          problems.push(f.label + " 은(는) " + f.min_length + "자 이상이어야 합니다");
        } else if (f.max_length != null && s.length > f.max_length) {
          problems.push(f.label + " 은(는) " + f.max_length + "자를 넘을 수 없습니다");
        }
        if (f.plain_language) {
          jargon(s).forEach(function (h) {
            problems.push(f.label + " 에 내부 용어 「" + h.term + "」 — " + h.plain + " 로 고쳐 주세요");
          });
        }
      });
    });
    return problems;
  }

  function checkText(kind, value) {
    var rule = textRule(kind);
    var problems = [];
    if (!rule) return ["글 계약을 불러오지 못했습니다 — 새로고침해 주세요"];
    var s = String(value == null ? "" : value).trim();
    if (!s) {
      if (rule.required) problems.push(rule.label + " 칸을 채워 주세요");
      return problems;
    }
    if (rule.min_length != null && s.length < rule.min_length) {
      problems.push(rule.label + " 은(는) " + rule.min_length + "자 이상이어야 합니다");
    } else if (rule.max_length != null && s.length > rule.max_length) {
      problems.push(rule.label + " 은(는) " + rule.max_length + "자를 넘을 수 없습니다");
    }
    if (rule.plain_language) {
      jargon(s).forEach(function (h) {
        problems.push(rule.label + " 에 내부 용어 「" + h.term + "」 — " + h.plain + " 로 고쳐 주세요");
      });
    }
    return problems;
  }

  // 「광고주에게 보내기」 직전에 실제로 광고주 눈에 닿을 글만 모은다.
  // AI 가 만든 것도 똑같이 모은다 — 담당자 등록분만 보는 게 아니다
  function advertiserTexts(project) {
    var out = [];
    function push(v) {
      if (v == null) return;
      if (Array.isArray(v)) { v.forEach(push); return; }
      if (typeof v === "object") { Object.keys(v).forEach(function (k) { push(v[k]); }); return; }
      var s = String(v).trim();
      if (s) out.push(s);
    }
    var p = project || {};
    if (p.strategy) push([p.strategy.one_message, p.strategy.insight, p.strategy.usp, p.strategy.tone]);
    (p.concepts || []).forEach(function (c) {
      push([c.title, c.body, c.hook, c.visual, c.risk, c.reco_reason]);
    });
    var d = p.development;
    if (d) push([d.arc, d.copies, d.narration_tone, d.slogan]);
    ORDER.forEach(function (step) {
      var pick = of(p, step);
      if (pick.client_summary) push(pick.client_summary);
    });
    return out;
  }

  // 보내기 게이트 — 걸리는 말이 하나라도 있으면 막는다.
  // 계약을 못 읽었으면 통과시키지 않는다(닫히는 쪽으로 실패한다)
  function sendGate(project) {
    if (!contractReady()) {
      return { ok: false, reason: "contract_missing", hits: [], texts: [] };
    }
    var texts = advertiserTexts(project);
    var seen = {}, hits = [];
    texts.forEach(function (s) {
      jargon(s).forEach(function (h) {
        if (seen[h.term]) return;
        seen[h.term] = true;
        hits.push(h);
      });
    });
    return { ok: hits.length === 0, reason: hits.length ? "jargon" : "", hits: hits, texts: texts };
  }

  function jargon(text) {
    var left = String(text == null ? "" : text);
    var found = [];
    bannedTerms().forEach(function (pair) {
      var at = left.indexOf(pair[0]);
      if (at < 0) return;
      found.push({ term: pair[0], plain: pair[1] });
      // 찾은 자리를 지워 둔다 — 짧은 말이 같은 자리를 다시 잡지 않도록
      while (at >= 0) {
        left = left.slice(0, at) + new Array(pair[0].length + 1).join("\u0000") +
          left.slice(at + pair[0].length);
        at = left.indexOf(pair[0]);
      }
    });
    return found;
  }

  // 서버가 준 줄들을 프로젝트별 { step: row } 로 접는다
  function byProject(rows, projectId) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (r && r.project_id === projectId && ORDER.indexOf(r.step) >= 0) out[r.step] = r;
    });
    return out;
  }

  root.ONECUE_STAGE = {
    ORDER: ORDER, DEFAULT: DEFAULT, index: index, nextStep: nextStep,
    of: of, isHuman: isHuman, performer: performer, reviewer: reviewer,
    editable: editable, waiting: waiting, canDeliver: canDeliver,
    queuesAi: queuesAi, currentHolder: currentHolder, byProject: byProject,
    status: status, jargon: jargon,
    contract: contract, contractReady: contractReady, fields: fields,
    textRule: textRule, lines: lines, checkForm: checkForm, checkText: checkText,
    humanAllowed: humanAllowed, HUMAN_BLOCKED: HUMAN_BLOCKED,
    hasForm: hasForm, assignable: assignable,
    reviewFindings: reviewFindings,
    plainFirst: plainFirst, plainGlossary: plainGlossary,
    advertiserTexts: advertiserTexts, sendGate: sendGate,
    // 화면 도움말이 쓰는 목록. 계약에서 그대로 온다 — 여기 사본은 없다
    get JARGON() { return bannedTerms(); },
  };
})(typeof window !== "undefined" ? window : this);
