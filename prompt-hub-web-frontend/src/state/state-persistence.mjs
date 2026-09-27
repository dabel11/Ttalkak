// @ts-check
  "use strict";

const STORAGE_KEY = "prompt_hub_web_state_v2";
const AUTH_TOKEN_KEY = "ttalkak_access_token";
function readStorageItem(/** @type {string} */ key) {
  try {
    return globalThis.window?.localStorage?.getItem(key) || "";
  } catch (_error) {
    return "";
  }
}


function writeStorageItem(/** @type {string} */ key, /** @type {string} */ value) {
  try {
    globalThis.window?.localStorage?.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}


function removeStorageItem(/** @type {string} */ key) {
  try {
    globalThis.window?.localStorage?.removeItem(key);
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


function writePersistedPayload(/** @type {TtalkakStateEntity} */ payload) {
  return writeStorageItem(STORAGE_KEY, JSON.stringify(payload));
}


function clearPersistedPayload() {
  return removeStorageItem(STORAGE_KEY);
}


function persistAppState(/** @type {TtalkakStateContext} */ ctx) {
  const { commentsByPrompt, popularPrompts, saveCurrentAccountScope, savedPrompts, state } = ctx;
  saveCurrentAccountScope();
  writePersistedPayload({
    "popularPrompts": popularPrompts,
    "savedPrompts": savedPrompts
      .filter((/** @returns {prompt is TtalkakStateEntity & {id: TtalkakId}} */ prompt) => prompt.id !== undefined && (!state.pendingUnsaveIds.has(prompt.id) || prompt.source === "mine"))
      .map((prompt) => {
        const promptId = /** @type {TtalkakId} */ (prompt.id);
        return state.pendingUnsaveIds.has(promptId) && prompt.source === "mine" ? { ...prompt, savedByMe: false } : prompt;
      }),
    "commentsByPrompt": commentsByPrompt,
    "state": {
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


function loadPersistedAppState(/** @type {TtalkakStateContext} */ ctx) {
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
  if (Array.isArray(parsed["popularPrompts"])) {
    popularPrompts.splice(0, popularPrompts.length, ...parsed["popularPrompts"]);
  }
  if (Array.isArray(parsed["savedPrompts"])) {
    savedPrompts.splice(0, savedPrompts.length, ...parsed["savedPrompts"]);
    normalizeSavedPromptOwnership();
  }
  if (parsed["commentsByPrompt"] && typeof parsed["commentsByPrompt"] === "object") {
    Object.keys(commentsByPrompt).forEach((key) => delete commentsByPrompt[key]);
    Object.assign(commentsByPrompt, parsed["commentsByPrompt"]);
  }

  const savedState = parsed["state"] || {};
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


const api = Object.freeze({ STORAGE_KEY, AUTH_TOKEN_KEY, readStorageItem, writeStorageItem, removeStorageItem, readPersistedPayload, writePersistedPayload, clearPersistedPayload, persistAppState, loadPersistedAppState });
export { api };
