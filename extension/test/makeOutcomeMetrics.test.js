import test from "node:test";
import assert from "node:assert/strict";
import { createMakeFailureMetric, createMakeOutcomeMetric, createMakeRetryMetric, reportMakeConcurrencyRefresh } from "../src/utils/makeOutcomeMetrics.js";

test("Make outcome metrics classify successful results without content", () => {
  const metric = createMakeOutcomeMetric("private prompt", {
    mode: "improve",
    improvedPrompt: "private prompt",
    ragStatus: "no_evidence",
    history: ["private conversation"],
    token: "private token",
  }, 1250.4, () => 42);

  assert.deepEqual(metric, {
    area: "make",
    action: "improve",
    kind: "result",
    code: "UNCHANGED_NO_EVIDENCE",
    status: 200,
    durationMs: 1250,
    outcome: "success",
    level: "info",
    retryable: false,
    client: "extension",
    requestCorrelation: "",
    timestamp: 42,
  });
  assert.equal(JSON.stringify(metric).includes("private"), false);
});

test("Make outcome metrics distinguish ask, no-evidence fallback, and improved results", () => {
  assert.equal(createMakeOutcomeMetric("p", { mode: "ask" }).code, "ASK");
  assert.equal(createMakeOutcomeMetric("p", { mode: "improve", improvedPrompt: "changed", ragStatus: "no_evidence" }).code, "NO_EVIDENCE");
  assert.equal(createMakeOutcomeMetric("p", { mode: "improve", improvedPrompt: "changed" }).code, "IMPROVED");
  const replay = createMakeOutcomeMetric("private", { replayed: true, requestId: "request-private" });
  assert.equal(replay.code, "REPLAYED");
  assert.match(replay.requestCorrelation, /^req_[0-9a-f]{8}$/);
  assert.equal(JSON.stringify(replay).includes("request-private"), false);
});

test("Make failure metrics distinguish cancellation, timeout, AI, and contract failures", () => {
  assert.deepEqual(
    { ...createMakeFailureMetric({ code: "REQUEST_ABORTED" }, 12, () => 1), timestamp: undefined },
    { area: "make", action: "improve", kind: "cancel", code: "REQUEST_ABORTED", status: 0, durationMs: 12, outcome: "cancel", level: "info", retryable: false, client: "extension", requestCorrelation: "", timestamp: undefined },
  );
  assert.equal(createMakeFailureMetric({ code: "REQUEST_TIMEOUT" }).kind, "network");
  assert.equal(createMakeFailureMetric({ code: "AI_SERVICE_UNAVAILABLE", status: 503 }).kind, "ai");
  assert.equal(createMakeFailureMetric({ code: "AI_INVALID_RESPONSE" }).retryable, false);
  const concurrency = createMakeFailureMetric({ code: "THREAD_CONCURRENTLY_UPDATED", status: 409 });
  assert.equal(concurrency.kind, "concurrency");
  assert.equal(concurrency.retryable, false);
});

test("an actual user retry emits a content-free correlated interaction metric", () => {
  const metric = createMakeRetryMetric(() => 9, "request-private");
  assert.deepEqual(metric, {
    area: "make", action: "improve", kind: "interaction", code: "USER_RETRY",
    status: 0, durationMs: 0, outcome: "retry", level: "info", retryable: false,
    client: "extension", requestCorrelation: "req_baa0f674", timestamp: 9,
  });
  assert.equal(JSON.stringify(metric).includes("private"), false);
});

test("concurrency refresh outcome is correlated without exposing the request id", () => {
  const metric = reportMakeConcurrencyRefresh("request-private", true, { dispatchEvent() {} });
  assert.equal(metric.code, "THREAD_REFRESHED_AFTER_CONFLICT");
  assert.equal(metric.outcome, "success");
  assert.match(metric.requestCorrelation, /^req_[0-9a-f]{8}$/);
  assert.equal(JSON.stringify(metric).includes("request-private"), false);
});
