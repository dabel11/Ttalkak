import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policies = fs.readFileSync(new URL("../../docs/FRONTEND_OPERATING_POLICIES.md", import.meta.url), "utf8");
const releaseChecklist = fs.readFileSync(new URL("../../docs/WEB_STORE_RELEASE_CHECKLIST.md", import.meta.url), "utf8");
const readme = fs.readFileSync(new URL("../../README.md", import.meta.url), "utf8");

test("frontend operating policies retain every required decision area", () => {
  for (const heading of [
    "Production configuration register",
    "API change procedure",
    "Shared AI response fixture policy",
    "User-facing copy policy",
    "Data and observability policy",
    "Supported frontend scope",
  ]) {
    assert.match(policies, new RegExp(`^## \\d+\\. ${heading}$`, "m"));
  }
  assert.match(policies, /PowerShell:.*VITE_BACKEND_API_URL/);
  assert.match(policies, /POSIX:.*VITE_BACKEND_API_URL/);
});

test("release documentation remains discoverable and cross-platform", () => {
  assert.match(readme, /docs\/FRONTEND_OPERATING_POLICIES\.md/);
  assert.match(readme, /docs\/WEB_STORE_RELEASE_CHECKLIST\.md/);
  assert.match(releaseChecklist, /^## Permission audit$/m);
  assert.match(releaseChecklist, /^## Production smoke$/m);
  assert.match(releaseChecklist, /PowerShell:.*VITE_BACKEND_API_URL/);
  assert.match(releaseChecklist, /POSIX:.*VITE_BACKEND_API_URL/);
});
