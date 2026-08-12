const test = require("node:test");
const assert = require("node:assert/strict");

const storageValues = new Map();
global.window = {
  localStorage: {
    getItem: (key) => storageValues.get(key) || null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  },
};
let stateApi;
test.before(async () => { ({ state: stateApi } = await import("../src/state/app-state.mjs")); });

test("core state domain owns initial home modal and session transitions", () => {
  const state = stateApi.createInitialState({ homePageSize: 8 });
  assert.equal(state.backendHomePage.size, 8);
  stateApi.applyHomeSearchScopeState(state, "tag");
  stateApi.applyHomeSearchQueryState(state, "launch");
  stateApi.applyHomeSortState(state, "latest");
  stateApi.applyHomePageState(state, 3);
  stateApi.applyHomeTagSearchState(state, "AI");
  stateApi.applyHomeAuthorSearchState(state, "Author");
  stateApi.toggleReportedVisibilityState(state);
  state.authView = "login";
  stateApi.closeTopModalState(state);
  stateApi.applyAuthenticatedIdentityState(state, { token: "token", user: { nickname: "User", id: 7, role: "admin" } });
  assert.equal(state.isLoggedIn, true);
  stateApi.clearAuthenticatedSessionState(state, { keepRoute: false });
  assert.equal(state.isLoggedIn, false);
  stateApi.resetHomeViewState(state);
  assert.equal(state.searchScope, "all");
});

test("session cleanup removes every account-bound administrator cache", () => {
  const state = stateApi.createInitialState();
  Object.assign(state, {
    backendAdminReports: [{ id: 1 }],
    backendAdminTags: [{ id: 2 }],
    backendAdminPrompts: [{ id: 3 }],
    backendAdminRevisionRequests: [{ id: 4 }],
    backendAdminUserActivities: { member: { memberId: 5 } },
    backendAdminAuditLogs: [{ id: 6 }],
    adminAuditSyncMessage: "loaded",
    adminUserSearchResults: [{ id: 7 }],
    adminUserSearchMessage: "loaded",
  });
  stateApi.clearSessionBackendDataState(state);
  assert.deepEqual(state.backendAdminReports, []);
  assert.deepEqual(state.backendAdminTags, []);
  assert.deepEqual(state.backendAdminPrompts, []);
  assert.deepEqual(state.backendAdminRevisionRequests, []);
  assert.deepEqual(state.backendAdminUserActivities, {});
  assert.deepEqual(state.backendAdminAuditLogs, []);
  assert.equal(state.adminAuditSyncMessage, "");
  assert.deepEqual(state.adminUserSearchResults, []);
  assert.equal(state.adminUserSearchMessage, "");
});

test("persistence state domain safely reads writes and clears payloads", () => {
  storageValues.clear();
  assert.equal(stateApi.writeStorageItem("key", "value"), true);
  assert.equal(stateApi.readStorageItem("key"), "value");
  assert.equal(stateApi.writePersistedPayload({ state: { route: "make" } }), true);
  assert.equal(stateApi.readPersistedPayload().state.route, "make");
  assert.equal(stateApi.clearPersistedPayload(), true);
  assert.equal(stateApi.readPersistedPayload(), null);

  const state = stateApi.createInitialState();
  state.isLoggedIn = true;
  state.authToken = "token";
  const popularPrompts = [{ id: 1 }];
  const savedPrompts = [{ id: 2, savedByMe: true, saves: 1 }];
  stateApi.persistAppState({ state, popularPrompts, savedPrompts, commentsByPrompt: {}, saveCurrentAccountScope: () => {} });
  const restored = stateApi.createInitialState();
  stateApi.loadPersistedAppState({
    state: restored, popularPrompts: [], savedPrompts: [], commentsByPrompt: {},
    getCurrentAccountScopeKey: () => "user", getValidSearchScope: (value) => value || "all",
    normalizeMakeFolders: (folders) => Array.isArray(folders) ? folders : [], normalizePersistedLikeCounts: () => {},
    normalizeSavedPromptOwnership: () => {}, restoreCurrentAccountScope: () => {},
  });
  assert.equal(restored.isLoggedIn, true);
});

