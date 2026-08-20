const test = require("node:test");
const assert = require("node:assert/strict");

let createSavedLibraryController;
let createDiscoveryController;
test.before(async () => {
  ({ createSavedLibraryController } = await import("../src/saved/saved-library-controller.mjs"));
  ({ createDiscoveryController } = await import("../src/discovery/discovery-controller.mjs"));
});

test("saved library controller owns merging filtering and sorting", () => {
  const state = {
    isLoggedIn: true, libraryDemoSeeded: false, userLibraryPromptIds: new Set(), pendingUnsaveIds: new Set(),
    likedPromptIds: new Set([2]), savedFilter: { community: true, mine: true, liked: false }, savedSort: "saves",
    myBackendStatus: "fallback", backendLibraryPrompts: [], backendLikedPrompts: [],
  };
  const savedPrompts = [{ id: 1, source: "community", saves: 0, createdAt: 1 }];
  const popularPrompts = [{ id: 2, source: "community", saves: 3, createdAt: 2 }];
  const controller = createSavedLibraryController({ state, savedPrompts, popularPrompts, demoPromptIds: new Set(), uniquePrompts: (items) => items, canUseDemoFallback: () => true, getLikes: () => 0, getCommentCount: () => 0 });
  controller.normalizeOwnership();
  assert.equal(controller.isSaved(1), true);
  assert.deepEqual(controller.getPagePrompts().map((prompt) => prompt.id), [1, 2]);
  assert.deepEqual(controller.getPagePrompts().sort(controller.getSorter()).map((prompt) => prompt.id), [2, 1]);
  state.savedFilter.liked = true;
  assert.equal(controller.matchesFilter(popularPrompts[0]), true);
  assert.equal(controller.matchesFilter(savedPrompts[0]), false);
  state.myBackendStatus = "connected";
  state.backendLibraryPrompts = [{ id: 3, source: "community", saves: 2 }];
  assert.deepEqual(controller.getPagePrompts().map((prompt) => prompt.id), [3, 1, 2]);
  for (const sort of ["comments", "likes", "views", "recent"]) {
    state.savedSort = sort;
    assert.equal(typeof controller.getSorter(), "function");
  }
});

test("saved library suppresses fallback and hidden demo records", () => {
  const state = { isLoggedIn: true, libraryDemoSeeded: false, userLibraryPromptIds: new Set(), pendingUnsaveIds: new Set(), likedPromptIds: new Set(), savedFilter: { community: true, mine: true, liked: false }, savedSort: "recent", myBackendStatus: "fallback", backendLibraryPrompts: [], backendLikedPrompts: [] };
  const prompt = { id: "demo", source: "community", saves: 1 };
  const controller = createSavedLibraryController({ state, savedPrompts: [prompt], popularPrompts: [], demoPromptIds: new Set(["demo"]), uniquePrompts: (items) => items, canUseDemoFallback: () => false, getLikes: () => 0, getCommentCount: () => 0 });
  assert.equal(controller.isHiddenDemoLibraryPrompt(prompt), true);
  assert.deepEqual(controller.getPagePrompts(), []);
  assert.equal(controller.getSaveCount(undefined), 0);
});

test("discovery controller owns tag author and deferred admin searches", () => {
  const calls = [];
  const state = { adminPromptQuery: "", adminTagQuery: "" };
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback) => { callback(); return 1; };
  global.clearTimeout = () => {};
  try {
    const input = { value: "query", focus: () => calls.push("admin-focus"), setSelectionRange: () => calls.push("selection") };
    const controller = createDiscoveryController({ state, document: { querySelector: () => input }, searchDebounceMs: 1, cancelHomeSearch: () => calls.push("cancel"), applyTag: (_state, value) => calls.push(`tag:${value}`), applyAuthor: (_state, value) => calls.push(`author:${value}`), refresh: () => calls.push("refresh"), render: () => calls.push("render"), restoreHomeFocus: () => calls.push("focus") });
    controller.searchByTag("#AI");
    controller.searchByAuthor(" user ");
    controller.scheduleAdminPromptSearch("report");
    assert.equal(state.adminPromptQuery, "report");
    assert.deepEqual(calls.slice(0, 5), ["cancel", "tag:AI", "refresh", "render", "focus"]);
    controller.scheduleAdminTagSearch("tag");
    controller.commitAdminPromptSearch("report");
    controller.restoreAdminPromptFocus();
    controller.restoreAdminTagFocus();
    controller.cancelAdminPromptSearch();
    controller.cancelAdminTagSearch();
    controller.searchByTag("");
    controller.searchByAuthor(" ");
    assert.equal(state.adminTagQuery, "tag");
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
