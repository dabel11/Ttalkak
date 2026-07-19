(function attachBackendEffects(global) {
  "use strict";

  function getBackendErrorCode(error) {
    return String(error?.payload?.code || error?.code || "").trim().toUpperCase();
  }

  function getBackendErrorCodeMessage(code) {
    switch (String(code || "").trim().toUpperCase()) {
      case "AUTHENTICATION_REQUIRED":
      case "LOGIN_REQUIRED":
        return "로그인이 필요하거나 인증이 만료되었습니다.";
      case "ACCESS_DENIED":
        return "이 작업을 수행할 권한이 없습니다.";
      case "OWNER_ONLY":
        return "작성자만 수행할 수 있는 작업입니다.";
      case "ADMIN_ONLY":
        return "관리자 권한이 필요합니다.";
      case "ACCOUNT_BLOCKED":
        return "차단된 계정입니다. 관리자에게 문의해주세요.";
      case "ACCOUNT_WITHDRAWN":
        return "탈퇴한 계정입니다.";
      case "ADMIN_ACCOUNT_PROTECTED":
        return "관리자 계정에는 수행할 수 없는 작업입니다.";
      case "BLOCK_REASON_REQUIRED":
        return "차단 사유가 필요합니다.";
      case "RESOURCE_NOT_FOUND":
        return "요청한 대상을 찾을 수 없습니다.";
      case "VALIDATION_FAILED":
      case "INVALID_REQUEST":
        return "입력값을 확인해주세요.";
      case "CONFLICT":
        return "이미 처리되었거나 중복된 요청입니다.";
      case "INVALID_STATE":
        return "현재 상태에서는 처리할 수 없습니다.";
      case "REQUEST_TIMEOUT":
      case "AI_TIMEOUT":
        return "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
      case "AI_SERVICE_UNAVAILABLE":
        return "현재 AI 첨삭 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.";
      case "INTERNAL_SERVER_ERROR":
        return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      case "RATE_LIMIT_EXCEEDED":
        return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
      case "FREE_TRIAL_LIMIT_EXCEEDED":
        return "무료 체험 횟수를 모두 사용했습니다. 로그인 후 계속 이용해주세요.";
      case "REVISION_REQUEST_NOT_EDITABLE":
        return "현재 상태에서는 수정 요청 사유를 변경할 수 없습니다.";
      case "AUTHOR_REVISION_REQUEST_ALREADY_ACTIVE":
        return "이미 처리 중인 수정 요청이 있습니다.";
      default:
        return "";
    }
  }

  function getBackendErrorMessage(error) {
    const payload = error?.payload;
    const codeMessage = getBackendErrorCodeMessage(getBackendErrorCode(error));
    return String(
      payload?.message ||
        codeMessage ||
        payload?.error ||
        payload?.code ||
        error?.message ||
        "",
    ).trim();
  }

  function applyBackendHomePromptsResult(ctx, result, page) {
    const { popularPrompts, state, updateBackendHomePageMeta, normalizePersistedLikeCounts } = ctx;
    if (!Array.isArray(result?.items)) return false;

    popularPrompts.splice(
      0,
      popularPrompts.length,
      ...result.items.map((prompt) => ({
        ...prompt,
        source: prompt.source || "community",
        isShared: prompt.isShared ?? true,
      })),
    );
    updateBackendHomePageMeta(result, page);
    normalizePersistedLikeCounts();
    return true;
  }

  function applyBackendHomeTagsResult(ctx, tags) {
    const { state } = ctx;
    if (!Array.isArray(tags)) return false;

    state.backendPopularTags = tags.slice(0, 8);
    return true;
  }

  function applyMakeFoldersResult(ctx, folders) {
    const { normalizeMakeFolders, state } = ctx;
    if (!Array.isArray(folders)) return false;

    const validFolders = folders.filter((folder) => folder.id && folder.name);
    if (!validFolders.length) return false;

    state.makeFolders = normalizeMakeFolders(validFolders);
    return true;
  }

  function applyMakeThreadsResult(ctx, threads) {
    const { isBackendNumericId, makePreview, normalizeRecentThreads, state } = ctx;
    if (!Array.isArray(threads)) return false;

    const validThreads = threads.filter((thread) => thread.id);
    if (!validThreads.length) return false;

    state.recentThreads = validThreads.map((thread) => ({
      id: thread.id,
      dedupeKey: thread.id,
      serverId: thread.serverId || (isBackendNumericId(thread.id) ? String(thread.id) : ""),
      title: thread.title || "새 대화",
      preview: thread.preview || makePreview(thread.messages?.at(-1)?.content || ""),
      folderId: thread.folderId || "uncategorized",
      createdAt: thread.createdAt || Date.now(),
      messages: Array.isArray(thread.messages) ? thread.messages : [],
    }));
    normalizeRecentThreads();
    return true;
  }

  function applyMyLibraryResult(ctx, result) {
    const { popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
    if (!Array.isArray(result?.items)) return false;

    state.backendLibraryPromptIds = new Set();
    state.backendLibraryPrompts = result.items.map((prompt) => {
      const normalized = {
        ...prompt,
        source: prompt.source || (prompt.isMine ? "mine" : "community"),
        savedByMe: Boolean(prompt.savedByMe || prompt.raw?.isSaved),
      };
      upsertPrompt(savedPrompts, normalized);
      if (normalized.isShared) upsertPrompt(popularPrompts, normalized);
      state.userLibraryPromptIds.add(normalized.id);
      state.backendLibraryPromptIds.add(normalized.id);
      return normalized;
    });
    return true;
  }

  function applyLikedLibraryResult(ctx, result) {
    const { popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
    if (!Array.isArray(result?.items)) return false;

    state.backendLikedPrompts = result.items.map((prompt) => {
      const normalized = {
        ...prompt,
        source: prompt.source || (prompt.isMine ? "mine" : "community"),
        likedByMe: true,
      };
      upsertPrompt(savedPrompts, normalized);
      if (normalized.isShared) upsertPrompt(popularPrompts, normalized);
      state.likedPromptIds.add(normalized.id);
      return normalized;
    });
    return true;
  }

  function applyMyPromptsResult(ctx, result) {
    const { popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
    if (!Array.isArray(result?.items)) return false;

    state.backendMyPrompts = result.items.map((prompt) => ({
      ...prompt,
      source: "mine",
      owner: state.currentUser || prompt.owner || prompt.author,
      author: state.currentUser || prompt.author,
    }));
    state.backendMyPrompts.forEach((prompt) => {
      upsertPrompt(savedPrompts, prompt);
      if (prompt.isShared) upsertPrompt(popularPrompts, prompt);
    });
    return true;
  }

  function applyMyCommentsResult(ctx, comments) {
    const { popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
    if (!Array.isArray(comments)) return false;

    state.backendMyComments = comments;
    comments.forEach((comment) => {
      if (comment.prompt) {
        upsertPrompt(popularPrompts, comment.prompt);
        upsertPrompt(savedPrompts, comment.prompt);
      }
    });
    return true;
  }

  function applyMyReportsResult(ctx, reports) {
    const { state } = ctx;
    if (!Array.isArray(reports)) return false;

    state.backendMyReports = reports;
    return true;
  }

  global.TtalkakBackendEffects = Object.freeze({
    ...(global.TtalkakBackendEffects || {}),
    applyBackendHomePromptsResult,
    applyBackendHomeTagsResult,
    applyLikedLibraryResult,
    applyMakeFoldersResult,
    applyMakeThreadsResult,
    applyMyCommentsResult,
    applyMyLibraryResult,
    applyMyPromptsResult,
    applyMyReportsResult,
    getBackendErrorCode,
    getBackendErrorCodeMessage,
    getBackendErrorMessage,
  });
})(window);
