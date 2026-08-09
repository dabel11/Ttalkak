(function attachAppState(global) {
  "use strict";

  const STORAGE_KEY = "prompt_hub_web_state_v2";
  const AUTH_TOKEN_KEY = "ttalkak_access_token";
  const DEMO_AUTH_TOKEN = "demo-token";

  function readStorageItem(key) {
    try {
      return global.localStorage?.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeStorageItem(key, value) {
    try {
      global.localStorage?.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function removeStorageItem(key) {
    try {
      global.localStorage?.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function readPersistedPayload() {
    const raw = readStorageItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function writePersistedPayload(payload) {
    return writeStorageItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function clearPersistedPayload() {
    return removeStorageItem(STORAGE_KEY);
  }

  function persistAppState(ctx) {
    const { commentsByPrompt, popularPrompts, saveCurrentAccountScope, savedPrompts, state } = ctx;
    saveCurrentAccountScope();
    writePersistedPayload({
      popularPrompts,
      savedPrompts: savedPrompts
        .filter((prompt) => !state.pendingUnsaveIds.has(prompt.id) || prompt.source === "mine")
        .map((prompt) =>
          state.pendingUnsaveIds.has(prompt.id) && prompt.source === "mine" ? { ...prompt, savedByMe: false } : prompt,
        ),
      commentsByPrompt,
      state: {
        isLoggedIn: state.isLoggedIn,
        currentUser: state.currentUser,
        currentUserId: state.currentUserId,
        currentUserRole: state.currentUserRole,
        authToken: state.authToken,
        token: state.token,
        accountScopes: state.accountScopes,
        libraryDemoSeeded: state.libraryDemoSeeded,
        userLibraryPromptIds: [...state.userLibraryPromptIds],
        likedPromptIds: [...state.likedPromptIds],
        likedCommentIds: [...state.likedCommentIds],
        reportedPromptIds: [...state.reportedPromptIds],
        reportedCommentIds: [...state.reportedCommentIds],
        hideReportedPrompts: state.hideReportedPrompts,
        adminMode: state.adminMode,
        adminHiddenPromptIds: [...state.adminHiddenPromptIds],
        adminTagDecisions: state.adminTagDecisions,
        adminTab: state.adminTab,
        adminPromptQuery: state.adminPromptQuery,
        adminPromptFilter: state.adminPromptFilter,
        adminTagQuery: state.adminTagQuery,
        adminTagFilter: state.adminTagFilter,
        adminTagSort: state.adminTagSort,
        adminTagPromptKey: state.adminTagPromptKey,
        adminUserQuery: state.adminUserQuery,
        adminUserActivityNickname: state.adminUserActivityNickname,
        adminPromptRevisionRequests: state.adminPromptRevisionRequests,
        adminReportFilter: state.adminReportFilter,
        reportRecords: state.reportRecords,
        searchScope: state.searchScope,
        popularSort: state.popularSort,
        savedSort: state.savedSort,
        guestImproveCount: state.guestImproveCount,
        recentThreads: state.recentThreads,
        makeFolders: state.makeFolders,
        activeFolderId: state.activeFolderId,
        activeThreadId: state.activeThreadId,
        messages: state.messages,
        composerDraft: state.composerDraft,
        templateCollapsed: state.templateCollapsed,
      },
    });
  }

  function loadPersistedAppState(ctx) {
    const {
      commentsByPrompt,
      getCurrentAccountScopeKey,
      getValidSearchScope,
      normalizeMakeFolders,
      normalizePersistedLikeCounts,
      normalizeSavedPromptOwnership,
      popularPrompts,
      restoreCurrentAccountScope,
      savedPrompts,
      state,
    } = ctx;

    const parsed = readPersistedPayload();
    if (!parsed) return;
    if (Array.isArray(parsed.popularPrompts)) {
      popularPrompts.splice(0, popularPrompts.length, ...parsed.popularPrompts);
    }
    if (Array.isArray(parsed.savedPrompts)) {
      savedPrompts.splice(0, savedPrompts.length, ...parsed.savedPrompts);
      normalizeSavedPromptOwnership();
    }
    if (parsed.commentsByPrompt && typeof parsed.commentsByPrompt === "object") {
      Object.keys(commentsByPrompt).forEach((key) => delete commentsByPrompt[key]);
      Object.assign(commentsByPrompt, parsed.commentsByPrompt);
    }

    const savedState = parsed.state || {};
    const storedToken = readStorageItem(AUTH_TOKEN_KEY);
    const restoredToken = storedToken || savedState.authToken || savedState.token || "";
    state.isLoggedIn = Boolean(savedState.isLoggedIn && restoredToken);
    state.currentUser = state.isLoggedIn ? savedState.currentUser || null : null;
    state.currentUserId = state.isLoggedIn ? savedState.currentUserId || null : null;
    state.currentUserRole = state.isLoggedIn ? savedState.currentUserRole || "user" : "user";
    state.authToken = state.isLoggedIn ? restoredToken : "";
    state.token = state.isLoggedIn ? restoredToken : "";
    state.accountScopes = savedState.accountScopes && typeof savedState.accountScopes === "object" ? savedState.accountScopes : {};
    state.libraryDemoSeeded = Boolean(savedState.libraryDemoSeeded);
    state.userLibraryPromptIds = new Set(Array.isArray(savedState.userLibraryPromptIds) ? savedState.userLibraryPromptIds : []);
    state.likedPromptIds = new Set(Array.isArray(savedState.likedPromptIds) ? savedState.likedPromptIds : []);
    state.likedCommentIds = new Set(Array.isArray(savedState.likedCommentIds) ? savedState.likedCommentIds : []);
    state.reportedPromptIds = new Set(Array.isArray(savedState.reportedPromptIds) ? savedState.reportedPromptIds : []);
    state.reportedCommentIds = new Set(Array.isArray(savedState.reportedCommentIds) ? savedState.reportedCommentIds : []);
    state.hideReportedPrompts = Boolean(savedState.hideReportedPrompts);
    if (state.accountScopes[getCurrentAccountScopeKey()]) {
      restoreCurrentAccountScope();
    }
    state.adminMode = Boolean(state.isLoggedIn && state.currentUserRole === "admin" && savedState.adminMode);
    if (state.adminMode) state.route = "admin";
    state.adminHiddenPromptIds = new Set(Array.isArray(savedState.adminHiddenPromptIds) ? savedState.adminHiddenPromptIds : []);
    state.adminTagDecisions = savedState.adminTagDecisions && typeof savedState.adminTagDecisions === "object" ? savedState.adminTagDecisions : {};
    state.adminTab = ["reports", "prompts", "tags", "users", "audit"].includes(savedState.adminTab) ? savedState.adminTab : "reports";
    state.adminPromptQuery = savedState.adminPromptQuery || "";
    state.adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(savedState.adminPromptFilter)
      ? savedState.adminPromptFilter
      : "all";
    state.adminTagQuery = savedState.adminTagQuery || "";
    state.adminTagFilter = ["all", "pending", "approved", "rejected", "disabled"].includes(savedState.adminTagFilter)
      ? savedState.adminTagFilter
      : "all";
    state.adminTagSort = ["usage", "recent"].includes(savedState.adminTagSort) ? savedState.adminTagSort : "usage";
    state.adminTagPromptKey = savedState.adminTagPromptKey || "";
    state.adminUserQuery = savedState.adminUserQuery || "";
    state.adminUserActivityNickname = savedState.adminUserActivityNickname || "";
    state.adminPromptRevisionRequests =
      savedState.adminPromptRevisionRequests && typeof savedState.adminPromptRevisionRequests === "object"
        ? savedState.adminPromptRevisionRequests
        : {};
    state.adminReportFilter = ["all", "prompt", "comment"].includes(savedState.adminReportFilter)
      ? savedState.adminReportFilter
      : "all";
    state.reportRecords = savedState.reportRecords && typeof savedState.reportRecords === "object" ? savedState.reportRecords : {};
    state.searchScope = getValidSearchScope(savedState.searchScope);
    state.popularSort = ["popular", "saves", "comments", "likes", "latest"].includes(savedState.popularSort)
      ? savedState.popularSort
      : "popular";
    state.savedSort = ["recent", "saves", "comments", "likes", "views"].includes(savedState.savedSort)
      ? savedState.savedSort
      : "recent";
    state.guestImproveCount = Number(savedState.guestImproveCount || 0);
    state.recentThreads = Array.isArray(savedState.recentThreads) ? savedState.recentThreads : [];
    state.makeFolders = normalizeMakeFolders(savedState.makeFolders);
    state.activeFolderId =
      state.makeFolders.some((folder) => folder.id === savedState.activeFolderId) || savedState.activeFolderId === "all"
        ? savedState.activeFolderId
        : "all";
    state.activeThreadId = savedState.activeThreadId || null;
    state.messages = Array.isArray(savedState.messages) ? savedState.messages : [];
    state.composerDraft = savedState.composerDraft || "";
    state.templateCollapsed = Boolean(savedState.templateCollapsed);
    normalizePersistedLikeCounts();
  }

  function createInitialState(options = {}) {
    const homePageSize = Number(options.homePageSize || 16);

    return {
      route: "home",
      authView: null,
      detailPromptId: null,
      detailHighlightCommentId: null,
      reportPromptId: null,
      reportCommentId: null,
      editingPromptId: null,
      adminRequestTargetKey: null,
      adminBlockTarget: null,
      editingMessageId: null,
      executeMessageId: null,
      executePromptId: null,
      confirmAction: null,
      hideReportedPrompts: false,
      adminMode: false,
      adminHiddenPromptIds: new Set(),
      adminTagDecisions: {},
      adminTab: "reports",
      adminReportFilter: "all",
      adminPromptQuery: "",
      adminPromptFilter: "all",
      adminTagQuery: "",
      adminTagFilter: "all",
      adminTagSort: "usage",
      adminTagPromptKey: "",
      adminUserQuery: "",
      adminUserActivityNickname: "",
      adminUserSearchResults: [],
      adminUserSearchMessage: "",
      adminPromptRevisionRequests: {},
      reportRecords: {},
      isLoggedIn: false,
      currentUser: null,
      currentUserId: null,
      currentUserRole: "user",
      authToken: "",
      token: "",
      accountScopes: {},
      isComposingSearch: false,
      isComposingShareTag: false,
      isComposingAdminPromptSearch: false,
      isComposingAdminTagSearch: false,
      authDraft: {},
      authDuplicateChecks: {},
      authUserIdWarning: "",
      authError: "",
      libraryDemoSeeded: false,
      userLibraryPromptIds: new Set(),
      searchTipShown: false,
      searchTipVisible: false,
      openFolderMenuId: null,
      openThreadMenuId: null,
      creatingThreadFolderId: null,
      openPromptCardMenuId: null,
      searchScope: "all",
      searchQuery: "",
      backendHomePage: {
        page: 1,
        size: homePageSize,
        totalPages: 1,
        totalElements: 0,
      },
      backendPopularTags: [],
      backendStatus: "checking",
      backendStatusMessage: "\uBC31\uC5D4\uB4DC \uC5F0\uACB0 \uD655\uC778 \uC911",
      myBackendStatus: "idle",
      adminBackendStatus: "idle",
      backendMyPrompts: [],
      backendMyComments: [],
      backendMyReports: [],
      backendLibraryPrompts: [],
      backendLikedPrompts: [],
      backendLibraryPromptIds: new Set(),
      backendAdminReports: [],
      backendAdminReportsLoaded: false,
      backendAdminTags: [],
      backendAdminPrompts: [],
      backendAdminRevisionRequests: [],
      backendAdminUserActivities: {},
      backendAdminAuditLogs: [],
      adminAuditSyncMessage: "",
      makeBackendStatus: "idle",
      makeBackendMessage: "",
      popularSort: "popular",
      popularPage: 1,
      savedPage: 1,
      savedSort: "recent",
      myPageTab: "library",
      shareError: "",
      shareTagQuery: "",
      notice: "",
      expandedComments: {},
      replyingCommentId: null,
      editingCommentId: null,
      likedPromptIds: new Set(),
      likedCommentIds: new Set(),
      reportedPromptIds: new Set(),
      reportedCommentIds: new Set(),
      pendingUnsaveIds: new Set(),
      composerDraft: "",
      templateCollapsed: false,
      guestImproveCount: 0,
      shareDraft: null,
      savedFilter: { community: true, mine: true, liked: false },
      messages: [],
      recentThreads: [],
      makeFolders: [{ id: "uncategorized", name: "\uBBF8\uBD84\uB958" }],
      activeFolderId: "all",
      creatingFolder: false,
      editingFolderId: null,
      activeThreadId: null,
      copiedMessageId: "",
    };
  }

  function resetHomeViewState(state) {
    state.searchScope = "all";
    state.searchQuery = "";
    state.popularPage = 1;
    state.detailPromptId = null;
    state.detailHighlightCommentId = null;
  }

  function applyHomeSearchScopeState(state, scope) {
    state.searchScope = scope;
    state.popularPage = 1;
  }

  function applyHomeSortState(state, sort) {
    state.popularSort = sort;
    state.popularPage = 1;
  }

  function applyHomePageState(state, page) {
    state.popularPage = Number(page);
  }

  function applyHomeSearchQueryState(state, query) {
    const nextQuery = String(query || "");
    if (state.searchQuery === nextQuery) return false;
    state.searchQuery = nextQuery;
    state.popularPage = 1;
    return true;
  }

  function applyHomeTagSearchState(state, tag) {
    state.searchScope = "tag";
    state.searchQuery = tag;
    state.popularPage = 1;
    state.detailPromptId = null;
    state.route = "home";
  }

  function applyHomeAuthorSearchState(state, author) {
    state.searchScope = "author";
    state.searchQuery = author;
    state.popularPage = 1;
    state.detailPromptId = null;
    state.detailHighlightCommentId = null;
    state.route = "home";
  }

  function toggleReportedVisibilityState(state) {
    state.hideReportedPrompts = !state.hideReportedPrompts;
    state.popularPage = 1;
    state.savedPage = 1;
  }

  function closeTopModalState(state) {
    if (state.confirmAction) {
      state.confirmAction = null;
    } else if (state.adminBlockTarget) {
      state.adminBlockTarget = null;
    } else if (state.executeMessageId) {
      state.executeMessageId = null;
    } else if (state.executePromptId) {
      state.executePromptId = null;
    } else if (state.reportPromptId) {
      state.reportPromptId = null;
    } else if (state.reportCommentId) {
      state.reportCommentId = null;
    } else if (state.authView) {
      state.authView = null;
    } else if (state.adminRequestTargetKey) {
      state.adminRequestTargetKey = null;
    } else if (state.editingPromptId) {
      state.editingPromptId = null;
    } else if (state.detailPromptId) {
      state.detailPromptId = null;
      state.detailHighlightCommentId = null;
    } else {
      return false;
    }

    return true;
  }

  function applyAuthenticatedIdentityState(state, authResult) {
    state.isLoggedIn = true;
    state.currentUser = authResult.user.nickname;
    state.currentUserId = authResult.user.id;
    state.currentUserRole = authResult.user.role || "user";
    state.authToken = authResult.token;
    state.token = authResult.token;
    state.adminMode = state.currentUserRole === "admin";
    if (state.adminMode) state.route = "admin";
  }

  function clearAuthenticatedIdentityState(state) {
    state.isLoggedIn = false;
    state.currentUser = null;
    state.currentUserId = null;
    state.currentUserRole = "user";
    state.authToken = "";
    state.token = "";
  }

  function resetSessionBackendState(state) {
    state.myBackendStatus = "idle";
    state.adminBackendStatus = "idle";
    state.makeBackendStatus = "idle";
  }

  function clearSessionBackendDataState(state) {
    state.backendMyPrompts = [];
    state.backendMyComments = [];
    state.backendMyReports = [];
    state.backendLibraryPrompts = [];
    state.backendLikedPrompts = [];
    state.backendLibraryPromptIds = new Set();
    state.backendAdminReports = [];
    state.backendAdminReportsLoaded = false;
    state.backendAdminTags = [];
  }

  function clearTransientSessionUiState(state) {
    state.creatingFolder = false;
    state.editingFolderId = null;
    state.openFolderMenuId = null;
    state.creatingThreadFolderId = null;
    state.openThreadMenuId = null;
    state.openPromptCardMenuId = null;
    state.detailPromptId = null;
    state.detailHighlightCommentId = null;
    state.reportPromptId = null;
    state.reportCommentId = null;
    state.editingPromptId = null;
    state.adminRequestTargetKey = null;
    state.editingMessageId = null;
    state.executeMessageId = null;
    state.executePromptId = null;
  }

  function clearAuthenticatedSessionState(state, options = {}) {
    clearAuthenticatedIdentityState(state);
    state.adminMode = false;
    state.authView = null;
    state.authError = "";
    resetSessionBackendState(state);
    clearSessionBackendDataState(state);
    clearTransientSessionUiState(state);
    if (!options.keepRoute || state.route === "admin" || state.route === "saved") state.route = "home";
  }

  function applyExistingPromptSavedState(ctx, promptId, savedPrompt) {
    const { state, upsertPrompt, updatePromptField } = ctx;
    savedPrompt.savedByMe = true;
    state.userLibraryPromptIds.add(promptId);
    state.backendLibraryPromptIds.add(promptId);
    if (state.myBackendStatus === "connected") {
      upsertPrompt(state.backendLibraryPrompts, { ...savedPrompt, savedByMe: true });
    }
    state.pendingUnsaveIds.delete(promptId);
    updatePromptField(promptId, "saves", 1);
  }

  function applyBackendPromptUnsavedState(ctx, promptId, savedPrompt) {
    const { state, updatePromptField } = ctx;
    savedPrompt.savedByMe = false;
    state.pendingUnsaveIds.delete(promptId);
    state.userLibraryPromptIds.delete(promptId);
    state.backendLibraryPromptIds.delete(promptId);
    state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
    updatePromptField(promptId, "saves", -1);
  }

  function togglePendingUnsaveState(ctx, promptId) {
    const { state, updatePromptField } = ctx;
    if (state.pendingUnsaveIds.has(promptId)) {
      state.pendingUnsaveIds.delete(promptId);
      updatePromptField(promptId, "saves", 1);
      return "restored";
    }

    state.pendingUnsaveIds.add(promptId);
    updatePromptField(promptId, "saves", -1);
    return "pending";
  }

  function applyPromptUnsavedState(ctx, promptId, savedPrompt, savedIndex) {
    const { findPromptById, savedPrompts, state, updatePromptField } = ctx;
    if (savedPrompt.source === "mine") {
      savedPrompt.savedByMe = false;
    } else {
      savedPrompts.splice(savedIndex, 1);
    }
    state.userLibraryPromptIds.delete(promptId);
    state.backendLibraryPromptIds.delete(promptId);
    state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
    updatePromptField(promptId, "saves", -1);
    if (state.detailPromptId === promptId && !findPromptById(promptId)) {
      state.detailPromptId = null;
    }
  }

  function applyNewPromptSavedState(ctx, promptId, prompt) {
    const { findPromptById, savedPrompts, state, upsertPrompt, updatePromptField } = ctx;
    updatePromptField(promptId, "saves", 1);
    const updatedPrompt = findPromptById(promptId) || prompt;
    const normalized = {
      ...updatedPrompt,
      source: prompt.source === "mine" ? "mine" : "community",
      savedByMe: true,
    };

    savedPrompts.unshift(normalized);
    state.userLibraryPromptIds.add(promptId);
    state.backendLibraryPromptIds.add(promptId);
    if (state.myBackendStatus === "connected") {
      upsertPrompt(state.backendLibraryPrompts, normalized);
    }
  }

  function normalizeSavedPageState(state, filteredCount, pageSize) {
    const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
    state.savedPage = Math.min(state.savedPage, totalPages);
  }

  function applyPendingUnsavesState(ctx, { nextRoute, nextMyPageTab, pageSize }) {
    const { findPromptById, getSavedFilteredCount, savedPrompts, state } = ctx;
    const staysInLibrary =
      state.route === "saved" &&
      nextRoute === "saved" &&
      state.myPageTab === "library" &&
      nextMyPageTab === "library";

    if (state.route !== "saved" || staysInLibrary || state.pendingUnsaveIds.size === 0) return [];

    const promptIds = [...state.pendingUnsaveIds];
    promptIds.forEach((promptId) => {
      const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);
      if (savedIndex >= 0) {
        if (savedPrompts[savedIndex].source === "mine") {
          savedPrompts[savedIndex].savedByMe = false;
        } else {
          savedPrompts.splice(savedIndex, 1);
        }
        state.userLibraryPromptIds.delete(promptId);
      }
      if (state.detailPromptId === promptId && !findPromptById(promptId)) {
        state.detailPromptId = null;
      }
    });

    state.pendingUnsaveIds.clear();
    normalizeSavedPageState(state, getSavedFilteredCount(), pageSize);
    return promptIds;
  }

  function applyDeletedPromptState(ctx, promptId, pageSize) {
    const { getSavedFilteredCount, popularPrompts, savedPrompts, state } = ctx;
    removePromptByIdState(popularPrompts, promptId);
    removePromptByIdState(savedPrompts, promptId);
    state.userLibraryPromptIds.delete(promptId);
    state.backendLibraryPromptIds.delete(promptId);
    state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
    state.backendLikedPrompts = state.backendLikedPrompts.filter((prompt) => prompt.id !== promptId);
    state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
    normalizeSavedPageState(state, getSavedFilteredCount(), pageSize);
  }

  function applyPromptLikedState(ctx, promptId, prompt) {
    const { state, upsertPrompt, updatePromptField } = ctx;
    state.likedPromptIds.add(promptId);
    if (prompt && state.myBackendStatus === "connected") {
      upsertPrompt(state.backendLikedPrompts, { ...prompt, likedByMe: true });
    }
    updatePromptField(promptId, "likes", 1);
  }

  function applyPromptUnlikedState(ctx, promptId) {
    const { state, updatePromptField } = ctx;
    state.likedPromptIds.delete(promptId);
    state.backendLikedPrompts = state.backendLikedPrompts.filter((prompt) => prompt.id !== promptId);
    updatePromptField(promptId, "likes", -1);
  }

  function applyPublishedSavedPromptState(ctx, prompt, backendPrompt) {
    const { popularPrompts, state } = ctx;
    if (backendPrompt) {
      Object.assign(prompt, backendPrompt, {
        source: "mine",
        isShared: true,
        savedByMe: prompt.savedByMe,
        author: state.currentUser || backendPrompt.author,
        owner: state.currentUser || backendPrompt.owner || backendPrompt.author,
      });
    }

    prompt.isShared = true;
    prompt.source = "mine";
    prompt.author = state.currentUser || prompt.author || "\uC775\uBA85";
    prompt.owner = state.currentUser || prompt.owner || prompt.author;
    prompt.createdAt = prompt.createdAt || Date.now();

    const popularIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
    if (popularIndex >= 0) {
      popularPrompts[popularIndex] = { ...popularPrompts[popularIndex], ...prompt, isShared: true, source: "mine" };
    } else {
      popularPrompts.unshift({ ...prompt, isShared: true, source: "mine" });
    }

    state.popularSort = "latest";
    state.popularPage = 1;
    state.userLibraryPromptIds.add(prompt.id);
  }

  function applyEditedPromptState(ctx, promptId, nextValues, revisionKey) {
    const { popularPrompts, savedPrompts, state } = ctx;
    [popularPrompts, savedPrompts].forEach((list) => {
      const item = list.find((entry) => entry.id === promptId);
      if (item) Object.assign(item, nextValues);
    });

    if (state.adminPromptRevisionRequests[revisionKey] || state.adminPromptRevisionRequests[promptId]) {
      const { [revisionKey]: _resolvedRequest, [promptId]: _legacyRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
      state.adminPromptRevisionRequests = remainingRequests;
    }

    state.editingPromptId = null;
  }

  function applyUnsharedPromptState(ctx, promptId, prompt) {
    const { popularPrompts, savedPrompts, state } = ctx;
    removePromptByIdState(popularPrompts, promptId);
    const savedPrompt = savedPrompts.find((item) => item.id === promptId);
    if (savedPrompt) {
      savedPrompt.isShared = false;
      savedPrompt.source = "mine";
    } else {
      savedPrompts.unshift({ ...prompt, isShared: false, source: "mine" });
    }

    state.popularPage = 1;
    state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
  }

  function applySharedPromptState(ctx, localPrompt, finalPrompt) {
    const { commentsByPrompt, existingPrompt, popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
    if (localPrompt.id !== finalPrompt.id) {
      removePromptByIdState(popularPrompts, localPrompt.id);
      removePromptByIdState(savedPrompts, localPrompt.id);
    }

    upsertPrompt(popularPrompts, finalPrompt);
    upsertPrompt(savedPrompts, finalPrompt);
    state.userLibraryPromptIds.add(finalPrompt.id);
    state.backendLibraryPromptIds.add(finalPrompt.id);
    if (state.myBackendStatus === "connected") {
      upsertPrompt(state.backendLibraryPrompts, finalPrompt);
      upsertPrompt(state.backendMyPrompts, finalPrompt);
    }
    if (!commentsByPrompt[finalPrompt.id]) commentsByPrompt[finalPrompt.id] = [];

    state.searchQuery = "";
    state.popularSort = "latest";
    state.popularPage = 1;
    state.shareError = "";
    state.shareDraft = null;
    state.route = "home";
    return existingPrompt;
  }

  function applyAdminRevisionRequestState(state, target, request, fallback = {}) {
    state.adminPromptRevisionRequests = {
      ...state.adminPromptRevisionRequests,
      [target.key]: {
        ...fallback.previousRequest,
        ...request,
        id: request?.id || fallback.id || "",
        type: target.type,
        targetId: target.id,
        reason: request?.reason || request?.message || fallback.reason || "",
        requestedAt: request?.requestedAt || fallback.requestedAt || Date.now(),
        status: request?.status || fallback.status || "pending",
      },
    };
  }

  function finishAdminRevisionRequestState(state) {
    state.adminRequestTargetKey = null;
  }

  function applyAdminUserBlockActivityState(ctx, { activity, memberId, shouldBlock, nickname }) {
    const { getAdminUserActivity, normalizeAdminSearchText, state } = ctx;
    const displayNickname = String(activity?.nickname || nickname || state.adminUserActivityNickname || "\uC0AC\uC6A9\uC790").trim();
    const normalizedNickname = normalizeAdminSearchText(displayNickname);
    const previousActivity = state.backendAdminUserActivities[normalizedNickname] || getAdminUserActivity(displayNickname);

    state.backendAdminUserActivities = {
      ...state.backendAdminUserActivities,
      [normalizedNickname]: {
        ...previousActivity,
        ...activity,
        prompts: previousActivity.prompts || activity?.prompts || [],
        comments: previousActivity.comments || activity?.comments || [],
        replies: previousActivity.replies || activity?.replies || [],
        reportsMade: previousActivity.reportsMade || activity?.reportsMade || [],
        reportsReceived: previousActivity.reportsReceived || activity?.reportsReceived || [],
        nickname: displayNickname,
        memberId,
        blocked: shouldBlock,
      },
    };
    state.adminUserActivityNickname = displayNickname;
    state.adminUserQuery = displayNickname;
    state.adminBlockTarget = null;
    state.adminBackendStatus = "idle";

    return { displayNickname, normalizedNickname };
  }

  function applyAdminUserActivityRefreshState(state, { refreshedActivity, normalizedNickname, displayNickname, memberId, shouldBlock }) {
    const currentActivity = state.backendAdminUserActivities[normalizedNickname] || {};
    state.backendAdminUserActivities = {
      ...state.backendAdminUserActivities,
      [normalizedNickname]: {
        ...currentActivity,
        ...refreshedActivity,
        nickname: displayNickname,
        memberId,
        blocked: shouldBlock,
      },
    };
  }

  function applyAdminTagDecisionState(state, { tag, decision, backendTag, updated, normalizeTag }) {
    if (backendTag?.id && updated) {
      state.backendAdminTags = state.backendAdminTags.map((item) =>
        item.id === backendTag.id ? { ...item, ...updated, status: updated.status || decision } : item,
      );
    }
    const key = backendTag?.key || tag;
    state.adminTagDecisions = { ...state.adminTagDecisions, [key]: decision };
    if (key !== tag && normalizeTag) {
      state.adminTagDecisions = { ...state.adminTagDecisions, [tag]: decision };
    }
  }

  function applyAdminReportStatusState(state, { key, record, status, updated, mapBackendReportStatus, getReportRecord }) {
    let nextStatus = status;
    if (record?.backendId && updated) {
      nextStatus = mapBackendReportStatus(updated?.status || status);
      state.backendAdminReports = state.backendAdminReports.map((report) =>
        report.id === record.backendId ? { ...report, ...updated, status: updated?.status || status } : report,
      );
    }
    state.reportRecords[key] = { ...getReportRecord(key), status: nextStatus, updatedAt: Date.now() };
    return nextStatus;
  }

  function applyAdminPromptHiddenState(state, promptId, shouldHide) {
    if (shouldHide) {
      state.adminHiddenPromptIds.add(promptId);
    } else {
      state.adminHiddenPromptIds.delete(promptId);
    }
  }

  function removePromptByIdState(list, promptId) {
    const index = list.findIndex((item) => item.id === promptId);
    if (index >= 0) list.splice(index, 1);
  }

  function applyPromptReportedState(ctx, promptId, reason) {
    const { state } = ctx;
    state.reportedPromptIds.add(promptId);
    state.reportRecords[`prompt:${promptId}`] = {
      type: "prompt",
      targetId: promptId,
      status: "pending",
      reporter: state.currentUser || "",
      reason,
      createdAt: Date.now(),
    };
    state.reportPromptId = null;
  }

  function applyCommentReportedState(ctx, commentId, reason, context) {
    const { makePreview, state } = ctx;
    state.reportedCommentIds.add(commentId);
    state.reportRecords[`comment:${commentId}`] = {
      type: "comment",
      targetId: commentId,
      promptId: context?.promptId || "",
      reporter: state.currentUser || "",
      targetAuthor: context?.comment?.author || context?.comment?.owner || "",
      targetPreview: makePreview(context?.comment?.text || ""),
      status: "pending",
      reason,
      createdAt: Date.now(),
    };
    state.reportCommentId = null;
  }

  function updatePromptCommentCountState(ctx, promptId, delta) {
    const { popularPrompts, savedPrompts } = ctx;
    const updated = new Set();

    for (const list of [popularPrompts, savedPrompts]) {
      const prompt = list.find((item) => item.id === promptId);
      if (!prompt || updated.has(prompt)) continue;
      prompt.comments = Math.max(0, Number(prompt.comments || 0) + delta);
      updated.add(prompt);
    }
  }

  function addPromptCommentState(ctx, promptId, text, now = Date.now()) {
    const { commentsByPrompt, state } = ctx;
    if (!commentsByPrompt[promptId]) commentsByPrompt[promptId] = [];

    const comment = {
      id: `comment-${now}`,
      author: state.currentUser || "\uC775\uBA85",
      owner: state.currentUser || "\uC775\uBA85",
      text,
      likes: 0,
      replies: [],
    };

    commentsByPrompt[promptId].push(comment);
    state.expandedComments[promptId] = true;
    updatePromptCommentCountState(ctx, promptId, 1);
    return comment;
  }

  function toggleReplyCommentState(state, commentId) {
    state.replyingCommentId = state.replyingCommentId === commentId ? null : commentId;
  }

  function addCommentReplyState(ctx, parentComment, promptId, text, now = Date.now()) {
    const { state } = ctx;
    if (!Array.isArray(parentComment.replies)) parentComment.replies = [];

    const reply = {
      id: `reply-${now}`,
      author: state.currentUser || "\uC775\uBA85",
      owner: state.currentUser || "\uC775\uBA85",
      text,
      likes: 0,
      replies: [],
    };

    parentComment.replies.push(reply);
    state.replyingCommentId = null;
    if (promptId) updatePromptCommentCountState(ctx, promptId, 1);
    return reply;
  }

  function toggleEditCommentState(state, commentId) {
    state.editingCommentId = state.editingCommentId === commentId ? null : commentId;
    state.replyingCommentId = null;
  }

  function updateOwnCommentState(state, comment, commentId, text, revisionKey) {
    const changed = comment.text !== text;
    if (changed) {
      comment.text = text;
      comment.edited = true;
    }

    if (revisionKey && state.adminPromptRevisionRequests[revisionKey]) {
      const { [revisionKey]: _resolvedRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
      state.adminPromptRevisionRequests = remainingRequests;
    }

    if (state.editingCommentId === commentId) state.editingCommentId = null;
    return changed;
  }

  function toggleCommentLikedState(state, commentId, comment, getCommentLikes) {
    const wasLiked = state.likedCommentIds.has(commentId);
    if (wasLiked) {
      state.likedCommentIds.delete(commentId);
      comment.likes = Math.max(0, getCommentLikes(comment) - 1);
    } else {
      state.likedCommentIds.add(commentId);
      comment.likes = getCommentLikes(comment) + 1;
    }

    return { wasLiked };
  }

  function removeCommentFromListState(comments, commentId, canRemoveComment) {
    for (let index = 0; index < comments.length; index += 1) {
      const comment = comments[index];
      if (comment.id === commentId && canRemoveComment(comment)) {
        if ((comment.replies || []).length > 0) {
          comment.deleted = true;
          comment.text = "\uC0AD\uC81C\uB41C \uB313\uAE00\uC785\uB2C8\uB2E4.";
          comment.author = "\uC0AD\uC81C\uB41C \uB313\uAE00";
          comment.owner = null;
          comment.likes = 0;
          comment.edited = false;
          return true;
        }

        comments.splice(index, 1);
        return true;
      }

      if (removeCommentFromListState(comment.replies || [], commentId, canRemoveComment)) {
        return true;
      }
    }

    return false;
  }

  function deleteCommentState(ctx, promptId, comments, commentId, canRemoveComment) {
    const { state } = ctx;
    const removed = removeCommentFromListState(comments, commentId, canRemoveComment);
    if (!removed) return false;

    updatePromptCommentCountState(ctx, promptId, -1);
    state.likedCommentIds.delete(commentId);
    state.reportedCommentIds.delete(commentId);
    if (state.replyingCommentId === commentId) state.replyingCommentId = null;
    if (state.editingCommentId === commentId) state.editingCommentId = null;
    return true;
  }

  function deleteMakeThreadState(state, threadId) {
    state.recentThreads = state.recentThreads.filter((thread) => thread.id !== threadId);
    if (state.activeThreadId === threadId) {
      state.activeThreadId = null;
      state.messages = [];
      state.composerDraft = "";
    }
  }

  function createLocalMakeFolderState(state, name) {
    const folder = { id: `folder-${Date.now()}`, name };
    state.makeFolders.push(folder);
    return folder;
  }

  function removeLocalMakeFolderState(state, folderId) {
    state.makeFolders = state.makeFolders.filter((item) => item.id !== folderId);
  }

  function restoreMakeThreadFolderState(thread, folderId) {
    if (thread) thread.folderId = folderId || "uncategorized";
  }

  function deleteMakeFolderState(ctx, folderId) {
    const { state } = ctx;
    removeLocalMakeFolderState(state, folderId);
    state.recentThreads.forEach((thread) => {
      if (thread.folderId === folderId) thread.folderId = "uncategorized";
    });
    if (state.activeFolderId === folderId) state.activeFolderId = "all";
  }

  function updateRecentMakeThreadState(ctx, threadId) {
    const { makePreview, makePromptTitle, state } = ctx;
    const lastUser = [...state.messages].reverse().find((message) => message.role === "user");
    const firstUser = state.messages.find((message) => message.role === "user");
    const lastAssistant = [...state.messages].reverse().find((message) => message.role === "assistant");
    const existingThread = state.recentThreads.find((item) => item.id === threadId);
    const thread = {
      id: threadId,
      dedupeKey: threadId,
      title: makePromptTitle(lastUser?.content || "새 대화"),
      preview: makePreview(lastAssistant?.content || lastUser?.content || ""),
      createdAt: existingThread?.createdAt || Date.now(),
      folderId: existingThread?.folderId || (state.activeFolderId !== "all" ? state.activeFolderId : "uncategorized"),
      serverId: existingThread?.serverId || "",
      messages: state.messages.map((item) => ({ ...item })),
    };

    state.recentThreads = [thread, ...state.recentThreads.filter((item) => item.id !== threadId)].slice(0, 8);
    return thread;
  }

  function openRecentMakeThreadState(state, thread) {
    state.activeThreadId = thread.id;
    state.messages = thread.messages.map((item) => ({ ...item }));
    state.route = "make";
  }

  function openSavedMakePromptState(ctx, promptId, prompt) {
    const { updateRecentThread, state } = ctx;
    const threadId = `saved-thread-${promptId}`;
    state.activeThreadId = threadId;
    state.messages = prompt.messages.map((item) => ({ ...item }));
    updateRecentThread(threadId);
    state.route = "make";
  }

  function startNewMakeChatState(state) {
    state.activeThreadId = null;
    state.messages = [];
    state.copiedMessageId = "";
    state.composerDraft = "";
  }

  function appendMakeUserMessageState(state, threadId, message) {
    state.activeThreadId = threadId;
    state.messages.push(message);
  }

  function appendMakeAssistantMessageState(state, message) {
    state.messages.push(message);
    state.composerDraft = "";
  }

  function applyEditedMakeMessageState(state, index, cleanValue, now) {
    state.messages = state.messages.slice(0, index + 1);
    state.messages[index] = { ...state.messages[index], content: cleanValue, editedAt: now };
  }

  function finishEditedMakeMessageState(state, message) {
    state.messages.push(message);
    state.editingMessageId = null;
  }

  function toggleSavedMakeMessageState(ctx, message, finalPrompt) {
    const { makePromptTitle, savedPrompts, state } = ctx;
    const savedIndex = savedPrompts.findIndex((item) => item.id === message.id);
    if (savedIndex >= 0) {
      savedPrompts.splice(savedIndex, 1);
      state.userLibraryPromptIds.delete(message.id);
      state.savedPage = 1;
      return "removed";
    }

    savedPrompts.unshift({
      id: message.id,
      title: makePromptTitle(message.sourcePrompt || finalPrompt),
      text: finalPrompt,
      tags: ["내프롬프트", "Make", "첨삭"],
      views: 0,
      comments: 0,
      saves: 1,
      author: state.currentUser || "나",
      owner: state.currentUser || "나",
      source: "mine",
      isShared: false,
      savedByMe: true,
      sourcePrompt: message.sourcePrompt || finalPrompt,
      messages: state.messages.map((item) => ({ ...item })),
    });
    state.userLibraryPromptIds.add(message.id);
    state.savedPage = 1;
    return "added";
  }

  global.TtalkakState = /** @type {TtalkakStateModule} */ (/** @type {unknown} */ (Object.freeze({
    ...(global.TtalkakState || {}),
    STORAGE_KEY,
    AUTH_TOKEN_KEY,
    DEMO_AUTH_TOKEN,
    addCommentReplyState,
    addPromptCommentState,
    applyAdminPromptHiddenState,
    applyAdminReportStatusState,
    applyAdminRevisionRequestState,
    applyAdminTagDecisionState,
    applyAdminUserActivityRefreshState,
    applyAdminUserBlockActivityState,
    applyBackendPromptUnsavedState,
    applyAuthenticatedIdentityState,
    applyCommentReportedState,
    applyHomeAuthorSearchState,
    applyHomePageState,
    applyHomeSearchQueryState,
    applyHomeSearchScopeState,
    applyHomeSortState,
    applyHomeTagSearchState,
    toggleReportedVisibilityState,
    applyEditedPromptState,
    deleteCommentState,
    applyExistingPromptSavedState,
    applyNewPromptSavedState,
    applyDeletedPromptState,
    applyPendingUnsavesState,
    applyPublishedSavedPromptState,
    applySharedPromptState,
    applyPromptLikedState,
    applyPromptReportedState,
    applyPromptUnlikedState,
    applyPromptUnsavedState,
    applyUnsharedPromptState,
    toggleCommentLikedState,
    toggleEditCommentState,
    toggleReplyCommentState,
    clearAuthenticatedIdentityState,
    clearAuthenticatedSessionState,
    createInitialState,
    closeTopModalState,
    clearPersistedPayload,
    clearSessionBackendDataState,
    clearTransientSessionUiState,
    createLocalMakeFolderState,
    deleteMakeFolderState,
    deleteMakeThreadState,
    finishAdminRevisionRequestState,
    loadPersistedAppState,
    readPersistedPayload,
    readStorageItem,
    removeStorageItem,
    removePromptByIdState,
    removeLocalMakeFolderState,
    restoreMakeThreadFolderState,
    resetSessionBackendState,
    resetHomeViewState,
    normalizeSavedPageState,
    persistAppState,
    appendMakeAssistantMessageState,
    appendMakeUserMessageState,
    applyEditedMakeMessageState,
    finishEditedMakeMessageState,
    openRecentMakeThreadState,
    openSavedMakePromptState,
    startNewMakeChatState,
    togglePendingUnsaveState,
    toggleSavedMakeMessageState,
    updateOwnCommentState,
    updatePromptCommentCountState,
    updateRecentMakeThreadState,
    writePersistedPayload,
    writeStorageItem,
  })));
})(window);
