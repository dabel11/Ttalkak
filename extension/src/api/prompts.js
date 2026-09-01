// @ts-check
import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";
import { normalizeImproveResult } from "../utils/normalizeImproveResult";
import { IMPROVE_API_TIMEOUT_MS } from "../constants";
import { MAKE_API_PATHS } from "../../../shared/make-api-contract.js";

/**
 * @param {any} config
 * @param {Record<string, any>} payload
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function requestPromptImprove(config, payload, { signal } = {}) {
  const accessToken = payload?.accessToken || "";
  const sessionUuid = payload?.sessionUuid || "";
  const { accessToken: _accessToken, sessionUuid: _sessionUuid, ...requestPayload } = payload;
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}${MAKE_API_PATHS.improve}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(!accessToken && sessionUuid ? { "X-Session-UUID": sessionUuid } : {}),
    },
    body: JSON.stringify(requestPayload),
    signal,
    timeoutMs: IMPROVE_API_TIMEOUT_MS,
  });
  const responseBody = await res.json().catch(() => null);

  if (!res.ok) {
    /** @type {Error & { status?: number, code?: string, payload?: any }} */
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return normalizeImproveResult(responseBody, requestPayload.prompt);
}
