const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let createMakeWorkflows;
let makeStateApi;
let makeController;
let makeEvents;
let errorEffects;
let normalizeAndPersistMakeState;
let makeServerSyncEffects;
let makePageRenderers;
test.before(async () => {
  ({ createMakeWorkflows } = await import("../src/make/make-workflows.mjs"));
  makeStateApi = await import("../src/make/make-state.mjs");
  makeController = await import("../src/make/make-controller.mjs");
  makeEvents = await import("../src/make/make-events.mjs");
  ({ errorEffects } = await import("../src/effects/error-effects.mjs"));
  ({ normalizeAndPersistMakeState } = await import("../src/make/make-persistence.mjs"));
  ({ makeServerSyncEffects } = await import("../src/effects/make-server-sync-effects.mjs"));
  ({ renderers: makePageRenderers } = await import("../src/renderers/pages/make-page.mjs"));
});

test("Make request state transitions are centralized", () => {
  const api = makeStateApi;
  const request = api.createMakeRequestState();
  api.startMakeRequest(request);
  assert.equal(request.inFlight, true);
  api.failMakeRequest(request, "user-1", { message: "failed", retryable: true });
  assert.deepEqual(request, { inFlight: false, failedMessageId: "user-1", failure: { message: "failed", retryable: true }, recoveryMessageId: "", recoveryAction: "" });
  assert.equal(api.startMakeRecovery(request, "user-1", "refresh"), true);
  assert.equal(api.startMakeRecovery(request, "user-1", "refresh"), false);
  assert.equal(request.recoveryAction, "refresh");
  api.finishMakeRecovery(request);
  api.completeMakeRequest(request);
  assert.deepEqual(request, { inFlight: false, failedMessageId: "", failure: null, recoveryMessageId: "", recoveryAction: "" });
});
test("Make folders execution recent threads and backend sync are delegated", () => { const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8"); assert.match(app, /createMakeWorkflows/); ["createMakeFolder", "performDeleteFolder", "executeMakeMessage", "openRecentThread", "createBackendMakeFolder", "refreshMakeThreadsFromBackend"].forEach((name) => assert.doesNotMatch(app, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`))); });
test("Make workflow composition bundles its four focused submodules behind one lazy boundary", () => { const root = path.resolve(__dirname, ".."); const entry = fs.readFileSync(path.join(root, "src/app-entry.js"), "utf8"); const makeEntry = fs.readFileSync(path.join(root, "src/make/index.js"), "utf8"); assert.match(entry, /make\/index\.js/); assert.match(makeEntry, /import\(["']\.\/make-runtime\.mjs["']\)/); assert.match(makeEntry, /export const make/); const composite = fs.readFileSync(path.join(root, "src/make/make-workflows.mjs"), "utf8"); ["make-folder-workflows.mjs", "make-execution-workflows.mjs", "make-sync-workflows.mjs", "make-recent-workflows.mjs"].forEach((file) => assert.match(composite, new RegExp(`(?:from\\s+)?["']\\./${file.replaceAll(".", "\\.")}["']`))); ["createMakeFolder", "executeMakeMessage", "openRecentThread", "refreshMakeThreadsFromBackend"].forEach((name) => assert.doesNotMatch(composite, new RegExp(`function\\s+${name}\\s*\\(`))); });
test("recent thread keys preserve the pre-refactor normalization contract", () => { const workflows = createMakeWorkflows({}); assert.equal(workflows.getRecentThreadKey("  Hello   WORLD  "), "hello world"); assert.equal(workflows.getRecentThreadKey("x".repeat(150)).length, 150); });

test("Make state mutations use named helpers", () => {
  const state = {};
  const api = makeStateApi;
  api.setMakeComposerDraft(state, "draft");
  api.setMakeEditingMessage(state, "message-1");
  api.setMakeBackendFailure(state, "offline");
  assert.deepEqual(state, { composerDraft: "draft", editingMessageId: "message-1", makeBackendStatus: "fallback", makeBackendMessage: "offline" });
});

test("application state is composed from focused domain modules", () => {
  const root = path.resolve(__dirname, "..");
  const appState = fs.readFileSync(path.join(root, "src/state/app-state.mjs"), "utf8");
  ["persistence", "core", "prompt", "admin", "interaction", "make"].forEach((domain) => {
    assert.match(appState, new RegExp(`state-${domain}\\.mjs`));
  });
  assert.ok(appState.split(/\r?\n/).length < 250, "app-state.mjs should remain a small compatibility facade");
  assert.doesNotMatch(appState, /function\s+(?:apply|delete|create|persist|load)[A-Z]/);
});

test("Make backend status changes use one state API", () => {
  const state = {};
  makeStateApi.setMakeBackendState(state, "checking", "connecting");
  assert.deepEqual(state, { makeBackendStatus: "checking", makeBackendMessage: "connecting" });
  makeStateApi.setMakeBackendFailure(state, "offline");
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
  errorEffects.handleBackendAccessErrorEffect(ctx, { status: 401, code: "LOGIN_REQUIRED" });
  assert.equal(cleared, 1);
  assert.equal(state.authView, "login");
  assert.match(notices[0], /로그인/);
});

test("strict Make architecture has no duplicated execution, state, or error policy", () => {
  const root = path.resolve(__dirname, "..", "..");
  const backendEffects = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/backend-effects.mjs"), "utf8");
  const syncEffects = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/make-server-sync-effects.mjs"), "utf8");
  const errorEffectsSource = fs.readFileSync(path.join(root, "prompt-hub-web-frontend/src/effects/error-effects.mjs"), "utf8");
  const messageActions = fs.readFileSync(path.join(root, "extension/src/utils/messageActions.js"), "utf8");
  const conversationMessages = fs.readFileSync(path.join(root, "extension/src/utils/conversationMessages.js"), "utf8");
  assert.doesNotMatch(`${backendEffects}\n${syncEffects}`, /state\.(makeBackendStatus|makeBackendMessage)\s*=/);
  assert.match(errorEffectsSource, /switch \(normalized\.kind\)/);
  assert.doesNotMatch(errorEffectsSource, /AI_SERVICE_UNAVAILABLE|AI_RATE_LIMIT_EXCEEDED|AI_INVALID_RESPONSE/);
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
    reportOutcome: (_result, durationMs) => calls.push(["outcome", durationMs]),
    classifyError: (error) => error, setBackendFailure: () => {}, handleError: () => {},
  };
  await makeController.resendEdited(ctx, "user-1", "after");
  assert.equal(calls[0], "start");
  assert.deepEqual(calls.slice(1, 5), ["apply", "thinking:true", "thinking:false", "complete"]);
  assert.equal(calls[5][0], "outcome");
  assert.equal(Number.isFinite(calls[5][1]), true);
  assert.deepEqual(calls.slice(6), ["after", "sync"]);
});

test("route cancellation leaves a classified non-retryable Make message state", async () => {
  const OriginalFormData = global.FormData;
  global.FormData = class { get() { return "cancel this request"; } };
  const calls = [];
  const state = { isLoggedIn: true, activeThreadId: "thread-1", messages: [] };
  const controller = makeController;
  try {
    await controller.submitPrompt({
      state, freeLimit: 3, guard: () => false, isBusy: () => false, notice: () => {},
      bumpInteraction: () => {}, buildHistory: () => [], startRequest: () => new AbortController().signal,
      reportStart: (mode) => calls.push(`metric-start:${mode}`), reportCancel: (mode) => calls.push(`metric-cancel:${mode}`),
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
  assert.deepEqual(calls.slice(0, 5), ["metric-start:submit", "thinking:true", "update:thread-1", "thinking:false", "stopped"]);
  assert.equal(calls[5], "metric-cancel:submit");
  assert.equal(calls[6][1].retryable, false);
  assert.match(calls[6][0], /^user-/);
  assert.equal(calls[7], "update:thread-1");
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

  await makeController.resendEdited(ctx, "user-1", "edited prompt");

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

  await makeController.resendEdited(ctx, "user-1", "server edited prompt");

  assert.deepEqual(calls, [
    "update", "thinking:true", "queue-scroll", "render", "thinking:false", ["user-1", "cancelled"],
    "draft:server edited prompt", "clear-editing", "update", "render-cancellation", "stopped",
  ]);
});
test("repeated concurrency recovery explains the safe new-chat choice", () => {
  const html = makePageRenderers.UserMessageView(
    { icons: { edit: "edit" }, escapeAttr: String, escapeHtml: String },
    {
      canSplit: false, content: "preserved prompt", failureAction: { id: "retry-after-refresh", label: "다시 보내기" },
      failureKind: "concurrency", failureMessage: "입력한 내용은 유지됩니다.", failureRepeated: true,
      failureRetryable: false, failureTitle: "최신 대화를 불러왔습니다", failureTone: "recovered", isEditing: false,
      recoveryAction: "", retryMode: "follow-up", retryTargetContent: "", role: "user", safeContent: "preserved prompt", safeMessageId: "conflict-1",
    },
  );
  assert.match(html, /새 대화에서 계속하기/);
  assert.match(html, /현재 입력을 새 대화로 옮기며 기존 대화는 유지됩니다/);
});
test("successful Make requests reset repeated concurrency guidance per thread", async () => {
  const repeatedValues = [];
  const ctx = {
    classifyError: () => ({ kind: "concurrency" }), refreshThread: async () => true,
    reportConcurrencyRefresh: () => {}, setDraft: () => {},
    appendUser: (_threadId, message) => repeatedValues.push(message.concurrencyRepeated),
    failRequest: () => {}, updateThread: () => {}, render: () => {}, focusRestored: () => {}, scrollLatest: () => {},
  };
  const error = { status: 409, code: "THREAD_CONCURRENTLY_UPDATED" };
  await makeController.handleThreadConcurrency(ctx, { error, prompt: "one", requestId: "r1", threadId: "42" });
  await makeController.handleThreadConcurrency(ctx, { error, prompt: "two", requestId: "r2", threadId: "42" });
  makeController.resetConcurrency("42");
  await makeController.handleThreadConcurrency(ctx, { error, prompt: "three", requestId: "r3", threadId: "42" });
  assert.deepEqual(repeatedValues, [false, true, false]);
});

test("web API boundary forwards request ids only with a canonical server thread", async () => {
  const payloads = [];
  const state = { isLoggedIn: true, activeThreadId: "local-1", recentThreads: [{ id: "local-1", serverId: "42" }] };
  const effects = makeServerSyncEffects.createMakeServerSyncEffects({
    state,
    getMakeApi: () => ({ improvePrompt: async (payload) => { payloads.push(payload); return { improvedPrompt: "done", threadId: 42, requestId: payload.requestId, replayed: false }; } }),
    getMakeApiToken: () => "token", hasBackendAuthToken: () => true,
    isBackendNumericId: (value) => /^\d+$/.test(String(value || "")),
    makeState: { setMakeBackendState() {} }, polishPrompt: (value) => value,
    buildMakeImproveHistory: () => [], canUseDemoFallback: () => false,
  });
  const result = await effects.improvePromptWithBackend("prompt", { threadId: "local-1", requestId: "request-web" });
  assert.deepEqual(payloads[0], { prompt: "prompt", category: "prompt_techniques", threadId: 42, requestId: "request-web" });
  assert.equal(result.requestId, "request-web");
  assert.equal(result.replayed, false);
});

test("logged-in server follow-ups attach one request id and preserve replay metadata", async () => {
  const OriginalFormData = global.FormData;
  global.FormData = class { get() { return "ask follow-up answer"; } };
  const state = { isLoggedIn: true, activeThreadId: "42", messages: [] };
  let requestOptions;
  let assistant;
  try {
    await makeController.submitPrompt({
      state, freeLimit: 3, guard: () => false, isBusy: () => false, notice: () => {},
      bumpInteraction: () => {}, buildHistory: () => [], startRequest: () => new AbortController().signal,
      setDraft: () => {}, appendUser: (_threadId, message) => state.messages.push(message),
      setThinking: () => {}, updateThread: () => {}, render: () => {}, scrollLatest: () => {}, waitForPaint: async () => {},
      shouldSync: () => true, getBackendThreadId: () => "42",
      improve: async (_prompt, options) => {
        requestOptions = options;
        return { mode: "improve", improvedPrompt: "stored", requestId: options.requestId, replayed: true };
      },
      isCurrentRequest: () => true, completeRequest: () => {}, reportOutcome: () => {},
      appendAssistant: (message) => { assistant = message; }, applyPendingThread: () => {},
      refreshThread: async () => true, syncThread: () => {}, focusAsk: () => {},
      recover: async () => false, stopInFlight: () => {}, failRequest: () => {}, classifyError: (error) => error,
      setBackendFailure: () => {}, handleError: () => {},
    }, {});
  } finally {
    global.FormData = OriginalFormData;
  }
  assert.equal(requestOptions.threadId, "42");
  assert.ok(requestOptions.requestId);
  assert.equal(state.messages[0].requestId, requestOptions.requestId);
  assert.equal(assistant.requestId, requestOptions.requestId);
  assert.equal(assistant.replayed, true);
});

test("server retries reuse a request id while edited content receives a new id", async () => {
  const seen = [];
  const messages = [{ id: "user-1", role: "user", content: "same prompt", requestId: "request-existing" }];
  const ctx = {
    findEditableMessage: () => 0, guard: () => false, isBusy: () => false,
    getActiveThreadId: () => "42", getMessages: () => messages,
    buildHistory: () => [], startRequest: () => new AbortController().signal, shouldSync: () => true,
    getBackendThreadId: () => "42", setThinking: () => {}, queueScroll: () => {}, render: () => {},
    improve: async (_prompt, options) => { seen.push(options.requestId); return { mode: "improve", improvedPrompt: "done" }; },
    reportOutcome: () => {}, clearEditing: () => {}, refreshThread: async () => true,
    notice: () => {}, stopInFlight: () => {}, updateThread: () => {},
    failRequest: () => {}, classifyError: (error) => error, setBackendFailure: () => {},
    refreshThreads: async () => {}, recover: async () => null, handleError: () => {},
    messages: { missingThread: "missing", edited: "edited", editFailed: "failed" },
  };

  await makeController.resendEdited(ctx, "user-1", "same prompt");
  assert.equal(seen[0], "request-existing");

  messages[0].requestId = "request-existing";
  messages[0].requestPrompt = "same prompt";
  await makeController.resendEdited(ctx, "user-1", "changed prompt");
  assert.notEqual(seen[1], "request-existing");
  assert.ok(seen[1].length <= 128);
});

test("request-id conflicts refresh the server thread instead of entering a retry loop", async () => {
  const calls = [];
  const messages = [{ id: "user-1", role: "user", content: "same prompt", requestId: "request-existing" }];
  await makeController.resendEdited({
    findEditableMessage: () => 0, guard: () => false, isBusy: () => false,
    getActiveThreadId: () => "42", getMessages: () => messages,
    buildHistory: () => [], startRequest: () => new AbortController().signal, shouldSync: () => true,
    getBackendThreadId: () => "42", setThinking: () => {}, queueScroll: () => {}, render: () => {},
    improve: async () => { throw Object.assign(new Error("conflict"), { status: 409, code: "REQUEST_ID_REUSED" }); },
    reportFailure: (error, requestId) => calls.push(["failure", error.code, requestId]),
    clearEditing: () => {}, refreshThread: async () => { calls.push("refresh"); return true; },
    notice: (message) => calls.push(message), stopInFlight: () => {}, updateThread: () => {},
    failRequest: () => {}, classifyError: (error) => error, setBackendFailure: () => {},
    refreshThreads: async () => {}, recover: async () => { calls.push("recover"); }, handleError: () => {},
    messages: { missingThread: "missing", edited: "edited", editFailed: "failed" },
  }, "user-1", "same prompt");

  assert.deepEqual(calls[0], ["failure", "REQUEST_ID_REUSED", "request-existing"]);
  assert.equal(calls[1], "refresh");
  assert.match(calls[2], /새로고침/);
  assert.equal(calls.includes("recover"), false);
});

test("thread concurrency refreshes first and exposes one explicit preserved-prompt retry", async () => {
  const calls = [];
  const state = { messages: [{ id: "canonical", role: "assistant", content: "latest" }] };
  const handled = await makeController.handleThreadConcurrency({
    state,
    classifyError: () => ({ kind: "concurrency", code: "THREAD_CONCURRENTLY_UPDATED", status: 409, message: "latest required", retryable: false }),
    refreshThread: async () => { calls.push("refresh"); return { id: "42", messages: state.messages }; },
    reportConcurrencyRefresh: (requestId, refreshed) => calls.push(["metric", requestId, refreshed]),
    setDraft: (prompt) => calls.push(["draft", prompt]),
    appendUser: (_threadId, message) => { calls.push(["append", message]); state.messages.push(message); },
    failRequest: (messageId, failure) => calls.push(["failure", messageId, failure.kind]),
    updateThread: () => calls.push("update"), render: () => calls.push("render"), scrollLatest: () => calls.push("scroll"),
  }, {
    error: Object.assign(new Error("conflict"), { status: 409, code: "THREAD_CONCURRENTLY_UPDATED" }),
    prompt: "preserved prompt", requestId: "request-concurrent", threadId: "42",
  });

  assert.equal(handled, true);
  assert.equal(calls[0], "refresh");
  assert.deepEqual(calls[1], ["metric", "request-concurrent", true]);
  assert.deepEqual(calls[2], ["draft", "preserved prompt"]);
  assert.equal(calls[3][0], "append");
  assert.equal(calls[3][1].content, "preserved prompt");
  assert.equal(calls[3][1].retryMode, "follow-up");
  assert.equal(calls[3][1].retryMessageId, "");
  assert.equal(calls[4][0], "failure");
  assert.equal(state.messages.some((message) => message.content === "stale response"), false);
});

test("thread concurrency preserves the edited message route for explicit retry", async () => {
  const state = { messages: [] };
  await makeController.handleThreadConcurrency({
    state,
    classifyError: () => ({ kind: "concurrency", code: "THREAD_CONCURRENTLY_UPDATED", status: 409, message: "latest required", retryable: false }),
    refreshThread: async () => ({ id: "42", messages: state.messages }),
    reportConcurrencyRefresh: () => {}, setDraft: () => {},
    appendUser: (_threadId, message) => state.messages.push(message),
    failRequest: () => {}, updateThread: () => {}, render: () => {}, scrollLatest: () => {},
  }, {
    error: Object.assign(new Error("conflict"), { status: 409, code: "THREAD_CONCURRENTLY_UPDATED" }),
    prompt: "edited prompt", requestId: "request-edit", retryMessageId: "user-31", threadId: "42",
  });

  assert.equal(state.messages[0].retryMode, "edit");
  assert.equal(state.messages[0].retryMessageId, "user-31");
});

test("a stale cancelled request cannot clear a newer Make request", async () => {
  const OriginalFormData = global.FormData;
  global.FormData = class { get() { return "first request"; } };
  const firstController = new AbortController();
  const secondController = new AbortController();
  let currentSignal = firstController.signal;
  const calls = [];
  try {
    await makeController.submitPrompt({
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
  normalizeAndPersistMakeState(
    state,
    { migratePersistedMakeState: (value) => value },
    makeStateApi,
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
  const handlers = makeEvents.createDelegatedMakeHandlers({ state, maxFolders: 5, actions });
  const button = { dataset: { newChat: "" } };
  handlers.click({ target: { closest: () => button } });
  assert.deepEqual(calls, [["newChat"]]);
});

test("Make event routing delegates the explicit request cancellation control", () => {
  const calls = [];
  const handlers = makeEvents.createDelegatedMakeHandlers({
    state: {}, maxFolders: 5,
    actions: new Proxy({}, { get: (_target, key) => key === "guard" ? () => false : (...args) => calls.push([key, ...args]) }),
  });
  const button = { dataset: { cancelMakeRequest: "" } };
  handlers.click({ target: { closest: (selector) => selector === "button" ? button : null } });
  assert.deepEqual(calls, [["cancelRequest"]]);
});

test("Make event routing records an actual retry before resending", () => {
  const calls = [];
  const handlers = makeEvents.createDelegatedMakeHandlers({
    state: { messages: [{ id: "user-1", role: "user", content: "retry me" }] }, maxFolders: 5,
    actions: new Proxy({}, { get: (_target, key) => key === "guard" ? () => false : (...args) => calls.push([key, ...args]) }),
  });
  const button = { dataset: { retryMessage: "user-1" } };
  handlers.click({ target: { closest: (selector) => selector === "button" ? button : null } });
  assert.deepEqual(calls, [["reportRetry", { id: "user-1", role: "user", content: "retry me" }], ["resend", "user-1", "retry me"]]);
});
