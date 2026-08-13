const REDACTED = "[REDACTED]";
const nativeConsoleWarn = console.warn.bind(console);
const MAX_MESSAGE_LENGTH = 240;

export const OBSERVABILITY_DATA_POLICY = Object.freeze({
  externalCollectionEnabled: false,
  allowedRecordFields: Object.freeze(["name", "message", "area", "action", "code", "level", "retryable", "timestamp"]),
  prohibitedContent: Object.freeze(["prompt", "generatedPrompt", "history", "token", "documentBody", "pageContent", "clipboard"]),
});

function redact(value) {
  const sanitized = String(value ?? "Unknown client error")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, REDACTED);
  return sanitized.length <= MAX_MESSAGE_LENGTH ? sanitized : `${sanitized.slice(0, MAX_MESSAGE_LENGTH)}…`;
}

/** @param {unknown} error @param {Record<string, unknown>} context @param {() => number} now */
function normalizeClientError(error, context = {}, now = Date.now) {
  const source = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown client error");
  return Object.freeze({
    name: source.name || "Error",
    message: redact(source.message),
    area: String(context.area || "application"),
    action: String(context.action || "unknown"),
    code: context.code == null ? null : String(context.code),
    level: context.level === "warning" ? "warning" : "error",
    retryable: Boolean(context.retryable),
    timestamp: now(),
  });
}

/** @param {{sink?: (record: ReturnType<typeof normalizeClientError>) => void, now?: () => number, limit?: number}} options */
function createClientErrorReporter({ sink = () => {}, now = Date.now, limit = 50 } = {}) {
  const records = [];
  /** @param {unknown} error @param {Record<string, unknown>} context */
  function report(error, context = {}) {
    const record = normalizeClientError(error, context, now);
    records.push(record);
    if (records.length > limit) records.splice(0, records.length - limit);
    try { sink(record); } catch { /* Error reporting must never break the UI. */ }
    return record;
  }
  /** @param {string} area @param {string} action @param {unknown} error */
  const reportWarning = (area, action, error) => report(error, { area, action, level: "warning" });
  return Object.freeze({ report, reportWarning, recent: () => records.slice() });
}

/** @param {Window | EventTarget} target @param {ReturnType<typeof createClientErrorReporter>} reporter */
function installGlobalErrorObservers(target, reporter) {
  const onError = (event) => reporter.report(event.error || event.message, { area: "window", action: "error" });
  const onUnhandledRejection = (event) => reporter.report(event.reason, { area: "window", action: "unhandledrejection" });
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

/** @param {{warn: (...args: unknown[]) => void}} targetConsole @param {ReturnType<typeof createClientErrorReporter>} reporter */
const clientErrorReporter = createClientErrorReporter({
  sink: (record) => nativeConsoleWarn("[TTALKAK client error]", record),
});

export { clientErrorReporter, createClientErrorReporter, installGlobalErrorObservers, normalizeClientError };
