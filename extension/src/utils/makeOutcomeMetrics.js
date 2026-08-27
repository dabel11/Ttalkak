import { isUnchangedNoEvidence } from "../../../shared/make-message-model.js";
import { createMakeRequestCorrelation } from "../../../shared/make-request-id.js";

export const MAKE_OUTCOME_EVENT = "ttalkak:observability";

export function createMakeOutcomeMetric(prompt, result, durationMs = 0, now = Date.now) {
  const ragStatus = String(result?.ragStatus || result?.rag_status || "").toLowerCase();
  const code = result?.replayed === true
    ? "REPLAYED"
    : isUnchangedNoEvidence(prompt, result)
    ? "UNCHANGED_NO_EVIDENCE"
    : ragStatus === "no_evidence"
      ? "NO_EVIDENCE"
      : String(result?.mode || "").toLowerCase() === "ask" ? "ASK" : "IMPROVED";
  return Object.freeze({
    area: "make",
    action: "improve",
    kind: "result",
    code,
    status: 200,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    outcome: "success",
    level: "info",
    retryable: false,
    client: "extension",
    requestCorrelation: createMakeRequestCorrelation(result?.requestId),
    timestamp: now(),
  });
}

export function reportMakeOutcome(prompt, result, durationMs, target = globalThis.window) {
  const detail = createMakeOutcomeMetric(prompt, result, durationMs);
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}

export function createMakeFailureMetric(error, durationMs = 0, now = Date.now, requestId = "") {
  const code = String(error?.code || "NETWORK_ERROR");
  const cancelled = code === "REQUEST_ABORTED";
  const concurrency = code === "THREAD_CONCURRENTLY_UPDATED";
  return Object.freeze({
    area: "make",
    action: "improve",
    kind: cancelled ? "cancel" : concurrency ? "concurrency" : code === "AI_INVALID_RESPONSE" ? "contract" : code.startsWith("AI_") ? "ai" : "network",
    code,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : 0,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    outcome: cancelled ? "cancel" : "failure",
    level: cancelled ? "info" : "error",
    retryable: !cancelled && !concurrency && !["AI_INVALID_RESPONSE"].includes(code),
    client: "extension",
    requestCorrelation: createMakeRequestCorrelation(requestId || error?.requestId),
    timestamp: now(),
  });
}

export function reportMakeFailure(error, durationMs, target = globalThis.window, requestId = "") {
  const detail = createMakeFailureMetric(error, durationMs, Date.now, requestId);
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}

export function createMakeRetryMetric(now = Date.now, requestId = "") {
  return Object.freeze({
    area: "make",
    action: "improve",
    kind: "interaction",
    code: "USER_RETRY",
    status: 0,
    durationMs: 0,
    outcome: "retry",
    level: "info",
    retryable: false,
    client: "extension",
    requestCorrelation: createMakeRequestCorrelation(requestId),
    timestamp: now(),
  });
}

export function reportMakeRetry(requestId = "", target = globalThis.window) {
  const detail = createMakeRetryMetric(Date.now, requestId);
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}

export function reportMakeConcurrencyRefresh(requestId = "", refreshed = false, target = globalThis.window) {
  const detail = Object.freeze({
    area: "make",
    action: "refresh-thread",
    kind: "concurrency",
    code: refreshed ? "THREAD_REFRESHED_AFTER_CONFLICT" : "THREAD_REFRESH_FAILED_AFTER_CONFLICT",
    status: refreshed ? 200 : 0,
    durationMs: 0,
    outcome: refreshed ? "success" : "failure",
    level: refreshed ? "info" : "error",
    retryable: false,
    client: "extension",
    requestCorrelation: createMakeRequestCorrelation(requestId),
    timestamp: Date.now(),
  });
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}
