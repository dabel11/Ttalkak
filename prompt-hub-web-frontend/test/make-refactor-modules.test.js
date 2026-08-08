const test = require("node:test");
const assert = require("node:assert/strict");

global.window = { setTimeout: (callback) => callback() };
require("../src/make/make-state.js");
require("../src/make/make-persistence.js");

test("Make request state transitions are centralized", () => {
  const api = global.window.TtalkakMakeState;
  const request = api.createMakeRequestState();
  api.startMakeRequest(request);
  assert.equal(request.inFlight, true);
  api.failMakeRequest(request, "user-1", { message: "failed", retryable: true });
  assert.deepEqual(request, { inFlight: false, failedMessageId: "user-1", failure: { message: "failed", retryable: true } });
  api.completeMakeRequest(request);
  assert.deepEqual(request, { inFlight: false, failedMessageId: "", failure: null });
});

test("Make state mutations use named helpers", () => {
  const state = {};
  const api = global.window.TtalkakMakeState;
  api.setMakeComposerDraft(state, "draft");
  api.setMakeEditingMessage(state, "message-1");
  api.setMakeBackendFailure(state, "offline");
  assert.deepEqual(state, { composerDraft: "draft", editingMessageId: "message-1", makeBackendStatus: "fallback", makeBackendMessage: "offline" });
});
