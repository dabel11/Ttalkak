(function () {
  window.TTALKAK_MYPAGE_API = function createMyPageApi({ request, unwrapItems, normalizers }) {
    const { normalizePrompt, normalizeComment, normalizeReport, normalizeRevisionRequest } = normalizers;

    return {
      getSavedPrompts({ filter = "all", page = 1, size = 16 } = {}, token) {
        const query = new URLSearchParams({ filter, page, size });
        return request(`/api/prompts/my?${query.toString()}`, { token });
      },
      getMyLibrary({ filter = "all", page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ filter, page, pageSize });
        return request(`/api/me/library?${query.toString()}`, { token }).then((payload) => ({
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
          items: unwrapItems(payload).map(normalizePrompt),
        }));
      },
      getMyPrompts({ page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page, pageSize });
        return request(`/api/me/prompts?${query.toString()}`, { token }).then((payload) => ({
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
          items: unwrapItems(payload).map((prompt) => ({
            ...normalizePrompt(prompt),
            source: "mine",
            isShared: prompt?.isShared ?? prompt?.shared ?? prompt?.public ?? true,
          })),
        }));
      },
      getMyComments({ page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page, pageSize });
        return request(`/api/me/comments?${query.toString()}`, { token }).then((payload) => unwrapItems(payload).map(normalizeComment));
      },
      getMyReports({ page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page, pageSize });
        return request(`/api/me/reports?${query.toString()}`, { token }).then((payload) => unwrapItems(payload).map(normalizeReport));
      },
      getMyRevisionRequests({ status = "all" } = {}, token) {
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        return request(`/api/me/revision-requests${query.toString() ? `?${query.toString()}` : ""}`, { token }).then((payload) =>
          unwrapItems(payload).map(normalizeRevisionRequest),
        );
      },
      requestPromptRevision(promptId, payload, token) {
        return request(`/api/prompts/${promptId}/revision-requests`, { method: "POST", token, body: JSON.stringify(payload) }).then(normalizeRevisionRequest);
      },
    };
  };
})();
