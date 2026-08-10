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
      case "THREAD_ID_REQUIRED":
        return "대화 정보를 찾을 수 없습니다. 최근 대화를 다시 열어주세요.";
      case "THREAD_NOT_FOUND":
        return "이미 삭제되었거나 접근할 수 없는 대화입니다.";
      case "MESSAGE_NOT_FOUND":
        return "수정할 메시지를 찾을 수 없습니다. 대화를 다시 불러와 주세요.";
      case "MESSAGE_NOT_EDITABLE":
        return "수정할 수 없는 메시지입니다. 사용자 메시지만 수정할 수 있습니다.";
      case "VALIDATION_FAILED":
      case "INVALID_REQUEST":
        return "입력값을 확인해주세요.";
      case "CONFLICT":
        return "이미 처리되었거나 중복된 요청입니다.";
      case "INVALID_STATE":
        return "현재 상태에서는 처리할 수 없습니다.";
      case "REQUEST_TIMEOUT":
        return "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
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
    const code = getBackendErrorCode(error);
    const sharedError = (!Number(error?.status || 0) || /^(AI_|RATE_LIMIT)/.test(code))
      ? global.TtalkakMakeMessageModel?.classifyMakeError(error)
      : null;
    return String(
      payload?.message ||
        sharedError?.message ||
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
    if (!validThreads.length) {
      global.TtalkakMakeState.setMakeRecentThreads(state, []);
      return true;
    }

    global.TtalkakMakeState.setMakeRecentThreads(state, validThreads.map((thread) => ({
      id: thread.id,
      dedupeKey: thread.id,
      serverId: thread.serverId || (isBackendNumericId(thread.id) ? String(thread.id) : ""),
      title: thread.title || "새 대화",
      preview: makePreview(thread.preview || thread.messages?.at(-1)?.content || ""),
      folderId: thread.folderId || "uncategorized",
      createdAt: thread.createdAt || Date.now(),
      messages: Array.isArray(thread.messages) ? thread.messages : [],
    })));
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

  async function hydrateBackendMakeDataEffect(ctx) {
    const {
      applyContext,
      canUseDemoFallback,
      clearAuthenticatedSession,
      getApiFailureMessage,
      getAuthToken,
      getMakeApi,
      getMakeApiToken,
      getMakeInteractionVersion,
      hasBackendAuthToken,
      handleBackendAccessError,
      render,
      state,
    } = ctx;

    if (state.route !== "make" || state.makeBackendStatus !== "idle") return;
    const hydrationVersion = typeof getMakeInteractionVersion === "function" ? getMakeInteractionVersion() : 0;

    if (typeof hasBackendAuthToken === "function" && !hasBackendAuthToken()) {
      const wasLoggedIn = Boolean(state.isLoggedIn);
      const hasAnyToken = Boolean(String(typeof getAuthToken === "function" ? getAuthToken() || "" : "").trim());
      if (wasLoggedIn && !hasAnyToken && typeof clearAuthenticatedSession === "function") {
        clearAuthenticatedSession({ keepRoute: true });
        state.authView = "login";
      }
      global.TtalkakMakeState.setMakeBackendState(state, "fallback", wasLoggedIn && hasAnyToken
        ? "데모 계정은 서버 대화 조회 없이 로컬 Make 대화를 사용합니다."
        : wasLoggedIn
          ? "로그인이 필요하거나 만료되어 Make 대화를 불러오지 못했습니다."
          : "로그인하면 서버에 저장된 Make 대화를 불러올 수 있습니다.");
      render();
      return;
    }

    const api = getMakeApi();
    if (!api?.getMakeThreads && !api?.getMakeFolders) {
      global.TtalkakMakeState.setMakeBackendState(state, "fallback", canUseDemoFallback()
        ? "Make demo data 표시 중: Make API wrapper가 없어 데모 데이터를 표시합니다."
        : getApiFailureMessage("Make API"));
      render();
      return;
    }

    global.TtalkakMakeState.setMakeBackendState(state, "checking", "Make API 연결 확인 중");

    const [threadsResult, foldersResult] = await Promise.allSettled([
      api.getMakeThreads?.(getMakeApiToken()),
      api.getMakeFolders?.(getMakeApiToken()),
    ]);

    if (typeof getMakeInteractionVersion === "function" && getMakeInteractionVersion() !== hydrationVersion) return;

    let shouldRender = false;
    const backendDataContext = applyContext();

    if (foldersResult.status === "fulfilled") {
      shouldRender = applyMakeFoldersResult(backendDataContext, foldersResult.value) || shouldRender;
    } else if (foldersResult.status === "rejected") {
      ctx.reportWarning("backend-hydration", "make-folders", foldersResult.reason);
    }

    if (threadsResult.status === "fulfilled") {
      shouldRender = applyMakeThreadsResult(backendDataContext, threadsResult.value) || shouldRender;
    } else if (threadsResult.status === "rejected") {
      ctx.reportWarning("backend-hydration", "make-threads", threadsResult.reason);
    }

    const anyConnected = threadsResult.status === "fulfilled" || foldersResult.status === "fulfilled";
    const rejectedReasons = [threadsResult, foldersResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    const unauthorizedReason = rejectedReasons.find((reason) => {
      const status = Number(reason?.status || reason?.payload?.status || 0);
      const code = String(reason?.payload?.code || reason?.code || "");
      return status === 401 || code === "AUTHENTICATION_REQUIRED" || code === "LOGIN_REQUIRED";
    });

    if (!anyConnected && unauthorizedReason && typeof handleBackendAccessError === "function") {
      if (state.isLoggedIn && typeof clearAuthenticatedSession === "function") {
        clearAuthenticatedSession({ keepRoute: true });
        state.authView = "login";
      }
      global.TtalkakMakeState.setMakeBackendState(state, "fallback", "로그인이 필요하거나 만료되어 Make 대화를 불러오지 못했습니다.");
      handleBackendAccessError(unauthorizedReason, "로그인이 필요하거나 만료되었습니다. 다시 로그인해주세요.");
      render();
      return;
    }

    global.TtalkakMakeState.setMakeBackendState(state, anyConnected ? "connected" : "fallback", anyConnected
      ? "Make API 연결됨. GET /api/make/threads, /api/make/folders 요청을 확인했습니다."
      : canUseDemoFallback()
        ? "Make demo data 표시 중: Make 백엔드 호출 실패로 데모 데이터를 표시합니다."
        : getApiFailureMessage("Make API"));

    if (shouldRender || state.route === "make") render();
  }

  async function hydrateBackendMyPageDataEffect(ctx, { force = false } = {}) {
    const { api, applyContext, canUseDemoFallback, getAuthToken, render, state } = ctx;
    if (state.route !== "saved" || !state.isLoggedIn || (!force && state.myBackendStatus !== "idle")) return;

    if (!api?.getMyLibrary) {
      state.myBackendStatus = canUseDemoFallback() ? "idle" : "fallback";
      render();
      return;
    }

    state.myBackendStatus = "checking";
    const token = getAuthToken() || undefined;
    const [libraryResult, likedLibraryResult, promptsResult, commentsResult, reportsResult] = await Promise.allSettled([
      api.getMyLibrary({ filter: "all", page: 1, pageSize: 64 }, token),
      api.getMyLibrary({ filter: "liked", page: 1, pageSize: 64 }, token),
      api.getMyPrompts?.({ page: 1, pageSize: 64 }, token),
      api.getMyComments?.({ page: 1, pageSize: 64 }, token),
      api.getMyReports?.({ page: 1, pageSize: 64 }, token),
    ]);
    const allRequestsFailed = [libraryResult, likedLibraryResult, promptsResult, commentsResult, reportsResult].every(
      (result) => result.status === "rejected" || result.value === undefined,
    );

    let shouldRender = false;
    const backendDataContext = applyContext();

    if (libraryResult.status === "fulfilled") {
      shouldRender = applyMyLibraryResult(backendDataContext, libraryResult.value) || shouldRender;
    } else {
      ctx.reportWarning("backend-hydration", "my-library", libraryResult.reason);
    }

    if (likedLibraryResult.status === "fulfilled") {
      shouldRender = applyLikedLibraryResult(backendDataContext, likedLibraryResult.value) || shouldRender;
    } else {
      ctx.reportWarning("backend-hydration", "my-liked-library", likedLibraryResult.reason);
    }

    if (promptsResult.status === "fulfilled") {
      shouldRender = applyMyPromptsResult(backendDataContext, promptsResult.value) || shouldRender;
    } else {
      ctx.reportWarning("backend-hydration", "my-prompts", promptsResult.reason);
    }

    if (commentsResult.status === "fulfilled") {
      shouldRender = applyMyCommentsResult(backendDataContext, commentsResult.value) || shouldRender;
    }
    if (reportsResult.status === "fulfilled") {
      shouldRender = applyMyReportsResult(backendDataContext, reportsResult.value) || shouldRender;
    }

    state.myBackendStatus = allRequestsFailed ? "fallback" : "connected";
    if (shouldRender || allRequestsFailed) render();
  }

  async function hydrateBackendHomeDataEffect(ctx) {
    const { api, applyContext, canUseDemoFallback, getApiFailureMessage, homePageSize, render, state } = ctx;
    if (!api?.getCommunityPosts) {
      state.backendStatus = "fallback";
      state.backendStatusMessage = canUseDemoFallback()
        ? "GET /api/prompts 호출 실패로 데모 데이터를 표시 중입니다."
        : getApiFailureMessage("Home API");
      render();
      return;
    }

    const [promptsResult, tagsResult] = await Promise.allSettled([
      api.getCommunityPosts({ page: state.popularPage, size: homePageSize, sort: state.popularSort }),
      api.getPopularTags?.({ limit: 8 }),
    ]);

    let shouldRender = false;
    const backendDataContext = applyContext();

    if (promptsResult.status === "fulfilled" && applyBackendHomePromptsResult(backendDataContext, promptsResult.value, state.popularPage)) {
      state.backendStatus = "connected";
      state.backendStatusMessage = "GET /api/prompts 응답으로 Home 목록을 렌더링 중입니다.";
      shouldRender = true;
    } else if (promptsResult.status === "rejected") {
      state.backendStatus = "fallback";
      state.backendStatusMessage = canUseDemoFallback()
        ? "GET /api/prompts 호출 실패로 데모 데이터를 표시 중입니다."
        : getApiFailureMessage("Home API");
      ctx.reportWarning("backend-hydration", "home-prompts", promptsResult.reason);
    }

    if (tagsResult.status === "fulfilled" && applyBackendHomeTagsResult(backendDataContext, tagsResult.value)) {
      if (state.backendStatus === "connected") {
        state.backendStatusMessage = "GET /api/prompts와 GET /api/tags/popular 응답을 Home에 반영 중입니다.";
      }
      shouldRender = true;
    } else if (tagsResult.status === "rejected") {
      ctx.reportWarning("backend-hydration", "popular-tags", tagsResult.reason);
    }

    if (shouldRender || state.backendStatus === "fallback") render();
  }

  async function refreshBackendHomePromptsEffect(ctx) {
    const { api, applyContext, canUseDemoFallback, getApiFailureMessage, getValidSearchScope, homePageSize, render, state } = ctx;
    if (!api?.searchCommunityPosts) return;

    const query = String(state.searchQuery || "").trim();
    const scope = getValidSearchScope(state.searchScope);
    const page = Math.max(1, Number(state.popularPage) || 1);
    const requestSignature = JSON.stringify({ query, scope, sort: state.popularSort, page });
    state.backendStatusMessage = "GET /api/prompts 검색 조건을 백엔드에 전달 중입니다.";

    try {
      const result = await api.searchCommunityPosts({
        scope,
        query,
        page,
        size: homePageSize,
        sort: state.popularSort,
      });
      if (
        requestSignature !==
        JSON.stringify({
          query: String(state.searchQuery || "").trim(),
          scope: getValidSearchScope(state.searchScope),
          sort: state.popularSort,
          page: Math.max(1, Number(state.popularPage) || 1),
        })
      ) {
        return;
      }
      if (applyBackendHomePromptsResult(applyContext(), result, page)) {
        state.backendStatus = "connected";
        state.backendStatusMessage = query
          ? "GET /api/prompts?scope=" + scope + "&query=... 검색 결과를 Home에 반영 중입니다."
          : "GET /api/prompts 응답으로 Home 목록을 렌더링 중입니다.";
        render();
      }
    } catch (error) {
      state.backendStatus = "fallback";
      state.backendStatusMessage = canUseDemoFallback()
        ? "검색 API 호출 실패로 현재 화면의 로컬 목록을 유지합니다."
        : getApiFailureMessage("Home 검색 API");
      ctx.reportWarning("backend-hydration", "refresh-home-prompts", error);
      render();
    }
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
    hydrateBackendHomeDataEffect,
    hydrateBackendMakeDataEffect,
    hydrateBackendMyPageDataEffect,
    refreshBackendHomePromptsEffect,
  });
})(window);
