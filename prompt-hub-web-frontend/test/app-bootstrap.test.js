const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let createAppBootstrap;
test.before(async () => {
  ({ createAppBootstrap } = await import("../src/bootstrap/app-bootstrap.mjs"));
});

test("bootstrap runs persistence normalization render and home hydration in order", async () => {
  const calls = [];
  const bootstrap = createAppBootstrap({
    state: {},
    loadPersistedState: () => calls.push("load"),
    normalizeDemoCopy: () => calls.push("demo"),
    normalizeAssistantPromptOutputs: () => calls.push("messages"),
    normalizeRecentThreads: () => calls.push("threads"),
    ensureDemoComments: () => calls.push("comments"),
    render: () => calls.push("render"),
    hydrateBackendHomeDataEffect: () => calls.push("home"),
  });
  await bootstrap.bootstrap();
  assert.deepEqual(calls, ["load", "demo", "messages", "threads", "comments", "render", "home"]);
});

test("Make hydration is skipped while a request is thinking", async () => {
  let hydrations = 0;
  const bootstrap = createAppBootstrap({ state: {}, isMakeThinking: () => true, hydrateBackendMakeDataEffect: () => { hydrations += 1; } });
  await bootstrap.hydrateBackendMakeDataIfNeeded();
  assert.equal(hydrations, 0);
});

test("My Page refresh only forces hydration after a connected mutation", async () => {
  const calls = [];
  const state = { isLoggedIn: true, myBackendStatus: "connected" };
  const bootstrap = createAppBootstrap({ state, hydrateBackendMyPageDataEffect: (_ctx, options) => calls.push(options) });
  await bootstrap.refreshMyPageDataAfterMutation();
  assert.equal(state.myBackendStatus, "idle");
  assert.deepEqual(calls, [{ force: true }]);
});

test("app delegates bootstrap and hydration orchestration", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
  assert.match(app, /createAppBootstrap/);
  ["getBackendHydrationEffectContext", "hydrateBackendMakeDataIfNeeded", "hydrateBackendMyPageDataIfNeeded", "hydrateBackendAdminDataIfNeeded", "hydrateBackendHomeData", "refreshBackendHomePrompts"]
    .forEach((name) => assert.doesNotMatch(app, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`)));
});
