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
 *   maxIntervalMs?: number;
 *   leaseMs?: number;
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
 *   now?: () => number;
 * }} options
 */
export function createBackendRecoveryMonitor({
  getStatus,
  retry,
  browserWindow = globalThis.window,
  browserDocument = globalThis.document,
  intervalMs = 15_000,
  maxIntervalMs = 60_000,
  leaseMs = 20_000,
  storage,
  now = Date.now,
}) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timerId = null;
  let retrying = false;
  let disposed = false;
  let failures = 0;
  let recoveryStorage = storage;
  if (recoveryStorage === undefined) {
    try { recoveryStorage = browserWindow?.localStorage || null; } catch { recoveryStorage = null; }
  }
  const owner = `${now()}-${Math.random()}`;
  const leaseKey = "ttalkak:backend-recovery-lease";
  const isOffline = () => browserWindow.navigator?.onLine === false;
  const acquireLease = () => {
    if (!recoveryStorage) return true;
    try {
      const current = JSON.parse(recoveryStorage.getItem(leaseKey) || "null");
      if (current?.expiresAt > now() && current.owner !== owner) return false;
      recoveryStorage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: now() + leaseMs }));
      return JSON.parse(recoveryStorage.getItem(leaseKey) || "null")?.owner === owner;
    } catch {
      return true;
    }
  };
  const releaseLease = () => {
    if (!recoveryStorage) return;
    try {
      if (JSON.parse(recoveryStorage.getItem(leaseKey) || "null")?.owner === owner) recoveryStorage.removeItem(leaseKey);
    } catch { /* storage can be unavailable in privacy-restricted contexts */ }
  };
  const clearTimer = () => {
    if (timerId == null) return;
    browserWindow.clearTimeout(timerId);
    timerId = null;
  };
  const schedule = () => {
    clearTimer();
    if (disposed || getStatus() !== "fallback" || browserDocument.visibilityState === "hidden" || isOffline()) return;
    const delay = Math.min(maxIntervalMs, intervalMs * (2 ** failures));
    timerId = browserWindow.setTimeout(() => { void check(); }, delay);
  };
  const check = async () => {
    clearTimer();
    if (disposed || retrying || getStatus() !== "fallback" || browserDocument.visibilityState === "hidden" || isOffline()) return false;
    if (!acquireLease()) {
      schedule();
      return false;
    }
    retrying = true;
    try {
      await retry({ automatic: true });
      failures = getStatus() === "fallback" ? failures + 1 : 0;
      return true;
    } catch {
      failures += 1;
      return false;
    } finally {
      retrying = false;
      releaseLease();
      schedule();
    }
  };
  const onOnline = () => { failures = 0; void check(); };
  const onOffline = clearTimer;
  const onVisibilityChange = () => browserDocument.visibilityState === "hidden" ? clearTimer() : void check();
  browserWindow.addEventListener("online", onOnline);
  browserWindow.addEventListener("offline", onOffline);
  browserDocument.addEventListener("visibilitychange", onVisibilityChange);
  return Object.freeze({
    sync: schedule,
    check,
    dispose() {
      disposed = true;
      clearTimer();
      releaseLease();
      browserWindow.removeEventListener("online", onOnline);
      browserWindow.removeEventListener("offline", onOffline);
      browserDocument.removeEventListener("visibilitychange", onVisibilityChange);
    },
  });
}