test("prompt interaction admin and Make state domains apply representative mutations", () => {
  const state = stateApi.createInitialState();
  const savedPrompts = [];
  const popularPrompts = [{ id: 1, likes: 0, comments: 0 }];
  const promptCtx = {
    state, savedPrompts, popularPrompts,
    updatePromptField: () => {},
    findPromptById: (id) => popularPrompts.find((prompt) => prompt.id === id),
    upsertPrompt: (list, prompt) => list.push(prompt),
  };
  stateApi.applyNewPromptSavedState(promptCtx, 1, popularPrompts[0]);
  assert.equal(savedPrompts.length, 1);
  stateApi.applyPromptLikedState(promptCtx, 1, popularPrompts[0]);
  assert.equal(state.likedPromptIds.has(1), true);
  stateApi.applyPromptUnlikedState(promptCtx, 1);
  stateApi.normalizeSavedPageState(state, 0, 8);

  const commentsByPrompt = {};
  const commentCtx = { state, commentsByPrompt, popularPrompts, savedPrompts, updatePromptCommentCount: () => {} };
  state.currentUser = "User";
  const comment = stateApi.addPromptCommentState(commentCtx, 1, "hello", 1);
  stateApi.toggleReplyCommentState(state, comment.id);
  stateApi.toggleEditCommentState(state, comment.id);
  stateApi.removePromptByIdState(popularPrompts, 1);

  stateApi.applyAdminPromptHiddenState(state, 3, true);
  assert.equal(state.adminHiddenPromptIds.has(3), true);
  stateApi.applyAdminPromptHiddenState(state, 3, false);
  stateApi.applyAdminRevisionRequestState(state, { key: "prompt:3", type: "prompt", id: 3 }, { id: 9, reason: "revise" });
  const block = stateApi.applyAdminUserBlockActivityState({ state, normalizeAdminSearchText: (value) => value.toLowerCase(), getAdminUserActivity: () => ({}) }, { activity: { nickname: "Member" }, memberId: 4, shouldBlock: true, nickname: "Member" });
  stateApi.applyAdminUserActivityRefreshState(state, { refreshedActivity: { prompts: [] }, ...block, memberId: 4, shouldBlock: true });
  state.backendAdminTags = [{ id: 5, key: "AI" }];
  stateApi.applyAdminTagDecisionState(state, { tag: "ai", decision: "approved", backendTag: { id: 5, key: "AI" }, updated: { status: "approved" }, normalizeTag: true });
  state.backendAdminReports = [{ id: 8, status: "PENDING" }];
  state.reportRecords["prompt:8"] = { status: "pending" };
  assert.equal(stateApi.applyAdminReportStatusState(state, { key: "prompt:8", record: { backendId: 8 }, status: "resolved", updated: { status: "RESOLVED" }, mapBackendReportStatus: () => "resolved", getReportRecord: () => state.reportRecords["prompt:8"] }), "resolved");
  stateApi.finishAdminRevisionRequestState(state);

  const folder = stateApi.createLocalMakeFolderState(state, "Work");
  assert.equal(folder.name, "Work");
  stateApi.restoreMakeThreadFolderState({ folderId: "old" }, folder.id);
  stateApi.removeLocalMakeFolderState(state, folder.id);
  stateApi.startNewMakeChatState(state);
  stateApi.appendMakeUserMessageState(state, "thread", { id: "u1", role: "user", content: "hello" });
  stateApi.appendMakeAssistantMessageState(state, { id: "a1", role: "assistant", content: "answer" });
  assert.equal(state.messages.length, 2);
});

test("prompt state domain handles pending, edited, shared and deleted transitions", () => {
  const state = stateApi.createInitialState();
  state.myBackendStatus = "connected";
  const popularPrompts = [{ id: 1, source: "community", saves: 2 }];
  const savedPrompts = [{ ...popularPrompts[0], savedByMe: true }];
  const context = {
    state, popularPrompts, savedPrompts,
    commentsByPrompt: {}, existingPrompt: null,
    findPromptById: () => popularPrompts[0], updatePromptField: () => {},
    upsertPrompt: (list, prompt) => list.push(prompt), getSavedFilteredCount: () => savedPrompts.length,
  };
  stateApi.applyExistingPromptSavedState(context, 1, savedPrompts[0]);
  stateApi.togglePendingUnsaveState(context, 1);
  stateApi.togglePendingUnsaveState(context, 1);
  stateApi.applyBackendPromptUnsavedState(context, 1, savedPrompts[0]);
  stateApi.applyNewPromptSavedState(context, 1, popularPrompts[0]);
  state.pendingUnsaveIds.add(1);
  stateApi.applyPendingUnsavesState(context, { nextRoute: "home", nextMyPageTab: "library", pageSize: 8 });
  stateApi.applyEditedPromptState(context, 1, { title: "Edited" }, "prompt:1");
  stateApi.applyUnsharedPromptState(context, 1, popularPrompts[0]);
  stateApi.applySharedPromptState(context, { id: 2, source: "mine" }, { id: 2, isShared: true });
  stateApi.applyDeletedPromptState(context, 2, 8);
  assert.equal(state.savedPage, 1);
});
