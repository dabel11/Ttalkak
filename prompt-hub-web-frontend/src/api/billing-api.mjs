export function createBillingApi({ request }) {
  return {
      getBillingStatus(token) {
      return request("/api/me/billing", { token });
    },
      getUsageStatus(token) {
      return request("/api/me/usage", { token });
    },
      setupBilling(token) {
      return request("/api/me/billing/setup", { method: "POST", token });
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
