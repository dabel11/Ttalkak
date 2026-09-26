const test = require("node:test");
const assert = require("node:assert/strict");

let classifyUsageError; let createPromptApi; let createUsageController; let formatUsageAccessibilityLabel; let formatUsageSummary; let hasActiveProAccess; let normalizeEntitlement; let getOrCreateGuestSessionUuid;
test.before(async () => {
  ({ classifyUsageError, formatUsageAccessibilityLabel, formatUsageSummary, hasActiveProAccess, normalizeEntitlement } = await import("../src/usage/usage-entitlement.mjs"));
  ({ getOrCreateGuestSessionUuid } = await import("../src/usage/guest-session.mjs"));
  ({ createPromptApi } = await import("../src/api/prompt-api.mjs"));
  ({ createUsageController } = await import("../src/usage/usage-controller.mjs"));
});

test("normalizes nested usage data from backend responses", () => {
  const value = normalizeEntitlement({ data: { usage: { plan: "free", daily_limit: 10, used_today: 7, reset_at: "2026-09-25T00:00:00+09:00" } } });
  assert.equal(value.plan, "FREE");
  assert.equal(value.remaining, 3);
  assert.equal(formatUsageSummary(value), "FREE · 오늘 3/10회 남음");
});

test("normalizes and formats token usage without breaking count responses", () => {
  const value = normalizeEntitlement({ data: { usage: {
    plan: "FREE",
    usageUnit: "TOKEN",
    usagePeriod: "DAY",
    tokenLimit: 100000,
    tokensUsed: 31500,
    tokensRemaining: 68500,
  } } });

  assert.equal(value.unit, "TOKEN");
  assert.equal(value.period, "DAY");
  assert.equal(value.limit, 100000);
  assert.equal(value.used, 31500);
  assert.equal(value.remaining, 68500);
  assert.equal(formatUsageSummary(value), "FREE · 오늘 68.5K/100K 토큰 남음");
  assert.equal(formatUsageAccessibilityLabel(value), "FREE · 오늘 68,500/100,000 토큰 남음");
});

test("accepts generic usage fields when the backend declares the token unit", () => {
  const value = normalizeEntitlement({ plan: "PRO", status: "ACTIVE", usageUnit: "TOKEN", usagePeriod: "MONTH", limit: 2000000, used: 750000 });
  assert.equal(value.unit, "TOKEN");
  assert.equal(value.period, "MONTH");
  assert.equal(value.remaining, 1250000);
  assert.equal(formatUsageSummary(value), "PRO · 이번 달 1.3M/2M 토큰 남음");
});

test("labels guest allowance as a total trial instead of a daily limit", () => {
  const value = normalizeEntitlement({ plan: "GUEST", limit: 3, used: 1, remaining: 2 });
  assert.equal(formatUsageSummary(value), "체험 · 2/3회 남음");
});

test("treats only active or cancellation-pending PRO subscriptions as accessible", () => {
  assert.equal(hasActiveProAccess({ plan: "PRO", status: "ACTIVE" }), true);
  assert.equal(hasActiveProAccess({ plan: "PRO", status: "CANCELED", cancelAtPeriodEnd: true }), true);
  assert.equal(hasActiveProAccess({ plan: "PRO", status: "PAST_DUE" }), false);
  assert.equal(hasActiveProAccess({ plan: "PRO", status: "EXPIRED" }), false);
  assert.equal(formatUsageSummary(normalizeEntitlement({ plan: "PRO", status: "PAST_DUE" })), "PRO · 결제 확인 필요");
});

test("distinguishes guest login and free upgrade quota actions", () => {
  assert.equal(classifyUsageError({ code: "FREE_TRIAL_LIMIT_EXCEEDED" }).requiresLogin, true);
  const freeLimit = classifyUsageError({ code: "DAILY_USAGE_LIMIT_EXCEEDED" }, normalizeEntitlement({ plan: "FREE" }));
  assert.equal(freeLimit.requiresUpgrade, true);
  assert.equal(freeLimit.retryable, false);
  const proLimit = classifyUsageError({ code: "DAILY_USAGE_LIMIT_EXCEEDED" }, normalizeEntitlement({ plan: "PRO" }));
  assert.equal(proLimit.requiresUpgrade, false);
  assert.equal(classifyUsageError({ code: "PAYMENT_VERIFICATION_FAILED" }).requiresBillingManagement, true);
});

test("classifies token budget errors from the response plan", () => {
  const guest = classifyUsageError(
    { code: "TOKEN_BUDGET_EXCEEDED" },
    normalizeEntitlement({ plan: "GUEST", usageUnit: "TOKEN" }),
  );
  assert.equal(guest.requiresLogin, true);

  const free = classifyUsageError(
    { code: "TOKEN_BUDGET_EXCEEDED" },
    normalizeEntitlement({ plan: "FREE", usageUnit: "TOKEN" }),
  );
  assert.equal(free.kind, "free-limit");
  assert.equal(free.requiresUpgrade, true);

  const pro = classifyUsageError(
    { code: "MONTHLY_TOKEN_LIMIT_EXCEEDED" },
    normalizeEntitlement({ plan: "PRO", usageUnit: "TOKEN" }),
  );
  assert.equal(pro.kind, "pro-limit");
  assert.equal(pro.requiresUpgrade, false);
});

