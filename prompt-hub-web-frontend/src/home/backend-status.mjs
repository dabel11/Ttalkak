// @ts-check

/** @param {string} status @param {{ apiEnvironment?: string; demoFallbackEnabled?: boolean }} [options] */
export function getBackendStatusPresentation(status, { apiEnvironment = "production", demoFallbackEnabled = false } = {}) {
  if (status === "connected") return Object.freeze({ label: "연결됨", title: "서버에 연결되었습니다", message: "모든 기능을 정상적으로 사용할 수 있습니다." });
  if (status !== "fallback") return Object.freeze({ label: "연결 확인 중", title: "서버 연결을 확인하고 있습니다", message: "연결 상태를 확인하는 동안 잠시만 기다려 주세요." });
  if (demoFallbackEnabled) return Object.freeze({ label: "데모 데이터", title: "개발 서버에 연결할 수 없습니다", message: "로컬 백엔드를 실행한 뒤 다시 연결해 주세요. 현재는 데모 데이터를 표시합니다." });
  if (apiEnvironment === "development") return Object.freeze({ label: "연결 오류", title: "개발 서버에 연결할 수 없습니다", message: "로컬 백엔드가 실행 중인지 확인한 뒤 다시 연결해 주세요." });
  return Object.freeze({ label: "연결 오류", title: "서버에 연결할 수 없습니다", message: "네트워크 연결을 확인하고 잠시 후 다시 연결해 주세요." });
}

/**
 * @param {{
 *   getStatus: () => string;
 *   retry: (options: { automatic: boolean }) => Promise<unknown>;
 *   browserWindow?: Window & typeof globalThis;
 *   browserDocument?: Document;
 *   intervalMs?: number;
 * }} options
 */
export function createBackendRecoveryMonitor({ getStatus, retry, browserWindow = globalThis.window, browserDocument = globalThis.document, intervalMs = 15_000 }) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timerId = null;
  let retrying = false;
  let disposed = false;
  const clearTimer = () => {
    if (timerId == null) return;
    browserWindow.clearTimeout(timerId);
    timerId = null;
  };
  const schedule = () => {
    clearTimer();
    if (disposed || getStatus() !== "fallback" || browserDocument.visibilityState === "hidden") return;
    timerId = browserWindow.setTimeout(() => { void check(); }, intervalMs);
  };
  const check = async () => {
    clearTimer();
    if (disposed || retrying || getStatus() !== "fallback" || browserDocument.visibilityState === "hidden") return false;
    retrying = true;
    try {
      await retry({ automatic: true });
      return true;
    } finally {
      retrying = false;
      schedule();
    }
  };
  const onOnline = () => { void check(); };
  const onVisibilityChange = () => browserDocument.visibilityState === "hidden" ? clearTimer() : void check();
  browserWindow.addEventListener("online", onOnline);
  browserDocument.addEventListener("visibilitychange", onVisibilityChange);
  return Object.freeze({
    sync: schedule,
    check,
    dispose() {
      disposed = true;
      clearTimer();
      browserWindow.removeEventListener("online", onOnline);
      browserDocument.removeEventListener("visibilitychange", onVisibilityChange);
    },
  });
}
