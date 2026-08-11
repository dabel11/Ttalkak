import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";
import { normalizeImproveResult } from "../utils/normalizeImproveResult";
import { IMPROVE_API_TIMEOUT_MS } from "../constants";

export async function requestPromptImprove(config, payload, { signal } = {}) {
  const accessToken = payload?.accessToken || "";
  const sessionUuid = payload?.sessionUuid || "";
  const { accessToken: _accessToken, sessionUuid: _sessionUuid, ...requestPayload } = payload;
  const res = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/prompts/improve`, {
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
    const error = new Error(getApiErrorMessage(res.status, responseBody));
    error.status = res.status;
    error.code = responseBody?.code || "";
    error.payload = responseBody;
    throw error;
  }

  return normalizeImproveResult(responseBody, requestPayload.prompt);
}
