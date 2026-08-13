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

test("report and comment forms bind through one delegated event boundary", async () => {
  const { bindReportAndCommentFormEvents } = await load("events/report-comment-form-events.mjs");
  const formSelectors = [];
  const listSelectors = [];
  const root = { querySelector: (selector) => { formSelectors.push(selector); return null; }, querySelectorAll: (selector) => { listSelectors.push(selector); return []; } };
  bindReportAndCommentFormEvents(root, {});
  assert.equal(formSelectors.length, 4);
  assert.equal(listSelectors.length, 4);
});
