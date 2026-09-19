(function () {
  "use strict";
  async function resolve(db, assets) {
    return Promise.all((assets || []).map(async function (asset) {
      var copy = Object.assign({}, asset);
      if (!copy.storage_path) {
        if (copy.kind === "final") throw new Error("완성본의 비공개 저장 경로를 확인해 주세요.");
        return copy;
      }
      var result = await db.storage.from("uploads").createSignedUrl(copy.storage_path, 900);
      if (result.error || !result.data || !result.data.signedUrl) {
        throw new Error("파일 접근 권한을 확인할 수 없습니다. 다시 로그인해 주세요.");
      }
      copy.url = result.data.signedUrl;
      return copy;
    }));
  }
  window.ONECUE_ASSETS = { resolve: resolve };
})();
