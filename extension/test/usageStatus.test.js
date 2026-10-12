import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsageSnapshot, requestUsageStatus } from "../src/api/usage.js";
import { getBillingPageUrl } from "../src/config/webAppConfig.js";

test("member usage normalizes the current backend fields and status flags", () => {
  assert.deepEqual(normalizeUsageSnapshot({
    plan: "pro",
    used: 25_000,
    limit: 100_000,
    remaining: 75_000,
    limitReached: false,
    quotaEnforced: true,
    usageAvailable: false,
    usageBlocked: true,
    resetsAt: "2026-11-01T00:00:00Z",
  }), {
    plan: "PRO",
    used: 25_000,
    limit: 100_000,
    remaining: 75_000,
    limitReached: false,
    quotaEnforced: true,
    usageAvailable: false,
    usageBlocked: true,
    resetsAt: "2026-11-01T00:00:00Z",
    requests: 0,
    requestLimit: null,
    requestRemaining: null,
    requestQuotaEnforced: false,
    requestLimitReached: false,
    totalTokens: 25_000,
    usedTokens: 25_000,
    limitTokens: 100_000,
    remainingTokens: 75_000,
  });
});

test("four-tier request quotas keep LIGHT and STANDARD identities", () => {
  for (const plan of ["LIGHT", "STANDARD"]) {
    const usage = normalizeUsageSnapshot({ plan: plan.toLowerCase(), requests: 30, requestLimit: 30,
      requestRemaining: 0, requestQuotaEnforced: true, requestLimitReached: true, limit: null });
    assert.equal(usage.plan, plan);
    assert.equal(usage.requestLimit, 30);
    assert.equal(usage.requestLimitReached, true);
    assert.equal(usage.limitTokens, null);
  }
  const disabled = normalizeUsageSnapshot({ plan: "PRO", requestLimit: null, requestQuotaEnforced: false });
  assert.equal(disabled.requestLimit, null);
});

test("member usage keeps legacy aliases and derives missing remaining tokens", () => {
  const usage = normalizeUsageSnapshot({ plan: "free", usedTokens: 101, tokenLimit: 100 });
  assert.equal(usage.totalTokens, 101);
  assert.equal(usage.limitTokens, 100);
  assert.equal(usage.remainingTokens, 0);
  assert.equal(usage.limitReached, true);
  assert.equal(usage.usageAvailable, true);
});

test("usage requests use the member bearer token", async () => {
  const previousFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ plan: "FREE", used: 50 }) };
  };
  try {
    const usage = await requestUsageStatus({ backendApiUrl: "https://api.example.dev" }, "member-token");
    assert.equal(request.url, "https://api.example.dev/api/me/usage");
    assert.equal(request.options.headers.Authorization, "Bearer member-token");
    assert.equal(usage.totalTokens, 50);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("billing links open the public pricing page without starting payment", () => {
  const url = new URL(getBillingPageUrl("https://web.ttalkak.example"));
  assert.equal(url.pathname, "/pricing");
  assert.equal(url.searchParams.has("openBilling"), false);
  assert.equal(url.hash, "");
});
