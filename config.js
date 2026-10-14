// onecue — 접속 설정
//
// 여기 있는 키는 「공개용(anon / publishable)」이라 브라우저에 그대로 실려도 된다.
// 실제 보호는 Supabase 의 행 수준 보안(RLS) 정책이 한다 — 키를 숨겨서가 아니다.
//
// ⚠️ service_role / secret 키는 절대 이 파일에 넣지 않는다.
//    그건 DB 를 통째로 여는 열쇠라 공개 저장소에 올라가면 끝이다.

window.ONECUE = {
  supabaseUrl: "https://bkyhjdzxshftgytyzutq.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJreWhqZHp4c2hmdGd5dHl6dXRxIiwicm9sZSI6" +
    "ImFub24iLCJpYXQiOjE3ODg0MTU3MTksImV4cCI6MjEwMzk5MTcxOX0." +
    "4HW45rvLv5G5cTYcVssAXYmyP8qQTv-9bsI0WkwZnhI",
  // 10-14 — 광고주 「새 프로젝트」가 어느 의뢰 화면으로 가나 (Dan 「숨겨만 놓고 내가 요구하면 활성화」)
  //   "old"     = 옛 의뢰(new.html) — 지금 광고주가 쓰는 화면
  //   "option3" = 옵션 3 새 의뢰(new3.html) — Dan 확인 뒤 바꾼다
  //   관리자는 값과 상관없이 둘 다 본다(옛 것은 「old」 표시). 옛 화면·데이터는 지우지 않는다 — 이 값만 되돌리면 복구된다.
  flags: { clientNewFlow: "option3" },   // 10-14 Dan 「새 프로젝트를 옵션 3로 · 예전 것과 아예 분리」
};
