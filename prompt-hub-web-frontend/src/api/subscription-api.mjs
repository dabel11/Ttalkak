export function createSubscriptionApi({ request }) {
  return {
      getSubscription(token) {
        return request("/api/subscriptions/me", { token });
      },
      createSubscriptionCheckout(token) {
        return request("/api/subscriptions/checkout", { method: "POST", token, body: JSON.stringify({ plan: "PRO" }) });
      },
      createBillingPortal(token) {
        return request("/api/subscriptions/portal", { method: "POST", token, body: JSON.stringify({}) });
      },
  };
}
