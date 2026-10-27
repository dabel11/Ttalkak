import assert from "node:assert/strict";
import test from "node:test";
import { requestFindId } from "../src/api/auth.js";

test("extension ID recovery uses the email endpoint and strips legacy fields", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    await requestFindId(
      { backendApiUrl: "http://localhost:8080" },
      {
        name: "Member",
        email: "member@example.com",
        method: "email",
        phone: "010-0000-0000",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request.url, "http://localhost:8080/api/auth/id-recovery/request");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    name: "Member",
    email: "member@example.com",
  });
});
