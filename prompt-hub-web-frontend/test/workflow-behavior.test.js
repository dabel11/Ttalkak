const test = require("node:test");
const assert = require("node:assert/strict");
const { createPromptWorkflows } = require("../src/interactions/prompt-workflows.js");
let threadPolicy;
let createMakeWorkflows;
test.before(async () => {
  threadPolicy = await import("../src/make/make-thread-policy.mjs");
  ({ createMakeWorkflows } = await import("../src/make/make-workflows.mjs"));
});

function makeContext(overrides = {}) {
  const notices = [];
  const state = {
    isLoggedIn: true,
    makeFolders: [{ id: "uncategorized", name: "미분류" }],
    recentThreads: [],
    messages: [],
    activeFolderId: "all",
    ...overrides.state,
  };
  return {
    render() {},
    showNotice: (message) => notices.push(message),
    guardAdminUserAction: () => false,
    MAX_CUSTOM_MAKE_FOLDERS: 5,
    canUseDemoFallback: () => false,
    createLocalMakeFolderState(target, name) {
      const folder = { id: `local-${target.makeFolders.length}`, name };
      target.makeFolders.push(folder);
      return folder;
    },
    removeLocalMakeFolderState: (target, id) => { target.makeFolders = target.makeFolders.filter((item) => item.id !== id); },
    restoreMakeThreadFolderState: (thread, folderId) => { if (thread) thread.folderId = folderId || "uncategorized"; },
    deleteMakeThreadState: (target, id) => { target.recentThreads = target.recentThreads.filter((item) => item.id !== id); },
    deleteMakeFolderState() {},
    getMakeMutationStateContext: () => ({}),
    getMakeApi: () => ({}),
    getMakeApiToken: () => "token",
    isBackendNumericId: (value) => /^\d+$/.test(String(value || "")),
    canSplitMakeThread: threadPolicy.canSplitMakeThread,
    findMakeThread: threadPolicy.findMakeThread,
    handleMakeBackendSyncError() {},
    hasBackendAuthToken: () => true,
    handleBackendAccessError() {},
    getMakeServerSyncEffects: () => ({ refreshMakeThreadsFromBackend() {} }),
    normalizeSearchText: (value) => String(value || "").trim().toLowerCase(),
    ...overrides,
    state,
    notices,
  };
}

test("folder creation rejects duplicate and maximum folder counts", async () => {
  const duplicate = makeContext({ state: { makeFolders: [{ id: "uncategorized", name: "미분류" }, { id: "a", name: "업무" }] } });
  await createMakeWorkflows(duplicate).createMakeFolder(" 업무 ");
  assert.equal(duplicate.state.makeFolders.length, 2);
  assert.match(duplicate.notices.at(-1), /같은 이름/);

  const maximum = makeContext({ state: { makeFolders: [{ id: "uncategorized", name: "미분류" }, ...Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: String(index) }))] } });
  await createMakeWorkflows(maximum).createMakeFolder("추가");
  assert.equal(maximum.state.makeFolders.length, 6);
  assert.match(maximum.notices.at(-1), /최대 5개/);
});

test("thread split policy uses the same server identity rules for UI and workflows", async () => {
  const { canSplitMakeThread, findMakeThread } = threadPolicy;
  const isBackendNumericId = (value) => /^\d+$/.test(String(value || ""));
  const local = { id: "local-thread", serverId: "" };
  const synchronized = { id: "local-shell", serverId: "42" };
  const legacyServer = { id: 42 };
  const threads = [local, synchronized, legacyServer];

  assert.equal(findMakeThread(threads, "local-thread"), local);
  assert.equal(findMakeThread(threads, "42"), synchronized);
  assert.equal(canSplitMakeThread(local, isBackendNumericId), true);
  assert.equal(canSplitMakeThread(synchronized, isBackendNumericId), false);
  assert.equal(canSplitMakeThread(legacyServer, isBackendNumericId), false);
  assert.equal(canSplitMakeThread(null, isBackendNumericId), false);
});

test("folder creation rolls local state back after backend failure", async () => {
  const ctx = makeContext({
    getMakeApi: () => ({ createMakeFolder: async () => { throw new Error("offline"); } }),
  });
  await createMakeWorkflows(ctx).createMakeFolder("업무");
  assert.deepEqual(ctx.state.makeFolders.map((folder) => folder.id), ["uncategorized"]);
  assert.equal(ctx.state.activeFolderId, "all");
  assert.match(ctx.notices.at(-1), /변경을 취소/);
});

