import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionBackendApiUrl } from "../scripts/build-policy.mjs";

test("production extension rejects reserved, local, and loopback backend hosts", () => {
  const blocked = [
    "https://api.example.test",
    "https://api.example.test.",
    "https://api.example.invalid",
    "https://example.com",
    "https://localhost",
    "https://localhost.",
    "https://service.localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "http://backend.ttalkak.com",
  ];
  for (const url of blocked) {
    assert.throws(() => assertProductionBackendApiUrl("production", url, false), /HTTPS URL/);
  }
});

test("production extension accepts a non-reserved HTTPS backend host", () => {
  assert.doesNotThrow(() =>
    assertProductionBackendApiUrl("production", "https://api.ttalkak.com", false)
  );
});

test("verification build permits only its dedicated invalid host exception", () => {
  assert.doesNotThrow(() =>
    assertProductionBackendApiUrl("production", "https://api.example.invalid", true)
  );
  assert.throws(
    () => assertProductionBackendApiUrl("production", "https://api.example.test", true),
    /HTTPS URL/
  );
});
