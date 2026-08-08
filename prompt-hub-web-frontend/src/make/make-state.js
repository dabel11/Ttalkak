(function attachMakeState(global) {
  "use strict";
  function createMakeRequestState() { return { inFlight: false, failedMessageId: "", failure: null }; }
  function startMakeRequest(value) { value.inFlight = true; value.failedMessageId = ""; value.failure = null; }
  function failMakeRequest(value, messageId, failure) { value.inFlight = false; value.failedMessageId = String(messageId || ""); value.failure = failure || null; }
  function completeMakeRequest(value) { value.inFlight = false; value.failedMessageId = ""; value.failure = null; }
  function setMakeComposerDraft(state, value) { state.composerDraft = String(value || ""); }
  function setMakeEditingMessage(state, messageId = null) { state.editingMessageId = messageId || null; }
  function setMakeBackendFailure(state, message) { state.makeBackendStatus = "fallback"; state.makeBackendMessage = String(message || ""); }
  function setMakeRecentThreads(state, threads) { state.recentThreads = Array.isArray(threads) ? threads : []; }
  global.TtalkakMakeState = Object.freeze({ createMakeRequestState, startMakeRequest, failMakeRequest, completeMakeRequest, setMakeComposerDraft, setMakeEditingMessage, setMakeBackendFailure, setMakeRecentThreads });
})(window);
