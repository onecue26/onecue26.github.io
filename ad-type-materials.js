// onecue — 광고 종류별 필요 자료 (생성물 · 손으로 고치지 마십시오)
//
// 정본은 agency_site/db/ad_type_materials.json 한 곳뿐입니다.
// db/generate_ad_type_materials.py 가 그 글자를 그대로 실어 온 것이고,
// 테스트가 JSON · 이 파일 두 곳을 바이트 단위로 대조합니다.
(function (root) {
  "use strict";
  /* ONECUE-ADTYPE-BEGIN */
  root.ONECUE_AD_TYPE_MATERIALS =
{
  "angles": {
    "each": "컷마다 다른 것을 보여 준다. 공간·사람·앱 화면이 그렇다. 수가 컷보다 적으면 없는 것을 지어내게 되므로 그 사실을 말한다.",
    "one": "한 각도로 전부 덮을 수 있다. 단단한 물건·로고·글자가 그렇다. 각도가 하나뿐이면 그 각도에 맞춰 컷을 짠다고 적고 넘어간다. 막지 않는다."
  },
  "angles_say": {
    "each": "장면마다 다른 곳이 나옵니다. 사진이 모자라면 없는 곳을 그리게 됩니다.",
    "one": "가진 사진의 각도에 맞춰 장면을 짭니다. 더 보내주시면 화면이 다양해집니다."
  },
  "kinds": {
    "anchor": {
      "by": "system",
      "label": "컷 기준 화면"
    },
    "board": {
      "by": "system",
      "label": "콘티"
    },
    "brand_guide": {
      "by": "client",
      "label": "브랜드 가이드"
    },
    "char_ref": {
      "by": "client",
      "label": "인물 사진"
    },
    "clip": {
      "by": "system",
      "label": "생성 영상"
    },
    "doc": {
      "by": "both",
      "label": "문서"
    },
    "final": {
      "by": "system",
      "label": "완성본"
    },
    "legal_text": {
      "by": "client",
      "label": "표기·문구"
    },
    "logo": {
      "by": "client",
      "label": "로고 파일"
    },
    "mood_ref": {
      "by": "client",
      "label": "분위기 참고"
    },
    "place_ref": {
      "by": "client",
      "label": "공간 사진"
    },
    "product_ref": {
      "by": "client",
      "label": "제품 사진"
    },
    "screen_ref": {
      "by": "client",
      "label": "화면 캡처"
    }
  },
  "need_levels": {
    "expected": "보통 있어야 한다. 없으면 무엇으로 대신할지 정하고 기록한다.",
    "optional": "있으면 쓴다. 없다고 막지 않는다.",
    "required": "없으면 그 종류의 광고를 정직하게 만들 수 없다. 없으면 받아 달라고 말한다."
  },
  "real": {
    "no": "분위기·방향 참고다. 톤만 가져오고 구도·장면을 베끼지 않는다.",
    "yes": "실재를 가리킨다. 없는 것을 만들거나 있는 것을 바꾸지 않는다. 각도가 모자라면 모자란다고 말한다."
  },
  "say": "광고주에게 그대로 보여 줄 말. why·ask 는 우리끼리 하는 말이라 광고주 화면에 나가면 안 된다 — kind 이름(product_ref 같은)도 마찬가지다. 판정은 한 벌이고 문장은 두 벌이다.",
  "types": {
    "app_digital": {
      "examples": [
        "모바일 앱",
        "웹서비스",
        "구독 플랫폼"
      ],
      "label": "앱·디지털 서비스 광고",
      "materials": [
        {
          "angles": "each",
          "ask": "광고에 보일 화면을 캡처로 주십시오. 캡처 안의 글자는 생성에 맡기지 않고 그대로 씁니다.",
          "kind": "screen_ref",
          "min": 2,
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "광고에 넣을 화면을 캡처해서 보내주십시오. 화면 속 글자는 그대로 씁니다.",
            "label": "앱 화면 캡처",
            "why": "광고에 보이는 화면은 실제로 그 앱에 있는 화면이어야 합니다."
          },
          "why": "화면은 실제로 그 앱에 있는 화면이어야 한다. 없는 기능을 그리면 허위광고다."
        },
        {
          "angles": "one",
          "kind": "logo",
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "로고 원본 파일(가능하면 배경 없는 파일)을 보내주십시오.",
            "label": "로고 파일",
            "why": "로고는 원본 파일을 그대로 얹습니다. 없으면 비슷하지만 다른 로고가 됩니다."
          }
        },
        {
          "angles": "one",
          "kind": "legal_text",
          "need": "optional",
          "real": "yes",
          "say": {
            "ask": "화면에 반드시 들어가야 하는 문구가 있으면 글자 그대로 보내주십시오.",
            "label": "표기·문구",
            "why": "날짜·가격·의무 표기처럼 틀리면 안 되는 글자는 주신 그대로 넣습니다."
          }
        },
        {
          "angles": "one",
          "kind": "mood_ref",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "분위기 참고"
          }
        }
      ]
    },
    "event": {
      "examples": [
        "공연",
        "세미나",
        "채용",
        "오픈 안내"
      ],
      "label": "행사·모집 광고",
      "materials": [
        {
          "angles": "one",
          "kind": "legal_text",
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "화면에 반드시 들어가야 하는 문구가 있으면 글자 그대로 보내주십시오.",
            "label": "표기·문구",
            "why": "날짜·가격·의무 표기처럼 틀리면 안 되는 글자는 주신 그대로 넣습니다."
          },
          "why": "날짜·장소·가격·신청 방법은 틀리면 안 되는 글자다. 한 글자도 생성에 맡기지 않는다."
        },
        {
          "angles": "each",
          "kind": "place_ref",
          "need": "expected",
          "real": "yes",
          "say": {
            "ask": "내부를 서로 다른 각도로 3장 이상 보내주십시오. 장면마다 다른 각도가 필요합니다.",
            "label": "공간 사진",
            "why": "손님이 실제로 찾아오는 곳입니다. 더 예쁜 공간을 만들어 넣으면 광고와 실제가 달라집니다."
          }
        },
        {
          "angles": "one",
          "kind": "logo",
          "need": "expected",
          "real": "yes",
          "say": {
            "ask": "로고 원본 파일(가능하면 배경 없는 파일)을 보내주십시오.",
            "label": "로고 파일",
            "why": "로고는 원본 파일을 그대로 얹습니다. 없으면 비슷하지만 다른 로고가 됩니다."
          }
        },
        {
          "angles": "one",
          "kind": "mood_ref",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "분위기 참고"
          }
        }
      ]
    },
    "other": {
      "cautions": [
        "표에 없는 종류다. 이 건이 무엇을 실재로 삼는지 사람이 정하고, 정해지면 이 파일에 한 줄 더한다.",
        "정해지기 전에는 실재를 가리키는 것을 지어내지 않는다."
      ],
      "examples": [],
      "label": "그 밖",
      "materials": [
        {
          "angles": "one",
          "kind": "doc",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "문서"
          }
        }
      ]
    },
    "person_brand": {
      "examples": [
        "강사",
        "전문직",
        "크리에이터"
      ],
      "label": "인물·전문가 광고",
      "materials": [
        {
          "angles": "each",
          "ask": "정면과 측면을 포함해 두 장 이상, 그리고 화면 사용 동의를 주십시오.",
          "kind": "char_ref",
          "min": 2,
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "화면에 나올 분의 사진과, 나와도 된다는 확인을 함께 보내주십시오.",
            "label": "인물 사진",
            "why": "화면에 나오는 분은 실제 그분이어야 합니다. 닮은 사람은 그분이 아닙니다."
          },
          "why": "그 사람이어야 한다. 닮은 사람은 그 사람이 아니다."
        },
        {
          "angles": "each",
          "kind": "place_ref",
          "need": "optional",
          "real": "yes",
          "say": {
            "ask": "내부를 서로 다른 각도로 3장 이상 보내주십시오. 장면마다 다른 각도가 필요합니다.",
            "label": "공간 사진",
            "why": "손님이 실제로 찾아오는 곳입니다. 더 예쁜 공간을 만들어 넣으면 광고와 실제가 달라집니다."
          }
        },
        {
          "angles": "one",
          "kind": "logo",
          "need": "optional",
          "real": "yes",
          "say": {
            "ask": "로고 원본 파일(가능하면 배경 없는 파일)을 보내주십시오.",
            "label": "로고 파일",
            "why": "로고는 원본 파일을 그대로 얹습니다. 없으면 비슷하지만 다른 로고가 됩니다."
          }
        },
        {
          "angles": "one",
          "kind": "mood_ref",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "분위기 참고"
          }
        }
      ]
    },
    "place_service": {
      "cautions": [
        "회원·손님이 찍힌 사진은 동의를 확인하기 전에는 쓰지 않는다.",
        "공간 사진 수보다 컷이 많으면 그 사실을 드러낸다 — 각도를 더 받거나, 컷을 줄이거나, 연출 이미지임을 표시한다."
      ],
      "examples": [
        "요가·필라테스 학원",
        "미용실",
        "카페·식당",
        "병원·의원",
        "스터디카페"
      ],
      "label": "공간·서비스 광고",
      "materials": [
        {
          "angles": "each",
          "ask": "내부를 서로 다른 각도로 3장 이상 주십시오. 컷마다 다른 각도가 필요하고, 없는 각도는 지어내지 않습니다.",
          "kind": "place_ref",
          "min": 3,
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "내부를 서로 다른 각도로 3장 이상 보내주십시오. 장면마다 다른 각도가 필요합니다.",
            "label": "공간 사진",
            "why": "손님이 실제로 찾아오는 곳입니다. 더 예쁜 공간을 만들어 넣으면 광고와 실제가 달라집니다."
          },
          "why": "손님이 실제로 찾아오는 곳이다. 더 예쁜 공간을 만들어 넣으면 광고가 거짓이 된다."
        },
        {
          "angles": "each",
          "ask": "화면에 나올 분의 사진과, 나와도 된다는 확인을 주십시오.",
          "kind": "char_ref",
          "need": "expected",
          "real": "yes",
          "say": {
            "ask": "화면에 나올 분의 사진과, 나와도 된다는 확인을 함께 보내주십시오.",
            "label": "인물 사진",
            "why": "화면에 나오는 분은 실제 그분이어야 합니다. 닮은 사람은 그분이 아닙니다."
          },
          "why": "원장·강사가 나오면 그 사람이어야 한다."
        },
        {
          "angles": "one",
          "kind": "logo",
          "need": "expected",
          "real": "yes",
          "say": {
            "ask": "로고 원본 파일(가능하면 배경 없는 파일)을 보내주십시오.",
            "label": "로고 파일",
            "why": "로고는 원본 파일을 그대로 얹습니다. 없으면 비슷하지만 다른 로고가 됩니다."
          }
        },
        {
          "angles": "one",
          "kind": "legal_text",
          "need": "optional",
          "real": "yes",
          "say": {
            "ask": "화면에 반드시 들어가야 하는 문구가 있으면 글자 그대로 보내주십시오.",
            "label": "표기·문구",
            "why": "날짜·가격·의무 표기처럼 틀리면 안 되는 글자는 주신 그대로 넣습니다."
          },
          "why": "병원·의원은 의료광고 심의 문구가 따로 있다."
        },
        {
          "angles": "one",
          "kind": "mood_ref",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "분위기 참고"
          }
        }
      ]
    },
    "product": {
      "examples": [
        "음료",
        "화장품",
        "가전",
        "식품 포장재"
      ],
      "label": "제품 광고",
      "materials": [
        {
          "angles": "one",
          "ask": "제품 사진을 앞·뒤·측면으로 주시면 뒷면 표기를 가릴지 보여줄지 정할 수 있습니다.",
          "kind": "product_ref",
          "min": 1,
          "need": "required",
          "real": "yes",
          "say": {
            "ask": "제품 사진을 앞·뒤·옆에서 찍어 보내주시면, 뒷면 표기를 가릴지 보여드릴지 정할 수 있습니다.",
            "label": "제품 사진",
            "why": "제품이 화면에 나오려면 실제 사진이 있어야 합니다. 사진 없이 그리면 실제 제품과 다른 모양이 됩니다."
          },
          "why": "제품이 화면에 나오면 실제 모양·색·그래픽이 기준이다. 바꾸면 다른 제품이 된다."
        },
        {
          "angles": "one",
          "kind": "logo",
          "need": "expected",
          "real": "yes",
          "say": {
            "ask": "로고 원본 파일(가능하면 배경 없는 파일)을 보내주십시오.",
            "label": "로고 파일",
            "why": "로고는 원본 파일을 그대로 얹습니다. 없으면 비슷하지만 다른 로고가 됩니다."
          },
          "why": "로고는 후반에 얹는다. 생성에 맡기면 비슷하지만 틀린 로고가 나온다."
        },
        {
          "angles": "one",
          "kind": "legal_text",
          "need": "optional",
          "real": "yes",
          "say": {
            "ask": "화면에 반드시 들어가야 하는 문구가 있으면 글자 그대로 보내주십시오.",
            "label": "표기·문구",
            "why": "날짜·가격·의무 표기처럼 틀리면 안 되는 글자는 주신 그대로 넣습니다."
          },
          "why": "의무 표기가 있으면 글자 그대로 얹는다. 식품·건강기능식품은 표기 자체가 규제 대상이다."
        },
        {
          "angles": "one",
          "kind": "brand_guide",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "브랜드 가이드"
          }
        },
        {
          "angles": "one",
          "kind": "mood_ref",
          "need": "optional",
          "real": "no",
          "say": {
            "label": "분위기 참고"
          }
        }
      ]
    }
  },
  "version": "ad-type-materials-v1",
  "why": [
    "광고 종류마다 「실재하는 것」이 다르다. 음료 광고는 캔이 실재이고, 요가학원 광고는 그 학원 공간이 실재다.",
    "이 표는 종류를 보고 「무엇이 필요한가」를 말한다. 그래야 자료가 모자랄 때 조용히 지어내지 않고 모자란다고 말할 수 있다.",
    "실재를 가리키는 자료라도 **한 각도로 덮이는 것**과 **컷마다 달라지는 것**은 다르다. 캔은 한 장이면 그 각도로 컷을 짜면 되고, 요가학원은 컷마다 다른 곳을 보여 주므로 수가 모자라면 없는 방을 그리게 된다. angles 가 이 둘을 가른다.",
    "종류는 늘려 간다. 없는 종류가 오면 other 로 받고, 그 건을 보고 한 줄 더한다.",
    "자료 종류를 부르는 이름도 여기 둔다. 화면마다 다른 말로 부르면 광고주가 무엇을 달라는 건지 모른다."
  ]
};
  /* ONECUE-ADTYPE-END */
})(typeof window !== "undefined" ? window : this);
