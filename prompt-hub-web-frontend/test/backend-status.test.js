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
