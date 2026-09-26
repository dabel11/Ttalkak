const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let classifyMakeError;
let createPromptApi;
let errorEffects;
let getOrCreateGuestSessionUuid;
let isValidGuestSessionUuid;

test.before(async () => {
  ({ classifyMakeError } = await import("../src/utils/make-message-model.mjs"));
  ({ createPromptApi } = await import("../src/api/prompt-api.mjs"));
  ({ errorEffects } = await import("../src/effects/error-effects.mjs"));
  ({ getOrCreateGuestSessionUuid, isValidGuestSessionUuid } = await import("../src/usage/guest-session.mjs"));
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
    assert.deepEqual(requests[4].options.headers, {});
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
  const state = { isLoggedIn: false, authView: null };
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
  assert.match(notices[0], /무료 체험/);
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
