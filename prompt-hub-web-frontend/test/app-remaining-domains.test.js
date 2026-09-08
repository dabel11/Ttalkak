const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const load = (file) => import(pathToFileURL(path.resolve(__dirname, `../src/${file}`)));

test("home page policy normalizes search labels and backend pagination", async () => {
  const policy = await load("home/home-page-policy.mjs");
  assert.match(policy.getSearchPlaceholder("author"), /작성자/);
  assert.equal(policy.getTotalPages(21, 10), 3);
  assert.deepEqual(policy.normalizeBackendPageMeta({ currentPage: 9, totalPages: 2, totalElements: 11 }, { fallbackPage: 1, pageSize: 10, itemCount: 0 }), { page: 2, size: 10, totalPages: 2, totalElements: 11 });
});

test("My Page data model combines backend and local records without duplicates", async () => {
  const { createMyPageDataModel } = await load("saved/my-page-data-model.mjs");
  const shared = { id: "comment-1", promptId: "prompt-1", text: "mine", owner: "me" };
  const state = { currentUser: "me", myBackendStatus: "connected", backendMyPrompts: [], backendMyComments: [shared], backendMyReports: [], reportedPromptIds: new Set(), reportedCommentIds: new Set(), adminPromptRevisionRequests: {} };
  const model = createMyPageDataModel({ state, savedPrompts: [], commentsByPrompt: { "prompt-1": [shared] }, canUseDemoFallback: () => false, isHiddenDemo: () => false, uniquePrompts: (items) => items, findPrompt: (id) => ({ id }), findComment: () => null, mapBackendReportStatus: String, getReportRecord: () => ({}), getRevisionTarget: () => null, isOwnedRevisionTarget: () => false });
  assert.equal(model.getComments().length, 1);
});

test("My Page hydration routes an expired session through the authentication boundary", async () => {
  const { backendEffects } = await load("effects/backend-effects.mjs");
  const unauthorized = Object.assign(new Error("expired"), { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } });
  const reject = async () => { throw unauthorized; };
  const handled = [];
  const state = { route: "saved", isLoggedIn: true, myBackendStatus: "idle" };

  await backendEffects.hydrateBackendMyPageDataEffect({
    api: { getMyLibrary: reject, getMyPrompts: reject, getMyComments: reject, getMyReports: reject },
    canUseDemoFallback: () => false,
    getAuthToken: () => "expired-token",
    handleBackendAccessError: (...args) => handled.push(args),
    state,
  });

  assert.equal(handled.length, 1);
  assert.equal(handled[0][0], unauthorized);
  assert.equal(handled[0][1], "로그인이 만료되었습니다. 다시 로그인해 주세요.");
});

test("My Page hydration exits checking state when one or more requests never settle", async () => {
  const { backendEffects } = await load("effects/backend-effects.mjs");
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const signals = [];
  const pending = ({ signal }) => {
    signals.push(signal);
    return new Promise(() => {});
  };
  const state = { route: "saved", isLoggedIn: true, myBackendStatus: "idle" };
  let renderCount = 0;

  globalThis.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};
  try {
    await backendEffects.hydrateBackendMyPageDataEffect({
      api: { getMyLibrary: pending, getMyPrompts: pending, getMyComments: pending, getMyReports: pending },
      canUseDemoFallback: () => false,
      getAuthToken: () => "fixture-token",
      render: () => { renderCount += 1; },
      state,
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(state.myBackendStatus, "fallback");
  assert.equal(renderCount, 2);
  assert.equal(signals.length, 5);
  assert.ok(signals.every((signal) => signal.aborted));
});

test("My Page hydration renders the connected state even when successful data is unchanged", async () => {
  const { backendEffects } = await load("effects/backend-effects.mjs");
  const state = {
    route: "saved",
    isLoggedIn: true,
    myBackendStatus: "idle",
    currentUser: "Fixture",
    backendLibraryPromptIds: new Set(),
    backendLibraryPrompts: [],
    backendLikedPrompts: [],
    backendMyPrompts: [],
    backendMyComments: [],
    backendMyReports: [],
    userLibraryPromptIds: new Set(),
    likedPromptIds: new Set(),
  };
  const emptyPage = async () => ({ items: [] });
  let renderCount = 0;

  await backendEffects.hydrateBackendMyPageDataEffect({
    api: {
      getMyLibrary: emptyPage,
      getMyPrompts: emptyPage,
      getMyComments: async () => [],
      getMyReports: async () => [],
    },
    applyContext: () => ({
      state,
      popularPrompts: [],
      savedPrompts: [],
      upsertPrompt: () => {},
    }),
    canUseDemoFallback: () => false,
    getAuthToken: () => "fixture-token",
    render: () => { renderCount += 1; },
    reportWarning: () => {},
    state,
  });

  assert.equal(state.myBackendStatus, "connected");
  assert.equal(renderCount, 2);
});

test("My Page hydration always exits checking when request setup throws", async () => {
  const { backendEffects } = await load("effects/backend-effects.mjs");
  const state = { route: "saved", isLoggedIn: true, myBackendStatus: "idle" };
  const warnings = [];
  let renderCount = 0;

  await backendEffects.hydrateBackendMyPageDataEffect({
    api: { getMyLibrary: () => { throw new Error("request setup failed"); } },
    canUseDemoFallback: () => false,
    getAuthToken: () => "fixture-token",
    render: () => { renderCount += 1; },
    reportWarning: (...args) => warnings.push(args),
    state,
  });

  assert.equal(state.myBackendStatus, "fallback");
  assert.equal(renderCount, 2);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1], "my-page-unexpected");
});

