(function () {
  const API_BASE_URL = window.__API_BASE_URL__ || window.TTALKAK_API_BASE_URL || "http://localhost:8080";
  const API_TIMEOUT_MS = Number(window.TTALKAK_API_TIMEOUT_MS || 4500);

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}${path}`;
  }

  async function request(path, options = {}) {
    const { token, headers, ...fetchOptions } = options;
    const defaultHeaders = fetchOptions.body ? { "Content-Type": "application/json" } : {};
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl(path), {
        ...fetchOptions,
        signal: fetchOptions.signal || controller.signal,
        headers: {
          ...defaultHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(headers || {}),
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function unwrapItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.content)) return payload.content;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
  }

  function normalizeTags(value) {
    if (Array.isArray(value)) {
      return value
        .map((tag) => {
          if (typeof tag === "string") return tag;
          return tag?.name || tag?.tagName || tag?.label || tag?.title || "";
        })
        .map((tag) => String(tag).replace(/^#+/, "").trim())
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/[,\s]+/)
        .map((tag) => tag.replace(/^#+/, "").trim())
        .filter(Boolean);
    }

    return [];
  }

  function toNumber(...values) {
    for (const value of values) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) return numberValue;
    }
    return 0;
  }

  function toTimestamp(...values) {
    for (const value of values) {
      if (Number.isFinite(Number(value))) return Number(value);
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
    return Date.now();
  }

  function normalizePrompt(item, index = 0) {
    const rawText = item?.text || item?.prompt || item?.content || item?.body || item?.description || "";
    const text = String(rawText || item?.title || "프롬프트 내용을 불러왔습니다.").trim();
    const title = String(item?.title || item?.name || text.split(/\n/)[0] || "프롬프트").trim();
    const author =
      item?.authorNickname ||
      item?.nickname ||
      item?.writerNickname ||
      item?.authorName ||
      item?.author ||
      item?.writer ||
      item?.username ||
      "작성자";

    return {
      id: String(item?.id || item?.promptId || item?.prompt_id || item?.uuid || `backend-prompt-${index}`),
      title,
      text,
      tags: normalizeTags(item?.tags || item?.hashtags || item?.hashTags || item?.tagNames),
      views: toNumber(item?.views, item?.viewCount, item?.viewsCount),
      comments: toNumber(item?.comments, item?.commentCount, item?.commentsCount),
      saves: toNumber(item?.saves, item?.saveCount, item?.savedCount, item?.bookmarkCount),
      likes: toNumber(item?.likes, item?.likeCount, item?.likedCount),
      author,
      owner: item?.owner || author,
      source: item?.source || (item?.mine || item?.isMine ? "mine" : "community"),
      isShared: item?.isShared ?? item?.shared ?? item?.public ?? true,
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.publishedAt, item?.updatedAt),
      savedByMe: Boolean(item?.savedByMe || item?.isSaved || item?.bookmarkedByMe),
      likedByMe: Boolean(item?.likedByMe || item?.isLiked),
      raw: item,
    };
  }

  function normalizePopularTag(item) {
    if (typeof item === "string") return item.replace(/^#+/, "").trim();
    return String(item?.name || item?.tagName || item?.label || item?.title || "").replace(/^#+/, "").trim();
  }

  async function getCommunityPosts({ page = 1, size = 16, sort = "popular" } = {}) {
    const query = new URLSearchParams({ page, size, sort });
    const payload = await request(`/api/prompts?${query.toString()}`);
    return {
      ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
      items: unwrapItems(payload).map(normalizePrompt),
    };
  }

  const api = {
    request,
    normalizePrompt,
    login(payload) {
      return request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    signup(payload) {
      return request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    findId(payload) {
      return request("/api/auth/find-id", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    requestPasswordReset(payload) {
      return request("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    getCommunityPosts,
    searchCommunityPosts({ tags = [], page = 1, size = 16, sort = "popular" } = {}) {
      const query = new URLSearchParams({ tags: tags.join(","), page, size, sort });
      return request(`/api/prompts?${query.toString()}`).then((payload) => ({
        ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
        items: unwrapItems(payload).map(normalizePrompt),
      }));
    },
    getPopularTags({ limit = 8 } = {}) {
      return request(`/api/tags/popular?limit=${limit}`).then((payload) => unwrapItems(payload).map(normalizePopularTag).filter(Boolean));
    },
    getMakeThreads(token) {
      return request("/api/make/threads", { token });
    },
    viewPrompt(promptId) {
      return request(`/api/prompts/${promptId}/view`, { method: "POST" });
    },
    improvePrompt(payload, token) {
      return request("/api/prompts/improve", { method: "POST", token, body: JSON.stringify(payload) });
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
    addComment(promptId, payload, token) {
      return request(`/api/prompts/${promptId}/comments`, { method: "POST", token, body: JSON.stringify(payload) });
    },
    addReply(commentId, payload, token) {
      return request(`/api/comments/${commentId}/replies`, { method: "POST", token, body: JSON.stringify(payload) });
    },
    updateComment(commentId, payload, token) {
      return request(`/api/comments/${commentId}`, { method: "PATCH", token, body: JSON.stringify(payload) });
    },
    deleteComment(commentId, token) {
      return request(`/api/comments/${commentId}`, { method: "DELETE", token });
    },
    likeComment(commentId, token) {
      return request(`/api/comments/${commentId}/like`, { method: "POST", token });
    },
    unlikeComment(commentId, token) {
      return request(`/api/comments/${commentId}/like`, { method: "DELETE", token });
    },
    reportPrompt(promptId, payload, token) {
      return request(`/api/reports/prompts/${promptId}`, { method: "POST", token, body: JSON.stringify(payload) });
    },
    reportComment(commentId, payload, token) {
      return request(`/api/reports/comments/${commentId}`, { method: "POST", token, body: JSON.stringify(payload) });
    },
    getSavedPrompts({ filter = "all", page = 1, size = 16 } = {}, token) {
      const query = new URLSearchParams({ filter, page, size });
      return request(`/api/prompts/my?${query.toString()}`, { token });
    },
    sharePrompt(payload, token) {
      return request("/api/prompts", { method: "POST", token, body: JSON.stringify(payload) });
    },
    unsharePrompt(promptId, token) {
      return request(`/api/prompts/${promptId}/visibility`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isShared: false }),
      });
    },
    deletePrompt(promptId, token) {
      return request(`/api/prompts/${promptId}`, { method: "DELETE", token });
    },
  };

  window.TTALKAK_API = api;
})();
