import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { normalizeImproveResult } from "../src/utils/normalizeImproveResult.js";
import { getMessageActionVisibility } from "../src/utils/messageActions.js";

const fixtures = JSON.parse(fs.readFileSync(new URL("../../fixtures/prompt-improve-responses.json", import.meta.url), "utf8"));

test("shared fixture matrix contains every required compatibility case", () => {
  assert.deepEqual(Object.keys(fixtures.responses).sort(), ["ask", "emptyCollections", "improve", "missingOptionalFields", "noEvidence", "unknownAdditionalField"]);
  assert.deepEqual(Object.keys(fixtures.errors).sort(), ["aiUnavailable", "timeout"]);
  assert.deepEqual(Object.keys(fixtures.clientMessages).sort(), ["cancelled", "legacyAssistant"]);
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
