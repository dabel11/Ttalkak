const test = require("node:test");
const assert = require("node:assert/strict");
let consumeBillingRedirect; let consumeOpenBillingRequest; let createBillingController; let createBillingApi;
test.before(async () => {
  ({ consumeBillingRedirect, consumeOpenBillingRequest, createBillingController } = await import("../src/billing/billing-controller.mjs"));
  ({ createBillingApi } = await import("../src/api/billing-api.mjs"));
});

test("billing deep links are consumed without losing their route", () => {
  const history = { state: null, replaceState(_state, _title, url) { this.url = url; } };
  assert.equal(consumeOpenBillingRequest({ href: "https://web.example/?openBilling=1#/home" }, history), true);
  assert.equal(history.url, "/#/home");
  assert.equal(consumeOpenBillingRequest({ href: "https://web.example/#/home" }, history), false);
});

const createController = (ctx) => createBillingController({ formatShortDate: String, ...ctx });

test("billing callback removes the one-time auth key before it can remain in browser history", () => {
  const history = { state: { from: "home" }, replaceState(state, title, url) { this.saved = { state, title, url }; } };
  const callback = consumeBillingRedirect({ href: "http://localhost:5500/?view=home&ttalkakBilling=success&authKey=single-use&customerKey=generated#help" }, history);
  assert.deepEqual(callback, { result: "success", authKey: "single-use", customerKey: "generated", code: "", message: "" });
  assert.deepEqual(history.saved, { state: { from: "home" }, title: "", url: "/?view=home#help" });
  assert.equal(consumeBillingRedirect({ href: "http://localhost:5500/?view=home" }, history), null);
});

test("billing API sends a bearer token and one-time callback data to the intended endpoints", async () => {
  const calls = [];
  const api = createBillingApi({ request: async (...args) => { calls.push(args); return {}; } });
  await api.setupBilling("member-jwt");
  await api.completeBilling({ authKey: "one-time", customerKey: "customer" }, "member-jwt");
  await api.cancelBilling("member-jwt");
  await api.retryBilling("member-jwt");
  assert.deepEqual(calls[0], ["/api/me/billing/setup", { method: "POST", token: "member-jwt" }]);
  assert.deepEqual(calls[1], ["/api/me/billing/complete", {
    method: "POST", body: '{"authKey":"one-time","customerKey":"customer"}', token: "member-jwt", timeoutMs: 90000,
  }]);
  assert.deepEqual(calls[2], ["/api/me/billing/cancel", { method: "POST", token: "member-jwt" }]);
  assert.deepEqual(calls[3], ["/api/me/billing/retry", { method: "POST", token: "member-jwt", timeoutMs: 90000 }]);
});

