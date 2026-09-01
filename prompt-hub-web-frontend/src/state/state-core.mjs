// @ts-check
  "use strict";

const DEMO_AUTH_TOKEN = "demo-token";
function createInitialState(/** @type {{makeRequestState?: TtalkakStateEntity, homePageSize?: number}} */ options = {}) {
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
    compactHeaderOpen: false,
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
    mobileTemplateExpanded: false,
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


function resetHomeViewState(/** @type {TtalkakApplicationState} */ state) {
  state.searchScope = "all";
  state.searchQuery = "";
  state.popularPage = 1;
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
}


function applyHomeSearchScopeState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ scope) {
  state.searchScope = scope;
  state.popularPage = 1;
}


function applyHomeSortState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ sort) {
  state.popularSort = sort;
  state.popularPage = 1;
}


function applyHomePageState(/** @type {TtalkakApplicationState} */ state, /** @type {number} */ page) {
  state.popularPage = Number(page);
}


function applyHomeSearchQueryState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ query) {
  const nextQuery = String(query || "");
  if (state.searchQuery === nextQuery) return false;
  state.searchQuery = nextQuery;
  state.popularPage = 1;
  return true;
}


function applyHomeTagSearchState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ tag) {
  state.searchScope = "tag";
  state.searchQuery = tag;
  state.popularPage = 1;
  state.detailPromptId = null;
  state.route = "home";
}


function applyHomeAuthorSearchState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ author) {
  state.searchScope = "author";
  state.searchQuery = author;
  state.popularPage = 1;
  state.detailPromptId = null;
  state.detailHighlightCommentId = null;
  state.route = "home";
}


function toggleReportedVisibilityState(/** @type {TtalkakApplicationState} */ state) {
  state.hideReportedPrompts = !state.hideReportedPrompts;
  state.popularPage = 1;
  state.savedPage = 1;
}


function closeTopModalState(/** @type {TtalkakApplicationState} */ state) {
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


function applyAuthenticatedIdentityState(/** @type {TtalkakApplicationState} */ state, /** @type {{user: {nickname: string, id: TtalkakId, role?: string}, token: string}} */ authResult) {
  state.isLoggedIn = true;
  state.currentUser = authResult.user.nickname;
  state.currentUserId = authResult.user.id;
  state.currentUserRole = authResult.user.role || "user";
  state.authToken = authResult.token;
  state.token = authResult.token;
  state.adminMode = state.currentUserRole === "admin";
  if (state.adminMode) state.route = "admin";
}


function clearAuthenticatedIdentityState(/** @type {TtalkakApplicationState} */ state) {
  state.isLoggedIn = false;
  state.currentUser = null;
  state.currentUserId = null;
  state.currentUserRole = "user";
  state.authToken = "";
  state.token = "";
}


function resetSessionBackendState(/** @type {TtalkakApplicationState} */ state) {
  state.myBackendStatus = "idle";
  state.adminBackendStatus = "idle";
  state.makeBackendStatus = "idle";
}


function clearSessionBackendDataState(/** @type {TtalkakApplicationState} */ state) {
  state.backendMyPrompts = [];
  state.backendMyComments = [];
  state.backendMyReports = [];
  state.backendLibraryPrompts = [];
  state.backendLikedPrompts = [];
  state.backendLibraryPromptIds = new Set();
  state.backendAdminReports = [];
  state.backendAdminReportsLoaded = false;
  state.backendAdminTags = [];
  state.backendAdminPrompts = [];
  state.backendAdminRevisionRequests = [];
  state.backendAdminUserActivities = {};
  state.backendAdminAuditLogs = [];
  state.adminAuditSyncMessage = "";
  state.adminUserSearchResults = [];
  state.adminUserSearchMessage = "";
}


function clearTransientSessionUiState(/** @type {TtalkakApplicationState} */ state) {
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


function clearAuthenticatedSessionState(/** @type {TtalkakApplicationState} */ state, /** @type {{keepRoute?: boolean}} */ options = {}) {
  clearAuthenticatedIdentityState(state);
  state.adminMode = false;
  state.authView = null;
  state.authError = "";
  resetSessionBackendState(state);
  clearSessionBackendDataState(state);
  clearTransientSessionUiState(state);
  if (!options.keepRoute || state.route === "admin" || state.route === "saved") state.route = "home";
}


const api = Object.freeze({ DEMO_AUTH_TOKEN, createInitialState, resetHomeViewState, applyHomeSearchScopeState, applyHomeSortState, applyHomePageState, applyHomeSearchQueryState, applyHomeTagSearchState, applyHomeAuthorSearchState, toggleReportedVisibilityState, closeTopModalState, applyAuthenticatedIdentityState, clearAuthenticatedIdentityState, resetSessionBackendState, clearSessionBackendDataState, clearTransientSessionUiState, clearAuthenticatedSessionState });
export { api };
