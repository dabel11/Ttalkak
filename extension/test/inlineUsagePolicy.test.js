import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const [bundle] = await build({
  configFile: false, publicDir: false, logLevel: "silent",
  build: { write: false, lib: {
    entry: fileURLToPath(new URL("../background.js", import.meta.url)),
    formats: ["iife"], name: "TTalkakBackground",
  } },
});
const source = bundle.output[0].code;
async function requestInline({ status = 200, body = { improvedPrompt: "개선안" }, token = "member", message = {} } = {}) {
  const listeners = [];
  let request;
  const context = {
    URL, AbortController, setTimeout, clearTimeout,
    crypto: { randomUUID: () => "request-id" },
    chrome: {
      runtime: { onMessage: { addListener: (listener) => listeners.push(listener) }, getManifest: () => ({ host_permissions: ["https://chatgpt.com/*", "https://api.example/*"] }) },
      sidePanel: { setPanelBehavior() {} },
      storage: { local: { get: async () => ({ pp_inline_improve_enabled: true, pp_auth_session: { accessToken: token, user: { id: 7 } }, pp_session_uuid: "guest-session" }) } },
    },
    fetch: async (url, options) => { request = { url: String(url), options }; return { ok: status === 200, status, json: async () => body }; },
  };
  vm.runInNewContext(source, context);
  const reply = await new Promise((resolve) => listeners[0]({ type: "INLINE_IMPROVE", prompt: "원본", ...message }, {}, resolve));
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
  const requestLimit = await requestInline({ status: 429, body: { code: "MEMBER_REQUEST_LIMIT_EXCEEDED" } });
  const guest = await requestInline({ status: 429, body: { code: "FREE_TRIAL_LIMIT_EXCEEDED" }, token: "" });
  const provider = await requestInline({ status: 429, body: { code: "AI_RATE_LIMIT_EXCEEDED" } });
  assert.match(member.reply.error, /이번 기간의 AI 사용량/);
  assert.doesNotMatch(member.reply.error, /로그인/);
  assert.match(requestLimit.reply.error, /요청 횟수/);
  assert.doesNotMatch(requestLimit.reply.error, /잠시 후/);
  assert.match(guest.reply.error, /체험 횟수/);
  assert.match(provider.reply.error, /잠시 후/);
});

test("inline preserves first-turn evidence and asks without offering the source as a rewrite", async () => {
  const explanation = "관련 프롬프트 기법 근거를 찾지 못했습니다.";
  const missing = await requestInline({ body: { result: {
    improvedPrompt: "원본", ragStatus: "no_evidence", answer: explanation,
  } } });
  assert.equal(missing.reply.improvedPrompt, "");
  assert.equal(missing.reply.explanation, explanation);
  assert.equal(missing.reply.ragStatus, "no_evidence");
  const ask = await requestInline({ body: { data: {
    mode: "ask", improvedPrompt: "원본", followUpQuestions: ["독자는 누구인가요?"],
  } } });
  assert.equal(ask.reply.improvedPrompt, "");
  assert.equal(ask.reply.mode, "ask");
  assert.equal(ask.reply.questions[0], "독자는 누구인가요?");
});

test("inline continuation uses member threads or guest history and rejects an account change", async () => {
  const body = { result: { mode: "ask", questions: ["독자는 누구인가요?"], threadId: 41 } };
  for (const token of ["member", ""]) {
    const { reply } = await requestInline({ body, token });
    const message = { prompt: "비전공자", continuation: reply.continuation, requestId: "retry-id" };
    const next = await requestInline({ token, message });
    const payload = JSON.parse(next.request.options.body);
    assert.equal(payload.prompt, "비전공자");
    if (token) {
      assert.equal(String(payload.threadId), "41");
      assert.equal(payload.requestId, "retry-id");
      assert.equal(payload.history, undefined);
    } else {
      assert.equal(payload.threadId, undefined);
      assert.equal(payload.history[0].content, "원본");
      assert.match(payload.history[1].content, /독자는 누구/);
    }
    const switched = await requestInline({ token: token ? "" : "member", message });
    assert.equal(switched.request, undefined);
    assert.match(switched.reply.error, /대화가 변경/);
  }
});
