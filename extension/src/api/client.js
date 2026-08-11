import { API_TIMEOUT_MS, DEFAULT_RAG_CONFIG } from "../constants";
import { assertBackendApiUrl } from "../config/backendConfig";
import { fetchWithAbortPolicy } from "./fetchPolicy";

export function getBackendBaseUrl(config = {}) {
  return assertBackendApiUrl(config.backendApiUrl || DEFAULT_RAG_CONFIG.backendApiUrl);
}

export async function fetchWithTimeout(url, options = {}) {
  return fetchWithAbortPolicy(url, options, { defaultTimeoutMs: API_TIMEOUT_MS });
}
