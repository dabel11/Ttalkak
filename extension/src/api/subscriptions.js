// @ts-check
import { fetchWithTimeout, getBackendBaseUrl } from "./client";
import { getApiErrorMessage } from "../utils/apiErrors";

export async function requestSubscription(config, accessToken) {
  const response = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/subscriptions/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = Object.assign(new Error(getApiErrorMessage(response.status, body)), {
      status: response.status,
      code: body?.code || "",
      payload: body,
    });
    throw error;
  }
  return body;
}
