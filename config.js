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
};
