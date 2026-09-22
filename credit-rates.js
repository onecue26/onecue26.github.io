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
  "krw_per_credit": null,
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
    }
  },
  "plan_note": "2026-09-22 확인: 힉스필드 ultra, 월 6,000 크레딧 지급 + 보너스 150",
  "version": "credit-rates-v1",
  "why": [
    "크레딧 1개가 원화로 얼마인지. 이 값이 없으면 화면은 크레딧만 보여 준다.",
    "지어내지 않는다 — 틀린 원가로 서비스 가격을 정하는 것이 모르는 것보다 나쁘다.",
    "Dan 이 실제로 결제하는 월 금액 ÷ 그 달에 받는 크레딧 = 이 값이다.",
    "요금제가 바뀌면 이 숫자만 고친다. 화면은 이 파일만 읽는다."
  ]
};
})(typeof window !== "undefined" ? window : this);
