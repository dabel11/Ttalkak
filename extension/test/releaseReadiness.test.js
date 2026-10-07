import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateProductionArtifact, validateReleaseConfiguration, verifyCors, verifyPublicPages, verifyWebApp } from "../scripts/check-release-readiness.mjs";

const valid = {
  TTALKAK_PRODUCTION_EXTENSION_ID: "abcdefghijklmnopabcdefghijklmnop",
  VITE_BACKEND_API_URL: "https://api.ttalkak.example.kr",
  VITE_WEB_APP_URL: "https://web.ttalkak.example.kr",
  TTALKAK_SUPPORT_URL: "https://support.ttalkak.example.kr",
  TTALKAK_PRIVACY_POLICY_URL: "https://www.ttalkak.example.kr/privacy",
  TTALKAK_RELEASE_OWNER: "frontend-team",
};

test("release configuration rejects missing placeholders and accepts explicit production values", () => {
  assert.throws(() => validateReleaseConfiguration({}), /PRODUCTION_EXTENSION_ID/);
  assert.throws(() => validateReleaseConfiguration({ ...valid, VITE_BACKEND_API_URL: "http://localhost:8080" }));
  assert.equal(validateReleaseConfiguration(valid).origin, "chrome-extension://abcdefghijklmnopabcdefghijklmnop");
  assert.equal(validateReleaseConfiguration(valid).webAppUrl, valid.VITE_WEB_APP_URL);
});

test("release public-page gate requires reachable privacy and support pages", async () => {
  const config = validateReleaseConfiguration(valid);
  const requested = [];
  await verifyPublicPages(config, async (url) => { requested.push(url); return new Response("ok", { status: 200 }); });
  assert.deepEqual(requested, [config.privacyPolicyUrl, config.supportUrl]);
  await assert.rejects(() => verifyPublicPages(config, async () => new Response("missing", { status: 404 })), /privacy policy/);
});

test("release CORS gate covers anonymous improve and authenticated usage requests", async () => {
  const config = validateReleaseConfiguration(valid);
  const requested = [];
  const allow = async (url, options) => {
    requested.push({ url, method: options.headers["Access-Control-Request-Method"], headers: options.headers["Access-Control-Request-Headers"] });
    return new Response(null, { status: 200, headers: new Headers({
      "access-control-allow-origin": config.origin,
      "access-control-allow-methods": `${options.headers["Access-Control-Request-Method"]}, OPTIONS`,
      "access-control-allow-headers": options.headers["Access-Control-Request-Headers"],
      "access-control-allow-credentials": "true",
    }) });
  };
  await assert.doesNotReject(() => verifyCors(config, allow));
  assert.deepEqual(requested, [
    { url: `${config.backendApiUrl}/api/prompts/improve`, method: "POST", headers: "authorization,content-type,x-session-uuid" },
    { url: `${config.backendApiUrl}/api/me/usage`, method: "GET", headers: "authorization" },
  ]);
  await assert.rejects(() => verifyCors(config, async () => new Response(null, { status: 200, headers: new Headers({
    "access-control-allow-origin": config.origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-credentials": "true",
  }) })), /required method and headers/);
  await assert.rejects(() => verifyCors(config, async () => new Response(null, { status: 200, headers: new Headers() })), /CORS preflight/);
});

test("release web-app gate verifies the public billing destination", async () => {
  const config = validateReleaseConfiguration(valid);
  let requested;
  await verifyWebApp(config, async (url, options) => {
    requested = { url: String(url), options };
    return new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  });
  assert.equal(requested.url, `${config.webAppUrl}/?openBilling=1#/home`);
  assert.deepEqual(requested.options, { method: "GET", redirect: "follow" });
  await assert.rejects(() => verifyWebApp(config, async () => new Response("down", { status: 503, headers: { "content-type": "text/plain" } })), /billing destination/);
});

test("release artifact gate rejects development keys and verifies the production host", () => {
  const config = validateReleaseConfiguration(valid);
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "ttalkak-release-"));
  try {
    fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify({ host_permissions: [`${new URL(config.backendApiUrl).origin}/*`] }));
    assert.doesNotThrow(() => validateProductionArtifact(config, dist));
    fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify({ key: "development", host_permissions: [`${new URL(config.backendApiUrl).origin}/*`] }));
    assert.throws(() => validateProductionArtifact(config, dist), /development public key/);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
