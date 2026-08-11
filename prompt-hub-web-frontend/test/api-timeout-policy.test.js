const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../src");

test("browser API timeout leaves margin beyond the backend RAG timeout", () => {
  const source = fs.readFileSync(path.join(root, "api/core-api.js"), "utf8");
  assert.match(source, /TTALKAK_API_TIMEOUT_MS \|\| 90000/);
});

test("Make improvement forwards cancellation from route lifecycle to fetch", () => {
  const promptApi = fs.readFileSync(path.join(root, "api/prompt-api.js"), "utf8");
  const effects = fs.readFileSync(path.join(root, "effects/make-server-sync-effects.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const globals = fs.readFileSync(path.resolve(__dirname, "../types/browser-globals.d.ts"), "utf8");
  assert.match(promptApi, /signal, body: JSON\.stringify\(payload\)/);
  assert.match(effects, /getMakeApiToken\(\),\s*\{ signal \}/);
  assert.match(app, /state\.route === "make" && route !== "make"/);
  assert.match(app, /activeMakeRequestController\.abort\(\)/);
  assert.match(app, /activeMakeRequestController\?\.signal === signal/);
  assert.match(app, /improvePromptWithBackend\(prompt, \{ history, threadId, messageId, category, signal \}\)/);
  assert.match(globals, /improvePrompt\(payload: TtalkakPayload, token: TtalkakToken, options\?: \{ signal\?: AbortSignal \}\)/);
});

function loadCoreApi() {
  let timeoutCallback;
  const window = {
    localStorage: { getItem: () => "" },
    setTimeout(callback) { timeoutCallback = callback; return 1; },
    clearTimeout() {},
  };
  const fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  vm.runInNewContext(fs.readFileSync(path.join(root, "api/core-api.js"), "utf8"), {
    window, fetch, AbortController, URLSearchParams, console,
  });
  return { request: window.TTALKAK_API_CORE.request, runTimeout: () => timeoutCallback() };
}

test("an external abort remains a cancellation even when the timeout callback runs afterward", async () => {
  const { request, runTimeout } = loadCoreApi();
  const external = new AbortController();
  const pending = request("/api/prompts/improve", { signal: external.signal });
  external.abort();
  runTimeout();
  await assert.rejects(pending, (error) => error.code === "REQUEST_ABORTED");
});

test("the internal deadline is classified as a retryable request timeout", async () => {
  const { request, runTimeout } = loadCoreApi();
  const pending = request("/api/prompts/improve");
  runTimeout();
  await assert.rejects(pending, (error) => error.code === "REQUEST_TIMEOUT");
});
