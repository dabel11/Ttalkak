import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionBackendApiUrl, assertProductionWebAppUrl } from "../scripts/build-policy.mjs";

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

test("production extension requires a non-reserved HTTPS web app URL", () => {
  assert.doesNotThrow(() =>
    assertProductionWebAppUrl("production", "https://ttalkak.example.kr", false)
  );
  for (const url of ["", "http://ttalkak.example.kr", "https://web.example.invalid", "https://TTALKAK_WEB_PRODUCTION_HOST"]) {
    assert.throws(() => assertProductionWebAppUrl("production", url, false), /VITE_WEB_APP_URL/);
  }
});

test("verification build permits only its dedicated web app placeholder", () => {
  assert.doesNotThrow(() =>
    assertProductionWebAppUrl("production", "https://web.example.invalid", true)
  );
  assert.throws(
    () => assertProductionWebAppUrl("production", "https://web.example.test", true),
    /VITE_WEB_APP_URL/
  );
});
