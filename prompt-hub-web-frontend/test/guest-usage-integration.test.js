const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let classifyMakeError;
let createPromptApi;
let backendEffects;
let errorEffects;
let getOrCreateGuestSessionUuid;
let isValidGuestSessionUuid;
let resolveMakeMessageFailure;
let stateApi;

test.before(async () => {
  ({ classifyMakeError } = await import("../src/utils/make-message-model.mjs"));
  ({ createPromptApi } = await import("../src/api/prompt-api.mjs"));
  ({ backendEffects } = await import("../src/effects/backend-effects.mjs"));
  ({ errorEffects } = await import("../src/effects/error-effects.mjs"));
  ({ getOrCreateGuestSessionUuid, isValidGuestSessionUuid } = await import("../src/usage/guest-session.mjs"));
  ({ resolveMakeMessageFailure } = await import("../src/make/make-page-adapter.mjs"));
  ({ state: stateApi } = await import("../src/state/app-state.mjs"));
});

function createMemoryStorage(initialValue = "") {
  const values = new Map(initialValue ? [["ttalkak_guest_session_uuid_v1", initialValue]] : []);
  return {
    getItem: (key) => values.get(key) || "",
    setItem: (key, value) => values.set(key, value),
  };
}

function createApi(requests) {
  return createPromptApi({
    request: async (requestPath, options) => {
      requests.push({ path: requestPath, options });
      return {};
    },
    unwrapItems: () => [],
    unwrapPageMeta: () => ({}),
    normalizers: {
      normalizePrompt: (value) => value,
      normalizePopularTag: (value) => value,
      normalizeAdminTag: (value) => value,
      normalizeImproveResult: (value) => value,
    },
  });
}

test("creates and persists a valid Guest UUID for a first-time visitor", () => {
  const emptyStorage = createMemoryStorage();
  const created = getOrCreateGuestSessionUuid(emptyStorage);

  assert.equal(isValidGuestSessionUuid(created), true);
  assert.equal(emptyStorage.getItem("ttalkak_guest_session_uuid_v1"), created);
  assert.equal(getOrCreateGuestSessionUuid(emptyStorage), created);
});

test("reuses a valid Guest UUID and replaces a corrupted stored value", () => {
  const validStorage = createMemoryStorage("00000000-0000-4000-8000-000000000001");
  assert.equal(getOrCreateGuestSessionUuid(validStorage), "00000000-0000-4000-8000-000000000001");

  const invalidStorage = createMemoryStorage("bad!value");
  const replacement = getOrCreateGuestSessionUuid(invalidStorage);
  assert.equal(isValidGuestSessionUuid(replacement), true);
  assert.notEqual(replacement, "bad!value");
  assert.equal(getOrCreateGuestSessionUuid(invalidStorage), replacement);
});

test("keeps one in-memory Guest UUID when browser storage is unavailable", () => {
  const unavailableStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  const first = getOrCreateGuestSessionUuid(unavailableStorage);
  assert.equal(getOrCreateGuestSessionUuid(unavailableStorage), first);
  assert.equal(isValidGuestSessionUuid(first), true);
});

