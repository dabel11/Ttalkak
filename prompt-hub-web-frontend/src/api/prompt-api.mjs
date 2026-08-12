const IMPROVE_TIMEOUT_MS = Number(window.TTALKAK_IMPROVE_TIMEOUT_MS || 90000);
export function createPromptApi({ request, unwrapItems, unwrapPageMeta, normalizers }) {
    const {
      normalizePrompt,
      normalizePopularTag,
      normalizeAdminTag,
      normalizeImproveResult,
    } = normalizers;

    async function getCommunityPosts({ page = 1, size = 16, sort = "popular" } = {}) {
      const query = new URLSearchParams({ page: String(page), size: String(size), sort });
      const payload = await request(`/api/prompts?${query.toString()}`);
      return {
        ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
        ...unwrapPageMeta(payload),
        items: unwrapItems(payload).map(normalizePrompt),
      };
    }

    return {
      getCommunityPosts,
      searchCommunityPosts({ tags = [], scope = "", query: searchQuery = "", keyword = "", author = "", page = 1, size = 16, sort = "popular" } = {}) {
        const query = new URLSearchParams({ page: String(page), size: String(size), sort });
        if (tags.length) query.set("tags", tags.join(","));
        if (scope) query.set("scope", scope);
        if (searchQuery) query.set("query", searchQuery);
        if (keyword) query.set("keyword", keyword);
        if (author) query.set("author", author);
        return request(`/api/prompts?${query.toString()}`).then((payload) => ({
          ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
          ...unwrapPageMeta(payload),
          items: unwrapItems(payload).map(normalizePrompt),
        }));
      },
      getPopularTags({ limit = 8 } = {}) {
        return request(`/api/tags/popular?limit=${limit}`).then((payload) => unwrapItems(payload).map(normalizePopularTag).filter(Boolean));
      },
      searchTags({ query = "", limit = 8 } = {}) {
        const params = new URLSearchParams({ query, limit: String(limit) });
        return request(`/api/tags?${params.toString()}`).then((payload) => unwrapItems(payload).map(normalizeAdminTag));
      },
      proposeTag(payload, token) {
        return request("/api/tags/proposals", { method: "POST", token, body: JSON.stringify(payload) }).then(normalizeAdminTag);
      },
      viewPrompt(promptId) {
        return request(`/api/prompts/${promptId}/view`, { method: "POST" });
      },
      /** @param {*} payload @param {*} token @param {{ signal?: AbortSignal }} [options] */
      improvePrompt(payload, token, { signal } = {}) {
        return request("/api/prompts/improve", { method: "POST", token, signal, timeoutMs: IMPROVE_TIMEOUT_MS, body: JSON.stringify(payload) }).then((result) =>
          normalizeImproveResult(result, payload?.prompt || ""),
        );
      },
      savePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/save`, { method: "POST", token });
      },
      unsavePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/save`, { method: "DELETE", token });
      },
      likePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/like`, { method: "POST", token });
      },
      unlikePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/like`, { method: "DELETE", token });
      },
      reportPrompt(promptId, payload, token) {
        return request(`/api/reports/prompts/${promptId}`, { method: "POST", token, body: JSON.stringify(payload) });
      },
      sharePrompt(payload, token) {
        return request("/api/prompts", { method: "POST", token, body: JSON.stringify(payload) }).then(normalizePrompt);
      },
      updatePrompt(promptId, payload, token) {
        return request(`/api/prompts/${promptId}`, { method: "PATCH", token, body: JSON.stringify(payload) }).then(normalizePrompt);
      },
      unsharePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/visibility`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ isShared: false }),
        });
      },
      shareExistingPrompt(promptId, token) {
        return request(`/api/prompts/${promptId}/visibility`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ isShared: true }),
        }).then(normalizePrompt);
      },
      deletePrompt(promptId, token) {
        return request(`/api/prompts/${promptId}`, { method: "DELETE", token });
      },
    };
}