test("thread deletion treats backend 404 as an idempotent success", async () => {
  let refreshed = 0;
  const ctx = makeContext({
    state: { recentThreads: [{ id: "local", serverId: "7" }] },
    getMakeApi: () => ({ deleteMakeThread: async () => { const error = new Error("missing"); error.status = 404; throw error; } }),
    getMakeServerSyncEffects: () => ({ refreshMakeThreadsFromBackend: () => { refreshed += 1; } }),
  });
  await createMakeWorkflows(ctx).performDeleteThread("local");
  assert.deepEqual(ctx.state.recentThreads, []);
  assert.equal(refreshed, 1);
  assert.match(ctx.notices.at(-1), /이미 삭제/);
});

test("message splitting rejects server threads even when called outside the UI", () => {
  const messages = [
    { id: "first", role: "user", content: "First topic" },
    { id: "answer", role: "assistant", content: "First answer" },
    { id: "second", role: "user", content: "Second topic" },
  ];
  for (const thread of [
    { id: "server-thread", serverId: "77", messages: messages.map((item) => ({ ...item })) },
    { id: 77, messages: messages.map((item) => ({ ...item })) },
  ]) {
    const ctx = makeContext({
      state: {
        activeThreadId: thread.id,
        messages: messages.map((item) => ({ ...item })),
        recentThreads: [thread],
      },
    });
    const before = JSON.parse(JSON.stringify(ctx.state));

    assert.equal(createMakeWorkflows(ctx).splitThreadFromMessage("second"), false);
    assert.deepEqual(ctx.state, before);
    assert.deepEqual(ctx.notices, []);
  }
});

test("execution helpers detect placeholders and keep supported targets fixed", () => {
  const workflows = createMakeWorkflows(makeContext());
  assert.equal(workflows.hasPromptPlaceholders("안녕하세요 [이름]"), true);
  assert.equal(workflows.hasPromptPlaceholders("안녕하세요"), false);
  assert.equal(workflows.getExecuteTarget("chatgpt").url, "https://chatgpt.com/");
  assert.equal(workflows.getExecuteTarget("unknown"), null);
});

function promptContext(overrides = {}) {
  const notices = [];
  const state = {
    isLoggedIn: true,
    backendStatus: "connected",
    reportedPromptIds: new Set(),
    reportedCommentIds: new Set(),
    ...overrides.state,
  };
  return {
    savedPrompts: [],
    popularPrompts: [],
    commentsByPrompt: {},
    render() {},
    showNotice: (message) => notices.push(message),
    guardAdminUserAction: () => false,
    isBackendNumericId: (value) => /^\d+$/.test(String(value || "")),
    getAuthToken: () => "real-token",
    isDemoAuthToken: () => false,
    getPromptMutationStateContext: () => ({}),
    getCommentMutationStateContext: () => ({}),
    refreshMyPageDataAfterMutation() {},
    handleBackendAccessError() {},
    ...overrides,
    state,
    notices,
  };
}

test("prompt reporting validates content and does not mutate after API failure", async () => {
  let applied = 0;
  global.window = { TTALKAK_API: { reportPrompt: async () => { throw new Error("offline"); } } };
  const ctx = promptContext({ applyPromptReportedState: () => { applied += 1; } });
  const workflows = createPromptWorkflows(ctx);
  await workflows.reportPrompt("7", "   ");
  assert.match(ctx.notices.at(-1), /사유/);
  await workflows.reportPrompt("7", "스팸");
  assert.equal(applied, 0);
});

test("prompt deletion and unshare delegate to named state transitions", () => {
  const calls = [];
  const prompt = { id: "7", source: "mine" };
  const ctx = promptContext({
    findPromptById: () => prompt,
    applyDeletedPromptState: (_context, id) => calls.push(["delete", id]),
    applyUnsharedPromptState: (_context, id) => calls.push(["unshare", id]),
    callBackendApi: (action, id) => calls.push([action, id]),
    SAVED_PAGE_SIZE: 10,
  });
  const workflows = createPromptWorkflows(ctx);
  workflows.performDeletePrompt("7");
  workflows.performUnsharePrompt("7");
  assert.deepEqual(calls, [["deletePrompt", "7"], ["delete", "7"], ["unshare", "7"], ["unsharePrompt", "7"]]);
});
