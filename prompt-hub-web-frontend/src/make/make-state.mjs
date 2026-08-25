"use strict";
  function createMakeRequestState() { return { inFlight: false, failedMessageId: "", failure: null, recoveryMessageId: "", recoveryAction: "" }; }
  function startMakeRequest(value) { value.inFlight = true; value.failedMessageId = ""; value.failure = null; value.recoveryMessageId = ""; value.recoveryAction = ""; }
  function failMakeRequest(value, messageId, failure) { value.inFlight = false; value.failedMessageId = String(messageId || ""); value.failure = failure || null; }
  function completeMakeRequest(value) { value.inFlight = false; value.failedMessageId = ""; value.failure = null; value.recoveryMessageId = ""; value.recoveryAction = ""; }
  function startMakeRecovery(value, messageId, action) { if (value.recoveryMessageId) return false; value.recoveryMessageId = String(messageId || ""); value.recoveryAction = String(action || ""); return Boolean(value.recoveryMessageId); }
  function finishMakeRecovery(value) { value.recoveryMessageId = ""; value.recoveryAction = ""; }
  function setMakeComposerDraft(state, value) { state.composerDraft = String(value || ""); }
  function setMakeEditingMessage(state, messageId = null) { state.editingMessageId = messageId || null; }
  function setMakeBackendState(state, status, message = "") { state.makeBackendStatus = String(status || "idle"); state.makeBackendMessage = String(message || ""); }
  function setMakeBackendFailure(state, message) { setMakeBackendState(state, "fallback", message); }
  function setMakeRecentThreads(state, threads) { state.recentThreads = Array.isArray(threads) ? threads : []; }
export { createMakeRequestState, startMakeRequest, failMakeRequest, completeMakeRequest, startMakeRecovery, finishMakeRecovery, setMakeComposerDraft, setMakeEditingMessage, setMakeBackendState, setMakeBackendFailure, setMakeRecentThreads };
export const makeState = Object.freeze({ createMakeRequestState, startMakeRequest, failMakeRequest, completeMakeRequest, startMakeRecovery, finishMakeRecovery, setMakeComposerDraft, setMakeEditingMessage, setMakeBackendState, setMakeBackendFailure, setMakeRecentThreads });
