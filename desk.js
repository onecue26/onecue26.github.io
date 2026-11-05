// onecue — 제작 관리 (옵션 3 새 의뢰만 · Dan 10-14 「예전 것과 아예 분리해서 보려고」)
//
// 옛 건(옵션 1·2)은 admin.html(제작 관리 · old) 에 그대로 있다. 여기는 production_track = option3 만 읽는다.
// 진행 칸(stage)을 올리면 광고주 6단계 화면의 예상 시간·진행 막대가 따라 바뀐다(briefs.option3.stage).

(function () {
  "use strict";

  var db = null, CAN = false, rows = [], filter = "all";
  var MOODS = { pretty: "기발하고 유쾌하게", bgrade: "크고 시원하게", clean: "깔끔한 정보" };   // 11-01 연출 스타일
  var ASPECT = { "16:9": "유튜브 · 16:9", "9:16": "쇼츠·릴스·틱톡 · 9:16", "4:5": "인스타그램 피드 · 4:5" };
  var STAGES = ["접수", "시장 조사", "기획", "영상 생성", "검수", "완성"];

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(t) { return t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
  function hideTest() { try { return localStorage.getItem("desk_hide_test") !== "0"; } catch (e) { return true; } }   // 시험 건은 기본으로 숨김(10-14 Dan 「실험 11개나 올려놓은 이유」)

  function status(r) { var o = r.o3 || {}; return o.status === "submitted" ? (+o.stage >= 5 ? "done" : "submitted") : "draft"; }


  // ── 480p 드래프트 규칙 (Dan 10-14 「480p 드래프트로 만들고, 만든 시점 기준 5일 안에 확정해 주면 1080p로 업그레이드」) ──
  var DRAFT_DAYS = 5;
  function draftBox(o) {
    var at = o.draft_at ? new Date(o.draft_at) : null, line = "아직 만들지 않았습니다";
    if (at) {
      var due = new Date(at.getTime() + DRAFT_DAYS * 864e5), left = due - Date.now();
      line = "만든 때 " + when(at) + " · 확정 기한 " + when(due) + " · " +
        (o.confirmed_at ? "확정됨(" + when(o.confirmed_at) + ") → 1080p 업그레이드" : left > 0 ? "남은 시간 " + Math.floor(left / 864e5) + "일 " + Math.floor(left % 864e5 / 36e5) + "시간" : "기한 지남 — 480p로 남습니다");
    }
    return '<div class="box"><h4>영상 생성 방식</h4><div style="font-size:13.5px;line-height:1.6"><b>480p 드래프트</b>로 만듭니다. 만든 시점부터 <b>5일 안에 확정</b>되면 <b>1080p로 업그레이드</b>합니다.</div><div class="msg">' + line + "</div></div>";
  }

  // ── Head 가 백단에서 한 것 전부 (option3_reports · 관리자 전용) — 항목마다 접었다 편다 ──
  function secHtml(x, i) {
    var pts = (x.points || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var tb = x.table && x.table.rows ? '<div class="tbw"><table><thead><tr>' + (x.table.head || []).map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      x.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" : "";
    var code = x.code ? "<pre>" + esc(x.code) + "</pre>" : "";
    var src = (x.sources || []).map(function (u) { return '<li><a href="' + esc(u.u) + '" target="_blank" rel="noopener">' + esc(u.t || u.u) + "</a></li>"; }).join("");
    var media = (x.media || []).map(function (m) { return /\.mp4|\.webm/i.test(m.u) ? '<video src="' + esc(m.u) + '" controls preload="none"></video>' : '<a href="' + esc(m.u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(m.u) + '" alt=""></a>'; }).join("");
    return '<details class="rsec"' + (i === 0 ? " open" : "") + "><summary><b>" + esc(x.title) + "</b>" + (x.summary ? "<span>" + esc(x.summary) + "</span>" : "") + "</summary><div class=\"rbody\">" +
      (x.body ? "<p>" + esc(x.body).replace(/\n/g, "<br>") + "</p>" : "") + (pts ? "<ul>" + pts + "</ul>" : "") + tb + code +
      (media ? '<div class="rmedia">' + media + "</div>" : "") + (src ? '<div class="rsrc"><b>출처</b><ul>' + src + "</ul></div>" : "") + "</div></details>";
  }
  // ── 버전 비교 (Dan 10-16 「v1·v2·v3 진행 상황과 결과를 관리자 화면에서」) — report.variants 를 판마다 나란히 ──
  var VST = { prep: "준비 중", wait: "Dan 확인 대기", gen: "생성 중", done: "완료", fail: "실패" };
  function variantsHtml(rp) {
    var vs = (rp && rp.variants) || [];
    if (!vs.length) return "";
    var cells = vs.map(function (v) {
      var vid = (v.media || []).filter(function (m) { return /\.mp4|\.webm/i.test(m.u); })[0];
      var ins = (v.inputs || []).map(function (m) { return '<a href="' + esc(m.u) + '" target="_blank" rel="noopener" title="' + esc(m.t || "") + '"><img loading="lazy" src="' + esc(m.u) + '" alt="' + esc(m.t || "") + '" style="width:64px;height:64px;object-fit:cover;border-radius:6px"></a>'; }).join(" ");
      var blk = (v.blocks || []).map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
      return '<div style="border:1px solid #d9dedb;border-radius:10px;padding:12px;min-width:0;background:#fff;color:#1d2321">' +
        '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:16px">' + esc(v.v) + '</b><span class="bd' + (v.status === "done" ? "" : " sub") + '">' + esc(VST[v.status] || v.status || "") + "</span>" +
        '<span style="color:#5f6a66;font-size:13px">' + esc(v.aspect || "") + (v.credits != null ? " · " + esc(v.credits) + "cr" : "") + "</span></div>" +
        '<div style="font-size:13.5px;margin:6px 0">' + esc(v.method || "") + "</div>" +
        (vid ? '<video src="' + esc(vid.u) + '" controls preload="none" style="width:100%;border-radius:8px;background:#000"></video>' : '<div style="color:#5f6a66">영상 없음</div>') +
        (ins ? '<div style="margin-top:8px"><div style="color:#5f6a66;font-size:12.5px">넣은 그림</div>' + ins + "</div>" : "") +
        (v.note ? '<div style="font-size:13px;margin-top:8px;line-height:1.5">' + esc(v.note) + "</div>" : "") +
        (blk ? '<div style="margin-top:6px"><div style="color:#5f6a66;font-size:12.5px">꼭 막을 것 5개</div><ul style="margin:2px 0 0 16px;padding:0;font-size:12.5px">' + blk + "</ul></div>" : "") +
        (v.prompt ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px;color:#1f6f5c">프롬프트 원문</summary><pre style="white-space:pre-wrap;font-size:12px;background:#f3f4f2;color:#1d2321;padding:8px;border-radius:6px">' + esc(v.prompt) + "</pre></details>" : "") +
        "</div>";
    }).join("");
    return '<div class="rep"><div class="rep-h"><h3>버전 비교</h3><span class="msg">같은 제품 · 방식별 실험</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">' + cells + "</div>" +
      (rp.variants_verdict ? '<div class="msg" style="margin-top:10px">' + esc(rp.variants_verdict) + "</div>" : "") + "</div>";
  }
  function reportHtml(r) {
    var o = r.o3 || {}, rp = r.report;
    if (o.status !== "submitted") return "";
    var vh = variantsHtml(rp);
    if (vh) return vh + reportHtmlInner(r);
    return reportHtmlInner(r);
  }
  function reportHtmlInner(r) {
    var o = r.o3 || {}, rp = r.report;
    if (!rp || !(rp.sections || []).length) return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3></div><div class="msg">생성 요청을 받았습니다 — Head가 시장 조사부터 시작합니다. 준비되는 대로 여기에 올라옵니다.</div></div>';
    var log = (rp.log || []).map(function (l) { return "<tr><td>" + esc(when(l.at)) + "</td><td>" + esc(l.by || "Head") + "</td><td>" + esc(l.what) + "</td></tr>"; }).join("");
    var secs = rp.sections.slice();
    if (log) secs.push({ title: "작업 기록", summary: (rp.log || []).length + "건", _log: log });
    return '<div class="rep"><div class="rep-h"><h3>Head 분석·작업 기록</h3><span class="msg">' + (rp.made_at ? "갱신 " + esc(when(rp.made_at)) : "") + '</span><button type="button" class="btn3" data-allopen>모두 펼치기</button><button type="button" class="btn3" data-allclose>모두 접기</button></div>' +
      secs.map(function (x, i) { return x._log ? '<details class="rsec"><summary><b>작업 기록</b><span>' + esc(x.summary) + '</span></summary><div class="rbody tbw"><table><thead><tr><th>언제</th><th>누가</th><th>무엇을</th></tr></thead><tbody>' + x._log + "</tbody></table></div></details>" : secHtml(x, i); }).join("") + "</div>";
  }

  // 10-19 Dan 「펼쳤을 때 납품 전에 검수받는 영상이 뜨면 맨 위로 — 내려서 메뉴 찾아 보기 힘들게 하지 말고」
  //   report.review_request {video, note, at} 가 있으면 그것, 없으면 분석 항목 중 가장 최근 영상(mp4)을 카드 맨 위에
  function reviewTop(r) {
    var rp = r.report || {}, rq = rp.review_request, v = rq && rq.video, note = rq && rq.note;
    if (!v) {
      (rp.sections || []).forEach(function (x) { (x.media || []).forEach(function (m) { if (/\.mp4|\.webm/i.test(m.u)) v = m.u; }); });
      if (!v) return "";
      note = "분석 기록에 올라온 가장 최근 영상";
    }
    // 10-25 Dan 「광고주가 클릭한 뒤 엔진이 확인 요청을 올리기까지 걸린 시간」 — submitted_at → review_request.at
    var took = "", sa = (r.o3 || {}).submitted_at;
    if (rq && rq.at && sa) {
      var ms = new Date(rq.at).getTime() - new Date(sa).getTime();
      if (ms > 0) { var mi = Math.round(ms / 6e4); took = " · 의뢰부터 " + (mi >= 60 ? Math.floor(mi / 60) + "시간 " + (mi % 60) + "분" : mi + "분") + " 걸림"; }
    }
    return '<div class="box" style="border:2px solid #d4ff3a;margin-bottom:12px"><h4>납품 전 확인 요청' + (rq && rq.at ? " · " + esc(when(rq.at)) : "") + took + '</h4>' +
      hdPair(rp.hd, v) + fbBox(r) +
      (note ? '<div class="msg" style="margin-top:6px">' + esc(note) + "</div>" : "") + deliverBox(r, rq) + hdBox(r, rq) + endcardPick(r) + reviseBox(r) + "</div>";
  }

  // 11-02 Dan 「친구들이 광고 4개씩 만들고, 각 완성본에 피드백을 기재하고 저장」 — 눈에 띄는 색 · 저장하면 엔진이 광고별로 정리해 Dan 에게 보고(option3_feedback_report.py)
  var FB = {}, FB_ON = true;   // 건 id → [{by_name, body, created_at}] · 표가 없으면(DB 적용 전) 칸을 숨김
  var FBC = "#e0115f";
  function fbBox(r) {
    if (!FB_ON) return "";
    var list = (FB[r.id] || []).map(function (f) {
      return '<div style="border-left:4px solid ' + FBC + ';padding:6px 10px;margin:6px 0;background:#fff0f5;border-radius:4px">' +
        '<div style="font-size:12px;color:#666">' + esc(f.by_name || "관리자") + " · " + esc(when(f.created_at)) + "</div>" +
        '<div style="color:' + FBC + ';font-weight:700;white-space:pre-wrap;line-height:1.5">' + esc(f.body) + "</div></div>";
    }).join("");
    return '<div style="margin:12px 0 4px;padding:10px 12px;border:2px solid ' + FBC + ';border-radius:8px;background:#fffafc">' +
      '<div style="color:' + FBC + ';font-weight:800;font-size:15px">시험 피드백' + (list ? " · " + FB[r.id].length + "건" : "") + "</div>" +
      '<div class="msg" style="margin:2px 0 6px">이 완성본을 보고 좋은 점·아쉬운 점·고쳐야 할 점을 적고 저장하세요. 저장하면 광고별로 정리되어 Dan에게 보고됩니다(여러 번 저장해도 됩니다).</div>' +
      list +
      '<textarea data-fb-note="' + r.id + '" rows="3" placeholder="예) 첫 2초가 약해요 · 제품이 실물보다 커 보여요 · 엔드카드 글자가 작아요" style="width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid ' + FBC + ';border-radius:6px;color:' + FBC + ';font-weight:700"></textarea>' +
      '<div style="margin-top:6px"><button type="button" class="btn3" data-fb-save="' + r.id + '" style="background:' + FBC + ';color:#fff;border-color:' + FBC + ';font-weight:800">피드백 저장</button> ' +
      '<span class="msg" data-fb-msg="' + r.id + '"></span></div></div>';
  }

  // 10-27 Dan 「광고주 전달 기능 넣어」 — 우리 검수가 끝나면 이 버튼 = 납품. 지금 확인 요청 영상이 광고주 화면에 완성 영상으로 뜬다(1080p 로 바꿨으면 1080p)
  function deliverBox(r, rq) {
    if (!rq || !rq.video) return "";
    var d = (r.report || {}).delivered, e = (r.report || {}).engine || {};
    var hd = (r.report || {}).hd || {};
    // 11-02 — 1080p로 바꾼 뒤엔 같은 주소라도 광고주 화면엔 예전(480p) 파일이 남아 있다 → 1080p 완성이 전달보다 나중이면 다시 전달 버튼
    if (d && d.video === rq.video && !(hd.state === "done" && hd.at && d.at && new Date(hd.at) > new Date(d.at))) return '<div class="msg" style="margin-top:10px;font-weight:700;color:#1f6f5c">✔ 납품 완료 · ' + esc(when(d.at)) + (d.by ? " · " + esc(d.by) : "") + " — 광고주 화면에 이 영상이 올라갔습니다</div>";
    if (e.state === "running") return "";
    return '<div style="margin-top:10px"><button type="button" class="btn3" data-eng-act="deliver" data-hd="' + (hd.state === "done" ? "1" : "") + '" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") +
      ' style="background:#d4ff3a;color:#111;font-weight:800;border-color:#d4ff3a">최종 컨펌 · 광고주에게 전달</button>' +
      '<div class="msg" style="margin-top:4px">누르면: 위 ' + (hd.state === "done" ? "1080p " : "480p 시안 ") + '영상이 광고주 화면에 완성 영상으로 뜹니다(1분 안). 이 순간이 납품입니다' + (d ? " · 이전에 전달한 판이 있습니다(새 판으로 바뀝니다)" : "") + '.</div><div class="msg" data-eng-msg="' + r.id + '"></div></div>';
  }

  // 11-02 Dan 「1080p로 교체된 거 맞아? 480p와 구분되도록 나란히」 — 1080p를 끝냈으면 이름표 붙여 두 판을 나란히 · 같은 주소라 옛 파일이 안 뜨게 ?hd=
  function hdPair(hd, v) {
    var vid = function (src) { return '<video src="' + esc(src) + '" controls playsinline preload="metadata" style="width:100%;max-height:70vh;background:#000;border-radius:8px"></video>'; };
    if (!(hd && hd.state === "done" && hd.video_480)) return vid(v);
    var one = function (src, tag, sub) {
      return '<div style="min-width:0"><div style="font-weight:800;margin:0 0 4px">' + tag + ' <span style="font-weight:400;color:#666;font-size:13px">' + sub + "</span></div>" + vid(src) + "</div>";
    };
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' + one(v + (v.indexOf("?") < 0 ? "?" : "&") + "hd=" + encodeURIComponent(hd.at || "1"), "1080p", "· 최종 후보 · " + esc(when(hd.at))) +
      one(hd.video_480, "480p 시안", "· 바꾸기 전") + "</div>";
  }

  // 11-02 Dan 「480p 드래프트 버전을 1080p로 바꿀 수 있는 버튼과 기능을 관리자 페이지에」 — 같은 테이크를 1080p로 확정(엔진 hd) · 만든 뒤 5일 안만
  var HD_DAYS = 5, HD_EST = 240;
  var HD_OFF = true;   // 11-02 Dan 「1080p 버튼은 비활성화해 놔. 내가 다시 요청할 때까진 못 하게」 — 켤 때 false (엔진 option3_engine.HD_OFF 도 같이)
  function hdBox(r, rq) {
    if (!rq || !rq.video || /_raw\.mp4/.test(rq.video)) return "";
    var hd = (r.report || {}).hd || {}, e = (r.report || {}).engine || {};
    if (hd.state === "done") return '<div class="msg" style="margin-top:10px;font-weight:700;color:#1f6f5c">✔ 1080p 완성 · ' + esc(when(hd.at)) + ' — 위 영상이 1080p 판입니다' +
      (hd.video_480 ? ' · <a href="' + esc(hd.video_480) + '" target="_blank" rel="noopener">480p 판 보기</a>' : "") + "</div>";
    if (hd.state === "running" || e.state === "running") return hd.state === "running" ? '<div class="msg" style="margin-top:10px">1080p로 바꾸는 중 — 약 ' + esc(hd.est) + 'cr · 끝나면 위 영상이 바뀝니다</div>' : "";
    var left = new Date(rq.at).getTime() + HD_DAYS * 864e5 - Date.now();
    if (!(left > 0)) return '<div class="msg" style="margin-top:10px">1080p 변환 기한(만든 뒤 ' + HD_DAYS + '일)이 지나 480p로 남습니다.</div>';
    var hh = Math.floor(left / 36e5);
    if (HD_OFF) return '<div style="margin-top:10px"><button type="button" class="btn3" disabled style="opacity:.45;cursor:not-allowed">1080p로 바꾸기 · 지금 꺼 둠</button>' +
      '<div class="msg" style="margin-top:4px">1080p 변환은 잠시 꺼 두었습니다(다시 켜 달라고 하실 때까지). 남은 기한 ' + (hh >= 24 ? Math.floor(hh / 24) + "일 " + (hh % 24) + "시간" : hh + "시간") + '.</div></div>';
    return '<div style="margin-top:10px"><button type="button" class="btn3" data-eng-act="hd" data-est="' + (hd.est || HD_EST) + '" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") +
      '>1080p로 바꾸기 · 약 ' + (hd.est || HD_EST) + 'cr</button>' +
      '<div class="msg" style="margin-top:4px">누르면: 위 480p 시안과 같은 장면을 1080p로 확정하고 엔드카드를 다시 얹어 이 자리에 올립니다(10~20분 · 15초 기준 약 ' + HD_EST + 'cr). 새로 뽑는 것이 아니라 장면은 그대로입니다. ' +
      (hd.state === "failed" ? "지난번 시도가 멈췄습니다 — 이유는 위 엔진 칸에 있습니다. " : "") + '남은 기한 ' + (hh >= 24 ? Math.floor(hh / 24) + "일 " + (hh % 24) + "시간" : hh + "시간") + '.</div><div class="msg" data-eng-msg="' + r.id + '"></div></div>';
  }

  // 10-27 — 광고주 화면과 같은 기준: 「영상 생성 시작」 시각부터 24시간 · 납품(최종 컨펌)까지. 2시간 미만 주황 · 1시간 미만 빨강
  var DUE_MS = 24 * 3600 * 1000;
  function dueChip(o) { if (typeof VIEW !== "undefined" && VIEW) return "";   // 11-05 시험 건은 납품 기한 없음

    if (o.status !== "submitted" || !o.submitted_at) return "";
    if (o.delivered_at) return '<span class="bd" style="color:#1f6f5c;border-color:#1f6f5c">납품 완료</span>';
    return '<span class="bd" data-due="' + (new Date(o.submitted_at).getTime() + DUE_MS) + '"></span>';
  }
  function paintDue() {
    document.querySelectorAll("[data-due]").forEach(function (x) {
      var left = +x.dataset.due - Date.now(), a = Math.abs(left), p2 = function (n) { return String(n).padStart(2, "0"); };
      var t = Math.floor(a / 36e5) + ":" + p2(Math.floor(a % 36e5 / 6e4)) + ":" + p2(Math.floor(a % 6e4 / 1e3));
      x.textContent = left > 0 ? "납품까지 " + t : "기한 지남 " + t;
      var c = left <= 36e5 ? "#b42318" : left <= 72e5 ? "#c4620a" : "";
      x.style.color = c ? "#fff" : ""; x.style.background = c; x.style.borderColor = c;
    });
  }

  // 10-24 Dan 「순수하게 원큐 시스템 상에서」 — 엔진 시작 · 생성 승인 · 진행 상태 (option3_engine.py 가 report.engine 에 적음)
  var ENG = { running: "도는 중", awaiting_approval: "생성 승인 기다림", done: "끝남", failed: "멈춤" };
  function engineBox(r) {
    if (status(r) === "draft") return "";
    var e = (r.report || {}).engine || {};
    // 10-25 그래놀라 — 엔진을 관리 화면 밖에서 돌린 건은 engine 칸이 비어 「엔진 시작」이 보였다 → 확인 요청이 있으면 끝난 건
    if (!e.state && (r.report || {}).review_request) e = { state: "done", label: "완성 — 위 「납품 전 확인 요청」을 보세요" };
    var head = e.state ? "<b>엔진 · " + esc(ENG[e.state] || e.state) + "</b> — " + esc(e.label || "") + (e.at ? " · " + esc(when(e.at)) : "") : "<b>엔진 · 아직 돌리지 않음</b>";
    // 10-26 Dan 「버튼을 더 잘 알아보게 — 나도 실수로 눌렀고 친구도 뭔지 궁금해함」 — 왜 여기 있는지·누르면 무엇이 되는지 한 줄씩
    var why = !e.state ? "광고주가 「영상 생성 시작」을 눌렀지만 엔진이 아직 돌지 않은 건입니다(자동 실행이 꺼져 있었거나 횟수 제한)."
      : e.state === "failed" ? "엔진이 중간에 멈춘 건입니다. 이유는 위 줄에 있습니다."
      : e.state === "awaiting_approval" ? "기획이 끝났습니다. 아래 요약을 보고 괜찮으면 승인하세요. 승인하면 그림·영상을 만들고 크레딧이 듭니다." : "";
    var what = !e.state || e.state === "failed" ? "누르면: 이 건을 처음부터 설계합니다(브리프 → 카드 고르기 → 기획 · 20~30분 · 크레딧 0). 끝나면 「생성 승인」 버튼이 뜨고, 승인 전에는 아무것도 생성하지 않습니다." : "";
    var sum = (e.summary || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var btn = "";
    if (e.state === "awaiting_approval") btn = '<button type="button" class="btn3" data-eng-act="approve" data-est="' + esc(e.est) + '" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") + ">생성 승인 · 약 " + esc(e.est) + "cr</button>";
    else if (!e.state || e.state === "failed") btn = '<button type="button" class="btn3" data-eng-act="design" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") + ">" + (e.state ? "이 건 다시 설계하기" : "이 건 설계 시작하기") + " (크레딧 0)</button>";
    if (why) head += '<div class="msg" style="margin-top:6px">' + why + "</div>";
    if (what) head += '<div class="msg" style="margin-top:4px">' + what + "</div>";
    var tone = !e.state ? "border:2px dashed #b8860b;background:#fffbea" : e.state === "failed" ? "border:2px solid #b42318;background:#fff5f4"
      : e.state === "awaiting_approval" ? "border:2px solid #d4ff3a" : "border:1px solid #ccc";
    return '<div class="box" style="margin-bottom:12px;' + tone + '"><div>' + head + "</div>" +
      (e.state === "running" ? '<div class="msg">끝나면 이 칸이 저절로 바뀝니다(30초마다 확인)</div>' : "") +
      (e.extra ? '<div class="msg">' + esc(e.extra) + "</div>" : "") +
      (sum ? '<ul style="margin:8px 0 0 18px">' + sum + "</ul>" : "") +
      (btn ? '<div style="margin-top:8px">' + btn + "</div>" : "") + '<div class="msg" data-eng-msg="' + r.id + '"></div></div>';
  }

  // 10-24 Dan 「검수한 뒤 고치는 요청을 엔진에」 — 고칠 곳 하나 + 메모 → 엔진이 그 범위만 다시(유료면 승인 뒤)
  var SCOPES = [["ending", "엔드컷·글자", "크레딧 0"], ["brand", "로고·문구", "크레딧 0"], ["video", "영상만 다시", "약 45cr · 승인 뒤"], ["plan", "기획부터 다시", "승인 뒤 생성"]];
  function reviseBox(r) {
    var e = (r.report || {}).engine || {};
    if (e.state === "running") return '<div class="msg" style="margin-top:10px">엔진이 도는 중이라 고치기 요청은 끝난 뒤에 할 수 있습니다</div>';
    var opts = SCOPES.map(function (s) {
      return '<label style="display:inline-flex;gap:4px;align-items:center;margin:0 14px 4px 0"><input type="radio" name="rv-' + r.id + '" value="' + s[0] + '"> ' + s[1] + ' <small class="msg">(' + s[2] + ")</small></label>";
    }).join("");
    return '<div style="margin-top:12px;border-top:1px solid #444;padding-top:10px"><b>고치기 요청</b><div style="margin:6px 0">' + opts + "</div>" +
      '<textarea data-rv-note="' + r.id + '" rows="2" placeholder="무엇이 문제인지 적어 주세요 (예: 3초쯤 손가락이 이상함 · 너무 어두움)" style="width:100%;box-sizing:border-box"></textarea>' +
      '<div style="margin-top:6px"><button type="button" class="btn3" data-rv-send="' + r.id + '"' + (CAN ? "" : " disabled") + ">고치기 요청</button></div>" +
      '<div class="msg" data-rv-msg="' + r.id + '"></div></div>';
  }

  // 10-20 Dan 「후작업 6개 사진을 올려서, 그중에 선택 누르고 수정하면 다시 주는」 — 엔진이 그려 둔 엔드컷 후보 · 고르면 코드가 바로 바꿈
  function endcardPick(r) {
    var ec = (r.report || {}).endcard, os = (ec && ec.options) || [];
    if (!os.length) return "";
    var cells = os.map(function (o) {
      var on = o.n === ec.pick;
      return '<div style="border:2px solid ' + (on ? "#d4ff3a" : "transparent") + ';border-radius:8px;padding:4px;min-width:0">' +
        '<a href="' + esc(o.video) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(o.img) + '" alt="" style="width:100%;border-radius:6px;display:block"></a>' +
        '<div style="font-size:12.5px;margin:4px 0">' + o.n + ". " + esc(o.name) + (on ? " · <b>지금 판</b>" : "") + "</div>" +
        (on ? "" : '<button type="button" class="btn3" data-ec-pick="' + o.n + '" data-pid="' + r.id + '"' + (CAN ? "" : " disabled") + ">이 안으로</button>") + "</div>";
    }).join("");
    return '<details style="margin-top:10px"' + (ec.by === "관리자" ? "" : " open") + '><summary style="cursor:pointer;font-weight:700">엔드컷 후보 ' + os.length + "개 — " + (ec.by === "관리자" ? "관리자가 " : "엔진이 ") + ec.pick + "번 선택</summary>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px">' + cells + "</div>" +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input data-ec-note="' + r.id + '" placeholder="수정 요청 (예: 로고 조금 작게)" style="flex:1;min-width:200px">' +
      '<button type="button" class="btn3" data-ec-fix="' + r.id + '"' + (CAN ? "" : " disabled") + ">수정 요청</button></div>" +
      '<div class="msg" data-ec-msg="' + r.id + '"></div></details>';
  }

  // 10-20 Dan 「예전 것은 old 로 해서 밑에서 접어서 내리고」 — 다시 만든 건의 지난 판(확인 요청)을 카드 맨 아래 접는 칸으로
  function oldRuns(r) {
    var h = (r.report || {}).history || [];
    if (!h.length) return "";
    return '<details class="box" style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">이전 판 ' + h.length + "개 — 펼치기</summary>" +
      h.slice().reverse().map(function (x) {
        return '<div style="margin-top:10px"><div class="msg">' + esc(x.label || "") + (x.at ? " · " + esc(when(x.at)) : "") + "</div>" +
          (x.video ? '<video src="' + esc(x.video) + '" controls playsinline preload="none" style="width:100%;max-height:50vh;background:#000;border-radius:8px"></video>' : "") +
          (x.note ? '<div class="msg" style="margin-top:4px">' + esc(x.note) + "</div>" : "") + "</div>";
      }).join("") + "</details>";
  }

  // 10-20 Dan 「건 하나 누르면 항목이 너무 많다 — 결과물 포함 관리자가 보는 필수만 남기고 나머지는 묶어서 접어」
  //   펼치면: 결과 영상 · 의도 · 문제 · 크레딧 · 확정 기한 — 나머지(의뢰서·진행 단계·분석 전부·버전 비교)는 「세부」 하나에
  function essHtml(r, o) {
    var rp = r.report || {}, e = rp.essentials || {}, secs = rp.sections || [];
    var find = function (re) { var x = secs.filter(function (s) { return re.test(s.title || ""); }).pop(); return x ? (x.summary || "") : ""; };
    var idea = e.idea || find(/기획|아이디어/), prob = e.problem || find(/검수|문제/), cr = e.credits || find(/크레딧|비용/);
    var due = "";
    if (o.confirmed_at) due = "확정됨 → 1080p";
    else if (o.draft_at) { var left = new Date(o.draft_at).getTime() + DRAFT_DAYS * 864e5 - Date.now(); due = left > 0 ? Math.floor(left / 864e5) + "일 " + Math.floor(left % 864e5 / 36e5) + "시간 남음" : "기한 지남(480p)"; }
    var row = function (k, v) { return "<dt>" + k + "</dt><dd" + (v ? "" : ' class="miss"') + ">" + (v ? esc(v) : "없음") + "</dd>"; };
    return '<dl class="kv" style="margin-bottom:12px">' + row("의도", idea) + row("문제", prob) + row("크레딧", cr) + row("확정 기한", due) + "</dl>";
  }

  function card(r) {
    var o = r.o3 || {}, st = status(r), stage = Math.max(0, +o.stage || 0);
    var badge = st === "draft" ? '<span class="bd draft">작성 중 · ' + (o.step || 1) + "단계</span>"
      : st === "done" ? '<span class="bd">완성</span>' : '<span class="bd sub">생성 요청 · ' + STAGES[stage] + "</span>";
    function kv(k, v) { return "<dt>" + k + "</dt><dd" + (v ? "" : ' class="miss"') + ">" + (v || "비어 있음") + "</dd>"; }
    var photos = (r.photos || []).map(function (p) {
      return '<a href="' + esc(p.url || "#") + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(p.url || "") + '" alt=""><span>' + (p.w || "?") + "×" + (p.h || "?") + "</span></a>";
    }).join("");
    var stg = STAGES.map(function (s, i) {
      return '<button type="button" data-stage="' + i + '" data-pid="' + r.id + '" class="' + (st === "draft" ? "" : i < stage ? "done" : i === stage ? "now" : "") + '"' + (CAN && st !== "draft" ? "" : " disabled") + ">" + s + "</button>";
    }).join("");
    return '<details class="card' + (st === "submitted" ? " sub" : "") + '" data-slug="' + esc(r.slug) + '"><summary>' +
      '<div class="nm"><b>' + esc(o.brand || r.brand) + "</b> · " + esc(o.product || r.product) + "<small>" + (r.who ? "의뢰인 " + esc(r.who.name || "") + (r.who.email ? " (" + esc(r.who.email) + ")" : "") + " · " : "") + esc(r.slug) + " · 만든 때 " + when(r.created_at) + (o.submitted_at ? " · 요청 " + when(o.submitted_at) : "") + "</small></div>" +
      '<div class="badges">' + dueChip(o) + badge + (r.test_label ? '<span class="bd test">' + esc(r.test_label) + "</span>" : "") + "</div></summary>" +
      '<div class="body">' + engineBox(r) + reviewTop(r) + essHtml(r, o) +
      '<details class="box rsec" style="max-width:none"><summary style="cursor:pointer"><b>세부</b><span class="msg"> 의뢰서·진행 단계·조사·기획·프롬프트·작업 기록</span></summary><div class="grid2"><dl class="kv">' +
      kv("상호·브랜드", esc(o.brand)) + kv("제품 종류", esc(o.kind)) + kv("제품 이름", esc(o.product)) + kv("특장점", esc(o.point)) +
      kv("연출 스타일", esc(MOODS[o.mood] || "")) + kv("화면 비율", esc(ASPECT[o.aspect] || "")) + kv("영상 길이", "15초 · 1편") +
      kv("추가 정보", o.url ? '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + esc(o.url) + "</a>" + (o.url_ok ? " ✓" : " (확인 안 됨)") : "") +
      "<dt>사진</dt><dd>" + (photos ? '<div class="ph">' + photos + "</div>" : '<span class="miss">없음</span>') + "</dd>" +
      '</dl><div style="display:grid;gap:12px;align-content:start">' +
      '<div class="box"><h4>진행 단계 — 누르면 광고주 화면의 예상 시간이 바뀝니다</h4><div class="stg">' + stg + "</div>" +
      (o.stage_at ? '<div class="msg">' + when(o.stage_at) + " 변경</div>" : "") + "</div>" +
      draftBox(o) +
      '<div class="links"><a class="btn3" href="new3.html?p=' + encodeURIComponent(r.slug) + '" target="_blank" rel="noopener">광고주 화면 보기 ↗</a></div>' +
      "</div></div>" + reportHtml(r) + "</details>" + oldRuns(r) + "</div></details>";
  }

  function render() {
    var ht = hideTest();
    var base = rows.filter(function (r) { return VIEW || !(ht && r.test_label); });
    el("sAll").textContent = base.length;
    el("sSub").textContent = base.filter(function (r) { return status(r) === "submitted"; }).length;
    el("sDraft").textContent = base.filter(function (r) { return status(r) === "draft"; }).length;
    el("sDone").textContent = base.filter(function (r) { return status(r) === "done"; }).length;
    var show = base.filter(function (r) { return filter === "all" || status(r) === filter; });
    // 10-15 Dan 「새로고침 꼭 해야 해?」 — 30초마다 다시 그려도 펼쳐 둔 카드·항목은 그대로
    var openCards = {}, openSecs = {}, typed = {}, picked = {};
    el("list").querySelectorAll("details.card[open]").forEach(function (d) { openCards[d.dataset.slug] = 1; });
    el("list").querySelectorAll("[data-rv-note]").forEach(function (t) { if (t.value) typed[t.dataset.rvNote] = t.value; });
    el("list").querySelectorAll("[data-fb-note]").forEach(function (t) { if (t.value) typed["fb" + t.dataset.fbNote] = t.value; });   // 고치기 메모는 다시 그려도 남긴다
    el("list").querySelectorAll('input[name^="rv-"]:checked').forEach(function (x) { picked[x.name] = x.value; });
    el("list").querySelectorAll("details.card .rsec").forEach(function (d) { var c = d.closest("details.card"); openSecs[c.dataset.slug + "|" + d.querySelector("summary b").textContent] = d.open; });
    var restore = function () {
      el("list").querySelectorAll("details.card").forEach(function (d) {
        if (openCards[d.dataset.slug]) d.open = true;
        d.querySelectorAll(".rsec").forEach(function (x) { var k = d.dataset.slug + "|" + x.querySelector("summary b").textContent; if (k in openSecs) x.open = openSecs[k]; });
      });
      el("list").querySelectorAll("[data-rv-note]").forEach(function (t) { if (typed[t.dataset.rvNote]) t.value = typed[t.dataset.rvNote]; });
      el("list").querySelectorAll("[data-fb-note]").forEach(function (t) { if (typed["fb" + t.dataset.fbNote]) t.value = typed["fb" + t.dataset.fbNote]; });
      Object.keys(picked).forEach(function (n) { var x = el("list").querySelector('input[name="' + n + '"][value="' + picked[n] + '"]'); if (x) x.checked = true; });
    };
    setTimeout(restore, 0);
    setTimeout(paintDue, 0);
    el("list").innerHTML = show.length ? '<div style="display:grid;gap:10px">' + show.map(card).join("") + "</div>"
      : '<div class="empty">표시할 의뢰가 없습니다.</div>';
  }

  function patch(pid, add) {
    var r = rows.filter(function (x) { return x.id === pid; })[0]; if (!r) return Promise.resolve();
    var next = Object.assign({}, r.o3 || {}, add);
    return db.from("briefs").update({ option3: next }).eq("project_id", pid).then(function (x) {
      if (x.error) throw x.error;
      r.o3 = next; render();
    });
  }

  // 사진 — 서명 주소는 한 번 받아 쓴다(전송량 · 09-29)
  var PH = {};   // 사진 id → {url,w,h} — 한 번 받은 서명 주소는 다시 받지 않는다(30초 갱신 · 전송량)
  function photos(list) {
    var ids = [], byId = {};
    var put = function () { list.forEach(function (r) { r.photos = ((r.o3 || {}).photos || []).map(function (id) { return PH[id] || null; }).filter(Boolean); }); };
    list.forEach(function (r) { ((r.o3 || {}).photos || []).forEach(function (id) { if (!PH[id]) ids.push(id); }); });
    if (!ids.length) { put(); return Promise.resolve(); }
    return db.from("assets").select("id,storage_path,meta").in("id", ids).then(function (a) {
      var rs = a.data || [];
      rs.forEach(function (x) { byId[x.id] = x; });
      return db.storage.from("uploads").createSignedUrls(rs.map(function (x) { return x.storage_path; }), 6 * 3600);
    }).then(function (s) {
      var u = {}; ((s && s.data) || []).forEach(function (x) { u[x.path] = x.signedUrl; });
      Object.keys(byId).forEach(function (id) { var x = byId[id]; PH[id] = { url: u[x.storage_path], w: (x.meta || {}).w, h: (x.meta || {}).h }; });
      put();
    });
  }

  var SIG = "";
  var ARCH = (new URLSearchParams(location.search).get("archive") || "").replace(/[^a-z0-9_]/g, "");
  // 11-05 Dan 「테스트 페이지를 따로 안에 관리자만 볼 수 있게 — 리스트 따로 옮기는 귀찮음이 적고 한 번에」 — 시험 건(test_label)은 desk.html?view=test 에서만
  var VIEW = (new URLSearchParams(location.search).get("view") || "") === "test";
  if (VIEW) {
    var th1 = document.querySelector(".dk-head h1"), thp = document.querySelector(".dk-head h1 + p");
    if (th1) th1.textContent = "시험";
    if (thp) thp.textContent = "엔진 시험으로 만든 영상입니다(관리자만). 영상을 보고 아래 「피드백 저장」에 리뷰·고칠 점을 적어 주세요 — Head가 받아 원인과 개선안을 정리해 보고합니다. 제작 관리 목록에는 나오지 않습니다.";
    var htl = document.getElementById("hideTest"); if (htl && htl.parentNode) htl.parentNode.style.display = "none";
  }
  if (ARCH) {
    var h1 = document.querySelector(".dk-head h1"), hp = document.querySelector(".dk-head h1 + p");
    if (h1) h1.textContent = "엔진 v2 보관";
    if (hp) hp.textContent = "엔진 v3로 바꾸기 전(11-05까지) 시험한 건입니다. 지우지 않고 여기 모아 두었습니다 — 제작 관리 목록에는 나오지 않습니다.";
  }
  function load(first) {
    return db.from("projects").select("id,slug,brand,product,created_at,updated_at,test_label,client_id").eq("production_track", "option3").order("created_at", { ascending: false })
      .then(function (r) {
        if (r.error) throw r.error;
        rows = r.data || [];
        if (!rows.length) return;
        return db.from("briefs").select("project_id,option3").in("project_id", rows.map(function (x) { return x.id; })).then(function (b) {
          var m = {}; (b.data || []).forEach(function (x) { m[x.project_id] = x.option3 || {}; });
          rows.forEach(function (x) { x.o3 = m[x.id] || {}; });
          // 11-05 Dan 「새 엔진으로 새롭게 테스트할 거라 리스트에서 빼되 나중에 볼 수 있게」 — briefs.option3.archived 가 붙은 건은
          //   기본 목록에서 빼고, desk.html?archive=<그 값>(왼쪽 「엔진 v2 보관」)에서만 보인다. 지우지 않음 · 표시만 지우면 원래대로
          rows = rows.filter(function (x) { return ARCH ? x.o3.archived === ARCH : (!x.o3.archived && (VIEW ? !!x.test_label : !x.test_label)); });
          if (!rows.length) return;
          return db.from("option3_reports").select("project_id,report").in("project_id", rows.map(function (x) { return x.id; }));
        }).then(function (rr) {
          // 10-19 Dan 「관리 페이지 프로젝트에 의뢰인 이름이 나오면 좋겠어」 — 건 → 의뢰 회사(clients) → 그 계정(profiles)
          var cids = rows.map(function (x) { return x.client_id; }).filter(Boolean);
          return db.from("clients").select("id,owner_id").in("id", cids).then(function (c) {
            var own = {}; (c.data || []).forEach(function (x) { own[x.id] = x.owner_id; });
            var uids = Object.keys(own).map(function (k) { return own[k]; }).filter(Boolean);
            return db.from("profiles").select("id,name,email").in("id", uids).then(function (pf) {
              var who = {}; (pf.data || []).forEach(function (x) { who[x.id] = x; });
              rows.forEach(function (x) { x.who = who[own[x.client_id]] || null; });
              return rr;
            });
          });
        }).then(function (rr) {
          var m2 = {}; ((rr && rr.data) || []).forEach(function (x) { m2[x.project_id] = x.report; });
          rows.forEach(function (x) { x.report = m2[x.id] || null; });
          return db.from("option3_feedback").select("project_id,by_name,body,created_at").in("project_id", rows.map(function (x) { return x.id; })).order("created_at").then(function (fb) {
            FB_ON = !fb.error; FB = {};
            ((fb && fb.data) || []).forEach(function (f) { (FB[f.project_id] = FB[f.project_id] || []).push(f); });
          });
        }).then(function () {
          rows.sort(function (a, b) { return (b.o3.submitted_at || b.created_at) > (a.o3.submitted_at || a.created_at) ? 1 : -1; });
          return photos(rows);
        });
      }).then(function () {
        var sig = JSON.stringify(rows.map(function (x) { return [x.id, x.test_label, x.o3, x.report, FB[x.id]]; }));
        if (sig === SIG) return;
        SIG = sig;
        render();
        if (!first) return;
        // 텔레그램 링크(desk.html?p=건) — 그 건만 펼치고 그 자리로
        var want = new URLSearchParams(location.search).get("p");
        if (want && !VIEW && !ARCH && !rows.some(function (x) { return x.slug === want; })) {   // 시험 건 링크(텔레그램)면 시험 보기로
          db.from("projects").select("slug,test_label").eq("slug", want).maybeSingle().then(function (t) {
            if (t.data && t.data.test_label) location.replace("desk.html?view=test&p=" + encodeURIComponent(want));
          });
          return;
        }
        if (want) {
          var c = el("list").querySelector('[data-slug="' + want.replace(/"/g, "") + '"]');
          if (!c && rows.some(function (x) { return x.slug === want && x.test_label; })) { el("hideTest").checked = false; try { localStorage.setItem("desk_hide_test", "0"); } catch (e) {} render(); c = el("list").querySelector('[data-slug="' + want.replace(/"/g, "") + '"]'); }
          if (c) { c.open = true; c.scrollIntoView({ block: "start" }); }
        }
      });
  }

  function wire() {
    el("tools").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return;
      filter = b.dataset.f;
      el("tools").querySelectorAll("[data-f]").forEach(function (x) { x.classList.toggle("on", x === b); });
      render();
    });
    el("hideTest").checked = hideTest();
    el("hideTest").addEventListener("change", function () { try { localStorage.setItem("desk_hide_test", el("hideTest").checked ? "1" : "0"); } catch (e) {} render(); });
    el("list").addEventListener("click", function (e) {
      var ao = e.target.closest("[data-allopen],[data-allclose]");
      if (ao) { var open = ao.hasAttribute("data-allopen"); ao.closest(".rep").querySelectorAll(".rsec").forEach(function (d) { d.open = open; }); return; }
      var ep = e.target.closest("[data-ec-pick],[data-ec-fix]");
      if (ep && !ep.disabled) {
        var pid = ep.dataset.pid || ep.dataset.ecFix, inp = el("list").querySelector('[data-ec-note="' + pid + '"]'), nt = inp ? (inp.value || "").trim() : "";
        var pk = ep.dataset.ecPick ? +ep.dataset.ecPick : null, m = el("list").querySelector('[data-ec-msg="' + pid + '"]');
        if (!pk && !nt) { if (m) m.textContent = "수정할 내용을 적어 주세요"; return; }
        ep.disabled = true;
        // 10-25 Dan — 엔드컷 메모 수정은 Head 알림 대신 엔진 「엔드컷·글자 고치기」(크레딧 0)로 · 후보 고르기는 그대로 코드가 바로 바꿈
        var call = pk ? db.rpc("onecue_option3_endcard", { p_project_id: pid, p_pick: pk, p_note: nt || null })
                      : db.rpc("onecue_option3_engine", { p_project_id: pid, p_action: "revise", p_scope: "ending", p_note: nt });
        call.then(function (x) {
          if (x.error) throw x.error;
          if (m) m.textContent = pk ? "바꾸는 중입니다 — 1분 안에 위 영상이 바뀝니다" : "엔진이 엔드컷을 고쳐서 다시 올립니다(크레딧 0)";
          setTimeout(function () { load(false).catch(function () {}); }, 20000);
        }).catch(function (x) { ep.disabled = false; if (m) m.textContent = "보내지 못했습니다 — " + (x.message || x); });
        return;
      }
      var fs = e.target.closest("[data-fb-save]");
      if (fs && !fs.disabled) {
        var fpid = fs.dataset.fbSave, fta = el("list").querySelector('[data-fb-note="' + fpid + '"]'), fm = el("list").querySelector('[data-fb-msg="' + fpid + '"]');
        var fbody = fta ? (fta.value || "").trim() : "";
        if (!fbody) { if (fm) fm.textContent = "피드백 내용을 적어 주세요"; return; }
        fs.disabled = true;
        db.rpc("onecue_option3_feedback", { p_project_id: fpid, p_body: fbody }).then(function (x) {
          if (x.error) throw x.error;
          fta.value = ""; fs.disabled = false;
          return load(false).then(function () { var m3 = el("list").querySelector('[data-fb-msg="' + fpid + '"]'); if (m3) m3.textContent = "저장했습니다 — Dan에게 정리해서 보고됩니다"; });
        }).catch(function (x) { fs.disabled = false; if (fm) fm.textContent = "저장하지 못했습니다 — " + (x.message || x); });
        return;
      }
      var eb = e.target.closest("[data-eng-act],[data-rv-send]");
      if (eb && !eb.disabled) {
        var epid = eb.dataset.pid || eb.dataset.rvSend, act = eb.dataset.engAct || "revise", sc = null, rn = null;
        var em = el("list").querySelector('[data-eng-msg="' + epid + '"]');
        if (act === "revise") {
          var ck = el("list").querySelector('input[name="rv-' + epid + '"]:checked'), ta = el("list").querySelector('[data-rv-note="' + epid + '"]');
          em = el("list").querySelector('[data-rv-msg="' + epid + '"]');
          sc = ck ? ck.value : null; rn = ta ? (ta.value || "").trim() : "";
          if (!sc || !rn) { if (em) em.textContent = "고칠 곳을 고르고 무엇이 문제인지 적어 주세요"; return; }
        }
        if (act === "design" && !confirm("이 건을 처음부터 다시 설계합니다(크레딧 0 · 20~30분). 진행할까요?")) return;
        if (act === "approve" && !confirm("영상을 생성합니다 — 약 " + eb.dataset.est + "cr을 씁니다. 진행할까요?")) return;
        if (act === "hd" && !confirm("1080p로 바꿉니다 — 약 " + eb.dataset.est + "cr을 씁니다(같은 장면 확정). 진행할까요?")) return;
        if (act === "deliver" || act === "hd") em = eb.parentNode.querySelector("[data-eng-msg]");   // 엔진 칸에도 같은 표시 자리가 있어 버튼 옆 것으로
        // 11-02 Dan — 1080p 로 바꾼 건은 1080p 로 전달 · 안 바꾼 건만 「480p 로 전달할까요?」 묻는다
        if (act === "deliver" && !confirm(eb.dataset.hd ? "광고주에게 1080p 최종본을 보냅니다 — 확인 요청의 1080p 영상이 광고주 화면에 완성 영상으로 뜹니다. 진행할까요?" : "아직 1080p로 바꾸지 않은 480p 시안입니다. 1080p 변환 없이 480p로 광고주에게 전달할까요?" + (HD_OFF ? "" : " (1080p로 보내려면 취소하고 「1080p로 바꾸기」를 먼저 누르세요)"))) return;
        eb.disabled = true;
        db.rpc("onecue_option3_engine", { p_project_id: epid, p_action: act, p_scope: sc, p_note: rn || null }).then(function (x) {
          if (x.error) throw x.error;
          if (em) em.textContent = "보냈습니다 — 엔진이 받는 대로 위 상태가 바뀝니다";
          setTimeout(function () { load(false).catch(function () {}); }, 8000);
        }).catch(function (x) { eb.disabled = false; if (em) em.textContent = "보내지 못했습니다 — " + (x.message || x); });
        return;
      }
      var s = e.target.closest("[data-stage]");
      if (s && !s.disabled) { e.preventDefault(); patch(s.dataset.pid, { stage: +s.dataset.stage, stage_at: new Date().toISOString() }).catch(function (x) { alert(x.message || x); }); return; }
      var v = e.target.closest("[data-save-report]");
      if (v) {
        var pid = v.dataset.saveReport, inp = el("list").querySelector('[data-report="' + pid + '"]');
        patch(pid, { report_url: (inp.value || "").trim() }).then(function () {
          var m = el("list").querySelector('[data-msg="' + pid + '"]'); if (m) m.textContent = "저장했습니다";
        }, function (x) { var m = el("list").querySelector('[data-msg="' + pid + '"]'); if (m) m.textContent = "저장 못 함 — " + (x.message || x); });
      }
    });
  }

  function boot() {
    db = window.ONECUE_DB || (window.ONECUE_DB = window.supabase.createClient(window.ONECUE.supabaseUrl, window.ONECUE.supabaseAnonKey));
    db.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      if (!u) { location.replace("login.html?next=desk.html"); return; }
      return db.from("profiles").select("is_admin,admin_can_write").eq("id", u.id).maybeSingle().then(function (p) {
        if (!p.data || !p.data.is_admin) { el("list").innerHTML = '<div class="empty">관리자만 볼 수 있습니다.</div>'; return; }
        CAN = !!p.data.admin_can_write;
        wire();
        // 화면에 보이는 동안 30초마다 새 의뢰·분석을 다시 불러온다
        setInterval(function () { if (document.visibilityState === "visible") load(false).catch(function () {}); }, 30000);
        setInterval(function () { if (document.visibilityState === "visible") paintDue(); }, 1000);   // 남은 시간은 다시 그리지 않고 글자만
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(false).catch(function () {}); });
        return load(true);
      });
    }).catch(function (e) { el("list").innerHTML = '<div class="empty">불러오지 못했습니다 — ' + esc(e.message || e) + "</div>"; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
