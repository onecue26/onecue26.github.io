(function () {
  "use strict";
  // 파일마다 짧은 서명 주소를 받는다. 공개 주소로 대신하지 않는다(보안 — 시험이 지킨다).
  //
  // ★ 2026-09-23 — 로그인 직후 한 번의 서명 실패로 **광고주 화면 전체**가
  //   「불러오지 못했습니다」가 됐다(다시 열면 멀쩡). 그래서
  //   · 한 번 더 시도한다 (잠깐의 실패를 넘긴다)
  //   · 그래도 안 되면 완성본은 전처럼 막고(보안), 나머지는 **그 파일만** 비워 두고
  //     화면은 그린다 — 콘티 한 장 때문에 진행 상황까지 안 보이면 안 된다.
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function sign(db, path) {
    for (var i = 0; i < 2; i++) {
      var result = await db.storage.from("uploads").createSignedUrl(path, 900);
      if (!result.error && result.data && result.data.signedUrl) return result.data.signedUrl;
      if (i === 0) await wait(600);
    }
    return null;
  }

  async function resolve(db, assets) {
    return Promise.all((assets || []).map(async function (asset) {
      var copy = Object.assign({}, asset);
      if (!copy.storage_path) {
        if (copy.kind === "final") throw new Error("완성본의 비공개 저장 경로를 확인해 주세요.");
        return copy;
      }
      var url = await sign(db, copy.storage_path);
      if (!url) {
        if (copy.kind === "final") {
          throw new Error("파일 접근 권한을 확인할 수 없습니다. 다시 로그인해 주세요.");
        }
        copy.url = null;               // 공개 주소로 대신하지 않는다 — 그 파일만 비운다
        copy.access_error = true;
        return copy;
      }
      copy.url = url;
      return copy;
    }));
  }
  window.ONECUE_ASSETS = { resolve: resolve };
})();
