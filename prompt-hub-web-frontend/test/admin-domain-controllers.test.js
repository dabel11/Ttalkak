const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const load = (file) => import(pathToFileURL(path.resolve(__dirname, `../src/admin/${file}`)));

test("admin tag controller rejects invalid transitions and applies valid changes", async () => {
  const { createAdminTagController } = await load("admin-tag-controller.mjs");
  const state = { backendAdminTags: [{ id: "1", key: "ai", status: "pending" }], adminTagDecisions: {} };
  const notices = [];
  const applied = [];
  const controller = createAdminTagController({ state, normalizeTag: String, canTransition: (_from, to) => to === "approved", canUseApi: () => false, runMutation: async () => ({ ok: true }), applyState: (_state, value) => applied.push(value), getStatusLabel: String, showNotice: (message) => notices.push(message), refresh: async () => {} });
  await controller.update("ai", "rejected");
  await controller.update("ai", "approved");
  assert.equal(applied.length, 1);
  assert.match(notices[0], /변경을 할 수 없습니다/);
});

test("admin report controller prevents reopening finalized reports", async () => {
  const { createAdminReportController } = await load("admin-report-controller.mjs");
  const notices = [];
  const controller = createAdminReportController({ state: {}, getRecord: () => ({ status: "resolved" }), isFinal: () => true, canUseApi: () => false, runMutation: async () => ({ ok: true }), toBackendStatus: String, fromBackendStatus: String, getStatusLabel: String, applyState: () => "pending", showNotice: (message) => notices.push(message), refresh: async () => {} });
  await controller.updateStatus("prompt:1", "pending");
  assert.equal(notices.length, 1);
  assert.match(notices[0], /다시 변경할 수 없습니다/);
});

test("admin user controller owns search and block workflows", async () => {
  const { createAdminUserController } = await load("admin-user-controller.mjs");
  const state = { backendAdminPrompts: [], backendAdminUserActivities: {}, adminUserActivityNickname: "" };
  const notices = [];
  const mutations = [];
  const controller = createAdminUserController({
    state, api: {}, canUseDemoFallback: () => true, getAuthToken: () => "token", hasBackendAuthToken: () => false,
    handleBackendAccessError: () => {}, render: () => {}, showNotice: (message) => notices.push(message),
    normalizeAdminSearchText: (value) => String(value || "").trim().toLowerCase(), getAdminUserActivity: () => ({}),
    getUniquePrompts: (items) => items, popularPrompts: [], savedPrompts: [], getDisplayPromptAuthor: () => "",
    getPromptAuthorId: () => "", getSortedPromptComments: () => [], getAdminReportRecords: () => [],
    applyAdminUserActivityRefreshState: () => {}, applyAdminUserBlockActivityState: () => ({ displayNickname: "user", normalizedNickname: "user" }),
    runAdminApiMutation: async (action, args) => { mutations.push({ action, args }); return { ok: true, value: {} }; },
    getAdminApiAction: () => () => {}, reportWarning: () => {},
  });
  await controller.search("missing");
  assert.deepEqual(state.adminUserSearchResults, []);
  await controller.updateBlockState("42", true, "user", "policy");
  assert.deepEqual(mutations, [{ action: "blockAdminUser", args: ["42", { reason: "policy" }] }]);
  assert.match(notices.at(-1), /차단을 처리/);
});

function createAdminUserContext(overrides = {}) {
  const state = { backendAdminPrompts: [], backendAdminUserActivities: {}, adminUserActivityNickname: "", ...overrides.state };
  return {
    api: {}, canUseDemoFallback: () => true, getAuthToken: () => "token", hasBackendAuthToken: () => true,
    handleBackendAccessError: () => {}, render: () => {}, showNotice: () => {},
    normalizeAdminSearchText: (value) => String(value || "").trim().toLowerCase(), getAdminUserActivity: () => ({}),
    getUniquePrompts: (items) => items, popularPrompts: [], savedPrompts: [], getDisplayPromptAuthor: (prompt) => prompt.author || "",
    getPromptAuthorId: (prompt) => prompt.authorId || "", getSortedPromptComments: () => [], getAdminReportRecords: () => [],
    applyAdminUserActivityRefreshState: () => {}, applyAdminUserBlockActivityState: () => ({ displayNickname: "user", normalizedNickname: "user" }),
    runAdminApiMutation: async () => ({ ok: true, value: {} }), getAdminApiAction: () => () => {}, reportWarning: () => {},
    ...overrides,
    state,
  };
}

test("admin user activity fetch stores the resolved backend member", async () => {
  const { createAdminUserController } = await load("admin-user-controller.mjs");
  const ctx = createAdminUserContext({
    api: {
      searchAdminUsers: async () => [{ id: "7", nickname: "Alice" }],
      getAdminUserActivity: async () => ({ nickname: "Alice", active: true, prompts: [] }),
    },
  });
  await createAdminUserController(ctx).openActivity("ali");
  assert.equal(ctx.state.adminUserActivityNickname, "Alice");
  assert.equal(ctx.state.backendAdminUserActivities.alice.memberId, "7");
});

test("admin user search falls back to local candidates after an API failure", async () => {
  const { createAdminUserController } = await load("admin-user-controller.mjs");
  const warnings = [];
  const ctx = createAdminUserContext({
    api: { searchAdminUsers: async () => { throw new Error("offline"); } },
    popularPrompts: [{ id: "p1", author: "Local User", authorId: "9" }],
    reportWarning: (...args) => warnings.push(args),
  });
  await createAdminUserController(ctx).search("local");
  assert.deepEqual(ctx.state.adminUserSearchResults.map(({ id, nickname }) => ({ id, nickname })), [{ id: "9", nickname: "Local User" }]);
  assert.equal(warnings[0][1], "search-users");
});

test("admin user block reports a failed follow-up refresh without rolling back success", async () => {
  const { createAdminUserController } = await load("admin-user-controller.mjs");
  const warnings = [];
  const ctx = createAdminUserContext({
    api: { getAdminUserActivity: async () => { throw new Error("refresh failed"); } },
    reportWarning: (...args) => warnings.push(args),
  });
  await createAdminUserController(ctx).updateBlockState("42", false, "user");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warnings[0][1], "refresh-user-after-block");
});
