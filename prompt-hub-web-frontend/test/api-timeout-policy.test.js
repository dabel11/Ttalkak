const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");

test("regular API requests keep 60 seconds while Make improvement receives 90 seconds", () => {
  const source = fs.readFileSync(path.join(root, "api/core-api.mjs"), "utf8");
  const promptApi = fs.readFileSync(path.join(root, "api/prompt-api.mjs"), "utf8");
  assert.match(source, /TTALKAK_API_TIMEOUT_MS \|\| 60000/);
  assert.match(source, /timeoutMs = API_TIMEOUT_MS/);
  assert.match(promptApi, /TTALKAK_IMPROVE_TIMEOUT_MS \|\| 90000/);
  assert.match(promptApi, /timeoutMs: IMPROVE_TIMEOUT_MS/);
});

test("Make improvement forwards cancellation from route lifecycle to fetch", () => {
  const promptApi = fs.readFileSync(path.join(root, "api/prompt-api.mjs"), "utf8");
  const effects = fs.readFileSync(path.join(root, "effects/make-server-sync-effects.mjs"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const globals = fs.readFileSync(path.resolve(__dirname, "../types/browser-globals.d.ts"), "utf8");
  assert.match(promptApi, /signal, timeoutMs: IMPROVE_TIMEOUT_MS, body: JSON\.stringify\(payload\)/);
  assert.match(effects, /getMakeApiToken\(\),\s*\{ signal \}/);
  assert.match(app, /state\.route === "make" && route !== "make"/);
  assert.match(app, /activeMakeRequestController\.abort\(\)/);
  assert.match(app, /activeMakeRequestController\?\.signal === signal/);
  assert.match(app, /improvePromptWithBackend\(prompt, \{ history, threadId, messageId, category, signal \}\)/);
  assert.match(globals, /improvePrompt\(payload: TtalkakPayload, token: TtalkakToken, options\?: \{ signal\?: AbortSignal \}\)/);
});

async function loadCoreApi() {
  let timeoutCallback;
  global.window = {
    localStorage: { getItem: () => "" },
    setTimeout(callback) { timeoutCallback = callback; return 1; },
    clearTimeout() {},
  };
  global.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const { request } = await import(`../src/api/core-api.mjs?test=${Date.now()}-${Math.random()}`);
  return { request, runTimeout: () => timeoutCallback() };
}

test("an external abort remains a cancellation even when the timeout callback runs afterward", async () => {
  const { request, runTimeout } = await loadCoreApi();
  const external = new AbortController();
  const pending = request("/api/prompts/improve", { signal: external.signal });
  external.abort();
  runTimeout();
  await assert.rejects(pending, (error) => error.code === "REQUEST_ABORTED");
});

test("the internal deadline is classified as a retryable request timeout", async () => {
  const { request, runTimeout } = await loadCoreApi();
  const pending = request("/api/prompts/improve");
  runTimeout();
  await assert.rejects(pending, (error) => error.code === "REQUEST_TIMEOUT");
});
