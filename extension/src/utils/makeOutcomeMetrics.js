import { isUnchangedNoEvidence } from "../../../shared/make-message-model.js";

export const MAKE_OUTCOME_EVENT = "ttalkak:observability";

export function createMakeOutcomeMetric(prompt, result, durationMs = 0, now = Date.now) {
  const ragStatus = String(result?.ragStatus || result?.rag_status || "").toLowerCase();
  const code = isUnchangedNoEvidence(prompt, result)
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
    timestamp: now(),
  });
}

export function reportMakeOutcome(prompt, result, durationMs, target = globalThis.window) {
  const detail = createMakeOutcomeMetric(prompt, result, durationMs);
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}

export function createMakeFailureMetric(error, durationMs = 0, now = Date.now) {
  const code = String(error?.code || "NETWORK_ERROR");
  const cancelled = code === "REQUEST_ABORTED";
  return Object.freeze({
    area: "make",
    action: "improve",
    kind: cancelled ? "cancel" : code === "AI_INVALID_RESPONSE" ? "contract" : code.startsWith("AI_") ? "ai" : "network",
    code,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : 0,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    outcome: cancelled ? "cancel" : "failure",
    level: cancelled ? "info" : "error",
    retryable: !cancelled && !["AI_INVALID_RESPONSE"].includes(code),
    timestamp: now(),
  });
}

export function reportMakeFailure(error, durationMs, target = globalThis.window) {
  const detail = createMakeFailureMetric(error, durationMs);
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}

export function createMakeRetryMetric(now = Date.now) {
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
    timestamp: now(),
  });
}

export function reportMakeRetry(target = globalThis.window) {
  const detail = createMakeRetryMetric();
  try { target?.dispatchEvent?.(new CustomEvent(MAKE_OUTCOME_EVENT, { detail })); } catch { /* Metrics never affect the request. */ }
  return detail;
}
