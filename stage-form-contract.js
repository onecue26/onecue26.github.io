// onecue — 단계별 구조화 폼 계약 (생성물 · 손으로 고치지 마십시오)
//
// 정본은 agency_site/db/stage_form_contract.json 한 곳뿐입니다.
// 이 파일은 db/generate_stage_form_contract.py 가 그 글자를 그대로 실어 온 것이고,
// 테스트가 JSON · 이 파일 · 마이그레이션 세 곳을 바이트 단위로 대조합니다.
(function (root) {
  "use strict";
  /* ONECUE-CONTRACT-BEGIN */
  root.ONECUE_FORM_CONTRACT =
{
  "banned_terms": [
    [
      "크림슨 대각선",
      "붉은 사선"
    ],
    [
      "쐐기 과육",
      "조각낸 과육"
    ],
    [
      "원형 슬라이스",
      "동그랗게 썬 것"
    ],
    [
      "앵커 정합",
      "제품이 같은 자리에 오도록 맞추는 작업"
    ],
    [
      "매치 컷",
      "장면이 자연스럽게 이어지는 연결"
    ],
    [
      "매치컷",
      "장면이 자연스럽게 이어지는 연결"
    ],
    [
      "세이프 존",
      "화면 가장자리 여백"
    ],
    [
      "세이프존",
      "화면 가장자리 여백"
    ],
    [
      "크림슨",
      "붉은"
    ],
    [
      "슬라이스",
      "썬 것"
    ],
    [
      "쐐기",
      "조각"
    ],
    [
      "앵커",
      "기준 이미지"
    ]
  ],
  "delivery_texts": {
    "client_summary": {
      "label": "광고주용 설명",
      "max_length": 4000,
      "min_length": 10,
      "plain_language": true,
      "required": true
    },
    "delivered_note": {
      "label": "내부 제작 명세",
      "max_length": 10000,
      "min_length": 0,
      "plain_language": false,
      "required": false
    }
  },
  "executor_report": {
    "review_findings": {
      "accepted_shapes": [
        "list",
        "count"
      ],
      "key_labels": {
        "advisory": "참고",
        "critical": "치명"
      },
      "keys": [
        "critical",
        "advisory"
      ],
      "label": "검토 결과",
      "shape_labels": {
        "count": "개수만 적힌 형태",
        "list": "목록 형태",
        "mixed": "두 형태가 섞임"
      }
    }
  },
  "steps": {
    "develop": {
      "fields": [
        {
          "help": "장면이 어떤 순서로 흘러가는지 한 줄씩 적습니다",
          "key": "arc",
          "label": "이야기 흐름(전개 arc)",
          "max_items": 12,
          "max_length": 300,
          "min_items": 2,
          "min_length": 2,
          "placeholder": "한 줄에 하나씩 · 예 · 아침에 문을 여는 장면으로 시작합니다",
          "plain_language": true,
          "required": true,
          "type": "list"
        },
        {
          "help": "화면에 글자로 뜨는 말입니다",
          "key": "copies",
          "label": "화면에 뜨는 글자(카피)",
          "max_items": 12,
          "max_length": 200,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 오늘은 좀 가볍게",
          "plain_language": true,
          "required": true,
          "type": "list"
        },
        {
          "help": "읽는 목소리의 느낌입니다",
          "key": "narration_tone",
          "label": "읽어 주는 목소리 느낌(나레이션 톤)",
          "max_length": 200,
          "min_length": 2,
          "placeholder": "예 · 차분하고 또박또박한 목소리",
          "plain_language": true,
          "required": true,
          "type": "text"
        },
        {
          "help": "마지막에 남길 한 줄입니다",
          "key": "slogan",
          "label": "마지막 한 줄(슬로건)",
          "max_length": 120,
          "min_length": 2,
          "placeholder": "예 · 오늘도 한 잔, 가볍게",
          "plain_language": true,
          "required": true,
          "type": "text"
        },
        {
          "false_label": "사용 안 함",
          "help": "배경음악(BGM)을 쓸지 말지만 고릅니다. 곡의 느낌은 내부 제작 명세에 적습니다",
          "key": "bgm",
          "label": "BGM 사용 여부",
          "plain_language": false,
          "required": false,
          "true_label": "사용",
          "type": "boolean"
        }
      ],
      "label": "구성·각본",
      "table": "developments"
    },
    "storyboard": {
      "fields": [
        {
          "help": "한 줄이 한 컷입니다. 아래 칸들과 줄 수가 같아야 합니다",
          "key": "cut_times",
          "label": "컷 시간(초)",
          "max_items": 20,
          "max_length": 40,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 0~1.6",
          "plain_language": true,
          "required": true,
          "type": "list"
        },
        {
          "help": "이 컷이 무슨 대목인지 짧게 적습니다",
          "key": "cut_blocks",
          "label": "컷 묶음",
          "max_items": 20,
          "max_length": 40,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 훅",
          "plain_language": true,
          "required": false,
          "type": "list"
        },
        {
          "help": "그 컷에서 무엇이 어떻게 움직이는지 적습니다",
          "key": "cut_actions",
          "label": "컷에서 일어나는 일",
          "max_items": 20,
          "max_length": 500,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 자몽 조각이 왼쪽에서 통통 뛰어 들어와 가운데에 선다",
          "plain_language": true,
          "required": true,
          "type": "list"
        },
        {
          "help": "왜 이 컷이 필요한지 적습니다",
          "key": "cut_intents",
          "label": "그 컷을 두는 까닭",
          "max_items": 20,
          "max_length": 400,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 첫 1.6초 안에 사물이 살아 움직이는 재미를 보여준다",
          "plain_language": true,
          "required": false,
          "type": "list"
        },
        {
          "help": "그 컷 화면에 나오는 것들입니다. 사람이 아니어도 됩니다",
          "key": "cut_elements",
          "label": "등장 요소",
          "max_items": 20,
          "max_length": 300,
          "min_items": 1,
          "min_length": 1,
          "placeholder": "한 줄에 하나씩 · 예 · 삼각형 자몽 조각, 뒤쪽의 RUSH 캔",
          "plain_language": true,
          "required": false,
          "type": "list"
        }
      ],
      "label": "콘티 · 컷 설계",
      "table": "cuts"
    }
  },
  "version": "2026-09-21-v3"
};
  /* ONECUE-CONTRACT-END */
})(typeof window !== "undefined" ? window : this);
