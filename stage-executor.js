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
        state: "planned", ai_job_id: null, delivered_at: null, delivered_note: "",
        client_summary: "", plain_language_ok: false };
    }
    return {
      mode: row.mode === "human" ? "human" : "ai",
      assignee: row.assignee || "",
      reviewer_model: row.reviewer_model || "",
      reviewer_note: row.reviewer_note || "",
      state: row.state || "planned",
      // 이 선택이 만든 AI 작업. 있으면 「이미 만들었다」가 사실로 남는다 —
      // 같은 버튼을 두 번 눌러도 두 번째는 작업을 만들지 않는 근거다
      ai_job_id: row.ai_job_id || null,
      delivered_at: row.delivered_at || null,
      // 광고주가 읽을 말과 내부 제작 명세는 끝까지 다른 칸에 있다
      delivered_note: row.delivered_note || "",
      client_summary: row.client_summary || "",
      plain_language_ok: !!row.plain_language_ok,
      // 상태기계가 보는 네 가지 시각. 없으면 null 이고, null 은 「아직 안 했다」다.
      chosen_at: row.chosen_at || null,
      started_at: row.started_at || null,
      approved_at: row.approved_at || null,
      revision_at: row.revision_at || null,
      revision_note: row.revision_note || "",
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

  // ── 한 단계가 지나는 여섯 자리 ──────────────────────────────────────────────
  //
  // 지금까지 이 화면은 선택·실행·결과·검수·단계 이동을 한꺼번에 펼쳐 놓았다.
  // 그래서 지금 무엇을 해야 하는지가 보이지 않았다. 한 단계는 순서가 있고,
  // 그 순서의 어디에 있느냐가 화면에 무엇이 뜰지를 혼자 정한다.
  //
  //   upcoming  아직 오지 않은 단계        — 접힌다. 버튼 없음
  //   choose    누가 맡을지 아직 안 골랐다  — AI / 사람 두 갈래만
  //   start     골랐다, 아직 시작 안 했다   — 시작 버튼 하나.
  //             ★ 고르는 것만으로 작업이 만들어지지 않는다. 눌러야 만들어진다
  //   working   시작했다, 결과가 없다      — 누가·언제·무슨 상태. 버튼 없음
  //   review    결과가 왔다, 승인 전       — 승인 / 수정 요청 둘
  //   approved  승인했다                  — 다음 단계로 이동 하나
  //   past      지나간 단계               — 한 줄 이력
  //
  // 결과가 없으면 승인도 수정도 다음 단계도 없다. 결과 없는 검수 버튼은
  // 누를 것이 없는 버튼이고, 누를 것이 없는 버튼은 화면을 못 믿게 만든다.
  // ── 콘티는 두 겹이다 ───────────────────────────────────────────────────────
  //
  // 글로 된 컷 설계와 그림은 만드는 사람도 다르고(글은 AI 나 작업자, 그림은 시스템)
  // 검수 시점도 다르다. 한 겹으로 뭉뚱그려 놓으니 순서가 보이지 않았다.
  // 절차 정본: agency_site/db/stage_storyboard_flow.md (Dan 지시 2026-09-21)
  //
  //   design.*  컷 설계(글) — 고르기 → 시작 → 작업 중 → 검수
  //   board.*   콘티 그림   — 뽑기 → 뽑는 중 → 검수
  //   final.*   완성 콘티   — 보고 또 고치거나, 승인하면 전송 버튼이 뜬다
  //
  // 가장 최근 판단만 본다. 기록은 쌓이지만 지금 상태는 마지막 한 줄이다.
  function lastReview(project, layer, cut) {
    var rows = (project && project.reviews) || [];
    var want = cut == null ? null : Number(cut);
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.layer !== layer) continue;
      var rn = r.cut_n == null ? null : Number(r.cut_n);
      if (rn !== want) continue;
      if (!best || String(r.decided_at) > String(best.decided_at)) best = r;
    }
    return best;
  }

  function approved(project, layer, cut) {
    var r = lastReview(project, layer, cut);
    return !!(r && r.decision === "ok");
  }

  // 어떤 일이 그 판단보다 **뒤에** 일어났는가. 시각 문자열은 ISO 라 그대로 비교한다.
  function after(when, mark) {
    return !!when && (!mark || String(when) > String(mark));
  }

  function boardPhase(project, counts) {
    var c = counts || {};
    var pick = of(project, "storyboard");
    // ① 글 — 컷이 없거나, 반려당해 다시 써야 하면 여기다.
    //   반려는 「누가 다시 쓸지」부터 다시 묻는다. 같은 사람이 다시 할 수도 있고
    //   AI 가 쓴 것을 사람이 고쳐 쓸 수도 있는데, 그걸 못 고르면 반려가 반쪽이 된다.
    var lastDesign = lastReview(project, "design", null);
    var rework = !!(lastDesign && lastDesign.decision === "revise");
    var since = rework ? lastDesign.decided_at : null;
    if (!c.cuts || rework) {
      // 반려 뒤에 다시 고르고 다시 시작해야 답한 것이다. 반려 **전**의 선택은
      // 그 반려에 대한 답이 아니다 — 그걸 답으로 세면 화면이 그냥 넘어가 버린다.
      if (!after(pick.chosen_at, since)) return "design.choose";
      var running = !!(project.job && project.job.step === "storyboard");
      var started = pick.mode === "human"
        ? after(pick.started_at, since)
        : (after(pick.started_at, since) || (!since && !!pick.ai_job_id) || running);
      if (!started) return "design.start";
      if (running) return "design.working";
      // 다시 쓴 결과가 들어왔으면 다시 검수한다. 컷이 아직 없으면 쓰는 중이다.
      return c.cuts ? "design.review" : "design.working";
    }
    if (!approved(project, "design", null)) return "design.review";
    // ② 그림 — 글이 통과해야 뽑는다. 승인 안 된 글로 뽑으면 다시 뽑게 된다.
    if (!c.board) return c.boardRunning ? "board.working" : "board.make";
    if (!approved(project, "board", null)) return "board.review";
    // ③ 완성 — 보고 또 고칠 수 있다. 승인해야 전송이 뜬다.
    // (3) 완성 — 보고 또 고칠 수 있다. 승인해야 전송이 뜬다.
    //     그리고 **보낸 뒤**는 또 다른 자리다. 여기가 없어서, 이미 보낸 뒤에도
    //     화면이 계속 「콘티 전송」을 권했다. 승인과 전송을 다른 일로 두었으면
    //     보낸 뒤 자리도 있어야 앞뒤가 맞는다.
    if (!approved(project, "final", null)) return "final.review";
    return c.boardSent ? "final.done" : "final.sent";
  }

  // 그 자리에서 눌리는 것. 화면은 이 표를 그리기만 한다.
  function boardActions(project, counts) {
    var at = boardPhase(project, counts);
    var layer = at.split(".")[0];
    return {
      phase: at,
      layer: layer,
      chooseAi: at === "design.choose",
      chooseHuman: at === "design.choose" && humanAllowed("storyboard"),
      start: at === "design.start",
      // 그림 뽑기는 돈이 나가는 자리다. 버튼은 만들되 누르는 때는 Dan 이 정한다.
      make: at === "board.make",
      // 검수는 겹마다 있고, 컷마다도 있다
      review: at === "design.review" || at === "board.review" || at === "final.review",
      perCut: at === "design.review" || at === "board.review",
      // 승인된 컷 글을 계속 띄울 자리인가.
      //
      // 여태 이걸 perCut 으로 갈음했다. 그래서 그림을 뽑는 자리에 가면
      // **무엇을 뽑는 건지가 화면에서 사라졌다.** 컷 글은 그림의 출처인데,
      // 정작 그림을 만들 때 안 보이면 대조할 것이 없다.
      //
      // 가려야 하는 자리는 딱 하나다 — **컷 글을 지금 다시 쓰고 있을 때.**
      // 다시 쓰라고 해 놓고 옛 컷을 나란히 두면 새것을 보는지 옛것을 보는지
      // 알 수 없다. 그 밖에는(그림 뽑기·그림 검수·완성 검수·전송) 전부 띄운다.
      showCuts: at !== "design.choose" && at !== "design.start"
        && at !== "design.working",
      send: at === "final.sent",
      // 보낸 것을 내린다. 고치기로 한 순간 광고주 화면의 옛 콘티는 거짓이 된다.
      unsend: at === "final.done",
      cancel: at === "final.review" || at === "final.sent" || at === "final.done",
    };
  }

  // ── 돈이 나가는 단계 ──────────────────────────────────────────────────────
  //
  // 제작 자료와 영상 제작은 앞 단계들과 길이 같다(고르기 → 시작 → 검수 → 승인).
  // 다만 **시작을 누르는 순간 크레딧이 나간다.** 그래서 두 가지가 더 필요하다:
  //
  //   · 누르기 전에 얼마인지 — 계획(render_plan)에 적힌 값을 읽는다.
  //     화면이 값을 지어내지 않는다. 계획이 없으면 값도 없고, 그러면 누를 수 없다.
  //   · 계획이 먼저 있어야 한다 — 방식(한 판/구간/컷별)에 따라 만들 것이 다르다.
  //     계획 없이 뽑으면 무엇을 몇 장 뽑는지가 그때그때 달라진다.
  var PAID = { anchors: "material", video: "render" };

  function isPaid(step) { return !!PAID[step]; }

  /** 이 단계의 호출 계획과 예상 크레딧. 계획에 있는 것만 읽는다. */
  function planFor(project, step) {
    var plan = (project && project.render_plan) || null;
    if (!plan || !plan.calls) return null;
    // 제작 자료는 앵커가 필요한 호출만, 영상 제작은 생성 호출만 본다.
    var mine = plan.calls.filter(function (c) {
      return step === "anchors"
        ? (c.needs || []).some(function (n) { return n.kind === "anchor"; })
        : c.kind === "generate";
    });
    var credits = mine.reduce(function (a, c) {
      return a + (Number(c.credits_estimate) || 0);
    }, 0);
    var needs = [];
    mine.forEach(function (c) {
      (c.needs || []).forEach(function (n) {
        if (step !== "anchors" || n.kind === "anchor") needs.push(n);
      });
    });
    return { mode: project.render_mode || null, calls: mine,
             credits: credits, needs: needs };
  }

  function phase(project, step, hasResult) {
    if (!project || index(step) < 0) return "upcoming";
    if (index(step) < index(project.step)) return "past";
    if (index(step) > index(project.step)) return "upcoming";
    var pick = of(project, step);
    if (hasResult) return pick.approved_at ? "approved" : "review";
    if (!pick.chosen_at) return "choose";
    // 시작의 증거는 둘 중 하나다 — AI 는 만들어진 작업, 사람은 시작 시각.
    // 작업 큐에 지금 이 단계가 돌고 있으면 그것도 시작이다(기록보다 현실이 먼저다).
    var running = !!(project.job && project.job.step === step);
    var started = pick.mode === "human"
      ? !!pick.started_at
      : (!!pick.ai_job_id || running);
    return started ? "working" : "start";
  }

  // 그 자리에서 **실제로 눌리는 것**. 화면이 이 표를 보고 그린다.
  // 숫자가 아니라 이름으로 둔다 — 테스트가 「승인 1개」가 아니라
  // 「승인이 있고 수정이 있고 다음 단계는 없다」를 잡아야 한다.
  function actions(project, step, hasResult) {
    var at = phase(project, step, hasResult);
    var paid = isPaid(step) ? planFor(project, step) : null;
    return {
      // 돈이 나가는 단계인가, 그리고 얼마인가. 계획이 없으면 null 이고
      // 화면은 「계획이 먼저」라고 말한다 — 값을 지어내지 않는다.
      paid: !!isPaid(step),
      plan: paid,
      // ★ 영상은 12초 한 판이라 앞 3초만 고칠 수 없다. 그래서 「수정 요청」이
      //   사실상 다시 뽑기고, 누를 때마다 같은 값이 또 나간다.
      reviseCostsAgain: step === "video",
      phase: at,
      chooseAi: at === "choose",
      chooseHuman: at === "choose" && humanAllowed(step),
      start: at === "start",
      approve: at === "review",
      revise: at === "review",
      next: at === "approved" && !!nextStep(step),
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

  // ── ★ 실행 주체를 먼저 고른다 (migrate_017) ─────────────────────────────────
  //
  // 예전에는 stage_executors 에 줄이 없으면 「AI」로 보고 그대로 작업 큐에 올렸다.
  // 그건 아무도 묻지 않은 질문에 AI 를 기본 답으로 넣어 둔 것이었다 — 2트랙의
  // 목적과 어긋난다(Dan 지시 2026-09-21). 이제 **고르기 전에는 아무것도 만들지 않는다.**
  //
  // 어느 단계가 묻는가는 계약이 정한다 — 구조화 폼이 있는 단계가 곧 사람이 맡을 수
  // 있는 단계이고, 그 단계만 질문을 던진다. 새 단계에 칸이 생기면 저절로 열린다.
  // SQL 의 onecue_stage_choice_required 와 **같은 한 가지 규칙**이다.
  function choiceRequired(step) {
    if (!contractReady()) return false;
    return hasForm(step);
  }

  // 이 단계가 이 건에서 이미 한 번 돌아간 적이 있는가.
  // 기능이 생기기 전에 끝난 건을 「대기 중」으로 되돌리지 않기 위한 증거다 —
  // 되돌리지도, 다시 돌리지도 않고 수행 기록으로만 보여 준다.
  function ranBefore(project, step) {
    if (!project) return false;
    if (aiRecord(project, step)) return true;
    if (project.job && project.job.step === step) return true;
    var results = project.stageResults || {};
    return !!results[step];
  }

  // SQL onecue_stage_choice_state 와 같은 낱말을 쓴다. 화면과 DB 가 다른 말을
  // 쓰면 「대기」와 「예전에 이미 돌린 것」이 섞인다.
  //   not_required · awaiting · ai_queued · human · legacy_ai · contract_missing
  function choiceState(project, step) {
    if (!contractReady()) return "contract_missing";
    if (!choiceRequired(step)) return "not_required";
    var map = (project && project.stageExecutors) || {};
    var row = map[step];
    if (!row) return ranBefore(project, step) ? "legacy_ai" : "awaiting";
    if (row.mode === "human") return "human";
    // 예전 onecue_stage_executor_set 으로 'ai' 만 적힌 줄은 작업을 만들지 않았다.
    // 답은 있는데 결과가 없는 상태이므로 여전히 기다리는 중이다
    if (row.ai_job_id || ranBefore(project, step)) return "ai_queued";
    // 고른 기록이 있으면 답은 나온 것이다. 시작만 남았다.
    // 이게 없으면 골라도 화면이 계속 「고르세요」라고 해서 같은 선택을 반복하게 된다.
    return row.chosen_at ? "chosen" : "awaiting";
  }

  // 지금 이 건이 관리자 답을 기다리며 멈춰 있는가 — 화면 맨 위에 띄울 것
  function awaitingChoice(project, step) {
    if (!project) return false;
    return choiceState(project, step) === "awaiting" &&
      project.step === step && project.state === "pending";
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
    isPaid: isPaid, planFor: planFor,
    ORDER: ORDER, DEFAULT: DEFAULT, index: index, nextStep: nextStep,
    of: of, isHuman: isHuman, performer: performer, reviewer: reviewer,
    editable: editable, waiting: waiting, canDeliver: canDeliver,
    queuesAi: queuesAi, currentHolder: currentHolder, byProject: byProject,
    status: status, phase: phase, actions: actions,
    boardPhase: boardPhase, boardActions: boardActions,
    lastReview: lastReview, approved: approved, jargon: jargon,
    contract: contract, contractReady: contractReady, fields: fields,
    textRule: textRule, lines: lines, checkForm: checkForm, checkText: checkText,
    humanAllowed: humanAllowed, HUMAN_BLOCKED: HUMAN_BLOCKED,
    hasForm: hasForm, assignable: assignable,
    choiceRequired: choiceRequired, choiceState: choiceState,
    awaitingChoice: awaitingChoice, ranBefore: ranBefore,
    reviewFindings: reviewFindings,
    plainFirst: plainFirst, plainGlossary: plainGlossary,
    advertiserTexts: advertiserTexts, sendGate: sendGate,
    // 화면 도움말이 쓰는 목록. 계약에서 그대로 온다 — 여기 사본은 없다
    get JARGON() { return bannedTerms(); },
  };
})(typeof window !== "undefined" ? window : this);
