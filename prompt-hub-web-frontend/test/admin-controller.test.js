const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let bindAdminEvents;
test.before(async () => { ({ bindAdminEvents } = await import("../src/admin/admin-events.mjs")); });

function control(dataset = {}) {
  const listeners = {};
  return {
    dataset,
    value: "",
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type, event = {}) { listeners[type]?.({ preventDefault() {}, stopPropagation() {}, ...event }); },
  };
}

test("admin events delegate prompt and report mutations", () => {
  const hide = control({ adminHidePrompt: "prompt-1" });
  const report = control({ adminReportStatus: "report-7:resolved" });
  const calls = [];
  const root = {
    querySelectorAll(selector) {
      if (selector === "[data-admin-hide-prompt]") return [hide];
      if (selector === "[data-admin-report-status]") return [report];
      return [];
    },
  };
  bindAdminEvents(root, {
    state: {},
    actions: {
      togglePromptHidden: (id) => calls.push(["hide", id]),
      updateReportStatus: (id, status) => calls.push(["report", id, status]),
      bindPromptEditAndExecute() {},
    },
  });
  hide.dispatch("click");
  report.dispatch("click");
  assert.deepEqual(calls, [["hide", "prompt-1"], ["report", "report-7", "resolved"]]);
});
test("app delegates administrator views and selectors", () => { const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8"); assert.match(app, /createAdminView/); assert.match(app, /createAdminSelectors/); ["AdminPage", "AdminUserActivitySummary", "getAdminManagedTags", "getAdminReportRecords", "matchesAdminPromptQuery"].forEach((name) => assert.doesNotMatch(app, new RegExp(`function\\s+${name}\\s*\\(`))); });

test("app delegates all administrator events and workflows", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
  assert.match(app, /createAdminController/);
  assert.match(app, /bindAdminEvents/);
  [
    "bindAdminControlEvents", "bindAdminPromptEvents", "bindAdminReportEvents", "bindAdminTagEvents",
    "bindAdminUserEvents", "searchAdminUserCandidates", "openAdminUserActivity",
    "updateAdminUserBlockState", "updateAdminTagDecision", "updateReportRecordStatus",
    "requestPromptRevision", "updateAuthorRevisionRequest", "updateAdminCommentHiddenState",
    "toggleAdminPromptHidden", "refreshAdminAuditLogs", "refreshAdminAfterMutation",
  ].forEach((name) => assert.doesNotMatch(app, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`)));
});
