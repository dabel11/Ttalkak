const test = require("node:test");
const assert = require("node:assert/strict");

let readRuntimeConfig;
test.before(async () => ({ readRuntimeConfig } = await import("../src/runtime/runtime-config.mjs")));

test("runtime config centralizes defaults and normalizes the API URL", () => {
  const config = readRuntimeConfig({ TTALKAK_API_BASE_URL: "https://api.example.test/" });
  assert.deepEqual(config, { apiBaseUrl: "https://api.example.test", apiTimeoutMs: 60_000, improveTimeoutMs: 90_000, googleCredential: "", demoFallbackEnabled: false });
});

test("runtime config rejects malformed URLs and timeout values", () => {
  assert.throws(() => readRuntimeConfig({ TTALKAK_API_BASE_URL: "javascript:alert(1)" }), /HTTP or HTTPS/);
  assert.throws(() => readRuntimeConfig({ TTALKAK_API_TIMEOUT_MS: "never" }), /positive number/);
  assert.throws(() => readRuntimeConfig({ TTALKAK_IMPROVE_TIMEOUT_MS: 0 }), /positive number/);
});

test("runtime config exposes credential and demo flags without leaking them into domain modules", () => {
  const config = readRuntimeConfig({ TTALKAK_GOOGLE_CREDENTIAL: "public-client-id", TTALKAK_DEMO_FALLBACK_ENABLED: true });
  assert.equal(config.googleCredential, "public-client-id");
  assert.equal(config.demoFallbackEnabled, true);
});
