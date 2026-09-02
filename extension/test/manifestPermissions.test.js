import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const developmentManifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
const productionManifest = JSON.parse(fs.readFileSync(new URL("../manifest.production.example.json", import.meta.url), "utf8"));
const EXPECTED_PERMISSIONS = ["activeTab", "clipboardWrite", "debugger", "scripting", "sidePanel", "storage", "tabs"];
const SUPPORTED_AI_HOSTS = ["https://chat.openai.com/*", "https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"];

test("development and production manifests use the reviewed permission allowlist", () => {
  for (const manifest of [developmentManifest, productionManifest]) {
    assert.deepEqual([...manifest.permissions].sort(), EXPECTED_PERMISSIONS);
    assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
  }
});

test("production host permissions contain only supported AI sites and the backend placeholder", () => {
  assert.deepEqual([...productionManifest.host_permissions].sort(), [...SUPPORTED_AI_HOSTS, "https://SPRING_BOOT_PRODUCTION_HOST/*"].sort());
  assert.equal(productionManifest.host_permissions.some((host) => /localhost|127\.0\.0\.1/i.test(host)), false);
});

test("development-only host permissions are limited to loopback backend origins", () => {
  assert.deepEqual([...developmentManifest.host_permissions].sort(), [...SUPPORTED_AI_HOSTS, "http://127.0.0.1:8080/*", "http://localhost:8080/*"].sort());
});
