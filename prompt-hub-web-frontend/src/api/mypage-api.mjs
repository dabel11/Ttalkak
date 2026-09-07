export function createMyPageApi({ request, unwrapItems, normalizers }) {
    const { normalizePrompt, normalizeComment, normalizeReport, normalizeRevisionRequest } = normalizers;

    return {
      getSavedPrompts({ filter = "all", page = 1, size = 16 } = {}, token) {
        const query = new URLSearchParams({ filter, page: String(page), size: String(size) });
        return request(`/api/prompts/my?${query.toString()}`, { token });
      },
      getMyLibrary(/** @type {{filter?: string, page?: number, pageSize?: number, signal?: AbortSignal}} */ { filter = "all", page = 1, pageSize = 64, signal } = {}, token) {
        const query = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
        return request(`/api/me/library?${query.toString()}`, { token, signal }).then((payload) => ({
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
          items: unwrapItems(payload).map(normalizePrompt),
        }));
      },
      getMyPrompts(/** @type {{page?: number, pageSize?: number, signal?: AbortSignal}} */ { page = 1, pageSize = 64, signal } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/me/prompts?${query.toString()}`, { token, signal }).then((payload) => ({
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
          items: unwrapItems(payload).map((prompt) => ({
            ...normalizePrompt(prompt),
            source: "mine",
            isShared: prompt?.isShared ?? prompt?.shared ?? prompt?.public ?? true,
          })),
        }));
      },
      getMyComments(/** @type {{page?: number, pageSize?: number, signal?: AbortSignal}} */ { page = 1, pageSize = 64, signal } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/me/comments?${query.toString()}`, { token, signal }).then((payload) => unwrapItems(payload).map(normalizeComment));
      },
      getMyReports(/** @type {{page?: number, pageSize?: number, signal?: AbortSignal}} */ { page = 1, pageSize = 64, signal } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/me/reports?${query.toString()}`, { token, signal }).then((payload) => unwrapItems(payload).map(normalizeReport));
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
}
