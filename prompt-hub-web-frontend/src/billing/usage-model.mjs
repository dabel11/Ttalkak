const finiteCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
};

/**
 * Normalize the current backend quota fields and the transitional aliases used
 * by earlier frontend and API branches into one stable view model.
 * @param {Record<string, any>} value
 * @returns {Record<string, any>}
 */
export function normalizeUsageSnapshot(value = {}) {
  const source = value;
  const totalTokens = finiteCount(source.used ?? source.totalTokens ?? source.usedTokens) ?? 0;
  const limitTokens = finiteCount(Reflect.get(source, "limit") ?? source.limitTokens ?? source.tokenLimit);
  const suppliedRemaining = finiteCount(source.remaining ?? source.remainingTokens ?? source.tokensRemaining);
  const remainingTokens = suppliedRemaining ?? (limitTokens == null ? null : Math.max(0, limitTokens - totalTokens));
  const limitReached = source.limitReached === true || (limitTokens != null && totalTokens >= limitTokens);
  const usagePercent = limitTokens && limitTokens > 0
    ? Math.min(100, Math.round((totalTokens / limitTokens) * 100))
    : null;

  return {
    ...source,
    plan: String(source.plan).toUpperCase() === "PRO" ? "PRO" : "FREE",
    totalTokens,
    limitTokens,
    remainingTokens,
    limitReached,
    quotaEnforced: source.quotaEnforced === true,
    usageAvailable: source.usageAvailable !== false,
    usageBlocked: source.usageBlocked === true,
    usagePercent,
  };
}

export function formatTokenCount(value) {
  const count = finiteCount(value) ?? 0;
  return `${count.toLocaleString("ko-KR")}개`;
}
