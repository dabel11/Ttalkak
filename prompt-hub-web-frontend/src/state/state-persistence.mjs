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
      "isLoggedIn": state.isLoggedIn,
      "currentUser": state.currentUser,
      "currentUserId": state.currentUserId,
      "currentUserRole": state.currentUserRole,
      "authToken": state.authToken,
      "token": state.token,
      "accountScopes": state.accountScopes,
      "libraryDemoSeeded": state.libraryDemoSeeded,
      "userLibraryPromptIds": [...state.userLibraryPromptIds],
      "likedPromptIds": [...state.likedPromptIds],
      "likedCommentIds": [...state.likedCommentIds],
      "reportedPromptIds": [...state.reportedPromptIds],
      "reportedCommentIds": [...state.reportedCommentIds],
      "hideReportedPrompts": state.hideReportedPrompts,
      "adminMode": state.adminMode,
      "adminHiddenPromptIds": [...state.adminHiddenPromptIds],
      "adminTagDecisions": state.adminTagDecisions,
      "adminTab": state.adminTab,
      "adminPromptQuery": state.adminPromptQuery,
      "adminPromptFilter": state.adminPromptFilter,
      "adminTagQuery": state.adminTagQuery,
      "adminTagFilter": state.adminTagFilter,
      "adminTagSort": state.adminTagSort,
      "adminTagPromptKey": state.adminTagPromptKey,
      "adminUserQuery": state.adminUserQuery,
      "adminUserActivityNickname": state.adminUserActivityNickname,
      "adminPromptRevisionRequests": state.adminPromptRevisionRequests,
      "adminReportFilter": state.adminReportFilter,
      "reportRecords": state.reportRecords,
      "searchScope": state.searchScope,
      "popularSort": state.popularSort,
      "savedSort": state.savedSort,
      "recentThreads": state.recentThreads,
      "makeFolders": state.makeFolders,
      "activeFolderId": state.activeFolderId,
      "activeThreadId": state.activeThreadId,
      "pendingGuestThreadTransferId": state.pendingGuestThreadTransferId,
      "pendingGuestThreadTransferErrorCode": state.pendingGuestThreadTransferErrorCode,
      "messages": state.messages,
      "composerDraft": state.composerDraft,
      "templateCollapsed": state.templateCollapsed,
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
  const stored = (/** @type {string} */ key) => savedState[key];
  const storedToken = readStorageItem(AUTH_TOKEN_KEY);
  const restoredToken = storedToken || stored("authToken") || stored("token") || "";
  state.isLoggedIn = Boolean(stored("isLoggedIn") && restoredToken);
  state.currentUser = state.isLoggedIn ? stored("currentUser") || null : null;
  state.currentUserId = state.isLoggedIn ? stored("currentUserId") || null : null;
  state.currentUserRole = state.isLoggedIn ? stored("currentUserRole") || "user" : "user";
  state.authToken = state.isLoggedIn ? restoredToken : "";
  state.token = state.isLoggedIn ? restoredToken : "";
  state.accountScopes = stored("accountScopes") && typeof stored("accountScopes") === "object" ? stored("accountScopes") : {};
  state.libraryDemoSeeded = Boolean(stored("libraryDemoSeeded"));
  state.userLibraryPromptIds = new Set(Array.isArray(stored("userLibraryPromptIds")) ? stored("userLibraryPromptIds") : []);
  state.likedPromptIds = new Set(Array.isArray(stored("likedPromptIds")) ? stored("likedPromptIds") : []);
  state.likedCommentIds = new Set(Array.isArray(stored("likedCommentIds")) ? stored("likedCommentIds") : []);
  state.reportedPromptIds = new Set(Array.isArray(stored("reportedPromptIds")) ? stored("reportedPromptIds") : []);
  state.reportedCommentIds = new Set(Array.isArray(stored("reportedCommentIds")) ? stored("reportedCommentIds") : []);
  state.hideReportedPrompts = Boolean(stored("hideReportedPrompts"));
  if (state.accountScopes[getCurrentAccountScopeKey()]) {
    restoreCurrentAccountScope();
  }
  state.adminMode = Boolean(state.isLoggedIn && state.currentUserRole === "admin" && stored("adminMode"));
  if (state.adminMode) state.route = "admin";
  state.adminHiddenPromptIds = new Set(Array.isArray(stored("adminHiddenPromptIds")) ? stored("adminHiddenPromptIds") : []);
  state.adminTagDecisions = stored("adminTagDecisions") && typeof stored("adminTagDecisions") === "object" ? stored("adminTagDecisions") : {};
  state.adminTab = ["reports", "prompts", "tags", "users", "audit"].includes(stored("adminTab")) ? stored("adminTab") : "reports";
  state.adminPromptQuery = stored("adminPromptQuery") || "";
  state.adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(stored("adminPromptFilter"))
    ? stored("adminPromptFilter")
    : "all";
  state.adminTagQuery = stored("adminTagQuery") || "";
  state.adminTagFilter = ["all", "pending", "approved", "rejected", "disabled"].includes(stored("adminTagFilter"))
    ? stored("adminTagFilter")
    : "all";
  state.adminTagSort = ["usage", "recent"].includes(stored("adminTagSort")) ? stored("adminTagSort") : "usage";
  state.adminTagPromptKey = stored("adminTagPromptKey") || "";
  state.adminUserQuery = stored("adminUserQuery") || "";
  state.adminUserActivityNickname = stored("adminUserActivityNickname") || "";
  state.adminPromptRevisionRequests =
    stored("adminPromptRevisionRequests") && typeof stored("adminPromptRevisionRequests") === "object"
      ? stored("adminPromptRevisionRequests")
      : {};
  state.adminReportFilter = ["all", "prompt", "comment"].includes(stored("adminReportFilter"))
    ? stored("adminReportFilter")
    : "all";
  state.reportRecords = stored("reportRecords") && typeof stored("reportRecords") === "object" ? stored("reportRecords") : {};
  state.searchScope = getValidSearchScope(stored("searchScope"));
  state.popularSort = ["popular", "saves", "comments", "likes", "latest"].includes(stored("popularSort"))
    ? stored("popularSort")
    : "popular";
  state.savedSort = ["recent", "saves", "comments", "likes", "views"].includes(stored("savedSort"))
    ? stored("savedSort")
    : "recent";
  state.recentThreads = Array.isArray(stored("recentThreads")) ? stored("recentThreads") : [];
  state.makeFolders = normalizeMakeFolders(stored("makeFolders"));
  state.activeFolderId =
    state.makeFolders.some((folder) => folder.id === stored("activeFolderId")) || stored("activeFolderId") === "all"
      ? stored("activeFolderId")
      : "all";
  state.activeThreadId = stored("activeThreadId") || null;
  state.pendingGuestThreadTransferId = stored("pendingGuestThreadTransferId") != null
    && state.recentThreads.some((thread) => String(thread?.id || "") === String(stored("pendingGuestThreadTransferId")))
    ? stored("pendingGuestThreadTransferId")
    : null;
  state.pendingGuestThreadTransferErrorCode = state.pendingGuestThreadTransferId
    ? ["FREE_TRIAL_LIMIT_EXCEEDED", "TRIAL_LIMIT_EXCEEDED", "SESSION_UUID_REQUIRED", "AUTHENTICATION_REQUIRED"].includes(String(stored("pendingGuestThreadTransferErrorCode") || "").toUpperCase())
      ? String(stored("pendingGuestThreadTransferErrorCode")).toUpperCase()
      : "FREE_TRIAL_LIMIT_EXCEEDED"
    : "";
  state.messages = Array.isArray(stored("messages")) ? stored("messages") : [];
  state.composerDraft = stored("composerDraft") || "";
  state.templateCollapsed = Boolean(stored("templateCollapsed"));
  normalizePersistedLikeCounts();
}


const api = Object.freeze({ STORAGE_KEY, AUTH_TOKEN_KEY, readStorageItem, writeStorageItem, removeStorageItem, readPersistedPayload, writePersistedPayload, clearPersistedPayload, persistAppState, loadPersistedAppState });
export { api };
