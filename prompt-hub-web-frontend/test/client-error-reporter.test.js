const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const reporterModule = import(pathToFileURL(path.resolve(__dirname, "../src/observability/client-error-reporter.mjs")));

test("client error reporter normalizes, redacts, bounds, and isolates sink failures", async () => {
  const { createClientErrorReporter } = await reporterModule;
  const delivered = [];
  const reporter = createClientErrorReporter({ sink: (record) => delivered.push(record), now: () => 42, limit: 2 });
  const first = reporter.report(new Error("failed Bearer secret-token"), { area: "auth", action: "login", code: "AUTH" });
  reporter.report("second");
  reporter.report("third");
  assert.equal(first.message, "failed Bearer [REDACTED]");
  assert.deepEqual({ area: first.area, action: first.action, code: first.code, timestamp: first.timestamp }, { area: "auth", action: "login", code: "AUTH", timestamp: 42 });
  assert.equal(reporter.recent().length, 2);
  assert.equal(delivered.length, 3);
  assert.doesNotThrow(() => createClientErrorReporter({ sink: () => { throw new Error("sink failure"); } }).report("safe"));
});

test("global error observers report errors and can be removed", async () => {
  const { createClientErrorReporter, installGlobalErrorObservers } = await reporterModule;
  const target = new EventTarget();
  const reporter = createClientErrorReporter();
  const remove = installGlobalErrorObservers(target, reporter);
  const errorEvent = new Event("error");
  Object.defineProperty(errorEvent, "error", { value: new Error("boom") });
  target.dispatchEvent(errorEvent);
  const rejectionEvent = new Event("unhandledrejection");
  Object.defineProperty(rejectionEvent, "reason", { value: "rejected" });
  target.dispatchEvent(rejectionEvent);
  assert.deepEqual(reporter.recent().map(({ action }) => action), ["error", "unhandledrejection"]);
  remove();
  target.dispatchEvent(errorEvent);
  assert.equal(reporter.recent().length, 2);
});

test("explicit warning reporter preserves domain context without replacing console", async () => {
  const { createClientErrorReporter } = await reporterModule;
  const records = [];
  const reporter = createClientErrorReporter({ sink: (record) => records.push(record) });
  reporter.reportWarning("admin", "load-users", new Error("Bearer private-token"));
  assert.equal(records.length, 1);
  assert.equal(records[0].area, "admin");
  assert.equal(records[0].action, "load-users");
  assert.equal(records[0].level, "warning");
  assert.equal(records[0].message, "Bearer [REDACTED]");
});
