const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("../src/make/make-sync-workflows.js");
require("../src/make/make-folder-workflows.js");
require("../src/make/make-execution-workflows.js");
let createMakeWorkflows;
test.before(async () => { ({ createMakeWorkflows } = await import("../src/make/make-workflows.mjs")); });

global.window = { setTimeout: (callback) => callback() };
require("../src/make/make-state.js");
require("../src/make/make-persistence.js");
require("../src/make/make-controller.js");
require("../src/make/make-events.js");
require("../src/effects/error-effects.js");

test("Make request state transitions are centralized", () => {
  const api = global.window.TtalkakMakeState;
  const request = api.createMakeRequestState();
  api.startMakeRequest(request);
  assert.equal(request.inFlight, true);
  api.failMakeRequest(request, "user-1", { message: "failed", retryable: true });
  assert.deepEqual(request, { inFlight: false, failedMessageId: "user-1", failure: { message: "failed", retryable: true } });
  api.completeMakeRequest(request);
  assert.deepEqual(request, { inFlight: false, failedMessageId: "", failure: null });
});
test("Make folders execution recent threads and backend sync are delegated", () => { const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8"); assert.match(app, /createMakeWorkflows/); ["createMakeFolder", "performDeleteFolder", "executeMakeMessage", "openRecentThread", "createBackendMakeFolder", "refreshMakeThreadsFromBackend"].forEach((name) => assert.doesNotMatch(app, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`))); });
test("Make workflow composition bundles its four focused submodules behind one lazy boundary", () => { const root = path.resolve(__dirname, ".."); const entry = fs.readFileSync(path.join(root, "src/app-entry.js"), "utf8"); const makeEntry = fs.readFileSync(path.join(root, "src/make/index.js"), "utf8"); assert.match(entry, /make\/index\.js/); assert.match(makeEntry, /import\(["']\.\/make-runtime\.mjs["']\)/); assert.match(makeEntry, /export const make/); const composite = fs.readFileSync(path.join(root, "src/make/make-workflows.mjs"), "utf8"); ["make-folder-workflows.js", "make-execution-workflows.js", "make-sync-workflows.js", "make-recent-workflows.mjs"].forEach((file) => assert.match(composite, new RegExp(`(?:from\\s+)?["']\\./${file.replaceAll(".", "\\.")}["']`))); ["createMakeFolder", "executeMakeMessage", "openRecentThread", "refreshMakeThreadsFromBackend"].forEach((name) => assert.doesNotMatch(composite, new RegExp(`function\\s+${name}\\s*\\(`))); });
test("recent thread keys preserve the pre-refactor normalization contract", () => { const workflows = createMakeWorkflows({}); assert.equal(workflows.getRecentThreadKey("  Hello   WORLD  "), "hello world"); assert.equal(workflows.getRecentThreadKey("x".repeat(150)).length, 150); });

test("Make state mutations use named helpers", () => {
  const state = {};
  const api = global.window.TtalkakMakeState;
  api.setMakeComposerDraft(state, "draft");
  api.setMakeEditingMessage(state, "message-1");
  api.setMakeBackendFailure(state, "offline");
  assert.deepEqual(state, { composerDraft: "draft", editingMessageId: "message-1", makeBackendStatus: "fallback", makeBackendMessage: "offline" });
});

test("application state is composed from focused domain modules", () => {
  const root = path.resolve(__dirname, "..");
  const appState = fs.readFileSync(path.join(root, "src/state/app-state.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "src/state/index.js"), "utf8");
  ["persistence", "core", "prompt", "admin", "interaction", "make"].forEach((domain) => {
    assert.match(entry, new RegExp(`state-${domain}\\.js`));
    assert.match(appState, new RegExp(`domains\\.${domain}`));
  });
  assert.ok(appState.split(/\r?\n/).length < 250, "app-state.js should remain a small compatibility facade");
  assert.doesNotMatch(appState, /function\s+(?:apply|delete|create|persist|load)[A-Z]/);
});

test("Make backend status changes use one state API", () => {
  const state = {};
  global.window.TtalkakMakeState.setMakeBackendState(state, "checking", "connecting");
  assert.deepEqual(state, { makeBackendStatus: "checking", makeBackendMessage: "connecting" });
  global.window.TtalkakMakeState.setMakeBackendFailure(state, "offline");
  assert.deepEqual(state, { makeBackendStatus: "fallback", makeBackendMessage: "offline" });
});

test("backend UI policy consumes the shared normalized error model", () => {
  const notices = [];
  let cleared = 0;
  const state = { isLoggedIn: true };
  const ctx = {
    clearAuthenticatedSession: () => { cleared += 1; },
    getAuthToken: () => "expired-token",
    getBackendErrorCode: (error) => error.code,
    getBackendErrorMessage: () => "",
    isDemoAuthToken: () => false,
    showNotice: (message) => notices.push(message),
    state,
  };
  global.window.TtalkakMakeMessageModel = require("../src/utils/make-message-model.js");
  global.window.TtalkakErrorEffects.handleBackendAccessErrorEffect(ctx, { status: 401, code: "LOGIN_REQUIRED" });
  assert.equal(cleared, 1);
  assert.equal(state.authView, "login");
  assert.match(notices[0], /로그인/);
});

test("strict Make architecture has no duplicated execution, state, or error policy", () => {
  const root = path.resolve(__dirname, "..", "..");
  const backendEffects = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/backend-effects.js"), "utf8");
  const syncEffects = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/make-server-sync-effects.js"), "utf8");
  const errorEffects = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/error-effects.js"), "utf8");
  const messageActions = fs.readFileSync(path.join(root, "extension/src/utils/messageActions.js"), "utf8");
  const conversationMessages = fs.readFileSync(path.join(root, "extension/src/utils/conversationMessages.js"), "utf8");
  assert.doesNotMatch(`${backendEffects}\n${syncEffects}`, /state\.(makeBackendStatus|makeBackendMessage)\s*=/);
  assert.match(errorEffects, /switch \(normalized\.kind\)/);
  assert.doesNotMatch(errorEffects, /AI_SERVICE_UNAVAILABLE|AI_RATE_LIMIT_EXCEEDED|AI_INVALID_RESPONSE/);
  assert.match(messageActions, /isExecutableMessage\(message\)/);
  assert.match(conversationMessages, /isExecutableMessage\(/);
  assert.doesNotMatch(`${messageActions}\n${conversationMessages}`, /NON_EXECUTABLE_PROMPT_FRAGMENTS|isUtilityOnlyPrompt|isAskOnlyResponse/);
});

test("edited-message retry orchestration lives in the Make controller", async () => {
  const calls = [];
  const messages = [{ id: "user-1", role: "user", content: "before" }];
  const ctx = {
    messages: { busy: "busy", missingThread: "missing", edited: "edited", editFailed: "edit failed", improveFailed: "improve failed" },
    findEditableMessage: () => 0, guard: () => false, isBusy: () => false,
    getActiveThreadId: () => "thread-1", getMessages: () => messages,
    buildHistory: () => [], startRequest: () => calls.push("start"), shouldSync: () => false,
    applyEdit: () => calls.push("apply"), setThinking: (value) => calls.push(`thinking:${value}`),
    queueScroll: () => {}, render: () => {}, waitForPaint: async () => {},
    improve: async () => ({ mode: "improve", improvedPrompt: "after" }),
    completeRequest: () => calls.push("complete"), finishEdit: (message) => calls.push(message.improvedPrompt),
    updateThread: () => {}, applyPendingThread: () => {}, syncThread: () => calls.push("sync"),
    notice: () => {}, focusAsk: () => {}, stopInFlight: () => {}, failRequest: () => {},
    classifyError: (error) => error, setBackendFailure: () => {}, handleError: () => {},
  };
  await global.window.TtalkakMakeController.resendEdited(ctx, "user-1", "after");
  assert.deepEqual(calls, ["start", "apply", "thinking:true", "thinking:false", "complete", "after", "sync"]);
});

test("route cancellation leaves a classified non-retryable Make message state", async () => {
  const OriginalFormData = global.FormData;
  global.FormData = class { get() { return "cancel this request"; } };
  const calls = [];
  const state = { isLoggedIn: true, activeThreadId: "thread-1", messages: [] };
  const controller = global.window.TtalkakMakeController;
  try {
    await controller.submitPrompt({
      state, freeLimit: 3, guard: () => false, isBusy: () => false, notice: () => {},
      bumpInteraction: () => {}, buildHistory: () => [], startRequest: () => new AbortController().signal,
      setDraft: () => {}, appendUser: (_threadId, message) => state.messages.push(message),
      setThinking: (value) => calls.push(`thinking:${value}`), updateThread: (id) => calls.push(`update:${id}`),
      render: () => {}, scrollLatest: () => {}, waitForPaint: async () => {},
      improve: async () => { throw Object.assign(new Error("cancelled"), { code: "REQUEST_ABORTED" }); },
      stopInFlight: () => calls.push("stopped"), failRequest: (id, failure) => calls.push([id, failure]),
      classifyError: () => ({ kind: "cancelled", message: "요청이 취소되었습니다.", retryable: false }),
      recover: async () => { calls.push("unexpected-recovery"); return false; }, completeRequest: () => {},
      setBackendFailure: () => calls.push("unexpected-backend-failure"), handleError: () => calls.push("unexpected-error-ui"),
      appendAssistant: () => {}, applyPendingThread: () => {}, shouldSync: () => false,
      refreshThread: async () => false, syncThread: () => {}, focusAsk: () => {},
    }, {});
  } finally {
    global.FormData = OriginalFormData;
  }
  assert.equal(state.messages.length, 1);
  assert.deepEqual(calls.slice(0, 4), ["thinking:true", "update:thread-1", "thinking:false", "stopped"]);
  assert.equal(calls[4][1].retryable, false);
  assert.match(calls[4][0], /^user-/);
  assert.equal(calls[5], "update:thread-1");
  assert.doesNotMatch(calls.join(" "), /unexpected/);
});

test("edited-message cancellation clears thinking, preserves the edit, and renders cancellation", async () => {
  const calls = [];
  const messages = [{ id: "user-1", role: "user", content: "before" }];
  const ctx = {
    findEditableMessage: () => 0, guard: () => false, isBusy: () => false,
    getActiveThreadId: () => "thread-1", getMessages: () => messages,
    buildHistory: () => [], startRequest: () => new AbortController().signal, shouldSync: () => false,
    applyEdit: (_index, value) => { messages[0].content = value; },
    setThinking: (value) => calls.push(`thinking:${value}`), queueScroll: () => {}, render: () => {},
    waitForPaint: async () => {}, improve: async () => { throw Object.assign(new Error("cancelled"), { code: "REQUEST_ABORTED" }); },
    stopInFlight: () => calls.push("stopped"), failRequest: (id, failure) => calls.push([id, failure.kind]),
    classifyError: () => ({ kind: "cancelled", retryable: false }), clearEditing: () => calls.push("clear-editing"),
    updateThread: () => calls.push("update"), renderCancellation: () => calls.push("render-cancellation"),
    setBackendFailure: () => calls.push("unexpected-backend"), handleError: () => calls.push("unexpected-error"),
  };

  await global.window.TtalkakMakeController.resendEdited(ctx, "user-1", "edited prompt");

  assert.equal(messages[0].content, "edited prompt");
  assert.deepEqual(calls, ["thinking:true", "thinking:false", "stopped", ["user-1", "cancelled"], "clear-editing", "update", "render-cancellation"]);
});

test("server-synced edited-message cancellation exposes thinking and preserves the draft", async () => {
  const calls = [];
  const ctx = {
    findEditableMessage: () => 0, guard: () => false, isBusy: () => false,
    getActiveThreadId: () => "thread-1", getMessages: () => [{ id: "user-1", role: "user", content: "before" }],
    buildHistory: () => [], startRequest: () => new AbortController().signal, shouldSync: () => true,
    getBackendThreadId: () => "77", setThinking: (value) => calls.push(`thinking:${value}`),
    queueScroll: () => calls.push("queue-scroll"), render: () => calls.push("render"),
    improve: async () => { throw Object.assign(new Error("cancelled"), { code: "REQUEST_ABORTED" }); },
    failRequest: (id, failure) => calls.push([id, failure.kind]), classifyError: () => ({ kind: "cancelled", retryable: false }),
    setDraft: (value) => calls.push(`draft:${value}`), clearEditing: () => calls.push("clear-editing"),
    updateThread: () => calls.push("update"), renderCancellation: () => calls.push("render-cancellation"),
    stopInFlight: () => calls.push("stopped"), setBackendFailure: () => calls.push("unexpected-backend"),
    refreshThreads: async () => {}, recover: async () => null, handleError: () => calls.push("unexpected-error"),
    refreshThread: async () => false, notice: () => {}, messages: { missingThread: "missing", edited: "edited", editFailed: "failed" },
  };

  await global.window.TtalkakMakeController.resendEdited(ctx, "user-1", "server edited prompt");

  assert.deepEqual(calls, [
    "thinking:true", "queue-scroll", "render", "thinking:false", ["user-1", "cancelled"],
    "draft:server edited prompt", "clear-editing", "update", "render-cancellation", "stopped",
  ]);
});

test("a stale cancelled request cannot clear a newer Make request", async () => {
  const OriginalFormData = global.FormData;
  global.FormData = class { get() { return "first request"; } };
  const firstController = new AbortController();
  const secondController = new AbortController();
  let currentSignal = firstController.signal;
  const calls = [];
  try {
    await global.window.TtalkakMakeController.submitPrompt({
      state: { isLoggedIn: true, activeThreadId: "thread-1", messages: [] }, freeLimit: 3,
      guard: () => false, isBusy: () => false, notice: () => {}, bumpInteraction: () => {},
      buildHistory: () => [], startRequest: () => firstController.signal, setDraft: () => {},
      appendUser: () => {}, setThinking: (value) => calls.push(`thinking:${value}`), updateThread: () => {},
      render: () => {}, scrollLatest: () => {}, waitForPaint: async () => {},
      improve: async () => {
        currentSignal = secondController.signal;
        throw Object.assign(new Error("stale cancellation"), { code: "REQUEST_ABORTED" });
      },
      isCurrentRequest: (signal) => currentSignal === signal,
      stopInFlight: () => calls.push("unexpected-stop"), failRequest: () => calls.push("unexpected-failure"),
      classifyError: (error) => error, recover: async () => false, completeRequest: () => {},
      setBackendFailure: () => {}, handleError: () => {}, appendAssistant: () => {}, applyPendingThread: () => {},
      shouldSync: () => false, refreshThread: async () => false, syncThread: () => {}, focusAsk: () => {},
    }, {});
  } finally {
    global.FormData = OriginalFormData;
  }
  assert.deepEqual(calls, ["thinking:true"]);
});

test("Make persistence owns migration, deduplication, and persistence", () => {
  const state = { messages: [], recentThreads: [{ id: "same" }, { id: "same" }, {}] };
  let persisted = 0;
  global.window.TtalkakMakePersistence.normalizeAndPersistMakeState(
    state,
    { migratePersistedMakeState: (value) => value },
    global.window.TtalkakMakeState,
    () => { persisted += 1; },
  );
  assert.equal(state.recentThreads.length, 2);
  assert.match(state.recentThreads[1].id, /^legacy-thread-/);
  assert.equal(persisted, 1);
});

test("Make event routing is defined outside app.js", () => {
  const calls = [];
  const state = { isLoggedIn: true, messages: [] };
  const actions = new Proxy({}, { get: (_target, key) => {
    if (key === "guard") return () => false;
    if (key === "folderCount") return () => 0;
    return (...args) => calls.push([key, ...args]);
  } });
  const handlers = global.window.TtalkakMakeEvents.createDelegatedMakeHandlers({ state, maxFolders: 5, actions });
  const button = { dataset: {}, matches: (selector) => selector === "[data-new-chat]" };
  handlers.click({ target: { closest: () => button } });
  assert.deepEqual(calls, [["newChat"]]);
});

test("Make event routing delegates the explicit request cancellation control", () => {
  const calls = [];
  const handlers = global.window.TtalkakMakeEvents.createDelegatedMakeHandlers({
    state: {}, maxFolders: 5,
    actions: new Proxy({}, { get: (_target, key) => key === "guard" ? () => false : (...args) => calls.push([key, ...args]) }),
  });
  const button = { dataset: {}, matches: (selector) => selector === "[data-cancel-make-request]" };
  handlers.click({ target: { closest: (selector) => selector.includes("[data-cancel-make-request]") ? button : null } });
  assert.deepEqual(calls, [["cancelRequest"]]);
});
