export function createBillingApi({ request }) {
  return {
      getBillingStatus(token) {
      return request("/api/me/billing", { token });
    },
      getBillingCharges(token) {
      return request("/api/me/billing/charges", { token });
    },
      requestBillingRefund(token, orderId, reason) {
      return request(`/api/me/billing/charges/${encodeURIComponent(orderId)}/refund-request`, {
        method: "POST", token, body: JSON.stringify({ reason }),
      });
    },
      getUsageStatus(token) {
      return request("/api/me/usage", { token });
    },
      setupBilling(token, plan) {
      return request("/api/me/billing/setup", { method: "POST", token,
        ...(plan ? { body: JSON.stringify({ plan }) } : {}) });
    },
      quoteBillingUpgrade(token, plan) {
      return request(`/api/me/billing/upgrade-quote?plan=${encodeURIComponent(plan)}`, { token });
    },
      upgradeBilling(token, plan, expectedAmount) {
      return request("/api/me/billing/upgrade", { method: "POST", token,
        body: JSON.stringify({ plan, expectedAmount }), timeoutMs: 90000 });
    },
      reconcileBillingUpgrade(token) {
      return request("/api/me/billing/reconcile-upgrade", { method: "POST", token, timeoutMs: 90000 });
    },
      completeBilling(payload, token) {
      return request("/api/me/billing/complete", { method: "POST", body: JSON.stringify(payload), token, timeoutMs: 90000 });
    },
      cancelBilling(token) {
      return request("/api/me/billing/cancel", { method: "POST", token });
    },
      retryBilling(token) {
      return request("/api/me/billing/retry", { method: "POST", token, timeoutMs: 90000 });
    },
  };
}
