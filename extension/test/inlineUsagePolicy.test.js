import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/background.js", import.meta.url), "utf8");
async function requestInline({ status = 200, body = { improvedPrompt: "개선안" }, token = "member" } = {}) {
  const listeners = [];
  let request;
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    crypto: { randomUUID: () => "request-id" },
    chrome: {
      runtime: { onMessage: { addListener: (listener) => listeners.push(listener) }, getManifest: () => ({ host_permissions: ["https://chatgpt.com/*", "https://api.example/*"] }) },
      sidePanel: { setPanelBehavior() {} },
      storage: { local: { get: async () => ({ pp_inline_improve_enabled: true, pp_auth_session: { accessToken: token }, pp_session_uuid: "guest-session" }) } },
    },
    fetch: async (url, options) => { request = { url: String(url), options }; return { ok: status === 200, status, json: async () => body }; },
  };
  vm.runInNewContext(source, context);
  const reply = await new Promise((resolve) => listeners[0]({ type: "INLINE_IMPROVE", prompt: "원본" }, {}, resolve));
  return { reply, request };
}

test("inline member requests share the authenticated improve endpoint and request identity", async () => {
  const { reply, request } = await requestInline();
  assert.equal(reply.improvedPrompt, "개선안");
  assert.equal(request.url, "https://api.example/api/prompts/improve");
  assert.equal(request.options.headers.Authorization, "Bearer member");
  assert.equal(JSON.parse(request.options.body).requestId, "request-id");
});

test("inline guest requests use the same guest session and do not send member identity", async () => {
  const { request } = await requestInline({ token: "" });
  assert.equal(request.options.headers["X-Session-UUID"], "guest-session");
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(JSON.parse(request.options.body).requestId, undefined);
});

test("inline errors distinguish member quota, guest trial and provider throttling", async () => {
  const member = await requestInline({ status: 429, body: { code: "MEMBER_TOKEN_LIMIT_EXCEEDED" } });
  const guest = await requestInline({ status: 429, body: { code: "FREE_TRIAL_LIMIT_EXCEEDED" }, token: "" });
  const provider = await requestInline({ status: 429, body: { code: "AI_RATE_LIMIT_EXCEEDED" } });
  assert.match(member.reply.error, /이번 기간의 AI 사용량/);
  assert.doesNotMatch(member.reply.error, /로그인/);
  assert.match(guest.reply.error, /체험 횟수/);
  assert.match(provider.reply.error, /잠시 후/);
});
