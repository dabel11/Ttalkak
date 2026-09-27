import test from "node:test";
import assert from "node:assert/strict";
import { consumeBillingRedirect, createBillingController } from "../src/billing/billing-controller.mjs";
import { createBillingApi } from "../src/api/billing-api.mjs";

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
  assert.deepEqual(calls[0], ["/api/me/billing/setup", { method: "POST", token: "member-jwt" }]);
  assert.deepEqual(calls[1], ["/api/me/billing/complete", {
    method: "POST", body: '{"authKey":"one-time","customerKey":"customer"}', token: "member-jwt", timeoutMs: 90000,
  }]);
  assert.deepEqual(calls[2], ["/api/me/billing/cancel", { method: "POST", token: "member-jwt" }]);
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
    const controller = createBillingController({
      state, getToken: () => "member-jwt", isDemoToken: () => false, render() {}, escapeHtml: String,
      api: { completeBilling: async () => { completed = true; } },
    });
    await controller.handleRedirect({ result: "success", authKey: "one-time", customerKey: "other-customer" });
    assert.equal(completed, false);
    assert.equal(entries.has("ttalkak-billing-pending-customer"), false);
    assert.match(controller.view(), /결제 세션을 확인할 수 없습니다/);
  } finally {
    globalThis.window = previousWindow;
  }
});