test("reuses the same guest session UUID from storage", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = getOrCreateGuestSessionUuid(storage);
  assert.equal(getOrCreateGuestSessionUuid(storage), first);
  assert.match(first, /^[0-9a-f-]{36}$/i);
});

test("sends a stable session UUID only for guest improve requests", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  try {
    const requests = [];
    const api = createPromptApi({
      request: async (path, options) => { requests.push({ path, options }); return {}; },
      unwrapItems: () => [],
      unwrapPageMeta: () => ({}),
      normalizers: {
        normalizePrompt: (value) => value,
        normalizePopularTag: (value) => value,
        normalizeAdminTag: (value) => value,
        normalizeImproveResult: (value) => value,
      },
    });
    await api.improvePrompt({ prompt: "guest" }, "");
    await api.improvePrompt({ prompt: "member" }, "member-token");
    assert.match(requests[0].options.headers["X-Session-UUID"], /^[0-9a-f-]{36}$/i);
    assert.deepEqual(requests[1].options.headers, {});
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("ignores subscription data that resolves after logout", async () => {
  let resolveSubscription;
  const state = { isLoggedIn: true, entitlement: normalizeEntitlement({ plan: "FREE" }) };
  let token = "member-token";
  const controller = createUsageController({
    state,
    api: { getSubscription: () => new Promise((resolve) => { resolveSubscription = resolve; }) },
    hasBackendToken: () => Boolean(token),
    getToken: () => token,
    handleError: () => {},
    notice: () => {},
    render: () => {},
    window: { location: { assign: () => {} } },
  });
  const refresh = controller.refresh();
  state.isLoggedIn = false;
  token = "";
  resolveSubscription({ plan: "PRO", dailyLimit: 100, remainingToday: 99 });
  await refresh;
  assert.equal(state.entitlement.plan, "FREE");
});

test("ignores subscription errors that resolve after logout", async () => {
  let rejectSubscription;
  let handledErrors = 0;
  const state = { isLoggedIn: true, entitlement: normalizeEntitlement({ plan: "FREE" }) };
  let token = "member-token";
  const controller = createUsageController({
    state,
    api: { getSubscription: () => new Promise((resolve, reject) => { rejectSubscription = reject; }) },
    hasBackendToken: () => Boolean(token),
    getToken: () => token,
    handleError: () => { handledErrors += 1; },
    notice: () => {},
    render: () => {},
    window: { location: { assign: () => {} } },
  });
  const refresh = controller.refresh({ quiet: false });
  state.isLoggedIn = false;
  token = "";
  rejectSubscription(Object.assign(new Error("late failure"), { status: 500 }));
  await refresh;
  assert.equal(handledErrors, 0);
});

test("prevents duplicate checkout requests and exposes a pending state", async () => {
  let resolveCheckout;
  let checkoutCalls = 0;
  const destinations = [];
  const state = { isLoggedIn: true, entitlement: normalizeEntitlement({ plan: "FREE" }), subscriptionActionPending: "" };
  const controller = createUsageController({
    state,
    api: { createSubscriptionCheckout: () => { checkoutCalls += 1; return new Promise((resolve) => { resolveCheckout = resolve; }); } },
    hasBackendToken: () => true,
    getToken: () => "member-token",
    handleError: () => {},
    notice: () => {},
    render: () => {},
    window: { location: { assign: (url) => destinations.push(url) } },
  });
  const first = controller.openDestination("checkout");
  const duplicate = controller.openDestination("checkout");
  assert.equal(checkoutCalls, 1);
  assert.equal(state.subscriptionActionPending, "checkout");
  resolveCheckout({ checkoutUrl: "https://payments.example/checkout" });
  await Promise.all([first, duplicate]);
  assert.deepEqual(destinations, ["https://payments.example/checkout"]);
  assert.equal(state.subscriptionActionPending, "");
});

test("refreshes account usage after returning from checkout", async () => {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const state = { isLoggedIn: true, entitlement: normalizeEntitlement({ plan: "FREE" }) };
  let calls = 0;
  const browserDocument = {
    visibilityState: "visible",
    addEventListener: (type, listener) => documentListeners.set(type, listener),
    removeEventListener: (type) => documentListeners.delete(type),
  };
  const browserWindow = {
    addEventListener: (type, listener) => windowListeners.set(type, listener),
    removeEventListener: (type) => windowListeners.delete(type),
  };
  const controller = createUsageController({
    state,
    api: { getSubscription: async () => { calls += 1; return { plan: "PRO", dailyLimit: 100, remainingToday: 100 }; } },
    hasBackendToken: () => true,
    getToken: () => "member-token",
    handleError: () => {},
    notice: () => {},
    render: () => {},
    window: browserWindow,
    document: browserDocument,
  });
  const stop = controller.startReturnRefresh();
  browserDocument.visibilityState = "hidden";
  documentListeners.get("visibilitychange")();
  browserDocument.visibilityState = "visible";
  documentListeners.get("visibilitychange")();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(state.entitlement.plan, "PRO");
  windowListeners.get("pageshow")({ persisted: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  stop();
  assert.equal(windowListeners.size, 0);
  assert.equal(documentListeners.size, 0);
});
