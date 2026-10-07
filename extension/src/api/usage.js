import { getApiErrorMessage } from "../utils/apiErrors.js";
import { fetchWithTimeout, getBackendBaseUrl } from "./client.js";

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

/**
 * Keeps the Extension compatible with both the current backend contract
 * (`used`, `limit`, `remaining`) and older frontend/API field names.
 */
export function normalizeUsageSnapshot(payload = {}) {
  const value = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const usedTokens = finiteCount(value.used ?? value.totalTokens ?? value.usedTokens ?? value.usageTokens) ?? 0;
  const limitTokens = finiteCount(value.limit ?? value.limitTokens ?? value.tokenLimit ?? value.quotaTokens);
  const suppliedRemaining = finiteCount(value.remaining ?? value.remainingTokens ?? value.tokensRemaining);
  const remainingTokens = suppliedRemaining ?? (limitTokens == null ? null : Math.max(0, limitTokens - usedTokens));

  return {
    ...value,
    plan: String(value.plan || "FREE").toUpperCase() === "PRO" ? "PRO" : "FREE",
    totalTokens: usedTokens,
    usedTokens,
    limitTokens,
    remainingTokens,
    limitReached: value.limitReached === true || (limitTokens != null && usedTokens >= limitTokens),
    quotaEnforced: value.quotaEnforced === true,
    usageAvailable: value.usageAvailable !== false,
    usageBlocked: value.usageBlocked === true,
    resetsAt: value.resetsAt ?? value.periodEnd ?? null,
  };
}

export async function requestUsageStatus(config, accessToken) {
  const response = await fetchWithTimeout(`${getBackendBaseUrl(config)}/api/me/usage`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    /** @type {Error & { status?: number, code?: string, payload?: unknown }} */
    const error = new Error(getApiErrorMessage(response.status, payload));
    error.status = response.status;
    error.code = payload?.code || "";
    error.payload = payload;
    throw error;
  }
  return normalizeUsageSnapshot(payload);
}
