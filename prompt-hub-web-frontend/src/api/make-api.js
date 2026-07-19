(function () {
  window.TTALKAK_MAKE_API = function createMakeApi({ request, unwrapItems, normalizers }) {
    const { normalizeMakeThread, normalizeMakeFolder } = normalizers;

    return {
      getMakeThreads(token) {
        return request("/api/make/threads", { token }).then((payload) => unwrapItems(payload).map(normalizeMakeThread));
      },
      getMakeFolders(token) {
        return request("/api/make/folders", { token }).then((payload) => unwrapItems(payload).map(normalizeMakeFolder));
      },
      createMakeThread(payload, token) {
        return request("/api/make/threads", { method: "POST", token, body: JSON.stringify(payload) });
      },
      createMakeFolder(payload, token) {
        return request("/api/make/folders", { method: "POST", token, body: JSON.stringify(payload) });
      },
      updateMakeFolder(folderId, payload, token) {
        return request(`/api/make/folders/${folderId}`, { method: "PATCH", token, body: JSON.stringify(payload) });
      },
      deleteMakeFolder(folderId, token) {
        return request(`/api/make/folders/${folderId}`, { method: "DELETE", token });
      },
      moveMakeThread(threadId, payload, token) {
        return request(`/api/make/threads/${threadId}/folder`, { method: "PATCH", token, body: JSON.stringify(payload) });
      },
    };
  };
})();
