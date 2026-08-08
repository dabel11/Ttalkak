const test = require("node:test");
const assert = require("node:assert/strict");

global.window = { setTimeout: (callback) => callback() };
require("../src/make/make-state.js");
require("../src/make/make-persistence.js");
require("../src/make/make-controller.js");
require("../src/make/make-events.js");

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
