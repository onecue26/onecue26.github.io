// onecue — 훅스필드 크레디트 단가 (생성물)
//
// 정본은 agency_site/db/credit_rates.json 한 곳이다.
// krw_per_credit 이 null 이면 화면은 크레디트만 보여 준다 —
// 원화를 지어내면 틀린 원가로 서버스 가겍을 정하게 된다.
(function (root) {
  "use strict";
  root.ONECUE_CREDIT_RATES =
{
  "how_to_fill": "예: 월 39,000원에 6,000 크레딧이면 6.5 를 넣는다",
  "krw_per_credit": 63.2,
  "measured": {
    "gpt_image_2_5": {
      "2k_high": 3,
      "default": 2,
      "note": "3:2·2k·high 에서 3. 기본 품질은 2"
    },
    "nano_banana_2": {
      "default": 2,
      "note": "2k 로 뽑아도 2"
    },
    "seedance_2_5": {
      "12s_480p": 36,
      "note": "길이·해상도에 따라 변한다. 실측 12~50 폭"
    },
    "gpt_image_2_5_2k_9x16": {
      "credits": 3,
      "when": "2026-09-22",
      "note": "세로. 앵커·콘티 선화에 쓴 값"
    },
    "gpt_image_2_5_2k_16x9": {
      "credits": 1,
      "when": "2026-09-22",
      "note": "★ 가로가 세로보다 싸다. 소품 시트 실측 — 예상 3cr 로 적었다가 힉스필드 결제가 1cr 인 것을 보고 고쳤다"
    },
    "seedance_2_5_480p_12s_9x16": {
      "credits": 36,
      "when": "2026-09-22"
    },
    "seedance_2_5_480p_15s_9x16": {
      "credits": 45,
      "when": "2026-09-22"
    },
    "seedance_2_5_720p_12s_9x16": {
      "credits": 84,
      "when": "2026-09-22",
      "note": "480p 의 2.33배. 해상도를 안 적으면 여기로 샌다"
    },
    "_note": "★ 장부에는 **실제 결제액**만 적는다. 생성 도구가 값을 안 돌려줄 때 예상값을 넣었다가 2cr 을 없는 지출로 적은 적이 있다 (2026-09-22). 값을 모르면 힉스필드 결제 기록을 보고 적는다."
  },
  "plan_note": "2026-09-17 인보이스 확인: Higgsfield Ultra 월간 정가 $250(할인 −$74) + VAT 10%",
  "version": "credit-rates-v1",
  "why": [
    "크레딧 1개가 원화로 얼마인지. 이 값이 없으면 화면은 크레딧만 보여 준다.",
    "지어내지 않는다 — 틀린 원가로 서비스 가격을 정하는 것이 모르는 것보다 나쁘다.",
    "Dan 이 실제로 결제하는 월 금액 ÷ 그 달에 받는 크레딧 = 이 값이다.",
    "요금제가 바뀌면 이 숫자만 고친다. 화면은 이 파일만 읽는다."
  ],
  "rate_basis": {
    "plan": "힉스필드 Ultra 월간 6,000cr",
    "usd_list": 250,
    "vat": 0.1,
    "usd_with_vat": 275,
    "credits": 6000,
    "krw_per_usd": 1379.94,
    "krw_source": "2026-09-17 구독 인보이스(2ZIW3EG2-0004)에 찍힌 VAT ₩24,287 ÷ $17.60",
    "why": "할인 전 정가 + 부가세로 잡는다 — 보수적으로 잡아야 손해가 없다 (Dan 09-23). 실제 결제는 $176+VAT(할인가)",
    "calc": "$250 × 1.1 = $275 × ₩1,379.94 = ₩379,484 ÷ 6,000cr = ₩63.2/cr",
    "invoice_file": "C:/Users/sado4/Downloads/Invoice-2ZIW3EG2-0004.pdf"
  }
};
})(typeof window !== "undefined" ? window : this);
