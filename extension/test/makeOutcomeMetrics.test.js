import test from "node:test";
import assert from "node:assert/strict";
import { createMakeFailureMetric, createMakeOutcomeMetric, createMakeRetryMetric } from "../src/utils/makeOutcomeMetrics.js";

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
    timestamp: 42,
  });
  assert.equal(JSON.stringify(metric).includes("private"), false);
});

test("Make outcome metrics distinguish ask, no-evidence fallback, and improved results", () => {
  assert.equal(createMakeOutcomeMetric("p", { mode: "ask" }).code, "ASK");
  assert.equal(createMakeOutcomeMetric("p", { mode: "improve", improvedPrompt: "changed", ragStatus: "no_evidence" }).code, "NO_EVIDENCE");
  assert.equal(createMakeOutcomeMetric("p", { mode: "improve", improvedPrompt: "changed" }).code, "IMPROVED");
});

test("Make failure metrics distinguish cancellation, timeout, AI, and contract failures", () => {
  assert.deepEqual(
    { ...createMakeFailureMetric({ code: "REQUEST_ABORTED" }, 12, () => 1), timestamp: undefined },
    { area: "make", action: "improve", kind: "cancel", code: "REQUEST_ABORTED", status: 0, durationMs: 12, outcome: "cancel", level: "info", retryable: false, timestamp: undefined },
  );
  assert.equal(createMakeFailureMetric({ code: "REQUEST_TIMEOUT" }).kind, "network");
  assert.equal(createMakeFailureMetric({ code: "AI_SERVICE_UNAVAILABLE", status: 503 }).kind, "ai");
  assert.equal(createMakeFailureMetric({ code: "AI_INVALID_RESPONSE" }).retryable, false);
});

test("an actual user retry emits a content-free interaction metric", () => {
  const metric = createMakeRetryMetric(() => 9);
  assert.deepEqual(metric, {
    area: "make", action: "improve", kind: "interaction", code: "USER_RETRY",
    status: 0, durationMs: 0, outcome: "retry", level: "info", retryable: false, timestamp: 9,
  });
  assert.equal(JSON.stringify(metric).includes("prompt"), false);
});
