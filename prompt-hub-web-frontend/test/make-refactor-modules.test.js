const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("Make state mutations use named helpers", () => {
  const state = {};
  const api = global.window.TtalkakMakeState;
  api.setMakeComposerDraft(state, "draft");
  api.setMakeEditingMessage(state, "message-1");
  api.setMakeBackendFailure(state, "offline");
  assert.deepEqual(state, { composerDraft: "draft", editingMessageId: "message-1", makeBackendStatus: "fallback", makeBackendMessage: "offline" });
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
