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

  global.TtalkakState = Object.freeze({
    ...(global.TtalkakState || {}),
    STORAGE_KEY,
    AUTH_TOKEN_KEY,
    DEMO_AUTH_TOKEN,
    applyAuthenticatedIdentityState,
    clearAuthenticatedIdentityState,
    clearAuthenticatedSessionState,
    createInitialState,
    closeTopModalState,
    clearPersistedPayload,
    clearSessionBackendDataState,
    clearTransientSessionUiState,
    readPersistedPayload,
    readStorageItem,
    removeStorageItem,
    resetSessionBackendState,
    resetHomeViewState,
    writePersistedPayload,
    writeStorageItem,
  });
})(window);
