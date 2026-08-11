import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { fetchWithAbortPolicy } from "../src/api/fetchPolicy.js";
import { getApiErrorMessage } from "../src/utils/apiErrors.js";
import { buildImproveHistory } from "../src/utils/conversationHistory.js";
import {
  createCancelledMessage,
  createImproveRequestCoordinator,
} from "../src/utils/improveRequestLifecycle.js";
import { normalizeImproveResult } from "../src/utils/normalizeImproveResult.js";

function abortableFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
  });
}

test("improve uses 90 seconds while the shared API default remains 60 seconds", async () => {
  const constants = await readFile(new URL("../src/constants.js", import.meta.url), "utf8");
  const prompts = await readFile(new URL("../src/api/prompts.js", import.meta.url), "utf8");
  assert.match(constants, /API_TIMEOUT_MS\s*=\s*60000/);
  assert.match(constants, /IMPROVE_API_TIMEOUT_MS\s*=\s*90000/);
  assert.match(prompts, /timeoutMs:\s*IMPROVE_API_TIMEOUT_MS/);
  assert.match(prompts, /signal,/);
});

test("internal timeout aborts the request and reports REQUEST_TIMEOUT", async () => {
  let timeoutCallback;
  let configuredDelay;
  let cleared = false;
  const pending = fetchWithAbortPolicy("/improve", { timeoutMs: 90_000 }, {
    defaultTimeoutMs: 60_000,
    fetchImpl: abortableFetch,
    setTimer(callback, delay) {
      timeoutCallback = callback;
      configuredDelay = delay;
      return 7;
    },
    clearTimer(id) {
      assert.equal(id, 7);
      cleared = true;
    },
  });
  assert.equal(configuredDelay, 90_000);
  timeoutCallback();
  await assert.rejects(pending, (error) => (
    error.code === "REQUEST_TIMEOUT"
    && error.status === 0
    && error.message === "응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
  ));
  assert.equal(cleared, true);
});

test("external cancellation is distinct from timeout and cleans up the timer", async () => {
  const external = new AbortController();
  let cleared = false;
  let configuredDelay;
  const pending = fetchWithAbortPolicy("/improve", { signal: external.signal }, {
    defaultTimeoutMs: 60_000,
    fetchImpl: abortableFetch,
    setTimer(_callback, delay) {
      configuredDelay = delay;
      return 11;
    },
    clearTimer(id) {
      assert.equal(id, 11);
      cleared = true;
    },
  });
  external.abort("user");
  await assert.rejects(pending, (error) => (
    error.code === "REQUEST_ABORTED"
    && error.status === 0
    && error.message === "요청이 취소되었습니다."
  ));
  assert.equal(configuredDelay, 60_000);
  assert.equal(cleared, true);
});

test("a completed request removes the external abort listener", async () => {
  let registeredListener;
  let removedListener;
  const externalSignal = {
    aborted: false,
    addEventListener(type, listener) {
      assert.equal(type, "abort");
      registeredListener = listener;
    },
    removeEventListener(type, listener) {
      assert.equal(type, "abort");
      removedListener = listener;
    },
  };
  const response = await fetchWithAbortPolicy("/health", { signal: externalSignal }, {
    defaultTimeoutMs: 60_000,
    fetchImpl: async () => ({ ok: true }),
    setTimer() { return 12; },
    clearTimer() {},
  });
  assert.equal(response.ok, true);
  assert.equal(removedListener, registeredListener);
});

test("an abort-ignoring fetch still resolves as REQUEST_ABORTED", async () => {
  const external = new AbortController();
  let resolveFetch;
  const pending = fetchWithAbortPolicy("/improve", { signal: external.signal }, {
    defaultTimeoutMs: 60_000,
    fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; }),
    setTimer() { return 13; },
    clearTimer() {},
  });
  external.abort();
  resolveFetch({ ok: true });
  await assert.rejects(pending, (error) => error.code === "REQUEST_ABORTED");
});

test("cancelling makes even an abort-ignoring late response ineligible", () => {
  const coordinator = createImproveRequestCoordinator();
  const request = coordinator.start();
  assert.equal(coordinator.canAcceptResult(request), true);
  assert.equal(coordinator.cancel(), request);
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(coordinator.isCurrent(request), true);
  assert.equal(coordinator.canAcceptResult(request), false);
  assert.equal(coordinator.finish(request), true);
  assert.equal(coordinator.isCurrent(request), false);
  assert.equal(coordinator.canAcceptResult(request), false);
});

test("a newer request owns state and the previous request cannot finish it", () => {
  const coordinator = createImproveRequestCoordinator();
  const first = coordinator.start();
  const second = coordinator.start();
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(coordinator.isCurrent(first), false);
  assert.equal(coordinator.canAcceptResult(first), false);
  assert.equal(coordinator.finish(first), false);
  assert.equal(coordinator.canAcceptResult(second), true);
});

test("cancel and failed messages never contaminate improve history", () => {
  const history = buildImproveHistory([
    { role: "user", content: "original prompt" },
    createCancelledMessage("original prompt", "cancelled"),
    { role: "assistant", content: "service unavailable", isError: true },
  ]);
  assert.deepEqual(history, [{ role: "user", content: "original prompt" }]);
});

test("no-evidence remains a successful normalized fallback", () => {
  const result = normalizeImproveResult({
    mode: "improve",
    answer: "fallback answer",
    ragStatus: "no_evidence",
  }, "source prompt");
  assert.equal(result.mode, "improve");
  assert.equal(result.ragStatus, "no_evidence");
  assert.equal(result.answer, "fallback answer");
});

test("backend unavailable and rate-limit policies remain distinguishable", () => {
  const unavailable = getApiErrorMessage(503, { code: "AI_SERVICE_UNAVAILABLE" });
  const rateLimited = getApiErrorMessage(429, { code: "AI_RATE_LIMIT_EXCEEDED" });
  assert.equal(typeof unavailable, "string");
  assert.equal(typeof rateLimited, "string");
  assert.ok(unavailable.length > 0);
  assert.ok(rateLimited.length > 0);
  assert.notEqual(unavailable, rateLimited);
});

test("cancel control and all improve entry points share the request lifecycle", async () => {
  const chatFeed = await readFile(new URL("../src/components/ChatFeed.jsx", import.meta.url), "utf8");
  const hook = await readFile(new URL("../src/hooks/useConversation.js", import.meta.url), "utf8");
  assert.match(chatFeed, /cancel-request-button/);
  assert.match(chatFeed, /onCancelRequest/);
  assert.match(hook, /handleImproveCancellation/);
  assert.match(hook, /handleImproveCancellation\(request,[\s\S]*?finishImproveRequest\(request\)/);
  assert.equal((hook.match(/beginImproveRequest\(prompt, \{ restoreComposer: true \}\)/g) || []).length, 3);
  assert.equal((hook.match(/requestPromptImprove\([\s\S]*?signal:\s*request\.controller\.signal/g) || []).length, 3);
  assert.equal((hook.match(/canAcceptResult\(request\)/g) || []).length, 3);
});
