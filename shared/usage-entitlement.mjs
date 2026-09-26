const PLANS = Object.freeze({ GUEST: "GUEST", FREE: "FREE", PRO: "PRO" });
const TOKEN_FIELD_NAMES = ["tokenLimit", "tokensUsed", "tokensRemaining"];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

/** @param {*} value @param {string} [fallback] */
function normalizePlan(value, fallback = PLANS.GUEST) {
  const plan = String(value || fallback).trim().toUpperCase();
  return plan === PLANS.PRO || plan === PLANS.FREE ? plan : PLANS.GUEST;
}

function findEntitlementSource(payload) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const result = asRecord(root.result);
  const candidates = [
    root.entitlement, root.usage, root.subscription,
    data.entitlement, data.usage, data.subscription,
    result.entitlement, result.usage, result.subscription,
    root,
  ].map(asRecord);
  return candidates.find((candidate) => [
    "plan", "tier",
    "dailyLimit", "daily_limit", "limit", "usedToday", "used_today",
    "remainingToday", "remaining_today", "remaining", "cancelAtPeriodEnd", "cancel_at_period_end",
    ...TOKEN_FIELD_NAMES,
  ].some((key) => candidate[key] !== undefined)) || {};
}

/** @param {*} payload @param {{fallbackPlan?: string}} [options] */
function normalizeEntitlement(payload, options = {}) {
  const fallbackPlan = options.fallbackPlan || PLANS.GUEST;
  const source = findEntitlementSource(payload);
  const known = Object.keys(source).length > 0;
  const plan = normalizePlan(firstDefined(source.plan, source.tier, source.subscriptionPlan), fallbackPlan);
  const rawUnit = String(firstDefined(source.usageUnit, "")).toUpperCase();
  const unit = rawUnit.startsWith("TOKEN") || TOKEN_FIELD_NAMES.some((key) => source[key] !== undefined) ? "TOKEN" : "REQUEST";
  const period = String(firstDefined(source.usagePeriod, source.period, plan === PLANS.GUEST ? "LIFETIME" : "DAY")).toUpperCase();
  const tokenValues = unit === "TOKEN";
  const limit = toNonNegativeNumber(firstDefined(tokenValues ? source.tokenLimit : undefined, source.dailyLimit, source.daily_limit, source.limit, source.quota));
  const used = toNonNegativeNumber(firstDefined(tokenValues ? source.tokensUsed : undefined, source.usedToday, source.used_today, source.used, source.usageCount));
  const explicitRemaining = toNonNegativeNumber(firstDefined(tokenValues ? source.tokensRemaining : undefined, source.remainingToday, source.remaining_today, source.remaining));
  const remaining = explicitRemaining ?? (limit !== null && used !== null ? Math.max(0, limit - used) : null);
  return Object.freeze({
    known,
    plan,
    status: String(firstDefined(source.status, source.subscriptionStatus, known ? "ACTIVE" : "UNKNOWN")).toUpperCase(),
    unit,
    period,
    limit,
    used,
    remaining,
    resetAt: String(firstDefined(source.resetAt, source.reset_at, "")),
    currentPeriodEnd: String(firstDefined(source.currentPeriodEnd, source.current_period_end, "")),
    cancelAtPeriodEnd: Boolean(firstDefined(source.cancelAtPeriodEnd, source.cancel_at_period_end, false)),
  });
}

function getUsageErrorCode(error) {
  return String(error?.code || error?.payload?.code || "").trim().toUpperCase();
}

function classifyUsageError(error, entitlement = normalizeEntitlement(error?.payload)) {
  const code = getUsageErrorCode(error);
  const plan = entitlement?.plan || PLANS.GUEST;
  const isTokenLimit = code.includes("TOKEN") && (code.includes("LIMIT") || code.includes("BUDGET"));
  const isGuestLimit = ["FREE_TRIAL_LIMIT_EXCEEDED", "TRIAL_LIMIT_EXCEEDED", "GUEST_TOKEN_BUDGET_EXCEEDED"].includes(code)
    || (isTokenLimit && plan === PLANS.GUEST);
  if (isGuestLimit) {
    return Object.freeze({ kind: "guest-limit", code, requiresLogin: true, requiresUpgrade: false, retryable: false, message: "무료 체험 사용량을 모두 사용했습니다. 로그인 후 계속 이용해주세요." });
  }
  if (isTokenLimit || ["DAILY_USAGE_LIMIT_EXCEEDED", "DAILY_LIMIT_EXCEEDED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
    const requiresUpgrade = plan !== PLANS.PRO;
    return Object.freeze({
      kind: requiresUpgrade ? "free-limit" : "pro-limit",
      code,
      requiresLogin: false,
      requiresUpgrade,
      retryable: false,
      message: requiresUpgrade
        ? "무료 사용량을 모두 사용했습니다. PRO로 업그레이드하거나 초기화 이후 다시 이용해주세요."
        : "PRO 사용량을 모두 사용했습니다. 초기화 이후 다시 이용해주세요.",
    });
  }
  if (code === "SUBSCRIPTION_PAST_DUE") {
    return Object.freeze({ kind: "billing", code, requiresLogin: false, requiresUpgrade: false, requiresBillingManagement: true, retryable: false, message: "결제 상태를 확인해주세요." });
  }
  if (code === "PAYMENT_VERIFICATION_FAILED") {
    return Object.freeze({ kind: "billing", code, requiresLogin: false, requiresUpgrade: false, requiresBillingManagement: true, retryable: false, message: "결제를 확인하지 못했습니다. 결제 내역을 확인해주세요." });
  }
  return null;
}

function hasActiveProAccess(entitlement) {
  return entitlement?.plan === PLANS.PRO
    && (entitlement.status === "ACTIVE" || (entitlement.status === "CANCELED" && entitlement.cancelAtPeriodEnd));
}

function formatTokenNumber(number, compact) {
  return Math.round(number).toLocaleString(compact ? "en" : "ko-KR", compact ? { notation: "compact", maximumFractionDigits: 1 } : undefined);
}

function formatUsageSummaryWith(entitlement, compactTokens) {
  const value = entitlement;
  const activePro = value.plan === PLANS.PRO && (value.status === "ACTIVE" || (value.status === "CANCELED" && value.cancelAtPeriodEnd));
  if (value.plan === PLANS.PRO && value.status === "PAST_DUE") return "PRO · 결제 확인 필요";
  if (value.plan === PLANS.PRO && !activePro) return "FREE · PRO 이용 종료";
  const planLabel = activePro ? "PRO" : value.plan === PLANS.FREE ? "FREE" : "체험";
  if (!value.known || value.remaining === null || value.limit === null) return planLabel;
  const periodLabel = value.period === "DAY" ? "오늘 " : value.period === "MONTH" ? "이번 달 " : "";
  const tokenValues = value.unit === "TOKEN";
  const remaining = tokenValues ? formatTokenNumber(value.remaining, compactTokens) : value.remaining;
  const limit = tokenValues ? formatTokenNumber(value.limit, compactTokens) : value.limit;
  return `${planLabel} · ${periodLabel}${remaining}/${limit}${tokenValues ? " 토큰" : "회"} 남음`;
}

function formatUsageSummary(entitlement) {
  return formatUsageSummaryWith(entitlement, true);
}

function formatUsageAccessibilityLabel(entitlement) {
  return formatUsageSummaryWith(entitlement, false);
}

export {
  PLANS,
  classifyUsageError,
  formatUsageAccessibilityLabel,
  formatUsageSummary,
  getUsageErrorCode,
  hasActiveProAccess,
  normalizeEntitlement,
  normalizePlan,
};