test("billing callback does not complete a registration for a different customer key", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "original-customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    let completed = false;
    const state = { isLoggedIn: true, billingOpen: false };
    const controller = createController({
      state, getToken: () => "member-jwt", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: { completeBilling: async () => { completed = true; } },
    });
    await controller.handleBillingRedirect({ result: "success", authKey: "one-time", customerKey: "other-customer" });
    assert.equal(completed, false);
    assert.equal(entries.has("ttalkak-billing-pending-customer"), false);
    assert.match(controller.renderBilling(), /결제 세션을 확인할 수 없습니다/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("billing status 401 uses the shared authentication boundary", async () => {
  const unauthorized = Object.assign(new Error("expired"), { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } });
  const state = { isLoggedIn: true, billingOpen: true, authView: null };
  const handled = [];
  const controller = createController({
    state, getToken: () => "expired-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    handleBackendAccessError(error, message) {
      handled.push([error, message]);
      state.isLoggedIn = false;
      state.billingOpen = false;
      state.authView = "login";
    },
    api: {
      setupBilling: async () => ({ clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: false }),
      getBillingStatus: async () => { throw unauthorized; },
      getUsageStatus: async () => ({ plan: "FREE" }),
    },
  });

  await controller.refreshBilling();

  assert.equal(handled.length, 1);
  assert.equal(handled[0][0], unauthorized);
  assert.equal(handled[0][1], "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  assert.equal(state.isLoggedIn, false);
  assert.equal(state.authView, "login");
});

test("card registration preserves the route in Toss return URLs", async () => {
  const previousWindow = globalThis.window;
  const previousToss = globalThis.TossPayments;
  const entries = new Map();
  let requestOptions;
  globalThis.window = {
    location: { href: "http://localhost:4200/#/make" },
    sessionStorage: {
      getItem: (key) => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  };
  globalThis.TossPayments = () => ({ payment: () => ({ requestBillingAuth: async (options) => { requestOptions = options; } }) });
  try {
    const state = { isLoggedIn: true, billingOpen: true };
    const listeners = {};
    const controller = createController({
      state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: {
        setupBilling: async () => ({ clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: false }),
        getBillingStatus: async () => ({ cardRegistered: false, autoRenew: false }),
        getUsageStatus: async () => ({ plan: "FREE", totalTokens: 0 }),
      },
    });
    await controller.refreshBilling();
    controller.bindBilling({
      querySelectorAll: () => [],
      querySelector(selector) {
        if (selector !== "[data-billing-register]") return null;
        return { addEventListener(_event, listener) { listeners.register = listener; } };
      },
    });
    listeners.register();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(new URL(requestOptions.successUrl).hash, "#/make");
    assert.equal(new URL(requestOptions.failUrl).hash, "#/make");
  } finally {
    globalThis.window = previousWindow;
    globalThis.TossPayments = previousToss;
  }
});

test("a partial usage failure keeps the payment status visible and retryable", async () => {
  const state = { isLoggedIn: true, billingOpen: true };
  const controller = createController({
    state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    api: {
      setupBilling: async () => ({ amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => ({ cardRegistered: true, autoRenew: true, paymentStatus: "PENDING" }),
      getUsageStatus: async () => { throw new Error("usage unavailable"); },
    },
  });

  assert.equal(await controller.refreshBilling(), true);
  const html = controller.renderBilling();
  assert.match(html, /결제 확인 중/);
  assert.match(html, /일부 결제 정보를 불러오지 못했습니다/);
  assert.match(html, /data-billing-refresh/);
  assert.match(html, /data-billing-reload/);
});

test("a logged-out billing return opens login with a restart instruction", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    const state = { isLoggedIn: false, billingOpen: false, authView: null, authError: "" };
    const controller = createController({
      state, getToken: () => "", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: { completeBilling: async () => assert.fail("completion must not run after logout") },
    });
    await controller.handleBillingRedirect({ result: "success", authKey: "one-time", customerKey: "customer" });
    assert.equal(state.billingOpen, false);
    assert.equal(state.authView, "login");
    assert.match(state.authError, /카드 등록을 처음부터 시작/);
    assert.equal(entries.has("ttalkak-billing-pending-customer"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("a logged-out failed billing return is cleared and shown as a login restart", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    const state = { isLoggedIn: false, billingOpen: false, authView: null, authError: "" };
    const controller = createController({ state, getToken: () => "", isDemoToken: () => false, render() {}, escapeHtml: String, api: {} });
    await controller.handleBillingRedirect({ result: "fail", code: "USER_CANCEL", message: "cancelled" });
    assert.equal(state.billingOpen, false);
    assert.equal(state.authView, "login");
    assert.match(state.authError, /카드 등록을 처음부터 시작/);
    assert.equal(entries.has("ttalkak-billing-pending-customer"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("a failed endpoint refresh clears its stale actions while keeping fresh sections", async () => {
  const state = { isLoggedIn: true, billingOpen: true };
  let billingFails = false;
  const controller = createController({
    state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    api: {
      setupBilling: async () => ({ amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => {
        if (billingFails) throw new Error("billing unavailable");
        return { cardRegistered: true, autoRenew: true, paymentStatus: "ACTIVE" };
      },
      getUsageStatus: async () => ({ plan: "PRO", totalTokens: 200, limitTokens: 1000 }),
    },
  });
  await controller.refreshBilling();
  assert.match(controller.renderBilling(), /data-billing-cancel/);
  billingFails = true;
  await controller.refreshBilling();
  const html = controller.renderBilling();
  assert.match(html, /<dd>PRO<\/dd>/);
  assert.match(html, /일부 결제 정보를 불러오지 못했습니다/);
  assert.doesNotMatch(html, /data-billing-cancel/);
  assert.doesNotMatch(html, /data-billing-retry/);
});

test("billing mutation 401 also uses the shared authentication boundary", async () => {
  const unauthorized = Object.assign(new Error("expired"), { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } });
  const state = { isLoggedIn: true, billingOpen: true, authView: null };
  let handled = 0;
  const listeners = {};
  const controller = createController({
    state, getToken: () => "expired-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    handleBackendAccessError() {
      handled += 1;
      state.isLoggedIn = false;
      state.billingOpen = false;
      state.authView = "login";
    },
    api: {
      setupBilling: async () => ({ clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => ({ cardRegistered: true, autoRenew: true, paymentStatus: "ACTIVE" }),
      getUsageStatus: async () => ({ plan: "PRO" }),
      cancelBilling: async () => { throw unauthorized; },
    },
  });
  await controller.refreshBilling();
  controller.bindBilling({
    querySelector(selector) {
      if (selector !== "[data-billing-cancel]") return null;
      return { addEventListener(_event, listener) { listeners.cancel = listener; } };
    },
  });

  listeners.cancel();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(handled, 1);
  assert.equal(state.isLoggedIn, false);
  assert.equal(state.authView, "login");
});

test("a pending payment is explicit and offers a direct status recheck", async () => {
  const state = { isLoggedIn: true, billingOpen: true };
  let statusCalls = 0;
  const listeners = {};
  const controller = createController({
    state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    api: {
      setupBilling: async () => ({ clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => { statusCalls += 1; return { cardRegistered: true, autoRenew: true, paymentStatus: "PENDING" }; },
      getUsageStatus: async () => ({ plan: "FREE", totalTokens: 10 }),
      retryBilling: async () => assert.fail("status recheck must not start another payment"),
    },
  });
  await controller.refreshBilling();

  const html = controller.renderBilling();
  assert.match(html, /결제 확인 중/);
  assert.match(html, /data-billing-refresh/);
  assert.match(html, /결제 상태 다시 확인/);
  assert.doesNotMatch(html, /data-billing-cancel/);

  controller.bindBilling({
    querySelector(selector) {
      if (selector !== "[data-billing-refresh]") return null;
      return { addEventListener(_event, listener) { listeners.retry = listener; } };
    },
  });
  listeners.retry();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statusCalls, 2);
});

test("an uncertain payment retry reloads status instead of offering another immediate charge", async () => {
  const uncertain = Object.assign(new Error("provider pending"), { status: 502, payload: { code: "BILLING_UNCERTAIN" } });
  const state = { isLoggedIn: true, billingOpen: true };
  let status = "FAILED";
  let retryCalls = 0;
  const listeners = {};
  const controller = createController({
    state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
    api: {
      setupBilling: async () => ({ amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => ({ cardRegistered: true, autoRenew: status !== "FAILED", paymentStatus: status }),
      getUsageStatus: async () => ({ plan: "FREE", totalTokens: 10 }),
      retryBilling: async () => { retryCalls += 1; status = "PENDING"; throw uncertain; },
    },
  });
  await controller.refreshBilling();
  assert.match(controller.renderBilling(), /data-billing-retry/);
  controller.bindBilling({
    querySelectorAll: () => [],
    querySelector(selector) {
      if (selector !== "[data-billing-retry]") return null;
      return { addEventListener(_event, listener) { listeners.retry = listener; } };
    },
  });
  listeners.retry();
  await new Promise((resolve) => setImmediate(resolve));
  const html = controller.renderBilling();
  assert.equal(retryCalls, 1);
  assert.match(html, /결제 확인 중/);
  assert.match(html, /data-billing-refresh/);
  assert.doesNotMatch(html, /data-billing-retry/);
});

test("an uncertain provider result automatically reloads billing and usage state", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    const calls = [];
    const state = { isLoggedIn: true, billingOpen: false };
    const uncertain = Object.assign(new Error("provider result unknown"), {
      status: 502,
      payload: { code: "BILLING_UNCERTAIN", message: "결제 결과를 확인하지 못했습니다." },
    });
    const controller = createController({
      state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: {
        completeBilling: async () => { calls.push("complete"); throw uncertain; },
        setupBilling: async () => { calls.push("setup"); return { clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: true }; },
        getBillingStatus: async () => { calls.push("billing"); return { cardRegistered: true, autoRenew: true, paymentStatus: "PENDING" }; },
        getUsageStatus: async () => { calls.push("usage"); return { plan: "FREE", totalTokens: 10 }; },
      },
    });

    await controller.handleBillingRedirect({ result: "success", authKey: "one-time", customerKey: "customer" });

    assert.deepEqual(calls, ["complete", "setup", "billing", "usage"]);
    assert.match(controller.renderBilling(), /결제 응답이 지연되어 서버에서 현재 상태를 다시 확인했습니다/);
    assert.match(controller.renderBilling(), /결제 확인 중/);
    assert.match(controller.renderBilling(), /data-billing-refresh/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("a complete 401 moves to login with instructions to restart card registration", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    const unauthorized = Object.assign(new Error("expired"), { status: 401, payload: { code: "AUTHENTICATION_REQUIRED" } });
    const state = { isLoggedIn: true, billingOpen: false, authView: null, authError: "" };
    const handled = [];
    const controller = createController({
      state, getToken: () => "expired-token", isDemoToken: () => false, render() {}, escapeHtml: String,
      handleBackendAccessError(error, message) {
        handled.push([error, message]);
        state.isLoggedIn = false;
        state.billingOpen = false;
        state.authView = "login";
      },
      api: { completeBilling: async () => { throw unauthorized; } },
    });

    await controller.handleBillingRedirect({ result: "success", authKey: "one-time", customerKey: "customer" });

    assert.equal(handled.length, 1);
    assert.equal(handled[0][0], unauthorized);
    assert.match(handled[0][1], /카드 등록을 처음부터 시작/);
    assert.equal(state.authView, "login");
    assert.match(state.authError, /카드 등록을 처음부터 시작/);
    assert.equal(entries.has("ttalkak-billing-pending-customer"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("a successful complete still refreshes the PRO status", async () => {
  const previousWindow = globalThis.window;
  const entries = new Map([["ttalkak-billing-pending-customer", "customer"]]);
  globalThis.window = { sessionStorage: {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  } };
  try {
    let completed = 0;
    const state = { isLoggedIn: true, billingOpen: false };
    const controller = createController({
      state, getToken: () => "member-token", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: {
        completeBilling: async () => { completed += 1; },
        setupBilling: async () => ({ clientKey: "test_ck_fixture", customerKey: "customer", amount: 5000, cardRegistered: true }),
        getBillingStatus: async () => ({ cardRegistered: true, autoRenew: true, paymentStatus: "ACTIVE" }),
        getUsageStatus: async () => ({ plan: "PRO", totalTokens: 20 }),
      },
    });

    await controller.handleBillingRedirect({ result: "success", authKey: "one-time", customerKey: "customer" });

    assert.equal(completed, 1);
    assert.match(controller.renderBilling(), /첫 테스트 결제가 완료되어 PRO가 적용됐습니다/);
    assert.match(controller.renderBilling(), /<dd>PRO<\/dd>/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("closing billing restores focus to the control that opened it", async () => {
  const state = { isLoggedIn: true, billingOpen: false };
  let openListener;
  let focusCount = 0;
  const opener = {
    isConnected: true,
    addEventListener(_event, listener) { openListener = listener; },
    closest() { return null; },
    focus() { focusCount += 1; },
  };
  const root = {
    querySelectorAll(selector) { return selector === "[data-open-billing]" ? [opener] : []; },
    querySelector(selector) { return selector === "[data-open-billing]" ? opener : null; },
  };
  const controller = createController({
    state,
    root,
    getToken: () => "member-token",
    isDemoToken: () => false,
    render() {},
    escapeHtml: String,
    api: {
      setupBilling: async () => ({ amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => ({ cardRegistered: true, autoRenew: true, paymentStatus: "ACTIVE" }),
      getUsageStatus: async () => ({ plan: "PRO", used: 10, limit: 100, remaining: 90 }),
    },
  });

  controller.bindBilling(root);
  openListener();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.billingOpen, true);

  controller.closeBilling();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.billingOpen, false);
  assert.equal(focusCount, 1);
});

test("billing renders the backend used limit remaining contract without treating a preview as enforced", async () => {
  const state = { isLoggedIn: true, billingOpen: true };
  const controller = createController({
    state,
    getToken: () => "member-token",
    isDemoToken: () => false,
    render() {},
    escapeHtml: String,
    api: {
      setupBilling: async () => ({ amount: 5000, cardRegistered: true }),
      getBillingStatus: async () => ({ cardRegistered: true, autoRenew: true, paymentStatus: "ACTIVE" }),
      getUsageStatus: async () => ({ plan: "PRO", used: 100, limit: 100, remaining: 0, limitReached: true, quotaEnforced: false }),
    },
  });

  await controller.refreshBilling();
  const html = controller.renderBilling();
  assert.match(html, /100개 \/ 100개/);
  assert.match(html, /남음 0개/);
  assert.match(html, /참고 한도에 도달/);
  assert.doesNotMatch(html, /이번 이용 기간의 토큰을 모두 사용/);
});
