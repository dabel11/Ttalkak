(function () {
  const API_BASE_URL = window.__API_BASE_URL__ || window.TTALKAK_API_BASE_URL || "http://localhost:8080";
  const API_TIMEOUT_MS = Number(window.TTALKAK_API_TIMEOUT_MS || 15000);

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}${path}`;
  }

  async function request(path, options = {}) {
    const { token, headers, ...fetchOptions } = options;
    const storedToken = (() => {
      try {
        return window.localStorage?.getItem("ttalkak_access_token") || "";
      } catch (_error) {
        return "";
      }
    })();
    const resolvedToken = token || storedToken;
    const defaultHeaders = fetchOptions.body ? { "Content-Type": "application/json" } : {};
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl(path), {
        ...fetchOptions,
        signal: fetchOptions.signal || controller.signal,
        headers: {
          ...defaultHeaders,
          ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
          ...(headers || {}),
        },
      });

      if (!response.ok) {
        const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        try {
          error.payload = await response.json();
        } catch (_error) {
          error.payload = null;
        }
        throw error;
      }

      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("백엔드 응답 시간이 초과되었습니다. 서버 로그와 로그인 API 응답 지연을 확인해주세요.");
        timeoutError.status = 0;
        timeoutError.code = "REQUEST_TIMEOUT";
        timeoutError.cause = error;
        throw timeoutError;
      }
      throw error;
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

  function normalizeAuthor(value, fallback = "익명 사용자") {
    if (!value) return fallback;
    if (typeof value === "string") return value.trim() || fallback;
    return String(
      value.nickname ||
        value.authorNickname ||
        value.name ||
        value.username ||
        value.userId ||
        value.id ||
        fallback
    ).trim() || fallback;
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

    const normalizedAuthor = normalizeAuthor(author);

    return {
      id: String(item?.id || item?.promptId || item?.prompt_id || item?.uuid || `backend-prompt-${index}`),
      title,
      text,
      tags: normalizeTags(item?.tags || item?.hashtags || item?.hashTags || item?.tagNames),
      views: toNumber(item?.views, item?.viewCount, item?.viewsCount),
      comments: toNumber(item?.comments, item?.commentCount, item?.commentsCount),
      saves: toNumber(item?.saves, item?.saveCount, item?.savedCount, item?.bookmarkCount),
      likes: toNumber(item?.likes, item?.likeCount, item?.likedCount),
      author: normalizedAuthor,
      owner: normalizeAuthor(item?.owner, normalizedAuthor),
      source: item?.source || (item?.mine || item?.isMine ? "mine" : "community"),
      isShared: item?.isShared ?? item?.shared ?? item?.public ?? true,
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.publishedAt, item?.updatedAt),
      savedByMe: Boolean(item?.savedByMe || item?.isSaved || item?.bookmarkedByMe),
      likedByMe: Boolean(item?.likedByMe || item?.isLiked),
      raw: item,
    };
  }

  function normalizeComment(item, index = 0) {
    const author = item?.author?.nickname || item?.authorNickname || item?.nickname || item?.author || "익명 사용자";
    return {
      id: String(item?.id || item?.commentId || `backend-comment-${index}`),
      promptId: item?.promptId ? String(item.promptId) : "",
      parentId: item?.parentId ? String(item.parentId) : null,
      author: normalizeAuthor(author, "사용자"),
      owner: normalizeAuthor(author, "사용자"),
      text: String(item?.text || item?.content || ""),
      likes: toNumber(item?.likes, item?.likeCount),
      edited: Boolean(item?.edited || item?.isEdited),
      deleted: Boolean(item?.deleted || item?.isDeleted),
      likedByMe: Boolean(item?.likedByMe || item?.isLiked),
      isReported: Boolean(item?.isReported || item?.reportedByMe),
      createdAt: toTimestamp(item?.createdAt, item?.createdDate),
      replies: unwrapItems(item?.replies).map((reply, replyIndex) => normalizeComment(reply, replyIndex)),
      raw: item,
    };
  }

  function normalizePopularTag(item) {
    if (typeof item === "string") return item.replace(/^#+/, "").trim();
    return String(item?.name || item?.tagName || item?.label || item?.title || "").replace(/^#+/, "").trim();
  }

  function normalizeAdminTag(item, index = 0) {
    const label = normalizePopularTag(item) || `tag-${index}`;
    const status = String(item?.status || "pending").toLowerCase();
    return {
      id: String(item?.id || item?.tagId || label),
      key: label.replace(/^#+/, "").trim().toLowerCase(),
      label,
      status: ["approved", "rejected", "pending"].includes(status) ? status : "pending",
      count: toNumber(item?.useCount, item?.count, item?.usageCount),
      recentAt: toTimestamp(item?.createdAt, item?.updatedAt),
      raw: item,
    };
  }

  function normalizeReport(item, index = 0) {
    const targetType = String(item?.targetType || item?.type || "prompt").toLowerCase();
    return {
      id: String(item?.id || item?.reportId || `backend-report-${index}`),
      key: `${targetType}:${item?.targetId || item?.promptId || item?.commentId || item?.id || index}`,
      type: targetType,
      targetId: String(item?.targetId || item?.promptId || item?.commentId || ""),
      promptId: item?.promptId ? String(item.promptId) : "",
      status: String(item?.status || "pending").toLowerCase(),
      reason: item?.reason || "",
      createdAt: toTimestamp(item?.createdAt, item?.createdDate),
      raw: item,
    };
  }

  function normalizeMakeMessage(item, index = 0) {
    return {
      id: String(item?.id || item?.messageId || `backend-message-${index}`),
      role: item?.role || item?.sender || "assistant",
      content: String(item?.content || item?.text || item?.message || ""),
      sourcePrompt: item?.sourcePrompt || item?.originalPrompt || item?.prompt || "",
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.timestamp),
      raw: item,
    };
  }

  function normalizeMakeThread(item, index = 0) {
    const messages = unwrapItems(item?.messages || item?.chatMessages || item?.conversation).map(normalizeMakeMessage);
    const lastMessage = messages[messages.length - 1];
    const serverId = item?.id || item?.threadId || item?.conversationId || "";
    return {
      id: String(serverId || `backend-thread-${index}`),
      serverId: serverId ? String(serverId) : "",
      title: String(item?.title || item?.name || messages.find((message) => message.role === "user")?.content || "새 대화").trim(),
      preview: String(item?.preview || item?.summary || lastMessage?.content || "").trim(),
      folderId: item?.folderId || item?.folder?.id || "uncategorized",
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.updatedAt),
      messages,
      raw: item,
    };
  }

  function normalizeMakeFolder(item, index = 0) {
    const serverId = item?.id || item?.folderId || "";
    return {
      id: String(serverId || `backend-folder-${index}`),
      serverId: serverId ? String(serverId) : "",
      name: String(item?.name || item?.title || "새 폴더").trim(),
      raw: item,
    };
  }

  function normalizeImproveResult(payload, fallbackPrompt = "") {
    if (typeof payload === "string") return payload;

    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    const result = data?.result && typeof data.result === "object" ? data.result : data;
    const questions = result?.questions || result?.followUpQuestions || result?.additionalQuestions;

    if (String(result?.mode || result?.type || "").toLowerCase() === "question" && Array.isArray(questions) && questions.length) {
      return [
        "더 정확한 프롬프트를 만들기 위해 아래 정보를 보완해주세요.",
        "",
        ...questions.map((question, index) => `${index + 1}. ${String(question)}`),
      ].join("\n");
    }

    return String(
      result?.improvedPrompt ||
        result?.improved_prompt ||
        result?.finalPrompt ||
        result?.final_prompt ||
        result?.answer ||
        result?.markdown ||
        result?.text ||
        result?.content ||
        result?.prompt ||
        (typeof result?.result === "string" ? result.result : "") ||
        fallbackPrompt,
    );
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
    withdrawAccount(payload, token) {
      return request("/api/auth/withdraw", {
        method: "DELETE",
        token,
        body: JSON.stringify(payload),
      });
    },
    getCommunityPosts,
    searchCommunityPosts({ tags = [], scope = "", query: searchQuery = "", keyword = "", author = "", page = 1, size = 16, sort = "popular" } = {}) {
      const query = new URLSearchParams({ page, size, sort });
      if (tags.length) query.set("tags", tags.join(","));
      if (scope) query.set("scope", scope);
      if (searchQuery) query.set("query", searchQuery);
      if (keyword) query.set("keyword", keyword);
      if (author) query.set("author", author);
      return request(`/api/prompts?${query.toString()}`).then((payload) => ({
        ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
        items: unwrapItems(payload).map(normalizePrompt),
      }));
    },
    getPopularTags({ limit = 8 } = {}) {
      return request(`/api/tags/popular?limit=${limit}`).then((payload) => unwrapItems(payload).map(normalizePopularTag).filter(Boolean));
    },
    searchTags({ query = "", limit = 8 } = {}) {
      const params = new URLSearchParams({ query, limit });
      return request(`/api/tags?${params.toString()}`).then((payload) => unwrapItems(payload).map(normalizeAdminTag));
    },
    proposeTag(payload, token) {
      return request("/api/tags/proposals", { method: "POST", token, body: JSON.stringify(payload) }).then(normalizeAdminTag);
    },
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
    viewPrompt(promptId) {
      return request(`/api/prompts/${promptId}/view`, { method: "POST" });
    },
    getPromptComments(promptId, token) {
      return request(`/api/prompts/${promptId}/comments`, { token }).then((payload) => unwrapItems(payload).map(normalizeComment));
    },
    improvePrompt(payload, token) {
      return request("/api/prompts/improve", { method: "POST", token, body: JSON.stringify(payload) }).then((result) =>
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
    getMyLibrary({ filter = "all", page = 1, pageSize = 64 } = {}, token) {
      const query = new URLSearchParams({ filter, page, pageSize });
      return request(`/api/me/library?${query.toString()}`, { token }).then((payload) => ({
        ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
        items: unwrapItems(payload).map(normalizePrompt),
      }));
    },
    getMyComments(token) {
      return request("/api/me/comments", { token }).then((payload) => unwrapItems(payload).map(normalizeComment));
    },
    getMyReports(token) {
      return request("/api/me/reports", { token }).then((payload) => unwrapItems(payload).map(normalizeReport));
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
    checkUserId(userId) {
      const query = new URLSearchParams({ userId });
      return request(`/api/auth/check-user-id?${query.toString()}`);
    },
    checkNickname(nickname) {
      const query = new URLSearchParams({ nickname });
      return request(`/api/auth/check-nickname?${query.toString()}`);
    },
    getAdminReports({ status = "" } = {}, token) {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      return request(`/api/admin/reports${query.toString() ? `?${query.toString()}` : ""}`, { token }).then((payload) => unwrapItems(payload).map(normalizeReport));
    },
    updateAdminReportStatus(reportId, status, token) {
      return request(`/api/admin/reports/${reportId}/status`, { method: "PATCH", token, body: JSON.stringify({ status }) }).then(normalizeReport);
    },
    hideAdminPrompt(promptId, token) {
      return request(`/api/admin/prompts/${promptId}/hide`, { method: "PATCH", token }).then(normalizePrompt);
    },
    restoreAdminPrompt(promptId, token) {
      return request(`/api/admin/prompts/${promptId}/restore`, { method: "PATCH", token }).then(normalizePrompt);
    },
    getAdminTags({ status = "" } = {}, token) {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      return request(`/api/admin/tags${query.toString() ? `?${query.toString()}` : ""}`, { token }).then((payload) => unwrapItems(payload).map(normalizeAdminTag));
    },
    updateAdminTagStatus(tagId, status, token) {
      return request(`/api/admin/tags/${tagId}/status`, { method: "PATCH", token, body: JSON.stringify({ status }) }).then(normalizeAdminTag);
    },
  };

  window.TTALKAK_API = api;
})();
