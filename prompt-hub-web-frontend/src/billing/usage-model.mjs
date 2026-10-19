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
  const requests = finiteCount(source.requests) ?? 0;
  const requestLimit = finiteCount(source.requestLimit);
  const requestRemaining = finiteCount(source.requestRemaining)
    ?? (requestLimit == null ? null : Math.max(0, requestLimit - requests));
  const requestQuotaEnforced = source.requestQuotaEnforced === true;
  const requestLimitReached = requestQuotaEnforced
    && (source.requestLimitReached === true || (requestLimit != null && requests >= requestLimit));

  return {
    ...source,
    plan: ["FREE", "LIGHT", "STANDARD", "PRO"].includes(String(source.plan).toUpperCase())
      ? String(source.plan).toUpperCase() : "FREE",
    totalTokens,
    limitTokens,
    remainingTokens,
    limitReached,
    requests,
    requestLimit,
    requestRemaining,
    requestQuotaEnforced,
    requestLimitReached,
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
