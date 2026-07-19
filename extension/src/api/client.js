import { API_TIMEOUT_MS, DEFAULT_RAG_CONFIG } from "../constants";
import { assertBackendApiUrl } from "../config/backendConfig";

export function getBackendBaseUrl(config = {}) {
  return assertBackendApiUrl(config.backendApiUrl || DEFAULT_RAG_CONFIG.backendApiUrl);
}

export async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      timeoutError.status = 0;
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
