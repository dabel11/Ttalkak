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
