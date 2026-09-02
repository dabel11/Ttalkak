const test = require("node:test");
const assert = require("node:assert/strict");

let createBackendRecoveryMonitor;
let getBackendStatusPresentation;
test.before(async () => ({ createBackendRecoveryMonitor, getBackendStatusPresentation } = await import("../src/home/backend-status.mjs")));

test("backend status uses actionable environment-specific copy", () => {
  assert.deepEqual(getBackendStatusPresentation("fallback", { apiEnvironment: "development" }), {
    label: "연결 오류",
    title: "개발 서버에 연결할 수 없습니다",
    message: "로컬 백엔드가 실행 중인지 확인한 뒤 다시 연결해 주세요.",
  });
  assert.deepEqual(getBackendStatusPresentation("fallback", { apiEnvironment: "production" }), {
    label: "연결 오류",
    title: "서버에 연결할 수 없습니다",
    message: "네트워크 연결을 확인하고 잠시 후 다시 연결해 주세요.",
  });
  assert.match(getBackendStatusPresentation("fallback", { apiEnvironment: "development", demoFallbackEnabled: true }).message, /데모 데이터를 표시/);
});

test("backend recovery checks immediately when the browser comes online and stops after recovery", async () => {
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  browserDocument.visibilityState = "visible";
  let timerCallback = null;
  browserWindow.setTimeout = (callback) => { timerCallback = callback; return 1; };
  browserWindow.clearTimeout = () => { timerCallback = null; };
  let status = "fallback";
  let retryCount = 0;
  const monitor = createBackendRecoveryMonitor({
    browserWindow,
    browserDocument,
    getStatus: () => status,
    retry: async ({ automatic }) => { assert.equal(automatic, true); retryCount += 1; status = "connected"; },
    intervalMs: 10,
  });

  monitor.sync();
  assert.equal(typeof timerCallback, "function");
  browserWindow.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retryCount, 1);
  assert.equal(timerCallback, null);
  browserWindow.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retryCount, 1);
  monitor.dispose();
});

test("backend recovery avoids overlapping checks and pauses in hidden tabs", async () => {
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  browserDocument.visibilityState = "hidden";
  browserWindow.setTimeout = () => { throw new Error("hidden tabs must not schedule recovery"); };
  browserWindow.clearTimeout = () => {};
  let release;
  let retryCount = 0;
  const monitor = createBackendRecoveryMonitor({
    browserWindow,
    browserDocument,
    getStatus: () => "fallback",
    retry: () => new Promise((resolve) => { retryCount += 1; release = resolve; }),
  });
  assert.equal(await monitor.check(), false);
  browserDocument.visibilityState = "visible";
  const first = monitor.check();
  assert.equal(await monitor.check(), false);
  assert.equal(retryCount, 1);
  browserDocument.visibilityState = "hidden";
  release();
  await first;
  monitor.dispose();
});

test("backend recovery runs scheduled callbacks and applies bounded backoff", async () => {
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  browserDocument.visibilityState = "visible";
  const scheduled = [];
  browserWindow.setTimeout = (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; };
  browserWindow.clearTimeout = () => {};
  let retries = 0;
  const monitor = createBackendRecoveryMonitor({
    browserWindow,
    browserDocument,
    getStatus: () => "fallback",
    retry: async () => { retries += 1; },
    intervalMs: 10,
    maxIntervalMs: 25,
  });

  monitor.sync();
  assert.equal(scheduled.at(-1).delay, 10);
  scheduled.at(-1).callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retries, 1);
  assert.equal(scheduled.at(-1).delay, 20);
  scheduled.at(-1).callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retries, 2);
  assert.equal(scheduled.at(-1).delay, 25);
  monitor.dispose();
});

test("backend recovery pauses offline and resumes immediately online", async () => {
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  browserDocument.visibilityState = "visible";
  let online = false;
  Object.defineProperty(browserWindow, "navigator", { value: { get onLine() { return online; } } });
  let scheduled = false;
  browserWindow.setTimeout = () => { scheduled = true; return 1; };
  browserWindow.clearTimeout = () => { scheduled = false; };
  let retries = 0;
  const monitor = createBackendRecoveryMonitor({
    browserWindow,
    browserDocument,
    getStatus: () => "fallback",
    retry: async () => { retries += 1; },
  });

  monitor.sync();
  assert.equal(scheduled, false);
  assert.equal(await monitor.check(), false);
  online = true;
  browserWindow.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retries, 1);
  assert.equal(scheduled, true);
  online = false;
  browserWindow.dispatchEvent(new Event("offline"));
  assert.equal(scheduled, false);
  monitor.dispose();
});

test("backend recovery lease reduces simultaneous retries across tabs", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const makeBrowser = () => {
    const browserWindow = new EventTarget();
    browserWindow.setTimeout = () => 1;
    browserWindow.clearTimeout = () => {};
    const browserDocument = new EventTarget();
    browserDocument.visibilityState = "visible";
    return { browserWindow, browserDocument };
  };
  let release;
  let retries = 0;
  const firstContext = makeBrowser();
  const secondContext = makeBrowser();
  const first = createBackendRecoveryMonitor({
    ...firstContext,
    storage,
    getStatus: () => "fallback",
    retry: () => new Promise((resolve) => { retries += 1; release = resolve; }),
  });
  const second = createBackendRecoveryMonitor({
    ...secondContext,
    storage,
    getStatus: () => "fallback",
    retry: async () => { retries += 1; },
  });

  const pending = first.check();
  assert.equal(await second.check(), false);
  assert.equal(retries, 1);
  release();
  await pending;
  first.dispose();
  second.dispose();
});