test("sends the same Guest UUID on every anonymous improve request and omits it for members", async () => {
  const previousStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  try {
    const requests = [];
    const api = createApi(requests);
    for (let index = 0; index < 4; index += 1) await api.improvePrompt({ prompt: `guest-${index}` }, "");
    await api.improvePrompt({ prompt: "member" }, "member-token");

    const guestIds = requests.slice(0, 4).map(({ options }) => options.headers["X-Session-UUID"]);
    assert.equal(new Set(guestIds).size, 1);
    assert.equal(isValidGuestSessionUuid(guestIds[0]), true);
    assert.ok(requests.slice(0, 4).every(({ options }) => options.useStoredToken === false));
    assert.deepEqual(requests[4].options.headers, {});
    assert.equal(requests[4].options.useStoredToken, true);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("maps only the free-trial 429 to a login action", () => {
  const trialLimit = classifyMakeError({ status: 429, payload: { code: "FREE_TRIAL_LIMIT_EXCEEDED" } });
  assert.equal(trialLimit.kind, "guest_limit");
  assert.equal(trialLimit.requiresLogin, true);
  assert.equal(trialLimit.retryable, false);
  assert.equal(classifyMakeError({ status: 429, payload: { code: "AI_RATE_LIMIT_EXCEEDED" } }).kind, "rate_limit");
});

test("opens the login view for an anonymous free-trial limit response", () => {
  const notices = [];
  const state = { isLoggedIn: false, authView: null, activeThreadId: "local-thread", pendingGuestThreadTransferId: null, pendingGuestThreadTransferErrorCode: "" };
  errorEffects.handleBackendAccessErrorEffect({
    clearAuthenticatedSession: () => {},
    getAuthToken: () => "",
    getBackendErrorCode: (error) => error.payload.code,
    getBackendErrorMessage: (error) => error.payload.message,
    isDemoAuthToken: () => false,
    showNotice: (message) => notices.push(message),
    state,
  }, {
    status: 429,
    payload: {
      code: "FREE_TRIAL_LIMIT_EXCEEDED",
      message: "무료 체험 횟수를 모두 사용했습니다.",
    },
  });

  assert.equal(state.authView, "login");
  assert.equal(state.pendingGuestThreadTransferId, "local-thread");
  assert.equal(state.pendingGuestThreadTransferErrorCode, "FREE_TRIAL_LIMIT_EXCEEDED");
  assert.match(notices[0], /무료 체험/);
});

test("treats SESSION_UUID_REQUIRED with a bearer token as an expired login", () => {
  const notices = [];
  let clearCount = 0;
  const state = stateApi.createInitialState();
  Object.assign(state, {
    route: "make",
    isLoggedIn: true,
    authView: null,
    activeThreadId: "stale-token-thread",
    recentThreads: [{ id: "stale-token-thread", serverId: "42", messages: [
      { id: "old-user", role: "user", content: "private history" },
      { id: "failed-user", role: "user", content: "retry after login", requestId: "request-1" },
    ] }],
    messages: [
      { id: "old-user", role: "user", content: "private history" },
      { id: "failed-user", role: "user", content: "retry after login", requestId: "request-1" },
    ],
  });
  errorEffects.handleBackendAccessErrorEffect({
    clearAuthenticatedSession: (options) => {
      clearCount += 1;
      stateApi.clearAuthenticatedSessionState(state, options);
    },
    getAuthToken: () => "expired-token",
    getBackendErrorCode: (error) => error.payload.code,
    getBackendErrorMessage: (error) => error.payload.message,
    isDemoAuthToken: () => false,
    showNotice: (message) => notices.push(message),
    state,
  }, {
    status: 400,
    payload: { code: "SESSION_UUID_REQUIRED", message: "Session UUID is required" },
  }, undefined, { recoveryPrompt: "retry after login" });

  assert.equal(clearCount, 1);
  assert.equal(state.authView, "login");
  assert.match(state.pendingGuestThreadTransferId, /^auth-recovery-/);
  assert.equal(state.pendingGuestThreadTransferErrorCode, "AUTHENTICATION_REQUIRED");
  assert.deepEqual(state.messages.map(({ content }) => content), ["retry after login"]);
  assert.equal(Boolean(state.recentThreads[0].serverId), false);
  assert.deepEqual(notices, ["로그인이 만료되었습니다. 다시 로그인해주세요."]);
});

test("an authenticated Make 401 keeps only the failed prompt as reload-safe recovery state", () => {
  const state = stateApi.createInitialState();
  Object.assign(state, {
    route: "make",
    isLoggedIn: true,
    currentUser: "Member",
    currentUserId: "7",
    activeThreadId: "42",
    recentThreads: [{ id: "42", serverId: "42", title: "Private conversation", messages: [
      { id: "private-user", role: "user", content: "private history" },
      { id: "private-assistant", role: "assistant", content: "private answer" },
      { id: "failed-user", role: "user", content: "old prompt version", requestPrompt: "retry this prompt", requestId: "request-401" },
    ] }],
    messages: [
      { id: "private-user", role: "user", content: "private history" },
      { id: "private-assistant", role: "assistant", content: "private answer" },
      { id: "failed-user", role: "user", content: "old prompt version", requestPrompt: "retry this prompt", requestId: "request-401" },
    ],
  });
  let token = "expired-token";

  errorEffects.handleBackendAccessErrorEffect({
    clearAuthenticatedSession: (options) => {
      token = "";
      stateApi.clearAuthenticatedSessionState(state, options);
    },
    getAuthToken: () => token,
    getBackendErrorCode: (error) => error.payload.code,
    getBackendErrorMessage: () => "",
    isDemoAuthToken: () => false,
    showNotice: () => {},
    state,
  }, {
    status: 401,
    payload: { code: "AUTHENTICATION_REQUIRED" },
  }, "로그인이 만료되었습니다.", { recoveryPrompt: "new private prompt" });

  assert.equal(state.isLoggedIn, false);
  assert.equal(state.authView, "login");
  assert.match(state.activeThreadId, /^auth-recovery-/);
  assert.equal(state.pendingGuestThreadTransferId, state.activeThreadId);
  assert.equal(state.pendingGuestThreadTransferErrorCode, "AUTHENTICATION_REQUIRED");
  assert.equal(state.recentThreads.length, 1);
  assert.equal(Boolean(state.recentThreads[0].serverId), false);
  assert.deepEqual(state.messages.map(({ content }) => content), ["new private prompt"]);
  assert.equal(state.messages.some(({ content }) => content === "private history"), false);
  assert.equal(state.messages[0].retryMode, "follow-up");
  assert.equal(state.messages[0].requestId, undefined);
  assert.equal(state.messages[0].requestPrompt, undefined);

  const failure = resolveMakeMessageFailure({
    state,
    requestState: { failedMessageId: "", failure: null, inFlight: false },
    messageModel: { classifyMakeError },
  }, state.messages[0]);
  assert.equal(failure.kind, "auth");
  assert.equal(failure.requiresLogin, true);
});

test("rejecting a new member token restores the complete pending Guest thread only", () => {
  const guestThread = {
    id: "guest-pending",
    serverId: "",
    title: "Guest conversation",
    messages: [
      { id: "guest-user", role: "user", content: "Guest history" },
      { id: "guest-failed", role: "user", content: "Guest retry" },
    ],
  };
  const state = stateApi.createInitialState();
  Object.assign(state, {
    route: "make",
    isLoggedIn: true,
    activeThreadId: guestThread.id,
    recentThreads: [guestThread, { id: "42", serverId: "42", messages: [{ role: "user", content: "member private" }] }],
    messages: guestThread.messages.map((message) => ({ ...message })),
    pendingGuestThreadTransferId: guestThread.id,
    pendingGuestThreadTransferErrorCode: "FREE_TRIAL_LIMIT_EXCEEDED",
  });
  let token = "rejected-token";

  errorEffects.handleBackendAccessErrorEffect({
    clearAuthenticatedSession: (options) => {
      token = "";
      stateApi.clearAuthenticatedSessionState(state, options);
    },
    getAuthToken: () => token,
    getBackendErrorCode: (error) => error.payload.code,
    getBackendErrorMessage: () => "",
    isDemoAuthToken: () => false,
    showNotice: () => {},
    state,
  }, { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } });

  assert.deepEqual(state.recentThreads.map(({ id }) => id), [guestThread.id]);
  assert.deepEqual(state.messages.map(({ content }) => content), ["Guest history", "Guest retry"]);
  assert.equal(state.pendingGuestThreadTransferId, guestThread.id);
  assert.equal(state.pendingGuestThreadTransferErrorCode, "FREE_TRIAL_LIMIT_EXCEEDED");
});

test("member hydration keeps the pending Guest transfer marker when a new login token is rejected", async () => {
  const authError = { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } };
  const state = {
    route: "make",
    makeBackendStatus: "idle",
    isLoggedIn: true,
    authView: null,
    pendingGuestThreadTransferId: "local-thread",
    pendingGuestThreadTransferErrorCode: "FREE_TRIAL_LIMIT_EXCEEDED",
    activeThreadId: "local-thread",
    recentThreads: [{ id: "local-thread", serverId: "", messages: [{ id: "guest-user", role: "user", content: "retry after login" }] }],
    messages: [{ id: "guest-user", role: "user", content: "retry after login" }],
  };
  let clearCount = 0;
  let renderCount = 0;
  let token = "expired-token";
  const clearAuthenticatedSession = () => {
    clearCount += 1;
    token = "";
    state.isLoggedIn = false;
    state.pendingGuestThreadTransferId = null;
    state.pendingGuestThreadTransferErrorCode = "";
  };

  await backendEffects.hydrateBackendMakeDataEffect({
    applyContext: () => ({}),
    canUseDemoFallback: () => false,
    clearAuthenticatedSession,
    getApiFailureMessage: () => "API unavailable",
    getAuthToken: () => token,
    getMakeApi: () => ({
      getMakeThreads: async () => { throw authError; },
      getMakeFolders: async () => { throw authError; },
    }),
    getMakeApiToken: () => "expired-token",
    getMakeInteractionVersion: () => 0,
    hasBackendAuthToken: () => true,
    handleBackendAccessError: (error, fallbackMessage) => errorEffects.handleBackendAccessErrorEffect({
      clearAuthenticatedSession,
      getAuthToken: () => token,
      getBackendErrorCode: (value) => value.payload.code,
      getBackendErrorMessage: () => "",
      isDemoAuthToken: () => false,
      showNotice: () => {},
      state,
    }, error, fallbackMessage),
    makeState: { setMakeBackendState: (target, status, message) => { target.makeBackendStatus = status; target.makeBackendMessage = message; } },
    render: () => { renderCount += 1; },
    reportWarning: () => {},
    state,
  });

  assert.equal(clearCount, 1);
  assert.equal(renderCount, 1);
  assert.equal(state.authView, "login");
  assert.equal(state.makeBackendStatus, "fallback");
  assert.equal(state.pendingGuestThreadTransferId, "local-thread");
  assert.equal(state.pendingGuestThreadTransferErrorCode, "FREE_TRIAL_LIMIT_EXCEEDED");
});

test("a persisted pending Guest transfer restores the login action on the last user message", () => {
  const first = { id: "first-user", role: "user", content: "Earlier prompt" };
  const pending = { id: "pending-user", role: "user", content: "Retry after login" };
  const state = {
    activeThreadId: "local-thread",
    pendingGuestThreadTransferId: "local-thread",
    pendingGuestThreadTransferErrorCode: "FREE_TRIAL_LIMIT_EXCEEDED",
    messages: [first, { id: "first-assistant", role: "assistant", content: "Earlier result" }, pending],
  };
  const ctx = { state, requestState: { failedMessageId: "", failure: null }, messageModel: { classifyMakeError } };

  assert.equal(resolveMakeMessageFailure(ctx, first), null);
  const restoredFailure = resolveMakeMessageFailure(ctx, pending);
  assert.equal(restoredFailure.kind, "guest_limit");
  assert.equal(restoredFailure.requiresLogin, true);
  ctx.requestState.inFlight = true;
  assert.equal(resolveMakeMessageFailure(ctx, pending), null);
});

test("member hydration preserves only the Guest conversation awaiting transfer", () => {
  const pendingThread = { id: "local-thread", title: "Guest draft", messages: [{ role: "user", content: "preserve me" }] };
  const unrelatedThread = { id: "other-local-thread", title: "Other account draft", messages: [{ role: "user", content: "do not keep me active" }] };
  const state = {
    activeThreadId: unrelatedThread.id,
    messages: unrelatedThread.messages,
    pendingGuestThreadTransferId: pendingThread.id,
    recentThreads: [pendingThread, unrelatedThread],
  };
  const context = {
    isBackendNumericId: (value) => /^\d+$/.test(String(value || "")),
    makePreview: (value) => String(value || ""),
    makeState: { setMakeRecentThreads: (target, threads) => { target.recentThreads = threads; } },
    normalizeRecentThreads: () => {},
    state,
  };

  backendEffects.applyMakeThreadsResult(context, [{ id: 42, title: "Saved thread", messages: [] }]);
  assert.equal(state.recentThreads.length, 2);
  assert.equal(state.recentThreads[0], pendingThread);
  assert.equal(state.recentThreads[1].serverId, "42");
  assert.equal(state.activeThreadId, pendingThread.id);
  assert.deepEqual(state.messages, pendingThread.messages);
  assert.notEqual(state.messages, pendingThread.messages);

  state.pendingGuestThreadTransferId = null;
  state.recentThreads = [unrelatedThread];
  state.activeThreadId = unrelatedThread.id;
  state.messages = unrelatedThread.messages;
  backendEffects.applyMakeThreadsResult(context, []);
  assert.deepEqual(state.recentThreads, []);
  assert.equal(state.activeThreadId, null);
  assert.deepEqual(state.messages, []);
});

test("production Web sources do not keep a client-side Guest request counter", () => {
  const root = path.resolve(__dirname, "../src");
  const files = [
    "app.js",
    "make/make-controller.mjs",
    "runtime/app-static-data.mjs",
    "state/state-core.mjs",
    "state/state-persistence.mjs",
  ];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /guestImproveCount|FREE_MAKE_LIMIT/);
});
