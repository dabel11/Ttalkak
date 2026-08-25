const test = require("node:test");
const assert = require("node:assert/strict");

test("Make request ids are bounded and reused only for the same backend prompt", async () => {
  const { createMakeRequestId, resolveMakeRequestId, MAX_REQUEST_ID_LENGTH } = await import("../../shared/make-request-id.js");
  const cryptoApi = { randomUUID: () => "request-fixed" };
  assert.equal(createMakeRequestId(cryptoApi), "request-fixed");
  assert.equal(resolveMakeRequestId({ previousRequestId: "request-old", previousPrompt: " 같은 요청 ", prompt: "같은 요청" }), "request-old");
  assert.equal(resolveMakeRequestId({ previousRequestId: "request-old", previousPrompt: "같은  요청", prompt: "같은 요청", cryptoApi }), "request-fixed");
  assert.equal(resolveMakeRequestId({ previousRequestId: "request-old", previousPrompt: "기존", prompt: "변경", cryptoApi }), "request-fixed");
  assert.ok(createMakeRequestId().length <= MAX_REQUEST_ID_LENGTH);
});

test("shared response and error models preserve replay metadata and reject request-id conflicts", async () => {
  const model = await import("../../shared/make-message-model.js");
  const result = model.normalizeImproveResponse({
    mode: "improve",
    improvedPrompt: "개선 결과",
    requestId: "request-123",
    replayed: true,
  }, "원문");
  assert.equal(result.requestId, "request-123");
  assert.equal(result.replayed, true);
  assert.deepEqual(model.classifyMakeError({ status: 409, code: "REQUEST_ID_REUSED" }), {
    kind: "conflict",
    code: "REQUEST_ID_REUSED",
    status: 409,
    message: "요청 식별자가 다른 내용에 사용되었습니다. 서버 대화를 새로고침한 뒤 다시 요청해주세요.",
    retryable: false,
    requiresLogin: false,
  });
});