test("My Page hydration still exits checking when warning reporting fails", async () => {
  const { backendEffects } = await load("effects/backend-effects.mjs");
  const requestError = new Error("backend unavailable");
  const reject = async () => { throw requestError; };
  const state = { route: "saved", isLoggedIn: true, myBackendStatus: "idle" };
  let renderCount = 0;

  await backendEffects.hydrateBackendMyPageDataEffect({
    api: { getMyLibrary: reject, getMyPrompts: reject, getMyComments: reject, getMyReports: reject },
    applyContext: () => ({}),
    canUseDemoFallback: () => false,
    getAuthToken: () => "fixture-token",
    render: () => { renderCount += 1; },
    reportWarning: () => { throw new Error("warning sink failed"); },
    state,
  });

  assert.equal(state.myBackendStatus, "fallback");
  assert.equal(renderCount, 2);
});

test("My Page hides empty content while a production data load is unavailable", async () => {
  const { renderers: { SavedPageView } } = await load("renderers/pages/saved-page.mjs");
  let panelRenderCount = 0;
  const html = SavedPageView({
    icons: { user: "user" },
    state: { myPageTab: "library" },
    formatNumber: String,
    DemoLibraryPrompt: () => '<div class="is-error">My page 데이터를 불러오지 못했습니다</div>',
    MyPagePanel: () => { panelRenderCount += 1; return '<div class="saved-empty">empty</div>'; },
  }, {
    tabs: [{ id: "library", label: "내 보관함", count: 0 }],
    hideMyPagePanel: true,
  });

  assert.match(html, /My page 데이터를 불러오지 못했습니다/);
  assert.doesNotMatch(html, /saved-empty/);
  assert.equal(panelRenderCount, 0);
});

test("My Page data model merges reports and owned revisions while respecting fallback policy", async () => {
  const { createMyPageDataModel } = await load("saved/my-page-data-model.mjs");
  const state = {
    currentUser: "me", myBackendStatus: "connected", backendMyPrompts: [], backendMyComments: [],
    backendMyReports: [{ type: "prompt", targetId: "p1", reason: "spam", status: "PENDING", createdAt: 20 }],
    reportedPromptIds: new Set(["p1"]), reportedCommentIds: new Set(),
    adminPromptRevisionRequests: { "prompt:p2": { reason: "revise", requestedAt: 30 } },
  };
  const model = createMyPageDataModel({ state, savedPrompts: [], commentsByPrompt: {}, canUseDemoFallback: () => false, isHiddenDemo: () => false, uniquePrompts: (items) => items, findPrompt: (id) => ({ id, title: id }), findComment: () => null, mapBackendReportStatus: () => "pending", getReportRecord: () => ({ status: "pending", reason: "spam", createdAt: 20 }), getRevisionTarget: () => ({ type: "prompt", id: "p2", title: "p2" }), isOwnedRevisionTarget: () => true });
  const reports = model.getReports();
  assert.deepEqual(reports.map((item) => item.id), ["p2", "p1"]);
  state.myBackendStatus = "fallback";
  assert.deepEqual(model.getReports(), []);
  assert.deepEqual(model.getComments(), []);
  assert.deepEqual(model.getPrompts(), []);
});

test("report and comment forms bind through one delegated event boundary", async () => {
  const { bindReportAndCommentFormEvents } = await load("events/report-comment-form-events.mjs");
  const formSelectors = [];
  const listSelectors = [];
  const root = { querySelector: (selector) => { formSelectors.push(selector); return null; }, querySelectorAll: (selector) => { listSelectors.push(selector); return []; } };
  bindReportAndCommentFormEvents(root, {});
  assert.equal(formSelectors.length, 4);
  assert.equal(listSelectors.length, 4);
});

test("report and comment event boundary forwards form and click actions", async () => {
  const { bindReportAndCommentFormEvents } = await load("events/report-comment-form-events.mjs");
  const calls = [];
  const listeners = {};
  const reportForm = { dataset: { reportType: "prompt", reportForm: "p1" }, addEventListener: (type, fn) => { listeners.report = fn; } };
  const commentButton = { dataset: { reportComment: "c1" }, addEventListener: (_type, fn) => { listeners.comment = fn; } };
  const root = {
    querySelector: (selector) => selector === "[data-report-form]" ? reportForm : null,
    querySelectorAll: (selector) => selector === "[data-report-comment]" ? [commentButton] : [],
  };
  const NativeFormData = global.FormData;
  global.FormData = class { get(name) { return name === "reason" ? "spam" : null; } };
  try {
    bindReportAndCommentFormEvents(root, { submitReport: (...args) => calls.push(["report", ...args]), openReportComment: (...args) => calls.push(["comment", ...args]) });
    listeners.report({ preventDefault() {} });
    listeners.comment();
  } finally {
    global.FormData = NativeFormData;
  }
  assert.deepEqual(calls, [["report", "prompt", "p1", "spam"], ["comment", "c1"]]);
});
