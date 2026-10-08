const test = require("node:test");
const assert = require("node:assert/strict");

test("usage snapshots normalize the authoritative backend token fields", async () => {
  const { normalizeUsageSnapshot } = await import("../src/billing/usage-model.mjs");
  assert.deepEqual(normalizeUsageSnapshot({
    plan: "pro",
    used: 25_001,
    limit: 100_000,
    remaining: 74_999,
    limitReached: false,
    quotaEnforced: true,
    usageAvailable: true,
    usageBlocked: false,
  }), {
    plan: "PRO",
    used: 25_001,
    limit: 100_000,
    remaining: 74_999,
    totalTokens: 25_001,
    limitTokens: 100_000,
    remainingTokens: 74_999,
    limitReached: false,
    quotaEnforced: true,
    usageAvailable: true,
    usageBlocked: false,
    usagePercent: 25,
  });
});

test("usage snapshots retain compatibility with earlier token aliases", async () => {
  const { normalizeUsageSnapshot } = await import("../src/billing/usage-model.mjs");
  assert.deepEqual(normalizeUsageSnapshot({ usedTokens: 120, tokenLimit: 100, tokensRemaining: 0 }), {
    usedTokens: 120,
    tokenLimit: 100,
    tokensRemaining: 0,
    plan: "FREE",
    totalTokens: 120,
    limitTokens: 100,
    remainingTokens: 0,
    limitReached: true,
    quotaEnforced: false,
    usageAvailable: true,
    usageBlocked: false,
    usagePercent: 100,
  });
});

test("usage snapshots remain useful while the backend quota is disabled", async () => {
  const { formatTokenCount, normalizeUsageSnapshot } = await import("../src/billing/usage-model.mjs");
  assert.deepEqual(normalizeUsageSnapshot({ plan: "FREE", totalTokens: 1234, limit: null }), {
    plan: "FREE",
    totalTokens: 1234,
    limit: null,
    limitTokens: null,
    remainingTokens: null,
    limitReached: false,
    quotaEnforced: false,
    usageAvailable: true,
    usageBlocked: false,
    usagePercent: null,
  });
  assert.equal(formatTokenCount(1234), "1,234개");
});

test("unavailable usage and server blocking flags remain explicit", async () => {
  const { normalizeUsageSnapshot } = await import("../src/billing/usage-model.mjs");
  const usage = normalizeUsageSnapshot({ used: 100, limit: 1000, usageAvailable: false, usageBlocked: true });
  assert.equal(usage.usageAvailable, false);
  assert.equal(usage.usageBlocked, true);
  assert.equal(usage.remainingTokens, 900);
});
