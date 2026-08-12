// @ts-check
const DEFAULT_API_URL = "http://localhost:8080";
const DEFAULT_API_TIMEOUT_MS = 60_000;
const DEFAULT_IMPROVE_TIMEOUT_MS = 90_000;

/** @param {unknown} value @param {number} fallback @param {string} name */
function positiveTimeout(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError(`${name} must be a positive number.`);
  return timeout;
}

export function readRuntimeConfig(browserWindow = globalThis.window) {
  const apiBaseUrl = String(browserWindow?.__API_BASE_URL__ || browserWindow?.TTALKAK_API_BASE_URL || DEFAULT_API_URL).replace(/\/$/, "");
  let parsedUrl;
  try { parsedUrl = new URL(apiBaseUrl); } catch { throw new TypeError("TTALKAK API base URL is invalid."); }
  if (!/^https?:$/.test(parsedUrl.protocol)) throw new TypeError("TTALKAK API base URL must use HTTP or HTTPS.");
  return Object.freeze({
    apiBaseUrl,
    apiTimeoutMs: positiveTimeout(browserWindow?.TTALKAK_API_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS, "TTALKAK_API_TIMEOUT_MS"),
    improveTimeoutMs: positiveTimeout(browserWindow?.TTALKAK_IMPROVE_TIMEOUT_MS, DEFAULT_IMPROVE_TIMEOUT_MS, "TTALKAK_IMPROVE_TIMEOUT_MS"),
    googleCredential: String(browserWindow?.TTALKAK_GOOGLE_CREDENTIAL || ""),
    demoFallbackEnabled: browserWindow?.TTALKAK_DEMO_FALLBACK_ENABLED === true,
  });
}

export const runtimeConfig = readRuntimeConfig();
