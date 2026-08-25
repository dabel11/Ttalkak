import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { normalizeImproveResult } from "../src/utils/normalizeImproveResult.js";
import { getMessageActionVisibility } from "../src/utils/messageActions.js";

const fixtures = JSON.parse(fs.readFileSync(new URL("../../fixtures/prompt-improve-responses.json", import.meta.url), "utf8"));

test("shared fixture matrix contains every required compatibility case", () => {
  assert.deepEqual(Object.keys(fixtures.responses).sort(), ["ask", "emptyCollections", "improve", "missingOptionalFields", "noEvidence", "unknownAdditionalField"]);
  assert.deepEqual(Object.keys(fixtures.errors).sort(), ["aiUnavailable", "threadConcurrentlyUpdated", "timeout"]);
  assert.deepEqual(Object.keys(fixtures.clientMessages).sort(), ["cancelled", "legacyAssistant"]);
  assert.deepEqual(Object.keys(fixtures.regressions).sort(), ["exampleInQuestion", "improveWithNonActionableQuestions", "markdownDescription"]);
});

test("thread concurrency fixture stays distinct and requires an explicit post-refresh retry", async () => {
  const { classifyMakeError, getMakeFailureAction } = await import("../../shared/make-message-model.js");
  const failure = classifyMakeError(fixtures.errors.threadConcurrentlyUpdated);
  assert.equal(failure.kind, "concurrency");
  assert.equal(failure.retryable, false);
  assert.deepEqual(getMakeFailureAction(failure), { id: "retry-after-refresh", label: "다시 시도" });
});

test("optional, unknown, empty, and no-evidence fixtures remain normalizable", () => {
  for (const name of ["missingOptionalFields", "unknownAdditionalField", "emptyCollections", "noEvidence"]) {
    const normalized = normalizeImproveResult(fixtures.responses[name]);
    assert.equal(normalized.mode, "improve");
    assert.ok(normalized.improvedPrompt);
  }
  assert.equal(normalizeImproveResult(fixtures.responses.noEvidence).ragStatus, "no_evidence");
});

test("shared cancellation fixture is informational and non-actionable", () => {
  const cancelled = fixtures.clientMessages.cancelled;
  assert.equal(cancelled.isCancelled, true);
  assert.equal(cancelled.isError, false);
  assert.equal(cancelled.excludeFromHistory, true);
  assert.deepEqual(getMessageActionVisibility(cancelled), { copy: false, save: false, execute: false });
});

test("real response regressions preserve ask questions and executable improve results", () => {
  const ask = normalizeImproveResult(fixtures.regressions.exampleInQuestion);
  assert.equal(ask.mode, "ask");
  assert.equal(ask.questions.length, 1);
  assert.match(ask.questions[0].question, /예: 여행, 음식, 제품/);
  assert.deepEqual(getMessageActionVisibility({ role: "assistant", ...ask }), { copy: false, save: true, execute: false });

  const improve = normalizeImproveResult(fixtures.regressions.improveWithNonActionableQuestions);
  assert.equal(improve.mode, "improve");
  assert.ok(improve.improvedPrompt);
  assert.equal(getMessageActionVisibility({ role: "assistant", ...improve }).execute, true);
});
